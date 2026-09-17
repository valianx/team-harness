# validation-convergence Specification

## Purpose

Help Main make useful corrections from evidence without turning review rounds,
severity labels or reviewer output into a duplicate execution controller.

## Requirements

### Requirement: Findings describe concrete coverage and limits
Each tester, QA, security or adversarial result SHALL identify the examined
surface, meaningful findings, checks performed and important omissions. A lens
SHALL report uncertainty instead of claiming a clean result when the target or
evidence was unavailable.

#### Scenario: A reviewer finds one instance of a repeated defect
- **WHEN** the same root cause can affect other changed sites
- **THEN** the reviewer reports the known scope and coverage limit so Main can decide whether to inspect more

### Requirement: Main owns finding disposition
Main SHALL keep material findings and their disposition visible in the current
task context or review summary. Findings MAY be fixed, accepted with rationale,
deferred or escalated, but a reviewer result SHALL not open a mandatory
correction package, release a gate or close itself.

#### Scenario: A finding is accepted as a residual concern
- **WHEN** Main judges that it does not justify blocking the requested delivery
- **THEN** the concern and rationale remain visible in the PR or task result

### Requirement: Corrections are verified against changed behavior
When Main applies a correction, it SHALL run the relevant tests or inspection
that establishes the affected property and refresh evidence when the candidate
changed. There is no fixed correction round, retry count or automatic full
re-review requirement.

#### Scenario: A correction changes the candidate
- **WHEN** the code or relevant spec changes after a review
- **THEN** Main reruns the checks that may have become stale and reports any remaining uncertainty

### Requirement: Review selection follows risk and operator need
Main SHALL choose whether to request independent testing, QA, security or adversarial review when
the changed surface, uncertainty or operator request makes it useful. A risk
classifier can recommend lenses, including for removals, but no classifier or
absent lens independently decides publication.

#### Scenario: A security signal is unknown
- **WHEN** the changed surface cannot be classified confidently
- **THEN** Main reports the uncertainty and chooses whether additional security evidence is useful

### Requirement: Observability remains optional
Counts, elapsed time, lens status and evidence summaries MAY be retained as
telemetry for diagnosis. They SHALL not become an authority record, retry quota,
specialist lease or publication condition.

#### Scenario: Telemetry is unavailable
- **WHEN** a trace or review summary cannot be written
- **THEN** Main continues with the native task and reports the missing observation without treating it as a product failure
