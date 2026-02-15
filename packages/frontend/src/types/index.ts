// Core types for the frontend (matching backend types)

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date | string;
  toolUses?: ToolUse[];
  reasoning?: Array<{ iteration: number; evaluation: EvaluationResult }>;
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
  createdAt: Date | string;
  updatedAt: Date | string;
  messageCount?: number;
}

export interface Settings {
  // OpenAI
  'openai.api_key'?: string;

  // New Relic
  'newrelic.api_key'?: string;
  'newrelic.account_id'?: string;
  'newrelic.region'?: string; // "us" (default) or "eu"
  'newrelic.app_ids'?: string;

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

// Auth types
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthAccount {
  id: string;
  name: string;
  slug: string;
  role?: string;
}

// Agent evaluation result from self-assessment
export interface EvaluationResult {
  status: 'continue' | 'complete';
  confidence: number;
  summary: string;
  next_steps: string[];
}

// WebSocket events
export interface AgentIterationStartEvent {
  iteration: number;
}

export interface AgentReasoningEvent {
  iteration: number;
  evaluation: EvaluationResult;
}

export interface AgentTextDeltaEvent {
  text: string;
  agentId?: string;
}

export interface AgentToolUseEvent {
  toolUse: ToolUse;
}

export interface AgentErrorEvent {
  error: string;
}

export interface AgentResponseCompleteEvent {
  conversationId: string;
}

export interface AgentConversationCreatedEvent {
  conversationId: string;
}

export interface AgentSubAgentStartEvent {
  agentId: string;
  agentType: string;
  task: string;
}

export interface AgentSubAgentCompleteEvent {
  agentId: string;
  findings: string;
}

export interface AgentTitleGeneratedEvent {
  conversationId: string;
  title: string;
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
  lastSyncedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ResourceMapSummary {
  id: string;
  name: string;
  description?: string | null;
  nodeCount: number;
  edgeCount: number;
  lastSyncedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}
