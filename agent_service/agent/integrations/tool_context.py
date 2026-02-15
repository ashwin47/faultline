"""Tool execution context passed to all tool handlers."""

from __future__ import annotations

from typing import Any


class ToolContext:
    """Simplified tool context for the Python agent service.

    Settings (API keys, etc.) are passed from Rails via the request,
    not read from a database.
    """

    def __init__(
        self,
        account_id: str,
        settings: dict[str, Any],
        abort_flag: Any | None = None,
    ):
        self.account_id = account_id
        self.settings = settings
        self._abort_flag = abort_flag

    def get_setting(self, key: str) -> str | None:
        return self.settings.get(key)

    def is_aborted(self) -> bool:
        if self._abort_flag is None:
            return False
        return self._abort_flag.is_set() if hasattr(self._abort_flag, "is_set") else bool(self._abort_flag)
