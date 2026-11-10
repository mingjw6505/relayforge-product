---
name: using-relayforge-product
description: "Route product-side requests through RelayForge Product: clarify fuzzy requirements, make UX and scope decisions, create or refine PRDs, build clickable local prototypes, and write product specs through final approval. Use for natural-language product work or when the user asks to continue a RelayForge workflow."
---

# Using RelayForge Product

Use this skill as the product-workflow controller. It orchestrates the
specialist skills in this plugin; it does not replace their product writing.

Read [the workflow contract](references/workflow-contract.md) for shared modes,
gates, state, dependencies and approval rules before routing a stage. Read
[the helper commands](references/state-commands.md) when updating state with Node.
Resolve sibling skill paths from this plugin's `skills/` directory and read the
selected specialist's `SKILL.md`. Explicit-only specialists can be read and
followed by this controller; do not rely on automatic host skill invocation.

## Scope

RelayForge Product covers product definition only:

```text
idea or fuzzy request → clarification → PRD → prototype → spec → approved handoff
```

Stop before coding, implementation planning, testing, deployment, or release.
Do not connect to an issue tracker or external MCP service for the default
workflow.

## Identify the requirement

Treat the current project workspace as the default project root. Follow existing
documentation conventions when they are explicit. Otherwise use
`docs/relayforge/` and the paths in `docs/relayforge/README.md`.

When a project uses another documentation root, substitute it consistently in
all state and artifact paths below and pass `--docs-dir <project-relative-dir>`
to the helper. Do not create a second `docs/relayforge/` tree.

Resolve the active requirement in this order:

1. A requirement name or slug explicitly stated by the user.
2. The requirement named in `docs/relayforge/workflow-state.md`.
3. The only matching requirement directory or artifact in `docs/relayforge/`.
4. Ask the user to choose among candidates. Never mix requirements silently.

Read `docs/relayforge/workflows/<slug>/state.md` when it exists before routing.

### Initialize a new requirement

Do this before asking discovery questions or creating an artifact when the
request does not already have durable workflow state:

1. Derive a short, user-recognizable kebab-case slug from the request. Normalize
   Latin text to lowercase ASCII; for non-Latin text, use a concise English
   translation. Keep letters, numbers, and hyphens only.
2. Check `docs/relayforge/workflows/` for collisions. Never reuse a directory
   for a different requirement. Add the smallest numeric suffix (`-2`, `-3`,
   and so on) when needed.
3. Create `docs/relayforge/workflows/<slug>/state.md` from the template in the
   workflow contract. Set `Current stage: discovery`, `Status: draft`, the
   current date and time with timezone, the user's initial request, and any
   questions already known.
4. Create or update `docs/relayforge/workflow-state.md` with the active slug,
   state-file path, and update time. The requirement state remains the source
   of truth.
5. Tell the user the proposed slug. Do not pause only to confirm an unambiguous
   slug; rename it if the user corrects it later. If the request could refer to
   more than one existing requirement, ask the user to choose and do not change
   the active pointer meanwhile.

Initialization and the requested product work normally happen in the same
turn. An empty project is not a reason to keep the workflow only in chat.

When Node.js is available, prefer the bundled helper so directory creation,
collision handling, and the active pointer are deterministic:

```text
node <skill-dir>/scripts/workflow-state.cjs init --project-dir <project-root> --slug <slug> --name <requirement-name> --request <initial-request>
```

An explicit quick-mode request adds `--mode fast`; otherwise new requirements
default to `standard`. Resuming without `--mode` preserves the recorded mode.
Use the `mode` command only when the user requests a mode change. Run `check`
before resuming or advancing an existing requirement, then `register` each new
or revised artifact with its upstream IDs. Use `approve` only after the actual
user confirmation, with the displayed version, fingerprint and approved scope.
If Node.js is unavailable, perform the equivalent file updates directly; core
product work must not depend on the visual companion runtime.

## Route the request

- Product idea, discovery, options, UX exploration, or prototype discussion →
  `brainstorming`.
- Unclear requirements, scope, conflicting decisions, or missing inputs →
  `grilling`.
- Clarification that must leave durable decisions or terminology →
  `grill-with-docs`.
- Create or revise a PRD → `to-prd`.
- Create or revise a product specification → `to-spec`.
- “Continue the product work” → read state and resume the recorded stage.

If the user explicitly names a specialist skill, honor that target but still
check its prerequisites first. When state is `completed` and its artifacts are
current, report the approved specification and handoff references. Resume product
work only for a requested revision. Development planning belongs to a separate
workflow; do not create or route to development-side artifacts.

## Prerequisite gates

