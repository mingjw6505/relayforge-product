"""MCP stdio endpoint for task-scoped progress. No network or runtime dependencies."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO

from progress_panel.skills import load_bundled_skill
from progress_panel.state import ProgressError, ProgressStore

from progress_panel.protocol import RESOURCE_URI, tools, validate
from progress_panel.source import binding, collect
from progress_panel.state import public

MAX_REQUEST_BYTES = 16 * 1024

@dataclass
class RpcError(ValueError):
    """A JSON-RPC error that never includes the caller's input."""

    code: int
    message: str


def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """Reject ambiguous duplicate JSON keys, including nested tool arguments."""
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate_json_key")
        result[key] = value
    return result


def invalid_constant(_: str) -> None:
    """JSON NaN and Infinity are not valid protocol values."""
    raise ValueError("invalid_json_constant")


class ProgressServer:
    """Handle synchronous, bounded MCP requests; SQLite serializes shared writers."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self._store: ProgressStore | None = None

    @property
    def store(self) -> ProgressStore:
        """Create private state only when a tool actually needs it."""
        if self._store is None:
            self._store = ProgressStore(self.directory)
        return self._store

    def call_tool(self, name: object, arguments: object) -> dict[str, Any]:
        try:
            definition = next((item for item in tools() if item["name"] == name), None)
            if definition is None:
                raise ProgressError("unknown_tool")
            validate(arguments, definition["inputSchema"])
            if name == "start_product_progress":
                bound = binding(arguments["source_binding"])
                state = self.store.start(arguments, collect(bound), bound)
            elif name == "load_product_skill":
                loaded = load_bundled_skill(Path(__file__).resolve().parent.parent / "skills", arguments["skill"])
                state = self.store.record_skill_load(arguments["run_id"], arguments["expected_revision"], loaded)
                return {"structuredContent": {"run_id": state["run_id"], "revision": state["revision"],
                        "loaded_skill": loaded.name, "source": "mcp_skill_load"},
                        "content": [{"type": "text", "text": loaded.instructions}]}
            else:
                state = self.store.read(arguments["run_id"])
                if name == "update_product_progress":
                    state = self.store.update(arguments, collect(state["_binding"]))
                elif name == "open_product_progress":
                    state = self.store.refresh(arguments["run_id"], collect(state["_binding"]))
            state = public(state)
            if name == "update_product_progress":
                state = {key: state[key] for key in ("run_id", "revision", "status", "updated_at", "source_state", "confirmation_request")}
            return {"structuredContent": state,
                    "content": [{"type": "text", "text": json.dumps(state, ensure_ascii=False)}]}
        except ProgressError as error:
            data = {"error": error.code}
            if error.current is not None:
                data["current"] = error.current
            return {"isError": True, "structuredContent": data,
                    "content": [{"type": "text", "text": error.code}]}
        except (OSError, sqlite3.Error):
            return {"isError": True, "structuredContent": {"error": "storage_unavailable"},
                    "content": [{"type": "text", "text": "storage_unavailable"}]}

    def dispatch(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        """Implement MCP discovery, tools and the one packaged UI resource."""
        if method == "initialize":
            requested = params.get("protocolVersion")
            supported = {"2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"}
            version = json.loads(
                (Path(__file__).resolve().parent.parent / "plugin.json").read_text()
            )["version"]
            return {
                "protocolVersion": (
                    requested if requested in supported else "2025-11-25"
                ),
                "capabilities": {"tools": {}, "resources": {}},
                "serverInfo": {"name": "relayforge-product-progress", "version": version},
                "instructions": (
                    "For RelayForge product work, select the requirement first, then start_product_progress once. "
                    "Reuse run_id and the latest revision across skills; load_product_skill only for selected bundled instructions. "
                    "Update at real milestones, waiting confirmations and actual outcomes. "
                    "Product facts are imported read-only; never infer approval from a draft or skill load. "
                    "Keep standard/fast mode, stage delivery and product approval distinct. "
                    "Only explicit, version-bound user confirmation authorizes the existing approval workflow. "
                    "Unavailable progress must not block product work; do not install or restart to populate the card."
                ),
            }
        if method in {"ping", "resources/templates/list"}:
            return {"resourceTemplates": []} if method != "ping" else {}
        if method == "tools/list":
            return {"tools": tools()}
        if method == "tools/call":
            return self.call_tool(params.get("name"), params.get("arguments", {}))
        if method == "resources/list":
            return {
                "resources": [
                    {
                        "uri": RESOURCE_URI,
                        "name": "relayforge-product-progress-panel",
                        "mimeType": "text/html;profile=mcp-app",
                    }
                ]
            }
        if method == "resources/read":
            if params.get("uri") != RESOURCE_URI:
                raise RpcError(-32602, "unknown_resource")
            html = (Path(__file__).parent / "static/panel.html").read_text(
                encoding="utf-8"
            )
            return {
                "contents": [
                    {
                        "uri": RESOURCE_URI,
                        "mimeType": "text/html;profile=mcp-app",
                        "text": html,
                        "_meta": {
                            "ui": {
                                "prefersBorder": False,
                                "csp": {"connectDomains": [], "resourceDomains": []},
                            },
                            "openai/ui": {"availableDisplayModes": ["inline"]},
                        },
                    }
                ]
            }
        raise RpcError(-32601, "method_not_found")

    def serve(self, source: BinaryIO, target: BinaryIO) -> None:
        """Serve newline-delimited JSON-RPC with size limits and silent notifications."""
        while line := source.readline(MAX_REQUEST_BYTES + 1):
            identifier: str | int | None = None
            try:
                if len(line) > MAX_REQUEST_BYTES:
                    while line and not line.endswith(b"\n"):
                        line = source.readline(MAX_REQUEST_BYTES + 1)
                    raise RpcError(-32600, "request_too_large")
                value = json.loads(
                    line,
                    object_pairs_hook=no_duplicates,
                    parse_constant=invalid_constant,
                )
                if not isinstance(value, dict) or value.get("jsonrpc") != "2.0":
                    raise RpcError(-32600, "invalid_request")
                raw_id = value.get("id")
                if raw_id is not None and type(raw_id) not in {str, int}:
                    raise RpcError(-32600, "invalid_request_id")
                identifier = raw_id
                if "id" not in value:
                    continue
                method, params = value.get("method"), value.get("params", {})
                if not isinstance(method, str) or not isinstance(params, dict):
                    raise RpcError(-32600, "invalid_request")
                result = self.dispatch(method, params)
                response = {"jsonrpc": "2.0", "id": identifier, "result": result}
            except (ValueError, UnicodeDecodeError) as error:
                code, message = (
                    (error.code, error.message)
                    if isinstance(error, RpcError)
                    else (-32700, "parse_error")
                )
                response = {
                    "jsonrpc": "2.0",
                    "id": identifier,
                    "error": {"code": code, "message": message},
                }
            except (OSError, sqlite3.Error, TypeError):
                response = {
                    "jsonrpc": "2.0",
                    "id": identifier,
                    "error": {"code": -32603, "message": "service_unavailable"},
                }
            target.write(
                (json.dumps(response, ensure_ascii=False) + "\n").encode("utf-8")
            )
            target.flush()


def data_directory() -> Path:
    """Use host-managed data when supplied, otherwise a separate local state folder."""
    override = os.environ.get("RELAYFORGE_PRODUCT_PROGRESS_DATA_DIR")
    if override:
        return Path(override).expanduser()
    managed = os.environ.get("PLUGIN_DATA") or os.environ.get("CLAUDE_PLUGIN_DATA")
    if managed:
        return Path(managed).expanduser() / "product-progress-panel"
    if sys.platform == "darwin":
        return Path.home() / "Library/Application Support/RelayForge/product-progress-panel"
    if os.name == "nt":
        return (
            Path(os.environ.get("LOCALAPPDATA", str(Path.home())))
            / "RelayForge/product-progress-panel"
        )
    return (
        Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local/state")))
        / "relayforge-product/progress-panel"
    )


def main() -> None:
    """Start a foreground stdio server; errors never print input or credentials."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=None)
    arguments = parser.parse_args()
    ProgressServer(arguments.data_dir or data_directory()).serve(
        sys.stdin.buffer, sys.stdout.buffer
    )


if __name__ == "__main__":
    main()
