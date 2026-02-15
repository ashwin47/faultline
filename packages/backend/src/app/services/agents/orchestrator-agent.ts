import OpenAI from 'openai';
import { MCPClientManager } from '../../../lib/integrations/mcp/client-manager';
import { InvestigationContext, type InvestigationContextSnapshot } from '../investigation-context';
import { logger } from '../../../lib/utils/logger';
import { system } from '../../../prompts/index';
import type { Message as AppMessage, ToolUse, ResourceMap, ResourceNode } from '../../../types/index';
import { normalizeName } from '../../../lib/utils/name-matcher';
import type { EvaluationResult } from '../../jobs/agent-events';
import type { BaseSubAgent, SubAgentType, SubAgentResult } from './base-sub-agent';

// ── Types ────────────────────────────────────────────────────────

export interface OrchestratorEventHandler {
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

export interface OrchestratorConfig {
  client: OpenAI;
  model: string;
  mcp: MCPClientManager;
  abortSignal: AbortSignal;
  accountId: string;
  subAgents: Map<SubAgentType, BaseSubAgent>;
  enabledIntegrations: string[];
  resourceMaps: ResourceMap[];
}

interface DispatchAssignment {
  agentId: SubAgentType;
  task: string;
}

// ── Constants ────────────────────────────────────────────────────

const MAX_ORCHESTRATOR_ITERATIONS = 4;
const CONFIDENCE_THRESHOLD = 60;

// ── OrchestratorAgent ────────────────────────────────────────────

export class OrchestratorAgent {
  private config: OrchestratorConfig;

  constructor(config: OrchestratorConfig) {
    this.config = config;
  }

