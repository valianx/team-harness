## Why

Pipeline v5 (#631) replaced bindings, overlays, snapshots, plan contracts, helper bundles, liveness leases, and write-scope tokens with one control log and two primitives. It did not delete them. Eleven pre-v5 helpers — about 7,300 lines under `skills/pipeline/scripts/` plus their packaged copies — remain in the tree with zero references from any agent or skill contract. Eleven test files and `tests/run-all.sh` keep them alive, so every suite run spends time proving code nothing calls.

The specifications carry the same residue. `harden-multi-repo-coordination-contract` is complete and unarchived; when archived, its eight requirements for overlays, seals, liveness leases, derived-artifact repair, and legacy-v1 certificates land in the main spec beside the v5 requirements that superseded them, because the v5 change modified and added but never removed. The main spec would then mandate two contradictory dispatch models.

A third item is the v1-v4 converter inside `control-plane.mjs` and the `Recovery and legacy state` section of `ref-pipeline.md`. Every pre-v5 workspace is either complete or aborted; the converter has no future input.

## What Changes

- Delete `openspec-bindings`, `openspec-overlay`, `openspec-snapshot`, `openspec-adapter`, `openspec-recovery`, `correction-packet-preflight`, `plan-contract`, `plan-contract-repair`, `helper-bundle`, `specialist-liveness`, and `specialist-write-scope`, their packaged copies, their eleven test files, and their `run-all.sh` entries.
- After archiving the completed changes, remove from `openspec-design-orchestration` the eight superseded requirements and restate "Planning inputs are pinned for Gate 1" as the v5 content identity. Remove the mechanical overlay skeleton from `design-single-pass`.
- Remove `convertLegacyWorkspace` and the one-shot conversion requirement. A workspace without `control/control.jsonl` is closed administratively with an events entry and offered inline continuation or a fresh run.
- Update `docs/openspec-integration.md`, `docs/pipeline-v5-migration.md`, and `docs/observability.md` to describe only the v5 path.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `openspec-design-orchestration`: superseded pre-v5 requirements removed; pinned inputs restated as the v5 content identity; one-shot conversion removed.
- `design-single-pass`: the mechanical overlay skeleton is removed.

## Non-Goals

- No change to `control-plane.mjs` beyond deleting the converter, and none to `control-plane-specialist.mjs`, leases, envelopes, or the control log. Whether v5 itself stays is decided against the real-run baseline from `right-size-pipeline-contracts`, not here.
- No change to `quality-runner`, `bounded-command`, `commit-integrity`, `test-transition`, `code-hygiene`, `review-surface`, `worktree-dependencies`, `workspace-identity`, `openspec-events`, or `herdr-message`; each is referenced by a live contract.
- No change to gates, the security floor, `dev-guard`, or HerdR.

## Impact

Deletes eleven scripts, their `plugins/team-harness/skills/pipeline/scripts/` mirrors, and eleven tests; edits `tests/run-all.sh`, `control-plane.mjs`, `agents/ref-pipeline.md § Recovery and legacy state`, `agents/_shared/orchestrator-state.md`, three docs, and the Codex and opencode projections. Depends on `right-size-pipeline-contracts` task 5.3 archiving the six completed changes first.
