## ADDED Requirements

### Requirement: Review preparation and recovery are proportionate
Main SHALL supply the anchored candidate, selected question, relevant intent and
available test evidence with concrete omissions in a concise dispatch. Reviewers
SHALL inspect the changed surface and pertinent dependencies, reuse applicable
provider assessments, report findings and coverage limits, and avoid a general
audit or repeating checks without a concrete reason. Native runtime permissions
SHALL govern execution. Recovery SHALL address an observed cause rather than
requiring another execution path for every failed reviewer.

#### Scenario: A small reviewed change has current test results
- **WHEN** the candidate has checks and a test-quality assessment
- **THEN** the reviewer evaluates the selected question using those results and investigates concrete gaps without starting an equivalent test-review workflow

#### Scenario: A reviewer cannot read its target
- **WHEN** native execution fails before reading the anchored candidate
- **THEN** Main attempts a supported focused repair when useful, or preserves the failure and any findings as limited coverage without a compulsory CLI retry or invented pass

#### Scenario: A reviewer returns useful partial work
- **WHEN** an execution stops before completing its selected scope
- **THEN** Main retains findings and unchecked scope and judges delivery under existing authorization and explicit operator prerequisites
