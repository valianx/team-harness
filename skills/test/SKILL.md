---
name: test
description: Design and run tests for a feature or component.
---

Analyze the input: $ARGUMENTS

Use [workspace](../workspace/SKILL.md) to select the existing effort in the
bound file or Page context. Dispatch its locator and repository/worktree separately;
file tools and native results require a declared real local operational directory.

Read [upstream tools](../spec/references/upstream-tools.md) when selecting TEA
test-design, test-review or trace. In a spec effort, execute each as its stage is
reached; elsewhere select the capability needed by the request. An existing
tester can use the installed upstream skill as its method and share the result,
without another equivalent TH review. Main persists useful returns in that context
and maintained test code in the project. Neither a report nor a score proves
that the project's executable tests ran.

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
   - Context: {bound locator; separate operational directory for file tools}
   - Feature: {feature-name}
   - frontend_scope: true   # detected from repo markers; activates the tester's browser-test routing
   ```
   (omit `frontend_scope` when no frontend markers are found)

## Mode 2 — No input provided

1. Discover existing efforts read-only with implementation evidence (`02-implementation.md` in file modes)
2. If exactly one found, use its feature name
3. If multiple found, ask the user: "Multiple features found in workspaces. Which one do you want to test? {list}"
4. If none found, report the checked location and ask for the intended feature; do not create a fallback workspace.
5. Once the bound context is verified, run frontend detection before building the payload

---
name: test

## Important

- Always invoke the `orchestrator` agent — do NOT invoke agents directly
- The orchestrator will route to the `tester` agent
- Requires an existing effort with implementation evidence
- Output: maintained tests in the repository; Main retains results in the same Page, or `03-testing.md` in file modes.
