#!/usr/bin/env node
import 'source-map-support/register';
import { OmzBastionStack, OmzBastionStackProps } from '../lib/omz-bastion-stack';
import { ContextProps } from '../lib/context';
import { App } from 'aws-cdk-lib';

const app = new App();

const environment: string = app.node.tryGetContext('environment');
if (!environment) {
  throw new Error('Context variable environment not found');
};

const context: ContextProps = app.node.tryGetContext(environment);
if (!context) {
  throw new Error(`Context for account ${environment} not found`);
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
    instanceName: context.prefix + instance.instanceName,
    instanceType: instance.instanceType,
    linuxDistribution: instance.linuxDistribution ?? 'AMAZON_LINUX2023',
    ec2KeyName: instance.keyName ?? "id_25519",
    cpuType: instance.cpuType,
  };
  new OmzBastionStack(app, props.instanceName, props);
}
);

