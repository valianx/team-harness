---
name: deliver
description: Create branch, commit, and open a PR for completed work.
---

Analyze the input: $ARGUMENTS

---
name: deliver

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
name: deliver

## Important

- Always invoke the `orchestrator` agent — do NOT invoke agents directly
- The orchestrator will route to the `delivery` agent
- Requires existing workspaces with implementation and validation docs
- Output: feature branch, docs, changelog, version bump, commit, push, PR
