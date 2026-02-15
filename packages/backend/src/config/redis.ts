import IORedis from 'ioredis';
import { config } from './environment';
import { logger } from '../lib/utils/logger';

/**
 * Create a new Redis connection for BullMQ or pub/sub.
 * Each caller gets its own connection — Redis pub/sub requires
 * dedicated connections (a subscriber can't also publish).
 */
export function createRedisConnection(): IORedis {
  return new IORedis(config.redis.url, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
  });
}

/**
 * Close a Redis connection gracefully.
 */
export async function closeRedisConnection(conn: IORedis): Promise<void> {
  try {
    await conn.quit();
  } catch (err) {
    logger.warn({ err }, 'Error closing Redis connection');
    conn.disconnect();
  }
}
