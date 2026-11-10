---
name: grill-with-docs
description: "Run a product clarification interview while durably recording important decisions, trade-offs, and domain terminology for the active RelayForge requirement."
disable-model-invocation: true
---

# Grill with docs

Before interviewing or artifacts, apply the [product entry check](../using-relayforge-product/references/progress-panel.md#entry-check-for-every-product-skill),
even when this Skill was invoked directly and no controller run exists yet.

Read the [workflow contract](../using-relayforge-product/references/workflow-contract.md)
and use the `grilling` interview method for the active requirement, while recording
durable product decisions in the requirement workflow directory.

Before starting, resolve the requirement slug and read its state. Write only
when the discussion produces meaningful decisions or terminology:

```text
docs/relayforge/workflows/<requirement-slug>/decisions.md
docs/relayforge/workflows/<requirement-slug>/glossary.md
```

Do not depend on an external `domain-modeling` skill. ADR-style entries should
state the decision, context, options considered, chosen option, and consequence.
Glossary entries should state the term, meaning, and any ambiguity. Update
`state.md` with confirmed decisions, `待确认假设`, open questions, blockers, and
the next confirmation checkpoint.

Link decision and glossary documents back to `state.md` and link them from the
next PRD, prototype README, or specification that uses them. Confirmation of a
decision record follows the controller's artifact/version binding rules.
Register meaningful decision records with stable IDs (kind `decision`), and
include these IDs in dependent artifact inputs. In fast mode, defer intermediate
approval and carry unconfirmed decisions into the spec as labeled assumptions.

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