  /**
   * Run the orchestrator loop: triage → dispatch → run sub-agents → evaluate → repeat or finalize.
   */
  async run(
    messages: AppMessage[],
    eventHandler: OrchestratorEventHandler,
    options?: { persistedContext?: InvestigationContextSnapshot | null },
  ): Promise<void> {
    const { subAgents } = this.config;

    // ── Build system prompt ──────────────────────────────────────
    const now = new Date();
    const orchestratorPrompt = this.buildOrchestratorPrompt(now);

    // ── Build input items from conversation history ──────────────
    const inputItems: any[] = messages.map((msg) => {
      let content = msg.content;
      if (msg.role === 'assistant' && msg.toolUses && msg.toolUses.length > 0) {
        const toolSummaries = msg.toolUses
          .filter(t => t.status === 'success')
          .map(t => {
            const timeParams: string[] = [];
            if (t.input) {
              for (const key of ['start_time', 'end_time', 'since', 'from', 'to', 'startTime', 'endTime']) {
                if (t.input[key]) timeParams.push(`${key}=${t.input[key]}`);
              }
            }
            return timeParams.length > 0
              ? `${t.name}(${timeParams.join(', ')})`
              : t.name;
          });
        if (toolSummaries.length > 0) {
          content += `\n\n[Tools used: ${toolSummaries.join(', ')}]`;
        }
      }
      return { role: msg.role as 'user' | 'assistant', content };
    });

    // ── Investigation context ────────────────────────────────────
    const userMessages = messages.filter(m => m.role === 'user');
    const isFollowUp = userMessages.length > 1;
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

    if (isFollowUp) {
      const ctxMsg = ctx.buildContextMessage();
      if (ctxMsg) {
        inputItems.unshift({
          role: 'developer',
          content: `[Persisted Investigation Context — maintain this time window unless the user explicitly changes it]\n${ctxMsg}`,
        });
      }
    }

    // ── Internal tools ───────────────────────────────────────────
    const availableAgentIds = Array.from(subAgents.keys());
    const dispatchTool = this.buildDispatchTool(availableAgentIds);
    const evaluateTool = this.buildEvaluateTool();
    const hasResourceMaps = this.config.resourceMaps.length > 0;
    const internalTools = hasResourceMaps
      ? [this.buildGetConnectedResourcesTool(), dispatchTool, evaluateTool]
      : [dispatchTool, evaluateTool];

    const totalTokens = { input: 0, output: 0 };

    logger.info(
      { availableAgents: availableAgentIds, messageCount: messages.length, model: this.config.model },
      'Starting orchestrator loop',
    );

    try {
      // ═══════════════════════════════════════════════════════════
      // TRIAGE — let the model decide: respond directly or dispatch
      // ═══════════════════════════════════════════════════════════
      // For simple messages (greetings, clarification questions, etc.)
      // the model can answer immediately without dispatching sub-agents.

      const triageResult = await this.triage(inputItems, orchestratorPrompt, internalTools, eventHandler, totalTokens, ctx);

      if (triageResult.type === 'direct_response') {
        // Model answered directly — no investigation needed
        eventHandler.onTokenUsage?.(totalTokens);
        eventHandler.onContextUpdate?.(ctx.toJSON());
        eventHandler.onComplete?.();
        return;
      }

      // Model dispatched — triageResult contains the dispatch call
      const firstDispatchCall = triageResult.dispatchCall;
      let assignments = triageResult.assignments;

      // Add dispatch call to conversation for context
      inputItems.push(firstDispatchCall);

      // ═══════════════════════════════════════════════════════════
      // ORCHESTRATOR LOOP — dispatch → sub-agents → evaluate
      // ═══════════════════════════════════════════════════════════

      for (let iteration = 0; iteration < MAX_ORCHESTRATOR_ITERATIONS; iteration++) {
        eventHandler.onIterationStart?.(iteration);
        logger.info({ iteration, assignments: assignments.map(a => a.agentId) }, 'Orchestrator iteration start');

        // Get the active dispatch call for this iteration
        const currentDispatchCall = iteration === 0
          ? firstDispatchCall
          : await this.dispatch(inputItems, orchestratorPrompt, internalTools, totalTokens, ctx);

        if (!currentDispatchCall && iteration > 0) {
          logger.warn('Orchestrator did not produce a _dispatch call — forcing final answer');
          break;
        }

        // For iterations > 0, parse assignments from the new dispatch call
        if (iteration > 0) {
          const call = currentDispatchCall!;
          inputItems.push(call);

          try {
            const parsed = JSON.parse(call.arguments);
            assignments = (parsed.agents || []).filter((a: DispatchAssignment) => subAgents.has(a.agentId));
          } catch {
            logger.warn({ raw: call.arguments }, 'Failed to parse _dispatch arguments');
            break;
          }

          if (assignments.length === 0) {
            logger.warn('No valid sub-agent assignments — forcing final answer');
            break;
          }
        }

        logger.info(
          { assignments: assignments.map(a => ({ agent: a.agentId, task: a.task.substring(0, 100) })) },
          'Dispatching to sub-agents',
        );

        // ── Run sub-agents ─────────────────────────────────────
        const results: SubAgentResult[] = [];
        const activeDispatchCallId = iteration === 0 ? firstDispatchCall.call_id : currentDispatchCall!.call_id;

        for (const assignment of assignments) {
          const subAgent = subAgents.get(assignment.agentId)!;

          eventHandler.onSubAgentStart?.(assignment.agentId, subAgent.agentType, assignment.task);

          try {
            const result = await subAgent.run(assignment.task, {
              onToolUse: (toolUse) => eventHandler.onToolUse?.(toolUse),
              onTextDelta: (agentId, text) => eventHandler.onTextDelta?.(text, agentId),
            });

            results.push(result);
            totalTokens.input += result.tokenUsage.input;
            totalTokens.output += result.tokenUsage.output;

            eventHandler.onSubAgentComplete?.(result.agentId, result.findings);

            logger.info(
              { agentId: result.agentId, iterations: result.iterations, tools: result.toolsUsed.length, findingsLength: result.findings.length },
              'Sub-agent completed',
            );
          } catch (error: any) {
            logger.error({ agentId: assignment.agentId, error: error.message }, 'Sub-agent failed');
            eventHandler.onSubAgentComplete?.(assignment.agentId, `Agent failed: ${error.message}`);
            results.push({
              agentId: assignment.agentId,
              findings: `Investigation failed: ${error.message}`,
              toolsUsed: [],
              iterations: 0,
              tokenUsage: { input: 0, output: 0 },
            });
          }
        }

        // Add findings as the dispatch function's output
        const findingsSummary = results.map(r =>
          `## ${r.agentId} Agent Findings (${r.toolsUsed.length} tools, ${r.iterations} iterations)\n${r.findings}`,
        ).join('\n\n---\n\n');

        inputItems.push({
          type: 'function_call_output',
          call_id: activeDispatchCallId,
          output: findingsSummary,
        });

        // ── Evaluate ───────────────────────────────────────────
        const isLastIteration = iteration >= MAX_ORCHESTRATOR_ITERATIONS - 1;

        if (isLastIteration) {
          inputItems.push({
            role: 'developer',
            content: `This is the last orchestrator iteration. Strongly consider marking as "complete" unless critical data is clearly missing.`,
          });
        }

        const evaluation = await this.evaluate(inputItems, orchestratorPrompt, internalTools, totalTokens);

        eventHandler.onReasoning?.(iteration, evaluation.result);

        logger.info(
          { iteration, status: evaluation.result.status, confidence: evaluation.result.confidence },
          'Orchestrator evaluation',
        );

        // Add evaluation to conversation
        if (evaluation.call) {
          inputItems.push(evaluation.call);
          inputItems.push({
            type: 'function_call_output',
            call_id: evaluation.call.call_id,
            output: `Evaluation recorded: ${evaluation.result.status} (confidence: ${evaluation.result.confidence}%)`,
          });
        }

        // ── Decide ─────────────────────────────────────────────
        const shouldComplete =
          evaluation.result.status === 'complete' && evaluation.result.confidence >= CONFIDENCE_THRESHOLD;

        if (shouldComplete || isLastIteration) {
          const reason = isLastIteration && !shouldComplete
            ? `iteration limit (${iteration + 1}/${MAX_ORCHESTRATOR_ITERATIONS})`
            : `evaluation complete (confidence: ${evaluation.result.confidence}%)`;
          logger.info({ reason }, 'Generating final answer');

          eventHandler.onTokenUsage?.(totalTokens);
          await this.streamFinalAnswer(inputItems, orchestratorPrompt, eventHandler, isLastIteration && !shouldComplete);
          eventHandler.onContextUpdate?.(ctx.toJSON());
          eventHandler.onComplete?.();
          return;
        }

        // Override: model said complete but confidence too low
        if (evaluation.result.status === 'complete' && evaluation.result.confidence < CONFIDENCE_THRESHOLD) {
          inputItems.push({
            role: 'developer',
            content: `[Evaluation Override] Confidence ${evaluation.result.confidence}% is below threshold. Continue investigating. Focus on: ${evaluation.result.next_steps.join(', ') || 'filling gaps in the analysis'}`,
          });
        }
      }

      // ── Exhausted all iterations ─────────────────────────────────
      logger.warn({ iterations: MAX_ORCHESTRATOR_ITERATIONS }, 'Orchestrator exhausted iteration limit');

      eventHandler.onTokenUsage?.(totalTokens);
      await this.streamFinalAnswer(inputItems, orchestratorPrompt, eventHandler, true);
      eventHandler.onContextUpdate?.(ctx.toJSON());
      eventHandler.onComplete?.();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logger.info('Orchestrator cancelled by user');
        eventHandler.onError?.(new Error('Request cancelled'));
      } else {
        logger.error({ error: error.message, status: error.status, code: error.code }, 'Orchestrator error');

        let userMessage = error.message;
        if (error.status === 401) {
          userMessage = 'Invalid OpenAI API key. Please check your API key in Settings.';
        } else if (error.status === 429) {
          userMessage = 'OpenAI rate limit exceeded. Please try again in a moment.';
        } else if (error.status === 404) {
          userMessage = `Model "${this.config.model}" not found. Your API key may not have access to this model.`;
        } else if (error.code === 'insufficient_quota') {
          userMessage = 'OpenAI quota exceeded. Please check your billing at platform.openai.com.';
        }

        eventHandler.onError?.(new Error(userMessage));
      }
    }
  }

