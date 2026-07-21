---
name: plan-review
description: Audit a Stage 1 plan (01-plan.md) against the plan-shape and substance rules, on demand.
---

Analyze the input: $ARGUMENTS

---
name: plan-review

## Mode 1 — Feature name provided

1. Pass to the `leader` agent:
   ```
   Direct Mode Task:
   - Mode: plan-review
   - Feature: {feature-name}
   ```

## Mode 2 — No input provided

1. Look for active `workspaces/*/` folders that contain `01-plan.md`
2. If exactly one found, use its feature name
3. If multiple found, ask the user: "Multiple plans found in workspaces. Which one do you want to review? {list}"
4. If none found, tell the user: "No plan found in workspaces/. Run /th:design or /th:plan first, or provide a feature name."

---
name: plan-review

## Important

- Always invoke the `leader` agent — do NOT invoke agents directly
- The leader dispatches the plan-review panel (`qa-plan` + conditional `security` + `plan-reviewer`) directly, with no orchestrator and no STAGE-GATE — see `agents/ref-direct-modes.md § "Plan Review Mode"`
- Reuses the same panel and the same `reviews/01-plan-review.md` artifact the in-pipeline Stage 1 deferred-by-default offer (`agents/orchestrator.md § "Phase 1.8 — Post-approval Plan-Review Offer"`) would run — no duplicated dispatch logic, no second review file
- Requires an existing `01-plan.md` — run `/th:design` or `/th:plan` first if none exists
- Output: combined verdict printed inline + full report at `workspaces/{feature-name}/reviews/01-plan-review.md § Plan Review`
