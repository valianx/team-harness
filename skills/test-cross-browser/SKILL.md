---
name: test-cross-browser
description: Run a relevant UI test suite across browser engines or branded channels to find rendering, layout, and browser API regressions that a single engine can miss.
---

Analyze the input: $ARGUMENTS

## Resolve the target

Use an explicit feature, path, test file, or test command from the request when
provided. Without one, resolve the current objective from the active OpenSpec
change, plan, task context, or recent diff, then locate the affected UI and its
existing browser suite. Existing `workspaces/` notes can help but are optional;
do not require `02-implementation.md`, a workspace, or `03-testing.md`. If the
request leaves several unrelated UI targets, ask which one to cover.

Preserve explicit test-runner options in the request. In particular, do not drop
project, browser, channel, viewport, file, grep, headed, or other repository
supported selectors while resolving the target.

## Discover the browser surface

Check the target for frontend markers:

- `next.config.*`, `vite.config.*`, `nuxt.config.*`, `svelte.config.*`, or `cypress.config.*`
- `src/pages/`, `src/app/`, `app/`, or `pages/`
- `package.json` dependencies such as `react`, `vue`, `svelte`, or `next`

Then inspect the repository's test scripts and configuration (`playwright.config.*`,
Vitest browser configuration, Cypress configuration, and package-manager
scripts). Discover the existing suite, configured browser projects, available
channels, viewport conventions, and the command the repository already uses.
Do not install browsers, dependencies, or system packages implicitly.

## Use the cross-browser method

Read [the cross-browser reference](../../agents/testing-refs/cross-browser.md)
when this skill is selected. It is the method source for the honest browser
model, local engines versus branded channels or remote grids, viewport coverage,
failure modes, third-party UI libraries, skip reasons, and CI cost choices.
Also read the applicable `e2e`, `browser-mode`, or `visual` reference when the
discovered suite uses that test type. Do not rely on a payload flag or a later
agent to load these instructions.

Use this skill when engine or viewport divergence is plausible, when the
operator requests browser coverage, or before shipping UI whose behavior varies
by browser. Use `test` for a routine single-engine test pass. Cross-browser is an
axis over an existing e2e or browser-mode suite, so keep its fixtures,
selectors, assertions, and setup intact.

Choose a representative matrix from the requested scope and the repository's
configured projects. Cover the engines or channels that can expose the risk;
the full engine-by-viewport Cartesian product is not required. Distinguish
bundled WebKit from real Safari and bundled Chromium from installed branded
channels. If a required browser, device, or grid is unavailable, report that
capability gap instead of claiming coverage or changing the host setup.

Run the same suite or coordinated assertions for each selected project. Use the
repository's configured commands and pass through the request's supported
runner options. Compare failures by engine, viewport, and channel, preserving
screenshots, traces, console output, or other diagnostics in the configured
temporary location. Inspect rendering and layout with visual evidence when
appropriate and add deterministic assertions for off-screen, visibility, focus,
positioning, or browser API behavior where they explain the risk.

Keep every engine skip or expected failure explicit, with a tracked reason and
issue link when applicable. A skipped browser is a coverage limitation, not a
pass. Do not silently turn a setup failure or unsupported library into a green
result.

## Coordination and report

The current agent coordinates the work. It may delegate a bounded test run or
independent browser investigation when useful, passing the resolved target,
matrix, frontend scope, and the already-read cross-browser method. Delegation is
optional; no fixed agent count, workspace, installation, or permission override
is required.

Report the target and suite, discovered configuration, selected matrix, host
capabilities, commands, per-engine results, failures or skips, evidence paths,
and remaining gaps. The result may be reported in chat or a workflow's existing
workspace artifact; this skill does not require a particular report file.

## When to use `/th:test-cross-browser` vs `/th:test`

| | `/th:test` | `/th:test-cross-browser` |
|--|-----------|--------------------------|
| **Coverage** | One configured browser target | Multiple configured engines, channels, or viewports |
| **Reference** | Relevant test-type guidance | This reference plus the relevant e2e, browser-mode, or visual guidance |
| **Default use** | Routine test pass | Suspected engine/layout divergence, explicit browser request, or meaningful UI release |
