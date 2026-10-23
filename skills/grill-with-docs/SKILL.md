---
name: grill-with-docs
description: Run a product clarification interview while durably recording important decisions, trade-offs, and domain terminology for the active RelayForge requirement.
disable-model-invocation: true
---

# Grill with docs

Use the `grilling` interview method for the active requirement, while recording
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
