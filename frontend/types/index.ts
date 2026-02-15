// Core types for the frontend (matching backend types)

export interface Mention {
  userId: string;
  name: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  messageType: 'text' | 'tool_use' | 'evaluation' | 'note';
  content: string;
  createdAt: Date | string;
  userId?: string;
  toolUses?: ToolUse;
  reasoning?: { iteration: number; evaluation: EvaluationResult };
  mentions?: Mention[];
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

// Settings uses dynamic string keys to support indexed integration instances
// e.g. "aws.0.access_key_id", "aws.1.access_key_id", "openai.api_key"
export type Settings = Record<string, string>;

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
  nextSteps: string[];
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
