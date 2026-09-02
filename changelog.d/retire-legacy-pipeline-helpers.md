### Removed
- Deleted the eleven pre-v5 pipeline helpers that no agent or skill contract referenced, with their packaged copies under `plugins/team-harness/` and `installer-assets/`, their eleven test files, and their `tests/run-all.sh` entries: `openspec-bindings.mjs` (1,482 lines), `openspec-overlay.mjs` (1,029), `correction-packet-preflight.mjs` (926), `plan-contract.mjs` (529), `openspec-snapshot.mjs` (491), `openspec-adapter.mjs` (473), `plan-contract-repair.mjs` (452), `openspec-recovery.mjs` (353), `helper-bundle.mjs` (279), `specialist-write-scope.mjs` (198), `specialist-liveness.mjs` (68); 6,280 lines per copy.
- Removed `convertLegacyWorkspace` from `control-plane.mjs`. A workspace without `control/control.jsonl` is closed administratively with one `pipeline.close` events entry and offered inline continuation or a fresh run (`closeWorkspaceWithoutControlLog`).
- Removed `docs/openspec-v1-gate-migration.md` and `docs/functional-plan-contract.md`, which documented only the deleted helpers.

### Changed
- `openspec-design-orchestration` drops nine superseded pre-v5 requirements and restates "Planning inputs are pinned for Gate 1" as the v5 content identity; `design-single-pass` drops the mechanical overlay skeleton.
- `agents/ref-pipeline.md § Recovery`, `agents/_shared/orchestrator-state.md`, `agents/_shared/coordinator-liveness.md`, `agents/ref-dispatch-machinery.md`, `agents/architect.md`, `docs/openspec-integration.md`, and `docs/pipeline-v5-migration.md` describe only the v5 path.
