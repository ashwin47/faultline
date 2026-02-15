import { z } from 'zod';
import {
  LambdaClient,
  ListFunctionsCommand,
  GetFunctionCommand,
} from '@aws-sdk/client-lambda';
import type { ToolDefinition } from '../tool-registry';
import type { ToolContext } from '../tool-context';
import { getAwsCredentials } from './index';

function lambdaClient(accountId: string) {
  const creds = getAwsCredentials(accountId);
  return { client: new LambdaClient({
    region: creds.region,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  }), region: creds.region };
}

export const awsListFunctions: ToolDefinition = {
  name: 'aws_list_functions',
  description: 'List Lambda functions. Uses the region configured in Settings.',
  category: 'aws',
  parameters: z.object({}),
  async execute(_args: any, ctx: ToolContext) {
    const { client, region } = lambdaClient(ctx.accountId!);
    const resp = await client.send(new ListFunctionsCommand({}));
    const functions = (resp.Functions || []).map(f => ({
      FunctionName: f.FunctionName,
      Runtime: f.Runtime,
      MemorySize: f.MemorySize,
      Timeout: f.Timeout,
      LastModified: f.LastModified,
      CodeSize: f.CodeSize,
      Handler: f.Handler,
      State: f.State,
      Description: f.Description,
    }));
    return {
      title: `Lambda Functions (${region})`,
      output: JSON.stringify({ region, count: functions.length, functions }, null, 2),
    };
  },
};

export const awsGetFunction: ToolDefinition = {
  name: 'aws_get_function',
  description: 'Get details of a specific Lambda function, including configuration, code location, and tags. Uses the region configured in Settings.',
  category: 'aws',
  parameters: z.object({
    function_name: z.string().describe('Lambda function name or ARN'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = lambdaClient(ctx.accountId!);
    const resp = await client.send(new GetFunctionCommand({
      FunctionName: args.function_name,
    }));
    const fnConfig = resp.Configuration;
    return {
      title: `Lambda: ${args.function_name}`,
      output: JSON.stringify({
        region,
        configuration: {
          FunctionName: fnConfig?.FunctionName,
          FunctionArn: fnConfig?.FunctionArn,
          Runtime: fnConfig?.Runtime,
          Handler: fnConfig?.Handler,
          MemorySize: fnConfig?.MemorySize,
          Timeout: fnConfig?.Timeout,
          LastModified: fnConfig?.LastModified,
          State: fnConfig?.State,
          StateReason: fnConfig?.StateReason,
          Environment: fnConfig?.Environment?.Variables,
          Layers: fnConfig?.Layers?.map(l => l.Arn),
          VpcConfig: fnConfig?.VpcConfig,
        },
        tags: resp.Tags,
      }, null, 2),
    };
  },
};
