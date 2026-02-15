/**
 * Name normalization utilities for cross-platform resource matching.
 */

const COMMON_SUFFIXES = [
  'service', 'svc', 'app', 'api', 'lambda', 'function',
  'db', 'database', 'instance', 'project', 'prod', 'staging', 'dev',
  'server', 'cluster', 'cache', 'queue', 'worker', 'handler',
];

const SUFFIX_PATTERN = new RegExp(`(?:[-_\\s.](?:${COMMON_SUFFIXES.join('|')}))+$`, 'i');

/**
 * Normalize a resource name for cross-platform matching.
 * "Payment API" → "paymentapi"
 * "payment-api-service" → "paymentapi"
 */
export function normalizeName(name: string): string {
  // Remove common suffixes first (before stripping separators)
  let normalized = name.replace(SUFFIX_PATTERN, '');
  // Lowercase and strip separators
  normalized = normalized.toLowerCase().replace(/[-_\s.]+/g, '');
  return normalized;
}

/**
 * Extract service-identifying tags from an AWS Tags array.
 * Looks for keys: service, app, application, Name, project
 */
export function extractServiceTags(
  tags?: { Key?: string; Value?: string }[],
): Record<string, string> {
  if (!tags) return {};

  const interestingKeys = ['service', 'app', 'application', 'name', 'project'];
  const result: Record<string, string> = {};

  for (const tag of tags) {
    if (!tag.Key || !tag.Value) continue;
    if (interestingKeys.includes(tag.Key.toLowerCase())) {
      result[tag.Key] = tag.Value;
    }
  }

  return result;
}
