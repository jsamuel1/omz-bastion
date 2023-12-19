#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { OmzBastionStack, OmzBastionStackProps } from '../lib/omz-bastion-stack';

const app = new cdk.App();

const today = new Date();
const dateString = `${today.getFullYear()}${("0" + (today.getMonth() + 1)).slice(-2)}${("0" + today.getDate()).slice(-2)}`;
var instanceName = app.node.tryGetContext('instanceName') ?? "BastionHost" + dateString;
var instanceType = new ec2.InstanceType(app.node.tryGetContext('instanceType') ?? 'm7i-flex.xlarge');

// use this when CDK is fixed to not throw errors w/ m7i-flex
function getCpuType(architecture: string): ec2.AmazonLinuxCpuType {
  switch (architecture) {
    case "x86_64":
      return ec2.AmazonLinuxCpuType.X86_64;
    case "arm64":
      return ec2.AmazonLinuxCpuType.ARM_64;
    default:
      throw new Error(`Unsupported architecture: ${architecture}`);
  }
}


const props: OmzBastionStackProps = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION
  },
  gitRepoProjectName: app.node.tryGetContext('gitProjectName') ?? 'dot-files',
  gitRepoOrgName: app.node.tryGetContext('gitOrgName') ?? 'jsamuel1',
  gitRepoHostName: app.node.tryGetContext('gitHostName') ?? 'github.com',
  vpcName: app.node.tryGetContext('vpcName') ?? 'eksctl-circleci-cluster/VPC',
  instanceName: instanceName,
  instanceType: instanceType,
  ec2KeyName: 'id_ed25519',
  cpuType: getCpuType(app.node.tryGetContext('cpuArch') ?? "x86_64"),
};
new OmzBastionStack(app, instanceName, props);