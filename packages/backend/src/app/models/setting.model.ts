import { eq, and, like } from 'drizzle-orm';
import { getDatabase, getEncryptionKey } from '../../config/database';
import { settings } from '../../db/schema';
import { encrypt, decrypt, maskValue } from '../../lib/utils/encryption';
import type { Settings, IntegrationStatus } from '../../types/index';

export class Setting {
  /** Suffixes that indicate a value should be encrypted at rest. */
  private static readonly ENCRYPTED_SUFFIXES = [
    '.api_key',
    '.auth_token',
    '.access_key_id',
    '.secret_access_key',
    '.token',
  ];

  private static shouldEncrypt(key: string): boolean {
    return Setting.ENCRYPTED_SUFFIXES.some(suffix => key.endsWith(suffix));
  }

  private static validateApiKey(key: string, value: string): void {
    if (key === 'openai.api_key') {
      if (!value.startsWith('sk-')) {
        throw new Error('OpenAI API key must start with "sk-"');
      }
      if (value.length < 20) {
        throw new Error('OpenAI API key appears to be invalid (too short)');
      }
    }
  }

  static get(accountId: string, key: string): string | null {
    const db = getDatabase();
    const row = db
      .select({ value: settings.value, isEncrypted: settings.isEncrypted })
      .from(settings)
      .where(and(eq(settings.accountId, accountId), eq(settings.key, key)))
      .get();

    if (!row) return null;

    if (row.isEncrypted) {
      const encryptionKey = getEncryptionKey();
      try {
        return decrypt(row.value, encryptionKey);
      } catch {
        console.error(`Failed to decrypt setting: ${key}. The encryption key may have changed. Please re-enter this value in Settings.`);
        return null;
      }
    }

    return row.value;
  }

  static all(accountId: string, mask = false): Settings {
    const db = getDatabase();
    const rows = db
      .select({ key: settings.key, value: settings.value, isEncrypted: settings.isEncrypted })
      .from(settings)
      .where(eq(settings.accountId, accountId))
      .all();

    const result: Settings = {};
    const encryptionKey = getEncryptionKey();

    for (const row of rows) {
      if (row.key.startsWith('_internal.')) continue;

      let value = row.value;

      if (row.isEncrypted) {
        value = decrypt(value, encryptionKey);
      }

      if (mask && Setting.shouldEncrypt(row.key)) {
        value = maskValue(value);
      }

      result[row.key as keyof Settings] = value;
    }

    return result;
  }

  static set(accountId: string, key: string, value: string): void {
    if (Setting.shouldEncrypt(key)) {
      Setting.validateApiKey(key, value);
    }

    const db = getDatabase();
    const shouldEnc = Setting.shouldEncrypt(key);
    let finalValue = value;

    if (shouldEnc) {
      const encryptionKey = getEncryptionKey();
      finalValue = encrypt(value, encryptionKey);
    }

    // Use upsert: try insert, on conflict update
    const existing = db
      .select({ id: settings.id })
      .from(settings)
      .where(and(eq(settings.accountId, accountId), eq(settings.key, key)))
      .get();

    if (existing) {
      db.update(settings)
        .set({ value: finalValue, isEncrypted: shouldEnc, updatedAt: new Date() })
        .where(eq(settings.id, existing.id))
        .run();
    } else {
      db.insert(settings)
        .values({ accountId, key, value: finalValue, isEncrypted: shouldEnc, updatedAt: new Date() })
        .run();
    }
  }

  static setMany(accountId: string, newSettings: Partial<Settings>): void {
    const db = getDatabase();

    db.transaction((tx) => {
      for (const [key, value] of Object.entries(newSettings)) {
        if (value === undefined || value === null) continue;

        if (Setting.shouldEncrypt(key)) {
          Setting.validateApiKey(key, value);
        }

        const shouldEnc = Setting.shouldEncrypt(key);
        let finalValue = value;

        if (shouldEnc) {
          const encryptionKey = getEncryptionKey();
          finalValue = encrypt(value, encryptionKey);
        }

        const existing = tx
          .select({ id: settings.id })
          .from(settings)
          .where(and(eq(settings.accountId, accountId), eq(settings.key, key)))
          .get();

        if (existing) {
          tx.update(settings)
            .set({ value: finalValue, isEncrypted: shouldEnc, updatedAt: new Date() })
            .where(eq(settings.id, existing.id))
            .run();
        } else {
          tx.insert(settings)
            .values({ accountId, key, value: finalValue, isEncrypted: shouldEnc, updatedAt: new Date() })
            .run();
        }
      }
    });
  }