  // ── Triage: direct response or dispatch ────────────────────────

  /**
   * First call uses tool_choice: 'auto' with streaming.
   * If the model produces text without calling _dispatch → direct response.
   * If it calls _dispatch → extract assignments and proceed with investigation.
   */
  private async triage(
    inputItems: any[],
    systemPrompt: string,
    tools: any[],
    eventHandler: OrchestratorEventHandler,
    totalTokens: { input: number; output: number },
    ctx: InvestigationContext,
  ): Promise<
    | { type: 'direct_response' }
    | { type: 'dispatch'; dispatchCall: any; assignments: DispatchAssignment[] }
  > {
    const { client, model, abortSignal } = this.config;

    const stream = await client.responses.create(
      {
        model,
        instructions: systemPrompt,
        input: inputItems,
        tools: tools as any,
        tool_choice: 'auto',
        stream: true,
      },
      { signal: abortSignal },
    );

    let textContent = '';
    let completedResponse: any = null;

    for await (const event of stream) {
      switch (event.type) {
        case 'response.output_text.delta':
          textContent += event.delta;
          eventHandler.onTextDelta?.(event.delta);
          break;

        case 'response.completed':
          completedResponse = event.response;
          break;
      }
    }

    if (completedResponse?.usage) {
      totalTokens.input += completedResponse.usage.input_tokens ?? 0;
      totalTokens.output += completedResponse.usage.output_tokens ?? 0;
    }

    // Check for _get_connected_resources and _dispatch calls
    const connectedCall = completedResponse?.output?.find(
      (o: any) => o.type === 'function_call' && o.name === '_get_connected_resources',
    );
    let dispatchCall = completedResponse?.output?.find(
      (o: any) => o.type === 'function_call' && o.name === '_dispatch',
    );

    // Handle connected resources lookup if the model called it
    if (connectedCall) {
      let scopeResult: ReturnType<OrchestratorAgent['resolveResourceScope']> = null;
      try {
        const parsed = JSON.parse(connectedCall.arguments);
        scopeResult = this.resolveResourceScope(parsed.resource_name);
        logger.info(
          { resourceName: parsed.resource_name, matched: scopeResult?.groupName ?? null },
          'Resolved connected resources',
        );
      } catch {
        logger.warn({ raw: connectedCall.arguments }, 'Failed to parse _get_connected_resources arguments');
      }

      const scopeOutput = this.formatScopeResult(scopeResult);

      // Apply context filtering if we got a match
      if (scopeResult) {
        ctx.scopeToResources(
          scopeResult.resources.map(r => r.name),
          scopeResult.groupName,
        );
      }

      // Append call + result to conversation
      inputItems.push(connectedCall);
      inputItems.push({
        type: 'function_call_output',
        call_id: connectedCall.call_id,
        output: scopeOutput,
      });

      // If no dispatch call yet, do another model turn to get one
      if (!dispatchCall) {
        const followUp = await client.responses.create(
          {
            model,
            instructions: systemPrompt,
            input: inputItems,
            tools: tools as any,
            tool_choice: 'auto',
            stream: true,
          },
          { signal: abortSignal },
        );

        let followUpResponse: any = null;
        for await (const event of followUp) {
          switch (event.type) {
            case 'response.output_text.delta':
              textContent += event.delta;
              eventHandler.onTextDelta?.(event.delta);
              break;
            case 'response.completed':
              followUpResponse = event.response;
              break;
          }
        }

        if (followUpResponse?.usage) {
          totalTokens.input += followUpResponse.usage.input_tokens ?? 0;
          totalTokens.output += followUpResponse.usage.output_tokens ?? 0;
        }

        dispatchCall = followUpResponse?.output?.find(
          (o: any) => o.type === 'function_call' && o.name === '_dispatch',
        );
      }
    }

    if (!dispatchCall) {
      // Model responded directly — no investigation needed
      logger.info({ textLength: textContent.length }, 'Triage: direct response (no dispatch)');
      return { type: 'direct_response' };
    }

    // Parse dispatch assignments
    let assignments: DispatchAssignment[];
    try {
      const parsed = JSON.parse(dispatchCall.arguments);
      assignments = (parsed.agents || []).filter(
        (a: DispatchAssignment) => this.config.subAgents.has(a.agentId),
      );
    } catch {
      logger.warn({ raw: dispatchCall.arguments }, 'Failed to parse triage _dispatch arguments');
      return { type: 'direct_response' };
    }

    if (assignments.length === 0) {
      logger.warn('Triage dispatch had no valid assignments — treating as direct response');
      return { type: 'direct_response' };
    }

    logger.info({ agents: assignments.map(a => a.agentId) }, 'Triage: dispatching to sub-agents');
    return { type: 'dispatch', dispatchCall, assignments };
  }

