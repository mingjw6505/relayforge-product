"""Collect one bound requirement through the fixed, read-only Node helper."""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from progress_panel.state import ProgressError, timestamp

HELPER = Path(__file__).resolve().parent.parent / "skills/using-relayforge-product/scripts/workflow-state.cjs"
SOURCE_ERRORS = {"unsafe_source", "invalid_source", "migration_required", "source_changed", "source_too_large"}


def binding(value: object) -> dict:
    if not isinstance(value, dict) or set(value) != {"project_root", "state_path"}:
        raise ProgressError("invalid_binding")
    root, state = value["project_root"], value["state_path"]
    if (not isinstance(root, str) or not isinstance(state, str) or
            not root or not state or len(root) > 4096 or len(state) > 1024 or
            any(ord(c) < 32 for c in root + state)):
        raise ProgressError("invalid_binding")
    if not Path(root).is_absolute() or Path(state).is_absolute():
        raise ProgressError("invalid_binding")
    root_path = Path(root).resolve()
    state_path = root_path / state
    if not state_path.resolve().is_relative_to(root_path) or state_path.resolve() == root_path:
        raise ProgressError("invalid_binding")
    return {"project_root": str(root_path), "state_path": state}


def collect(bound: dict) -> dict:
    unavailable = {"status": "unavailable", "checked_at": timestamp()}
    executable = shutil.which("node")
    if executable is None:
        return {"source_state": {**unavailable, "error_code": "node_unavailable"}}
    try:
        with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
            process = subprocess.run(
                [executable, str(HELPER), "snapshot", "--project-dir", bound["project_root"],
                 "--state", bound["state_path"]], stdout=out, stderr=err, timeout=5,
                check=False,
            )
            if out.tell() > 256 * 1024 or err.tell() > 256 * 1024:
                return {"source_state": {**unavailable, "error_code": "source_too_large"}}
            out.seek(0); err.seek(0)
            if process.returncode:
                try:
                    code = json.loads(err.read()).get("error")
                except (ValueError, AttributeError):
                    code = "invalid_source"
                code = code if code in SOURCE_ERRORS else "source_unavailable"
                return {"source_state": {**unavailable, "status": "migration_required" if code == "migration_required" else "unavailable", "error_code": code}}
            result = json.load(out)
            if not isinstance(result, dict) or set(result) != {"source_state", "product"}:
                raise ValueError("invalid_snapshot")
            return result
    except subprocess.TimeoutExpired:
        code = "source_timeout"
    except (OSError, ValueError):
        code = "source_unavailable"
    return {"source_state": {**unavailable, "error_code": code}}
