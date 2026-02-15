import { BaseSubAgent, type SubAgentType, type SubAgentConfig, type ResponsesTool } from './base-sub-agent';
import { guidancePagerduty } from '../../../prompts/index';

export class AlertingAgent extends BaseSubAgent {
  readonly agentId: SubAgentType = 'alerting';
  readonly agentType = 'Alerting Agent';

  constructor(config: SubAgentConfig) {
    super(config);
  }

  protected getOwnTools(): ResponsesTool[] {
    return this.getMCPTools('pagerduty');
  }

  getSystemPrompt(): string {
    return `You are an alerting investigation agent specializing in PagerDuty data. Your job is to query PagerDuty for incidents, on-call schedules, alert correlation, and service status.

# Core Rules
1. If given an incident ID or URL, fetch that incident immediately as your starting point.
2. Extract timestamps, service names, and descriptions from incident data for cross-referencing.
3. Check incident timelines and notes for context.
4. Report specific incident details, not vague descriptions.
5. If a tool call fails, fix parameters and retry immediately.

# Focus Areas
- Active/recent incidents and their status
- Incident timelines and notes
- Service health and affected services
- On-call schedules and responders
- Escalation policies
- Alert correlation (related incidents)
- Incident trigger details and descriptions

${guidancePagerduty}

Produce a concise findings summary with specific incident details, timelines, and service status when done.`;
  }
}
