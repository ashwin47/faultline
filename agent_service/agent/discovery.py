"""Resource discovery — queries enabled integrations and returns resource nodes."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

import httpx

from .name_matcher import normalize_name

logger = logging.getLogger(__name__)


def _node(
    name: str,
    type: str,
    source: str,
    external_id: str | None = None,
    attrs: dict[str, str] | None = None,
) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "name": name,
        "normalizedName": normalize_name(name),
        "type": type,
        "source": source,
        "externalId": external_id,
        "attrs": attrs or {},
    }


# ── New Relic ────────────────────────────────────────────────────


async def _discover_newrelic(settings: dict[str, Any]) -> list[dict[str, Any]]:
    api_key = settings.get("newrelic.0.api_key")
    account_id = settings.get("newrelic.0.account_id")
    if not api_key or not account_id:
        return []

    region = settings.get("newrelic.0.region") or "us"
    url = (
        "https://api.eu.newrelic.com/graphql"
        if region == "eu"
        else "https://api.newrelic.com/graphql"
    )

    gql = """
    {
      actor {
        entitySearch(query: "domain IN ('APM', 'BROWSER') AND reporting = 'true'") {
          results {
            entities {
              guid
              name
              domain
              entityType
              type
              tags { key values }
            }
          }
        }
      }
    }
    """

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                json={"query": gql},
                headers={"API-Key": api_key},
                timeout=30,
            )
            resp.raise_for_status()

        entities = (
            resp.json()
            .get("data", {})
            .get("actor", {})
            .get("entitySearch", {})
            .get("results", {})
            .get("entities", [])
        )

        nodes = []
        seen: set[str] = set()  # deduplicate by GUID
        for e in entities:
            guid = e.get("guid", "")
            if guid in seen:
                continue
            seen.add(guid)

            domain = (e.get("domain") or "APM").lower()
            entity_type = (e.get("type") or e.get("entityType") or "application").lower()
            node_type = f"{domain}_{entity_type}"  # e.g. "apm_application", "browser_application"

            attrs: dict[str, str] = {"domain": domain, "region": region}
            for tag in e.get("tags", []):
                if tag["key"] in ("language", "account", "accountId"):
                    vals = tag.get("values", [])
                    if vals:
                        attrs[tag["key"]] = vals[0]

            nodes.append(_node(
                name=e["name"],
                type=node_type,
                source="newrelic",
                external_id=guid,
                attrs=attrs,
            ))

        logger.info("New Relic discovery: %d entities", len(nodes))
        return nodes
    except Exception as exc:
        logger.warning("New Relic discovery failed: %s", exc)
        return []


# ── AWS ──────────────────────────────────────────────────────────


def _discover_aws_sync(settings: dict[str, Any]) -> list[dict[str, Any]]:
    """Synchronous AWS discovery — runs in a thread to avoid blocking the event loop."""
    access_key = settings.get("aws.0.access_key_id")
    secret_key = settings.get("aws.0.secret_access_key")
    if not access_key or not secret_key:
        return []

    region = settings.get("aws.0.region") or "us-east-1"

    import boto3

    session = boto3.Session(
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
    )

    nodes: list[dict[str, Any]] = []

    # EC2 — only running instances with a Name tag
    try:
        ec2 = session.client("ec2")
        resp = ec2.describe_instances(
            Filters=[{"Name": "instance-state-name", "Values": ["running"]}],
        )
        for res in resp.get("Reservations", []):
            for inst in res.get("Instances", []):
                name_tag = ""
                for t in inst.get("Tags", []):
                    if t.get("Key") == "Name":
                        name_tag = t.get("Value", "")
                if not name_tag:
                    continue  # Skip unnamed instances
                instance_id = inst.get("InstanceId", "")
                nodes.append(_node(
                    name=name_tag,
                    type="ec2",
                    source="aws",
                    external_id=instance_id,
                    attrs={
                        "instanceType": inst.get("InstanceType", ""),
                        "state": "running",
                        "region": region,
                    },
                ))
    except Exception as exc:
        logger.warning("AWS EC2 discovery failed: %s", exc)

    # Lambda
    try:
        lam = session.client("lambda")
        resp = lam.list_functions()
        for f in resp.get("Functions", []):
            nodes.append(_node(
                name=f["FunctionName"],
                type="lambda",
                source="aws",
                external_id=f.get("FunctionArn"),
                attrs={
                    "runtime": f.get("Runtime", ""),
                    "region": region,
                },
            ))
    except Exception as exc:
        logger.warning("AWS Lambda discovery failed: %s", exc)

    # RDS — only available instances
    try:
        rds = session.client("rds")
        resp = rds.describe_db_instances()
        for db in resp.get("DBInstances", []):
            if db.get("DBInstanceStatus") not in ("available", "backing-up", "modifying"):
                continue
            endpoint = db.get("Endpoint", {})
            nodes.append(_node(
                name=db["DBInstanceIdentifier"],
                type="rds",
                source="aws",
                external_id=db.get("DbiResourceId"),
                attrs={
                    "engine": db.get("Engine", ""),
                    "status": db.get("DBInstanceStatus", ""),
                    "endpoint": endpoint.get("Address", "") if endpoint else "",
                    "region": region,
                },
            ))
    except Exception as exc:
        logger.warning("AWS RDS discovery failed: %s", exc)

    logger.info("AWS discovery: %d resources", len(nodes))
    return nodes


async def _discover_aws(settings: dict[str, Any]) -> list[dict[str, Any]]:
    return await asyncio.get_event_loop().run_in_executor(
        None, _discover_aws_sync, settings
    )


# ── PagerDuty ────────────────────────────────────────────────────


async def _discover_pagerduty(settings: dict[str, Any]) -> list[dict[str, Any]]:
    api_key = settings.get("pagerduty.0.api_key")
    if not api_key:
        return []

    headers = {
        "Authorization": f"Token token={api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.pagerduty.com/services",
                headers=headers,
                timeout=30,
            )
            resp.raise_for_status()

        services = resp.json().get("services", [])
        nodes = []
        for svc in services:
            nodes.append(_node(
                name=svc["name"],
                type="service",
                source="pagerduty",
                external_id=svc.get("id"),
                attrs={
                    "status": svc.get("status", ""),
                },
            ))

        logger.info("PagerDuty discovery: %d services", len(nodes))
        return nodes
    except Exception as exc:
        logger.warning("PagerDuty discovery failed: %s", exc)
        return []


# ── Sentry ───────────────────────────────────────────────────────


async def _discover_sentry(settings: dict[str, Any]) -> list[dict[str, Any]]:
    auth_token = settings.get("sentry.0.auth_token")
    org = settings.get("sentry.0.org")
    if not auth_token or not org:
        return []

    headers = {"Authorization": f"Bearer {auth_token}"}

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://sentry.io/api/0/organizations/{org}/projects/",
                headers=headers,
                timeout=30,
            )
            resp.raise_for_status()

        projects = resp.json()
        nodes = []
        for proj in projects:
            nodes.append(_node(
                name=proj["name"],
                type="project",
                source="sentry",
                external_id=proj.get("slug"),
                attrs={
                    "platform": proj.get("platform") or "",
                    "org": org,
                },
            ))

        logger.info("Sentry discovery: %d projects", len(nodes))
        return nodes
    except Exception as exc:
        logger.warning("Sentry discovery failed: %s", exc)
        return []


# ── Edge inference ───────────────────────────────────────────────


def _infer_edges(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Infer edges between nodes that share a normalized name (cross-source or cross-type)."""
    by_normalized: dict[str, list[dict[str, Any]]] = {}
    for node in nodes:
        key = node["normalizedName"]
        if key:
            by_normalized.setdefault(key, []).append(node)

    edges: list[dict[str, Any]] = []
    for group in by_normalized.values():
        if len(group) < 2:
            continue
        seen = set()
        for i, a in enumerate(group):
            for b in group[i + 1 :]:
                # Connect if different sources OR same source but different types
                # (e.g. newrelic apm_application <-> newrelic browser_application)
                if a["source"] != b["source"] or a.get("type") != b.get("type"):
                    pair = tuple(sorted([a["id"], b["id"]]))
                    if pair not in seen:
                        seen.add(pair)
                        edges.append({
                            "id": str(uuid.uuid4()),
                            "sourceNodeId": a["id"],
                            "targetNodeId": b["id"],
                            "type": "inferred",
                            "label": "Name match",
                            "confidence": 0.8,
                        })
    return edges


