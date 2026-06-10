---
name: validate
description: Validate an implementation against its acceptance criteria.
---

Analyze the input: $ARGUMENTS

---
name: validate

## Prerequisite probe — sketch-guard check (mid-pipeline entry)

Before routing to the orchestrator, run `hooks/sketch-guard.sh` as a best-effort probe against the workspace for this feature. This surfaces any missing sketch artifacts before validation begins.

```bash
# Locate the workspace for this feature (from workspaces/{feature-name}/ or date-prefixed variant)
bash hooks/sketch-guard.sh "${WORKSPACE_PATH}" 2>/dev/null
```

If `verdict: concerns`, show a one-line banner before proceeding:
```
Note: sketch-guard found concerns for this workspace — {concerns[0]}. Proceeding with validation.
```

**Fail-open:** if `sketch-guard.sh` is absent, exits non-zero, or the workspace cannot be located, skip this probe silently and continue. The probe is informational only — it never blocks validation.

---
name: validate

## Mode 1 — Feature name provided

1. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: validate
   - Feature: {feature-name}
   ```

## Mode 2 — No input provided

1. Look for active `workspaces/*/` folders that contain `02-implementation.md`
2. If exactly one found, use its feature name
3. If multiple found, ask the user: "Multiple features found in workspaces. Which one do you want to validate? {list}"
4. If none found, tell the user: "No implementation found in workspaces/. Implement first or provide a feature name."

---
name: validate

## Important

- Always invoke the `orchestrator` agent — do NOT invoke agents directly
- The orchestrator will route to the `qa` agent in validate mode
- Validates implementation against acceptance criteria from `00-task-intake.md`
- Output: `workspaces/{feature-name}/04-validation.md`
