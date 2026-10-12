# repeatable-plan-benchmarks Specification

## Purpose
Let contributors reproduce bounded comparisons of plan-review guidance and assess
quality alongside observed resource use without treating a pilot as proof of
complete workflow behavior or general savings.

## Requirements

### Requirement: A prepared study preserves comparable inputs

The maintained tooling SHALL prepare studies from immutable baseline and
candidate Git revisions and synthetic cases. It SHALL record the selected
runtime, explicit model and effort, cases, repetitions, seed, ordering and
protocol identity. A/B and B/A order SHALL be balanced across declared pairs.
Preparation SHALL NOT start a model run or change installed provider settings.

#### Scenario: A study is prepared for two revisions
- **WHEN** a contributor supplies two revisions, cases and explicit runtime settings
- **THEN** the prepared study preserves those inputs and hashes for later execution and analysis

### Requirement: Live execution is explicit and bounded

Live execution SHALL require an explicit trial limit, preserve study identity,
run each comparison in fresh native sessions under the declared tool boundary,
and retain completed results without repeating them on resumption. Model
failure, interrupted work and unavailable measurement SHALL remain visible.
Hermetic verification SHALL use fixtures rather than live model requests.

#### Scenario: A completed study is resumed
- **WHEN** the contributor resumes execution with a trial limit
- **THEN** completed trials are retained and only eligible unfinished work is attempted within that limit

#### Scenario: A test exercises the execution adapter
- **WHEN** repository verification tests the runner
- **THEN** it uses simulated native streams and processes without model calls or dependency installation

### Requirement: Measurement reports preserve native categories and missing data

The report SHALL identify observed wall time and native input, cached input,
output and reasoning categories where the runtime supplies them. Reasoning
detail SHALL NOT be added to an output total that already includes it. Missing
usage and failed trials SHALL be reported separately from successful measured
trials. Runtime identity SHALL remain available and comparisons SHALL be grouped
by runtime rather than attributing a mixed-runtime aggregate to one model.
The report SHALL NOT infer billed monetary cost from tokens.

#### Scenario: A runtime does not supply usage
- **WHEN** a trial has no usable native usage record
- **THEN** its usage remains unavailable rather than fabricated as a measured zero

### Requirement: Quality adjudication belongs to the same study

Analysis SHALL bind quality adjudication to the prepared study identity and
trial identifiers, report incomplete or conflicting coverage, and distinguish
semantic adjudication from provisional heuristic scoring. Quality reporting
SHALL include defect detection, false positives and applicable repair criteria
without interpreting an unadjudicated result as a pass.

#### Scenario: An adjudication belongs to another study
- **WHEN** an adjudication has a mismatched study identity
- **THEN** analysis rejects it as evidence for this study and reports the missing coverage

### Requirement: Maintained tools and execution evidence have separate destinations

Reusable tools, cases and hermetic tests SHALL be versioned. Study outputs
SHALL use an explicit external or Git-ignored destination. Usage documentation
SHALL state the measured scope and its limitations; spec and pipeline prompt
labels SHALL NOT imply execution of those complete workflows.

#### Scenario: Output targets tracked product content
- **WHEN** a contributor selects a destination inside a Git repository that is not ignored
- **THEN** preparation or analysis fails before writing execution evidence there
