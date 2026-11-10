---
name: to-spec
description: "Write or revise a local product behavior specification from an approved PRD and relevant prototype, or produce a clearly labeled draft in explicit fast mode or when the user requests assumptions."
disable-model-invocation: true
---

# To Spec

Create or update a local product specification. This skill is product-side and
does not describe implementation code or publish to an issue tracker.

## Before writing

Read the [workflow contract](../using-relayforge-product/references/workflow-contract.md),
active state, PRD, and relevant prototype notes. Run the controller's fingerprint
check first. In standard mode, the PRD goal/scope and relevant prototype
interactions must have current approvals before writing a spec. An explicit
assumption-based draft request or persisted fast mode permits draft generation
with unapproved inputs; label their unconfirmed decisions `待确认假设`.
No prototype is required when it would not help resolve observable behavior;
record that decision instead of inventing a prototype approval checkpoint.

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

Include artifact version and status plus relative links to the active workflow
state, PRD, prototype, and decision record when present. After writing, compute
the specification SHA-256 by registering it with the current PRD, relevant
prototype and decision IDs. Refresh changed upstream records first. Any change
to the spec's content or input snapshots requires a new version and review;
the helper invalidates any dependent product artifacts transitively.

Describe externally observable product behavior. Do not introduce technical
architecture, APIs, schemas, or file paths unless the user explicitly asks for
those product constraints.

## Handoff

Ask the user to confirm the behavior and acceptance criteria with a phrase that
names the specification version and scope. Keep the spec in `ready-for-review`
until a valid bound confirmation is written to the state approval log; only
then may it become `approved` and complete the product workflow. Record
`Current stage: completed`, and hand off the approved specification and linked
product inputs. Stop before downstream development planning or implementation.
An ambiguous generic confirmation never advances this gate.

In fast mode, the final spec prompt explicitly lists the spec version, behavior
and acceptance criteria, its referenced PRD goal/scope, and relevant prototype
interactions with their versions. After a valid confirmation of that full scope,
record spec approval with `--include-inputs true`. This leaves the input PRD and
prototype individually unapproved while approving the final product
specification. Stop at review until this response arrives; then complete the
product workflow and return the approved handoff.

## Product progress

Reuse the controller's current run and latest revision under the
[product progress contract](../using-relayforge-product/references/progress-panel.md).
When available, load this actually selected Skill through load_product_skill once,
then update at real artifact/decision milestones and actual waits. Do not create
another card, infer approval from completion, or bypass the existing confirmation
rules. If tools are unavailable, continue with the normal Skill and text workflow.
