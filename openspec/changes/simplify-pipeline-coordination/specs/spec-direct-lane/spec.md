## RENAMED Requirements

- FROM: `### Requirement: The direct lane delegates completion phases without pipeline activation`
- TO: `### Requirement: The direct lane keeps execution with Main and independent review`

## MODIFIED Requirements

### Requirement: The direct lane keeps execution with Main and independent review
The spec workflow MUST keep written intent, implementation, validation and PR preparation/publication with the current principal by default. It SHALL retain applicable OpenSpec, testing, sketch, workspace and independent-review capabilities. A phase transition SHALL NOT require a separate executor or pipeline activation. Main SHALL judge findings and own corrections under existing authorization; bounded delegation remains available for genuinely independent work or an explicit request.

#### Scenario: Independent tasks
- **WHEN** approved spec work includes a useful independent task
- **THEN** Main may delegate that bounded task while retaining the same objective, OpenSpec and workspace, without turning each phase into another mandatory agent.

#### Scenario: A short task worth written intent arrives
- **WHEN** the operator selects spec for a bounded objective
- **THEN** Main proceeds through the authorized phases with written intent and applicable quality tools, preserving continuity in the current conversation.

#### Scenario: The operator asks for a review inside the lane
- **WHEN** QA, security or another independent lens is selected
- **THEN** Main obtains that review, evaluates the findings and verifies corrections while preserving applicable existing provider evidence.

#### Scenario: Implementation reaches validation
- **WHEN** authorized implementation finishes
- **THEN** Main continues into applicable checks and upstream verification without requiring spec-validator or another phase executor.

#### Scenario: A PR is prepared and published
- **WHEN** the endpoint includes an authorized PR
- **THEN** Main uses create-pr, current evidence and the completed archive without requiring pr-creator, repeating unaffected assessments or implying merge authority.

#### Scenario: A phase is outside the endpoint
- **WHEN** the request stops at planning or local completion
- **THEN** Main stops at that endpoint without executing excluded phases or claiming their completion.

#### Scenario: Native dispatch is unavailable
- **WHEN** no selected independent review requires an unavailable native capability
- **THEN** Main can continue the authorized spec work itself; missing optional executors do not create a workflow blocker.

#### Scenario: An existing phase assessment remains applicable
- **WHEN** work resumes with current checks, review results or prepared PR artifacts
- **THEN** Main reuses them and renews affected evidence after corrections, preserving original findings and reasoned dispositions.

#### Scenario: The lane documents when publication is blocked
- **WHEN** required coverage, scope or native permission remains unresolved
- **THEN** Main reports that concrete limitation rather than claiming a historical verdict or phase token controls publication.
