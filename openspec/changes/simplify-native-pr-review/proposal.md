## Why

Team Harness duplicates native coordination and constrains PR review through fixed dispatch, a separate consolidator, and mechanically applied verifier labels. Issues #661 and #662 call for a smaller review workflow where specialists contribute evidence and the primary coordinator makes informed decisions, with equivalent support for Codex, Claude Code and OpenCode.

## What Changes

- Let Main allocate native PR-review specialists by risk, dependencies and required coverage, preserving independent initial assessments and existing model/effort settings.
- Have Main consolidate all drafts and account for every finding; remove the separate consolidator from the required execution path and prerequisite set.
- Treat specialist severity, verifier classifications and review verdicts as recommendations. Main records evidence-backed dispositions and honest coverage limits.
- Keep PR-review specialists read-only and unable to publish, change coordinator state or delegate; retain scoped writing for implementers and other writing roles.
- Check only selected roles and required capabilities, using each supported runtime's native mechanisms and version-compatible adapters.
- Load relevant workflow/context instructions on demand, reuse valid evidence at the same reviewed identity, and repair recoverable dispatch problems without restarting successful work.
- Compare the current workflow, a reduced-context baseline, and the simplified adaptive candidate using the same PR snapshots, models, effort and obligations. Record a retain/adapt/defer decision and a bounded component inventory for #662.
- Reconcile the overlapping verifier requirement in the open `pr-regression-evidence` change without losing its reproduction-evidence behavior.

## Capabilities

### New Capabilities

- `native-pr-review-orchestration`: adaptive assignment, scoped advisory roles, selective prerequisites and progressive context across the three supported runtimes.

### Modified Capabilities

- `pr-review-independence`: coordinator-owned consolidation, evidence-backed dispositions and recoverable same-snapshot follow-up.
- `pr-review-drift-tolerance`: preserve drift rules while reflecting coordinator-owned consolidation.

## Impact

Canonical review skills and role contracts, the existing review helper, Codex projections, Claude plugin assets, OpenCode adapters/distribution, targeted tests and a comparative evaluation report. Preserve public invocations, policy options, immutable snapshots, independent blocker verification and publication approval.

## Non-Goals

Rewriting the pipeline or research workflow; deleting useful deterministic integrity helpers; changing models or reasoning effort; requiring agent teams; introducing new gates, hooks, persistent orchestration state or a universal runtime upgrade; disabling implementer writes; claiming #662's wider framework simplification is complete from one PR-review pilot. Publication and merge need their applicable live authorization.
