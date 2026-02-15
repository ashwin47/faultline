import pino from 'pino';
import { config } from '../../config/environment';

export const logger = pino({
  level: config.logLevel,
  transport: config.isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  } : undefined,
});
