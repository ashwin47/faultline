import { z } from 'zod';
import {
  RDSClient,
  DescribeDBInstancesCommand,
  DescribeDBLogFilesCommand,
  DownloadDBLogFilePortionCommand,
} from '@aws-sdk/client-rds';
import {
  PIClient,
  GetResourceMetricsCommand,
  DescribeDimensionKeysCommand,
  GetDimensionKeyDetailsCommand,
  GetResourceMetadataCommand,
  ListAvailableResourceDimensionsCommand,
  ListAvailableResourceMetricsCommand,
  CreatePerformanceAnalysisReportCommand,
  GetPerformanceAnalysisReportCommand,
  ListPerformanceAnalysisReportsCommand,
  type DimensionGroup,
  type MetricQuery,
} from '@aws-sdk/client-pi';
import type { ToolDefinition } from '../tool-registry';
import type { ToolContext } from '../tool-context';
import { getAwsCredentials } from './index';

function rdsClient(accountId: string) {
  const creds = getAwsCredentials(accountId);
  return { client: new RDSClient({
    region: creds.region,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  }), region: creds.region };
}

function piClient(accountId: string) {
  const creds = getAwsCredentials(accountId);
  return { client: new PIClient({
    region: creds.region,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  }), region: creds.region };
}

export const awsDescribeDBInstances: ToolDefinition = {
  name: 'aws_describe_db_instances',
  description: 'List RDS database instances. Returns instance identifiers, engine type, status, endpoint, storage, and DbiResourceId (needed for Performance Insights). Uses the region configured in Settings.',
  category: 'aws',
  parameters: z.object({
    db_instance_identifier: z.string().optional().describe('Specific DB instance identifier to describe'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = rdsClient(ctx.accountId!);
    const params: any = {};
    if (args.db_instance_identifier) params.DBInstanceIdentifier = args.db_instance_identifier;
    const resp = await client.send(new DescribeDBInstancesCommand(params));
    const instances = (resp.DBInstances || []).map(db => ({
      DBInstanceIdentifier: db.DBInstanceIdentifier,
      DbiResourceId: db.DbiResourceId,
      Engine: db.Engine,
      EngineVersion: db.EngineVersion,
      DBInstanceClass: db.DBInstanceClass,
      DBInstanceStatus: db.DBInstanceStatus,
      Endpoint: db.Endpoint ? { Address: db.Endpoint.Address, Port: db.Endpoint.Port } : null,
      AllocatedStorage: db.AllocatedStorage,
      MultiAZ: db.MultiAZ,
      AvailabilityZone: db.AvailabilityZone,
      StorageType: db.StorageType,
      PerformanceInsightsEnabled: db.PerformanceInsightsEnabled,
      InstanceCreateTime: db.InstanceCreateTime?.toISOString(),
    }));
    return {
      title: `RDS Instances (${region})`,
      output: JSON.stringify({ region, count: instances.length, instances }, null, 2),
    };
  },
};

export const awsPiGetResourceMetrics: ToolDefinition = {
  name: 'aws_pi_get_resource_metrics',
  description: 'Get Performance Insights resource metrics for an RDS instance. Use DbiResourceId (e.g. db-XXXXX) as identifier, NOT the instance name.',
  category: 'aws',
  parameters: z.object({
    resource_id: z.string().describe('DbiResourceId from aws_describe_db_instances (e.g. db-XXXXXXXXXXXXXXXXXXXXXXXX)'),
    metric: z.string().describe('Metric to query, e.g. "db.load.avg" for DB load'),
    group_by: z.object({
      group: z.string().describe('Group type: db.sql, db.wait_event, db.host, db.user'),
      dimensions: z.array(z.string()).optional().describe('Specific dimensions, e.g. ["db.sql.statement"]'),
      limit: z.number().optional().describe('Max number of dimension keys to return (default 10)'),
    }).describe('How to group the metric data'),
    start_time: z.string().describe('Start time in ISO 8601 format'),
    end_time: z.string().describe('End time in ISO 8601 format'),
    period: z.number().optional().describe('Period in seconds (default 300)'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = piClient(ctx.accountId!);
    const dimensionGroup: DimensionGroup = {
      Group: args.group_by.group,
      Dimensions: args.group_by.dimensions,
      Limit: args.group_by.limit,
    };
    const metricQuery: MetricQuery = {
      Metric: args.metric,
      GroupBy: dimensionGroup,
    };
    const resp = await client.send(new GetResourceMetricsCommand({
      ServiceType: 'RDS',
      Identifier: args.resource_id,
      MetricQueries: [metricQuery],
      StartTime: new Date(args.start_time),
      EndTime: new Date(args.end_time),
      PeriodInSeconds: args.period || 300,
    }));
    return {
      title: `PI Metrics: ${args.metric}`,
      output: JSON.stringify({
        region,
        resourceId: args.resource_id,
        metric: args.metric,
        groupBy: args.group_by,
        metricList: resp.MetricList,
      }, null, 2),
    };
  },
};

export const awsPiDescribeDimensionKeys: ToolDefinition = {
  name: 'aws_pi_describe_dimension_keys',
  description: 'Get top dimension keys (e.g. top SQL queries, top wait events) from Performance Insights. Use DbiResourceId as identifier.',
  category: 'aws',
  parameters: z.object({
    resource_id: z.string().describe('DbiResourceId from aws_describe_db_instances (e.g. db-XXXXXXXXXXXXXXXXXXXXXXXX)'),
    metric: z.string().describe('Metric to analyze, e.g. "db.load.avg"'),
    group_by: z.object({
      group: z.string().describe('Group type: db.sql, db.wait_event, db.host, db.user'),
      dimensions: z.array(z.string()).optional().describe('Specific dimensions, e.g. ["db.sql.statement", "db.sql.tokenized_id"]'),
      limit: z.number().optional().describe('Max number of keys to return (default 10)'),
    }).describe('How to group the dimension keys'),
    start_time: z.string().describe('Start time in ISO 8601 format'),
    end_time: z.string().describe('End time in ISO 8601 format'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = piClient(ctx.accountId!);
    const dimensionGroup: DimensionGroup = {
      Group: args.group_by.group,
      Dimensions: args.group_by.dimensions,
      Limit: args.group_by.limit,
    };
    const resp = await client.send(new DescribeDimensionKeysCommand({
      ServiceType: 'RDS',
      Identifier: args.resource_id,
      Metric: args.metric,
      GroupBy: dimensionGroup,
      StartTime: new Date(args.start_time),
      EndTime: new Date(args.end_time),
    }));
    return {
      title: `PI Dimension Keys: ${args.group_by.group}`,
      output: JSON.stringify({
        region,
        resourceId: args.resource_id,
        metric: args.metric,
        groupBy: args.group_by,
        keys: resp.Keys,
      }, null, 2),
    };
  },
};

export const awsPiGetDimensionKeyDetails: ToolDefinition = {
  name: 'aws_pi_get_dimension_key_details',
  description:
    'Get the full SQL text for a tokenized/truncated SQL ID from Performance Insights. ' +
    'Use this after aws_pi_describe_dimension_keys to get the complete SQL statement for a specific query. ' +
    'Pass the db.sql.id value as the identifier.',
  category: 'aws',
  parameters: z.object({
    resource_id: z.string().describe('DbiResourceId (e.g. db-XXXXXXXXXXXXXXXXXXXXXXXX)'),
    group: z.string().describe('The dimension group, e.g. "db.sql"'),
    group_identifier: z.string().describe('The dimension group identifier, e.g. the db.sql.id value'),
    requested_dimensions: z.array(z.string()).optional().describe('Specific dimensions to return, e.g. ["db.sql.statement"]'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = piClient(ctx.accountId!);
    const resp = await client.send(new GetDimensionKeyDetailsCommand({
      ServiceType: 'RDS',
      Identifier: args.resource_id,
      Group: args.group,
      GroupIdentifier: args.group_identifier,
      RequestedDimensions: args.requested_dimensions,
    }));
    return {
      title: `PI SQL Details: ${args.group_identifier}`,
      output: JSON.stringify({
        region,
        resourceId: args.resource_id,
        group: args.group,
        groupIdentifier: args.group_identifier,
        dimensions: resp.Dimensions,
      }, null, 2),
    };
  },
};

export const awsPiGetResourceMetadata: ToolDefinition = {
  name: 'aws_pi_get_resource_metadata',
  description:
    'Get Performance Insights metadata for an RDS instance — includes DB engine features, PI status, and instance capabilities.',
  category: 'aws',
  parameters: z.object({
    resource_id: z.string().describe('DbiResourceId (e.g. db-XXXXXXXXXXXXXXXXXXXXXXXX)'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = piClient(ctx.accountId!);
    const resp = await client.send(new GetResourceMetadataCommand({
      ServiceType: 'RDS',
      Identifier: args.resource_id,
    }));
    return {
      title: `PI Metadata: ${args.resource_id}`,
      output: JSON.stringify({
        region,
        resourceId: args.resource_id,
        identifier: resp.Identifier,
        features: resp.Features,
      }, null, 2),
    };
  },
};

export const awsPiListAvailableResourceDimensions: ToolDefinition = {
  name: 'aws_pi_list_dimensions',
  description:
    'List available Performance Insights dimensions for a given metric on an RDS instance. ' +
    'Use this to discover what group_by options are available before calling aws_pi_get_resource_metrics or aws_pi_describe_dimension_keys.',
  category: 'aws',
  parameters: z.object({
    resource_id: z.string().describe('DbiResourceId (e.g. db-XXXXXXXXXXXXXXXXXXXXXXXX)'),
    metrics: z.array(z.string()).describe('Metrics to list dimensions for, e.g. ["db.load.avg"]'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = piClient(ctx.accountId!);
    const resp = await client.send(new ListAvailableResourceDimensionsCommand({
      ServiceType: 'RDS',
      Identifier: args.resource_id,
      Metrics: args.metrics,
    }));
    return {
      title: `PI Available Dimensions`,
      output: JSON.stringify({
        region,
        resourceId: args.resource_id,
        metricDimensions: resp.MetricDimensions,
      }, null, 2),
    };
  },
};

export const awsPiListAvailableResourceMetrics: ToolDefinition = {
  name: 'aws_pi_list_metrics',
  description:
    'List all available Performance Insights metrics for an RDS instance. ' +
    'Use this to discover what metrics can be queried with aws_pi_get_resource_metrics.',
  category: 'aws',
  parameters: z.object({
    resource_id: z.string().describe('DbiResourceId (e.g. db-XXXXXXXXXXXXXXXXXXXXXXXX)'),
    metric_types: z.array(z.string()).optional().describe('Filter by metric type, e.g. ["os", "db"]. Omit to list all.'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = piClient(ctx.accountId!);
    const params: any = {
      ServiceType: 'RDS',
      Identifier: args.resource_id,
    };
    if (args.metric_types) params.MetricTypes = args.metric_types;

    const allMetrics: any[] = [];
    let nextToken: string | undefined;
    do {
      if (nextToken) params.NextToken = nextToken;
      const resp = await client.send(new ListAvailableResourceMetricsCommand(params));
      allMetrics.push(...(resp.Metrics || []));
      nextToken = resp.NextToken;
    } while (nextToken && allMetrics.length < 200);

    return {
      title: `PI Available Metrics`,
      output: JSON.stringify({
        region,
        resourceId: args.resource_id,
        count: allMetrics.length,
        metrics: allMetrics,
      }, null, 2),
    };
  },
};

export const awsPiCreateAnalysisReport: ToolDefinition = {
  name: 'aws_pi_create_analysis_report',
  description:
    'Create a Performance Insights analysis report for an RDS instance over a specific time window. ' +
    'The report analyzes DB load, top SQL, wait events, and provides recommendations. ' +
    'Returns a report ID — use aws_pi_get_analysis_report to retrieve the results.',
  category: 'aws',
  parameters: z.object({
    resource_id: z.string().describe('DbiResourceId (e.g. db-XXXXXXXXXXXXXXXXXXXXXXXX)'),
    start_time: z.string().describe('Analysis start time in ISO 8601 format'),
    end_time: z.string().describe('Analysis end time in ISO 8601 format'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = piClient(ctx.accountId!);
    const resp = await client.send(new CreatePerformanceAnalysisReportCommand({
      ServiceType: 'RDS',
      Identifier: args.resource_id,
      StartTime: new Date(args.start_time),
      EndTime: new Date(args.end_time),
    }));
    return {
      title: `PI Create Analysis Report`,
      output: JSON.stringify({
        region,
        resourceId: args.resource_id,
        analysisReportId: resp.AnalysisReportId,
        message: 'Report created. Use aws_pi_get_analysis_report with this ID to retrieve results once the report is ready.',
      }, null, 2),
    };
  },
};

export const awsPiGetAnalysisReport: ToolDefinition = {
  name: 'aws_pi_get_analysis_report',
  description:
    'Get a Performance Insights analysis report by ID. Returns DB load analysis, top SQL, wait events, and recommendations. ' +
    'Use aws_pi_create_analysis_report first to create one, or aws_pi_list_analysis_reports to find existing reports.',
  category: 'aws',
  parameters: z.object({
    resource_id: z.string().describe('DbiResourceId (e.g. db-XXXXXXXXXXXXXXXXXXXXXXXX)'),
    analysis_report_id: z.string().describe('Analysis report ID from aws_pi_create_analysis_report or aws_pi_list_analysis_reports'),
    accept_language: z.string().optional().describe('Language for the report (default "en-US")'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = piClient(ctx.accountId!);
    const resp = await client.send(new GetPerformanceAnalysisReportCommand({
      ServiceType: 'RDS',
      Identifier: args.resource_id,
      AnalysisReportId: args.analysis_report_id,
      AcceptLanguage: args.accept_language || 'en-US',
    }));
    return {
      title: `PI Analysis Report: ${args.analysis_report_id}`,
      output: JSON.stringify({
        region,
        resourceId: args.resource_id,
        analysisReport: resp.AnalysisReport,
      }, null, 2),
    };
  },
};

export const awsPiListAnalysisReports: ToolDefinition = {
  name: 'aws_pi_list_analysis_reports',
  description:
    'List Performance Insights analysis reports for an RDS instance. Returns report IDs, status, and time ranges.',
  category: 'aws',
  parameters: z.object({
    resource_id: z.string().describe('DbiResourceId (e.g. db-XXXXXXXXXXXXXXXXXXXXXXXX)'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = piClient(ctx.accountId!);
    const resp = await client.send(new ListPerformanceAnalysisReportsCommand({
      ServiceType: 'RDS',
      Identifier: args.resource_id,
    }));
    return {
      title: `PI Analysis Reports`,
      output: JSON.stringify({
        region,
        resourceId: args.resource_id,
        reports: resp.AnalysisReports,
      }, null, 2),
    };
  },
};

export const awsRdsSlowQueryLog: ToolDefinition = {
  name: 'aws_rds_slow_query_log',
  description:
    'Fetch recent slow query log entries from an RDS database instance. ' +
    'Requires slow_query_log to be enabled in the DB parameter group. ' +
    'Returns the most recent slow queries with execution times, lock times, and SQL statements.',
  category: 'aws',
  parameters: z.object({
    db_instance_identifier: z.string().describe('RDS DB instance identifier (e.g. "my-database")'),
    max_lines: z.number().optional().describe('Maximum number of log lines to return (default 500, max 5000)'),
    hours_back: z.number().optional().describe('Only include log files written in the last N hours (default 6)'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const { client, region } = rdsClient(ctx.accountId!);
    const dbId = args.db_instance_identifier;
    const hoursBack = args.hours_back || 6;
    const maxLines = Math.min(args.max_lines || 500, 5000);

    // Find slow query log files written recently
    const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
    const logFiles = await client.send(new DescribeDBLogFilesCommand({
      DBInstanceIdentifier: dbId,
      FilenameContains: 'slowquery',
    }));

    const recentFiles = (logFiles.DescribeDBLogFiles || [])
      .filter(f => f.LastWritten && f.LastWritten >= cutoff)
      .sort((a, b) => (b.LastWritten || 0) - (a.LastWritten || 0));

    if (recentFiles.length === 0) {
      return {
        title: `Slow Query Log (${dbId})`,
        output: JSON.stringify({
          region,
          dbInstanceIdentifier: dbId,
          message: 'No slow query log files found in the last ' + hoursBack + ' hours. ' +
            'Ensure slow_query_log is enabled in the DB parameter group, or try increasing hours_back.',
          availableLogFiles: (logFiles.DescribeDBLogFiles || []).map(f => ({
            filename: f.LogFileName,
            lastWritten: f.LastWritten ? new Date(f.LastWritten).toISOString() : null,
            size: f.Size,
          })),
        }, null, 2),
      };
    }

    // Download log content from the most recent files
    let allContent = '';
    for (const file of recentFiles) {
      if (!file.LogFileName) continue;

      let marker: string | undefined;
      let fileContent = '';
      do {
        const portion = await client.send(new DownloadDBLogFilePortionCommand({
          DBInstanceIdentifier: dbId,
          LogFileName: file.LogFileName,
          Marker: marker,
          NumberOfLines: maxLines,
        }));
        fileContent += portion.LogFileData || '';
        marker = portion.AdditionalDataPending ? (portion.Marker ?? undefined) : undefined;
      } while (marker && fileContent.length < 100_000);

      allContent += fileContent;
      if (allContent.split('\n').length >= maxLines) break;
    }

    // Trim to max lines
    const lines = allContent.split('\n');
    const trimmed = lines.slice(0, maxLines).join('\n');

    return {
      title: `Slow Query Log (${dbId})`,
      output: JSON.stringify({
        region,
        dbInstanceIdentifier: dbId,
        logFilesScanned: recentFiles.length,
        lineCount: Math.min(lines.length, maxLines),
        content: trimmed,
      }, null, 2),
    };
  },
};
