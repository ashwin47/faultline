import {
  system,
  correlation,
  guidanceNewrelic,
  guidanceSentry,
  guidanceAws,
  guidanceGithub,
  guidancePagerduty,
  nudgeIteration0,
  nudgeIteration1,
  nudgeIteration2,
  evaluationSystem,
} from '../../prompts/index';

const guidanceMap: Record<string, string> = {
  newrelic: guidanceNewrelic,
  sentry: guidanceSentry,
  aws: guidanceAws,
  github: guidanceGithub,
  pagerduty: guidancePagerduty,
};

/**
 * Get system prompt for the OpenAI agent with MCP tools.
 */
export function getSystemPrompt(enabledIntegrations: string[]): string {
  const integrationList = enabledIntegrations
    .map((int) => {
      const names: Record<string, string> = {
        newrelic:
          'New Relic (APM metrics, NRQL queries, transaction traces, error analytics)',
        sentry:
          'Sentry (error tracking, stack traces, issue frequency, affected users)',
        aws: 'AWS (CloudWatch metrics, EC2 instances, Lambda functions, alarms)',
        github:
          'GitHub (commits, code search, file content, blame, pull requests)',
        pagerduty:
          'PagerDuty (incidents, services, on-call schedules, escalation policies)',
      };
      return `- ${names[int] || int}`;
    })
    .join('\n');

  const hasNewRelic = enabledIntegrations.includes('newrelic');
  const hasSentry = enabledIntegrations.includes('sentry');

  let correlationBlock = '';
  if (hasNewRelic && hasSentry) {
    correlationBlock = '\n\n' + correlation;
  }

  return `${system}

# Connected Data Sources

You have the following integrations available. Use their MCP tools to query data:

${integrationList}
${correlationBlock}

Remember: discover all available resources (apps, projects) first, then query specific data. Always use the same time window across all sources. When you have stack traces, always read the actual code.`;
}

/**
 * Get integration-specific tool tips to help the model use MCP tools effectively.
 */
export function getIntegrationGuidance(enabledIntegrations: string[]): string {
  const parts: string[] = [];
  for (const integration of enabledIntegrations) {
    const guidance = guidanceMap[integration];
    if (guidance) {
      parts.push(guidance);
    }
  }

  if (parts.length === 0) return '';
  return '\n# Integration-Specific Guidance\n\n' + parts.join('\n\n');
}

/**
 * Get the continuation nudge for a given iteration.
 * These are injected after tool results to guide the agent's next step.
 */
export function getContinuationNudge(iteration: number): string {
  if (iteration === 0) return nudgeIteration0;
  if (iteration === 1) return nudgeIteration1;
  return nudgeIteration2;
}

/**
 * Get the evaluation system prompt for the self-assessment step.
 */
export function getEvaluationPrompt(): string {
  return evaluationSystem;
}
