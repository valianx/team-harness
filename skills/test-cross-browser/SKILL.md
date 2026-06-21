---
name: test-cross-browser
description: Run one test suite across multiple browser engines and branded channels, detecting rendering and layout regressions invisible to a single-engine test pass.
---

Analyze the input: $ARGUMENTS

---
name: test-cross-browser

## Frontend detection

Before building the Direct Mode Task payload, check the feature's workspace path (or the current
working directory when in Mode 2) for frontend markers:
- Config files: `next.config.*`, `vite.config.*`, `nuxt.config.*`, `svelte.config.*`, `cypress.config.*`
- Route directories: `src/pages/`, `src/app/`, `app/`, `pages/`
- `package.json` dependencies: `react`, `vue`, `svelte`, `next`

When ANY marker matches, include `frontend_scope: true` in the Direct Mode Task payload. When none
matches, omit the field (absence is the signal — do not set it to false explicitly).

## Mode 1 — Feature name provided

1. Run the frontend detection step against the feature's workspace path.
2. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: test
   - Feature: {feature-name}
   - cross_browser: true        # always set by this skill — the distinguishing field
   - frontend_scope: true       # only when frontend markers detected; omit otherwise
   ```

## Mode 2 — No input provided

1. Look for active `workspaces/*/` folders that contain `02-implementation.md`.
2. If exactly one found, use its feature name.
3. If multiple found, ask the user: "Multiple features found in workspaces. Which one do you want
   to test with cross-browser coverage? {list}"
4. If none found, tell the user: "No implementation found in workspaces/. Implement first or
   provide a feature name."
5. Once the feature path is resolved, run the frontend detection step before building the payload.

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
- Do NOT produce test files, test plans, or workspaces content directly. That is the tester's
  responsibility once dispatched.
- Do NOT invoke the `tester` agent directly — always route through the orchestrator.
- Output: tests authored across the configured browser matrix + `workspaces/{feature-name}/03-testing.md`,
  identical to `/th:test` output but with the cross-engine matrix applied.

## Important

- **This skill is the ONLY producer of `cross_browser: true`** in the Direct Mode Task payload.
  No other skill, agent, or default path sets this flag.
- **Always routes through the orchestrator.** The orchestrator dispatches the tester; the tester
  loads `agents/testing-refs/cross-browser.md` alongside the warranted `e2e`/`browser-mode`
  reference when it reads `cross_browser: true` from the payload.
- **Never invokes the `tester` agent directly.** The full pipeline (architect determination of
  scope, tester phase-0 reference routing, qa verification) runs as normal — cross-browser is an
  axis, not a bypass of the pipeline.
- Requires existing workspaces with implementation docs. If none exist, Mode 2 will tell the user
  to implement first.