  // ── Dispatch (iterations > 0) ──────────────────────────────────

  private async dispatch(
    inputItems: any[],
    systemPrompt: string,
    tools: any[],
    totalTokens: { input: number; output: number },
    ctx: InvestigationContext,
  ): Promise<any | null> {
    const { client, model, abortSignal } = this.config;

    // Loop: model may call _get_connected_resources before _dispatch
    const MAX_TOOL_LOOPS = 3;
    for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
      const response = await client.responses.create(
        {
          model,
          instructions: systemPrompt,
          input: inputItems,
          tools: tools as any,
          tool_choice: 'auto',
        } as any,
        { signal: abortSignal },
      );

      if ((response as any).usage) {
        totalTokens.input += (response as any).usage.input_tokens ?? 0;
        totalTokens.output += (response as any).usage.output_tokens ?? 0;
      }

      const dispatchCall = (response as any).output?.find(
        (o: any) => o.type === 'function_call' && o.name === '_dispatch',
      );

      if (dispatchCall) return dispatchCall;

      // Check for _get_connected_resources call
      const connectedCall = (response as any).output?.find(
        (o: any) => o.type === 'function_call' && o.name === '_get_connected_resources',
      );

      if (connectedCall) {
        let scopeResult: ReturnType<OrchestratorAgent['resolveResourceScope']> = null;
        try {
          const parsed = JSON.parse(connectedCall.arguments);
          scopeResult = this.resolveResourceScope(parsed.resource_name);
          logger.info(
            { resourceName: parsed.resource_name, matched: scopeResult?.groupName ?? null },
            'Resolved connected resources (dispatch phase)',
          );
        } catch {
          logger.warn({ raw: connectedCall.arguments }, 'Failed to parse _get_connected_resources arguments');
        }

        const scopeOutput = this.formatScopeResult(scopeResult);

        if (scopeResult) {
          ctx.scopeToResources(
            scopeResult.resources.map(r => r.name),
            scopeResult.groupName,
          );
        }

        inputItems.push(connectedCall);
        inputItems.push({
          type: 'function_call_output',
          call_id: connectedCall.call_id,
          output: scopeOutput,
        });

        // Loop again to get the _dispatch call
        continue;
      }

      // Model produced text without tools — no dispatch
      return null;
    }

