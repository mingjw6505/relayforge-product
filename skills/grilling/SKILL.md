---
name: grilling
description: "Interview the user to resolve fuzzy product requirements, user experience decisions, scope boundaries, trade-offs, and acceptance criteria for a RelayForge requirement."
---

# Grilling

Interview relentlessly but constructively until the product decision tree is
covered and the user confirms the shared understanding. This is a product
clarification skill, not an implementation interview.

## Method

Before interviewing, apply the [product entry check](../using-relayforge-product/references/progress-panel.md#entry-check-for-every-product-skill),
even when this Skill was invoked directly and no controller run exists yet.

First apply the controller's readiness checklist. If the user has already
provided problem, user, goal, scope, non-goals, and success signal and requests
a PRD, use the controller PRD shortcut instead of forcing an interview. Read
the [workflow contract](../using-relayforge-product/references/workflow-contract.md)
and persisted mode. In fast mode, ask only about material conflicts or decisions
that cannot reasonably be assumed; record the rest as `待确认假设` and continue
the draft sequence without intermediate confirmation pauses.

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

## Product progress

Reuse the controller's current run and latest revision under the
[product progress contract](../using-relayforge-product/references/progress-panel.md).
Report other actually read and applied Skills in `skill_uses` at the next milestone,
including direct/host entry and external Skills; flush pending declarations before ending.
When available, load this actually selected Skill through load_product_skill once,
then update at real artifact/decision milestones and actual waits. Do not create
another card, infer approval from completion, or bypass the existing confirmation
rules. If tools are unavailable, perform the entry check's diagnostic and chat
notice before continuing with the normal Skill and text workflow.
