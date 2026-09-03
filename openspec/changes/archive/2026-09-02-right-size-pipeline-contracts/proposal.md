## Why

Pipeline v5 (#631–#633, released as 3.20.14) cut `agents/ref-pipeline.md` from 23,400 words to 1,612 and `orchestrator-state.md` from 6,531 to 303. That reduction was done by hand, once. Nothing keeps it: `agents/` still holds 131,000 words, `ref-special-flows.md` is 11,300, `ref-direct-modes.md` is 6,977, twenty-one agent and contract files sit in a shrink-only exemption map because they exceed their budget, and the seven PRs before v5 (#624–#630) each grew the corpus while their titles said "simplify". CLAUDE.md still describes an "881-word kernel" and a "20.7K-word pipeline reference"; the real numbers are 2,528 and 1,612.

Three things are missing. A measurement from real runs: the v5 benchmark (`test_pipeline_simplification_benchmark.mjs`) compares helper operation counts against fixture data and never ran a pipeline. A ceiling that makes growth a test failure instead of a review comment. And a ceiling on what the architect may author: the 2026-08-31 run produced 75 acceptance criteria in 47 minutes for one refactor, and the operator had to read them at Gate 1.

A fourth defect is scope creep in `openspec/changes/`: changes exist for installing a CLI and for opening a pull request, six completed changes are unarchived, and `config.yaml` carries no rules.

## What Changes

- Record a real-run baseline (small fix, medium feature, security-sensitive fix) against 3.20.14: time to Gate 1, dispatches, tool calls, acceptance-criteria count, corrections, defects per lens. Later contract changes compare against it.
- Add a shrink-only word ceiling per reference and shared-contract file, recorded in a fixture the authoring-budget suite enforces. A PR may lower a ceiling; it may never raise one.
- Deterministic classification lives in helpers: a contract names the helper and its output vocabulary and never restates flag lists or retry ordinals. Lint fails on the retired phrases; today they survive in `ref-direct-modes.md` and `review-pr/SKILL.md`.
- Give Design a requirement-count ceiling. Past it, the architect stops and the coordinator presents one live choice: split, accept oversize with a reason, or narrow.
- Scope OpenSpec to product behavior: a change must add or modify a capability; per-artifact rules land in `config.yaml`; completed changes are archived by the PR that finishes them; the three chore or superseded changes are removed.

## Capabilities

### New Capabilities

- `contract-right-sizing`: real-run baseline, shrink-only ceilings, helpers own deterministic classification.
- `openspec-change-scope`: when a change may exist, per-artifact rules, archive timing.

### Modified Capabilities

- `design-single-pass`: the single architect pass has a requirement-count ceiling with a live operator choice.

## Non-Goals

- No change to the v5 control plane, gates, security floor, `dev-guard`, or outward approvals.
- No edit to `review-pr/SKILL.md` beyond lint detection; its rewrite is `verify-review-findings`.
- No deletion of the pre-v5 helpers; that is `retire-legacy-pipeline-helpers`.

## Impact

`tests/test_authoring_budgets.py`, new `tests/fixtures/authoring-baseline.json` and `tests/test_openspec_scope.py`, new `docs/benchmarks/pipeline-baseline.md`, `agents/ref-pipeline.md § Design`, `agents/ref-direct-modes.md`, `agents/architect.md`, `docs/agent-authoring.md`, `openspec/config.yaml`, `/th:lint`, `CLAUDE.md § 14`, and the projections of touched contracts. Audit source: vault note `work-logs/team-harness/2026-09-02_contract-audit/00-contract-audit.md`.
