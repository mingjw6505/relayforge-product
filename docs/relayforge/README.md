# RelayForge product workspace

This directory stores product-side working agreements and generated artifacts.
The plugin follows existing project conventions when they are explicit. When
no convention exists, use this layout:

```text
docs/relayforge/
├── workflow-state.md
├── prd/
├── prototypes/
├── specs/
└── workflows/<requirement-slug>/
    ├── state.md
    ├── decisions.md       # optional
    └── glossary.md        # optional
```

## Modes and state dependencies

New requirements default to `Workflow mode: standard`; an explicit quick-mode
request records `fast`. Resume retains the mode. Fast mode produces PRD,
relevant prototype and specification drafts continuously and stops for one
spec confirmation covering its referenced goal, scope, core interactions,
behavior and acceptance criteria. It does not automatically approve the source
PRD or prototype. Specification approval completes the product workflow in
both modes; downstream development planning belongs to a separate workflow.

Artifact records live in a fenced JSON section in state.md, with generated
Produced files and Approval log tables. Every output records upstream artifact
IDs, versions and SHA-256 fingerprints. Changes invalidate all affected
approvals transitively. The helper's `check`, `register`, `approve`, `gate` and
`mode` commands maintain these records; see the
[command reference](../../skills/using-relayforge-product/references/state-commands.md).
Existing table-only states need migration preserving provenance; unverifiable
approvals become stale rather than being silently adopted.

With an existing project documentation convention, pass `--docs-dir` to `init`
and use that root consistently for state and outputs. The directory must remain
inside the project. Do not create a parallel default documentation tree.

## Naming and lifecycle

Use `YYYY-MM-DD-<requirement-slug>` for top-level artifact names. During an
iteration, update the associated artifact instead of creating a copy. Create a
new file copy only when the user explicitly asks to preserve history. Increment
the visible artifact version whenever content or its input baseline changes.

Artifacts use these statuses:

- `draft`
- `ready-for-review`
- `approved`
- `in-progress`
- `done`

The workflow state records the current requirement, stage, confirmed decisions,
assumptions, open questions, blockers, produced files, and next step. A project
level `docs/relayforge/workflow-state.md` points to the active requirement; the
requirement-specific `workflows/<slug>/state.md` remains the source of truth.

On first use, create both files before discovery continues. Generate a
user-recognizable kebab-case slug, preserve an existing requirement directory,
and add a numeric suffix on collision. The bundled controller helper can make
this deterministic:

```text
node <skill-dir>/scripts/workflow-state.cjs init --project-dir <project-root> --slug <slug> --name <name> --request <request>
```

Each reviewable artifact starts at `v1`, links to its workflow state and related
artifacts, and is registered in `state.md` with a SHA-256 fingerprint. Approval
records bind artifact path, version, fingerprint, scope, time, and approver. A
content or input change invalidates the prior approval and all transitive
dependants, returning them to `ready-for-review`. Check state before relying on
an older artifact's embedded status label.

The workflow is intentionally product-side only:

```text
idea or fuzzy request → clarification → PRD → prototype → spec → approved handoff
```

Do not mark an output `approved` until the user confirms it. If the user asks to
continue with assumptions, record every such assumption as `待确认假设`.
When more than one confirmation is pending, a generic “可以” or “确认” is
ambiguous and must not advance the workflow.
