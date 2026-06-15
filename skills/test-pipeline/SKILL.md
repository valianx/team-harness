---
name: test-pipeline
description: Run the test pipeline for a feature.
---

Analyze the input: $ARGUMENTS

---
name: test-pipeline

## Frontend detection

After resolving the service path, check it for frontend markers:
- Config files: `next.config.*`, `vite.config.*`, `nuxt.config.*`, `svelte.config.*`, `cypress.config.*`
- Route directories: `src/pages/`, `src/app/`, `app/`, `pages/`
- `package.json` dependencies: `react`, `vue`, `svelte`, `next`

When ANY marker matches, include `frontend_scope: true` in the Direct Mode Task payload. When none matches, omit the field (absence is the signal — do not set it to false explicitly).

## Mode 1 --- Path or service name provided

1. Resolve the path (absolute or relative to cwd)
2. Validate it contains source code (check for `src/`, `lib/`, `app/`, or equivalent)
3. Run the frontend detection step against the resolved path
4. Parse optional flags from arguments:
   - `--skip-security` --- omit security scan step from per-module tasks
   - `--modules auth,payments,...` --- test only specified modules (skip decomposition)
   - `--coverage-only` --- only run Phase 1 (coverage config) + consolidated coverage run, skip test generation
5. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: test-pipeline
   - Service path: {resolved absolute path}
   - Options: {parsed flags or "default"}
   - frontend_scope: true   # detected from repo markers; activates the tester's browser-test routing
   ```
   (omit `frontend_scope` when no frontend markers are found)

## Mode 2 --- No input provided

1. Use the current working directory as the service path
2. Run the frontend detection step against cwd
3. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: test-pipeline
   - Service path: {cwd}
   - Options: default
   - frontend_scope: true   # detected from repo markers; activates the tester's browser-test routing
   ```
   (omit `frontend_scope` when no frontend markers are found)

---
name: test-pipeline

## Important

- Always invoke the `orchestrator` agent --- do NOT invoke agents directly
- The orchestrator will analyze the service, decompose into modules, and dispatch tester agents in parallel
- Output: `workspaces/test-pipeline/05-consolidation.md` (final quality report)
- Coverage gate: **80% branch coverage service-wide is mandatory** --- pipeline iterates until met or max 3 loops
