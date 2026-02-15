import { z } from 'zod';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import type { ToolDefinition } from '../tool-registry';
import type { ToolContext } from '../tool-context';
import { getAwsCredentials } from './index';

export const awsGetCallerIdentity: ToolDefinition = {
  name: 'aws_get_caller_identity',
  description: 'Verify AWS credentials by returning the IAM identity (account, ARN, user ID) associated with the configured access key.',
  category: 'aws',
  parameters: z.object({}),
  async execute(_args: unknown, ctx: ToolContext) {
    const creds = getAwsCredentials(ctx.accountId!);
    const client = new STSClient({
      region: creds.region,
      credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
    });
    const resp = await client.send(new GetCallerIdentityCommand({}));
    return {
      title: 'AWS Caller Identity',
      output: JSON.stringify({
        Account: resp.Account,
        Arn: resp.Arn,
        UserId: resp.UserId,
      }, null, 2),
    };
  },
};
