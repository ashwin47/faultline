import { eq, desc, asc, and } from 'drizzle-orm';
import { getDatabase } from '../../config/database';
import { conversations, toolExecutions } from '../../db/schema';
import type { Conversation as ConversationType, Message, ToolExecutionLog } from '../../types/index';
import type { InvestigationContextSnapshot } from '../services/investigation-context';
import { v4 as uuidv4 } from 'uuid';

export class Conversation {
  static create(accountId: string, userId?: string, title?: string): ConversationType {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date();

    const row = db
      .insert(conversations)
      .values({
        id,
        accountId,
        createdByUserId: userId || null,
        title: title || null,
        messages: [],
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return {
      id: row.id,
      title: row.title,
      messages: row.messages as Message[],
      resourceMapId: row.resourceMapId,
      createdAt: row.createdAt!,
      updatedAt: row.updatedAt!,
    };
  }

  static find(accountId: string, id: string): ConversationType | null {
    const db = getDatabase();
    const row = db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.accountId, accountId)))
      .get();

    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      messages: row.messages as Message[],
      resourceMapId: row.resourceMapId,
      createdAt: row.createdAt!,
      updatedAt: row.updatedAt!,
    };
  }

  static setResourceMapId(accountId: string, conversationId: string, resourceMapId: string): void {
    const db = getDatabase();
    db.update(conversations)
      .set({ resourceMapId, updatedAt: new Date() })
      .where(and(eq(conversations.id, conversationId), eq(conversations.accountId, accountId)))
      .run();
  }

  static all(accountId: string): Array<Omit<ConversationType, 'messages'> & { messageCount: number }> {
    const db = getDatabase();
    const rows = db
      .select()
      .from(conversations)
      .where(eq(conversations.accountId, accountId))
      .orderBy(desc(conversations.updatedAt))
      .all();

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt!,
      updatedAt: row.updatedAt!,
      messageCount: (row.messages as unknown[]).length,
    }));
  }

  static addMessage(accountId: string, conversationId: string, message: Message): void {
    const conversation = Conversation.find(accountId, conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const db = getDatabase();
    db.update(conversations)
      .set({
        messages: [...conversation.messages, message] as unknown[],
        updatedAt: new Date(),
      })
      .where(and(eq(conversations.id, conversationId), eq(conversations.accountId, accountId)))
      .run();
  }

  static updateTitle(accountId: string, conversationId: string, title: string): void {
    const db = getDatabase();
    db.update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(and(eq(conversations.id, conversationId), eq(conversations.accountId, accountId)))
      .run();
  }

  static destroy(accountId: string, conversationId: string): void {
    const db = getDatabase();

    db.delete(toolExecutions)
      .where(eq(toolExecutions.conversationId, conversationId))
      .run();

    db.delete(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.accountId, accountId)))
      .run();
  }

  static logToolExecution(log: ToolExecutionLog): void {
    const db = getDatabase();
    db.insert(toolExecutions)
      .values({
        conversationId: log.conversationId,
        toolName: log.toolName,
        inputParams: log.inputParams,
        outputResult: log.outputResult ?? null,
        executionTimeMs: log.executionTimeMs ?? null,
        status: log.status,
        errorMessage: log.errorMessage ?? null,
        executedAt: log.executedAt || new Date(),
      })
      .run();
  }

  static getToolExecutions(conversationId: string): ToolExecutionLog[] {
    const db = getDatabase();
    const rows = db
      .select()
      .from(toolExecutions)
      .where(eq(toolExecutions.conversationId, conversationId))
      .orderBy(asc(toolExecutions.executedAt))
      .all();

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId!,
      toolName: row.toolName,
      inputParams: row.inputParams as Record<string, unknown>,
      outputResult: row.outputResult ?? undefined,
      executionTimeMs: row.executionTimeMs ?? undefined,
      status: row.status as 'success' | 'error',
      errorMessage: row.errorMessage ?? undefined,
      executedAt: row.executedAt!,
    }));
  }

  static saveContext(accountId: string, conversationId: string, snapshot: InvestigationContextSnapshot): void {
    const db = getDatabase();
    db.update(conversations)
      .set({ investigationContext: snapshot as unknown as Record<string, unknown> })
      .where(and(eq(conversations.id, conversationId), eq(conversations.accountId, accountId)))
      .run();
  }

  static loadContext(accountId: string, conversationId: string): InvestigationContextSnapshot | null {
    const db = getDatabase();
    const row = db
      .select({ investigationContext: conversations.investigationContext })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.accountId, accountId)))
      .get();

    if (!row?.investigationContext) return null;

    return row.investigationContext as unknown as InvestigationContextSnapshot;
  }
}

export default Conversation;
