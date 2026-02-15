import OpenAI from 'openai';
import { MCPClientManager } from '../../../lib/integrations/mcp/client-manager';
import { toolRegistry } from '../../../lib/integrations/tool-registry';
import { ToolContext } from '../../../lib/integrations/tool-context';
import { InvestigationContext } from '../investigation-context';
import { logger } from '../../../lib/utils/logger';
import type { ToolUse } from '../../../types/index';

// ── Types ────────────────────────────────────────────────────────

export type SubAgentType = 'apm' | 'error_monitoring' | 'infrastructure' | 'alerting';

export interface SubAgentResult {
  agentId: SubAgentType;
  findings: string;
  toolsUsed: ToolUse[];
  iterations: number;
  tokenUsage: { input: number; output: number };
}

export interface SubAgentEventHandler {
  onToolUse?: (toolUse: ToolUse) => void;
  onTextDelta?: (agentId: string, text: string) => void;
}

export interface ResponsesTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: boolean;
}

export interface SubAgentConfig {
  client: OpenAI;
  model: string;
  mcp: MCPClientManager;
  investigationContext: InvestigationContext;
  abortSignal: AbortSignal;
  accountId: string;
  enabledIntegrations: string[];
}

// ── Constants ────────────────────────────────────────────────────

const MAX_SUB_AGENT_ITERATIONS = 5;
const MAX_TOOL_RESULT_CHARS = 30_000;

const TIME_AWARE_TOOLS = new Set<string>([
  // Custom tools that accept start_time/end_time params — auto-filled from context
]);

// ── BaseSubAgent ─────────────────────────────────────────────────

export abstract class BaseSubAgent {
  abstract readonly agentId: SubAgentType;
  abstract readonly agentType: string;

  protected config: SubAgentConfig;

  /**
   * Cache of tool results keyed by `toolName::JSON(args)`.
   * Persists across orchestrator iterations (sub-agent instances are reused)
   * so the same query is never executed twice.
   */
  private toolCache = new Map<string, { output: string; executionTimeMs: number }>();

  constructor(config: SubAgentConfig) {
    this.config = config;
  }

  // ── Abstract: each sub-agent defines its own tools & prompt ──

  /** Domain-specific tools (New Relic MCP, Sentry MCP, AWS SDK, PagerDuty MCP). */
  protected abstract getOwnTools(): ResponsesTool[];

  /** Domain-specific system prompt. */
  abstract getSystemPrompt(): string;

  // ── Tool helpers available to sub-classes ─────────────────────

  /** Get MCP tools for a specific integration, formatted for the Responses API. */
  protected getMCPTools(integration: string): ResponsesTool[] {
    const mcpTools = this.config.mcp.getToolsForIntegrations([integration]);
    return mcpTools.map((tool) => ({
      type: 'function' as const,
      name: tool.name,
      description: tool.description || '',
      parameters: (tool.inputSchema || {}) as Record<string, unknown>,
      strict: false,
    }));
  }

  /** Get custom SDK tools from the tool registry, formatted for the Responses API. */
  protected getRegistryTools(): ResponsesTool[] {
    const registryTools = toolRegistry.toOpenAITools() as Array<{
      type: 'function';
      function: { name: string; description: string; parameters: Record<string, unknown> };
    }>;
    return registryTools.map((t) => ({
      type: 'function' as const,
      name: t.function.name,
      description: t.function.description || '',
      parameters: t.function.parameters || {},
      strict: false,
    }));
  }

  /** Get custom SDK tools for a specific category, formatted for the Responses API. */
  protected getRegistryToolsByCategory(category: string): ResponsesTool[] {
    const registryTools = toolRegistry.toOpenAIToolsByCategory(category) as Array<{
      type: 'function';
      function: { name: string; description: string; parameters: Record<string, unknown> };
    }>;
    return registryTools.map((t) => ({
      type: 'function' as const,
      name: t.function.name,
      description: t.function.description || '',
      parameters: t.function.parameters || {},
      strict: false,
    }));
  }

  /**
   * Full tool list: domain tools + shared tools (GitHub).
   * GitHub tools are included for all sub-agents since any investigation
   * may need to read source code from stack traces.
   */
  getTools(): ResponsesTool[] {
    const own = this.getOwnTools();
    const shared: ResponsesTool[] = [];

    if (this.config.enabledIntegrations.includes('github')) {
      shared.push(...this.getMCPTools('github'));
    }

    return [...own, ...shared];
  }

  // ── Run loop ─────────────────────────────────────────────────

