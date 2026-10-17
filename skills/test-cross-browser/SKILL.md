---
name: test-cross-browser
description: Run one test suite across multiple browser engines and branded channels, detecting rendering and layout regressions invisible to a single-engine test pass.
---

Analyze the input: $ARGUMENTS

Use [workspace](../workspace/SKILL.md) to select the existing effort in the
bound file or Page context. Maintained tests stay in the supplied repository/worktree;
captures and native machine results use declared real local operational storage.

---
name: test-cross-browser

## Frontend detection

Before building the Direct Mode Task payload, check the effort's associated code
repository for frontend markers:
- Config files: `next.config.*`, `vite.config.*`, `nuxt.config.*`, `svelte.config.*`, `cypress.config.*`
- Route directories: `src/pages/`, `src/app/`, `app/`, `pages/`
- `package.json` dependencies: `react`, `vue`, `svelte`, `next`

When ANY marker matches, include `frontend_scope: true` in the Direct Mode Task payload. When none
matches, omit the field (absence is the signal — do not set it to false explicitly).

## Mode 1 — Feature name provided

1. Run frontend detection against the associated code repository.
2. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: test
   - Context: {bound locator; separate operational directory for file tools}
   - Feature: {feature-name}
   - cross_browser: true        # always set by this skill — the distinguishing field
   - frontend_scope: true       # only when frontend markers detected; omit otherwise
   ```

## Mode 2 — No input provided

1. Discover existing efforts read-only with implementation evidence (`02-implementation.md` in file modes).
2. If exactly one found, use its feature name.
3. If multiple found, ask the user: "Multiple features found in workspaces. Which one do you want
   to test with cross-browser coverage? {list}"
4. If none found, report the checked location and ask for the intended feature;
   do not create a fallback workspace.
5. Once the bound context is verified, run frontend detection before building the payload.

## When to use `/th:test-cross-browser` vs `/th:test`

| | `/th:test` | `/th:test-cross-browser` |
|--|-----------|--------------------------|
| **Engines** | Single (chromium default) | Multiple (Chromium / Firefox / WebKit + branded channels) |
| **Adds field** | `frontend_scope` only | `frontend_scope` + `cross_browser: true` |
| **Loads reference** | warranted `e2e` / `browser-mode` | same + `agents/testing-refs/cross-browser.md` axis reference |
| **CI default** | chromium only on every PR | chromium only on PR; full matrix via `cross-browser` label or schedule |
| **Use when** | normal test pass | engine-specific rendering suspicions (a UI that looks right in Chrome but is reported broken in Firefox/Safari), or responsive-breakpoint suspicions (an element clips or disappears off-screen at a viewport), or before releasing a feature with significant UI to production |

Use `/th:test-cross-browser` when you have a concrete reason to suspect engine divergence.
Use `/th:test` for the routine test pass on any PR.

## Voice

See `agents/_shared/operational-rules.md` § "Voice" and § "Language register" for the full voice
and dialect-neutrality contract. Workspaces prose follows the operator's chat language; structural
elements (headers, field names, status-block keys) stay English.

## Output Discipline

- Build the Direct Mode Task payload and route to the `orchestrator` agent — no inline analysis.
- The tester owns tests and returns evidence; Main persists useful results in the
  bound context, without granting the tester remote mutation authority.
- Do NOT invoke the `tester` agent directly — always route through the orchestrator.
- Output: repository tests across the matrix; Main retains returned results in the
  same Page, or `03-testing.md` in file modes, linking native captures/results.

## Important

- **This skill is the ONLY producer of `cross_browser: true`** in the Direct Mode Task payload.
  No other skill, agent, or default path sets this flag.
- **Always routes through the orchestrator.** The orchestrator dispatches the tester; the tester
  loads `agents/testing-refs/cross-browser.md` alongside the warranted `e2e`/`browser-mode`
  reference when it reads `cross_browser: true` from the payload.
- **Never invokes the `tester` agent directly.** The full pipeline (architect determination of
  scope, tester phase-0 reference routing, qa verification) runs as normal — cross-browser is an
  axis, not a bypass of the pipeline.
- Requires an existing effort with implementation evidence. If absent, Mode 2 reports the
  checked location and asks for the intended feature without creating a fallback.
