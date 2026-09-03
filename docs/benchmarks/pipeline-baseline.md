# Pipeline real-run baseline

Measurements from three fixture requests run through the **live** pipeline. This
is the wall-clock and dispatch record that
`tests/test_pipeline_simplification_benchmark.mjs` cannot produce: that suite
compares normalized helper-operation counts against fixture data and never runs
a pipeline. A change that alters dispatch, state, or recovery contracts records
its own measurement and cites this file's tree anchor, stating each metric as
before/after.

The three runs are executed as separate operator-driven pipelines; every cell
below reads `pending-runs` until each run completes and its numbers are
recorded here.

## Fixture requests

| Fixture | Class | Request |
|---|---|---|
| `small-fix` | small fix | `tests/fixtures/pipeline-baseline/small-fix.md` |
| `medium-feature` | medium feature, public surface | `tests/fixtures/pipeline-baseline/medium-feature.md` |
| `security-sensitive` | security-sensitive fix | `tests/fixtures/pipeline-baseline/security-sensitive.md` |

## Measurements

| Metric | Tree anchor | `small-fix` | `medium-feature` | `security-sensitive` |
|---|---|---|---|---|
| Tree anchor | `pending-runs` | `pending-runs` | `pending-runs` | `pending-runs` |
| Time to Gate 1 | `pending-runs` | `pending-runs` | `pending-runs` | `pending-runs` |
| Architect dispatches | `pending-runs` | `pending-runs` | `pending-runs` | `pending-runs` |
| Acceptance-criteria count | `pending-runs` | `pending-runs` | `pending-runs` | `pending-runs` |
| Specialist dispatches | `pending-runs` | `pending-runs` | `pending-runs` | `pending-runs` |
| Tool calls | `pending-runs` | `pending-runs` | `pending-runs` | `pending-runs` |
| Correction rounds | `pending-runs` | `pending-runs` | `pending-runs` | `pending-runs` |
| Terminal state | `pending-runs` | `pending-runs` | `pending-runs` | `pending-runs` |
| Exclusive defects — `qa` | `pending-runs` | `pending-runs` | `pending-runs` | `pending-runs` |
| Exclusive defects — `tester` | `pending-runs` | `pending-runs` | `pending-runs` | `pending-runs` |
| Exclusive defects — `cleaner` | `pending-runs` | `pending-runs` | `pending-runs` | `pending-runs` |
| Exclusive defects — `security` | `pending-runs` | `pending-runs` | `pending-runs` | `pending-runs` |

Exclusive-defect rows name the four lenses the v5 validation fan can dispatch. A
cell counts findings whose `Lens` in `reviews/findings-ledger.md` is that lens
and whose defect no other lens reported, where two findings are the same defect
when they share `class` and at least one `evidence_paths` entry; a lens the run
did not dispatch records `n/a — lens not dispatched`. A recorded run never
leaves `pending-runs`, and `tests/test_openspec_scope.py` rejects any other
cell value in these rows.

The per-run tree anchor is the full `tree_anchor` value defined in
`docs/verification-packet.md § 1a`, recorded for the tree the run executed
against. Anchor equality is a plain string comparison of the full value.
