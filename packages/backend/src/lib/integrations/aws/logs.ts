import { z } from 'zod';
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  FilterLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import type { ToolDefinition } from '../tool-registry';
import type { ToolContext } from '../tool-context';
import { getAwsCredentials } from './index';

function logsClient(accountId: string) {
  const creds = getAwsCredentials(accountId);
  return { client: new CloudWatchLogsClient({
    region: creds.region,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  }), region: creds.region };
}

export const awsDescribeLogGroups: ToolDefinition = {
  name: 'aws_describe_log_groups',
  description: 'List CloudWatch Logs log groups. Optionally filter by name prefix.',
  category: 'aws',
  parameters: z.object({
    prefix: z.string().optional().describe('Log group name prefix filter (e.g. /aws/lambda/)'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = logsClient(ctx.accountId!);
    const params: any = {};
    if (args.prefix) params.logGroupNamePrefix = args.prefix;
    const resp = await client.send(new DescribeLogGroupsCommand(params));
    const groups = (resp.logGroups || []).map(g => ({
      logGroupName: g.logGroupName,
      storedBytes: g.storedBytes,
      retentionInDays: g.retentionInDays,
      creationTime: g.creationTime ? new Date(g.creationTime).toISOString() : undefined,
    }));
    return {
      title: `Log Groups (${region})`,
      output: JSON.stringify({ region, count: groups.length, logGroups: groups }, null, 2),
    };
  },
};

export const awsFilterLogEvents: ToolDefinition = {
  name: 'aws_filter_log_events',
  description: 'Search CloudWatch Logs for events matching a filter pattern. Supports CloudWatch Logs filter and pattern syntax.',
  category: 'aws',
  parameters: z.object({
    log_group_name: z.string().describe('Log group name (e.g. /aws/lambda/my-function)'),
    filter_pattern: z.string().optional().describe('CloudWatch Logs filter pattern (e.g. "ERROR" or "{ $.statusCode = 500 }")'),
    start_time: z.string().optional().describe('Start time in ISO 8601 format'),
    end_time: z.string().optional().describe('End time in ISO 8601 format'),
    limit: z.number().optional().describe('Maximum number of events to return (default 100)'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = logsClient(ctx.accountId!);
    const params: any = {
      logGroupName: args.log_group_name,
      limit: args.limit || 100,
    };
    if (args.filter_pattern) params.filterPattern = args.filter_pattern;
    if (args.start_time) params.startTime = new Date(args.start_time).getTime();
    if (args.end_time) params.endTime = new Date(args.end_time).getTime();
    const resp = await client.send(new FilterLogEventsCommand(params));
    const events = (resp.events || []).map(e => ({
      timestamp: e.timestamp ? new Date(e.timestamp).toISOString() : undefined,
      message: e.message,
      logStreamName: e.logStreamName,
    }));
    return {
      title: `Log Events (${args.log_group_name})`,
      output: JSON.stringify({
        region,
        logGroupName: args.log_group_name,
        filterPattern: args.filter_pattern || '(none)',
        count: events.length,
        events,
      }, null, 2),
    };
  },
};
