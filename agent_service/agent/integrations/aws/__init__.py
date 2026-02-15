"""AWS SDK tools — auto-generated from botocore service models, scoped by resource map."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from ..tool_registry import ToolDefinition, tool_registry

logger = logging.getLogger(__name__)

# ── Operation whitelist ──────────────────────────────────────────

# Always available — apply to any AWS resource
COMMON_OPERATIONS: list[tuple[str, str]] = [
    ("sts", "GetCallerIdentity"),
    ("cloudwatch", "DescribeAlarms"),
    ("cloudwatch", "GetMetricStatistics"),
    ("cloudwatch", "ListMetrics"),
    ("logs", "DescribeLogGroups"),
    ("logs", "FilterLogEvents"),
]

# Scoped by resource type in the resource map
RESOURCE_TYPE_OPERATIONS: dict[str, list[tuple[str, str]]] = {
    "ec2": [
        ("ec2", "DescribeInstances"),
    ],
    "lambda": [
        ("lambda", "ListFunctions"),
        ("lambda", "GetFunction"),
    ],
    "rds": [
        ("rds", "DescribeDBInstances"),
        ("pi", "GetResourceMetrics"),
        ("pi", "DescribeDimensionKeys"),
    ],
    "ecs": [
        ("ecs", "ListClusters"),
        ("ecs", "DescribeClusters"),
        ("ecs", "ListServices"),
        ("ecs", "DescribeServices"),
        ("ecs", "ListTasks"),
        ("ecs", "DescribeTasks"),
    ],
}

# ── Credential helpers (unchanged) ──────────────────────────────


def get_aws_credentials(settings: dict[str, Any], instance: int = 0) -> dict[str, str]:
    access_key = settings.get(f"aws.{instance}.access_key_id")
    secret_key = settings.get(f"aws.{instance}.secret_access_key")
    region = settings.get(f"aws.{instance}.region") or "us-east-1"

    if not access_key or not secret_key:
        raise ValueError("AWS credentials not configured.")

    return {"access_key_id": access_key, "secret_access_key": secret_key, "region": region}


def _boto_session(settings: dict[str, Any]):
    import boto3

    creds = get_aws_credentials(settings)
    return boto3.Session(
        aws_access_key_id=creds["access_key_id"],
        aws_secret_access_key=creds["secret_access_key"],
        region_name=creds["region"],
    ), creds["region"]


# ── Botocore → JSON Schema conversion ───────────────────────────

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(text: str) -> str:
    """Remove HTML tags from botocore documentation strings."""
    return _HTML_TAG_RE.sub("", text).strip() if text else ""


def _shape_to_json_schema(shape, depth: int = 0) -> dict[str, Any]:
    """Convert a botocore Shape into a JSON Schema dict."""
    # At depth cap, return a minimal valid schema for the type
    if depth > 4:
        type_name = shape.type_name
        if type_name in ("integer", "long"):
            return {"type": "integer"}
        if type_name in ("float", "double"):
            return {"type": "number"}
        if type_name == "boolean":
            return {"type": "boolean"}
        if type_name == "list":
            return {"type": "array", "items": {"type": "string"}}
        if type_name == "structure":
            return {"type": "object", "properties": {}}
        if type_name == "map":
            return {"type": "object", "additionalProperties": {"type": "string"}}
        return {"type": "string"}

    schema: dict[str, Any] = {}
    doc = _strip_html(getattr(shape, "documentation", "") or "")
    if doc:
        schema["description"] = doc

    type_name = shape.type_name

    if type_name == "string":
        schema["type"] = "string"
        if hasattr(shape, "enum") and shape.enum:
            schema["enum"] = list(shape.enum)
    elif type_name in ("integer", "long"):
        schema["type"] = "integer"
    elif type_name in ("float", "double"):
        schema["type"] = "number"
    elif type_name == "boolean":
        schema["type"] = "boolean"
    elif type_name == "timestamp":
        schema["type"] = "string"
        schema["description"] = (doc + " " if doc else "") + "ISO 8601 timestamp"
    elif type_name == "structure":
        schema["type"] = "object"
        props: dict[str, Any] = {}
        required: list[str] = []
        for member_name in shape.members:
            member_shape = shape.members[member_name]
            member_schema = _shape_to_json_schema(member_shape, depth + 1)
            if member_schema:
                props[member_name] = member_schema
        schema["properties"] = props
        if hasattr(shape, "required_members") and shape.required_members:
            required = [m for m in shape.required_members if m in props]
            if required:
                schema["required"] = required
    elif type_name == "list":
        schema["type"] = "array"
        member_shape = shape.member
        schema["items"] = _shape_to_json_schema(member_shape, depth + 1)
    elif type_name == "map":
        schema["type"] = "object"
        schema["additionalProperties"] = _shape_to_json_schema(shape.value, depth + 1)
    else:
        schema["type"] = "string"

    return schema


# ── Generic executor helpers ─────────────────────────────────────

def _pascal_to_snake(name: str) -> str:
    """DescribeInstances → describe_instances"""
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", name)
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s)
    return s.lower()


def _strip_none(d: Any) -> Any:
    """Recursively remove keys with None values from dicts."""
    if isinstance(d, dict):
        return {k: _strip_none(v) for k, v in d.items() if v is not None}
    if isinstance(d, list):
        return [_strip_none(item) for item in d]
    return d


def _convert_timestamps(args: Any, shape) -> Any:
    """Recursively convert ISO timestamp strings to datetime objects based on botocore shape."""
    from datetime import datetime

    if shape is None:
        return args

    type_name = shape.type_name

    if type_name == "timestamp" and isinstance(args, str):
        return datetime.fromisoformat(args)

    if type_name == "structure" and isinstance(args, dict):
        result = {}
        for key, value in args.items():
            member_shape = shape.members.get(key)
            result[key] = _convert_timestamps(value, member_shape) if member_shape else value
        return result

    if type_name == "list" and isinstance(args, list):
        member_shape = shape.member
        return [_convert_timestamps(item, member_shape) for item in args]

    if type_name == "map" and isinstance(args, dict):
        value_shape = shape.value
        return {k: _convert_timestamps(v, value_shape) for k, v in args.items()}

    return args


def _truncate(text: str, max_len: int = 20_000) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len] + f"\n... [truncated, {len(text) - max_len} chars omitted]"


async def _execute_aws_operation(service: str, operation: str, args: dict, ctx: Any) -> dict:
    """Generic executor for any whitelisted boto3 operation."""
    import botocore.session

    session, region = _boto_session(ctx.settings)
    client = session.client(service)

    # Look up the botocore input shape for timestamp conversion
    botocore_session = botocore.session.get_session()
    service_model = botocore_session.get_service_model(service)
    operation_model = service_model.operation_model(operation)
    input_shape = operation_model.input_shape

    # Clean args: strip None values, convert timestamps
    cleaned = _strip_none(args)
    if input_shape:
        cleaned = _convert_timestamps(cleaned, input_shape)

    # Call the boto3 method
    method_name = _pascal_to_snake(operation)
    method = getattr(client, method_name)
    resp = method(**cleaned)

    # Remove ResponseMetadata (not useful for the agent)
    if isinstance(resp, dict):
        resp.pop("ResponseMetadata", None)

    output = _truncate(json.dumps(resp, indent=2, default=str))
    return {"title": f"AWS {service}:{operation} ({region})", "output": output}


# ── Tool registration ────────────────────────────────────────────

def register_aws_tools(resource_maps: list | None = None) -> None:
    """Register AWS tools, scoped to resource types found in resource maps."""
    import botocore.session

    # Determine which resource types exist
    resource_types: set[str] = set()
    if resource_maps:
        for rm in resource_maps:
            for node in rm.nodes:
                resource_types.add(node.type)

    # Build operation list
    operations: list[tuple[str, str]] = list(COMMON_OPERATIONS)

    if resource_types:
        # Only add operations for discovered resource types
        for rtype, ops in RESOURCE_TYPE_OPERATIONS.items():
            if rtype in resource_types:
                operations.extend(ops)
    else:
        # Fallback: no resource maps → register everything
        for ops in RESOURCE_TYPE_OPERATIONS.values():
            operations.extend(ops)

    # Deduplicate while preserving order
    seen: set[tuple[str, str]] = set()
    unique_ops: list[tuple[str, str]] = []
    for op in operations:
        if op not in seen:
            seen.add(op)
            unique_ops.append(op)

    # Introspect botocore and register tools
    bc_session = botocore.session.get_session()

    for service, operation in unique_ops:
        try:
            service_model = bc_session.get_service_model(service)
            operation_model = service_model.operation_model(operation)
        except Exception as e:
            logger.warning("Skipping %s:%s — botocore introspection failed: %s", service, operation, e)
            continue

        # Build JSON Schema from botocore input shape
        input_shape = operation_model.input_shape
        if input_shape:
            parameters = _shape_to_json_schema(input_shape)
        else:
            parameters = {"type": "object", "properties": {}}

        # Build description from botocore docs
        doc = _strip_html(operation_model.documentation or "")
        description = doc[:300] if doc else f"AWS {service} {operation}"

        # Tool name: aws_<snake_case_operation>
        tool_name = f"aws_{_pascal_to_snake(operation)}"

        # Closure-capture service and operation for the executor
        def _make_executor(svc: str, op: str):
            async def executor(args: dict, ctx: Any) -> dict:
                return await _execute_aws_operation(svc, op, args, ctx)
            return executor

        tool = ToolDefinition(
            name=tool_name,
            description=description,
            parameters=parameters,
            execute=_make_executor(service, operation),
            category="aws",
        )
        tool_registry.define(tool)
