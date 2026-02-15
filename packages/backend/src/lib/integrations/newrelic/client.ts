/**
 * NerdGraph (New Relic GraphQL API) client.
 * Supports both US and EU regions.
 */
import { getNewRelicCredentials } from './index';

const ENDPOINTS: Record<string, string> = {
  us: 'https://api.newrelic.com/graphql',
  eu: 'https://api.eu.newrelic.com/graphql',
};

export interface NerdGraphResponse<T = any> {
  data: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

/**
 * Execute a NerdGraph GraphQL query.
 * Throws on HTTP errors and GraphQL-level errors.
 */
export async function nerdgraph<T = any>(
  accountId: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const creds = getNewRelicCredentials(accountId);
  const endpoint = ENDPOINTS[creds.region] || ENDPOINTS.us;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-Key': creds.apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`NerdGraph API ${resp.status}: ${text || resp.statusText}`);
  }

  const json = (await resp.json()) as NerdGraphResponse<T>;

  if (json.errors && json.errors.length > 0) {
    const msgs = json.errors.map((e) => e.message).join('; ');
    throw new Error(`NerdGraph query error: ${msgs}`);
  }

  return json.data;
}
