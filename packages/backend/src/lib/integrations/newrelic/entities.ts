/**
 * nr_list_entities — Search/list APM entities in New Relic.
 */
import { z } from 'zod';
import type { ToolDefinition } from '../tool-registry';
import type { ToolContext } from '../tool-context';
import { nerdgraph } from './client';

const QUERY = `
query ListEntities($query: String, $cursor: String) {
  actor {
    entitySearch(query: $query) {
      results(cursor: $cursor) {
        entities {
          guid
          name
          entityType
          domain
          type
          reporting
          alertSeverity
          tags {
            key
            values
          }
          ... on ApmApplicationEntityOutline {
            apmSummary {
              throughput
              responseTimeAverage
              errorRate
              apdexScore
              instanceCount
            }
            language
          }
        }
        nextCursor
      }
      count
    }
  }
}
`;

export const nrListEntities: ToolDefinition = {
  name: 'nr_list_entities',
  description:
    'Search or list New Relic APM entities. Returns app names, GUIDs, APM summary metrics (throughput, response time, error rate, apdex), and alert severity. Use this first to discover entity names and GUIDs.',
  category: 'newrelic',
  parameters: z.object({
    query: z
      .string()
      .optional()
      .describe(
        "NRQL-style entity search query (e.g. \"domain = 'APM'\", \"name LIKE 'payment'\", \"domain = 'APM' AND type = 'APPLICATION'\"). Defaults to listing all APM applications.",
      ),
  }),
  async execute(args: any, ctx: ToolContext) {
    const searchQuery = args.query || "domain = 'APM' AND type = 'APPLICATION'";

    const data = await nerdgraph<any>(ctx.accountId!, QUERY, {
      query: searchQuery,
      cursor: null,
    });

    const results = data.actor.entitySearch.results;
    const entities = results.entities.map((e: any) => ({
      guid: e.guid,
      name: e.name,
      entityType: e.entityType,
      domain: e.domain,
      type: e.type,
      reporting: e.reporting,
      alertSeverity: e.alertSeverity,
      language: e.language,
      apmSummary: e.apmSummary,
    }));

    return {
      title: `New Relic Entities (${entities.length} of ${data.actor.entitySearch.count})`,
      output: JSON.stringify(
        {
          totalCount: data.actor.entitySearch.count,
          returned: entities.length,
          entities,
          hasMore: !!results.nextCursor,
        },
        null,
        2,
      ),
    };
  },
};
