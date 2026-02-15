/**
 * nr_get_entity_golden_metrics — Get golden signals, recent alerts, and related entities
 * for a specific entity GUID.
 */
import { z } from 'zod';
import type { ToolDefinition } from '../tool-registry';
import type { ToolContext } from '../tool-context';
import { nerdgraph } from './client';

const QUERY = `
query GetEntityGoldenMetrics($guid: EntityGuid!) {
  actor {
    entity(guid: $guid) {
      guid
      name
      entityType
      domain
      alertSeverity
      reporting
      goldenMetrics {
        metrics {
          title
          unit
          queries {
            accountId
            query
          }
        }
      }
      recentAlertViolations(count: 10) {
        alertSeverity
        label
        level
        openedAt
        closedAt
        violationUrl
      }
      relatedEntities(filter: {direction: BOTH}) {
        results {
          source {
            entity {
              guid
              name
              entityType
            }
          }
          target {
            entity {
              guid
              name
              entityType
            }
          }
          type
        }
      }
      ... on ApmApplicationEntity {
        apmSummary {
          throughput
          responseTimeAverage
          errorRate
          apdexScore
          instanceCount
          hostCount
        }
        deployments(timeWindow: {startTime: 0}) {
          description
          timestamp
          revision
          user
        }
        language
        runningAgentVersions {
          maxVersion
          minVersion
        }
      }
    }
  }
}
`;

export const nrGetEntityGoldenMetrics: ToolDefinition = {
  name: 'nr_get_entity_golden_metrics',
  description:
    'Get golden signals (throughput, errors, latency, saturation), recent alert violations, related entities, and deployment info for a specific New Relic entity. Requires an entity GUID from nr_list_entities.',
  category: 'newrelic',
  parameters: z.object({
    guid: z.string().describe('New Relic entity GUID (from nr_list_entities)'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const data = await nerdgraph<any>(ctx.accountId!, QUERY, {
      guid: args.guid,
    });

    const entity = data.actor.entity;
    if (!entity) {
      return {
        title: `Entity not found: ${args.guid}`,
        output: JSON.stringify({ error: 'Entity not found', guid: args.guid }),
      };
    }

    const result: any = {
      guid: entity.guid,
      name: entity.name,
      entityType: entity.entityType,
      domain: entity.domain,
      alertSeverity: entity.alertSeverity,
      reporting: entity.reporting,
    };

    if (entity.apmSummary) {
      result.apmSummary = entity.apmSummary;
      result.language = entity.language;
      result.runningAgentVersions = entity.runningAgentVersions;
    }

    if (entity.goldenMetrics?.metrics) {
      result.goldenMetrics = entity.goldenMetrics.metrics.map((m: any) => ({
        title: m.title,
        unit: m.unit,
        nrqlQuery: m.queries?.[0]?.query,
      }));
    }

    if (entity.recentAlertViolations?.length) {
      result.recentAlerts = entity.recentAlertViolations;
    }

    if (entity.relatedEntities?.results?.length) {
      result.relatedEntities = entity.relatedEntities.results.map((r: any) => ({
        source: { guid: r.source.entity.guid, name: r.source.entity.name, type: r.source.entity.entityType },
        target: { guid: r.target.entity.guid, name: r.target.entity.name, type: r.target.entity.entityType },
        relationshipType: r.type,
      }));
    }

    if (entity.deployments?.length) {
      result.recentDeployments = entity.deployments.slice(0, 5);
    }

    return {
      title: `Entity: ${entity.name} (${entity.alertSeverity || 'OK'})`,
      output: JSON.stringify(result, null, 2),
    };
  },
};
