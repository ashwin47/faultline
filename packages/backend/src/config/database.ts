import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from './environment';
import { logger } from '../lib/utils/logger';
import { generateEncryptionKey } from '../lib/utils/encryption';
import * as schema from '../db/schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db: BetterSQLite3Database<typeof schema> | null = null;
let sqlite: Database.Database | null = null;
let encryptionKey: string | null = null;

export function initDatabase(): BetterSQLite3Database<typeof schema> {
  if (db) return db;

  // Ensure data directory exists
  const dbDir = dirname(config.dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
    logger.info({ path: dbDir }, 'Created database directory');
  }

  // Open raw connection for pragmas
  sqlite = new Database(config.dbPath);
  sqlite.pragma('journal_mode = WAL');
  logger.info({ path: config.dbPath }, 'Database connected');

  // Wrap with Drizzle
  db = drizzle(sqlite, { schema });

  // Run migrations
  const migrationsFolder = join(__dirname, '../../drizzle');
  migrate(db, { migrationsFolder });
  logger.info('Database migrations applied');

  // Initialize encryption key (now in system_kv table)
  initEncryptionKey();

  return db;
}

export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function getEncryptionKey(): string {
  if (!encryptionKey) {
    throw new Error('Encryption key not initialized');
  }
  return encryptionKey;
}

function initEncryptionKey(): void {
  if (!db) throw new Error('Database not initialized');

  const row = db
    .select({ value: schema.systemKv.value })
    .from(schema.systemKv)
    .where(eq(schema.systemKv.key, 'encryption_key'))
    .get();

  if (row) {
    encryptionKey = row.value;
    logger.info('Encryption key loaded from database');
  } else {
    encryptionKey = generateEncryptionKey();

    db.insert(schema.systemKv)
      .values({ key: 'encryption_key', value: encryptionKey })
      .run();

    logger.info('Generated and stored new encryption key');
  }
}

export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
    logger.info('Database connection closed');
  }
}
