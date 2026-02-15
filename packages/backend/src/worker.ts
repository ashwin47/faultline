/**
 * Standalone worker process.
 *
 * Run separately from the API server:
 *   pnpm run start:worker    (production)
 *   pnpm run dev:worker      (dev with hot reload)
 *
 * Requires Redis and access to the same SQLite database as the API server.
 */

// Config
import { config } from './config/environment';
import { initDatabase, closeDatabase } from './config/database';

// Initializers
import { initializeTools } from './config/initializers/tools';
// Jobs
import { startAgentWorker, stopAgentWorker } from './app/jobs/agent-run.job';

import { logger } from './lib/utils/logger';

// ── Initializers ──

try {
  initDatabase();
  logger.info('Database initialized');
} catch (error) {
  logger.error({ error }, 'Failed to initialize database');
  process.exit(1);
}

initializeTools();

// ── Start ──

startAgentWorker();

logger.info(
  { concurrency: config.worker.concurrency, redis: config.redis.url },
  'Worker process started',
);

// ── Shutdown ──

async function shutdown(signal: string) {
  logger.info({ signal }, 'Worker shutting down...');
  await stopAgentWorker();
  closeDatabase();
  logger.info('Worker stopped');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
