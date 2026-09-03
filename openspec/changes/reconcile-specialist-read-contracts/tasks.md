# Tasks

## 1. Specialist read contracts

- [x] 1.1 Rewrite `agents/qa.md § Session Context Protocol` items 1-2: acceptance intent from the bound change's `specs/**/spec.md` and `tasks.md` via `01-plan.md § Canonical links`; fail-closed on a missing bound change; drop `plan/tasks/Task-N.md` and `02-implementation.md`.
- [x] 1.2 Rewrite `agents/implementer.md § Session Context Protocol` item 2 and the block condition: assigned OpenSpec tasks from the bound change; drop `01-plan.md § Task Index`, `plan/tasks/Task-N.md`, `plan/delivery.md`, and the `plan/**` mention.
- [x] 1.3 Rewrite `agents/adversary.md § Inputs and read order` item 3 and `agents/security.md` design-review scope and manifest: design baseline from `01-plan.md` and the bound change's `design.md`/security requirements; frozen candidate diff as the scan target.
- [x] 1.4 Rewrite `agents/delivery.md` input table and steps 2 and 4: batches and PR grouping from `01-plan.md`, tracked artifacts from the bound change's `tasks.md`, acceptance rows keyed by requirement and scenario names.
- [x] 1.5 Rewrite `agents/ux-reviewer.md` AC sink and validate-mode input: recommended AC return in the status block for the coordinator; live AC read from the bound change's UI/UX scenarios.
- [x] 1.6 Declare the Freeze-time build of `00-verify-packet.md` and `inputs/00-frozen.diff` in `agents/ref-pipeline.md § Freeze and validation` (trim elsewhere to stay under the ceiling); repoint `docs/verification-packet.md § 1`, its No-AC section, pointer list, and § 4 step 0; update `docs/output-contract-patterns.md` item 3, `agents/ref-special-flows.md` consumer row, and `agents/README.md` adversary row.

## 2. Registry oracle

- [x] 2.1 Add `tests/fixtures/workspace-artifacts.json` with every artifact token the scan list references, each with a `producer` file or `status: retired`.
- [x] 2.2 Add `tests/test_workspace_artifacts.py` (unregistered, retired, and producer-mismatch failures) and register it in `tests/run-all.sh` and `docs/testing.md`; confirm it fails on the pre-edit tree and passes after task group 1.

## 3. Originating lens

- [x] 3.1 In `skills/pipeline/scripts/control-plane.mjs`, keep `lease_roles` in the projection, stamp `lens` on each projected finding from the accepted result's lease, and print a `Lens` column in `findingsMarkdown`; sync the two mirrors; add a case to `tests/test_pipeline_control_plane.mjs`.
- [x] 3.2 Add the conditional `lens` field to the `disposition` record in `docs/observability.md § 6` and its field table.
- [x] 3.3 Replace the exclusive-defect rows in `docs/benchmarks/pipeline-baseline.md` with `qa`, `tester`, `cleaner`, `security`, and document `n/a — lens not dispatched`.
- [ ] 3.4 After this change merges, run the three fixture pipelines on `main` and record every metric, tree anchor, and exclusive-defect cell in `docs/benchmarks/pipeline-baseline.md`.

## 4. Close

- [x] 4.1 Regenerate Codex projections (`node tools/codex-runtime/generate.mjs`), run the quality set, and write `changelog.d/reconcile-specialist-read-contracts.md`.
