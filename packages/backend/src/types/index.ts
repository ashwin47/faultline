// Core types for the application

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolUses?: ToolUse[];
}

export interface ToolUse {
  id: string;
  name: string;
  integration?: string;
  input: Record<string, unknown>;
  output?: unknown;
  status: 'running' | 'success' | 'error';
  error?: string;
  executionTimeMs?: number;
  agentId?: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  messages: Message[];
  resourceMapId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Settings {
  // OpenAI
  'openai.api_key'?: string;

  // New Relic
  'newrelic.api_key'?: string;
  'newrelic.account_id'?: string;
  'newrelic.region'?: string; // "us" (default) or "eu"
  'newrelic.app_ids'?: string; // Comma-separated list

  // Sentry
  'sentry.auth_token'?: string;
  'sentry.org'?: string;
  'sentry.project'?: string;

  // AWS
  'aws.access_key_id'?: string;
  'aws.secret_access_key'?: string;
  'aws.region'?: string;

  // GitHub
  'github.token'?: string;
  'github.owner'?: string;
  'github.repo'?: string;

  // PagerDuty
  'pagerduty.api_key'?: string;

  // App settings
  'app.name'?: string;
  'app.version'?: string;
}

export interface IntegrationStatus {
  openai: boolean;
  newrelic: boolean;
  sentry: boolean;
  aws: boolean;
  github: boolean;
  pagerduty: boolean;
}

export interface ToolExecutionLog {
  id?: number;
  conversationId: string;
  toolName: string;
  inputParams: Record<string, unknown>;
  outputResult?: unknown;
  executionTimeMs?: number;
  status: 'success' | 'error';
  errorMessage?: string;
  executedAt: Date;
}

// Claude Tool Definition
export interface ClaudeToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: {
        type: string;
      };
    }>;
    required?: string[];
  };
}

export type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

export interface ToolRegistry {
  definition: ClaudeToolDefinition;
  handler: ToolHandler;
}

// ── Resource Maps ──

export interface ResourceNode {
  id: string;
  name: string;
  normalizedName: string;
  type: string;
  source: string;
  externalId?: string;
  attrs: Record<string, string>;
  position?: { x: number; y: number };
}

export interface ResourceEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: string;
  label?: string;
  confidence?: number;
}

export interface ResourceGroup {
  id: string;
  name: string;
  nodeIds: string[];
}

export interface ResourceMap {
  id: string;
  name: string;
  description?: string | null;
  nodes: ResourceNode[];
  edges: ResourceEdge[];
  groups: ResourceGroup[];
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourceMapSummary {
  id: string;
  name: string;
  description?: string | null;
  nodeCount: number;
  edgeCount: number;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
