# Product progress display

Use the bundled `relayforge-product-progress` tools when available for actual
RelayForge product work. This is a view of the product workflow, not a new
approval authority. Missing tools/UI/runtime must not block product work.
When tools are missing, launch fails, node_unavailable is reported or the user
reports a panel failure, follow [panel runtime recovery](panel-recovery.md) once:
diagnose first, offer an explicit installation choice for evidenced runtime
problems, and continue text progress while the optional choice is pending.

## Entry check for every product Skill

Apply this before the first discovery/interview question or artifact, including
a direct specialist invocation or a generic “请使用插件帮我生成 PRD”. Reuse a
check already performed for this conversation; do not repeat it on each stage.
This is an agent instruction, not a host startup hook or proof that setup ran.

1. Inspect whether start_product_progress and update_product_progress are
   actually available in this chat. An installed/enabled plugin or an MCP
   initialize handshake alone does not prove the host exposed its tools.
2. If absent, immediately say in chat that the product progress service is not
   loaded and that runtime diagnosis is starting. Follow
   [panel runtime recovery](panel-recovery.md) once, even when entering through
   a specialist. Report the observed installed package version/path and result.
   If runtimes pass but tools remain absent, say that MCP loading/host connection
   is still unverified; do not claim a missing environment or prescribe an install.
   Continue independent product work with explicit text progress.
3. If present, use the controller to select/initialize/resume the requirement,
   then call start_product_progress once before substantive product work. A
   specialist with no run must bootstrap through the controller instead of
   skipping the card. A PRD-only request stays stage_delivery targeting prd;
   do not expand its scope to a full workflow just to create a card.
4. Inspect the actual start result. On launch/tool/source errors, perform recovery
   and report the result. Reuse an existing run_id on subsequent transitions.
   A successful call means the service answered; rendering remains unverified
   unless the host or user supplies evidence. A reported invisible panel must
   still trigger recovery even when the tools exist.

This check must precede the specialist's optional-tool fallback. Do not silently
skip it because product work is allowed to continue without a card. Never create
test requirements or product cards just to troubleshoot plugin setup.

## One task, one selected requirement

Resolve the requirement and initialize/resume its state through the existing
controller before creating a card. Preserve custom documentation roots. Never
bind a guessed requirement, change the active pointer to fill the card, or
create a panel for unrelated questions or downstream development work.

Call `start_product_progress` once with a recognizable title, actual steps,
`scope`, and `source_binding`. The binding uses an absolute `project_root` and
project-relative `state_path`; it never changes to another requirement within
the run. `product_workflow` covers the full agreed product scope;
`stage_delivery` covers a request such as a PRD draft. Do not add unrequested
stages merely to fill a step bar. Exactly one step is active while running or
waiting. Record an irrelevant prototype as skipped only with its actual reason
in workflow state; absent history is not evidence of completion.

```json
{
  "title": "知识库搜索 · PRD 草案",
  "scope": {"kind": "stage_delivery", "target_stage": "prd"},
  "source_binding": {
    "project_root": "/path/to/project",
    "state_path": "docs/relayforge/workflows/knowledge-search/state.md"
  },
  "steps": [{"label": "编写 PRD", "status": "active"}],
  "details": {"current": "整理搜索范围与成功指标"}
}
```

Retain the returned run_id and revision. Every write, including skill loads and
a source-changing reopen, can advance revision. Never persist these references
in committed product artifacts. Across skills reuse this run. Across chats use
a reliably known run reference only when it binds the same source; otherwise
create a fresh card for the selected requirement, without inventing past history.
There is no global latest-task lookup or task list.

## Load actual selected instructions

When entering a selected bundled Skill, use
`load_product_skill(run_id, expected_revision, skill)` when available. Use its
folder slug; apply the returned instructions and retain the new revision.
Only `using-relayforge-product` selects the current workflow; the other five
are specialist skills. Read only actually selected instructions, once per
unchanged file. Track the returned loaded_skill to avoid recursively reloading
the same Skill. Do not preload planned skills or invent receipts for host loads,
external skills or direct file reads. A receipt proves reading, not execution,
approval or success. If unavailable, read the Skill normally and continue.

