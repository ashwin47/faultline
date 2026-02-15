import { eq } from 'drizzle-orm';
import { getDatabase } from '../../config/database';
import { sessions } from '../../db/schema';
import type { SessionSelect } from '../../db/schema';

export class Session {
  static create(data: {
    id: string;
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): SessionSelect {
    const db = getDatabase();
    return db
      .insert(sessions)
      .values({
        id: data.id,
        userId: data.userId,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        lastActiveAt: new Date(),
        createdAt: new Date(),
      })
      .returning()
      .get();
  }

  static findById(id: string): SessionSelect | undefined {
    const db = getDatabase();
    return db.select().from(sessions).where(eq(sessions.id, id)).get();
  }

  static findByUserId(userId: string): SessionSelect[] {
    const db = getDatabase();
    return db.select().from(sessions).where(eq(sessions.userId, userId)).all();
  }

  static delete(id: string): void {
    const db = getDatabase();
    db.delete(sessions).where(eq(sessions.id, id)).run();
  }

  static deleteAllForUser(userId: string): void {
    const db = getDatabase();
    db.delete(sessions).where(eq(sessions.userId, userId)).run();
  }

  static updateLastActive(id: string): void {
    const db = getDatabase();
    db.update(sessions)
      .set({ lastActiveAt: new Date() })
      .where(eq(sessions.id, id))
      .run();
  }
}
