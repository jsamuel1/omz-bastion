import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class OmzSsmLambda extends Construct {
  public arn : string;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const lambdaFunction = new NodejsFunction(this, 'function', {
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
      environment: {
        'AWS_XRAY_CONTEXT_MISSING': 'LOG_ERROR', // log error if xray context is missing, otherwise the lambda will fail to start. See XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
        'AWS_XRAY_TRACING_NAME': 'omz-ssm-lambda', // the name of the lambda function that will be used in the xray tracing dashboard  
      },
    });

    this.arn = lambdaFunction.functionArn;

    // This trigger is too early.
    // // trigger the function from EC2 launch events, if the EC2 instance has the tag OMZBASTION-BOOTSTRAP set to true
    // const ssmAssociationRule = new Rule(this, 'ssmAssociationRule', {
    //   eventPattern: {
    //     source: ['aws.ec2'],
    //     detailType: ['EC2 Instance State-change Notification'],
    //     detail: {
    //       "state": [ "running" ],
    //       //'tag:OMZBASTION-BOOTSTRAP': ['true']
    //     }
    //   }
    // });
    // ssmAssociationRule.addTarget(new LambdaFunction(lambdaFunction));

    // Enable xray tracing on lambdaFunction
    lambdaFunction.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'));
    lambdaFunction.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLambdaInsightsExecutionRolePolicy'));
    lambdaFunction.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'));
    lambdaFunction.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMFullAccess'));
  }
}