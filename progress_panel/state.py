"""Private, bounded product-panel cache; never an approval authority."""

from __future__ import annotations

import json
import os
import re
import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

Snapshot = dict[str, Any]
STEP_STATUSES = {"pending", "active", "done", "blocked", "skipped"}
RUN_STATUSES = {"running", "waiting", "completed", "blocked", "cancelled"}
TERMINAL = {"completed", "blocked", "cancelled"}
MAX_RUNS = 200
MAX_HISTORY = 20
SKILL_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}(?::[A-Za-z0-9][A-Za-z0-9_-]{0,63})?$"
SKILL_USE_VIAS = {"direct_read", "skill_tool", "context"}
MAX_SKILL_USES = 64


@dataclass
class ProgressError(ValueError):
    """A public, payload-free error code and optional scoped conflict snapshot."""

    code: str
    current: Snapshot | None = None

    def __str__(self) -> str:
        return self.code


def text(value: object, maximum: int, *, empty: bool = False) -> str:
    """Validate a short, plain single-line declaration without echoing its value."""
    if not isinstance(value, str):
        raise ProgressError("invalid_text")
    result = value.strip()
    if len(result) > maximum or (not result and not empty):
        raise ProgressError("invalid_text")
    if any(ord(character) < 32 or ord(character) == 127 for character in result):
        raise ProgressError("invalid_text")
    return result


def run_id(value: object) -> str:
    """Require a canonical UUID so a task reference can never become a path."""
    if not isinstance(value, str):
        raise ProgressError("invalid_run_id")
    try:
        parsed = uuid.UUID(value)
    except ValueError as error:
        raise ProgressError("invalid_run_id") from error
    if str(parsed) != value:
        raise ProgressError("invalid_run_id")
    return value


def validate_skill_uses(value: object) -> list[dict[str, str]]:
    """Accept use declarations, never caller-supplied receipts or filesystem paths."""
    if not isinstance(value, list) or len(value) > 32:
        raise ProgressError("invalid_skill_uses")
    result: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in value:
        if not isinstance(item, dict) or set(item) != {"skill", "via"}:
            raise ProgressError("invalid_skill_uses")
        skill, via = item["skill"], item["via"]
        if (not isinstance(skill, str) or not re.fullmatch(SKILL_ID_PATTERN, skill)
                or not isinstance(via, str) or via not in SKILL_USE_VIAS):
            raise ProgressError("invalid_skill_uses")
        qualified = skill if ":" in skill else f"host:{skill}"
        key = (qualified, via)
        if key in seen:
            raise ProgressError("invalid_skill_uses")
        seen.add(key)
        result.append({"skill": qualified, "via": via})
    return result


def merge_skill_uses(
    existing: list[Snapshot], declarations: list[dict[str, str]], at: str,
) -> tuple[list[Snapshot], list[Snapshot]]:
    """Append each actual-use declaration once while retaining its first receipt time."""
    known = {(item["skill"], item["via"]) for item in existing}
    added = [dict(item, source="agent_declared", recorded_at=at) for item in declarations
             if (item["skill"], item["via"]) not in known]
    if len(existing) + len(added) > MAX_SKILL_USES:
        raise ProgressError("skill_use_limit")
    return [*existing, *added], added