    return null;
  }

  // ── Evaluate ───────────────────────────────────────────────────

  private async evaluate(
    inputItems: any[],
    systemPrompt: string,
    tools: any[],
    totalTokens: { input: number; output: number },
  ): Promise<{ result: EvaluationResult; call: any | null }> {
    const { client, model, abortSignal } = this.config;

    const response = await client.responses.create(
      {
        model,
        instructions: systemPrompt,
        input: inputItems,
        tools: tools as any,
        tool_choice: { type: 'function' as const, name: '_evaluate' },
      } as any,
      { signal: abortSignal },
    );

    if ((response as any).usage) {
      totalTokens.input += (response as any).usage.input_tokens ?? 0;
      totalTokens.output += (response as any).usage.output_tokens ?? 0;
    }

    const evalCall = (response as any).output?.find(
      (o: any) => o.type === 'function_call' && o.name === '_evaluate',
    );

    if (!evalCall) {
      return {
        result: { status: 'continue', confidence: 0, summary: 'No evaluation produced.', next_steps: [] },
        call: null,
      };
    }

    try {
      const parsed = JSON.parse(evalCall.arguments);
      return {
        result: {
          status: parsed.status === 'complete' ? 'complete' : 'continue',
          confidence: typeof parsed.confidence === 'number' ? Math.min(100, Math.max(0, parsed.confidence)) : 0,
          summary: parsed.summary || '',
          next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps : [],
        },
        call: evalCall,
      };
    } catch {
      return {
        result: { status: 'continue', confidence: 0, summary: 'Failed to parse evaluation.', next_steps: [] },
        call: evalCall,
      };
    }
  }

  // ── Internal tool schemas ────────────────────────────────────

  private buildDispatchTool(availableAgentIds: SubAgentType[]) {
    return {
      type: 'function' as const,
      name: '_dispatch',
      description: 'Dispatch investigation tasks to domain-specific sub-agents. Each agent will independently query its data sources and return findings. Choose which agents are relevant to the investigation and give each a specific, actionable task.',
      parameters: {
        type: 'object',
        properties: {
          agents: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                agentId: {
                  type: 'string',
                  enum: availableAgentIds,
                  description: 'Which sub-agent to dispatch',
                },
                task: {
                  type: 'string',
                  description: 'Specific investigation task for this agent. Be detailed: include service names, time windows, error messages, or resource IDs when known.',
                },
              },
              required: ['agentId', 'task'],
              additionalProperties: false,
            },
          },
        },
        required: ['agents'],
        additionalProperties: false,
      },
      strict: true,
    };
  }

  private buildEvaluateTool() {
    return {
      type: 'function' as const,
      name: '_evaluate',
      description: 'Evaluate whether the investigation has gathered enough data for a comprehensive diagnosis. Assess the findings from all sub-agents and determine if more investigation is needed.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['continue', 'complete'],
            description: 'Whether to continue investigating or wrap up with a final answer',
          },
          confidence: {
            type: 'number',
            description: 'Confidence level 0-100 that the investigation is thorough enough',
          },
          summary: {
            type: 'string',
            description: 'Assessment of what has been gathered, what it reveals, and what gaps remain',
          },
          next_steps: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific next investigation steps if continuing; empty array if complete',
          },
        },
        required: ['status', 'confidence', 'summary', 'next_steps'],
        additionalProperties: false,
      },
      strict: true,
    };
  }

  private buildGetConnectedResourcesTool() {
    return {
      type: 'function' as const,
      name: '_get_connected_resources',
      description: 'Look up a resource or service name in the resource map and return all connected resources in the same group. Call this AFTER initial investigation reveals a service name, to find related resources for follow-up investigation.',
      parameters: {
        type: 'object',
        properties: {
          resource_name: {
            type: 'string',
            description: 'The resource or service name discovered during investigation (e.g. "Payment API", "auth-service", "payment-db")',
          },
        },
        required: ['resource_name'],
        additionalProperties: false,
      },
      strict: true,
    };
  }

  /**
   * Resolve a service name to a resource group by searching across ALL resource maps.
   * Uses normalized name matching: exact → substring → group name.
   * Returns the matched group and its resources, or null if no match found.
   */
  private resolveResourceScope(serviceName: string): {
    groupName: string;
    groupId: string;
    mapName: string;
    resources: ResourceNode[];
  } | null {
    const maps = this.config.resourceMaps;
    if (maps.length === 0) return null;

    const normalizedInput = normalizeName(serviceName);

    for (const map of maps) {
      if (map.groups.length === 0) continue;

      const nodeById = new Map(map.nodes.map(n => [n.id, n]));

      // Try to find a matching node: exact normalized match first, then substring
      let matchedNode: ResourceNode | undefined;

      // Pass 1: exact normalized name match
      matchedNode = map.nodes.find(n => n.normalizedName === normalizedInput);

      // Pass 2: substring containment (input contains node name or vice versa)
      if (!matchedNode) {
        matchedNode = map.nodes.find(n =>
          normalizedInput.includes(n.normalizedName) || n.normalizedName.includes(normalizedInput),
        );
      }

      // Pass 3: match against group names directly
      if (!matchedNode) {
        const matchedGroup = map.groups.find(g => {
          const normalizedGroupName = normalizeName(g.name);
          return normalizedGroupName === normalizedInput
            || normalizedInput.includes(normalizedGroupName)
            || normalizedGroupName.includes(normalizedInput);
        });

        if (matchedGroup) {
          const groupNodes = matchedGroup.nodeIds
            .map(id => nodeById.get(id))
            .filter((n): n is ResourceNode => n != null);
          return { groupName: matchedGroup.name, groupId: matchedGroup.id, mapName: map.name, resources: groupNodes };
        }
        continue;
      }

      // Find which group contains the matched node
      const group = map.groups.find(g => g.nodeIds.includes(matchedNode!.id));
      if (!group) continue;

      const groupNodes = group.nodeIds
        .map(id => nodeById.get(id))
        .filter((n): n is ResourceNode => n != null);

      return { groupName: group.name, groupId: group.id, mapName: map.name, resources: groupNodes };
    }

    return null;
  }

  /**
   * Format the result of resolveResourceScope as a tool output string.
   */
  private formatScopeResult(result: ReturnType<OrchestratorAgent['resolveResourceScope']>): string {
    if (!result) {
      return 'No matching resource group found. Investigate all available resources.';
    }

    const lines = [
      `Matched group: **${result.groupName}** from map "${result.mapName}" (${result.resources.length} resources)`,
      '',
      'Resources in this group:',
    ];

    for (const node of result.resources) {
      lines.push(this.formatNodeLine(node));
    }

    lines.push('');
    lines.push('Scope all dispatch tasks to ONLY these resources. Do not query resources outside this group.');

    return lines.join('\n');
  }

  // ── System prompt ────────────────────────────────────────────

  private buildOrchestratorPrompt(now: Date): string {
    const { subAgents, enabledIntegrations } = this.config;

    const agentDescriptions = Array.from(subAgents.entries()).map(([id, agent]) => {
      const desc: Record<SubAgentType, string> = {
        apm: 'Queries New Relic for APM metrics, throughput, error rates, response times, transaction traces, and NRQL analytics',
        error_monitoring: 'Queries Sentry for error tracking, stack traces, issue frequency, affected users, and release correlation',
        infrastructure: 'Queries AWS for CloudWatch metrics, EC2/ECS/Lambda health, RDS performance, log analysis, and infrastructure alarms',
        alerting: 'Queries PagerDuty for incidents, on-call schedules, alert timelines, service status, and escalation policies',
      };
      return `- **${id}** (${agent.agentType}): ${desc[id]}`;
    }).join('\n');

    return `${system}

# Your Role: Investigation Orchestrator

You coordinate domain-specific investigation agents. You do NOT call data-source tools directly — instead you dispatch tasks to specialized sub-agents, evaluate their findings, and synthesize a comprehensive diagnosis.

## When to Respond Directly

For messages that do NOT require querying monitoring systems — greetings, casual conversation, clarification questions, general knowledge questions, or follow-up questions that can be answered from context already in the conversation — respond with text directly. Do NOT dispatch sub-agents for these.

Examples of direct responses (no dispatch needed):
- "Hello" / "Hi" / "Thanks" → Greet the user, explain what you can do
- "What integrations do I have?" → Answer from context
- "Can you explain what Apdex means?" → General knowledge
- "Summarize what you found" → Synthesize from existing conversation

## When to Dispatch

For messages that require fetching live data from monitoring systems — error investigations, performance checks, incident analysis, infrastructure health — dispatch to the relevant sub-agents.

## Available Sub-Agents

${agentDescriptions}

## How Investigation Works

0. **Investigate**: Dispatch to the most relevant sub-agent first to gather initial data (fetch the alert, check the error, get resource details).
1. **Scope** (when a resource map is linked): After initial findings reveal service/resource names, call \`_get_connected_resources\` to find all related resources in the same group.
2. **Dispatch**: Use the connected resources to dispatch targeted follow-up tasks. Be specific — instead of "check errors", say "Look up the top errors for the payment-api service in the last 2 hours, get stack traces for the most frequent ones."
3. **Evaluate**: After sub-agents report back, assess whether the investigation is complete. Check: Do we have specific numbers? Stack traces? A timeline? Root cause evidence?
4. **Iterate**: If gaps remain, dispatch follow-up tasks targeting those gaps. Use identifiers from earlier findings (service names, error messages, timestamps) to make follow-up tasks more targeted.
5. **Synthesize**: When complete, produce a final diagnosis connecting all evidence across domains.

## Dispatch Guidelines

- Only dispatch to agents whose domain is relevant to the question.
- Include any known context in the task: service names, time windows, error messages, resource IDs.
- After calling \`_get_connected_resources\`, include specific resource names and IDs from the result in follow-up dispatch tasks. Only investigate resources in the resolved group.
- For follow-up dispatches, reference specific findings from earlier rounds.
- If one agent's findings reveal identifiers relevant to another agent, dispatch a follow-up to that agent.

Connected integrations: ${enabledIntegrations.join(', ')}
Current time: ${now.toISOString()} (${now.toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, dateStyle: 'full', timeStyle: 'long' })})${this.buildResourceInventorySection()}`;
  }

  /**
   * Build a minimal Resource Map hint for the system prompt.
   * Instead of dumping all nodes/groups, just notes that a resource map exists
   * and instructs the model to call _get_connected_resources after initial investigation.
   */
  private buildResourceInventorySection(): string {
    if (this.config.resourceMaps.length === 0) return '';

    return `

## Resource Map

Resource maps are available for this account. After your initial investigation
reveals service or resource names, call \`_get_connected_resources\` with the
service name to find all related resources (databases, APM apps, error trackers,
alerting services) in the same group. Use the returned resources to scope
follow-up dispatch tasks.`;
  }

  private formatNodeLine(node: ResourceNode): string {
    const idPart = node.externalId ? ` (id: ${node.externalId})` : '';
    const attrParts = Object.entries(node.attrs)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    return `- [${node.type}] ${node.name}${idPart} [${node.source}]${attrParts ? ` — ${attrParts}` : ''}`;
  }

  // ── Final answer streaming ───────────────────────────────────

  private async streamFinalAnswer(
    inputItems: any[],
    systemPrompt: string,
    eventHandler: OrchestratorEventHandler,
    forced: boolean,
  ): Promise<void> {
    const { client, model, abortSignal } = this.config;

    const finalInput = [...inputItems];
    finalInput.push({
      role: 'developer',
      content: forced
        ? '[Phase: Final Answer] You have reached the iteration limit. Produce your final, comprehensive answer NOW using all the data gathered by sub-agents. Do not dispatch any more tasks.'
        : '[Phase: Final Answer] Your evaluation determined the investigation is complete. Produce your final, comprehensive diagnosis synthesizing all evidence from sub-agents.',
    });

    const stream = await client.responses.create(
      {
        model,
        instructions: systemPrompt,
        input: finalInput,
        stream: true,
        // No tools — force pure text output
      },
      { signal: abortSignal },
    );

    for await (const event of stream) {
      switch (event.type) {
        case 'response.output_text.delta':
          eventHandler.onTextDelta?.(event.delta);
          break;

        case 'response.completed':
          if ((event as any).response?.usage) {
            eventHandler.onTokenUsage?.({
              input: (event as any).response.usage.input_tokens ?? 0,
              output: (event as any).response.usage.output_tokens ?? 0,
            });
          }
          break;
      }
    }
  }
}
