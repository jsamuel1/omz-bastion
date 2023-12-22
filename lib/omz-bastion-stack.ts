import {
  CfnOutput, Duration, Stack, StackProps, Tags,
  aws_ec2 as ec2,
  aws_iam as iam
} from 'aws-cdk-lib';
import { AmazonLinuxCpuType, UserData } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface OmzBastionStackProps extends StackProps {
  gitRepoProjectName: string;
  gitRepoOrgName: string;
  gitRepoHostName: string;
  vpcName: string;
  linuxDistribution: string;
  instanceName: string;
  instanceType: ec2.InstanceType;
  cpuType: ec2.AmazonLinuxCpuType;
  ec2KeyName: string;
  postBootLambdaArn?: string;
}
export class OmzBastionStack extends Stack {
  constructor(scope: Construct, id: string, props: OmzBastionStackProps) {
    super(scope, id, props);

    const cloudInit = ec2.CloudFormationInit.fromConfigSets(
      {
        configSets:
        {
          default: ['yumConfig', 'ssh', 'yum', 'commands'],
          ubuntu: ['aptConfig', 'ssh', 'commands', 'aptpost'],
        },
        configs:
        {
          aptConfig: new ec2.InitConfig([
            ec2.InitCommand.shellCommand("while pgrep apt -c ; do sleep 5; done ", { ignoreErrors: true }),
            ec2.InitCommand.shellCommand("apt update && sudo apt install curl apt-transport-https software-properties-common gpg wget -y"),
            ec2.InitCommand.shellCommand("install -dm 755 /etc/apt/keyrings"),

            // rtx repo            
            ec2.InitCommand.shellCommand("wget -qO - https://rtx.jdx.dev/gpg-key.pub | gpg --dearmor | sudo tee /etc/apt/keyrings/rtx-archive-keyring.gpg 1> /dev/null"),
            ec2.InitCommand.shellCommand(`echo "deb [signed-by=/etc/apt/keyrings/rtx-archive-keyring.gpg arch=$(dpkg --print-architecture)] https://rtx.jdx.dev/deb stable main" | sudo tee /etc/apt/sources.list.d/rtx.list`),

            // github cli repo
            ec2.InitCommand.shellCommand('curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/etc/apt/keyrings/githubcli-archive-keyring.gpg'),
            ec2.InitCommand.shellCommand('chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg'),
            ec2.InitCommand.shellCommand('echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null'),

            // microsoft vscode repo
            ec2.InitCommand.shellCommand('wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor | sudo tee /etc/apt/keyrings/packages.microsoft.gpg 1> /dev/null'),
            ec2.InitCommand.shellCommand('echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" > /etc/apt/sources.list.d/vscode.list'),

            // install the packages
            ec2.InitCommand.shellCommand("sudo apt update"),
            ec2.InitCommand.shellCommand("apt-get install -y git vim tmux zsh", { ignoreErrors: true }),
            ec2.InitCommand.shellCommand("apt-get install -y rtx gh code", { ignoreErrors: true }),
          ]),
          yumConfig: new ec2.InitConfig([
            ec2.InitCommand.shellCommand("while pgrep yum -c ; do sleep 5; done ", { ignoreErrors: true }),
            ec2.InitCommand.shellCommand("yum update -y", { ignoreErrors: true }),
            ec2.InitCommand.shellCommand("yum install -y dnf-plugins-core", { ignoreErrors: true }),
            ec2.InitCommand.shellCommand("yum config-manager --add-repo https://rtx.pub/rpm/rtx.repo"),
            ec2.InitCommand.shellCommand("yum config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo"),
            ec2.InitCommand.shellCommand("yum config-manager --add-repo https://packages.microsoft.com/yumrepos/vscode"),
            ec2.InitCommand.shellCommand("yum install -y git vim tmux zsh gh code", { ignoreErrors: true }),
          ]),
          ssh: new ec2.InitConfig([
            ec2.InitFile.fromString("/etc/sudoers.d/ssm-agent-users", "ssm-user ALL=(ALL) NOPASSWD:ALL",
              { mode: "000440", }),
            ec2.InitFile.fromFileInline('/etc/skel/.ssh/authorized_keys',
              `${process.env.HOME}/.ssh/id_ed25519.pub`, { mode: "000644" }),
          ]),
          yum: new ec2.InitConfig(this.initPackagesYum()),

          commands: new ec2.InitConfig([
            ec2.InitCommand.shellCommand(`sed -i "s\\\\SHELL=.*\\\\SHELL=/usr/bin/zsh\\\\" /etc/defaults/useradd`, { ignoreErrors: true }),
            ec2.InitCommand.shellCommand(`GLOBAL=1 stdbuf -oL nohup bash -c "$(curl -fsSL https://raw.githubusercontent.com/jsamuel1/dot-files/master/bootstrap.sh)"`, { ignoreErrors: true }),
          ]),

          aptPost: new ec2.InitConfig([
            ec2.InitCommand.shellCommand("systemctl start unattended-upgrades", { ignoreErrors: true }),
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
      machineImage: this.machineImageFromProps(props),
      instanceType: props.instanceType,
      instanceName: props.instanceName,
      requireImdsv2: true,
      init: cloudInit,
      initOptions: {
        configSets: props.linuxDistribution == "UBUNTU" ?
          ['ubuntu'] : ['default'],
        timeout: Duration.minutes(30),
        ignoreFailures: true
      },
    });

    host.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
    Tags.of(this).add('OMZBASTION', props.instanceName);
    Tags.of(host).add('OMZBASTION-BOOTSTRAP', "true", { applyToLaunchedInstances: true });

    const instance = host.node.defaultChild as ec2.Instance;
    const instanceId = instance.instanceId;
    const cfnInstance = instance.node.defaultChild as ec2.CfnInstance;
    cfnInstance.keyName = props.ec2KeyName;

    if (props.postBootLambdaArn) {
      host.role.addToPrincipalPolicy(new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction', 'lambda:InvokeAsync'],
        effect: iam.Effect.ALLOW,
        resources: [props.postBootLambdaArn]
      }));
      instance.addUserData(
        `EC2_INSTANCE_ID=\$(cat /var/lib/cloud/data/instance-id)
cat > invoke_args.json <<EOF
{
  "detail": {
    "instance-id": "\${EC2_INSTANCE_ID}"
  }
}
EOF

aws lambda invoke-async --function-name ${props.postBootLambdaArn} --invoke-args invoke_args.json
rm invoke_args.json
`
      );
    }

    new CfnOutput(this, 'BastionInstanceId', { value: instanceId });
    new CfnOutput(this, 'BastionName', { value: props.instanceName })
  };

  private userDataUbuntu() {
    var userData = UserData.forLinux({ shebang: '#!/bin/bash' });
    userData.addCommands(
      'systemctl stop unattended-upgrades',
      'while pgrep apt -c ; do sleep 5; done',
      'apt-get update -y',
      'apt-get -y install python3-pip',
      'mkdir -p /opt/aws/bin',
      'pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz',
      'ln -s /usr/local/init/ubuntu/cfn-hup /etc/init.d/cfn-hup',
      'ln -s /usr/local/bin/cfn-init /opt/aws/bin/',
      'ln -s /usr/local/bin/cfn-signal /opt/aws/bin/',
      //`/usr/local/bin/cfn-init -v --stack ${this.stackName} --resource ${cfnInstance.logicalId} --region ${this.region} --configsets ubuntu`,
      //`/usr/local/bin/cfn-signal -e $? --stack ${this.stackName} --resource ${cfnInstance.logicalId} --region ${this.region}`
    );
    return userData;
  }

  private machineImageFromProps(props: OmzBastionStackProps): ec2.IMachineImage | undefined {

    // If linuxDistribution is 'UBUNTU', then lookup the latest Ubuntu image
    // for the cpuType props.cpuType
    if (props.linuxDistribution == 'UBUNTU') {
      var distroRelease = 'jammy';
      const ubuntuImage = ec2.MachineImage.fromSsmParameter(
        `/aws/service/canonical/ubuntu/server/${distroRelease}/stable/current/${ubuntuCpuType(props)}/hvm/ebs-gp2/ami-id`,
        {
          userData: this.userDataUbuntu()
        });
      return ubuntuImage;
    }

    //if (props.linuxDistribution == 'AMAZON_LINUX2023') 
    return ec2.MachineImage.latestAmazonLinux2023({ cpuType: props.cpuType });
  }

  initPackagesYum(): ec2.InitElement[] {
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

function ubuntuCpuType(props: OmzBastionStackProps) {
  return props.cpuType == AmazonLinuxCpuType.X86_64 ? "amd64" : "arm64";
}
