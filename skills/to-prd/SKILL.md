---
name: to-prd
description: Turn clarified product decisions into a reviewable local PRD, or revise an existing RelayForge PRD. Use after the problem, users, goal, scope, and success signal are sufficiently clear.
disable-model-invocation: true
---

# To PRD

Create or update a local product requirements document from the current
conversation, project files, and confirmed workflow state. This skill does not
publish to an issue tracker.

## Before writing

Read the active requirement state and existing project documentation. If the
problem, users, product goal, scope, or success signal is materially unclear,
stop and route to `grilling`. If the user explicitly requests a draft anyway,
write the missing decisions under `待确认假设` and keep the artifact in
`ready-for-review`, never `approved`.

Use an existing project convention when one exists. Otherwise write:

```text
docs/relayforge/prd/YYYY-MM-DD-<requirement-slug>.md
```

Update the associated PRD on iteration unless the user explicitly asks for a
new version.

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

Use the user's language. Do not invent metrics, policies, or commitments; mark
missing information explicitly.

## Handoff

After writing, ask the user to confirm the goal, users, success signals, and
scope. Report the active requirement, file path, confirmed decisions,
assumptions, blockers, and recommended next step. Only a later explicit user
confirmation may change the PRD status to `approved`.
