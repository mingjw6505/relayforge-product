---
name: brainstorming
description: "Explore product ideas, user experience directions, information architecture, interaction flows, and low-to-medium fidelity prototypes before formalizing a RelayForge PRD or specification."
---

# Product brainstorming

Use this skill to explore what the product should be before formalizing it. The
output is product understanding and, when useful, a self-contained local
prototype—not production code.

## Start with the concrete moment

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

## Handoff

Report the user, problem, proposed direction, key screens and states, confirmed
decisions, `待确认假设`, open questions, and recommended next stage. Ask for
confirmation before handing a product boundary to `to-prd` or before treating
prototype interactions as confirmed.
