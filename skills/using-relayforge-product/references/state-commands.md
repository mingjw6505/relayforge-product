# State helper commands

The helper is product bookkeeping, not an approval authority. An agent must
establish the user's actual confirmation using the workflow contract before
calling `approve`. Paths in records are relative to the current project root,
not to the installed plugin. Quote command arguments for the current shell.

## Initialize, resume and select mode

```text
node <skill-dir>/scripts/workflow-state.cjs init --project-dir <project-root> --slug <slug> --name <name> --request <request>
node <skill-dir>/scripts/workflow-state.cjs init --project-dir <project-root> --docs-dir product/requirements --slug <slug> --name <name> --request <request> --mode fast
node <skill-dir>/scripts/workflow-state.cjs mode --project-dir <project-root> --state <state-file> --mode standard
```

`--docs-dir` is optional and must stay within the project. Without it the root
is `docs/relayforge`. New requirements default to standard mode. Resume without
`--mode` retains the recorded mode. Pass a mode only for an explicit user choice.
The helper accepts BOM, LF and CRLF state files. A collision with a different
requirement adds a numeric suffix instead of merging requirements.

## Register outputs and their inputs

```text
node <skill-dir>/scripts/workflow-state.cjs register --project-dir <project-root> --state <state-file> --artifact prd --kind prd --path <prd-file>
node <skill-dir>/scripts/workflow-state.cjs register --project-dir <project-root> --state <state-file> --artifact prototype --kind prototype --path <prototype-directory> --inputs prd
node <skill-dir>/scripts/workflow-state.cjs register --project-dir <project-root> --state <state-file> --artifact spec --kind spec --path <spec-file> --inputs prd,prototype
```

Use stable IDs. Omit `prototype` from inputs when it is irrelevant; record that
decision in state. Include any decision records that constrain the artifact.
Allowed kinds: `boundary`, `decision`, `prd`, `prototype`, `spec`.
There is one current PRD, prototype and spec per requirement.

Register after writing. The helper computes fingerprints and snapshots inputs,
starts new artifacts at `v1`, and automatically increments a revised artifact's
version. An optional `--version v2` must increase on revision. Keep the visible
metadata as plain `Artifact version: v1` and `Status: ready-for-review` lines
(optionally prefixed with `- `), so the helper can update them consistently.
Directory outputs put these fields in README.md. Directory hashes use sorted, slash-normalized
relative paths and file hashes; symlinks are rejected instead of silently omitted.

In standard mode a spec requires approved inputs. An expressly requested
assumption-based spec draft adds `--draft true`. Fast mode permits draft specs
without that flag. Both modes still require explicit final specification approval.

## Check and approve

```text
node <skill-dir>/scripts/workflow-state.cjs check --project-dir <project-root> --state <state-file>
node <skill-dir>/scripts/workflow-state.cjs gate --project-dir <project-root> --state <state-file> --stage spec --prototype-required true
node <skill-dir>/scripts/workflow-state.cjs approve --project-dir <project-root> --state <state-file> --artifact spec --version v1 --sha256 <reviewed-hash> --scope <approved-scope> --confirmation <actual-user-response>
```

`check` persists transitive invalidation and exits nonzero while any artifact
needs reconciliation. `gate` also checks fingerprints before deciding whether
the requested stage can start. Optional prototype approval is checked only with
`--prototype-required true`. `gate --stage spec --draft true` checks an explicit
draft exception. Readiness decisions still come from the controller's checklist.

Use the version and hash returned by registration for the confirmation binding.
Approval refuses a changed file, wrong version/hash, or unapproved upstreams.
In fast mode only, spec confirmation that explicitly covers its named PRD
goal/scope and prototype interactions adds `--include-inputs true`. The approval
records these snapshots without separately approving the upstream artifacts.
Approving the spec sets the stage to `completed` and records a development
handoff as the next step. An upstream revision reopens that completion for
product review; the helper does not manage downstream development work.
Use `--by` for an available display name; otherwise it records `workspace user`.
`--now` optionally supplies an ISO 8601 approval timestamp with timezone.

The helper verifies fingerprints before any approval and updates standard
Status metadata after verification. It cannot judge whether conversational
confirmation was unambiguous; that remains the controller's responsibility.

## Stored record shape

The helper appends this section to state.md and maintains the human-readable
tables from it. This is a minimal illustrative, unapproved record:

````markdown
## Artifact records

```json
{
  "schema_version": 1,
  "artifacts": {
    "prd": {
      "kind": "prd",
      "path": "docs/relayforge/prd/2026-11-10-example.md",
      "version": "v1",
      "status": "ready-for-review",
      "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
      "inputs": [],
      "review_required": false
    }
  },
  "approvals": []
}
```
````

When migrating legacy tables, compute current hashes and preserve every known
approval's original scope, time and user. Link dependencies using the actual
versions used to produce the output. If that provenance is unknown, set
`review_required: true`, status `ready-for-review`, and approval state `stale`.
Do not fabricate a current approval from an old `approved` label alone.

## Read-only product snapshot

```text
node <skill-dir>/scripts/workflow-state.cjs snapshot --project-dir <project-root> --state <state-file>
```

`snapshot` performs read-only fingerprint/dependency checks in a private memory
context and returns bounded product facts plus source identity/time. It never
writes state, metadata or the active pointer. Business invalidation returns a
valid JSON result with integrity=invalid; technical errors exit nonzero. Existing
`check` and `gate` still persist invalidation and must not be used for UI polling.
The snapshot excludes confirmation text and raw request bodies. Symlink escapes,
oversized records and mixed-version reads fail closed. Legacy table-only state
requires explicit migration; no automatic migration is performed.
