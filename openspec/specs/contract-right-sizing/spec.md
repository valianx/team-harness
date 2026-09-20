# contract-right-sizing Specification

## Purpose
Keep specialist contracts concise and grounded in the artifacts needed for their assigned work, with optional comparative measurements that report their evidence and limits.

## Requirements

### Requirement: Reference and shared-contract files carry a shrink-only word ceiling
`tests/fixtures/authoring-baseline.json` SHALL record a `ceiling` in words for every `agents/ref-*.md` and `agents/_shared/*.md` file above its class budget, and MAY record a `target`. The authoring-budget suite SHALL fail when a file exceeds its `ceiling` and SHALL fail when a recorded `ceiling` exceeds the file's current count by more than 2%. A `reason` field is reported, never used to pass.

#### Scenario: A PR adds words to a reference file
- **WHEN** `agents/ref-special-flows.md` grows past its recorded ceiling
- **THEN** the suite fails naming the file, the ceiling, and the current count

#### Scenario: A PR shrinks a file without lowering its ceiling
- **WHEN** a file's count falls more than 2% below its recorded ceiling
- **THEN** the suite fails until the fixture records the lower ceiling

### Requirement: Deterministic classification lives in helpers, never in prose
An agent or skill contract SHALL name the helper that performs a deterministic classification and its closed output vocabulary. It SHALL NOT restate the helper's flag list, decision procedure, attempt ordinals, or repair packet contents. `/th:lint` SHALL fail on a closed list of retired phrases that mark such restatement; a file may be exempted only in a shrink-only map that names the change removing the exemption.

#### Scenario: A contract restates a classifier's flags
- **WHEN** lint finds `--contract-signal` enumerations or `retry-contract` in `agents/**` or a `SKILL.md`
- **THEN** Check 12 fails with the file and phrase named

#### Scenario: An exempted file loses its phrases
- **WHEN** an exempted file no longer contains any retired phrase
- **THEN** the lint test fails until the exemption entry is removed

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
