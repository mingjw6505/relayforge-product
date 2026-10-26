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
├── tickets/
└── workflows/<requirement-slug>/
    ├── state.md
    ├── decisions.md       # optional
    └── glossary.md        # optional
```

## Naming and lifecycle

Use `YYYY-MM-DD-<requirement-slug>` for top-level artifact names. During an
iteration, update the associated artifact instead of creating a copy. Create a
new version only when the user explicitly asks to preserve history.

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
content change invalidates the prior approval and returns the artifact to
`ready-for-review`.

The workflow is intentionally product-side only:

```text
idea or fuzzy request → clarification → PRD → prototype → spec → tickets
```

Do not mark an output `approved` until the user confirms it. If the user asks to
continue with assumptions, record every such assumption as `待确认假设`.
When more than one confirmation is pending, a generic “可以” or “确认” is
ambiguous and must not advance the workflow.
