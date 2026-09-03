## Why

The v5 pipeline reads acceptance intent from the bound OpenSpec change and projects `01-plan.md` mechanically, but the specialists on every run's critical path still read the retired `sharded-v1` plan set. `qa` blocks fail-closed when `01-plan.md` is missing and live-reads `plan/tasks/Task-N.md`; `implementer` resolves its work from `01-plan.md § Task Index` and blocks on a missing plan; `adversary`, `security`, `delivery`, and `ux-reviewer` read plan shards; several verifiers name `02-implementation.md`, which no v5 writer produces. `docs/verification-packet.md` declares the coordinator as the packet's builder and points at `agents/ref-pipeline.md § Freeze and validation`, a section that never mentions the packet. A read with no producer yields `artifact-missing`, a re-dispatch repeats the causal identity, and the coordinator pauses on a non-semantic cause; the 2026-09-03 audit traced the pause pressure to this desync.

The same audit found the specialist-value question unanswerable: `docs/benchmarks/pipeline-baseline.md` has an exclusive-defects row for `adversary`, which v5 never dispatches, none for `tester` or `cleaner`, and no ledger records which lens raised a finding.

## What Changes

- Rewrite the read manifests of `qa`, `implementer`, `adversary`, `security`, `delivery`, and `ux-reviewer` so every mandatory read names an artifact the v5 pipeline produces: acceptance intent from the bound change's `specs/**/spec.md` and `tasks.md`, scope and decisions from the `01-plan.md` projection, the frozen candidate diff instead of `02-implementation.md`.
- Declare the coordinator's Freeze-time build of `00-verify-packet.md` and `inputs/00-frozen.diff` in `agents/ref-pipeline.md`, and repoint `docs/verification-packet.md`, `docs/output-contract-patterns.md`, `agents/ref-special-flows.md`, and `agents/README.md` at the v5 artifact set.
- Add `tests/fixtures/workspace-artifacts.json`, a registry of every workspace artifact with its producer or `retired` status, and `tests/test_workspace_artifacts.py`, which fails when a scanned contract names an unregistered artifact, names a retired one, or names a producer that does not mention the artifact.
- Record the originating lens on every projected finding: `control-plane.mjs` joins the accepted result to its lease role and prints a `Lens` column in `reviews/findings-ledger.md`; the decision ledger's `disposition` record gains a `lens` field.
- Correct `docs/benchmarks/pipeline-baseline.md`: exclusive-defect rows for the four lenses the v5 pipeline can dispatch (`qa`, `tester`, `cleaner`, `security`), derivable from the `Lens` column, with `n/a — lens not dispatched` as an explicit cell value.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `specialist-coordination-protocol`: specialist reads name produced artifacts; registry oracle.
- `validation-convergence`: findings ledger and disposition carry the originating lens.
- `contract-right-sizing`: baseline exclusive-defect rows follow the v5 lens set.

## Non-Goals

- No change to the recovery contract, the failure-kind partition, or which blocker classes pause to the operator; the audit found that partition sound.
- No retirement of the `sharded-v1` documentation for the architect's standalone Design Mode (`docs/plan-shards.md`, `docs/plan-structure-gate.md`, `agents/ref-architect-design.md`); that is a separate change, and those files are outside the registry scan.
- No new specialist, no removed specialist, no change to the design phase.

## Impact

`agents/{qa,implementer,adversary,security,delivery,ux-reviewer,README}.md`, `agents/ref-pipeline.md § Freeze and validation`, `agents/ref-special-flows.md`, `docs/verification-packet.md`, `docs/output-contract-patterns.md`, `docs/observability.md § 6`, `docs/benchmarks/pipeline-baseline.md`, `skills/pipeline/scripts/control-plane.mjs` and its two mirrors, `tests/test_pipeline_control_plane.mjs`, the new registry and test, `tests/run-all.sh`, and the Codex projections of every touched agent.
