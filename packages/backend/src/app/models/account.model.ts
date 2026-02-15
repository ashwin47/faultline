import { eq, and } from 'drizzle-orm';
import { getDatabase } from '../../config/database';
import { accounts, accountMembers, users } from '../../db/schema';
import type { AccountSelect, AccountMemberSelect } from '../../db/schema';

export class Account {
  static findById(id: string): AccountSelect | undefined {
    const db = getDatabase();
    return db.select().from(accounts).where(eq(accounts.id, id)).get();
  }

  static findBySlug(slug: string): AccountSelect | undefined {
    const db = getDatabase();
    return db.select().from(accounts).where(eq(accounts.slug, slug)).get();
  }

  static create(data: { id: string; name: string; slug: string }): AccountSelect {
    const db = getDatabase();
    return db
      .insert(accounts)
      .values({
        id: data.id,
        name: data.name,
        slug: data.slug,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()
      .get();
  }

  static addMember(data: {
    id: string;
    accountId: string;
    userId: string;
    role: string;
  }): AccountMemberSelect {
    const db = getDatabase();
    return db
      .insert(accountMembers)
      .values({
        id: data.id,
        accountId: data.accountId,
        userId: data.userId,
        role: data.role,
        createdAt: new Date(),
      })
      .returning()
      .get();
  }

  static getMemberRole(accountId: string, userId: string): string | undefined {
    const db = getDatabase();
    const row = db
      .select({ role: accountMembers.role })
      .from(accountMembers)
      .where(and(eq(accountMembers.accountId, accountId), eq(accountMembers.userId, userId)))
      .get();
    return row?.role;
  }

  static getMembers(accountId: string): AccountMemberSelect[] {
    const db = getDatabase();
    return db
      .select()
      .from(accountMembers)
      .where(eq(accountMembers.accountId, accountId))
      .all();
  }

  static getUserAccounts(userId: string): Array<AccountSelect & { role: string }> {
    const db = getDatabase();
    const memberships = db
      .select()
      .from(accountMembers)
      .where(eq(accountMembers.userId, userId))
      .all();

    return memberships.map((m) => {
      const account = db.select().from(accounts).where(eq(accounts.id, m.accountId)).get()!;
      return { ...account, role: m.role };
    });
  }

  static updateName(id: string, name: string, slug: string): void {
    const db = getDatabase();
    db.update(accounts)
      .set({ name, slug, updatedAt: new Date() })
      .where(eq(accounts.id, id))
      .run();
  }

  static removeMember(accountId: string, userId: string): void {
    const db = getDatabase();
    db.delete(accountMembers)
      .where(and(eq(accountMembers.accountId, accountId), eq(accountMembers.userId, userId)))
      .run();
  }

  static updateMemberRole(accountId: string, userId: string, role: string): void {
    const db = getDatabase();
    db.update(accountMembers)
      .set({ role })
      .where(and(eq(accountMembers.accountId, accountId), eq(accountMembers.userId, userId)))
      .run();
  }

  static getMembersWithUsers(accountId: string): Array<{
    id: string;
    userId: string;
    email: string;
    name: string;
    role: string;
    joinedAt: Date | null;
  }> {
    const db = getDatabase();
    const rows = db
      .select({
        id: accountMembers.id,
        userId: accountMembers.userId,
        email: users.email,
        name: users.name,
        role: accountMembers.role,
        joinedAt: accountMembers.createdAt,
      })
      .from(accountMembers)
      .innerJoin(users, eq(accountMembers.userId, users.id))
      .where(eq(accountMembers.accountId, accountId))
      .all();
    return rows;
  }
}
