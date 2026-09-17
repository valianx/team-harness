---
name: test
description: Design and run tests for a feature or component.
---

Analyze the input: $ARGUMENTS

## Frontend detection

Check the resolved target (or the current working directory when no target path
is available) for frontend markers:
- Config files: `next.config.*`, `vite.config.*`, `nuxt.config.*`, `svelte.config.*`, `cypress.config.*`
- Route directories: `src/pages/`, `src/app/`, `app/`, `pages/`
- `package.json` dependencies: `react`, `vue`, `svelte`, `next`

When any marker matches, carry `frontend_scope: true` into a delegated tester
request. When none matches, omit the field rather than setting it to false.

## Resolve the target

If a feature or path is provided, use it as the target. Otherwise resolve the
current objective from the active OpenSpec change, plan, task context, or recent
diff, then locate the affected source and tests. Existing `workspaces/` notes can
help but are optional; do not require `02-implementation.md`, a workspace, or a
particular stage file. If several unrelated targets remain and the request does
not identify one, ask which target to test.

Apply frontend detection to the resolved target's project root so browser or UI
checks are considered even when the target is a single source file.

## Method

Read the requested behavior from the current objective, OpenSpec scenarios,
plans, and source. Use the diff and repository history to identify changed
paths, then inspect nearby integration boundaries and existing test conventions.
Choose meaningful unit, integration, contract, or browser checks that can expose
the relevant regression; do not create tests merely to mirror the implementation.

Add or update tests with the repository's normal tools and run the narrowest
relevant checks first, followed by broader checks when the change warrants them.
Report commands, results, failures, omissions, and remaining risk. Keep raw
runner output in temporary or configured workspace storage. A concise report may
be written to an active workspace when that workflow uses one, but this skill
does not require `03-testing.md` or any other fixed artifact.

The current agent coordinates the work and may delegate independent modules or
specialist browser checks with clear ownership. Consolidate their evidence and
judge the remaining gaps; delegation is optional and does not activate a
separate pipeline.
