/**
 * AWS SDK tools — replaces the AWS MCP server with typed, Zod-validated tools.
 */
import { Setting } from '../../../app/models/setting.model';
import { toolRegistry } from '../tool-registry';

// Import all tool definitions
import { awsGetCallerIdentity } from './sts';
import { awsDescribeInstances } from './ec2';
import { awsDescribeAlarms, awsGetMetricStatistics, awsListMetrics } from './cloudwatch';
import { awsListFunctions, awsGetFunction } from './lambda';
import {
  awsDescribeDBInstances,
  awsPiGetResourceMetrics,
  awsPiDescribeDimensionKeys,
  awsPiGetDimensionKeyDetails,
  awsPiGetResourceMetadata,
  awsPiListAvailableResourceDimensions,
  awsPiListAvailableResourceMetrics,
  awsPiCreateAnalysisReport,
  awsPiGetAnalysisReport,
  awsPiListAnalysisReports,
  awsRdsSlowQueryLog,
} from './rds';
import { awsDescribeLogGroups, awsFilterLogEvents } from './logs';

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/**
 * Read AWS credentials from the settings database.
 * Throws if credentials are not configured.
 */
export function getAwsCredentials(accountId: string): AwsCredentials {
  const accessKeyId = Setting.get(accountId, 'aws.access_key_id');
  const secretAccessKey = Setting.get(accountId, 'aws.secret_access_key');
  const region = Setting.get(accountId, 'aws.region') || 'us-east-1';

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not configured. Please enter your AWS Access Key and Secret Key in Settings.');
  }

  return { accessKeyId, secretAccessKey, region };
}

/** All AWS tool definitions */
const awsTools = [
  // STS
  awsGetCallerIdentity,
  // EC2
  awsDescribeInstances,
  // CloudWatch
  awsDescribeAlarms,
  awsGetMetricStatistics,
  awsListMetrics,
  // Lambda
  awsListFunctions,
  awsGetFunction,
  // RDS + Performance Insights
  awsDescribeDBInstances,
  awsPiGetResourceMetrics,
  awsPiDescribeDimensionKeys,
  awsPiGetDimensionKeyDetails,
  awsPiGetResourceMetadata,
  awsPiListAvailableResourceDimensions,
  awsPiListAvailableResourceMetrics,
  awsPiCreateAnalysisReport,
  awsPiGetAnalysisReport,
  awsPiListAnalysisReports,
  awsRdsSlowQueryLog,
  // CloudWatch Logs
  awsDescribeLogGroups,
  awsFilterLogEvents,
];

/**
 * Register all AWS tools with the tool registry.
 * Call this once at startup.
 */
export function registerAwsTools(): void {
  for (const tool of awsTools) {
    toolRegistry.define(tool);
  }
}

/** Names of all AWS tools (for filtering in OpenAIAgent) */
export const awsToolNames = awsTools.map(t => t.name);
