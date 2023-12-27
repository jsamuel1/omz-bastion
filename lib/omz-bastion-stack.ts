import {
  CfnOutput, Duration, RemovalPolicy, Stack, StackProps, Tags,
  aws_ec2 as ec2,
  aws_iam as iam
} from 'aws-cdk-lib';
import { AmazonLinuxCpuType, MultipartUserData, UserData } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { readFileSync } from 'fs';

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
}
export class OmzBastionStack extends Stack {

  private props: OmzBastionStackProps;

  getCpuType(): string {
    return this.props.cpuType;
  }

  getCpuTypeDpkg(): string {
    // convert from AmazonLinuxCpuType to Debian style CpuType
    switch (this.props.cpuType) {
      case AmazonLinuxCpuType.ARM_64:
        return "arm64";
      case AmazonLinuxCpuType.X86_64:
        return "amd64";
    }

    return "amd64"; // this should be unreachable
  }

  getCpuTypeAwscli(): string {
    // convert from AmazonLinuxCpuType to AWS CLI style CpuType
    switch (this.props.cpuType) {
      case AmazonLinuxCpuType.ARM_64:
        return "aarch64";
      case AmazonLinuxCpuType.X86_64:
        return "x86_64";
    }
  }

  isUbuntu(): boolean {
    return this.props.linuxDistribution === 'UBUNTU';
  }

  isAL2023(): boolean {
    return !this.isUbuntu();
  }

