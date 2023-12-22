import { AmazonLinuxCpuType, InstanceType } from "aws-cdk-lib/aws-ec2";

export type BastionInstanceProps = {
    instanceName: string;
    keyName?: string;
    instanceType: InstanceType;
    cpuType: AmazonLinuxCpuType;
    linuxDistribution?: string;
    // allowedSecurityGroups?: string[];
  };

export type ContextProps = 
{
    prefix?: string;  // this will also be the prefix
    region?: string;
    vpcName: string;
    instances: BastionInstanceProps[];
}


