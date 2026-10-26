---
name: grilling
description: "Interview the user to resolve fuzzy product requirements, user experience decisions, scope boundaries, trade-offs, and acceptance criteria for a RelayForge requirement."
---

# Grilling

Interview relentlessly but constructively until the product decision tree is
covered and the user confirms the shared understanding. This is a product
clarification skill, not an implementation interview.

## Method

First apply the controller's readiness checklist. If the user has already
provided problem, user, goal, scope, non-goals, and success signal and requests
a PRD, use the controller fast path instead of forcing an interview.

Otherwise map the work as a decision tree. In each round, ask the whole current
frontier: questions whose prerequisites are already settled. Number the
questions, give a recommended answer, and wait for the user's response before
expanding the next frontier. Never ask the user for facts that can be read from
the current workspace. “Wait for a response” applies only when material
questions remain; it does not require a ceremonial round after the frontier is
already empty.

Cover, as relevant:

- the user and the concrete moment of need;
- the problem and desired outcome;
- goals, non-goals, and anti-goals;
- product boundary and priority;
- user journey, UX decisions, states, and failure cases;
- success signals and constraints;
- open questions and assumptions.

Play back settled decisions in plain language. Mark your own calls as calls and
the user's decisions as confirmed. When the frontier is empty, summarize the
design tree and ask for an artifact-specific confirmation before handing off to
PRD, prototype, or spec work. Use the confirmation binding rules in the shared
workflow contract; do not interpret an ambiguous generic confirmation as
approval.
