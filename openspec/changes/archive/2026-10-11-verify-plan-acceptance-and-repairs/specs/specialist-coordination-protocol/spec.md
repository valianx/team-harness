## MODIFIED Requirements

### Requirement: Review assignments bound specialist work
Main SHALL supply each reviewer with a specific question, candidate, included and excluded scope, relevant acceptance sources and available evidence. Fixed roles SHALL describe expertise and execution boundaries without requiring a general context tour or overlapping broad checklist. Specialists SHALL read supporting context as needed for their assigned question, preserve applicable native project guidance, and report material concerns outside the assignment without expanding it themselves. A requested review of a corrected plan SHALL use available delta and prior findings, check affected dependencies and integrated consistency with agreed guarantees, and distinguish demonstrated regression from late discovery or uncertain origin. Grouping by cause or repair SHALL preserve distinct evidence and impact. Plan review SHALL retain a single read-only assignment receiving the canonical role guidance and its explicit invocation boundary.

#### Scenario: A reviewer needs a caller contract
- **WHEN** a changed function cannot be evaluated without its caller
- **THEN** the reviewer reads that supporting contract to resolve the assigned question without starting a project-wide audit

#### Scenario: An unrelated issue is noticed
- **WHEN** QA or security notices a material issue outside the assignment
- **THEN** it flags the concern to Main with its limits and continues the assigned review

#### Scenario: Testing expertise is assigned
- **WHEN** a tester receives owned test paths and a missing regression check
- **THEN** it can author the warranted test and execute assigned relevant checks, while QA/security remain source-read-only and existing sufficient results are reused

#### Scenario: A broad security audit is requested
- **WHEN** the operator explicitly selects a project-wide security audit
- **THEN** the security role reviews that assigned broad scope and reports findings and coverage limits; concise instructions do not restrict it to a PR diff

#### Scenario: A corrected plan is explicitly submitted for review
- **WHEN** Main supplies the current artifacts, relevant delta and available prior findings for a requested plan review
- **THEN** one read-only review assignment receives the canonical plan-reviewer guidance and checks the repair, affected dependencies and integrated plan against agreed requirements and preserved guarantees without requiring unavailable history

#### Scenario: A repair weakens an agreed verification guarantee
- **WHEN** a corrected plan replaces required exact migration equivalence with counts and sums alone
- **THEN** the reviewer reports the lost guarantee, accepts truly equivalent verification, and avoids inventing exact-row requirements when the contract only requires aggregates

#### Scenario: A finding's earlier origin cannot be established
- **WHEN** earlier artifacts cannot prove whether a reopened finding is a regression or late discovery
- **THEN** the reviewer reports uncertain origin while assessing the current defect's material impact and preserving distinct evidence when grouping findings by cause or repair

#### Scenario: A correct plan or editorial repair is inspected
- **WHEN** the artifacts contain no material defect or the plan changes without another explicit plan-review invocation
- **THEN** zero findings is valid and no new review, panel or scope requirement is introduced
