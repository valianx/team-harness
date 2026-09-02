# Tasks

## 1. Prerequisite

- [x] 1.1 Confirm `right-size-pipeline-contracts` task 5.3 has archived `simplify-pipeline-control-plane`, `harden-multi-repo-coordination-contract`, and the other completed changes; stop if `openspec list` still reports any of them active.

## 2. Delete helpers

- [x] 2.1 Re-run the reference scan over `agents/**`, `skills/**`, `plugins/team-harness/agents/**`, and `plugins/team-harness/skills/**` (excluding `scripts/`) for the eleven helpers and record zero hits in the PR body; abort the deletion of any helper that gains a hit.
- [x] 2.2 Delete the eleven `skills/pipeline/scripts/*.mjs` files and their `plugins/team-harness/skills/pipeline/scripts/` mirrors.
- [x] 2.3 Delete `tests/test_openspec_bindings.mjs`, `test_openspec_overlay.mjs`, `test_openspec_snapshot.mjs`, `test_openspec_adapter.mjs`, `test_openspec_recovery.mjs`, `test_openspec_design_e2e.mjs`, `test_correction_packet_preflight.mjs`, `test_plan_contract.mjs`, `test_helper_bundle.mjs`, `test_specialist_write_scope.mjs`, `test_specialist_liveness.mjs`; remove their `tests/run-all.sh` lines; update `test_pipeline_helper_entrypoints.mjs` to the surviving entrypoints.
- [x] 2.4 Repoint `cmd/install/manifest_registry_test.go` at a surviving pipeline script so the opencode manifest test does not require a deleted file.

## 3. Remove the converter

- [x] 3.1 Delete `convertLegacyWorkspace` and its helpers from `control-plane.mjs`; add the administrative close for a workspace without `control/control.jsonl`.
- [x] 3.2 Replace `agents/ref-pipeline.md § Recovery and legacy state` with the single v5 recovery paragraph and the inline-or-fresh offer; remove the converter sentence from `agents/_shared/orchestrator-state.md`.
- [x] 3.3 Update the converter test cases to assert the administrative close.
- [x] 3.4 Refuse a symlinked `control/` path or events file in the administrative close and cover both cases in the control-plane test.

## 4. Reconcile specs and docs

- [x] 4.1 Apply this change's `openspec-design-orchestration` and `design-single-pass` deltas; run `openspec validate --strict`.
- [x] 4.2 Remove pre-v5 helper and overlay references from `docs/openspec-integration.md`, `docs/pipeline-v5-migration.md`, and `docs/observability.md`.
- [x] 4.3 Regenerate Codex and opencode projections; run the projection suite, `bash tests/run-all.sh`, and `bash tests/run-behavioral.sh`.

## 5. Close

- [x] 5.1 Record deleted line counts per file in `changelog.d/retire-legacy-pipeline-helpers.md`; lower the affected `ceiling` values in `tests/fixtures/authoring-baseline.json`; bump the internal-distribution version sites.