def steps(value: object, status: str) -> list[dict[str, str]]:
    """Enforce one current step and keep unfinished work visible at completion."""
    if not isinstance(value, list) or not 1 <= len(value) <= 12:
        raise ProgressError("invalid_steps")
    result = []
    for item in value:
        if not isinstance(item, dict) or set(item) != {"label", "status"}:
            raise ProgressError("invalid_steps")
        label = text(item["label"], 80)
        state = item["status"]
        if not isinstance(state, str) or state not in STEP_STATUSES:
            raise ProgressError("invalid_steps")
        result.append({"label": label, "status": state})
    if len({item["label"] for item in result}) != len(result):
        raise ProgressError("duplicate_steps")
    active = sum(item["status"] == "active" for item in result)
    blocked = sum(item["status"] == "blocked" for item in result)
    if active + blocked > 1:
        raise ProgressError("multiple_current_steps")
    if status in {"running", "waiting"} and (active != 1 or blocked):
        raise ProgressError("missing_current_step")
    if status == "completed" and any(
        item["status"] not in {"done", "skipped"} for item in result
    ):
        raise ProgressError("incomplete_steps")
    if status == "blocked" and (active or blocked != 1):
        raise ProgressError("missing_blocked_step")
    if status == "cancelled" and active:
        raise ProgressError("ended_current_step")
    return result


def timestamp() -> str:
    """Return server reception time, never an inferred execution timestamp."""
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def stage_details(value: Snapshot, status: str) -> Snapshot:
    """Keep declarations valid for this state without inferring check results."""
    result = dict(value)
    if status != "waiting":
        result.pop("waiting_for", None)
    if status not in {"waiting", "blocked"}:
        result.pop("reason", None)
    if status in {"completed", "cancelled"}:
        result.pop("current", None)
        result.pop("remaining", None)
    return result


def details(value: object) -> Snapshot:
    if value is None:
        return {}
    if not isinstance(value, dict) or set(value) - {"current", "change", "remaining", "reason", "waiting_for"}:
        raise ProgressError("invalid_details")
    result = {key: text(item, 120, empty=True) for key, item in value.items()}
    if "waiting_for" in result and result["waiting_for"] not in {"user", "external"}:
        raise ProgressError("invalid_waiting_for")
    return result


def scope(value: object) -> Snapshot:
    stages = {"discovery", "clarifying", "prd", "prototype", "spec"}
    if not isinstance(value, dict) or set(value) != {"kind", "target_stage"}:
        raise ProgressError("invalid_scope")
    if value["kind"] == "product_workflow" and value["target_stage"] is None:
        return dict(value)
    if value["kind"] == "stage_delivery" and value["target_stage"] in stages:
        return dict(value)
    raise ProgressError("invalid_scope")


def public(snapshot: Snapshot) -> Snapshot:
    return {key: value for key, value in snapshot.items() if not key.startswith("_")}


def confirmation(value: object, snapshot: Snapshot) -> Snapshot | None:
    if value is None:
        return None
    required = {"target_kind", "artifact_id", "version", "sha256", "scope_summary", "included_inputs"}
    if not isinstance(value, dict) or set(value) != required:
        raise ProgressError("invalid_confirmation")
    for key, limit in [("target_kind", 20), ("version", 40), ("sha256", 64), ("scope_summary", 600)]:
        text(value[key], limit)
    if snapshot["source_state"]["status"] != "available":
        raise ProgressError("confirmation_source_unavailable")
    product = snapshot["product"]
    inputs = value["included_inputs"]
    if not isinstance(inputs, list) or len(inputs) > 64:
        raise ProgressError("invalid_confirmation")
    for item in inputs:
        if not isinstance(item, dict) or set(item) != {"artifact", "version", "sha256"}:
            raise ProgressError("invalid_confirmation")
    if value["target_kind"] == "boundary" and value["artifact_id"] is None:
        if value["sha256"] != snapshot["source_state"]["state_sha256"] or inputs:
            raise ProgressError("invalid_confirmation")
        return dict(value)
    artifact = next((a for a in product["artifacts"] if a["id"] == value["artifact_id"]), None)
    if (not artifact or artifact["kind"] != value["target_kind"] or
            artifact["version"] != value["version"] or artifact["sha256"] != value["sha256"] or
            artifact["effective_status"] not in {"draft", "ready-for-review", "in-progress", "done"}):
        raise ProgressError("invalid_confirmation")
    if inputs and (product["workflow_mode"] != "fast" or artifact["kind"] != "spec"):
        raise ProgressError("invalid_confirmation")
    if artifact["kind"] == "spec" and product["workflow_mode"] == "fast":
        if sorted(inputs, key=lambda x: x["artifact"]) != sorted(artifact["inputs"], key=lambda x: x["artifact"]):
            raise ProgressError("invalid_confirmation")
    return dict(value)


