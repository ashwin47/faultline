"""Tool registry with JSON Schema validation."""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Callable, Awaitable

logger = logging.getLogger(__name__)


class ToolResult:
    def __init__(
        self,
        title: str,
        output: str,
        metadata: dict[str, Any] | None = None,
    ):
        self.title = title
        self.output = output
        self.metadata = metadata or {}


class ToolDefinition:
    def __init__(
        self,
        name: str,
        description: str,
        parameters: dict[str, Any],
        execute: Callable[..., Awaitable[Any]],
        hidden: bool = False,
        category: str | None = None,
    ):
        self.name = name
        self.description = description
        self.parameters = parameters
        self.execute = execute
        self.hidden = hidden
        self.category = category


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}

    def define(self, definition: ToolDefinition) -> ToolDefinition:
        self._tools[definition.name] = definition
        logger.debug("Tool registered: %s", definition.name)
        return definition

    def get(self, name: str) -> ToolDefinition | None:
        return self._tools.get(name)

    def get_all(self) -> list[ToolDefinition]:
        return list(self._tools.values())

    def get_visible(self) -> list[ToolDefinition]:
        return [t for t in self._tools.values() if not t.hidden]

    def has(self, name: str) -> bool:
        return name in self._tools

    async def execute(self, name: str, args: dict[str, Any], ctx: Any) -> ToolResult:
        tool = self._tools.get(name)
        if not tool:
            raise ValueError(f"Tool not found: {name}")

        start = time.time()

        try:
            output = await tool.execute(args, ctx)
            execution_time = int((time.time() - start) * 1000)

            result = self._format_result(name, output)
            result.metadata = {
                **result.metadata,
                "executionTimeMs": execution_time,
                "toolName": name,
                "status": "success",
            }
            return result

        except Exception as e:
            execution_time = int((time.time() - start) * 1000)
            logger.error("Tool execution failed: %s — %s", name, e)
            return ToolResult(
                title=f"Error: {name}",
                output=f"Tool execution failed: {e}",
                metadata={
                    "executionTimeMs": execution_time,
                    "toolName": name,
                    "status": "error",
                    "error": str(e),
                },
            )

    def _format_result(self, tool_name: str, output: Any) -> ToolResult:
        if isinstance(output, ToolResult):
            return output
        if isinstance(output, dict) and "title" in output and "output" in output:
            return ToolResult(title=output["title"], output=output["output"], metadata=output.get("metadata"))

        if isinstance(output, str):
            output_str = output
        elif isinstance(output, dict) or isinstance(output, list):
            output_str = json.dumps(output, indent=2)
        else:
            output_str = str(output)

        return ToolResult(title=f"Executed {tool_name}", output=output_str)

    def to_openai_tools(self, tool_names: list[str] | None = None) -> list[dict[str, Any]]:
        if tool_names:
            tools = [self._tools[n] for n in tool_names if n in self._tools]
        else:
            tools = self.get_visible()

        return [
            {
                "type": "function",
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters,
                "strict": False,
            }
            for t in tools
        ]

    def to_openai_tools_by_category(self, category: str) -> list[dict[str, Any]]:
        tools = [t for t in self.get_all() if t.category == category]
        return [
            {
                "type": "function",
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters,
                "strict": False,
            }
            for t in tools
        ]

    def unregister(self, name: str) -> bool:
        return self._tools.pop(name, None) is not None

    def clear(self) -> None:
        self._tools.clear()


# Module-level singleton
tool_registry = ToolRegistry()
