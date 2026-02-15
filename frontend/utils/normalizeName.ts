/**
 * Name normalization utilities for cross-platform resource matching.
 * Mirrors the backend version in packages/backend/src/lib/utils/name-matcher.ts
 */

const COMMON_SUFFIXES = [
  'service', 'svc', 'app', 'api', 'lambda', 'function',
  'db', 'database', 'instance', 'project', 'prod', 'staging', 'dev',
  'server', 'cluster', 'cache', 'queue', 'worker', 'handler',
];

const SUFFIX_PATTERN = new RegExp(`(?:[-_\\s.](?:${COMMON_SUFFIXES.join('|')}))+$`, 'i');

/**
 * Normalize a resource name for cross-platform matching.
 * "Payment API" -> "paymentapi"
 * "payment-api-service" -> "paymentapi"
 */
export function normalizeName(name: string): string {
  let normalized = name.replace(SUFFIX_PATTERN, '');
  normalized = normalized.toLowerCase().replace(/[-_\s.]+/g, '');
  return normalized;
}
