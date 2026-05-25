---
name: test
description: Design and run tests for a feature or component.
---
name: test

Analyze the input: $ARGUMENTS

---
name: test

## Mode 1 — Feature name provided

1. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: test
   - Feature: {feature-name}
   ```

## Mode 2 — No input provided

1. Look for active `workspaces/*/` folders that contain `02-implementation.md`
2. If exactly one found, use its feature name
3. If multiple found, ask the user: "Multiple features found in workspaces. Which one do you want to test? {list}"
4. If none found, tell the user: "No implementation found in workspaces/. Implement first or provide a feature name."

---
name: test

## Important

- Always invoke the `orchestrator` agent — do NOT invoke agents directly
- The orchestrator will route to the `tester` agent
- Requires existing workspaces with implementation docs
- Output: tests created + `workspaces/{feature-name}/03-testing.md`
