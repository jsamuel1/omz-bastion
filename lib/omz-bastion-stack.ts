import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { config } from 'process';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class OmzBastionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const gitRepoProjectName = this.node.tryGetContext('gitUrl') ?? 'dot-files';
    const gitRepoOrgName = this.node.tryGetContext('gitUrl') ?? 'jsamuel1';
    const gitRepoHostName = this.node.tryGetContext('gitUrl') ?? 'github.com';
    const gitUrl = `https://${gitRepoHostName}/${gitRepoOrgName}/${gitRepoProjectName}`;
    const vpc = ec2.Vpc.fromLookup(this, 'VPC', { vpcName: 'eksctl-circleci-cluster/VPC' });
    const instanceName = this.node.tryGetContext('instanceName') ?? `BastionHost-${new Date().toISOString().slice(0, 10)}`;
    const instanceType = this.node.tryGetContext('instanceType') ?? 'm7i-flex.xlarge';
    const cpuArch = this.node.tryGetContext('cpuArch') ?? 'X86_64';
    var cpuType = ec2.AmazonLinuxCpuType.X86_64;
    if (cpuArch == 'ARM64') {
      cpuType = ec2.AmazonLinuxCpuType.ARM_64;
    }

    const cloudInit = ec2.CloudFormationInit.fromConfigSets(
      {
        configSets:
        {
          default: ['yum', 'config', 'commands'],
        },
        configs:
        {
          yum: new ec2.InitConfig([
            ec2.InitPackage.yum('git'),
          ]),
          config: new ec2.InitConfig([
            ec2.InitGroup.fromName('docker'),
            ec2.InitGroup.fromName('ssm-user', 1001),
            ec2.InitUser.fromName('ssm-user',
              {
                homeDir: '/home/ssm-user',
                userId: 1001,
                groups: ['ssm-user', 'docker', 'wheel', 'adm'],
              }),
          ]),
           commands: new ec2.InitConfig([
          //   ec2.InitCommand.shellCommand(
          //     `mkdir -p /home/ssm-user/src  \
          //   && git clone ${gitUrl} /home/ssm-user/src/ \
          //   && cd /home/ssm-user/src/${gitRepoProjectName} \
          //   && ./bootstrap.sh \
          //   `, { 
          //     ignoreErrors: true,
          //   }),
            ec2.InitFile.fromFileInline('/home/ssm-user/.ssh/authorized_keys',
               `${process.env.HOME}/.ssh/id_ecdsa.pub`,
               { owner: "ssm-user", group: "ssm-user" }),
          ]),
        },
      });


    const host = new ec2.BastionHostLinux(this, 'BastionHost', {
      vpc,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(60)
        }
      ],
      machineImage: ec2.MachineImage.latestAmazonLinux2023({ cpuType: cpuType }),
      instanceType: new ec2.InstanceType(instanceType),
      instanceName: instanceName,
      requireImdsv2: true,
      init: cloudInit,
      initOptions: {
        configSets: ['default'],
        timeout: cdk.Duration.minutes(30),
        ignoreFailures: true
      },
    });

    const instance = host.node.defaultChild as ec2.Instance;
    const cfnInstance = instance.node.defaultChild as ec2.CfnInstance;
    cfnInstance.keyName = 'id_ed25519';

    new cdk.CfnOutput(this, 'BastionInstanceId', { value: instance.instanceId, exportName: 'BastionInstanceId'  });
    new cdk.CfnOutput(this, 'BastionKeyName', { value: instanceName, exportName: 'BastionName'})
  }
}

