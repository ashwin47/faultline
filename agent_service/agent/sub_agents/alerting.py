"""Alerting sub-agent specializing in PagerDuty data."""

from __future__ import annotations

from typing import Any

from ..prompts import GUIDANCE_PAGERDUTY
from .base import BaseSubAgent, SubAgentConfig


class AlertingAgent(BaseSubAgent):
    agent_id = "alerting"  # type: ignore[assignment]
    agent_type = "Alerting Agent"

    def __init__(self, config: SubAgentConfig) -> None:
        super().__init__(config)

    def get_own_tools(self) -> list[dict[str, Any]]:
        # Use both MCP PagerDuty tools and custom registry tools
        mcp_tools = self.get_mcp_tools("pagerduty")
        registry_tools = self.get_registry_tools_by_category("pagerduty")
        return [*mcp_tools, *registry_tools]

    def get_system_prompt(self) -> str:
        return f"""
You are an alerting investigation agent specializing in PagerDuty data. Your job is to query PagerDuty for incidents, on-call schedules, alert correlation, and service status.

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

{GUIDANCE_PAGERDUTY}

Produce a concise findings summary with specific incident details, timelines, and service status when done."""
