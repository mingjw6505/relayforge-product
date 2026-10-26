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
- linked workflow state and prototype or decision record when present;
- unresolved questions.

The index records artifact version, dependency order, total tickets, and the
confirmation status of the breakdown. Add the ticket directory and its
deterministic SHA-256 fingerprint to the state artifact register.

Ask for confirmation with a phrase that names the ticket-set version and the
granularity/dependency scope. After a valid bound approval, update the tickets
to `approved`, add the approval-log row, and update the requirement state.
Never infer approval from silence or an ambiguous generic response.