  /**
   * Run the sub-agent's single-pass tool execution loop.
   * Executes tools for up to MAX_SUB_AGENT_ITERATIONS, then returns findings.
   */
  async run(task: string, eventHandler: SubAgentEventHandler): Promise<SubAgentResult> {
    const { client, model, investigationContext: ctx, abortSignal } = this.config;
    const tools = this.getTools();
    const systemPrompt = this.getSystemPrompt();

    const inputItems: any[] = [
      { role: 'user', content: task },
    ];

    // Inject investigation context if available
    const ctxMsg = ctx.buildContextMessage();
    if (ctxMsg) {
      inputItems.unshift({
        role: 'developer',
        content: `[Investigation Context]\n${ctxMsg}`,
      });
    }

    const allToolUses: ToolUse[] = [];
    let fullText = '';
    const totalTokens = { input: 0, output: 0 };

    for (let iteration = 0; iteration < MAX_SUB_AGENT_ITERATIONS; iteration++) {
      const toolChoice: 'auto' | 'required' = (iteration === 0 && tools.length > 0) ? 'required' : 'auto';

      const stream = await client.responses.create(
        {
          model,
          instructions: systemPrompt,
          input: inputItems,
          tools: tools.length > 0 ? tools as any : undefined,
          tool_choice: tools.length > 0 ? toolChoice : undefined,
          stream: true,
        },
        { signal: abortSignal },
      );

      let iterationText = '';
      const functionCalls: Array<{ call_id: string; name: string; arguments: string }> = [];
      let completedResponse: any = null;

      for await (const event of stream) {
        switch (event.type) {
          case 'response.output_text.delta':
            iterationText += event.delta;
            fullText += event.delta;
            eventHandler.onTextDelta?.(this.agentId, event.delta);
            break;

          case 'response.output_item.added':
            if (event.item.type === 'function_call') {
              const item = event.item as any;
              const toolUse: ToolUse = {
                id: item.call_id,
                name: item.name,
                integration: toolRegistry.has(item.name)
                  ? (toolRegistry.get(item.name)?.category || 'custom')
                  : (this.config.mcp.getToolServer(item.name) || undefined),
                input: {},
                status: 'running',
                agentId: this.agentId,
              };
              allToolUses.push(toolUse);
              eventHandler.onToolUse?.(toolUse);
            }
            break;

          case 'response.completed':
            completedResponse = event.response;
            break;
        }
      }

      // Track token usage
      if (completedResponse?.usage) {
        totalTokens.input += completedResponse.usage.input_tokens ?? 0;
        totalTokens.output += completedResponse.usage.output_tokens ?? 0;
      }

      // Extract function calls from completed response
      if (completedResponse?.output) {
        for (const item of completedResponse.output) {
          if (item.type === 'function_call') {
            functionCalls.push({
              call_id: item.call_id,
              name: item.name,
              arguments: item.arguments,
            });
          }
        }
      }

      logger.debug(
        { agentId: this.agentId, iteration, text: iterationText.length, tools: functionCalls.length },
        'Sub-agent iteration complete',
      );

      // No function calls → sub-agent produced text output, done
      if (functionCalls.length === 0) {
        return {
          agentId: this.agentId,
          findings: fullText,
          toolsUsed: allToolUses,
          iterations: iteration + 1,
          tokenUsage: totalTokens,
        };
      }

      // Append all response output items to input for next turn
      if (completedResponse?.output) {
        for (const item of completedResponse.output) {
          inputItems.push(item);
        }
      }

      // Execute tool calls
      await this.executeToolCalls(functionCalls, inputItems, ctx, eventHandler, allToolUses);
    }

    // Hit max iterations — return what we have
    return {
      agentId: this.agentId,
      findings: fullText || 'Sub-agent reached maximum iterations without producing a text summary.',
      toolsUsed: allToolUses,
      iterations: MAX_SUB_AGENT_ITERATIONS,
      tokenUsage: totalTokens,
    };
  }

  // ── Tool execution ───────────────────────────────────────────

