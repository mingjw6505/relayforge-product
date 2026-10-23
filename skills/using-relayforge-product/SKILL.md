---
name: using-relayforge-product
description: "Route product-side requests through RelayForge Product: clarify fuzzy requirements, make UX and scope decisions, create or refine PRDs, build clickable local prototypes, write product specs, and split approved specs into local tickets. Use for natural-language product work or when the user asks to continue a RelayForge workflow."
---

# Using RelayForge Product

Use this skill as the product-workflow controller. It orchestrates the
specialist skills in this plugin; it does not replace their product writing.

For the shared stage names, artifact statuses, and state-file fields, read
`references/workflow-contract.md` when creating or updating workflow state.

## Scope

RelayForge Product covers product definition only:

```text
idea or fuzzy request → clarification → PRD → prototype → spec → tickets
```

Stop before coding, implementation planning, testing, deployment, or release.
Do not connect to an issue tracker or external MCP service for the default
workflow.

## Identify the requirement

Treat the current project workspace as the default project root. Follow existing
documentation conventions when they are explicit. Otherwise use
`docs/relayforge/` and the paths in `docs/relayforge/README.md`.

Resolve the active requirement in this order:

1. A requirement name or slug explicitly stated by the user.
2. The requirement named in `docs/relayforge/workflow-state.md`.
3. The only matching requirement directory or artifact in `docs/relayforge/`.
4. Ask the user to choose among candidates. Never mix requirements silently.

Read `docs/relayforge/workflows/<slug>/state.md` when it exists before routing.

## Route the request

- Product idea, discovery, options, UX exploration, or prototype discussion →
  `brainstorming`.
- Unclear requirements, scope, conflicting decisions, or missing inputs →
  `grilling`.
- Clarification that must leave durable decisions or terminology →
  `grill-with-docs`.
- Create or revise a PRD → `to-prd`.
- Create or revise a product specification → `to-spec`.
- Split an approved specification into local tasks → `to-tickets`.
- “Continue the product work” → read state and resume the recorded stage.

If the user explicitly names a specialist skill, honor that target but still
check its prerequisites first.

## Prerequisite gates

- Do not create a formal PRD from a materially fuzzy request. Clarify the
  problem, users, goal, scope, and success signal first.
- Do not create a formal spec until the PRD and key prototype interactions are
  confirmed, unless the user explicitly requests an assumption-based draft.
- Do not create tickets until the spec and acceptance criteria are confirmed.
- A user confirmation is required before changing an artifact to `approved`.
- If the user says to proceed with assumptions, continue only after recording
  each assumption as `待确认假设` and keep the output in a reviewable state.

When a gate is missing, ask only the minimum questions needed to unblock the
requested stage, then return to the specialist workflow.

## Confirmation checkpoints

Pause for confirmation after:

1. clarification: requirement boundary and non-goals;
2. PRD: product goal, users, success criteria, and scope;
3. prototype: key screens, states, and interactions;
4. spec: behavior rules and acceptance criteria;
5. ticket breakdown: granularity and dependency edges.

## State and output contract

At the end of every stage, report:

- active requirement and stage;
- inputs consulted;
- files produced or updated;
- confirmed decisions;
- `待确认假设`;
- open questions and blockers;
- recommended next step;
- which confirmation is needed, if any.

Update the requirement-specific state file when a stage, decision, artifact, or
blocker changes. Keep outputs in `draft`, `ready-for-review`, or `approved`
according to the confirmation state; never imply approval that the user did not
give.

## Language and defaults

Follow the user's language, defaulting to Chinese for Chinese requests. Keep
standard field names and technical terms when they improve interoperability.
Use local Markdown and self-contained HTML/CSS/JS prototypes. Do not add
external dependencies unless the user explicitly changes the plugin scope.
