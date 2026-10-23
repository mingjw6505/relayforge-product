---
name: to-tickets
description: "Break a confirmed product specification into local, reviewable tracer-bullet tickets with user-visible outcomes, acceptance criteria, and blocking edges."
disable-model-invocation: true
---

# To Tickets

Turn a confirmed product specification into local Markdown tickets. Do not
publish to an external tracker and do not mark work ready for implementation
without the user's approval of the breakdown.

## Before writing

Read the active requirement state and confirmed specification. If the spec or
acceptance criteria are not confirmed, pause and route back to `to-spec` or ask
for the missing confirmation. First present the proposed ticket breakdown in
chat so the user can adjust granularity and dependencies.

Unless the project has another convention, write:

```text
docs/relayforge/tickets/YYYY-MM-DD-<requirement-slug>/
├── index.md
├── 01-<ticket-slug>.md
└── 02-<ticket-slug>.md
```

Number blockers before the tickets they unblock. Each ticket must be a
demonstrable vertical product slice rather than a layer-only task.

## Ticket format

Each ticket includes:

- title;
- user-visible outcome;
- status (`ready-for-review` initially);
- blocked by;
- acceptance criteria;
- in scope;
- out of scope;
- linked PRD and specification;
- unresolved questions.

The index records the dependency order, total tickets, and the confirmation
status of the breakdown.

After the user approves the breakdown, update the tickets to `approved` and
the requirement state. Never infer approval from silence.
