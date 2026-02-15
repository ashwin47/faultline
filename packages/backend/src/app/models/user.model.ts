import { eq } from 'drizzle-orm';
import { getDatabase } from '../../config/database';
import { users } from '../../db/schema';
import type { UserSelect } from '../../db/schema';

export class User {
  static findById(id: string): UserSelect | undefined {
    const db = getDatabase();
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  static findByEmail(email: string): UserSelect | undefined {
    const db = getDatabase();
    return db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
  }

  static findByVerificationToken(token: string): UserSelect | undefined {
    const db = getDatabase();
    return db.select().from(users).where(eq(users.emailVerificationToken, token)).get();
  }

  static create(data: {
    id: string;
    email: string;
    passwordHash: string;
    name: string;
    emailVerified?: boolean;
    emailVerificationToken?: string;
    emailVerificationExpiresAt?: Date;
  }): UserSelect {
    const db = getDatabase();
    return db
      .insert(users)
      .values({
        id: data.id,
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        name: data.name,
        emailVerified: data.emailVerified ?? false,
        emailVerificationToken: data.emailVerificationToken ?? null,
        emailVerificationExpiresAt: data.emailVerificationExpiresAt ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()
      .get();
  }

  static update(id: string, data: Partial<{
    name: string;
    emailVerified: boolean;
    emailVerificationToken: string | null;
    emailVerificationExpiresAt: Date | null;
    lastActiveAccountId: string | null;
  }>): void {
    const db = getDatabase();
    db.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .run();
  }
}
