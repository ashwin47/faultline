import OpenAI from 'openai';
import { Setting } from '../models/setting.model';
import { MCPClientManager } from '../../lib/integrations/mcp/client-manager';
import { InvestigationContext, type InvestigationContextSnapshot } from './investigation-context';
import { logger } from '../../lib/utils/logger';
import { config } from '../../config/environment';
import type { Message as AppMessage, ToolUse, ResourceMap } from '../../types/index';
import type { EvaluationResult } from '../jobs/agent-events';
import { createAgent } from './agents';

export interface StreamEventHandler {
  model?: string;
  onTextDelta?: (text: string, agentId?: string) => void;
  onToolUse?: (toolUse: ToolUse) => void;
  onIterationStart?: (iteration: number) => void;
  onReasoning?: (iteration: number, evaluation: EvaluationResult) => void;
  onSubAgentStart?: (agentId: string, agentType: string, task: string) => void;
  onSubAgentComplete?: (agentId: string, findings: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  onTokenUsage?: (tokens: { input: number; output: number }) => void;
  onContextUpdate?: (snapshot: InvestigationContextSnapshot) => void;
}

export interface SendMessageOptions {
  persistedContext?: InvestigationContextSnapshot | null;
  resourceMaps?: ResourceMap[];
}

export class OpenAIAgent {
  private client: OpenAI | null = null;
  private abortController: AbortController | null = null;
  private mcp: MCPClientManager | null = null;
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  private init(): void {
    if (this.client) return;

    const apiKey = Setting.get(this.accountId, 'openai.api_key');

    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Please enter your API key in Settings.');
    }

    if (!apiKey.startsWith('sk-')) {
      throw new Error('Failed to decrypt OpenAI API key. Please re-enter your API key in Settings.');
    }

    this.client = new OpenAI({ apiKey });
    logger.info('OpenAI agent initialized');
  }

  private getEnabledIntegrations(): string[] {
    const status = Setting.integrationStatus(this.accountId);
    const enabled: string[] = [];

    if (status.newrelic) enabled.push('newrelic');
    if (status.sentry) enabled.push('sentry');
    if (status.aws) enabled.push('aws');
    if (status.github) enabled.push('github');
    if (status.pagerduty) enabled.push('pagerduty');

    return enabled;
  }

  /**
   * Run the multi-agent orchestration loop.
   *
   * Initializes MCP connections and OpenAI client, then delegates to the
   * OrchestratorAgent which dispatches work to domain-specific sub-agents.
   */
  async sendMessage(
    messages: AppMessage[],
    eventHandler: StreamEventHandler,
    options?: SendMessageOptions,
  ): Promise<void> {
    this.init();

    // Connect MCP servers on-demand for this agent run
    this.mcp = new MCPClientManager(this.accountId);
    await this.mcp.initialize();

    const enabledIntegrations = this.getEnabledIntegrations();
    const mcpStats = this.mcp!.getStats();
    const model = eventHandler.model || config.openai.model;

    logger.info(
      {
        enabledIntegrations,
        connectedServers: mcpStats.connectedServers,
        totalTools: mcpStats.totalTools,
        messageCount: messages.length,
        model,
      },
      'Starting multi-agent orchestration',
    );

    this.abortController = new AbortController();

    // Build investigation context (used by sub-agents for time-aware tools)
    const userMessages = messages.filter(m => m.role === 'user');
    let ctx: InvestigationContext;

    if (options?.persistedContext) {
      ctx = InvestigationContext.fromJSON(options.persistedContext);
      const lastUserMsg = userMessages[userMessages.length - 1];
      if (lastUserMsg) {
        const probe = new InvestigationContext();
        probe.parseUserMessage(lastUserMsg.content);
        if (probe.timeWindow.extracted) {
          ctx.timeWindow = probe.timeWindow;
        }
      }
    } else {
      ctx = new InvestigationContext();
      ctx.parseAllUserMessages(messages);
    }

    try {
      // Create the orchestrator with sub-agents via factory
      const orchestrator = createAgent({
        client: this.client!,
        model,
        mcp: this.mcp!,
        abortSignal: this.abortController.signal,
        accountId: this.accountId,
        enabledIntegrations,
        investigationContext: ctx,
        resourceMaps: options?.resourceMaps,
      });

      // Run the orchestrator loop
      await orchestrator.run(messages, eventHandler, {
        persistedContext: options?.persistedContext,
      });
    } finally {
      this.abortController = null;
      if (this.mcp) {
        await this.mcp.dispose();
        this.mcp = null;
      }
    }
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      logger.info('Aborting agent request');
    }
  }
}
