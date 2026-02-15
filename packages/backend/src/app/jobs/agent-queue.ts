import { Queue } from 'bullmq';
import { createRedisConnection } from '../../config/redis';
import type { Message } from '../../types/index';
import type { InvestigationContextSnapshot } from '../services/investigation-context';

export interface AgentJobData {
  conversationId: string;
  accountId: string;
  userMessage: string;
  model?: string;
  messages: Message[];
  persistedContext: InvestigationContextSnapshot | null;
  hasTitle: boolean;
}

let queue: Queue<AgentJobData> | null = null;

export function getAgentQueue(): Queue<AgentJobData> {
  if (!queue) {
    queue = new Queue<AgentJobData>('agent-runs', {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 1, // Don't auto-retry agent runs — user can resend
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return queue!;
}

/**
 * Enqueue an agent run. Returns the job ID used for event routing.
 */
export async function enqueueAgentRun(data: AgentJobData): Promise<string> {
  const q = getAgentQueue();
  const job = await q.add('agent-run', data, {
    jobId: `agent-${data.conversationId}-${Date.now()}`,
  });
  return job.id!;
}

export async function closeAgentQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
