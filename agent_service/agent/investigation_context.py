"""Investigation context — tracks state across the agent loop."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any


class ResourceEntry:
    """A discovered resource from a cloud/monitoring platform."""

    def __init__(
        self,
        name: str,
        type: str,
        id: str | None = None,
        attrs: dict[str, str] | None = None,
    ):
        self.name = name
        self.type = type
        self.id = id
        self.attrs = attrs or {}

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"name": self.name, "type": self.type}
        if self.id:
            d["id"] = self.id
        if self.attrs:
            d["attrs"] = self.attrs
        return d

    @staticmethod
    def from_dict(d: dict[str, Any]) -> ResourceEntry:
        return ResourceEntry(
            name=d["name"],
            type=d["type"],
            id=d.get("id"),
            attrs=d.get("attrs", {}),
        )


class InvestigationContext:
    """Tracks investigation state across the agent loop.

    Extracts time windows, entity names, and key identifiers from tool results
    and injects them as context so the model uses consistent parameters.
    """

    def __init__(self) -> None:
        self.time_window: dict[str, Any] = {
            "description": "last 24 hours",
            "start": None,
            "end": None,
            "extracted": False,
        }
        self.entities: dict[str, list[str]] = {}
        self.identifiers = {
            "service_names": set[str](),
            "error_messages": set[str](),
            "transaction_names": set[str](),
            "hostnames": set[str](),
            "regions": set[str](),
        }
        self.resources: list[ResourceEntry] = []
        self.scoped_group_name: str | None = None

    # ── Parse user message ──────────────────────────────────────

    def parse_user_message(self, message: str) -> None:
        lower = message.lower()
        now = datetime.now(timezone.utc)

        m = re.search(r"last\s+(\d+)\s+hour", lower)
        if m:
            hours = int(m.group(1))
            start = now - timedelta(hours=hours)
            self.time_window = {"description": f"last {hours} hours", "start": start, "end": now, "extracted": True}
            return

        m = re.search(r"last\s+(\d+)\s+day", lower)
        if m:
            days = int(m.group(1))
            start = now - timedelta(days=days)
            self.time_window = {"description": f"last {days} days", "start": start, "end": now, "extracted": True}
            return

        m = re.search(r"last\s+(\d+)\s+min", lower)
        if m:
            mins = int(m.group(1))
            start = now - timedelta(minutes=mins)
            self.time_window = {"description": f"last {mins} minutes", "start": start, "end": now, "extracted": True}
            return

        if re.search(r"today|last 24|past 24", lower):
            start = now - timedelta(hours=24)
            self.time_window = {"description": "last 24 hours", "start": start, "end": now, "extracted": True}
            return

        if re.search(r"this week|past week|last 7|last week", lower):
            start = now - timedelta(days=7)
            self.time_window = {"description": "last 7 days", "start": start, "end": now, "extracted": True}
            return

        if re.search(r"this month|past month|last 30", lower):
            start = now - timedelta(days=30)
            self.time_window = {"description": "last 30 days", "start": start, "end": now, "extracted": True}
            return

        # Default: last 24 hours
        start = now - timedelta(hours=24)
        self.time_window = {"description": "last 24 hours", "start": start, "end": now, "extracted": False}

    # ── Extract from tool results ───────────────────────────────

    def extract_from_tool_result(
        self,
        tool_name: str,
        integration: str | None,
        args: dict[str, Any],
        result: Any,
    ) -> None:
        result_str = result if isinstance(result, str) else __import__("json").dumps(result)

        self._extract_resources(tool_name, integration, result_str)

        # AWS regions
        if integration == "aws":
            if isinstance(args.get("region"), str):
                self.identifiers["regions"].add(args["region"])
            for r in re.findall(
                r"(?:us|eu|ap|sa|ca|me|af)-(?:east|west|north|south|central|northeast|southeast|northwest|southwest)-\d",
                result_str,
            ):
                self.identifiers["regions"].add(r)

        # Hostnames
        for h in re.findall(
            r"(?:ip-[\d-]+|i-[0-9a-f]{8,17}|[\w-]+\.(?:compute|ec2)\.amazonaws\.com)",
            result_str,
        )[:5]:
            self.identifiers["hostnames"].add(h)

        # PagerDuty incident timestamps
        if integration == "pagerduty":
            m = re.search(r'"created_at"\s*:\s*"([^"]+)"', result_str)
            if m:
                try:
                    incident_time = datetime.fromisoformat(m.group(1).replace("Z", "+00:00"))
                    start = incident_time - timedelta(hours=1)
                    end = incident_time + timedelta(hours=1)
                    self.time_window = {
                        "description": f"around incident time {incident_time.isoformat()}",
                        "start": start,
                        "end": end,
                        "extracted": True,
                    }
                except (ValueError, TypeError):
                    pass

        # Entity names
        if integration == "newrelic":
            for m in re.findall(r'"appName"\s*:\s*"([^"]+)"', result_str):
                names = self.entities.setdefault("newrelic", [])
                if m not in names:
                    names.append(m)
                self.identifiers["service_names"].add(m)

        if integration == "sentry":
            for m in re.findall(r'"slug"\s*:\s*"([^"]+)"', result_str):
                slugs = self.entities.setdefault("sentry", [])
                if m not in slugs:
                    slugs.append(m)

        if integration == "pagerduty":
            for m in re.findall(r'"name"\s*:\s*"([^"]+)"', result_str):
                if 2 < len(m) < 60:
                    names = self.entities.setdefault("pagerduty", [])
                    if m not in names:
                        names.append(m)

        # Error messages
        for m in re.findall(r'"(?:error|message|title)"\s*:\s*"([^"]{10,120})"', result_str)[:3]:
            self.identifiers["error_messages"].add(m)

        # Transaction names
        if integration == "newrelic":
            for m in re.findall(r'"name"\s*:\s*"(WebTransaction[^"]+)"', result_str)[:5]:
                self.identifiers["transaction_names"].add(m)

    # ── Resource extraction ─────────────────────────────────────

    def _extract_resources(self, tool_name: str, _integration: str | None, result_str: str) -> None:
        import json

        try:
            data = json.loads(result_str)
        except (json.JSONDecodeError, TypeError):
            return

        # RDS instances
        if isinstance(data.get("DBInstances"), list):
            for db in data["DBInstances"]:
                self._add_resource(ResourceEntry(
                    name=db.get("DBInstanceIdentifier", ""),
                    id=db.get("DbiResourceId"),
                    type="rds",
                    attrs={
                        "engine": f"{db.get('Engine', '')}/{db.get('EngineVersion', '')}",
                        "status": db.get("DBInstanceStatus", ""),
                        "class": db.get("DBInstanceClass", ""),
                        "endpoint": (db.get("Endpoint") or {}).get("Address", ""),
                        "piEnabled": str(db.get("PerformanceInsightsEnabled", False)),
                    },
                ))

        # EC2 instances
        if isinstance(data.get("Reservations"), list):
            for res in data["Reservations"]:
                for inst in res.get("Instances", []):
                    name_tag = None
                    for t in inst.get("Tags", []):
                        if t.get("Key") == "Name":
                            name_tag = t.get("Value")
                    self._add_resource(ResourceEntry(
                        name=name_tag or inst.get("InstanceId", ""),
                        id=inst.get("InstanceId"),
                        type="ec2",
                        attrs={
                            "state": (inst.get("State") or {}).get("Name", ""),
                            "instanceType": inst.get("InstanceType", ""),
                            "az": (inst.get("Placement") or {}).get("AvailabilityZone", ""),
                        },
                    ))

        # Lambda functions
        if isinstance(data.get("Functions"), list):
            for fn in data["Functions"]:
                self._add_resource(ResourceEntry(
                    name=fn.get("FunctionName", ""),
                    id=fn.get("FunctionArn"),
                    type="lambda",
                    attrs={
                        "runtime": fn.get("Runtime", ""),
                        "memory": str(fn.get("MemorySize", "")),
                    },
                ))

        # CloudWatch log groups
        if isinstance(data.get("logGroups"), list):
            for lg in data["logGroups"]:
                self._add_resource(ResourceEntry(
                    name=lg.get("logGroupName", ""),
                    type="log_group",
                    attrs={"retentionDays": str(lg.get("retentionInDays", "never"))},
                ))

        # New Relic entities
        if tool_name == "nr_list_entities" and isinstance(data.get("entities"), list):
            for ent in data["entities"]:
                self._add_resource(ResourceEntry(
                    name=ent.get("name", ""),
                    id=ent.get("guid"),
                    type="newrelic_app",
                    attrs={
                        "entityType": ent.get("entityType") or ent.get("type", ""),
                        "language": ent.get("language", ""),
                        "reporting": str(ent.get("reporting", "")),
                    },
                ))

        # New Relic golden metrics entity
        if tool_name == "nr_get_entity_golden_metrics" and isinstance(data.get("entity"), dict):
            ent = data["entity"]
            self._add_resource(ResourceEntry(
                name=ent.get("name", ""),
                id=ent.get("guid"),
                type="newrelic_app",
                attrs={"entityType": ent.get("entityType", "")},
            ))

        # Sentry projects
        self._extract_sentry_resources(tool_name, result_str)

    def _extract_sentry_resources(self, tool_name: str, result_str: str) -> None:
        import json

        if not re.search(r"list_project|list_issue|get_issue|search_issue|get_project", tool_name, re.IGNORECASE):
            return

        try:
            outer = json.loads(result_str)
            project_data: list[Any] = []

            if isinstance(outer, dict) and isinstance(outer.get("content"), list):
                for block in outer["content"]:
                    if isinstance(block, dict) and block.get("type") == "text" and block.get("text"):
                        try:
                            inner = json.loads(block["text"])
                            if isinstance(inner, list):
                                project_data.extend(inner)
                            elif isinstance(inner, dict):
                                project_data.append(inner)
                        except (json.JSONDecodeError, TypeError):
                            pass

            if isinstance(outer, list):
                project_data = outer

            for item in project_data:
                slug = item.get("slug") or item.get("project_slug")
                if slug:
                    self._add_resource(ResourceEntry(
                        name=slug,
                        id=str(item["id"]) if item.get("id") else None,
                        type="sentry_project",
                        attrs={
                            "name": item.get("name", ""),
                            "platform": item.get("platform", ""),
                            "status": item.get("status", ""),
                        },
                    ))

                proj = item.get("project")
                if isinstance(proj, dict) and proj.get("slug"):
                    self._add_resource(ResourceEntry(
                        name=proj["slug"],
                        id=str(proj["id"]) if proj.get("id") else None,
                        type="sentry_project",
                        attrs={
                            "name": proj.get("name", ""),
                            "platform": proj.get("platform", ""),
                        },
                    ))

        except (json.JSONDecodeError, TypeError):
            for m in re.findall(r'"(?:slug|project_slug)"\s*:\s*"([^"]+)"', result_str):
                self._add_resource(ResourceEntry(name=m, type="sentry_project"))

    def _add_resource(self, entry: ResourceEntry) -> None:
        if not entry.name:
            return
        for i, r in enumerate(self.resources):
            if r.type == entry.type and r.name == entry.name:
                self.resources[i] = ResourceEntry(
                    name=entry.name,
                    type=entry.type,
                    id=entry.id or r.id,
                    attrs={**r.attrs, **entry.attrs},
                )
                return
        self.resources.append(entry)

    # ── Context message for model ───────────────────────────────

    def build_context_message(self) -> str | None:
        parts: list[str] = []

        start = self.time_window.get("start")
        end = self.time_window.get("end")

        if start and end:
            padded_start = start - timedelta(minutes=30)
            window_ms = (end - start).total_seconds() * 1000
            is_broad = window_ms > 3 * 24 * 60 * 60 * 1000

            parts.append(
                f"**Investigation time window:** {self.time_window['description']}\n"
                f"  start: {start.isoformat()}\n"
                f"  end:   {end.isoformat()}\n"
                f"  query_start (padded -30min): {padded_start.isoformat()}"
            )
            if is_broad:
                parts.append(
                    "⚠️ This is a broad time window. Start with it to identify spikes/clusters, "
                    "then narrow to the specific time range where the problem is concentrated."
                )
        else:
            parts.append(f"**Investigation time window:** {self.time_window['description']}")

        if self.entities:
            parts.append("\n**Discovered entities (use the correct name for each platform):**")
            for platform, names in self.entities.items():
                parts.append(f"- {platform}: {', '.join(names)}")

        ids: list[str] = []
        if self.identifiers["regions"]:
            ids.append(f"AWS regions: {', '.join(self.identifiers['regions'])}")
        if self.identifiers["service_names"]:
            ids.append(f"Service names: {', '.join(list(self.identifiers['service_names'])[:5])}")
        if self.identifiers["error_messages"]:
            ids.append(f"Error messages: {' | '.join(list(self.identifiers['error_messages'])[:3])}")
        if self.identifiers["transaction_names"]:
            ids.append(f"Transactions: {', '.join(list(self.identifiers['transaction_names'])[:3])}")
        if self.identifiers["hostnames"]:
            ids.append(f"Hostnames: {', '.join(list(self.identifiers['hostnames'])[:3])}")

        if ids:
            parts.append("\n**Extracted identifiers:**")
            for id_str in ids:
                parts.append(f"- {id_str}")

        if self.resources:
            parts.append("\n**Discovered Resources (use these exact names/IDs — do NOT re-discover):**")
            by_type: dict[str, list[ResourceEntry]] = {}
            for r in self.resources:
                by_type.setdefault(r.type, []).append(r)
            for type_name, entries in by_type.items():
                parts.append(f"\n_{type_name}:_")
                for r in entries:
                    id_part = f" (id: {r.id})" if r.id else ""
                    attr_parts = ", ".join(f"{k}={v}" for k, v in r.attrs.items() if v)
                    parts.append(f"- {r.name}{id_part}{f' [{attr_parts}]' if attr_parts else ''}")

        return "\n".join(parts)

    # ── Serialization ───────────────────────────────────────────

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "timeWindow": {
                "description": self.time_window["description"],
                "start": self.time_window["start"].isoformat() if self.time_window.get("start") else None,
                "end": self.time_window["end"].isoformat() if self.time_window.get("end") else None,
                "extracted": self.time_window.get("extracted", False),
            },
            "entities": self.entities,
            "identifiers": {
                "serviceNames": list(self.identifiers["service_names"]),
                "errorMessages": list(self.identifiers["error_messages"]),
                "transactionNames": list(self.identifiers["transaction_names"]),
                "hostnames": list(self.identifiers["hostnames"]),
                "regions": list(self.identifiers["regions"]),
            },
            "resources": [r.to_dict() for r in self.resources],
        }
        if self.scoped_group_name:
            d["scopedGroupName"] = self.scoped_group_name
        return d

    @classmethod
    def from_dict(cls, snapshot: dict[str, Any]) -> InvestigationContext:
        ctx = cls()
        tw = snapshot.get("timeWindow", {})
        ctx.time_window = {
            "description": tw.get("description", "last 24 hours"),
            "start": datetime.fromisoformat(tw["start"]) if tw.get("start") else None,
            "end": datetime.fromisoformat(tw["end"]) if tw.get("end") else None,
            "extracted": tw.get("extracted", False),
        }
        ctx.entities = snapshot.get("entities", {})
        ids = snapshot.get("identifiers", {})
        ctx.identifiers = {
            "service_names": set(ids.get("serviceNames", [])),
            "error_messages": set(ids.get("errorMessages", [])),
            "transaction_names": set(ids.get("transactionNames", [])),
            "hostnames": set(ids.get("hostnames", [])),
            "regions": set(ids.get("regions", [])),
        }
        ctx.resources = [ResourceEntry.from_dict(r) for r in snapshot.get("resources", [])]
        ctx.scoped_group_name = snapshot.get("scopedGroupName")
        return ctx

    def parse_all_user_messages(self, messages: list[dict[str, str]]) -> None:
        for msg in messages:
            if msg.get("role") != "user":
                continue
            probe = InvestigationContext()
            probe.parse_user_message(msg.get("content", ""))
            if probe.time_window.get("extracted"):
                self.time_window = probe.time_window

    def scope_to_resources(self, resource_names: list[str], group_name: str) -> None:
        name_set = {n.lower() for n in resource_names}
        self.resources = [r for r in self.resources if r.name.lower() in name_set]

        for platform in list(self.entities.keys()):
            filtered = [n for n in self.entities[platform] if n.lower() in name_set]
            if filtered:
                self.entities[platform] = filtered
            else:
                del self.entities[platform]

        self.identifiers["service_names"] = {
            n for n in self.identifiers["service_names"] if n.lower() in name_set
        }
        self.scoped_group_name = group_name
