# Workflow contract

The controller and specialist skills share these stage names:

```text
discovery
clarifying
prd
prototype
spec
tickets
completed
```

Artifact statuses are:

```text
draft
ready-for-review
approved
in-progress
done
```

Requirement state files should include:

```markdown
# <Requirement name>

- Requirement slug:
- Current stage:
- Status:
- Last updated:

## Confirmed decisions

## 待确认假设

## Open questions

## Blockers

## Produced files

## Next step
```

The controller may choose a different heading layout when an existing project
convention requires it, but these fields must remain discoverable.
