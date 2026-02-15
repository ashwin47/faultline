/**
 * New Relic custom tools — calls NerdGraph (GraphQL) API directly.
 * Replaces the New Relic hosted MCP server (which returns 403).
 */
import { Setting } from '../../../app/models/setting.model';
import { toolRegistry } from '../tool-registry';

import { nrListEntities } from './entities';
import { nrRunNrql } from './nrql';
import { nrGetEntityGoldenMetrics } from './golden-metrics';

export interface NewRelicCredentials {
  apiKey: string;
  accountId: string;
  region: string;
}

/**
 * Read New Relic credentials from the settings database.
 * Throws if not configured.
 */
export function getNewRelicCredentials(accountId: string): NewRelicCredentials {
  const apiKey = Setting.get(accountId, 'newrelic.api_key');
  const nrAccountId = Setting.get(accountId, 'newrelic.account_id');

  if (!apiKey || !nrAccountId) {
    throw new Error('New Relic API key or account ID not configured. Please enter them in Settings.');
  }

  const region = Setting.get(accountId, 'newrelic.region') || 'us';

  return { apiKey, accountId: nrAccountId, region };
}

/** All New Relic tool definitions */
const newrelicTools = [
  nrListEntities,
  nrRunNrql,
  nrGetEntityGoldenMetrics,
];

/**
 * Register all New Relic tools with the tool registry.
 * Call this once at startup.
 */
export function registerNewRelicTools(): void {
  for (const tool of newrelicTools) {
    toolRegistry.define(tool);
  }
}

/** Names of all New Relic tools (for filtering in OpenAIAgent) */
export const newrelicToolNames = newrelicTools.map(t => t.name);
