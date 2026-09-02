# contract-right-sizing Specification

## Purpose
TBD - created by archiving change right-size-pipeline-contracts. Update Purpose after archive.

## Requirements

### Requirement: A real-run baseline exists before contract rewrites
The repository SHALL hold `docs/benchmarks/pipeline-baseline.md` recording, for a small-fix, a medium-feature, and a security-sensitive-fix fixture request run through the live pipeline against a named tree anchor: time to Gate 1, architect dispatches, acceptance-criteria count, specialist dispatches, tool calls, correction rounds, terminal state, and exclusive defects per lens. A change that alters dispatch, state, or recovery contracts SHALL compare its own measurement against this file. The deterministic contract benchmark is retained and is not a substitute.

#### Scenario: A contract change reaches its benchmark task
- **WHEN** a change that alters dispatch or recovery contracts records its measurement
- **THEN** its report cites the baseline file's tree anchor and states each metric as before/after

#### Scenario: The baseline is missing
- **WHEN** such a change is validated and the baseline file is absent
- **THEN** `tests/test_openspec_scope.py` fails naming the missing file

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
