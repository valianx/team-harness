---
name: validate
description: Validate an implementation against its acceptance criteria.
---

Analyze the input: $ARGUMENTS

---
name: validate

## Prerequisite probe — sketch-guard check (mid-pipeline entry)

Before routing to the orchestrator, run `hooks/sketch-guard.sh` as a best-effort probe against the workspace for this feature. This surfaces any missing sketch artifacts before validation begins.

Resolve the script through the documented 3-tier chain before invoking:

```bash
# 3-tier resolution: plugin cache -> ~/.claude/hooks/ -> ./hooks/
PLUGIN_BASE="${HOME}/.claude/plugins/cache/team-harness-marketplace/th"
SKETCH_GUARD=""
if [ -d "$PLUGIN_BASE" ]; then
  LATEST=$(ls -1 "$PLUGIN_BASE" 2>/dev/null | sort -V | tail -1)
  if [ -n "$LATEST" ] && [ -f "$PLUGIN_BASE/$LATEST/hooks/sketch-guard.sh" ]; then
    SKETCH_GUARD="$PLUGIN_BASE/$LATEST/hooks/sketch-guard.sh"
  fi
fi
if [ -z "$SKETCH_GUARD" ] && [ -f "${HOME}/.claude/hooks/sketch-guard.sh" ]; then
  SKETCH_GUARD="${HOME}/.claude/hooks/sketch-guard.sh"
fi
if [ -z "$SKETCH_GUARD" ] && [ -f "./hooks/sketch-guard.sh" ]; then
  SKETCH_GUARD="./hooks/sketch-guard.sh"
fi

if [ -n "$SKETCH_GUARD" ]; then
  bash "$SKETCH_GUARD" "${WORKSPACE_PATH}" 2>/dev/null
else
  echo "sketch-guard probe unavailable — skipping"
  # In pipeline context: append a *.skipped event to the execution-events JSONL
fi
```

If `verdict: concerns`, show a one-line banner before proceeding:
```
Note: sketch-guard found concerns for this workspace — {concerns[0]}. Proceeding with validation.
```

**Required sketch reading (mid-pipeline entry):** after the guard probe, read every `sketches/*` file present in the workspace before routing to the qa agent. In a multi-project initiative, resolve sketch paths from `{overview_root}/sketches/{project}-{name}` (and `{overview_root}/sketches/service-interaction.md` for the shared service-interaction sketch). These sketch files are required reading — the qa agent will cross-check the delivered surface against them as part of AC validation.

**Fail-open:** if the script exits non-zero or the workspace cannot be located, continue. The probe is informational only — it never blocks validation.

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
- Output: `workspaces/{feature-name}/reviews/04-validation.md`
