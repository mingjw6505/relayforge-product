# RelayForge Product Plugin

RelayForge Product is a product-side workflow plugin for Codex, Claude Code,
ChatGPT, and compatible agent hosts. It helps product managers and builders
turn an idea or fuzzy request into a clarified product boundary, PRD, clickable
prototype and approved product specification.

It deliberately stops before implementation, testing, deployment, and release.

## Layout

- `plugin.json` — portable Agent Plugins manifest.
- `.codex-plugin/plugin.json` — Codex compatibility manifest.
- `.claude-plugin/plugin.json` — Claude Code manifest.
- `.agents/plugins/marketplace.json` — repo marketplace manifest for Codex/ChatGPT.
- `.claude-plugin/marketplace.json` — native Claude Code marketplace manifest.
- `skills/` — reusable workflows, one directory per skill.
- `progress_panel/` — optional local MCP product progress service and bundled inline UI.
- `mcp.json` / `.mcp.json` — portable / native compatibility MCP registration.
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
python scripts/check.py
```

Use `python3` on systems where that is the Python executable. The entry point
checks the pinned portable manifest schema, host-specific marketplace formats,
shared metadata/version alignment, skill/UI YAML, Markdown fences and links,
JavaScript syntax, and regression tests. YAML parsing uses an existing PyYAML
installation or Ruby's standard library; the check never installs packages.
Contributor checks need Node.js 22 or later for the built-in test WebSocket.
Use `--structure-only` for metadata and document validation. If the Claude CLI
is installed, the full check also runs `claude plugin validate`; otherwise it
reports that native check as skipped. Offline host checks cover this repository's
manifest fields, not every possible host feature.
Claude's `disable-model-invocation` front matter is retained and checked against
Codex's `allow_implicit_invocation` UI policy. The repository checker accepts
that host extension even when a generic skill validator does not.

The portable schema is pinned from
[Agent Plugins 1.0.0](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json).
Root `plugin.json` uses conventional root `skills/` discovery. The Codex
compatibility file retains `skills: "./skills/"` and omits the portable schema
marker. See [OpenAI packaging](https://developers.openai.com/plugins/build/plugins)
and [Claude marketplace fields](https://code.claude.com/docs/en/plugins/marketplace-reference)
for the two supported host layouts.

## Workflow modes

New requirements use standard mode: clarify, then confirm each applicable PRD,
prototype and spec checkpoint. Complete PRD inputs skip unnecessary
interviewing without changing this mode.

Ask explicitly for fast mode, for example: “快速模式，把这个需求连续整理到规格草案”.
It records the mode in durable state, drafts the PRD, a relevant prototype and
the spec without intermediate approval pauses, and stops at spec review.
Unconfirmed decisions remain labeled assumptions. The final spec confirmation
explicitly covers its referenced PRD goal/scope and core prototype interactions.
That approval binds the input versions and fingerprints without separately
approving the PRD or prototype. Specification approval completes the product
workflow; downstream development planning belongs to a separate workflow.
A bare “继续” never changes modes or grants an ambiguous approval.

Artifact records bind upstream input versions and fingerprints. Changes or
missing inputs invalidate affected downstream approvals transitively; reconcile
and register new versions before asking for approval again. See the
[workflow contract](skills/using-relayforge-product/references/workflow-contract.md)
and [state helper commands](skills/using-relayforge-product/references/state-commands.md).

Product outputs are written to the current project workspace. Existing project
conventions take precedence; otherwise use `docs/relayforge/` as described in
the [workflow controller](skills/using-relayforge-product/SKILL.md).

The optional bundled product progress card shows product stages, artifacts and
approval scope using the selected workflow's read-only snapshot. It uses local
Python 3.11+ and Node.js 18+ for factual state collection, with no credentials,
cloud services or hooks. Core product work can continue without the card.
The MCP entry uses the bundled Node launcher to locate a compatible Python
interpreter (python, python3 or the Windows py launcher), then starts the service
with its actual executable path. A working python command is sufficient on
Windows; a python3 alias is not required. Nothing is installed by the launcher.
If a panel cannot start, the controller checks the affected runtime once and
offers a concrete choice in chat: assisted installation after consent, manual
setup instructions, or continuing without installation. Existing Python launch
command mismatches are handled separately from missing runtimes. Host rendering
failures cannot always be observed automatically; report them in chat to trigger
diagnosis. See [panel recovery and setup](skills/using-relayforge-product/references/panel-recovery.md)
and [panel boundaries](skills/using-relayforge-product/references/progress-panel.md).
The UI/SDK is already bundled; contributors run npm ci in progress_panel/web
before UI build/tests. Runtime use does not require npm or network access.

The optional browser visual companion has native Bash and PowerShell launchers.
On Windows, use `skills/brainstorming/scripts/start-server.ps1`; it requires
Node.js 18+ but does not require Bash or WSL. Windows PowerShell 5.1 and
PowerShell 7 share the same Node lifecycle helper with the Bash launcher.
The default launch resumes the project's active session and screens; use
`-NewSession` / `--new-session` for an independent session. Shutdown verifies
an authenticated instance instead of requiring CIM process inspection.
Product artifacts can always fall back to self-contained static HTML when the
interactive companion cannot start.

## Install from this repository

When adding this GitHub repository as a marketplace, use:

```text
https://github.com/mingjw6505/relayforge-product
```

The repository includes marketplace manifests that point to the root plugin
package. If the desktop app cached the previous invalid marketplace, remove or
refresh that marketplace and add the repository again.

For Claude Code, add and install through its native marketplace commands:

```text
claude plugin marketplace add mingjw6505/relayforge-product
claude plugin install relayforge-product@relayforge-product-marketplace
```

The controller reads the selected sibling skill's file, so explicit-only
specialists remain usable without depending on automatic host invocation.
