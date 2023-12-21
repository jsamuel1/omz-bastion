import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { LambdaInsightsVersion, Tracing } from 'aws-cdk-lib/aws-lambda';

export class OmzSsmLambda extends Construct {
  public arn : string;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const lambdaFunction = new NodejsFunction(this, 'function', {
      tracing: Tracing.ACTIVE,
      insightsVersion: LambdaInsightsVersion.VERSION_1_0_229_0,
      environment: {
        'AWS_XRAY_CONTEXT_MISSING': 'LOG_ERROR', // log error if xray context is missing, otherwise the lambda will fail to start. See XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
        'AWS_XRAY_TRACING_NAME': 'omz-ssm-lambda', // the name of the lambda function that will be used in the xray tracing dashboard  
      },
    });

    this.arn = lambdaFunction.functionArn;

    // Enable xray tracing on lambdaFunction
    lambdaFunction.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'));
    lambdaFunction.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLambdaInsightsExecutionRolePolicy'));
    lambdaFunction.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'));
    lambdaFunction.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMFullAccess'));
  }
}