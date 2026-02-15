import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';

// Config
import { config } from './config/environment';
import { initDatabase, closeDatabase } from './config/database';

// Initializers
import { initializeTools } from './config/initializers/tools';
// Routes
import { registerRoutes } from './routes';

// Channels
import { initWebSocket, closeWebSocket } from './app/channels/agent.channel';

// Jobs
import { closeAgentQueue } from './app/jobs/agent-queue';

import { logger } from './lib/utils/logger';

// ── Boot ──

const app: Express = express();
const server = createServer(app);

// Middleware
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  logger.info({ method: req.method, path: req.path, ip: req.ip }, 'HTTP request');
  next();
});

// Routes
registerRoutes(app);

// Error handling
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ error: err, path: req.path }, 'Express error');
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

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

initWebSocket(server);

server.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'Server started');
});

// ── Shutdown ──

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down...');
  await closeAgentQueue();
  await closeWebSocket();
  server.close(() => {
    closeDatabase();
    logger.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
