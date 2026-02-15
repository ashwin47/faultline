/**
 * PagerDuty REST API v2 client — authenticated fetch + offset-based pagination.
 */
import { getPagerDutyCredentials } from './index';

const BASE_URL = 'https://api.pagerduty.com';

export interface PdRequestOptions {
  method?: string;
  params?: Record<string, string | string[] | number | boolean | undefined>;
  body?: unknown;
}

/**
 * Make an authenticated request to the PagerDuty REST API v2.
 */
export async function pdRequest<T = any>(accountId: string, path: string, options: PdRequestOptions = {}): Promise<T> {
  const { apiKey } = getPagerDutyCredentials(accountId);
  const { method = 'GET', params, body } = options;

  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(`${key}[]`, v);
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const resp = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Token token=${apiKey}`,
      Accept: 'application/vnd.pagerduty+json;version=2',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`PagerDuty API ${resp.status}: ${text || resp.statusText}`);
  }

  return resp.json() as Promise<T>;
}

/**
 * Paginate through a PagerDuty list endpoint using offset-based pagination.
 * Returns all items for the given `resourceKey` up to `maxItems`.
 */
export async function pdPaginate<T = any>(
  accountId: string,
  path: string,
  resourceKey: string,
  params: Record<string, string | string[] | number | boolean | undefined> = {},
  maxItems = 500,
): Promise<T[]> {
  const items: T[] = [];
  let offset = 0;
  const limit = 100;

  while (items.length < maxItems) {
    const data = await pdRequest<any>(accountId, path, {
      params: { ...params, limit, offset },
    });

    const page: T[] = data[resourceKey] || [];
    items.push(...page);

    if (!data.more || page.length === 0) break;
    offset += limit;
  }

  return items.slice(0, maxItems);
}