- Do not create a formal PRD from a materially fuzzy request. Clarify the
  problem, users, goal, scope, and success signal first.
- In standard mode, create the spec after the PRD and relevant prototype
  interactions are approved. An explicit assumption-based draft request or
  fast mode permits a reviewable spec with unapproved inputs. Skip prototypes
  when they do not help decide observable behavior; record why they are irrelevant.
- A user confirmation is required before changing an artifact to `approved`.
- If the user says to proceed with assumptions, continue only after recording
  each assumption as `待确认假设` and keep the output in a reviewable state.

When a gate is missing, ask only the minimum questions needed to unblock the
requested stage, then return to the specialist workflow.

Use the readiness checklist in the workflow contract instead of treating
“materially fuzzy” as an unstructured judgment.

### PRD shortcut in standard mode

When the user asks for a PRD and the supplied material already covers problem,
user, goal, scope, non-goals, and success signal, do not force an interview
round. In the same turn:

1. initialize or resume the requirement;
2. play back a compact structured understanding;
3. create the PRD as `ready-for-review`;
4. put non-blocking gaps under `待确认假设`; and
5. ask for the artifact-specific confirmation phrase.

Use the normal interview only for missing decisions that would materially
change the product boundary. A request to proceed with assumptions also uses
this path, but assumptions never count as confirmed decisions.

### Explicit fast mode

Enable only when the user asks for fast mode or explicitly asks to generate
the product draft sequence through the specification without intermediate
confirmations. A complete PRD input, a bare “continue”, or one requested draft
does not enable fast mode. Record `Workflow mode: fast` and tell the user.

Use the supplied material and labeled assumptions to produce the PRD, a
prototype when relevant, and the specification in sequence, registering each
artifact and its input versions/fingerprints. Ask only for missing decisions
that cannot reasonably be assumed or conflict with confirmed decisions.
Do not stop for intermediate PRD or prototype approvals, and do not start the
interactive companion unless the user has accepted it; a static prototype
can cover the required interactions. Keep unapproved artifacts `ready-for-review`.

Stop at specification review. Present exactly one final confirmation target:
the spec version, its behavior and acceptance criteria, and the explicitly
listed PRD goal/scope and relevant prototype interactions it incorporates.
For example: `确认规格 v1（行为、验收标准、引用的 PRD v1 目标与范围及原型 v1 核心交互）`.
A valid response permits `approve --include-inputs true` for that specification.
It does not separately approve the PRD or prototype. This final specification
approval completes the product workflow; hand off its approved files and input
references without performing downstream development planning.

## Confirmation checkpoints

In standard mode, pause for confirmation after the following checkpoints.
Fast mode defers the first three into the single specification review above:

1. clarification: requirement boundary and non-goals;
2. PRD: product goal, users, success criteria, and scope;
3. prototype: key screens, states, and interactions;
4. spec: behavior rules and acceptance criteria;

Every confirmation request must identify one artifact or checkpoint, its
version, and its scope. Give the user an exact phrase, for example:

```text
确认 PRD v1（目标、范围、成功指标）
```

Bind approval according to the workflow contract. A bare response such as
“可以”, “继续”, or “确认” is sufficient only when it directly answers the most
recent prompt, that prompt names exactly one artifact and version, and no other
confirmation is pending. Otherwise ask which artifact and version the user is
confirming; do not advance the stage.

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

Update the requirement-specific state file when a stage, decision, artifact,
approval, or blocker changes. Add every produced artifact to the artifact
register and every valid approval to the approval log defined in the workflow
contract. Keep outputs in `draft`, `ready-for-review`, or `approved` according
to the confirmation state; never imply approval that the user did not give.

When an approved artifact changes substantively, update its version and SHA-256
fingerprint, mark the prior approval stale, and return it to
`ready-for-review`.

Also invalidate all transitive dependants when a source changes or disappears.
Reconcile changed upstream artifacts first, regenerate or explicitly review
their dependants, and register the new input snapshots before requesting fresh
approval. Never advance using a downstream approval with stale inputs.

## Language and defaults

Follow the user's language, defaulting to Chinese for Chinese requests. Keep
standard field names and technical terms when they improve interoperability.
Use local Markdown and self-contained HTML/CSS/JS prototypes. Do not add
external dependencies unless the user explicitly changes the plugin scope.

## Product progress card

When the bundled product progress tools are available, follow the
[progress contract](references/progress-panel.md). After selecting and
initializing/resuming the requirement, create one task card and retain its run_id
and latest revision across specialist transitions. Use real source records and
actual selected Skill loads. Update after registration, real waits, approval and
invalidation. A stage draft delivery is not full product completion. Missing
progress tools/runtime must not block product work or create restart loops.
