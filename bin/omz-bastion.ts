#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OmzBastionStack } from '../lib/omz-bastion-stack';

const app = new cdk.App();

const today = new Date();
const dateString = `${today.getFullYear()}${("0"+(today.getMonth()+1)).slice(-2)}${("0"+today.getDate()).slice(-2)}`;
const prefix = app.node.tryGetContext('prefix') ?? dateString;
var name = "OmzBastion" + prefix;

new OmzBastionStack(app, name, {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});