## RENAMED Requirements

- FROM: `### Requirement: A real-run baseline exists before contract rewrites`
- TO: `### Requirement: Contract benchmarks are an optional measurement method`

## MODIFIED Requirements

### Requirement: Contract benchmarks are an optional measurement method
Team Harness SHALL retain reusable fixture requests and guidance for optional
comparative pipeline measurements. Contract changes SHALL NOT require three live
pipeline runs or a tracked execution-result table to proceed. When measurement
is selected, the coordinator SHALL record the compared tree anchors, conditions,
metrics and limitations in the configured workspace, distinguish live measurements
from deterministic helper-operation counts, and avoid claiming unexecuted runs.

#### Scenario: A contract change reaches its benchmark task
- **WHEN** the operator selects a comparative measurement for a contract change
- **THEN** the workspace report names both tree anchors and comparable before/after metrics, or states why a comparison is inconclusive

#### Scenario: The baseline is missing
- **WHEN** no live baseline exists for an otherwise validated contract change
- **THEN** delivery remains possible without creating placeholder results or starting pipelines solely to satisfy a process check

#### Scenario: A run does not dispatch a lens
- **WHEN** a selected measurement did not dispatch a validation lens
- **THEN** that lens is reported as not dispatched, without inventing an exclusive-defect count
