# quality-runner-diagnostics Specification

## Purpose
Every quality-stack failure code identifies one actionable cause, and the catalogued spurious-blockage generators are removed. Lands before the Freeze collapse so the single run can distinguish candidate defects from runtime restrictions.

## Requirements

### Requirement: Failure taxonomy distinguishes cause classes
The runner SHALL emit distinct codes for distinct causes: `MANIFEST_ABSENT` ≠ `MANIFEST_INVALID`, `TIMEOUT` and `SPAWN_FAILED` ≠ `COMMAND_FAILED`, and every validation failure carries a bounded `detail` field naming the failed condition. Environment-cause codes (`PREREQUISITE_UNAVAILABLE`, `SPAWN_FAILED`, `TIMEOUT`, repository-latency failures) MUST be distinguishable from candidate-defect codes without reading runner source.

#### Scenario: A long suite exceeds the timeout
- **WHEN** a declared command runs past its configured or default timeout
- **THEN** the envelope reports `TIMEOUT` with the elapsed bound, not a code implying a regression

#### Scenario: A manifest key has a typo
- **WHEN** manifest validation rejects a document
- **THEN** the result names the offending key/condition in `detail` instead of a bare `MANIFEST_INVALID`

### Requirement: Plan-declared checks are validated at Gate 1
Required quality checks named by the plan SHALL be validated against the manifest before Gate-1 presentation; a mismatch is a plan defect surfaced while it is cheap to fix, and `REQUIRED_CHECKS_MISSING` at Freeze becomes unreachable for well-formed plans.

#### Scenario: The plan names a check the manifest does not declare
- **WHEN** Gate-1 preparation compares required checks with manifest command ids
- **THEN** the mismatch is reported at Gate 1 and the plan is corrected before approval

### Requirement: Identity checks tolerate the pipeline's own operations
Cross-checkpoint artifact identity SHALL use canonical hashing (not raw-byte equality) for manifest, contract, allowlist, and baselines; ancestry validation SHALL tolerate the pipeline's own squash/amend operations; and worktree cleanliness SHALL NOT fail on untracked toolchain byproducts (explicit benign-artifact policy or `--untracked-files=normal`), with the internal git timeout configurable for slow filesystems.

#### Scenario: A test suite writes a cache directory
- **WHEN** a declared command leaves an untracked, non-conflicting byproduct (e.g. a test cache)
- **THEN** the run does not fail with a worktree-mutation code

#### Scenario: Assembly squashes commits before Freeze
- **WHEN** the candidate is re-anchored by the pipeline's own assembly squash
- **THEN** evidence remains valid instead of failing ancestry equality

### Requirement: Command declaration is open and tiered
The manifest SHALL accept any command id that passes hermetic argv validation (closed known-id list retired), and severity SHALL be manifest-declared per command with safe defaults: acceptance-critical commands block; style-class commands may be declared advisory.

#### Scenario: A repo declares an e2e command
- **WHEN** the manifest declares `e2e` with a valid argv
- **THEN** validation accepts it instead of invalidating the whole manifest

### Requirement: Shared helpers have one implementation
The quality-stack scripts SHALL share one helper module for hashing, path validation, bounded git access, and JSON reading; per-script copies are removed.

#### Scenario: A helper's behavior changes
- **WHEN** a shared helper is edited
- **THEN** all quality-stack entry points observe the same behavior with no per-script drift