## Milestones and product facts

Use `update_product_progress` after real artifact registration, mode changes,
dependency reconciliation and approvals. Pass the latest revision, actual
status and full steps; `details` carries short current/change/remaining/reason
and waiting_for (user/external). Omitted details preserve applicable declarations;
null clears them. Do not send raw prompts, code, commands, logs or credentials.

Product mode, artifacts, approval records, fingerprints, readiness and dependency
validity are imported by the server from its fixed read-only `snapshot` helper.
Do not send `product`, approval booleans or forged provenance. Card refresh reads
only the cache; it does not monitor files or mutate source state. Source checks
happen at start, milestones and explicit reopen. The UI shows their time.

The helper's existing `check` and `gate` write state. Continue to use them at
the controller's normal resume/advance points, not as a polling mechanism. If
the snapshot reports invalid inputs, reconcile through the existing bookkeeping
workflow before advancing; viewing the card never persists an invalidation.
Source failure keeps the last snapshot marked unverified, not currently valid.
Do not claim successful checking while the source is unavailable.

## Confirmation and approval

Use waiting only for a real dependency. `waiting_for=user` alone does not create
an approval request: questions and missing inputs can simply await the user's
answer. For an artifact confirmation, declare one `confirmation_request`:

- target_kind, artifact_id, version and sha256 identify the current artifact;
- scope_summary names the precise review scope (up to 600 characters);
- included_inputs contains exact artifact/version/sha256 snapshots, empty except
  for a fast-mode final specification confirmation.

Fast-mode spec requests must include its actual inputs and state the referenced
PRD goal/scope and relevant prototype interactions, behavior and acceptance
criteria. One final target, no implied separate approval of source drafts.
Standard mode and assumption-based drafts retain the existing upstream gates.

A boundary checkpoint without a registered artifact uses target_kind=boundary,
artifact_id=null, a visible checkpoint version and the current state SHA-256.
It is a checkpoint confirmation, not an invented artifact approval.

After declaring the request, ask the user in chat according to the workflow
contract. Read the actual answer and resolve ambiguity. Only after an existing
`approve` command succeeds should the card show approval. The server checks
binding, not the truth of the conversation. Never call approve because a card
was opened, a step finished, the user said an ambiguous “继续”, or a Skill loaded.
When the source changes, replace the obsolete confirmation target; never silently
apply its old scope. Cards have no approve button.

## End and recover

- Full workflow: completed + outcome=product_approved requires a real current
  specification approval and valid input dependencies; stop at product handoff.
- Stage-only request: completed + outcome=stage_delivered means that requested
  draft/scope was delivered; artifacts may still be unapproved. Do not call the
  full product workflow complete.
- Ordinary missing approval or re-review is running or a real waiting state.
  blocked + outcome=blocked means this attempt actually ended unable to deliver.
- Explicit user cancellation uses cancelled + outcome=cancelled.
- Ended tasks have no active steps. A completed run has only done/skipped steps.
  A blocked attempt has one blocked step. End the actual attempt before replying.

Waiting spans chat turns. Ending a reply does not end the task. Terminal runs
are immutable; after a completed product is revised, open a new run using a
known previous_run_id, preserve its historical snapshot, and resume the earliest
affected product stage. Reopening a changed terminal source reports
new_attempt_required rather than rewriting its past outcome.

Use `open_product_progress(run_id)` only when requested to show/restore a known
card. It returns the latest revision after source collection; never call it on
a timer or to force updates. A revision conflict supplies this run's current
snapshot: reconcile and retry once, retaining the latest revision. Identical
response-loss retries do not duplicate history. Missing/pruned state means
unavailable progress; continue the product work without restart/install loops.
A missing/pruned task alone is not evidence of a missing runtime and must not
trigger an installation offer.

Keep necessary findings, questions and final results in chat. Do not repeat
the full card checklist after every update. Closing/pausing the card does not
cancel or pause product work. Normal communication and product approvals remain.
