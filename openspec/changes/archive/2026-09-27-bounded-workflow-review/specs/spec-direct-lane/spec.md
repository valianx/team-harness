## ADDED Requirements

### Requirement: Spec reuses orchestration context across stages
Spec SHALL keep the existing four phases, TEA test-design/test-review/trace, Superpowers completion evidence and OpenSpec verification. Shared phase guidance SHALL own their sequence, provider guidance their invocation, and lifecycle guidance archive readiness. Within an effort, Main SHALL reuse resolved healthy provider entries and loaded unchanged TH guidance, loading each distinct method as needed and refreshing after a relevant change, failure or explicit upstream requirement. A handoff SHALL link existing outcomes without requiring another equivalent report or analysis.

#### Scenario: Implementation continues into validation
- **WHEN** providers are resolved and the shared phase guidance has already been read
- **THEN** Main executes the remaining methods with the same evidence and workspace without repeating provider discovery or recursively restarting completed routing steps

#### Scenario: Provider state changed
- **WHEN** a provider was updated, its selected entry changed or execution fails
- **THEN** Main refreshes the affected provider context before relying on it rather than reusing stale instructions

#### Scenario: Several methods consume test evidence
- **WHEN** TEA, OpenSpec verification and an independent reviewer need the same test results
- **THEN** each executes its distinct assigned method using the shared results; the plan links actual outcomes once and preserves any required upstream artifacts
