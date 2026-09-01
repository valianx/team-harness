# Implementation phase

Enter only after the Gate-1 `operator_authority` event binds the current
OpenSpec intent, scope, and security identities.

## Just-in-time batching

Read dependency-ready OpenSpec tasks and form the largest coherent batch that
has one logical owner and one canonical worktree. Exact writable paths and
immutable references come from current repository facts. Derive them when the
batch becomes executable; Design never predicts the complete future graph.

One worktree has at most one committing writer. Serialize implementer, tester,
and cleaner writes against that worktree. Read-only verification may run
concurrently only over an immutable candidate identity.

Immediately before dispatch:

1. preflight the exact role and current generated instruction identity;
2. verify Gate authority, worktree ownership, pinned OpenSpec inputs, baseline
   commit, writable-path containment, and immutable references;
3. issue one minimal `capability_lease` through `control-plane.mjs`; and
4. send that lease through native dispatch with only a concise objective.

The prompt must not duplicate acceptance prose, lease fields, another task
plan, or specialist history. An optional transport envelope may contain the
lease and helper references, but it is not a semantic or future task capsule.

## Tests, cleaner, and results

The implementer owns production changes and ordinary tests in one batch. Run a
separate tester only when `independentTestRequirement` records bug
reproduction, migration/data safety, public compatibility, security-control
change, stale independently-authored evidence, or explicit operator request.
Pre-implementation quality checks cover prerequisites only; no universal RED
or complete suite runs before work.

Compute deterministic hygiene violations. Dispatch cleaner only when
`cleanerEligibility` returns a non-empty behavior-preserving allowlist; an empty
allowlist is a completed no-op.

Each specialist returns one closed `result_envelope` through native transport.
Main validates identity, sequence, scope, paths, artifacts, commits, findings,
and closure evidence, appends `result_accepted`, then projects progress. A
duplicate result identity is idempotent. Specialists never write coordinator
state, result inboxes, receipts, or OpenSpec checkboxes.

Continue the same agent and lease only while authority, role, semantic scope,
worktree, immutable inputs, context identity, and ownership remain unchanged.
Otherwise revoke/close it and use causal recovery. Counts, elapsed time, tool
calls, and compaction thresholds are telemetry only.

When all approved batches close, assemble the candidate, ensure one complete
committed tree, and enter Freeze. Full quality has not run yet for this identity.
