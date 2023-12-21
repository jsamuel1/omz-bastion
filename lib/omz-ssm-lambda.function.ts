// ssm-session-lambda.js

import { Context } from 'aws-lambda';
import { SSMClient, StartSessionCommand } from "@aws-sdk/client-ssm";

export const handler = async (event: any, context: Context) => {
  console.log(`Event: ${JSON.stringify(event, null, 2)}`);
  console.log(`Context: ${JSON.stringify(context, null, 2)}`);

  // extract instanceId from the ec2 launch event  
  const instanceId = event.detail['instance-id'];
  console.log(`Instance Id: ${instanceId}`);
  const config = { region: event.detail.region };
  const client = new SSMClient(config);
  const input = { // StartSessionRequest
    Target: instanceId, // required
    DocumentName: "AWS-StartInteractiveCommand",
    Reason: "Launch Lambda",
    Parameters: { // SessionManagerParameters
      "command": [ // SessionManagerParameterValueList
      'stdbuf -oL nohup sh -c "$(curl -fsSL https://raw.githubusercontent.com/jsamuel1/dot-files/master/bootstrap.sh)"',
      ],
    },
  };
  const command = new StartSessionCommand(input);
  return await client.send(command);
  // return {
  //   statusCode: 200,
  //   body: JSON.stringify({
  //       message: 'hello world',
  //   }),

}
