"""FastAPI app — SSE endpoint for agent orchestration."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

from pydantic import BaseModel

from .discovery import discover_resources
from .models import AgentRunRequest
from .orchestrator import orchestrate

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI(title="Faultline Agent Service", version="0.1.0")

# Track cancellable tasks by conversation_id
_active_tasks: dict[str, asyncio.Task] = {}


@app.post("/api/agent/run")
async def run_agent(request: AgentRunRequest):
    """SSE endpoint — streams events back to the Rails Sidekiq job."""

    async def event_stream():
        async for chunk in orchestrate(request):
            yield chunk

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/agent/cancel/{conversation_id}")
async def cancel_agent(conversation_id: str):
    """Signal cancellation for a running agent job.

    The actual cancellation is handled by the Rails side via Redis pub/sub.
    This endpoint exists as a secondary mechanism.
    """
    task = _active_tasks.pop(conversation_id, None)
    if task and not task.done():
        task.cancel()
        return {"status": "cancelled"}
    return {"status": "not_found"}


class DiscoverRequest(BaseModel):
    settings: dict[str, Any] = {}
    existing_nodes: list[dict[str, Any]] | None = None
    existing_edges: list[dict[str, Any]] | None = None


@app.post("/api/agent/discover")
async def discover(request: DiscoverRequest):
    """Discover resources from all configured integrations."""
    result = await discover_resources(
        request.settings,
        request.existing_nodes,
        request.existing_edges,
    )
    return result


@app.get("/health")
async def health():
    return {"status": "ok"}