def product_approved(snapshot: Snapshot) -> bool:
    product = snapshot.get("product") or {}
    if (snapshot["source_state"]["status"] != "available" or
            product.get("workflow_mode") not in {"standard", "fast"} or
            product.get("integrity", {}).get("status") != "valid" or
            product.get("current_stage") != "completed" or product.get("workflow_status") != "approved"):
        return False
    artifacts = {a["id"]: a for a in product["artifacts"]}
    for spec in artifacts.values():
        if spec["kind"] != "spec" or spec["effective_status"] != "approved":
            continue
        approval = next((a for a in product["approvals"] if a["artifact"] == spec["id"] and
                         a["state"] == "valid" and a["version"] == spec["version"] and
                         a["sha256"] == spec["sha256"] and a["path"] == spec["path"]), None)
        if not approval or not any(artifacts.get(i["artifact"], {}).get("kind") == "prd" for i in spec["inputs"]):
            continue
        unapproved = [i for i in spec["inputs"] if artifacts.get(i["artifact"], {}).get("effective_status") != "approved"]
        if not unapproved:
            return True
        if (product["workflow_mode"] == "fast" and approval["includes_input_scope"] and
                sorted(approval["inputs"], key=lambda i: i["artifact"]) == sorted(spec["inputs"], key=lambda i: i["artifact"])):
            return True
    return False


def merge_source(current: Snapshot, collected: Snapshot) -> Snapshot:
    result = dict(current)
    if "product" in collected:
        result["product"] = collected["product"]
    result["source_state"] = dict(collected["source_state"])
    if "product" not in collected and current.get("product"):
        result["source_state"]["retained_snapshot"] = True
    return result


