"""Pydantic models for request/response types and SSE events."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_snake


class CamelModel(BaseModel):
    """Base model that accepts both camelCase and snake_case keys."""
    model_config = ConfigDict(alias_generator=to_snake, populate_by_name=True)


class Message(CamelModel):
    id: str
    role: str  # "user" | "assistant"
    message_type: str = "text"  # "text" | "tool_use" | "evaluation"
    content: str | None = None
    timestamp: str | None = None
    toolUses: list[dict[str, Any]] | dict[str, Any] | None = None


class ResourceNode(CamelModel):
    id: str
    name: str
    normalizedName: str = ""
    type: str
    source: str
    externalId: str | None = None
    attrs: dict[str, str] = {}
    position: dict[str, float] | None = None


class ResourceEdge(CamelModel):
    id: str
    sourceNodeId: str
    targetNodeId: str
    type: str
    label: str | None = None
    confidence: float | None = None


class ResourceGroup(CamelModel):
    id: str
    name: str
    nodeIds: list[str] = []


class ResourceMap(CamelModel):
    id: str
    name: str
    description: str | None = None
    nodes: list[ResourceNode] = []
    edges: list[ResourceEdge] = []
    groups: list[ResourceGroup] = []


class AgentRunRequest(BaseModel):
    conversation_id: str
    account_id: str
    user_message: str
    model: str | None = None
    messages: list[Message] = []
    settings: dict[str, Any] = {}
    resource_maps: list[ResourceMap] = []
    persisted_context: dict[str, Any] | None = None
    has_title: bool = False


class EvaluationResult(BaseModel):
    status: str  # "continue" | "complete"
    confidence: float
    summary: str
    next_steps: list[str] = []


class ToolUse(BaseModel):
    id: str
    name: str
    integration: str | None = None
    input: dict[str, Any] = {}
    output: Any = None
    status: str = "running"  # "running" | "success" | "error"
    error: str | None = None
    executionTimeMs: int | None = None
    agentId: str | None = None
