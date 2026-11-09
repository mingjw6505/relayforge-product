# Workflow contract

The controller and specialist skills share these stage names:

```text
discovery
clarifying
prd
prototype
spec
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
| PRD shortcut | problem, user, goal, scope, non-goals, success signal |
| Prototype review | target scenario, key screens, key states, primary interactions |
| Standard specification | approved PRD goal/scope; approved prototype interactions when relevant |
| Fast-mode or explicitly requested spec draft | registered PRD and relevant prototype; assumptions clearly labeled |

A `missing` item blocks the next stage only when different answers would
materially change its boundary or acceptance criteria. Otherwise record a
clearly labeled assumption and keep the artifact `ready-for-review`.

## Modes and final approval

`Workflow mode` is `standard` by default. Only an explicit user request changes
it to `fast`, and resume preserves the recorded value. The PRD shortcut skips
unnecessary interviewing but does not change the workflow mode.

Standard mode asks for each applicable stage approval. Fast mode can produce
PRD → relevant prototype → spec drafts continuously and stops at spec review.
Its final confirmation names one spec version and explicitly includes its
input PRD goal/scope and relevant prototype interactions. Record those input
versions and fingerprints in the spec approval with `includes_input_scope: true`.
This approves the final product specification while leaving the source PRD and
prototype individually unapproved. A spec-only confirmation without the named
input scope cannot bypass unapproved inputs. Mode changes grant no approvals.
The deferred PRD and prototype reviews are not simultaneous pending prompts;
the final specification review is the single active confirmation request.

An explicit assumption-based spec draft is also allowed in standard mode,
but its upstream approvals are required before that spec can be approved.

## Completion and handoff

A valid specification approval sets `Current stage: completed` and
`Status: approved`, with the approved specification and linked inputs as the
final handoff. Stop before downstream development planning or implementation.
A request to continue a current completed requirement returns this handoff,
unless the user asks for a product revision.

An upstream change or missing artifact invalidates the affected approvals and
reopens a completed workflow at the earliest affected product stage. Reconcile
the records and obtain fresh specification approval before completing it again.
Out-of-scope artifact records belong in their owning workflow; move their
records while preserving the actual files and approval history before resuming.

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

````markdown
# <Requirement name>

- Requirement slug:
- Current stage:
- Workflow mode: standard
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
````

The controller may choose a different heading layout when an existing project
convention requires it, but these fields must remain discoverable.

## Artifact identity and approval

- Every reviewable artifact has a visible version, starting at `v1`. A Markdown
  artifact may put it beside its status; a prototype may put it in its README.
- After a valid confirmation, update the artifact status to `approved`, then
  compute the lowercase SHA-256 recorded in the approval log. For a multi-file
  prototype, fingerprint a deterministic manifest of sorted
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

## Dependency records and invalidation

The authoritative artifact metadata lives in the `Artifact records` fenced
JSON section of `state.md`. Its `schema_version` is `1`, with `artifacts`
(an ID-keyed object) and `approvals` (an append-only history array). The Produced
files and Approval log tables are readable projections maintained by the helper.
Do not independently edit those tables. Product decisions, readiness, assumptions
and blockers remain ordinary Markdown in this same state file.

Each artifact records `kind`, project-relative `path`, `version`, `status`,
`sha256`, `review_required`, and `inputs`. An input snapshot binds `artifact`
ID, `version` and `sha256`. A spec must include its PRD and relevant prototype.
Include decision records when their content affects the output. Dependencies
must form an acyclic graph.

Run `check` before resuming or advancing. Changed, missing or mismatched inputs
mark their artifact and all transitive dependants `ready-for-review`, with
`review_required: true`, and mark their valid approvals `stale`. This state
status takes precedence over status text in an artifact that has since changed.
Never reuse the old approval even if the file is later restored.

Refresh upstream artifacts first. `register` increments the visible version
for changed content or input snapshots, records fresh hashes, and clears the
artifact's review flag only after its inputs are current. Downstream artifacts
remain blocked until they are reconciled and registered again.

`approve` verifies the reviewed version and hash before changing status text;
it then records the resulting file hash and the user's actual confirmation.
It may refresh downstream input hashes for this known status-only transition
at the same version. This is not permission to treat arbitrary edits as metadata
changes or rewrite historical approval rows. Fast spec approval explicitly
includes the recorded input scope; it never marks those inputs approved.

With no Node.js, maintain the same records and transitive invalidation manually.
For an existing workflow with only legacy tables, migrate its current artifact
and approval rows into the JSON section, add known input snapshots, and mark
unverifiable approvals stale. Preserve historical rows and do not invent missing
approvals. See [helper commands](state-commands.md) for the record shape and CLI.
