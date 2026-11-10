---
name: to-prd
description: "Turn clarified product decisions into a reviewable local PRD, or revise an existing RelayForge PRD. Use after the problem, users, goal, scope, and success signal are sufficiently clear."
disable-model-invocation: true
---

# To PRD

Create or update a local product requirements document from the current
conversation, project files, and confirmed workflow state. This skill does not
publish to an issue tracker.

## Before writing

Follow the [workflow contract](../using-relayforge-product/references/workflow-contract.md)
and resolve the requirement through the controller, including persisted mode.

Read the active requirement state and existing project documentation. If the
problem, users, product goal, scope, or success signal is materially unclear,
stop and route to `grilling`. In fast mode, or if the user requests a draft anyway,
write the missing decisions under `待确认假设` and keep the artifact in
`ready-for-review`, never `approved`.

If the input covers every item in the PRD shortcut checklist, create the PRD in
the same turn after a compact structured playback. Do not route to `grilling`
solely to obtain another response. Treat non-blocking gaps as `待确认假设`.

Use an existing project convention when one exists. Otherwise write:

```text
docs/relayforge/prd/YYYY-MM-DD-<requirement-slug>.md
```

Update the associated PRD file on iteration; increment its visible version for
revisions. Create a separate file copy only when the user asks to preserve one.

## Required PRD sections

1. Problem statement and context
2. Goals and success signals
3. Users, roles, and primary scenarios
4. User stories
5. Product scope
6. Non-goals
7. User-experience principles
8. Risks and constraints
9. Open questions
10. `待确认假设`
11. Confirmation status and next step

Include `Artifact version` (starting at `v1`), `Status`, and links to the active
workflow state and any related prototype or decision record. After writing,
register it with its upstream decision/boundary IDs using the controller helper.
On revision, refresh upstream records first; let registration update the visible
version and invalidate dependent outputs. Do not reuse their old approvals.

Use the user's language. Do not invent metrics, policies, or commitments; mark
missing information explicitly.

## Handoff

After writing, ask the user to confirm the goal, users, success signals, and
scope with a phrase that names the artifact and version, such as `确认 PRD v1
（目标、范围、成功指标）`. Report the active requirement, file path, confirmed
decisions, assumptions, blockers, and recommended next step. Only a valid bound
confirmation recorded in the state approval log may change the PRD status to
`approved`.

In fast mode, defer this intermediate confirmation and continue to the relevant
prototype and specification drafts. Keep the PRD `ready-for-review`; the final
spec confirmation explicitly covers its referenced PRD goal and scope.

## Product progress

Reuse the controller's current run and latest revision under the
[product progress contract](../using-relayforge-product/references/progress-panel.md).
When available, load this actually selected Skill through load_product_skill once,
then update at real artifact/decision milestones and actual waits. Do not create
another card, infer approval from completion, or bypass the existing confirmation
rules. If tools are unavailable, continue with the normal Skill and text workflow.
