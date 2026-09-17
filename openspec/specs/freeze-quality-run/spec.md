# freeze-quality-run Specification

## Purpose

Run meaningful quality checks against the candidate being delivered without
duplicating runtime permissions or requiring a universal test ceremony.

## Requirements

### Requirement: Quality evidence is bound to the candidate
Main SHALL run the repository's relevant quality commands against the candidate
being delivered and record the commands, outcome and omissions. Reuse is valid
while the candidate and relevant inputs remain unchanged; a changed candidate
refreshes affected checks.

#### Scenario: Implementation reaches validation
- **WHEN** the production change and ordinary tests are ready for candidate review
- **THEN** Main runs the selected quality set and reports the evidence for that candidate

#### Scenario: A correction changes the candidate
- **WHEN** a correction changes code, tests or relevant configuration
- **THEN** Main reruns checks that may have become stale and keeps unrelated valid evidence

### Requirement: Test independence is risk-based
Implementers may author ordinary tests with production work. Main SHALL request
independent tester evidence only for bug reproduction, migration or data safety,
public compatibility, security-control changes, stale evidence or an explicit
operator request. No fixed specialist count or red-to-green ceremony is
required for every task.

#### Scenario: An ordinary change has no independent-test risk
- **WHEN** the implementer can verify the requested behavior with the repository checks
- **THEN** Main uses that evidence without spawning a mandatory tester

#### Scenario: A named risk needs independent evidence
- **WHEN** the objective or operator request calls for independent test design
- **THEN** Main asks a native tester for bounded evidence and reports any limits

### Requirement: Cleanup is concrete and optional
Main SHALL request a cleaner only when deterministic inspection identifies a useful,
behavior-preserving cleanup inside the candidate. An empty cleanup result is a
no-op and does not create a specialist or quality failure.

#### Scenario: No cleanup is eligible
- **WHEN** the candidate has no safe, useful cleanup
- **THEN** Main records no cleanup and continues with the requested work

### Requirement: Quality configuration stays outside product behavior
Workspace-local quality manifests and temporary tool outputs SHALL remain
outside the product diff unless intentionally maintained. A missing optional
manifest is reported as not-applicable rather than becoming an unsatisfiable
Team Harness checkpoint.

#### Scenario: A test leaves a cache
- **WHEN** a quality command creates an untracked temporary byproduct
- **THEN** Main keeps it in the configured workspace or temporary storage and excludes it from the PR candidate
