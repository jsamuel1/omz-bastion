import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface OmzBastionStackProps extends cdk.StackProps {
  gitRepoProjectName: string;
  gitRepoOrgName: string;
  gitRepoHostName: string;
  vpcName: string;
  instanceName: string;
  instanceType: ec2.InstanceType;
  cpuType: ec2.AmazonLinuxCpuType;
  ec2KeyName: string;
}
export class OmzBastionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: OmzBastionStackProps) {
    super(scope, id, props);

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
          yum: new ec2.InitConfig(this.initPackagesYum()),

          commands: new ec2.InitConfig([
            ec2.InitCommand.shellCommand(`sed -i "s\\\\SHELL=.*\\\\SHELL=/usr/bin/zsh\\ \\" /etc/defaults/useradd`, { ignoreErrors: true }),
            ec2.InitCommand.shellCommand(`
            git clone "https://${props.gitRepoHostName}/${props.gitRepoOrgName}/${props.gitRepoProjectName}" "/usr/src/${props.gitRepoProjectName}"
            cd "/usr/src/${props.gitRepoProjectName}" || exit
            HOME=/etc/skel ./bootstrap.sh 
             `, {
              ignoreErrors: true,
            }),
          ]),
        },
      });


    const host = new ec2.BastionHostLinux(this, 'BastionHost', {
      vpc: ec2.Vpc.fromLookup(this, 'VPC', { vpcName: props.vpcName }),
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(60)
        }
      ],
      machineImage: ec2.MachineImage.latestAmazonLinux2023({ cpuType: props.cpuType }),
      instanceType: props.instanceType,
      instanceName: props.instanceName,
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
    cfnInstance.keyName = props.ec2KeyName;

    new cdk.CfnOutput(this, 'BastionInstanceId', { value: instance.instanceId });
    new cdk.CfnOutput(this, 'BastionKeyName', { value: props.instanceName })
    new cdk.CfnOutput(this, 'BootstrapCommand', {
      value: `
    aws ssm start-session --target ${instance.instanceId} --document-name AWS-StartInteractiveCommand --parameters \\ 
    command="cd /usr/src/${props.gitRepoProjectName} && /usr/src/${props.gitRepoProjectName}/bootstrap.sh"
    `})
  };

  initPackagesYum(): cdk.aws_ec2.InitElement[] {
    // Generate an array of InitPackage with yum entries for each line in the file dnfrequirements.txt
    const dnfRequirements = require('fs').readFileSync('dnfrequirements.txt', 'utf8').
      split('\n').map((line: string) => line.trim()).flatMap((line: string) => {
        if (line.length == 0) return [];
        if (line.startsWith('#')) return [];
        return [line];
      });

    return dnfRequirements.map((packageName: string) => ec2.InitPackage.yum(packageName));
  }
}