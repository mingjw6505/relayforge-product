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

Use `workflow-state.cjs hash --path <artifact-path>` for approval fingerprints.
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

Use the readiness checklist in the workflow contract instead of treating
“materially fuzzy” as an unstructured judgment.

### Fast path

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

## Confirmation checkpoints

Pause for confirmation after:

1. clarification: requirement boundary and non-goals;
2. PRD: product goal, users, success criteria, and scope;
3. prototype: key screens, states, and interactions;
4. spec: behavior rules and acceptance criteria;
5. ticket breakdown: granularity and dependency edges.

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

## Language and defaults

Follow the user's language, defaulting to Chinese for Chinese requests. Keep
standard field names and technical terms when they improve interoperability.
Use local Markdown and self-contained HTML/CSS/JS prototypes. Do not add
external dependencies unless the user explicitly changes the plugin scope.
