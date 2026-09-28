## ADDED Requirements

### Requirement: Review assignments bound specialist work
Main SHALL supply each reviewer with a specific question, candidate, included and excluded scope, relevant acceptance sources and available evidence. Fixed roles SHALL describe expertise and execution boundaries without requiring a general context tour or overlapping broad checklist. Specialists SHALL read supporting context as needed for their assigned question, preserve applicable native project guidance, and report material concerns outside the assignment without expanding it themselves.

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
