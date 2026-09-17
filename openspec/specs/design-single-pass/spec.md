# design-single-pass Specification

## Purpose

Keep OpenSpec design concise and proportional to the objective without a fixed
architect ceremony or a second planning control layer.

## Requirements

### Requirement: Existing valid intent is reused
When an OpenSpec change already answers the objective and passes validation,
Main SHALL use it directly. When material design authorship or investigation is
missing, Main MAY request one bounded architect pass and then reconcile the
result in the canonical change.

#### Scenario: A complete change exists
- **WHEN** the proposal, requirements and tasks validate for the requested objective
- **THEN** Main proceeds without a duplicate architect, overlay or planning panel

#### Scenario: A design question is unresolved
- **WHEN** implementation would otherwise depend on a material design choice
- **THEN** Main requests the smallest useful research or architecture input and records the decision in OpenSpec

### Requirement: Validation is a repair aid, not a release gate
OpenSpec and repository validators SHALL report malformed intent, missing
sections and implementation mismatches with an actionable reason. A validator
failure does not create a second approval protocol or require a new session when
the authorized objective remains unchanged.

#### Scenario: A validator finds an invalid task list
- **WHEN** strict validation fails
- **THEN** Main repairs the canonical change when authorized, reruns the relevant check and keeps the failure visible until it passes

### Requirement: Change size stays readable
`openspec/config.yaml` SHALL keep the repository's proposal, task and
requirement-size limits. If an objective exceeds a limit, Main presents a
practical split or scope adjustment; there is no machine-written oversize event
or gate required to continue after the operator chooses the approach.

#### Scenario: A proposal is too large to review comfortably
- **WHEN** the configured limit is exceeded
- **THEN** Main reports the count and offers smaller changes or a clearly explained scope choice
