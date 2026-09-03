## MODIFIED Requirements

### Requirement: A real-run baseline exists before contract rewrites
The repository SHALL hold `docs/benchmarks/pipeline-baseline.md` recording, for a small-fix, a medium-feature, and a security-sensitive-fix fixture request run through the live pipeline against a named tree anchor: time to Gate 1, architect dispatches, acceptance-criteria count, specialist dispatches, tool calls, correction rounds, terminal state, and exclusive defects per lens the v5 validation fan can dispatch — `qa`, `tester`, `cleaner`, and `security`. An exclusive-defect cell SHALL be derived from the `Lens` column of `reviews/findings-ledger.md`; a lens the run did not dispatch records `n/a — lens not dispatched`. A change that alters dispatch, state, or recovery contracts SHALL compare its own measurement against this file. The deterministic contract benchmark is retained and is not a substitute.

#### Scenario: A contract change reaches its benchmark task
- **WHEN** a change that alters dispatch or recovery contracts records its measurement
- **THEN** its report cites the baseline file's tree anchor and states each metric as before/after

#### Scenario: The baseline is missing
- **WHEN** such a change is validated and the baseline file is absent
- **THEN** `tests/test_openspec_scope.py` fails naming the missing file

#### Scenario: A run does not dispatch a lens
- **WHEN** a recorded run's validation fan never dispatched `tester` or `cleaner`
- **THEN** that lens's exclusive-defect cell reads `n/a — lens not dispatched`, never `pending-runs` or a count
