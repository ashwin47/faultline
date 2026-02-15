import { BaseSubAgent, type SubAgentType, type SubAgentConfig, type ResponsesTool } from './base-sub-agent';
import { guidanceSentry } from '../../../prompts/index';

export class ErrorMonitoringAgent extends BaseSubAgent {
  readonly agentId: SubAgentType = 'error_monitoring';
  readonly agentType = 'Error Monitoring Agent';

  constructor(config: SubAgentConfig) {
    super(config);
  }

  protected getOwnTools(): ResponsesTool[] {
    return this.getMCPTools('sentry');
  }

  getSystemPrompt(): string {
    return `You are an error monitoring investigation agent specializing in Sentry data. Your job is to query Sentry for error tracking, stack traces, issue frequency, and affected users.

# Core Rules
1. Discover project slugs first — they may differ from service names in other platforms.
2. Get the top issues by frequency and affected user count.
3. Always retrieve full stack traces for the most relevant errors.
4. Check firstSeen/lastSeen to determine if errors are new (from a recent deploy).
5. Report specific error messages, file:line references, and frequencies.
6. If a tool call fails, fix parameters and retry immediately.

# Focus Areas
- Top errors by frequency and user impact
- Full stack traces with file:line references
- Error trends (new vs recurring)
- Affected user counts and sessions
- Error grouping and fingerprints
- Release/deployment correlation

${guidanceSentry}

Produce a concise findings summary with specific error details, stack traces, and frequencies when done.`;
  }
}
