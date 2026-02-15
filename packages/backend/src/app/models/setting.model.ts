import { eq, and } from 'drizzle-orm';
import { getDatabase, getEncryptionKey } from '../../config/database';
import { settings } from '../../db/schema';
import { encrypt, decrypt, maskValue } from '../../lib/utils/encryption';
import type { Settings, IntegrationStatus } from '../../types/index';

export class Setting {
  private static readonly ENCRYPTED_KEYS = [
    'openai.api_key',
    'newrelic.api_key',
    'sentry.auth_token',
    'aws.access_key_id',
    'aws.secret_access_key',
    'github.token',
    'pagerduty.api_key',
  ];

  private static shouldEncrypt(key: string): boolean {
    return Setting.ENCRYPTED_KEYS.includes(key);
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
    const allSettings = Setting.all(accountId, false);

    return {
      openai: !!allSettings['openai.api_key'],
      newrelic: !!allSettings['newrelic.api_key'] && !!allSettings['newrelic.account_id'],
      sentry: !!allSettings['sentry.auth_token'] && !!allSettings['sentry.org'],
      aws: !!allSettings['aws.access_key_id'] && !!allSettings['aws.secret_access_key'],
      github: !!allSettings['github.token'] && !!allSettings['github.owner'] && !!allSettings['github.repo'],
      pagerduty: !!allSettings['pagerduty.api_key'],
    };
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