  private async executeToolCalls(
    functionCalls: Array<{ call_id: string; name: string; arguments: string }>,
    inputItems: any[],
    ctx: InvestigationContext,
    eventHandler: SubAgentEventHandler,
    allToolUses: ToolUse[],
  ): Promise<void> {
    const { mcp, abortSignal, accountId } = this.config;

    for (const fc of functionCalls) {
      const toolName = fc.name;
      const isCustomTool = toolRegistry.has(toolName);
      const integration = isCustomTool ? (toolRegistry.get(toolName)?.category || 'custom') : (mcp.getToolServer(toolName) || undefined);
      let toolArgs: Record<string, unknown>;

      try {
        toolArgs = JSON.parse(fc.arguments);
      } catch {
        inputItems.push({
          type: 'function_call_output',
          call_id: fc.call_id,
          output: `TOOL ERROR — Could not parse arguments as JSON. Raw: ${fc.arguments}\n\nRetry this tool call with valid JSON arguments.`,
        });
        this.emitToolUpdate(allToolUses, eventHandler, {
          id: fc.call_id,
          name: toolName,
          integration,
          input: {},
          status: 'error',
          error: 'Invalid JSON arguments',
          agentId: this.agentId,
        });
        continue;
      }

      // Auto-fill time params from investigation context
      if (TIME_AWARE_TOOLS.has(toolName) && ctx.timeWindow.start && ctx.timeWindow.end) {
        if (!toolArgs.start_time) {
          const paddedStart = new Date(ctx.timeWindow.start.getTime() - 30 * 60 * 1000);
          toolArgs.start_time = paddedStart.toISOString();
        }
        if (!toolArgs.end_time) {
          toolArgs.end_time = ctx.timeWindow.end.toISOString();
        }
      }

      // ── Cache check: skip execution if same tool+args already ran ──
      const cacheKey = `${toolName}::${JSON.stringify(toolArgs)}`;
      const cached = this.toolCache.get(cacheKey);

      if (cached) {
        logger.debug({ agentId: this.agentId, tool: toolName }, 'Tool cache hit — returning cached result');

        inputItems.push({
          type: 'function_call_output',
          call_id: fc.call_id,
          output: cached.output,
        });

        this.emitToolUpdate(allToolUses, eventHandler, {
          id: fc.call_id,
          name: toolName,
          integration,
          input: toolArgs,
          output: cached.output,
          status: 'success',
          executionTimeMs: cached.executionTimeMs,
          agentId: this.agentId,
        });

        continue;
      }

      const startTime = Date.now();

      this.emitToolUpdate(allToolUses, eventHandler, {
        id: fc.call_id,
        name: toolName,
        integration,
        input: toolArgs,
        status: 'running',
        agentId: this.agentId,
      });

      try {
        let content: string;

        if (isCustomTool) {
          const toolCtx = new ToolContext({
            sessionId: 'agent',
            messageId: fc.call_id,
            agentName: `${this.agentId}-agent`,
            abort: abortSignal,
            messages: [],
            accountId,
          });
          const toolResult = await toolRegistry.execute(toolName, toolArgs, toolCtx);
          content = toolResult.output;
        } else {
          const result = await mcp.callTool(toolName, toolArgs);
          content = JSON.stringify(result);
        }

        const executionTime = Date.now() - startTime;

        if (content.length > MAX_TOOL_RESULT_CHARS) {
          content = content.substring(0, MAX_TOOL_RESULT_CHARS)
            + `\n\n[... truncated ${content.length - MAX_TOOL_RESULT_CHARS} chars — request specific fields for more detail]`;
        }

        if (ctx.timeWindow.start && ctx.timeWindow.end) {
          content += `\n\n[Investigation window: ${ctx.timeWindow.start.toISOString()} to ${ctx.timeWindow.end.toISOString()}]`;
        }

        // Cache the successful result
        this.toolCache.set(cacheKey, { output: content, executionTimeMs: executionTime });

        inputItems.push({
          type: 'function_call_output',
          call_id: fc.call_id,
          output: content,
        });

        this.emitToolUpdate(allToolUses, eventHandler, {
          id: fc.call_id,
          name: toolName,
          integration,
          input: toolArgs,
          output: content,
          status: 'success',
          executionTimeMs: executionTime,
          agentId: this.agentId,
        });

        ctx.extractFromToolResult(toolName, integration, toolArgs, content);
        logger.debug({ agentId: this.agentId, tool: toolName, chars: content.length, ms: executionTime }, 'Tool executed');
      } catch (error: any) {
        const executionTime = Date.now() - startTime;

        inputItems.push({
          type: 'function_call_output',
          call_id: fc.call_id,
          output: `TOOL ERROR — ${toolName} failed: ${error.message}\n\nThis does NOT mean there is no data. The tool call itself failed. Try again with different parameters, or use an alternative tool.`,
        });

        this.emitToolUpdate(allToolUses, eventHandler, {
          id: fc.call_id,
          name: toolName,
          integration,
          input: toolArgs,
          status: 'error',
          error: error.message,
          executionTimeMs: executionTime,
          agentId: this.agentId,
        });

        logger.debug({ agentId: this.agentId, tool: toolName, error: error.message, ms: executionTime }, 'Tool failed');
      }
    }
  }

  private emitToolUpdate(
    allToolUses: ToolUse[],
    eventHandler: SubAgentEventHandler,
    toolUse: ToolUse,
  ): void {
    const idx = allToolUses.findIndex(t => t.id === toolUse.id);
    if (idx >= 0) {
      allToolUses[idx] = toolUse;
    }
    eventHandler.onToolUse?.(toolUse);
  }
}
