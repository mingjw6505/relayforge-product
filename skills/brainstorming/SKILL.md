---
name: brainstorming
description: "Explore product ideas, user experience directions, information architecture, interaction flows, and low-to-medium fidelity prototypes before formalizing a RelayForge PRD or specification."
---

# Product brainstorming

Use this skill to explore what the product should be before formalizing it. The
output is product understanding and, when useful, a self-contained local
prototype—not production code.

## Start with the concrete moment

Read the active requirement's mode and the
[workflow contract](../using-relayforge-product/references/workflow-contract.md).

If the request is materially incomplete, ask one open question about the real
moment, user, or desired outcome. If the user explicitly asks to skip
questions, state the important assumptions and continue in a reviewable state.

## Explore the product

Cover only what helps the current decision:

- user, context, and problem;
- goals, non-goals, and anti-goals;
- existing product conventions and prior art;
- user journey and information architecture;
- screens, states, content, and interaction choices;
- success signals, constraints, and open questions.

Play back each settled part in plain language and mark your own calls as calls.
Do not treat an assumption as a user decision.

## Visual companion and prototype

Offer a browser visual companion when seeing a layout, flow, or interaction will
help more than text. When the user accepts, use the companion instructions in
`visual-companion.md`.

If a prototype is useful, create a low-to-medium fidelity local prototype under:

```text
docs/relayforge/prototypes/YYYY-MM-DD-<requirement-slug>/
├── index.html
├── styles.css
├── app.js
└── README.md
```

The prototype should be self-contained, use no external CDN or online fonts,
show the core flow and relevant empty/loading/error states, and label unresolved
designs as `待确认`. It is for product discussion, not production delivery.

Its README must include artifact version and status plus relative links to the
active workflow state, PRD, specification, and decision record when those files
exist. Add the prototype directory and its deterministic SHA-256 fingerprint to
the state artifact register using the controller helper, with the PRD and any
decision records actually used as input snapshots.

## Handoff

Report the user, problem, proposed direction, key screens and states, confirmed
decisions, `待确认假设`, open questions, and recommended next stage. Ask for
confirmation before handing a product boundary to `to-prd` or before treating
prototype interactions as confirmed. Name the prototype version and key
interaction scope in the confirmation phrase, and record valid approval using
the shared workflow contract.

In explicit fast mode, defer intermediate boundary/prototype approval and
continue to PRD or spec drafts, retaining labeled assumptions. The final spec
confirmation must explicitly cover the referenced core interactions. An
interactive companion still needs user acceptance; use a static prototype
when appropriate to keep the requested draft sequence moving.

## Product progress

Reuse the controller's current run and latest revision under the
[product progress contract](../using-relayforge-product/references/progress-panel.md).
When available, load this actually selected Skill through load_product_skill once,
then update at real artifact/decision milestones and actual waits. Do not create
another card, infer approval from completion, or bypass the existing confirmation
rules. If tools are unavailable, continue with the normal Skill and text workflow.
