## ADDED Requirements

### Requirement: Spec resumes from existing outcomes
Main SHALL begin with the requested endpoint and existing intent, implementation,
checks and review evidence, completing only real gaps. Provider stages SHALL use
the principal by default rather than requiring one agent per method. Required
OpenSpec verification, applicable testing methods and selected independent review
SHALL remain available without recreating completed planning or delivery work.

#### Scenario: Spec is requested after implementation
- **WHEN** a hotfix and test results already exist
- **THEN** Main records or reconciles its actual intent, verifies missing outcomes and reuses applicable checks without pretending implementation has not started

#### Scenario: Test methods share evidence
- **WHEN** test-design, test-review, trace and a selected reviewer address the same change
- **THEN** each consumes existing relevant evidence and answers its distinct question; another full test analysis or execution requires a concrete gap, invalidated input or explicit request

#### Scenario: A correction invalidates some checks
- **WHEN** a finding changes implementation or test inputs
- **THEN** Main renews affected checks and broadens only for a demonstrated dependency, failure, repository requirement or explicit operator request, preserving unaffected evidence
