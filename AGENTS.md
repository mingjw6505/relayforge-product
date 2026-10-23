# RelayForge Product Plugin

## Repository expectations

- Keep the root `plugin.json` portable and valid against the Agent Plugins schema.
- Keep Codex compatibility metadata in `.codex-plugin/plugin.json` and Claude Code metadata in `.claude-plugin/plugin.json` aligned with the root manifest.
- Put reusable workflows in `skills/<skill-name>/SKILL.md` with YAML front matter containing `name` and `description`.
- Keep skill descriptions specific enough to define activation boundaries; do not put unrelated workflows in one skill.
- Keep RelayForge Product product-side only: requirements, UX decisions, PRDs, prototypes, specs, and local ticket breakdowns. Do not add coding, testing, deployment, or release workflows to this plugin.
- Prefer existing project documentation conventions; otherwise use `docs/relayforge/` and its documented artifact layout.
- Treat `using-relayforge-product` as the workflow controller and keep specialist skills focused on one product stage.
- Before every commit whose target branch is `main`, increment the patch component of the plugin version by 1 (for example, `0.1.0` → `0.1.1`). Treat the root `plugin.json` as the source of truth, then update the `version` field in `.codex-plugin/plugin.json` and `.claude-plugin/plugin.json` to the same value.
- Do not commit to `main` when the three plugin manifests have different versions, or when the version has not been incremented for that commit. A commit intended for another branch may follow the normal versioning decision for that branch.
- Validate JSON and Markdown structure before handing off changes.
- Do not add MCP servers, hooks, credentials, or external dependencies unless the feature explicitly requires them.

## Verification

Run the following checks after changing plugin metadata or skills:

```bash
python3 -m json.tool plugin.json >/dev/null
python3 -m json.tool .codex-plugin/plugin.json >/dev/null
python3 -m json.tool .claude-plugin/plugin.json >/dev/null
```

Before a `main` commit, also verify that all plugin manifest versions match:

```bash
python3 - <<'PY'
import json
from pathlib import Path

paths = [Path("plugin.json"), Path(".codex-plugin/plugin.json"), Path(".claude-plugin/plugin.json")]
versions = {json.loads(path.read_text())["version"] for path in paths}
assert len(versions) == 1, f"manifest versions differ: {versions}"
print(f"Plugin version: {versions.pop()}")
PY
```
