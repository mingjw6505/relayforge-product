# Workflow contract

The controller and specialist skills share these stage names:

```text
discovery
clarifying
prd
prototype
spec
tickets
completed
```

Artifact statuses are:

```text
draft
ready-for-review
approved
in-progress
done
```

## Readiness checklist

Use `present`, `assumed`, or `missing` for each item. An assumed item is visible
in `待确认假设` and does not become a confirmed decision merely because work
continues.

| Stage or gate | Minimum required items |
| --- | --- |
| PRD fast path | problem, user, goal, scope, non-goals, success signal |
| Prototype review | target scenario, key screens, key states, primary interactions |
| Specification | confirmed PRD goal and scope; confirmed prototype interactions when a prototype is relevant |
| Tickets | confirmed spec behavior rules and acceptance criteria |

A `missing` item blocks the next stage only when different answers would
materially change its boundary or acceptance criteria. Otherwise record a
clearly labeled assumption and keep the artifact `ready-for-review`.

## Project-level active pointer

`docs/relayforge/workflow-state.md` should be machine-scannable:

```markdown
# RelayForge workflow

- Active requirement: <requirement-slug>
- State file: docs/relayforge/workflows/<requirement-slug>/state.md
- Last updated: <ISO 8601 timestamp with timezone>
```

Do not change this pointer when the user must first choose among multiple
candidate requirements.

Requirement state files should include:

```markdown
# <Requirement name>

- Requirement slug:
- Current stage:
- Status:
- Last updated: <ISO 8601 timestamp with timezone>
- Initial request:

## Readiness

```yaml
problem: missing
user: missing
goal: missing
scope: missing
non_goals: missing
success_signal: missing
```

## Confirmed decisions

## 待确认假设

## Open questions

## Blockers

## Produced files

| Artifact | Path | Version | Status | SHA-256 |
| --- | --- | --- | --- | --- |

## Approval log

| Artifact | Path | Version | SHA-256 | Approved scope | Approved at | Approved by | Approval state |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Next step
```

The controller may choose a different heading layout when an existing project
convention requires it, but these fields must remain discoverable.

## Artifact identity and approval

- Every reviewable artifact has a visible version, starting at `v1`. A Markdown
  artifact may put it beside its status; a prototype may put it in its README.
- After a valid confirmation, update the artifact status to `approved`, then
  compute the lowercase SHA-256 recorded in the approval log. For a multi-file
  prototype or ticket set, fingerprint a deterministic manifest of sorted
  relative paths and each file's SHA-256.
- A confirmation prompt names the artifact type, version, and scope. Record the
  exact path, version, fingerprint, approved scope, ISO 8601 time with timezone,
  and the user's available display name or `workspace user`.
- A short generic confirmation can bind only to the single artifact named in
  the immediately preceding prompt. If multiple artifacts or checkpoints are
  pending, ask a disambiguating question and leave all statuses unchanged.
- Any substantive content change after approval invalidates that approval. A
  workflow-managed status-only transition while recording the approval does
  not. Increment the version for a material revision, recompute the fingerprint,
  set the artifact to `ready-for-review`, and mark the old log row `stale`.
