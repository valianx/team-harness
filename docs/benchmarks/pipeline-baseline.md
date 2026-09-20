# Optional pipeline measurements

Use these reusable requests when a live comparison would answer a specific
question about pipeline cost or quality. They do not need to run before every
contract change, and this guide is not a claim that any run has completed.

| Fixture | Class | Request |
|---|---|---|
| `small-fix` | small fix | `tests/fixtures/pipeline-baseline/small-fix.md` |
| `medium-feature` | medium public feature | `tests/fixtures/pipeline-baseline/medium-feature.md` |
| `security-sensitive` | security-sensitive fix | `tests/fixtures/pipeline-baseline/security-sensitive.md` |

For a selected comparison, record each revision/tree anchor, model/runtime,
request and relevant conditions in the configured workspace. Measure time to
Gate 1, architect and specialist dispatches, tool calls, acceptance-criteria
count, correction rounds and terminal state where observable. State missing
measurements explicitly and compare only equivalent runs.

For exclusive defects, use the originating `Lens` in
`reviews/findings-ledger.md`. A defect shared by two lenses (same class and an
overlapping evidence path) is exclusive to neither. A lens not dispatched is
reported as such, without a fabricated count. Keep per-run reports, logs and
raw measurements outside tracked product files.

`tests/test_pipeline_simplification_benchmark.mjs` remains a separate
deterministic check of helper-operation counts. Its fixture-based comparison
does not demonstrate live wall-clock or token savings. The old three-run
baseline was never recorded; no performance result is claimed by its retirement.
