---
schema_version: 1
applies_to: "**/*"
focus_overrides:
  security: []
  architecture: []
  style: []
---

# Review Policy: <repo-name>

Edit this file to encode project-specific review rules. The team-harness `reviewer`
agent reads this file when present and enforces the rules below.

Each rule has:
- a stable ID (e.g., `SEC-001`, `ARCH-001`, `STYLE-001`)
- a severity (`critical` / `suggestion` / `nitpick`)
- a description (free-form prose; reviewer applies judgement)
- an `Applies to:` glob (which files trigger the rule)

The reviewer cites rule IDs in findings (e.g., `Violation SEC-001 — src/api/users.ts:42`).
Policy `critical` rules are non-overridable inline findings.

When the diff includes `.team-harness/review-policy.md` itself, the reviewer treats any
rule removal or severity downgrade as a critical finding requiring rationale in the PR body.

## Examples (uncomment and edit)

<!--
## SEC-001 — No hardcoded secrets in source
**Severity:** critical
**Applies to:** `**/*.{ts,js,py,go,rs}`

No API keys, tokens, or passwords in source files. Use environment variables
or a secrets manager.

## ARCH-001 — No imports from `legacy/`
**Severity:** critical
**Applies to:** `**/*.{ts,js}`, excludes `legacy/**`

New code must not import from `legacy/`. Migrate the dependency or move the
new code into `legacy/` (with reviewer approval).

## STYLE-001 — Service files require parallel tests
**Severity:** suggestion
**Applies to:** `src/services/**/*.ts`

When a service file is added or modified, a parallel `*.spec.ts` must exist
in `src/services/__tests__/`.
-->
