---
name: test
description: Design and run tests for a feature or component.
---

Analyze the input: $ARGUMENTS

---
name: test

## Frontend detection

Before building the Direct Mode Task payload, check the feature's workspace path (or the current working directory when in Mode 2) for frontend markers:
- Config files: `next.config.*`, `vite.config.*`, `nuxt.config.*`, `svelte.config.*`, `cypress.config.*`
- Route directories: `src/pages/`, `src/app/`, `app/`, `pages/`
- `package.json` dependencies: `react`, `vue`, `svelte`, `next`

When ANY marker matches, include `frontend_scope: true` in the Direct Mode Task payload. When none matches, omit the field (absence is the signal — do not set it to false explicitly).

## Mode 1 — Feature name provided

1. Run the frontend detection step against the feature's workspace path
2. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: test
   - Feature: {feature-name}
   - frontend_scope: true   # detected from repo markers; activates the tester's browser-test routing
   ```
   (omit `frontend_scope` when no frontend markers are found)

## Mode 2 — No input provided

1. Look for active `workspaces/*/` folders that contain `02-implementation.md`
2. If exactly one found, use its feature name
3. If multiple found, ask the user: "Multiple features found in workspaces. Which one do you want to test? {list}"
4. If none found, tell the user: "No implementation found in workspaces/. Implement first or provide a feature name."
5. Once the feature path is resolved, run the frontend detection step before building the payload

---
name: test

## Important

- Always invoke the `orchestrator` agent — do NOT invoke agents directly
- The orchestrator will route to the `tester` agent
- Requires existing workspaces with implementation docs
- Output: tests created + `workspaces/{feature-name}/03-testing.md`
