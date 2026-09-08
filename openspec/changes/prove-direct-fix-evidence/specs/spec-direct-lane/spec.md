## ADDED Requirements

### Requirement: Direct fix evidence is optional, bounded and directional
When a concrete bug warrants it within approved scope or the live operator requests it, Main SHALL name the hypothesis, assertion, base and candidate, and use native execution on isolated copies with bounded duration and output. The same assertion or external probe SHALL run against both revisions without changing the operator checkout. This procedure SHALL create no universal gate, new runner or dependency installation.

#### Scenario: A fix is demonstrated
- **WHEN** the same assertion fails at base because of the target bug and passes at the candidate
- **THEN** Main records both revisions, commands, outcomes and the matching failure cause as evidence for that scenario

#### Scenario: The old failure is not demonstrated
- **WHEN** both revisions pass or both fail the target assertion
- **THEN** Main does not claim a demonstrated fix and reports the actual pair of outcomes

#### Scenario: Execution is incomparable
- **WHEN** a revision cannot run the same assertion because of missing prerequisites, a test present only at the candidate, incompatible setup or timeout unrelated to the target behavior
- **THEN** Main reports the attempt as inconclusive rather than treating that condition as a reproduced bug

#### Scenario: The optional procedure is not selected
- **WHEN** the approved requirements and live request do not require this before/after proof
- **THEN** Main can use the normal relevant evidence without opening another test phase or reporting the proof as performed
