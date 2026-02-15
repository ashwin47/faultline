import { z } from 'zod';
import {
  EC2Client,
  DescribeInstancesCommand,
  type Filter,
} from '@aws-sdk/client-ec2';
import type { ToolDefinition } from '../tool-registry';
import type { ToolContext } from '../tool-context';
import { getAwsCredentials } from './index';

function ec2Client(accountId: string) {
  const creds = getAwsCredentials(accountId);
  return { client: new EC2Client({
    region: creds.region,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  }), region: creds.region };
}

export const awsDescribeInstances: ToolDefinition = {
  name: 'aws_describe_instances',
  description: 'List EC2 instances. Optionally filter by instance IDs or key/value filters (e.g. instance-state-name=running). Uses the region configured in Settings.',
  category: 'aws',
  parameters: z.object({
    instance_ids: z.array(z.string()).optional().describe('Specific instance IDs to describe'),
    filters: z.array(z.object({
      name: z.string().describe('Filter name (e.g. instance-state-name)'),
      values: z.array(z.string()).describe('Filter values (e.g. ["running"])'),
    })).optional().describe('Filters to apply'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = ec2Client(ctx.accountId!);
    const params: any = {};
    if (args.instance_ids?.length) params.InstanceIds = args.instance_ids;
    if (args.filters?.length) {
      params.Filters = args.filters.map((f: any): Filter => ({
        Name: f.name,
        Values: f.values,
      }));
    }
    const resp = await client.send(new DescribeInstancesCommand(params));
    const instances = (resp.Reservations || []).flatMap(r => r.Instances || []);
    const summary = instances.map(i => ({
      InstanceId: i.InstanceId,
      InstanceType: i.InstanceType,
      State: i.State?.Name,
      LaunchTime: i.LaunchTime?.toISOString(),
      PrivateIpAddress: i.PrivateIpAddress,
      PublicIpAddress: i.PublicIpAddress,
      Tags: Object.fromEntries((i.Tags || []).map(t => [t.Key, t.Value])),
      SubnetId: i.SubnetId,
      VpcId: i.VpcId,
    }));
    return {
      title: `EC2 Instances (${region})`,
      output: JSON.stringify({ region, count: summary.length, instances: summary }, null, 2),
    };
  },
};

