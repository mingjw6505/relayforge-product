---
name: to-spec
description: Turn an approved or reviewable PRD and confirmed prototype decisions into a local product specification covering behavior, states, edge cases, and acceptance criteria.
disable-model-invocation: true
---

# To Spec

Create or update a local product specification. This skill is product-side and
does not describe implementation code or publish to an issue tracker.

## Before writing

Read the active requirement state, PRD, and prototype notes when present. The
PRD goal and scope must be confirmed before creating an approved spec. If the
prototype is required for the requested behavior but its key interactions are
not confirmed, pause and ask for that confirmation or produce a clearly marked
draft with `待确认假设`.

Use existing project conventions. Otherwise write:

```text
docs/relayforge/specs/YYYY-MM-DD-<requirement-slug>.md
```

## Required specification sections

1. Product objective and scope reference
2. Entry points and user flows
3. Screens, states, and visibility rules
4. Behavior rules and interaction details
5. State model and transitions
6. Empty, loading, error, and unavailable states
7. Boundary conditions and non-goals
8. Acceptance criteria
9. Open questions
10. `待确认假设`
11. Confirmation status and next step

Describe externally observable product behavior. Do not introduce technical
architecture, APIs, schemas, or file paths unless the user explicitly asks for
those product constraints.

## Handoff

Ask the user to confirm the behavior and acceptance criteria. Keep the spec in
`ready-for-review` until explicit confirmation; only then may it become
`approved` and unblock `to-tickets`.
