"""PagerDuty custom tools — direct REST API v2 tools."""

from __future__ import annotations

import json
from typing import Any

import httpx

from ..tool_registry import ToolDefinition, tool_registry

PD_BASE = "https://api.pagerduty.com"


def get_pagerduty_credentials(settings: dict[str, Any], instance: int = 0) -> dict[str, str]:
    api_key = settings.get(f"pagerduty.{instance}.api_key")
    if not api_key:
        raise ValueError("PagerDuty API key not configured.")
    return {"api_key": api_key}


def _pd_headers(settings: dict[str, Any]) -> dict[str, str]:
    creds = get_pagerduty_credentials(settings)
    return {
        "Authorization": f"Token token={creds['api_key']}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def _pd_list_incidents(args: dict, ctx: Any) -> dict:
    headers = _pd_headers(ctx.settings)
    params: dict[str, Any] = {"sort_by": "created_at:desc", "limit": args.get("limit", 25)}
    if args.get("since"):
        params["since"] = args["since"]
    if args.get("until"):
        params["until"] = args["until"]
    if args.get("statuses"):
        params["statuses[]"] = args["statuses"]

    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{PD_BASE}/incidents", headers=headers, params=params, timeout=30)
        resp.raise_for_status()

    data = resp.json()
    incidents = data.get("incidents", [])
    return {"title": f"PagerDuty Incidents ({len(incidents)})", "output": json.dumps({"incidents": incidents}, indent=2)}


async def _pd_get_incident(args: dict, ctx: Any) -> dict:
    headers = _pd_headers(ctx.settings)
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{PD_BASE}/incidents/{args['incident_id']}", headers=headers, timeout=30)
        resp.raise_for_status()
    return {"title": f"Incident: {args['incident_id']}", "output": json.dumps(resp.json().get("incident", {}), indent=2)}


async def _pd_list_incident_alerts(args: dict, ctx: Any) -> dict:
    headers = _pd_headers(ctx.settings)
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{PD_BASE}/incidents/{args['incident_id']}/alerts", headers=headers, timeout=30)
        resp.raise_for_status()
    alerts = resp.json().get("alerts", [])
    return {"title": f"Alerts for {args['incident_id']}", "output": json.dumps({"alerts": alerts}, indent=2)}


async def _pd_list_incident_log_entries(args: dict, ctx: Any) -> dict:
    headers = _pd_headers(ctx.settings)
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{PD_BASE}/incidents/{args['incident_id']}/log_entries", headers=headers, timeout=30)
        resp.raise_for_status()
    entries = resp.json().get("log_entries", [])
    return {"title": f"Log Entries for {args['incident_id']}", "output": json.dumps({"log_entries": entries}, indent=2)}


async def _pd_list_services(args: dict, ctx: Any) -> dict:
    headers = _pd_headers(ctx.settings)
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{PD_BASE}/services", headers=headers, timeout=30)
        resp.raise_for_status()
    services = resp.json().get("services", [])
    return {"title": f"PagerDuty Services ({len(services)})", "output": json.dumps({"services": services}, indent=2)}


async def _pd_list_escalation_policies(args: dict, ctx: Any) -> dict:
    headers = _pd_headers(ctx.settings)
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{PD_BASE}/escalation_policies", headers=headers, timeout=30)
        resp.raise_for_status()
    policies = resp.json().get("escalation_policies", [])
    return {"title": f"Escalation Policies ({len(policies)})", "output": json.dumps({"escalation_policies": policies}, indent=2)}


async def _pd_list_oncalls(args: dict, ctx: Any) -> dict:
    headers = _pd_headers(ctx.settings)
    params: dict[str, Any] = {}
    if args.get("schedule_ids"):
        params["schedule_ids[]"] = args["schedule_ids"]
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{PD_BASE}/oncalls", headers=headers, params=params, timeout=30)
        resp.raise_for_status()
    oncalls = resp.json().get("oncalls", [])
    return {"title": f"On-Calls ({len(oncalls)})", "output": json.dumps({"oncalls": oncalls}, indent=2)}


PAGERDUTY_TOOLS = [
    ToolDefinition(
        name="pd_list_incidents",
        description="List PagerDuty incidents, optionally filtered by time range and status.",
        parameters={
            "type": "object",
            "properties": {
                "since": {"type": "string", "description": "Start date in ISO 8601"},
                "until": {"type": "string", "description": "End date in ISO 8601"},
                "statuses": {"type": "array", "items": {"type": "string"}, "description": "Filter by status: triggered, acknowledged, resolved"},
                "limit": {"type": "number", "description": "Max incidents to return (default 25)"},
            },
        },
        execute=_pd_list_incidents,
        category="pagerduty",
    ),
    ToolDefinition(
        name="pd_get_incident",
        description="Get details of a specific PagerDuty incident by ID.",
        parameters={
            "type": "object",
            "properties": {"incident_id": {"type": "string", "description": "PagerDuty incident ID (e.g. P1234ABC)"}},
            "required": ["incident_id"],
        },
        execute=_pd_get_incident,
        category="pagerduty",
    ),
    ToolDefinition(
        name="pd_list_incident_alerts",
        description="List alerts for a PagerDuty incident.",
        parameters={
            "type": "object",
            "properties": {"incident_id": {"type": "string", "description": "PagerDuty incident ID"}},
            "required": ["incident_id"],
        },
        execute=_pd_list_incident_alerts,
        category="pagerduty",
    ),
    ToolDefinition(
        name="pd_list_incident_log_entries",
        description="List log entries (timeline) for a PagerDuty incident.",
        parameters={
            "type": "object",
            "properties": {"incident_id": {"type": "string", "description": "PagerDuty incident ID"}},
            "required": ["incident_id"],
        },
        execute=_pd_list_incident_log_entries,
        category="pagerduty",
    ),
    ToolDefinition(
        name="pd_list_services",
        description="List PagerDuty services.",
        parameters={"type": "object", "properties": {}},
        execute=_pd_list_services,
        category="pagerduty",
    ),
    ToolDefinition(
        name="pd_list_escalation_policies",
        description="List PagerDuty escalation policies.",
        parameters={"type": "object", "properties": {}},
        execute=_pd_list_escalation_policies,
        category="pagerduty",
    ),
    ToolDefinition(
        name="pd_list_oncalls",
        description="List current on-call users.",
        parameters={
            "type": "object",
            "properties": {
                "schedule_ids": {"type": "array", "items": {"type": "string"}, "description": "Filter by schedule IDs"},
            },
        },
        execute=_pd_list_oncalls,
        category="pagerduty",
    ),
]

PAGERDUTY_TOOL_NAMES = [t.name for t in PAGERDUTY_TOOLS]


def register_pagerduty_tools() -> None:
    for tool in PAGERDUTY_TOOLS:
        tool_registry.define(tool)
