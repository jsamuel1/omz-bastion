#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { OmzBastionStack, OmzBastionStackProps } from '../lib/omz-bastion-stack';
import { OmzSsmLambdaStack } from '../lib/omz-ssm-lambda-stack';
import { ContextProps } from '../lib/context';
import { AmazonLinuxCpuType } from 'aws-cdk-lib/aws-ec2';

const app = new cdk.App();
var lambda = new OmzSsmLambdaStack(app, 'SsmInitiationLambda', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION
  },
});

const accountId = process.env.CDK_DEFAULT_ACCOUNT;
if (!accountId) {
  throw new Error('CDK_DEFAULT_ACCOUNT is not set');
}
const context: ContextProps = app.node.tryGetContext(accountId);
if (!context) {
  throw new Error(`Context for account ${accountId} not found`);
}

var gitRepoProjectName = app.node.tryGetContext('gitProjectName') ?? 'dot-files';
var gitRepoOrgName = app.node.tryGetContext('gitOrgName') ?? 'jsamuel1';
var gitRepoHostName = app.node.tryGetContext('gitHostName') ?? 'github.com';

context.instances.forEach(instance => {
  const props: OmzBastionStackProps = {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT, region: context.region ?? process.env.CDK_DEFAULT_REGION
    },
    gitRepoProjectName: gitRepoProjectName,
    gitRepoOrgName: gitRepoOrgName,
    gitRepoHostName: gitRepoHostName,
    vpcName: context.vpcName,
    instanceName: context.environment + instance.instanceName,
    instanceType: instance.instanceType,
    ec2KeyName: instance.keyName ?? "id_25519",
    cpuType: instance.cpuType,
    postBootLambdaArn: lambda.arn
  };
  new OmzBastionStack(app, props.instanceName, props);
}
);

