## Why

PR review can identify and independently inspect a suspected defect, but it currently cannot attach a controlled reproduction showing whether the PR introduced it. Operators need evidence of changed behavior, including the distinction between a regression, an existing failure, and an unavailable test environment.

## What Changes

- Add an opt-in regression investigation to `review-pr`, selected by `--regressions` or an explicit live request to investigate regressions.
- Let Main prepare a bounded probe for a concrete hypothesis, execute it against the captured merge-base and reviewed head in separate disposable checkouts using the runtime's permitted execution boundary, and record comparable evidence.
- Classify observed outcomes deterministically without treating every failing command or intentional behavior change as a confirmed bug.
- Supply optional anchored reproduction evidence to the existing independent verifier and incorporate the result into the existing PR review and coverage disclosure.
- Preserve ordinary code review when reproduction is unavailable; disclose that limit. Deliver implementation, regression tests, documentation, generated distribution updates and release metadata in one PR.
- Require autonomous diagnosis and repair of operational blockers across direct/spec and pipeline work when approved deliverables and authority remain unchanged.

## Capabilities

### New Capabilities

- `pr-regression-evidence`: bounded, attributable base/head reproductions and honest outcome classification for PR review.

### Modified Capabilities

- `pr-review-independence`: allow the existing read-only verifier to inspect optional reproduction evidence while retaining code-based causality checks and existing finding dispositions.
- `pipeline-control-plane`: require operational repair attempts before pausing, preserving causal recovery and existing authority.

## Impact

The review skill and its helpers, verifier contract and Codex adapter, review tests, generated plugin/installer copies, and shared version/changelog metadata. Reuse existing snapshot, bounded-execution and evidence primitives where suitable; no new third-party testing framework is required. Repair the existing OpenSpec YAML scalar so the pinned CLI loads repository rules.

## Non-Goals

Installing the full quality-tool inventory; adding a permanent specialist, pipeline stage or sandbox platform; running every suite twice; certifying absence of bugs; changing publish approval; merging this PR; requiring agent productivity benchmarks before delivery.
