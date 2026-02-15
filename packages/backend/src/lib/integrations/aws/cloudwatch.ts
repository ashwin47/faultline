import { z } from 'zod';
import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  GetMetricStatisticsCommand,
  ListMetricsCommand,
  type Dimension,
} from '@aws-sdk/client-cloudwatch';
import type { ToolDefinition } from '../tool-registry';
import type { ToolContext } from '../tool-context';
import { getAwsCredentials } from './index';

function cwClient(accountId: string) {
  const creds = getAwsCredentials(accountId);
  return { client: new CloudWatchClient({
    region: creds.region,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  }), region: creds.region };
}

export const awsDescribeAlarms: ToolDefinition = {
  name: 'aws_describe_alarms',
  description: 'List CloudWatch alarms. Optionally filter by state (ALARM, OK, INSUFFICIENT_DATA). Uses the region configured in Settings.',
  category: 'aws',
  parameters: z.object({
    state_value: z.enum(['ALARM', 'OK', 'INSUFFICIENT_DATA']).optional().describe('Filter by alarm state'),
    alarm_names: z.array(z.string()).optional().describe('Specific alarm names to describe'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = cwClient(ctx.accountId!);
    const params: any = {};
    if (args.state_value) params.StateValue = args.state_value;
    if (args.alarm_names?.length) params.AlarmNames = args.alarm_names;
    const resp = await client.send(new DescribeAlarmsCommand(params));
    const alarms = (resp.MetricAlarms || []).map(a => ({
      AlarmName: a.AlarmName,
      StateValue: a.StateValue,
      StateReason: a.StateReason,
      MetricName: a.MetricName,
      Namespace: a.Namespace,
      Dimensions: a.Dimensions,
      Threshold: a.Threshold,
      ComparisonOperator: a.ComparisonOperator,
      EvaluationPeriods: a.EvaluationPeriods,
      StateUpdatedTimestamp: a.StateUpdatedTimestamp?.toISOString(),
    }));
    return {
      title: `CloudWatch Alarms (${region})`,
      output: JSON.stringify({ region, count: alarms.length, alarms }, null, 2),
    };
  },
};

export const awsGetMetricStatistics: ToolDefinition = {
  name: 'aws_get_metric_statistics',
  description: 'Get CloudWatch metric statistics for a specific metric. Provide namespace (e.g. AWS/EC2), metric name (e.g. CPUUtilization), dimensions, time range, period, and statistics (Average, Sum, Maximum, Minimum, SampleCount).',
  category: 'aws',
  parameters: z.object({
    namespace: z.string().describe('CloudWatch namespace (e.g. AWS/EC2, AWS/RDS, AWS/Lambda)'),
    metric_name: z.string().describe('Metric name (e.g. CPUUtilization)'),
    dimensions: z.array(z.object({
      name: z.string().describe('Dimension name (e.g. InstanceId)'),
      value: z.string().describe('Dimension value'),
    })).describe('Metric dimensions'),
    start_time: z.string().describe('Start time in ISO 8601 format'),
    end_time: z.string().describe('End time in ISO 8601 format'),
    period: z.number().describe('Period in seconds (e.g. 300 for 5 minutes)'),
    statistics: z.array(z.enum(['Average', 'Sum', 'Maximum', 'Minimum', 'SampleCount'])).describe('Statistics to retrieve'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = cwClient(ctx.accountId!);
    const dimensions: Dimension[] = args.dimensions.map((d: any) => ({
      Name: d.name,
      Value: d.value,
    }));
    const resp = await client.send(new GetMetricStatisticsCommand({
      Namespace: args.namespace,
      MetricName: args.metric_name,
      Dimensions: dimensions,
      StartTime: new Date(args.start_time),
      EndTime: new Date(args.end_time),
      Period: args.period,
      Statistics: args.statistics,
    }));
    const datapoints = (resp.Datapoints || [])
      .sort((a, b) => (a.Timestamp?.getTime() || 0) - (b.Timestamp?.getTime() || 0))
      .map(d => ({
        Timestamp: d.Timestamp?.toISOString(),
        Average: d.Average,
        Sum: d.Sum,
        Maximum: d.Maximum,
        Minimum: d.Minimum,
        SampleCount: d.SampleCount,
        Unit: d.Unit,
      }));
    return {
      title: `${args.namespace}/${args.metric_name} Statistics`,
      output: JSON.stringify({
        region,
        namespace: args.namespace,
        metricName: args.metric_name,
        dimensions: args.dimensions,
        period: args.period,
        count: datapoints.length,
        datapoints,
      }, null, 2),
    };
  },
};

export const awsListMetrics: ToolDefinition = {
  name: 'aws_list_metrics',
  description: 'Discover available CloudWatch metrics. Optionally filter by namespace and/or metric name.',
  category: 'aws',
  parameters: z.object({
    namespace: z.string().optional().describe('Filter by namespace (e.g. AWS/RDS)'),
    metric_name: z.string().optional().describe('Filter by metric name'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = cwClient(ctx.accountId!);
    const params: any = {};
    if (args.namespace) params.Namespace = args.namespace;
    if (args.metric_name) params.MetricName = args.metric_name;
    const resp = await client.send(new ListMetricsCommand(params));
    const metrics = (resp.Metrics || []).map(m => ({
      Namespace: m.Namespace,
      MetricName: m.MetricName,
      Dimensions: m.Dimensions?.map(d => ({ Name: d.Name, Value: d.Value })),
    }));
    return {
      title: `CloudWatch Metrics (${region})`,
      output: JSON.stringify({ region, count: metrics.length, metrics }, null, 2),
    };
  },
};
