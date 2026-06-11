---
name: deliver
description: Create branch, commit, and open a PR for completed work.
---

Analyze the input: $ARGUMENTS

---

## Prerequisite probe — sketch-guard check (mid-pipeline entry)

Before routing to the orchestrator, run `hooks/sketch-guard.sh` as a best-effort probe against the workspace for this feature. This surfaces any missing sketch artifacts before delivery begins.

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
Note: sketch-guard found concerns for this workspace — {concerns[0]}. Proceeding with delivery.
```

**Fail-open:** if the script exits non-zero or the workspace cannot be located, continue. The probe is informational only — it never blocks delivery.

---

## Mode 1 — Feature name provided

1. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: deliver
   - Feature: {feature-name}
   ```

## Mode 2 — No input provided

1. Look for active `workspaces/*/` folders that contain `02-implementation.md`
2. If exactly one found, use its feature name
3. If multiple found, ask the user: "Multiple features found in workspaces. Which one do you want to deliver? {list}"
4. If none found, tell the user: "No implementation found in workspaces/. Run the implementation pipeline first, or provide a feature name."

---

## Important

- Always invoke the `orchestrator` agent — do NOT invoke agents directly
- The orchestrator will route to the `delivery` agent
- Requires existing workspaces with implementation and validation docs
- Output: feature branch, docs, changelog, version bump, commit, push, PR
- After opening the PR, delivery verifies and reports the PR's merge state and CI conclusion (`mergeable_state: clean | conflicting | undetermined`); a conflicting or non-green PR is reported explicitly in the delivery summary and status block, never as a clean delivery. When gh is unavailable, the check is skipped gracefully (`mergeable_state: not-verified: gh-unavailable`).