# ── Merge ────────────────────────────────────────────────────────


def _to_camel(s: str) -> str:
    """Convert snake_case to camelCase."""
    parts = s.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def _normalize_keys(obj: dict[str, Any]) -> dict[str, Any]:
    """Normalize top-level dict keys to camelCase (handles snake_case from Rails)."""
    return {_to_camel(k): v for k, v in obj.items()}


def merge_with_existing(
    existing_nodes: list[dict[str, Any]],
    existing_edges: list[dict[str, Any]],
    discovered_nodes: list[dict[str, Any]],
) -> dict[str, Any]:
    """Merge discovered nodes into existing graph, preserving positions and manual items."""
    # Normalize keys to camelCase (frontend axios may have saved them as snake_case)
    existing_nodes = [_normalize_keys(n) for n in existing_nodes]
    existing_edges = [_normalize_keys(e) for e in existing_edges]

    # Index existing by (source, externalId) and (normalizedName, source)
    by_ext: dict[tuple[str, str], dict[str, Any]] = {}
    by_name: dict[tuple[str, str], dict[str, Any]] = {}
    for node in existing_nodes:
        src = node.get("source", "")
        ext_id = node.get("externalId")
        if ext_id:
            by_ext[(src, ext_id)] = node
        by_name[(node.get("normalizedName", ""), src)] = node

    merged_nodes: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for disc in discovered_nodes:
        src = disc["source"]
        ext_id = disc.get("externalId")

        existing = None
        if ext_id:
            existing = by_ext.get((src, ext_id))
        if not existing:
            existing = by_name.get((disc["normalizedName"], src))

        if existing:
            # Update existing node, preserve position and id
            existing["name"] = disc["name"]
            existing["normalizedName"] = disc["normalizedName"]
            existing["type"] = disc["type"]
            existing["externalId"] = disc.get("externalId") or existing.get("externalId")
            existing["attrs"] = {**existing.get("attrs", {}), **disc.get("attrs", {})}
            merged_nodes.append(existing)
            seen_ids.add(existing["id"])
        else:
            merged_nodes.append(disc)
            seen_ids.add(disc["id"])

    # Keep all existing edges where both endpoints still exist
    kept_edges = [
        e for e in existing_edges
        if e.get("sourceNodeId") in seen_ids
        and e.get("targetNodeId") in seen_ids
    ]

    # Track already-connected pairs so we don't duplicate with inference
    connected_pairs: set[tuple[str, str]] = set()
    for e in kept_edges:
        pair = tuple(sorted([e["sourceNodeId"], e["targetNodeId"]]))
        connected_pairs.add(pair)

    # Only add inferred edges for new connections
    new_inferred = [
        e for e in _infer_edges(merged_nodes)
        if tuple(sorted([e["sourceNodeId"], e["targetNodeId"]])) not in connected_pairs
    ]

    return {
        "nodes": merged_nodes,
        "edges": kept_edges + new_inferred,
    }


# ── Public API ───────────────────────────────────────────────────


async def discover_resources(
    settings: dict[str, Any],
    existing_nodes: list[dict[str, Any]] | None = None,
    existing_edges: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Discover resources from all configured integrations and merge with existing graph."""
    tasks = [
        _discover_newrelic(settings),
        _discover_aws(settings),
        _discover_pagerduty(settings),
        _discover_sentry(settings),
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_nodes: list[dict[str, Any]] = []
    for result in results:
        if isinstance(result, Exception):
            logger.warning("Discovery task failed: %s", result)
        else:
            all_nodes.extend(result)

    logger.info("Total discovered: %d resources", len(all_nodes))

    if existing_nodes is not None:
        return merge_with_existing(
            existing_nodes,
            existing_edges or [],
            all_nodes,
        )

    edges = _infer_edges(all_nodes)
    return {"nodes": all_nodes, "edges": edges}
