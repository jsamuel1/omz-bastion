import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_iam as iam } from 'aws-cdk-lib';
import { UserData } from 'aws-cdk-lib/aws-ec2';
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
          default: ['config', 'ssh', 'yum', 'commands'],
        },
        configs:
        {
          config: new ec2.InitConfig([
            ec2.InitCommand.shellCommand("while pgrep yum -c ; do sleep 5; done ", { ignoreErrors: true }),
            ec2.InitCommand.shellCommand("yum update -y", { ignoreErrors: true }),
            ec2.InitCommand.shellCommand("yum install -y dnf-plugins-core", { ignoreErrors: true }),
            ec2.InitCommand.shellCommand("yum config-manager --add-repo https://rtx.pub/rpm/rtx.repo"),
            ec2.InitCommand.shellCommand("yum config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo"),
            ec2.InitCommand.shellCommand("yum config-manager --add-repo https://packages.microsoft.com/yumrepos/vscode"),
            ec2.InitCommand.shellCommand("yum install -y git vim tmux zsh gh code", { ignoreErrors: true }),

            // ec2.InitGroup.fromName('docker'),
            //  ec2.InitGroup.fromName('ssm-user', 1001),
            //  ec2.InitUser.fromName('ssm-user',
            //    {
            //      homeDir: '/home/ssm-user',
            //      userId: 1001,
            //      groups: ['ssm-user', 'docker', 'wheel', 'adm'],
            //    }),
            ec2.InitFile.fromString("/etc/sudoers.d/ssm-agent-users", "ssm-user ALL=(ALL) NOPASSWD:ALL",
              { mode: "000440", }),
          ]),
          ssh: new ec2.InitConfig([
            ec2.InitFile.fromFileInline('/etc/skel/.ssh/authorized_keys',
              `${process.env.HOME}/.ssh/id_ed25519.pub`, { mode: "000644" }),
          ]),
          yum: new ec2.InitConfig(initPackagesYum()),

          commands: new ec2.InitConfig([
            ec2.InitCommand.shellCommand(`sed -i "s\\\\SHELL=.*\\\\SHELL=/usr/bin/zsh\\ \\" /etc/defaults/useradd`, { ignoreErrors: true }),
            ec2.InitCommand.shellCommand(`
            git clone ${gitUrl} /usr/src/${gitRepoProjectName} 
            cd /usr/src/${gitRepoProjectName} || exit
            HOME=/etc/skel ./bootstrap.sh 
             `, {
              ignoreErrors: true,
            }),
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

    host.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    const instance = host.node.defaultChild as ec2.Instance;
    const cfnInstance = instance.node.defaultChild as ec2.CfnInstance;
    cfnInstance.keyName = 'id_ed25519';

    new cdk.CfnOutput(this, 'BastionInstanceId', { value: instance.instanceId, exportName: 'BastionInstanceId' });
    new cdk.CfnOutput(this, 'BastionKeyName', { value: instanceName, exportName: 'BastionName' })
    new cdk.CfnOutput(this, 'BootstrapCommand', { value: `
    aws ssm start-session --target ${instance.instanceId} --document-name AWS-StartInteractiveCommand --parameters \ 
    command="cd /usr/src/${gitRepoProjectName} && /usr/src/${gitRepoProjectName}/bootstrap.sh"
    `, exportName: 'BootstrapCommand'})
  }
}

function initPackagesYum(): cdk.aws_ec2.InitElement[] {
  // Generate an array of InitPackage with yum entries for each line in the file dnfrequirements.txt
  const dnfRequirements = require('fs').readFileSync('dnfrequirements.txt', 'utf8').
    split('\n').map((line: string) => line.trim()).flatMap((line: string) => {
      if (line.length == 0) return [];
      if (line.startsWith('#')) return [];
      return [line];
    });

  return dnfRequirements.map((packageName: string) => ec2.InitPackage.yum(packageName));
}
