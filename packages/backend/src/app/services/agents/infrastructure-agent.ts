import { BaseSubAgent, type SubAgentType, type SubAgentConfig, type ResponsesTool } from './base-sub-agent';
import { guidanceAws } from '../../../prompts/index';

export class InfrastructureAgent extends BaseSubAgent {
  readonly agentId: SubAgentType = 'infrastructure';
  readonly agentType = 'Infrastructure Agent';

  constructor(config: SubAgentConfig) {
    super(config);
  }

  protected getOwnTools(): ResponsesTool[] {
    return this.getMCPTools('aws');
  }

  getSystemPrompt(): string {
    return `You are an infrastructure investigation agent specializing in AWS data. You have access to the AWS API MCP tools which let you execute any AWS CLI command.

# Tools
- **call_aws** — Execute any AWS CLI command. Always include --region and --output json.
- **suggest_aws_commands** — Describe what you need in natural language to get the right CLI command.

# Rules
1. Always include --region and --output json in commands.
2. If a command fails, read the error, fix parameters, retry.
3. Empty results may mean wrong region — try alternatives.
4. Report specific metric values, not vague descriptions.
5. Use resource names and IDs from the investigation context when available — do not re-discover.

# Focus Areas
- CloudWatch alarms, metrics, and logs
- EC2, Lambda, ECS health
- RDS performance, connections, Performance Insights, slow query logs

${guidanceAws}

Produce a concise findings summary with specific metrics, alarm states, and resource health when done.`;
  }
}
