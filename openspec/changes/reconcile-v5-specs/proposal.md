## Why

Pipeline v5 and the retirement of the pre-v5 helpers left `openspec-design-orchestration` describing two dispatch models at once. Its multi-repository requirements still mandate `openspec_bindings`, per-service snapshots, overlay hashes, and an aggregate snapshot identity, all of which the control log and the per-service content identity replaced; a scenario still lists snapshot and overlay generation as internal actions. Three gaps surfaced during the retirement review: the administrative close of a workspace without `control/control.jsonl` is implemented and tested but has no requirement, the content identity does not state that it covers the sorted relative paths of the change, and the checkbox exception accepts any checkbox-only edit although the predecessor requirement limited it to authorized pending-to-complete transitions.

`openspec-archive-lifecycle` requires every archive to land on its own pull request. Practice since #614 archives already-merged changes inside the next pull request, and the one-time backfill requirement it carries is complete.

## What Changes

- Restate the two multi-repository requirements and the separate-homes requirement over the v5 primitives: one content identity per writable service, recorded in the control log, with no bindings collection, snapshot, or overlay hash.
- Add a requirement for the administrative close: a workspace without a control log appends one terminal `pipeline.close` entry, refuses symlinked or hard-linked control or events paths, and offers inline continuation or a fresh run.
- Define the content identity over the sorted relative paths and bytes of the change, so a rename, addition, or removal cannot preserve it; limit the checkbox exception to authorized pending-to-complete transitions on pinned coordinates and route everything else through pause or the recorded regression.
- Add `openspecContentIdentity` and `taskProgressDelta` to `control-plane.mjs` so both rules are executable, with tests.
- Allow an already-merged change to archive on any ordinary branch-and-pull-request, including the next feature pull request, while never riding the run's own pull request; remove the completed backfill requirement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `openspec-design-orchestration`: v5 multi-repository wording, administrative close, path-covering identity, authorized checkbox progress.
- `openspec-archive-lifecycle`: archive vehicle relaxed to any ordinary pull request; backfill requirement removed.

## Non-Goals

- No change to Gate 1 semantics, lease issuance, or result acceptance.
- No new multi-repository machinery; the wording change removes retired terms and names the identity the code already uses.
- No automatic archive: the Y/n offer and the confirmed-merge precondition stay.

## Impact

`openspec/specs/openspec-design-orchestration/spec.md`, `openspec/specs/openspec-archive-lifecycle/spec.md` (through archive), `skills/pipeline/scripts/control-plane.mjs` and its two mirrors, `tests/test_pipeline_control_plane.mjs`, `agents/ref-pipeline.md § Recovery`, `skills/spec/SKILL.md § Flow` step 7, `agents/_shared/orchestrator-state.md` terminal close, and their Codex projections.
