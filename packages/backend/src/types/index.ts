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
  // OpenAI (single instance)
  'openai.api_key'?: string;

  // App settings
  'app.name'?: string;
  'app.version'?: string;

  // Integration keys use indexed format: integration.N.field
  // e.g. sentry.0.auth_token, aws.1.access_key_id
  [key: string]: string | undefined;
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