@dataclass(frozen=True)
class ProgressStore:
    """Persist independent tasks with atomic optimistic updates and bounded history."""

    directory: Path

    def __post_init__(self) -> None:
        if self.directory.is_symlink():
            raise ProgressError("unsafe_data_directory")
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        if os.name == "posix" and self.directory.stat().st_mode & 0o077:
            raise ProgressError("unsafe_data_directory")
        database = self.directory / "progress.sqlite3"
        if database.is_symlink():
            raise ProgressError("unsafe_data_directory")
        database.touch(mode=0o600, exist_ok=True)
        if os.name == "posix" and database.stat().st_mode & 0o077:
            raise ProgressError("unsafe_data_directory")
        with self.connection() as connection:
            connection.execute("PRAGMA max_page_count = 8192")
            connection.execute(
                "CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, "
                "updated TEXT NOT NULL, payload TEXT NOT NULL)"
            )

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        """Close each short connection; do not retain locks between MCP requests."""
        connection = sqlite3.connect(self.directory / "progress.sqlite3", timeout=2)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    @staticmethod
    def _read(connection: sqlite3.Connection, identifier: str) -> Snapshot:
        row = connection.execute(
            "SELECT payload FROM runs WHERE id = ?", (identifier,)
        ).fetchone()
        if row is None:
            raise ProgressError("unknown_run")
        return cast(Snapshot, json.loads(row[0]))

    @staticmethod
    def _prune(connection: sqlite3.Connection, keep_id: str) -> None:
        cutoff = (
            (datetime.now(UTC) - timedelta(days=7)).isoformat().replace("+00:00", "Z")
        )
        connection.execute(
            "DELETE FROM runs WHERE updated < ? AND id != ?", (cutoff, keep_id)
        )
        connection.execute(
            "DELETE FROM runs WHERE id IN "
            "(SELECT id FROM runs WHERE id != ? ORDER BY updated DESC, id DESC LIMIT -1 OFFSET ?)",
            (keep_id, MAX_RUNS - 1),
        )

    @staticmethod
    def _write(connection: sqlite3.Connection, snapshot: Snapshot) -> None:
        encoded = json.dumps(snapshot, ensure_ascii=False)
        if len(encoded.encode()) > 512 * 1024:
            raise ProgressError("snapshot_too_large")
        connection.execute("INSERT OR REPLACE INTO runs VALUES (?, ?, ?)",
                           (snapshot["run_id"], timestamp(), encoded))

    def read(self, identifier: object) -> Snapshot:
        with self.connection() as connection:
            return self._read(connection, run_id(identifier))

    def start(self, arguments: Snapshot, collected: Snapshot, bound: Snapshot) -> Snapshot:
        now = timestamp()
        uses, added = merge_skill_uses([], validate_skill_uses(arguments.get("skill_uses", [])), now)
        previous = arguments.get("previous_run_id")
        if previous is not None:
            old = self.read(previous)
            if old["_binding"] != bound or old["status"] not in TERMINAL:
                raise ProgressError("invalid_previous_run")
        result = merge_source({
            "schema_version": 1, "panel_kind": "relayforge_product", "source": "agent_declared",
            "run_id": str(uuid.uuid4()), "revision": 1, "title": text(arguments["title"], 80),
            "scope": scope(arguments["scope"]), "status": "running", "steps": steps(arguments["steps"], "running"),
            "summary": text(arguments.get("summary", ""), 240, empty=True),
            "details": stage_details(details(arguments.get("details")), "running"),
            "product": None, "confirmation_request": None, "outcome": None,
            "workflow": None, "skill_loads": [], "skill_uses": uses, "history": [], "previous_run_id": previous,
            "created_at": now, "updated_at": now, "_binding": bound,
        }, collected)
        self._event(result, "started", added)
        with self.connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._write(connection, result); self._prune(connection, result["run_id"])
        return result

    @staticmethod
    def _event(snapshot: Snapshot, kind: str, added_uses: list[Snapshot] | None = None) -> None:
        product = snapshot.get("product") or {}
        event = {"revision": snapshot["revision"], "at": timestamp(), "kind": kind,
                 "status": snapshot["status"], "summary": snapshot["summary"],
                 "details": snapshot["details"], "workflow_mode": product.get("workflow_mode"),
                 "stage": product.get("observed_stage"), "source_state": snapshot["source_state"],
                 "current_step": next((s["label"] for s in snapshot["steps"] if s["status"] in {"active", "blocked"}), "")}
        if added_uses:
            event["skill_uses"] = added_uses
        snapshot["history"] = (snapshot["history"] + [event])[-MAX_HISTORY:]

    def update(self, arguments: Snapshot, collected: Snapshot) -> Snapshot:
        import hashlib
        declared_uses = validate_skill_uses(arguments.get("skill_uses", []))
        expected = arguments["expected_revision"]
        if type(expected) is not int or expected < 1:
            raise ProgressError("invalid_revision")
        request = hashlib.sha256(json.dumps(arguments, sort_keys=True).encode()).hexdigest()
        with self.connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            current = self._read(connection, run_id(arguments["run_id"]))
            if current["revision"] != expected:
                if current["revision"] == expected + 1 and current.get("_request") == request:
                    return current
                raise ProgressError("revision_conflict", public(current))
            if current["status"] in TERMINAL:
                raise ProgressError("run_ended")
            status = arguments["status"]
            if status not in RUN_STATUSES:
                raise ProgressError("invalid_status")
            result = merge_source(current, collected)
            uses, added = merge_skill_uses(current.get("skill_uses", []), declared_uses, timestamp())
            result["skill_uses"] = uses
            result.update(status=status, steps=steps(arguments["steps"], status),
                          summary=text(arguments.get("summary", ""), 240, empty=True),
                          details=stage_details(details(arguments["details"]) if "details" in arguments else current["details"], status))
            if "confirmation_request" in arguments:
                result["confirmation_request"] = confirmation(arguments["confirmation_request"], result)
                result.pop("confirmation_invalidated", None)
            elif current.get("confirmation_request") and status == "waiting" and result["details"].get("waiting_for") == "user":
                try:
                    result["confirmation_request"] = confirmation(current["confirmation_request"], result)
                except ProgressError:
                    result["confirmation_request"] = None
                    result["confirmation_invalidated"] = True
            if status != "waiting" or result["details"].get("waiting_for") != "user":
                result["confirmation_request"] = None
                result.pop("confirmation_invalidated", None)
            outcome = arguments.get("outcome")
            if status in TERMINAL:
                expected_outcome = "cancelled" if status == "cancelled" else "blocked" if status == "blocked" else (
                    "product_approved" if current["scope"]["kind"] == "product_workflow" else "stage_delivered")
                if outcome != expected_outcome:
                    raise ProgressError("outcome_required")
                if status == "completed":
                    if expected_outcome == "product_approved" and not product_approved(result):
                        raise ProgressError("product_not_approved")
                    target = current["scope"]["target_stage"]
                    if expected_outcome == "stage_delivered" and (result["source_state"]["status"] != "available" or
                            (target in {"prd", "prototype", "spec"} and not any(a["kind"] == target and
                                a["effective_status"] in {"draft", "ready-for-review", "approved", "done"}
                                for a in (result.get("product") or {}).get("artifacts", [])))):
                        raise ProgressError("stage_not_delivered")
                result["outcome"] = outcome
                result["confirmation_request"] = None
                result.pop("confirmation_invalidated", None)
            elif outcome is not None:
                raise ProgressError("invalid_outcome")
            result.update(revision=expected + 1, updated_at=timestamp(), _request=request)
            self._event(result, "milestone", added)
            self._write(connection, result); self._prune(connection, result["run_id"])
            return result

    def refresh(self, identifier: object, collected: Snapshot) -> Snapshot:
        with self.connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            current = self._read(connection, run_id(identifier))
            result = merge_source(current, collected)
            def signature(value: Snapshot) -> str:
                source = {k: v for k, v in value["source_state"].items() if k != "checked_at"}
                return json.dumps([source, value.get("product")], sort_keys=True)
            if signature(current) == signature(result):
                return current
            if current["status"] in TERMINAL:
                raise ProgressError("new_attempt_required", public(current))
            result["confirmation_request"] = None
            if current.get("confirmation_request"):
                result["confirmation_invalidated"] = True
            result["revision"] += 1
            self._event(result, "source_refreshed")
            self._write(connection, result)
            return result

    def record_skill_load(self, identifier: object, expected: int, loaded: Any) -> Snapshot:
        with self.connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            result = self._read(connection, run_id(identifier))
            if result["status"] in TERMINAL:
                raise ProgressError("run_ended")
            existing = next((s for s in result["skill_loads"] if s["name"] == loaded.name), None)
            if existing and existing["sha256"] == loaded.digest and expected <= result["revision"]:
                return result
            if type(expected) is not int or expected != result["revision"]:
                raise ProgressError("revision_conflict", public(result))
            if not existing and len(result["skill_loads"]) >= 32:
                raise ProgressError("skill_load_limit")
            receipt = {"name": loaded.name, "sha256": loaded.digest, "loaded_at": timestamp(),
                       "kind": "workflow" if loaded.is_workflow else "skill", "source": "mcp_skill_load"}
            result["skill_loads"] = [s for s in result["skill_loads"] if s["name"] != loaded.name] + [receipt]
            if loaded.is_workflow:
                result["workflow"] = loaded.name
            result["revision"] += 1
            self._event(result, "skill_loaded")
            result["history"][-1]["skill"] = loaded.name
            self._write(connection, result)
            return result
