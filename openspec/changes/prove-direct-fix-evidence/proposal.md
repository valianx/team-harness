## Why

Direct bug fixes need an inexpensive way to demonstrate that a named assertion detects the old defect and passes after the fix. PR regression tooling answers the opposite directional question and depends on a PR context.

## What Changes

- Document an optional native before/after procedure for a named bug hypothesis.
- Reuse the same assertion or external probe on isolated base/candidate copies, recording observed outcomes and failure cause.
- Keep infrastructure failures inconclusive and preserve the caller's checkout and existing review-pr semantics.

## Capabilities

### Modified Capabilities

- `spec-direct-lane`: Direct bug fixes need an inexpensive way to demonstrate that a named assertion detects the old defect and passes after the fix.

## Impact

Spec skill and its existing author-review guidance/projections. No new execution helper or PR-context adapter.

## Non-Goals

Automatic bug classification, required RED/GREEN for every fix, dependency installation, new gates, or changes to review-pr.
