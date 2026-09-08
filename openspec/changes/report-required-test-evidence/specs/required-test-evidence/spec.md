## ADDED Requirements

### Requirement: Selected test evidence distinguishes execution from omission
Main and test authors SHALL use available native results to identify execution, failure or omission of tests selected by the approved requirements or live request. A required omitted test SHALL leave its scenario unverified; optional unrelated skips SHALL NOT automatically invalidate otherwise sufficient evidence. Missing counts SHALL remain unknown.

#### Scenario: A required test is omitted in a successful run
- **WHEN** the command exits successfully but omits the selected test needed to prove the scenario
- **THEN** the acceptance summary identifies that scenario as unverified and reports the available omission reason

#### Scenario: An unrelated optional test is skipped
- **WHEN** the selected tests ran successfully and a separate optional test was omitted
- **THEN** the summary preserves the verified evidence and distinguishes the optional omission

#### Scenario: The runner provides insufficient detail
- **WHEN** available output cannot establish whether the selected test ran
- **THEN** the summary states the missing evidence without inventing counts or execution

### Requirement: Evidence remains proportional to the changed behavior
Authors SHALL reuse existing tests and sufficient command or inspection evidence. They SHALL prefer isolated tests when sufficient and retain real integration evidence for behavior that depends on that boundary. This rule SHALL create no universal per-scenario registry, parser, full-suite obligation or specialist dispatch.

#### Scenario: A database behavior needs a real integration check
- **WHEN** a changed transaction or database behavior cannot be demonstrated by the existing isolated tests
- **THEN** the author uses the project's relevant integration evidence or records its absence instead of claiming a mock proved it
