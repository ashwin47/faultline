"""New Relic custom tools — calls NerdGraph (GraphQL) API directly."""

from __future__ import annotations

import json
from typing import Any

import httpx

from ..tool_registry import ToolDefinition, tool_registry


def get_newrelic_credentials(settings: dict[str, Any], instance: int = 0) -> dict[str, str]:
    api_key = settings.get(f"newrelic.{instance}.api_key")
    account_id = settings.get(f"newrelic.{instance}.account_id")
    if not api_key or not account_id:
        raise ValueError("New Relic API key or account ID not configured.")
    region = settings.get(f"newrelic.{instance}.region") or "us"
    return {"api_key": api_key, "account_id": account_id, "region": region}


def _nerdgraph_url(region: str) -> str:
    if region == "eu":
        return "https://api.eu.newrelic.com/graphql"
    return "https://api.newrelic.com/graphql"


async def _nr_list_entities(args: dict, ctx: Any) -> dict:
    creds = get_newrelic_credentials(ctx.settings)
    query_str = args.get("query", "domain = 'APM'")

    gql = """
    {
      actor {
        entitySearch(query: "%s") {
          results {
            entities {
              guid
              name
              entityType
              type
              reporting
              tags { key values }
            }
          }
        }
      }
    }
    """ % query_str.replace('"', '\\"')

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _nerdgraph_url(creds["region"]),
            json={"query": gql},
            headers={"API-Key": creds["api_key"]},
            timeout=30,
        )
        resp.raise_for_status()

    data = resp.json()
    entities = (
        data.get("data", {})
        .get("actor", {})
        .get("entitySearch", {})
        .get("results", {})
        .get("entities", [])
    )
    return {
        "title": f"New Relic Entities ({len(entities)} found)",
        "output": json.dumps({"entities": entities}, indent=2),
    }


async def _nr_run_nrql(args: dict, ctx: Any) -> dict:
    creds = get_newrelic_credentials(ctx.settings)
    nrql = args["nrql"]

    gql = """
    {
      actor {
        account(id: %s) {
          nrql(query: "%s") {
            results
          }
        }
      }
    }
    """ % (creds["account_id"], nrql.replace('"', '\\"'))

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _nerdgraph_url(creds["region"]),
            json={"query": gql},
            headers={"API-Key": creds["api_key"]},
            timeout=30,
        )
        resp.raise_for_status()

    data = resp.json()
    errors = data.get("errors")
    if errors:
        return {
            "title": f"NRQL Error: {nrql[:60]}",
            "output": json.dumps({"nrql": nrql, "errors": errors}, indent=2),
        }
    results = (
        (data.get("data") or {})
        .get("actor") or {}
    )
    results = (results.get("account") or {}).get("nrql") or {}
    results = results.get("results") or []
    return {
        "title": f"NRQL: {nrql[:80]}",
        "output": json.dumps({"nrql": nrql, "results": results}, indent=2),
    }


async def _nr_get_entity_golden_metrics(args: dict, ctx: Any) -> dict:
    creds = get_newrelic_credentials(ctx.settings)
    guid = args["guid"]

    gql = """
    {
      actor {
        entity(guid: "%s") {
          name
          guid
          entityType
          goldenMetrics {
            metrics {
              name
              title
              unit
              queries {
                accountId
                query
              }
            }
          }
          alertSeverity
          recentAlertViolations(count: 5) {
            alertSeverity
            label
            openedAt
            closedAt
          }
          relatedEntities(filter: {direction: BOTH}) {
            results {
              target {
                entity {
                  guid
                  name
                  entityType
                }
              }
            }
          }
        }
      }
    }
    """ % guid

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _nerdgraph_url(creds["region"]),
            json={"query": gql},
            headers={"API-Key": creds["api_key"]},
            timeout=30,
        )
        resp.raise_for_status()

    data = resp.json()
    entity = data.get("data", {}).get("actor", {}).get("entity", {})
    return {
        "title": f"Entity: {entity.get('name', guid)}",
        "output": json.dumps({"entity": entity}, indent=2),
    }


NEWRELIC_TOOLS = [
    ToolDefinition(
        name="nr_list_entities",
        description="Discover New Relic entities (APM apps, hosts, etc.) by search query. Use entity search queries like `domain = 'APM' AND name LIKE 'payment'`.",
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Entity search query (e.g. `domain = 'APM' AND name LIKE 'payment'`)"},
            },
            "required": ["query"],
        },
        execute=_nr_list_entities,
        category="newrelic",
    ),
    ToolDefinition(
        name="nr_run_nrql",
        description="Execute a NRQL query against New Relic. Covers Transaction, TransactionError, Log, Metric, Span, and all event types.",
        parameters={
            "type": "object",
            "properties": {
                "nrql": {"type": "string", "description": "NRQL query string"},
            },
            "required": ["nrql"],
        },
        execute=_nr_run_nrql,
        category="newrelic",
    ),
    ToolDefinition(
        name="nr_get_entity_golden_metrics",
        description="Get golden signals, recent alerts, deployments, and related entities for a New Relic entity GUID.",
        parameters={
            "type": "object",
            "properties": {
                "guid": {"type": "string", "description": "New Relic entity GUID from nr_list_entities"},
            },
            "required": ["guid"],
        },
        execute=_nr_get_entity_golden_metrics,
        category="newrelic",
    ),
]

NEWRELIC_TOOL_NAMES = [t.name for t in NEWRELIC_TOOLS]


def register_newrelic_tools() -> None:
    for tool in NEWRELIC_TOOLS:
        tool_registry.define(tool)
