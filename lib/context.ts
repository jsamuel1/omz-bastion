import { AmazonLinuxCpuType, InstanceType } from "aws-cdk-lib/aws-ec2";

export type BastionInstanceProps = {
    instanceName: string;
    keyName?: string;
    instanceType: InstanceType;
    cpuType: AmazonLinuxCpuType;
    // For future expansion
    // linuxDistribution?: 'AMAZON_LINUX2023';
    // allowedSecurityGroups?: string[];
  };

export type ContextProps = 
{
    prefix?: string;  // this will also be the prefix
    region?: string;
    vpcName: string;
    instances: BastionInstanceProps[];
}


