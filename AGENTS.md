# RelayForge Product Plugin

## Repository expectations

- Keep the root `plugin.json` portable and valid against the Agent Plugins schema.
- Keep Codex compatibility metadata in `.codex-plugin/plugin.json` and Claude Code metadata in `.claude-plugin/plugin.json` aligned with the root manifest.
- Put reusable workflows in `skills/<skill-name>/SKILL.md` with YAML front matter containing `name` and `description`.
- Keep skill descriptions specific enough to define activation boundaries; do not put unrelated workflows in one skill.
- Keep RelayForge Product product-side only: requirements, UX decisions, PRDs, prototypes, specs, and local ticket breakdowns. Do not add coding, testing, deployment, or release workflows to this plugin.
- Prefer existing project documentation conventions; otherwise use `docs/relayforge/` and its documented artifact layout.
- Treat `using-relayforge-product` as the workflow controller and keep specialist skills focused on one product stage.
- Validate JSON and Markdown structure before handing off changes.
- Do not add MCP servers, hooks, credentials, or external dependencies unless the feature explicitly requires them.

## Verification

Run the following checks after changing plugin metadata or skills:

```bash
python3 -m json.tool plugin.json >/dev/null
python3 -m json.tool .codex-plugin/plugin.json >/dev/null
python3 -m json.tool .claude-plugin/plugin.json >/dev/null
```
