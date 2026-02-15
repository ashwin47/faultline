import { Worker, Job } from 'bullmq';
import type IORedis from 'ioredis';
import { createRedisConnection, closeRedisConnection } from '../../config/redis';
import { eventChannel, cancelChannel } from './agent-events';
import type { AgentJobData } from './agent-queue';
import type { AgentJobEvent } from './agent-events';
import { OpenAIAgent } from '../services/agent.service';
import { Conversation } from '../models/conversation.model';
import { ResourceMapModel } from '../models/resource-map.model';
import { Setting } from '../models/setting.model';
import { config } from '../../config/environment';
import { logger } from '../../lib/utils/logger';
import type { Message, ToolUse } from '../../types/index';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';

let worker: Worker<AgentJobData> | null = null;
let pubConnection: IORedis | null = null;

async function processAgentJob(job: Job<AgentJobData>): Promise<void> {
  const { conversationId, accountId, userMessage, model, messages, persistedContext, hasTitle } = job.data;
  const jobId = job.id!;

  // Load all resource maps with groups for the account
  const resourceMaps = ResourceMapModel.allWithGroups(accountId);

  const publish = (event: AgentJobEvent) => {
    pubConnection!.publish(eventChannel(jobId), JSON.stringify(event));
  };

  // Per-job agent instance so concurrent jobs get independent AbortControllers
  const agent = new OpenAIAgent(accountId);

  // Subscribe to cancel signals for this job
  const cancelSub = createRedisConnection();
  await cancelSub.subscribe(cancelChannel(jobId));
  cancelSub.on('message', (_channel: string, _msg: string) => {
    logger.info({ jobId }, 'Cancel signal received');
    agent.cancel();
  });

  publish({ type: 'thinking' });

  let responseText = '';
  const toolUses: ToolUse[] = [];
  let tokenUsage: { input: number; output: number } | null = null;

  try {
    await agent.sendMessage(
      messages,
      {
        model,
        onTextDelta: (text, agentId) => {
          // Skip sub-agent intermediate findings — only keep orchestrator
          // text (direct responses and final answer) to avoid messy output.
          if (agentId) return;
          responseText += text;
          publish({ type: 'text_delta', text });
        },

        onToolUse: (toolUse) => {
          const existingIndex = toolUses.findIndex((t) => t.id === toolUse.id);
          if (existingIndex >= 0) {
            toolUses[existingIndex] = toolUse;
          } else {
            toolUses.push(toolUse);
          }

          publish({ type: 'tool_use', toolUse });

          if (toolUse.status === 'success' || toolUse.status === 'error') {
            try {
              Conversation.logToolExecution({
                conversationId,
                toolName: toolUse.name,
                inputParams: toolUse.input,
                outputResult: toolUse.output,
                executionTimeMs: toolUse.executionTimeMs,
                status: toolUse.status,
                errorMessage: toolUse.error,
                executedAt: new Date(),
              });
            } catch (logErr: any) {
              logger.warn({ conversationId, toolName: toolUse.name, error: logErr.message }, 'Failed to log tool execution');
            }
          }
        },

        onIterationStart: (iteration) => {
          publish({ type: 'iteration_start', iteration });
        },

        onReasoning: (iteration, evaluation) => {
          publish({ type: 'reasoning', iteration, evaluation });
        },

        onSubAgentStart: (agentId, agentType, task) => {
          publish({ type: 'sub_agent_start', agentId, agentType, task });
        },

        onSubAgentComplete: (agentId, findings) => {
          publish({ type: 'sub_agent_complete', agentId, findings });
        },

        onTokenUsage: (tokens) => {
          tokenUsage = tokens;
          publish({
            type: 'token_usage',
            inputTokens: tokens.input,
            outputTokens: tokens.output,
            totalTokens: tokens.input + tokens.output,
          });
        },

        onContextUpdate: (snapshot) => {
          Conversation.saveContext(accountId, conversationId, snapshot);
        },

        onComplete: () => {
          const assistantMessage: Message = {
            id: uuidv4(),
            role: 'assistant',
            content: responseText,
            timestamp: new Date(),
            toolUses: toolUses.length > 0 ? toolUses : undefined,
          };

          Conversation.addMessage(accountId, conversationId, assistantMessage);

          publish({
            type: 'response_complete',
            conversationId,
            tokenUsage,
          });

          if (!hasTitle) {
            generateThreadTitle(accountId, conversationId, userMessage, publish);
          }

          logger.info({ conversationId, tokenUsage }, 'Agent response completed');
        },

        onError: (error) => {
          publish({ type: 'error', error: error.message });
        },
      },
      { persistedContext, resourceMaps }
    );
  } finally {
    await cancelSub.unsubscribe(cancelChannel(jobId));
    await closeRedisConnection(cancelSub);
  }
}

/**
 * Generate a short title for a new conversation.
 */
async function generateThreadTitle(
  accountId: string,
  conversationId: string,
  userMessage: string,
  publish: (event: AgentJobEvent) => void,
): Promise<void> {
  try {
    const apiKey = Setting.get(accountId, 'openai.api_key');
    if (!apiKey) return;

    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: config.openai.summaryModel,
      messages: [
        {
          role: 'system',
          content:
            'Generate a short title (max 6 words) summarizing what the user wants to investigate. ' +
            'This is a conversation with an infrastructure monitoring agent — the user asks about errors, ' +
            'incidents, performance, or services. If the user pastes a URL, the title should describe what ' +
            'they want to know (e.g., "Investigate PagerDuty Incident", "Check New Relic Errors", ' +
            '"Payment Service Health"). Do NOT say you cannot access links. No quotes, no punctuation at the end. ' +
            'Just the title.',
        },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 20,
      temperature: 0,
    });

    const title = response.choices[0]?.message?.content?.trim();
    if (title) {
      Conversation.updateTitle(accountId, conversationId, title);
      publish({ type: 'title_generated', conversationId, title });
      logger.info({ conversationId, title }, 'Thread title generated');
    }
  } catch (err) {
    logger.warn({ err, conversationId }, 'Failed to generate thread title');
  }
}

export function startAgentWorker(): Worker<AgentJobData> {
  pubConnection = createRedisConnection();

  worker = new Worker<AgentJobData>(
    'agent-runs',
    processAgentJob,
    {
      connection: createRedisConnection(),
      concurrency: config.worker.concurrency,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, error: error.message }, 'Agent job failed');
    if (job?.id && pubConnection) {
      pubConnection.publish(
        eventChannel(job.id),
        JSON.stringify({ type: 'error', error: error.message } satisfies AgentJobEvent),
      );
    }
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Agent job completed');
  });

  logger.info({ concurrency: config.worker.concurrency }, 'Agent worker started');
  return worker;
}

export async function stopAgentWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (pubConnection) {
    await closeRedisConnection(pubConnection);
    pubConnection = null;
  }
}
