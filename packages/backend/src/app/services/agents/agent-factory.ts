import OpenAI from 'openai';
import { MCPClientManager } from '../../../lib/integrations/mcp/client-manager';
import { InvestigationContext } from '../investigation-context';
import { logger } from '../../../lib/utils/logger';
import type { ResourceMap } from '../../../types/index';
import type { BaseSubAgent, SubAgentType, SubAgentConfig } from './base-sub-agent';
import { APMAgent } from './apm-agent';
import { ErrorMonitoringAgent } from './error-monitoring-agent';
import { InfrastructureAgent } from './infrastructure-agent';
import { AlertingAgent } from './alerting-agent';
import { OrchestratorAgent } from './orchestrator-agent';

/**
 * Maps integration names to sub-agent types.
 */
const INTEGRATION_TO_AGENT: Record<string, SubAgentType> = {
  newrelic: 'apm',
  sentry: 'error_monitoring',
  aws: 'infrastructure',
  pagerduty: 'alerting',
};

/**
 * Maps sub-agent types to their concrete class.
 */
const AGENT_CLASSES: Record<SubAgentType, new (config: SubAgentConfig) => BaseSubAgent> = {
  apm: APMAgent,
  error_monitoring: ErrorMonitoringAgent,
  infrastructure: InfrastructureAgent,
  alerting: AlertingAgent,
};

export interface CreateAgentOptions {
  client: OpenAI;
  model: string;
  mcp: MCPClientManager;
  abortSignal: AbortSignal;
  accountId: string;
  enabledIntegrations: string[];
  investigationContext: InvestigationContext;
  resourceMaps?: ResourceMap[];
}

/**
 * Create an OrchestratorAgent with the appropriate sub-agents based on enabled integrations.
 *
 * Each sub-agent owns its tool definitions — the factory just instantiates them
 * and verifies they actually have tools available before registering them.
 */
export function createAgent(options: CreateAgentOptions): OrchestratorAgent {
  const { client, model, mcp, abortSignal, accountId, enabledIntegrations, investigationContext } = options;

  // Domain integrations that map to sub-agents (GitHub is shared, not a domain agent)
  const domainIntegrations = enabledIntegrations.filter(i => i !== 'github');

  const baseConfig: SubAgentConfig = {
    client,
    model,
    mcp,
    investigationContext,
    abortSignal,
    accountId,
    enabledIntegrations,
  };

  const subAgents = new Map<SubAgentType, BaseSubAgent>();

  for (const integration of domainIntegrations) {
    const agentType = INTEGRATION_TO_AGENT[integration];
    if (!agentType) continue;

    const AgentClass = AGENT_CLASSES[agentType];
    const agent = new AgentClass(baseConfig);

    // Verify the agent actually has tools before registering it
    const tools = agent.getTools();
    if (tools.length === 0) {
      logger.warn({ agentType, integration }, 'No tools available for sub-agent — skipping');
      continue;
    }

    subAgents.set(agentType, agent);

    logger.info(
      { agentType, toolCount: tools.length, toolNames: tools.map(t => t.name) },
      'Sub-agent created',
    );
  }

  logger.info(
    { subAgentCount: subAgents.size, agents: Array.from(subAgents.keys()) },
    'Orchestrator created',
  );

  return new OrchestratorAgent({
    client,
    model,
    mcp,
    abortSignal,
    accountId,
    subAgents,
    enabledIntegrations: domainIntegrations,
    resourceMaps: options.resourceMaps || [],
  });
}
