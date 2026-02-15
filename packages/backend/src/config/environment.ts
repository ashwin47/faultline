import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  dbPath: process.env.DB_PATH || join(__dirname, '../../data/faultline.db'),
  logLevel: process.env.LOG_LEVEL || 'info',

  // OpenAI Configuration
  openai: {
    model: process.env.OPENAI_MODEL || 'codex-mini-latest', // Codex model, Responses API only
    summaryModel: process.env.OPENAI_SUMMARY_MODEL || 'gpt-4.1-mini', // Fast & cheap for summarization
  },

  // Redis Configuration (for BullMQ job queue)
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // Worker Configuration
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: '7d',
  },

  // SMTP Configuration
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@faultline.dev',
  },

  appUrl: process.env.APP_URL || 'http://localhost:5173',

  isDevelopment: process.env.NODE_ENV !== 'production',
  isProduction: process.env.NODE_ENV === 'production',
};
