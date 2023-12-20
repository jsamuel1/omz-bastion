import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { OmzSsmLambda } from './omz-ssm-lambda';

export class OmzSsmLambdaStack extends cdk.Stack {

  public arn : string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    var lambda = new OmzSsmLambda(this, 'omz-ssm-lambda');
    this.arn = lambda.arn;
  }
}