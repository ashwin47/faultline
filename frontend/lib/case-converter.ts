import camelcaseKeys from 'camelcase-keys';
import snakecaseKeys from 'snakecase-keys';

/**
 * Recursively convert all keys in an object from snake_case to camelCase.
 * Used for incoming data (API responses, WebSocket events).
 */
export function toCamelCase<T = unknown>(data: unknown): T {
  if (data === null || data === undefined || typeof data !== 'object') {
    return data as T;
  }
  return camelcaseKeys(data as Record<string, unknown>, { deep: true, exclude: [/\./] }) as T;
}

/**
 * Recursively convert all keys in an object from camelCase to snake_case.
 * Used for outgoing data (API request bodies, WebSocket sends).
 */
export function toSnakeCase<T = unknown>(data: unknown): T {
  if (data === null || data === undefined || typeof data !== 'object') {
    return data as T;
  }
  return snakecaseKeys(data as Record<string, unknown>, { deep: true, exclude: [/\./] }) as T;
}
