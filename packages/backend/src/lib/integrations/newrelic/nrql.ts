/**
 * nr_run_nrql — Execute an arbitrary NRQL query against NerdGraph.
 */
import { z } from 'zod';
import type { ToolDefinition } from '../tool-registry';
import type { ToolContext } from '../tool-context';
import { nerdgraph } from './client';
import { getNewRelicCredentials } from './index';

const QUERY = `
query RunNrql($accountId: Int!, $nrql: Nrql!) {
  actor {
    account(id: $accountId) {
      nrql(query: $nrql) {
        results
        metadata {
          facets
          eventTypes
          timeWindow {
            begin
            end
          }
        }
      }
    }
  }
}
`;

/**
 * Strip the WHERE clause from a NRQL query to create a probe query.
 * Preserves SELECT, FROM, SINCE, UNTIL, LIMIT, FACET, and TIMESERIES.
 */
function stripWhereClause(nrql: string): string {
  // Replace WHERE ... up to the next top-level keyword or end of string.
  // Top-level keywords that can follow WHERE: SINCE, UNTIL, LIMIT, FACET, TIMESERIES, ORDER BY, COMPARE WITH
  const stripped = nrql.replace(
    /\bWHERE\b\s+.*?(?=\b(?:SINCE|UNTIL|LIMIT|FACET|TIMESERIES|ORDER\s+BY|COMPARE\s+WITH)\b|$)/is,
    '',
  );
  // If the query had a LIMIT, keep it; otherwise cap at 1 to minimise data for the probe
  const hasLimit = /\bLIMIT\b/i.test(stripped);
  return hasLimit ? stripped.trim() : `${stripped.trim()} LIMIT 1`;
}

export const nrRunNrql: ToolDefinition = {
  name: 'nr_run_nrql',
  description:
    "Execute a NRQL query against New Relic. Covers transactions, errors, metrics, logs, traces, and any telemetry data. Examples: \"SELECT count(*) FROM Transaction SINCE 1 hour ago\", \"SELECT average(duration) FROM Transaction FACET name SINCE 30 minutes ago LIMIT 20\", \"SELECT * FROM Log WHERE message LIKE '%error%' SINCE 1 hour ago LIMIT 10\".",
  category: 'newrelic',
  parameters: z.object({
    nrql: z.string().describe('The NRQL query to execute'),
  }),
  async execute(args: any, ctx: ToolContext) {
    const creds = getNewRelicCredentials(ctx.accountId!);
    const nrAccountId = parseInt(creds.accountId, 10);

    const data = await nerdgraph<any>(ctx.accountId!, QUERY, {
      accountId: nrAccountId,
      nrql: args.nrql,
    });

    const nrqlResult = data.actor.account.nrql;
    const results = nrqlResult.results ?? [];
    const isEmpty = results.length === 0 || results.every((r: any) =>
      Object.values(r).every((v: any) => v === 0 || v === null)
    );

    // When the query returned empty and has a WHERE clause, re-run without
    // filters to check whether the event type actually has data. If it does,
    // the original filters were wrong — tell the model.
    let emptyHint: string | undefined;
    if (isEmpty && /\bWHERE\b/i.test(args.nrql)) {
      try {
        const stripped = stripWhereClause(args.nrql);
        const probeData = await nerdgraph<any>(ctx.accountId!, QUERY, {
          accountId: nrAccountId,
          nrql: stripped,
        });
        const probeResults = probeData.actor.account.nrql.results ?? [];
        const probeHasData = probeResults.length > 0 && probeResults.some((r: any) =>
          Object.values(r).some((v: any) => v !== 0 && v !== null)
        );
        if (probeHasData) {
          emptyHint =
            `\n\n⚠️ EMPTY RESULT HINT: Your query returned no data, but the same query WITHOUT the WHERE clause returned results. ` +
            `This means the event type has data but your filter conditions are wrong. ` +
            `Probe query used: "${stripped}". ` +
            `Try discovering valid attribute values first with a FACET query (e.g., SELECT count(*) FROM <EventType> FACET <attribute> SINCE <timerange> LIMIT 20) before filtering.`;
        }
      } catch {
        // Probe failed — don't block the original result
      }
    }

    const output: Record<string, unknown> = {
      results,
      metadata: nrqlResult.metadata,
    };

    return {
      title: `NRQL: ${args.nrql}`,
      output: JSON.stringify(output, null, 2) + (emptyHint ?? ''),
    };
  },
};
