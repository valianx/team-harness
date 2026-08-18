### Added

- Integrated OpenSpec 1.9.0 as the canonical source for new pipeline Design work through a
  continuous two-pass planning and execution-overlay transaction, with pinned traceability,
  local/Obsidian evidence roots, recoverable progress, generated-skill ownership isolation, and
  unchanged Team Harness gates, validation, security, and delivery authority.

### Fixed

- Made compatible repository initialization automatic, classified protected
  `.agents`/`.codex` writes as `INIT_SANDBOX_DENIED`, and allowed one exact
  native escalated retry without exposing raw command output.
- Reconciled Obsidian sandbox access at the shared
  `{logs-path}/{logs-subfolder}` root so a setup run from one repository does
  not strand pipelines opened from sibling repositories.
- Added structured OpenSpec overlay heartbeats and a durable SLA diagnostic so
  Main can distinguish reported milestones, absent material progress, and
  terminal results without interrupting or replacing a live architect.
- Added a fail-closed OpenSpec event validator and complete canonical Design
  lifecycle examples so Gate 1 rejects malformed or open execution traces.
- Made task dispatch anchors and writable execution topology part of the
  OpenSpec overlay contract, preventing Gate-1-approved plans that cannot be
  dispatched inside the active sandbox.
- Added tester-side contract self-validation, a JSON CLI form, and atomic
  `--output` receipts for red/green evidence so invalid requirement shapes and
  oversized transition results fail at their producing boundary.
- Added a strict mechanical overlay rebind for authorized monotonic OpenSpec
  task progress, without permitting intent or mapping changes.
- Added atomic fixed-shape commit-integrity evidence and a bounded receipt so
  composite Git probes cannot disappear behind tool-level context truncation.
- Distinguished writable worktree content from protected shared Git metadata;
  committing specialists now receive an explicit metadata-write mode and retry
  only exact scoped Git writes through native `login:false` escalation.
- Rejected package-manager exec/download shims before quality execution so test
  evidence cannot silently bootstrap dependencies or touch a global store.
- Resolved `pnpm exec` and simple `pnpm` package scripts through an existing
  repository-local `node_modules/.bin` link, without starting pnpm or touching
  its external SQLite store.
- Made the overlay's `execution_items` pointer explicit in specialist packets;
  consumers no longer infer a nonexistent top-level `tasks` array.
- Added explicit repository and workspace-artifact roots to specialist packets,
  preventing plan/evidence paths from being resolved against the worktree.
- Required initial implementation inspection to use capped one-file or anchored
  range reads instead of aggregate output that can be transport-truncated.
- Required every specialist packet to carry the verified bounded-command helper
  and closed discovery roots/globs, avoiding repository-wide path dumps and
  broad cross-artifact searches.
- Made the canonical worktree the committing-concurrency boundary, preventing
  repository-wide checks and Git metadata from observing incomplete sibling tasks.
- Made failed red/green transitions report a fixed quality-stage diagnostic,
  retained bounded test output for transition postcondition failures, and
  documented per-file diagnostic partitioning for log-heavy test suites.
- Replaced the two-step OpenSpec progress verify/rebind sequence with one
  idempotent recoverable transition, while preserving strict stale-plan
  rejection in `plan-contract`.
- Made alternate shard invariant declarations part of the effective dispatch
  anchor set so an overlay cannot silently omit a stricter approved invariant.
- Extended tester contract self-validation to prove candidate ancestry, exact
  changed test paths, and manifest path rules before a tester can report a
  closed RED contract.
- Split escalated Git staging and commit into bounded operations with an
  intervening staged-path check and explicit hook/lock timeout diagnosis;
  hook bypass remains prohibited.
