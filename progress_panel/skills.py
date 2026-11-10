"""Read only the selected instruction file from this plugin's bundled catalog."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

from progress_panel.state import ProgressError

WORKFLOWS = {"using-relayforge-product"}


@dataclass(frozen=True)
class LoadedSkill:
    """A receipt is constructed only after a successful bounded file read."""

    name: str
    instructions: str
    digest: str
    is_workflow: bool


def load_bundled_skill(directory: Path, name: object) -> LoadedSkill:
    """Reject arbitrary paths, symlinks and external instructions before recording use."""
    if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", name):
        raise ProgressError("unknown_skill")
    folder = directory / name
    file = folder / "SKILL.md"
    try:
        if (
            folder.is_symlink()
            or file.is_symlink()
            or not file.resolve().is_relative_to(directory.resolve())
        ):
            raise ProgressError("unknown_skill")
        with file.open("rb") as source:
            payload = source.read(128 * 1024 + 1)
        if len(payload) > 128 * 1024:
            raise ProgressError("skill_too_large")
        instructions = payload.decode("utf-8")
        if not instructions.strip():
            raise ProgressError("skill_unavailable")
    except (OSError, UnicodeDecodeError) as error:
        raise ProgressError("skill_unavailable") from error
    return LoadedSkill(
        name, instructions, hashlib.sha256(payload).hexdigest(), name in WORKFLOWS
    )