  static destroy(accountId: string, key: string): void {
    const db = getDatabase();
    db.delete(settings)
      .where(and(eq(settings.accountId, accountId), eq(settings.key, key)))
      .run();
  }

  static integrationStatus(accountId: string): IntegrationStatus {
    const keys = Object.keys(Setting.all(accountId, false));

    return {
      openai: keys.includes('openai.api_key'),
      newrelic: keys.some(k => /^newrelic\.\d+\.api_key$/.test(k)),
      sentry: keys.some(k => /^sentry\.\d+\.auth_token$/.test(k)),
      aws: keys.some(k => /^aws\.\d+\.access_key_id$/.test(k)),
      github: keys.some(k => /^github\.\d+\.token$/.test(k)),
      pagerduty: keys.some(k => /^pagerduty\.\d+\.api_key$/.test(k)),
    };
  }

  /**
   * Get all instances for an integration prefix.
   * Returns an array of { field: value } objects, one per indexed instance.
   * e.g. getInstances(accountId, 'sentry') returns
   *   [{ auth_token: '...', org: '...' }, { auth_token: '...', org: '...' }]
   */
  static getInstances(accountId: string, integration: string): Record<string, string>[] {
    const db = getDatabase();
    const encryptionKey = getEncryptionKey();
    const rows = db
      .select({ key: settings.key, value: settings.value, isEncrypted: settings.isEncrypted })
      .from(settings)
      .where(and(eq(settings.accountId, accountId), like(settings.key, `${integration}.%`)))
      .all();

    const instances = new Map<number, Record<string, string>>();
    const pattern = new RegExp(`^${integration.replace('.', '\\.')}\\.(\\d+)\\.(.+)$`);

    for (const row of rows) {
      const match = row.key.match(pattern);
      if (!match) continue;

      const index = parseInt(match[1]);
      const field = match[2];
      let value = row.value;

      if (row.isEncrypted) {
        try {
          value = decrypt(value, encryptionKey);
        } catch {
          continue;
        }
      }

      if (!instances.has(index)) instances.set(index, {});
      instances.get(index)![field] = value;
    }

    return [...instances.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, fields]) => fields);
  }

  /**
   * Delete all keys for a specific integration instance and reindex higher instances.
   */
  static deleteInstance(accountId: string, integration: string, index: number): void {
    const db = getDatabase();
    const prefix = `${integration}.${index}.`;

    db.transaction((tx) => {
      // Delete all keys for this instance
      const allRows = tx
        .select({ id: settings.id, key: settings.key })
        .from(settings)
        .where(and(eq(settings.accountId, accountId), like(settings.key, `${integration}.%`)))
        .all();

      for (const row of allRows) {
        if (row.key.startsWith(prefix)) {
          tx.delete(settings).where(eq(settings.id, row.id)).run();
        }
      }

      // Reindex higher instances (N+1 → N, N+2 → N+1, etc.)
      const pattern = new RegExp(`^${integration.replace('.', '\\.')}\\.(\\d+)\\.(.+)$`);
      for (const row of allRows) {
        const match = row.key.match(pattern);
        if (!match) continue;

        const oldIndex = parseInt(match[1]);
        const field = match[2];
        if (oldIndex <= index) continue;

        tx.update(settings)
          .set({ key: `${integration}.${oldIndex - 1}.${field}` })
          .where(eq(settings.id, row.id))
          .run();
      }
    });
  }

  static async testIntegration(accountId: string, integration: string): Promise<{ success: boolean; message: string }> {
    const status = Setting.integrationStatus(accountId);

    if (!status[integration as keyof IntegrationStatus]) {
      return {
        success: false,
        message: `Missing required configuration for ${integration}`,
      };
    }

    return {
      success: true,
      message: `${integration} configuration is valid. Connection will be tested when MCP server initializes.`,
    };
  }
}

export default Setting;
