"""Infrastructure sub-agent specializing in AWS data."""

from __future__ import annotations

from typing import Any

from .base import BaseSubAgent, SubAgentConfig
from ..prompts import GUIDANCE_AWS


class InfrastructureAgent(BaseSubAgent):
    agent_id = "infrastructure"  # type: ignore[assignment]
    agent_type = "Infrastructure Agent"

    def __init__(self, config: SubAgentConfig) -> None:
        super().__init__(config)

    def get_own_tools(self) -> list[dict[str, Any]]:
        # Use MCP AWS tools (call_aws, suggest_aws_commands) when available,
        # plus custom boto3 tools from the registry
        mcp_tools = self.get_mcp_tools("aws")
        registry_tools = self.get_registry_tools_by_category("aws")
        return [*mcp_tools, *registry_tools]

    def get_system_prompt(self) -> str:
        return f"""You are an infrastructure investigation agent specializing in AWS data. You have access to AWS tools that let you query CloudWatch metrics, EC2 instances, Lambda functions, RDS databases, and CloudWatch Logs.

# Rules
1. Always include region context in your queries.
2. If a command fails, read the error, fix parameters, retry.
3. Empty results may mean wrong region — try alternatives.
4. Report specific metric values, not vague descriptions.
5. Use resource names and IDs from the investigation context when available — do not re-discover.

# Focus Areas
- CloudWatch alarms, metrics, and logs
- EC2, Lambda, ECS health
- RDS performance, connections, Performance Insights, slow query logs

{GUIDANCE_AWS}

Produce a concise findings summary with specific metrics, alarm states, and resource health when done."""
