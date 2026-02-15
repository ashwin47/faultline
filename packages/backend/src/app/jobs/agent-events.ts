import type { ToolUse } from '../../types/index';

/**
 * Structured evaluation produced by the agent's self-assessment step.
 */
export interface EvaluationResult {
  status: 'continue' | 'complete';
  confidence: number;
  summary: string;
  next_steps: string[];
}

/**
 * Events published by the worker over Redis pub/sub,
 * consumed by the WebSocket layer and forwarded to clients.
 */
export type AgentJobEvent =
  | { type: 'thinking' }
  | { type: 'conversation_created'; conversationId: string }
  | { type: 'iteration_start'; iteration: number }
  | { type: 'reasoning'; iteration: number; evaluation: EvaluationResult }
  | { type: 'text_delta'; text: string; agentId?: string }
  | { type: 'tool_use'; toolUse: ToolUse }
  | { type: 'sub_agent_start'; agentId: string; agentType: string; task: string }
  | { type: 'sub_agent_complete'; agentId: string; findings: string }
  | { type: 'token_usage'; inputTokens: number; outputTokens: number; totalTokens: number }
  | { type: 'response_complete'; conversationId: string; tokenUsage: { input: number; output: number } | null }
  | { type: 'title_generated'; conversationId: string; title: string }
  | { type: 'error'; error: string }
  | { type: 'stopped'; message: string };

/** Redis pub/sub channel for streaming events from worker → websocket */
export function eventChannel(jobId: string): string {
  return `agent:events:${jobId}`;
}

/** Redis pub/sub channel for cancel signals from websocket → worker */
export function cancelChannel(jobId: string): string {
  return `agent:cancel:${jobId}`;
}
