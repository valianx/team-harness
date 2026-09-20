---
name: test
description: Design and run tests for a feature or component.
---

Analyze the input: $ARGUMENTS

Use [workspace](../workspace/SKILL.md) to select the existing effort in the
configured local/Obsidian location. Pass its absolute root as `workspaces path:`
in dispatch; output paths below refer to that root.

---
name: test

## Frontend detection

Before building the Direct Mode Task payload, check the effort's associated code repository for frontend markers:
- Config files: `next.config.*`, `vite.config.*`, `nuxt.config.*`, `svelte.config.*`, `cypress.config.*`
- Route directories: `src/pages/`, `src/app/`, `app/`, `pages/`
- `package.json` dependencies: `react`, `vue`, `svelte`, `next`

When ANY marker matches, include `frontend_scope: true` in the Direct Mode Task payload. When none matches, omit the field (absence is the signal — do not set it to false explicitly).

## Mode 1 — Feature name provided

1. Run frontend detection against the associated code repository
2. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: test
   - workspaces path: {absolute-workspace-root}
   - Feature: {feature-name}
   - frontend_scope: true   # detected from repo markers; activates the tester's browser-test routing
   ```
   (omit `frontend_scope` when no frontend markers are found)

## Mode 2 — No input provided

1. Find existing efforts in the configured workspace location containing `02-implementation.md`
2. If exactly one found, use its feature name
3. If multiple found, ask the user: "Multiple features found in workspaces. Which one do you want to test? {list}"
4. If none found, report the checked location and ask for the intended feature; do not create a fallback workspace.
5. Once the feature path is resolved, run the frontend detection step before building the payload

---
name: test

## Important

- Always invoke the `orchestrator` agent — do NOT invoke agents directly
- The orchestrator will route to the `tester` agent
- Requires existing workspaces with implementation docs
- Output: tests created + `workspaces/{feature-name}/03-testing.md`
