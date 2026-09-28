## ADDED Requirements

### Requirement: Independent coverage survives workflow handoffs
Pipeline SHALL plan independent review around distinct questions and the candidate being delivered, preserving original assessments and coverage. Entering final validation or invoking another skill SHALL NOT by itself require an equivalent second reviewer. Main SHALL verify that reused evidence covers the selected scope, inspect relevant subsequent changes, and obtain missing independent coverage without relabeling prior results as a fresh pass.

#### Scenario: Pipeline reaches final candidate review
- **WHEN** an earlier independent QA assessment covers the selected question and unchanged relevant candidate inputs
- **THEN** Main reuses that coverage and its original result instead of dispatching another equivalent QA review solely for the phase transition

#### Scenario: One correction changes reviewed behavior
- **WHEN** a repair changes one reviewed contract while other evidence remains applicable
- **THEN** Main checks the changed behavior and requests only the justified remaining review, preserving original findings and unaffected coverage

#### Scenario: Only test execution evidence exists
- **WHEN** a candidate has passing project tests but the selected independent question has not been reviewed
- **THEN** Main still obtains that independent review rather than treating tests as equivalent coverage