  constructor(scope: Construct, id: string, props: OmzBastionStackProps) {
    super(scope, id, props);
    this.props = props;

    const host = new ec2.Instance(this, 'BastionHost', {
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
      keyPair: ec2.KeyPair.fromKeyPairName(this, 'bastionKeyPair', props.ec2KeyName)
    });

    host.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
    host.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'));
    host.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2FullAccess'));
    host.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCloudFormationFullAccess'));
    host.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMFullAccess'));
    host.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));
    host.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryFullAccess'));
    host.role.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: [
        'ssmmessages:*',
        'ssm:UpdateInstanceInformation',
        'ec2messages:*',
      ],
      resources: ['*'],
    }));

    Tags.of(this).add('OMZBASTION', props.instanceName, { applyToLaunchedInstances: true });
    Tags.of(host).add('OMZBASTION-BOOTSTRAP', "true", { applyToLaunchedInstances: true });

    const instanceId = host.instanceId;
    const cfnInstance = host.node.defaultChild as ec2.CfnInstance;
    cfnInstance.keyName = props.ec2KeyName;

    new CfnOutput(this, 'BastionInstanceId', { value: instanceId });
    new CfnOutput(this, 'BastionName', { value: props.instanceName })
  };

  private createUserData(props: OmzBastionStackProps) {
    var userData = new MultipartUserData();
    if (this.isUbuntu())
      userData.addUserDataPart(this.cloudInitData('assets/ubuntu-cloudinit.yml'), ec2.MultipartBody.SHELL_SCRIPT, false);
    else
      userData.addUserDataPart(this.cloudInitData('assets/al2023-cloudinit.yml'), ec2.MultipartBody.SHELL_SCRIPT, false);

    userData.addUserDataPart(this.cloudInitDynamicData(props), ec2.MultipartBody.SHELL_SCRIPT, false);
    userData.addUserDataPart(this.cloudShellData(props), ec2.MultipartBody.SHELL_SCRIPT, true);
    return userData;
  }

  private cloudShellData(props: OmzBastionStackProps): UserData {

    var cloudShellData = UserData.forLinux({ shebang: '#!/usr/bin/bash' });
    return cloudShellData;
  }


  private cloudInitData(filename: string): UserData {

    // read a file from lib/ubuntu-cloudinit.yml into a string
    // and use it as the cloud-init user-data
    const yamlString = readFileSync(filename, 'utf8');
    const cloudInitData = UserData.custom(yamlString);
    return cloudInitData;
  }

  private cloudInitDynamicData(props: OmzBastionStackProps) {

    // Construct a cloud-init userData
    const cloudInitDynamicData = UserData.forLinux({ shebang: '#cloud-config' });

    cloudInitDynamicData.addCommands(
      'write_files:',
      '- path: /bin/growfs.sh',
      "  permissions: '0755'",
      '  owner: root',
      '  encoding: b64',
      '  content: ' + readFileSync('assets/growfs.sh', 'base64'),
      '',
    );

    if (this.isUbuntu()) {
      cloudInitDynamicData.addCommands(`
runcmd:
- [ curl, "https://awscli.amazonaws.com/awscli-exe-linux-${this.getCpuTypeAwscli()}.zip", -o, "/run/awscliv2.zip" ]
- [ unzip, -qo, /run/awscliv2.zip, -d, /run/awscli ]
- /run/awscli/aws/install -u 1>/var/log/awscli-install.log 2>&1
- [ rm, /run/awscliv2.zip ]
- [ rm, -rf, /run/awscli ]
- [ mkdir, -p, /opt/aws/bin ]
- [  
  pip3,
  install, 
  "https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz"
]
- [ ln, -sf, /usr/local/init/ubuntu/cfn-hup, /etc/init.d/cfn-hup ]
- [ ln, -sf, '/usr/local/bin/cfn-*', /opt/aws/bin/ ]
- /bin/growfs.sh 
`      );
    }
    else if (this.isAL2023()) {
      cloudInitDynamicData.addCommands(`
runcmd:
- /bin/growfs.sh
`,
      );
    }

    cloudInitDynamicData.addCommands(
      '- stdbuf -oL nohup bash -c \\\\"$(curl -fsSL https://raw.githubusercontent.com/jsamuel1/dot-files/main/bootstrap.sh)\\\\" || echo "failed"',
      '- stdbuf -oL nohup sudo -u ssm-user -Hin bash -c \'bash -c "$(curl -fsSL https://raw.githubusercontent.com/jsamuel1/dot-files/main/bootstrap.sh)" || echo "failed"\'',
      '',);

    cloudInitDynamicData.addCommands(
      'ssh_authorized_keys:',
      `- ${readFileSync(`${process.env.HOME}/.ssh/${props.ec2KeyName}.pub`)}`,
      '',
    );

    cloudInitDynamicData.addCommands(
      'users:',
      '- name: ssm-user',
      '  groups: root, adm, dip, lxd, sudo, docker, users',
      '  sudo: ALL=(ALL) NOPASSWD:ALL',
      '  shell: /usr/bin/zsh',
      '  ssh_authorized_keys:',
      `  - ${readFileSync(`${process.env.HOME}/.ssh/${props.ec2KeyName}.pub`)}`
    );

    if (this.isAL2023()) {
      cloudInitDynamicData.addCommands('packages:',);
      cloudInitDynamicData.addCommands(... this.initPackages('assets/dnfrequirements.txt', '- '));
    }
    else if (this.isUbuntu()) {
      cloudInitDynamicData.addCommands('packages:',);
      cloudInitDynamicData.addCommands(... this.initPackages('assets/aptrequirements.txt', '- '));
    }
    return cloudInitDynamicData;
  }

  private machineImageFromProps(props: OmzBastionStackProps): ec2.IMachineImage {

    // If linuxDistribution is 'UBUNTU', then lookup the latest Ubuntu image
    // for the cpuType props.cpuType
    if (this.isUbuntu()) {
      var distroRelease = 'jammy';
      const ubuntuImage = ec2.MachineImage.fromSsmParameter(
        `/aws/service/canonical/ubuntu/server/${distroRelease}/stable/current/${this.getCpuTypeDpkg()}/hvm/ebs-gp2/ami-id`,
        {
          userData: this.createUserData(props)
        });
      return ubuntuImage;
    }

    //if (isAL2023()) 
    return ec2.MachineImage.latestAmazonLinux2023({ cpuType: props.cpuType, userData: this.createUserData(props) });
  }

  initPackages(filename: string, prefix: string): string[] {
    // Generate an array of InitPackage with yum entries for each line in the file dnfrequirements.txt
    const dnfRequirements = require('fs').readFileSync(filename, 'utf8').
      split('\n').map((line: string) => line.trim()).flatMap((line: string) => {
        if (line.length == 0) return [];
        if (line.startsWith('#')) return [];
        return [line];
      });

    return dnfRequirements.map((packageName: string) => prefix + packageName);
  }
}