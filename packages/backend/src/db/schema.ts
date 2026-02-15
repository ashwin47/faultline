import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

const timestamp = (name: string) =>
  integer(name, { mode: 'timestamp' }).$defaultFn(() => new Date());

// ── Users ──

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
  emailVerificationToken: text('email_verification_token'),
  emailVerificationExpiresAt: integer('email_verification_expires_at', { mode: 'timestamp' }),
  lastActiveAccountId: text('last_active_account_id'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export type UserSelect = InferSelectModel<typeof users>;
export type UserInsert = InferInsertModel<typeof users>;

// ── Accounts (workspaces / tenants) ──

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export type AccountSelect = InferSelectModel<typeof accounts>;
export type AccountInsert = InferInsertModel<typeof accounts>;

// ── Account Members ──

export const accountMembers = sqliteTable(
  'account_members',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull().references(() => accounts.id),
    userId: text('user_id').notNull().references(() => users.id),
    role: text('role').notNull(), // 'owner' | 'admin' | 'member'
    createdAt: timestamp('created_at'),
  },
  (table) => [
    index('idx_account_members_account').on(table.accountId),
    index('idx_account_members_user').on(table.userId),
  ],
);

export type AccountMemberSelect = InferSelectModel<typeof accountMembers>;
export type AccountMemberInsert = InferInsertModel<typeof accountMembers>;

// ── Sessions ──

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    lastActiveAt: integer('last_active_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    index('idx_sessions_user').on(table.userId),
  ],
);

export type SessionSelect = InferSelectModel<typeof sessions>;
export type SessionInsert = InferInsertModel<typeof sessions>;

// ── System KV ──

export const systemKv = sqliteTable('system_kv', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type SystemKvSelect = InferSelectModel<typeof systemKv>;
export type SystemKvInsert = InferInsertModel<typeof systemKv>;

// ── Settings (now per-account) ──

export const settings = sqliteTable(
  'settings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: text('account_id').notNull().references(() => accounts.id),
    key: text('key').notNull(),
    value: text('value').notNull(),
    isEncrypted: integer('is_encrypted', { mode: 'boolean' }).default(false),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    uniqueIndex('idx_settings_account_key').on(table.accountId, table.key),
  ],
);

export type SettingSelect = InferSelectModel<typeof settings>;
export type SettingInsert = InferInsertModel<typeof settings>;

// ── Conversations (now per-account) ──

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull().references(() => accounts.id),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    resourceMapId: text('resource_map_id').references(() => resourceMaps.id),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
    title: text('title'),
    messages: text('messages', { mode: 'json' }).$type<unknown[]>().notNull(),
    investigationContext: text('investigation_context', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  },
  (table) => [
    index('idx_conversations_account').on(table.accountId),
    index('idx_conversations_created').on(table.createdAt),
  ],
);

export type ConversationSelect = InferSelectModel<typeof conversations>;
export type ConversationInsert = InferInsertModel<typeof conversations>;

// ── Tool Executions ──

export const toolExecutions = sqliteTable(
  'tool_executions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: text('conversation_id').references(() => conversations.id),
    toolName: text('tool_name').notNull(),
    inputParams: text('input_params', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    outputResult: text('output_result', { mode: 'json' }).$type<unknown>(),
    executionTimeMs: integer('execution_time_ms'),
    status: text('status').notNull(), // 'success' | 'error'
    errorMessage: text('error_message'),
    executedAt: timestamp('executed_at'),
  },
  (table) => [
    index('idx_tool_executions_conversation').on(table.conversationId),
    index('idx_tool_executions_tool').on(table.toolName),
  ],
);

export type ToolExecutionSelect = InferSelectModel<typeof toolExecutions>;
export type ToolExecutionInsert = InferInsertModel<typeof toolExecutions>;

// ── Workspace Invites ──

export const workspaceInvites = sqliteTable(
  'workspace_invites',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull().references(() => accounts.id),
    email: text('email').notNull(),
    role: text('role').notNull(), // 'admin' | 'member'
    invitedByUserId: text('invited_by_user_id').notNull().references(() => users.id),
    token: text('token').unique().notNull(),
    status: text('status').notNull(), // 'pending' | 'accepted' | 'expired'
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    index('idx_workspace_invites_account').on(table.accountId),
    index('idx_workspace_invites_token').on(table.token),
  ],
);

export type WorkspaceInviteSelect = InferSelectModel<typeof workspaceInvites>;
export type WorkspaceInviteInsert = InferInsertModel<typeof workspaceInvites>;

// ── Resource Maps ──

export const resourceMaps = sqliteTable(
  'resource_maps',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull().references(() => accounts.id),
    name: text('name').notNull(),
    description: text('description'),
    nodes: text('nodes', { mode: 'json' }).$type<unknown[]>().notNull(),
    edges: text('edges', { mode: 'json' }).$type<unknown[]>().notNull(),
    groups: text('groups', { mode: 'json' }).$type<unknown[]>(),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    index('idx_resource_maps_account').on(table.accountId),
  ],
);

export type ResourceMapSelect = InferSelectModel<typeof resourceMaps>;
export type ResourceMapInsert = InferInsertModel<typeof resourceMaps>;
