# RelayForge Product Plugin

RelayForge Product is a product-side workflow plugin for Codex, Claude Code,
ChatGPT, and compatible agent hosts. It helps product managers and builders
turn an idea or fuzzy request into a clarified product boundary, PRD, clickable
prototype, product specification, and reviewable local tickets.

It deliberately stops before implementation, testing, deployment, and release.

## Layout

- `plugin.json` — portable Agent Plugins manifest.
- `.codex-plugin/plugin.json` — Codex compatibility manifest.
- `.claude-plugin/plugin.json` — Claude Code manifest.
- `skills/` — reusable workflows, one directory per skill.
- `AGENTS.md` — repository guidance for Codex contributors.

The main entry point is `using-relayforge-product`. It routes natural-language
requests to the specialist skills while enforcing clarification and approval
gates.

## Add a skill

Create `skills/<skill-name>/SKILL.md` with front matter like:

```md
---
name: example-workflow
description: A concise description of when this workflow should activate.
---

Describe the workflow, inputs, outputs, boundaries, and verification steps.
```

Keep skills focused on one recognizable user goal. Add `scripts/`, `references/`,
or `assets/` inside the skill directory only when the workflow needs them.

## Validate

```bash
python3 -m json.tool plugin.json >/dev/null
python3 -m json.tool .codex-plugin/plugin.json >/dev/null
python3 -m json.tool .claude-plugin/plugin.json >/dev/null
```

Product outputs are written to the current project workspace. Existing project
conventions take precedence; otherwise use `docs/relayforge/` as described in
[`docs/relayforge/README.md`](docs/relayforge/README.md).

No MCP server, hooks, credentials, or runtime dependencies are configured.
