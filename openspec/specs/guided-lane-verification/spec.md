# guided-lane-verification Specification

## Purpose

Provide useful, anchored review evidence for a chosen workflow without turning
review classification into a Team Harness release gate.

## Requirements

### Requirement: Review packages come from current repository evidence
The review helper SHALL derive the committed range, changed surface, relevant
written intent and optional risk signals from the repository. Main SHALL not
hand-assemble a competing acceptance or dispatch contract from copied prose.

#### Scenario: A review is requested for a committed range
- **WHEN** Main invokes the review helper with a repository and range
- **THEN** the package names the actual target, changed paths, available intent and selected lenses

#### Scenario: The target is dirty or unavailable
- **WHEN** the requested range cannot be read as the stated committed target
- **THEN** the helper reports the missing prerequisite and emits no misleading pass

### Requirement: Review lenses are independent, native and read-only
Each selected lens SHALL inspect the same identified target through the runtime's
native read-only boundary and return findings, coverage, limits and a
recommendation. Several lenses form one review; their count does not create a
specialist quota or another workflow phase.

#### Scenario: A lens cannot inspect its target
- **WHEN** the read-only boundary or target identity cannot be verified
- **THEN** that lens reports unavailable or incomplete with the reason, and Main keeps the limitation visible

### Requirement: Review output is advisory
The coordinator SHALL preserve every meaningful finding and coverage limit, then
evaluate the returns against the objective, code and relevant checks. A helper
summary or `gate` compatibility alias MAY organize the returns, but it MUST NOT
resolve a Team Harness `ready` state or independently block or publish a PR.

#### Scenario: A reviewer reports a blocker
- **WHEN** a selected lens identifies a defect
- **THEN** Main decides whether to correct, accept, defer or explain it using the wider context

### Requirement: Corrections use evidence instead of a review quota
After a correction, Main SHALL run the checks that establish the affected
behavior and refresh review evidence when the candidate or uncertainty warrants
it. The flow MUST NOT require a second full review or a fixed number of rounds
solely because a reviewer returned a finding.

#### Scenario: A correction changes the reviewed candidate
- **WHEN** the branch or relevant evidence changes
- **THEN** Main refreshes the applicable checks and reports what remains covered or unknown

### Requirement: Security signals guide useful attention
Main SHALL use changed-surface signals to guide useful attention. The changed-surface classifier MAY recommend security or adversarial lenses when
the scope warrants them. Unknown or sensitive signals remain visible, but no
absent lens, severity label or classifier result creates a TH publication gate.

#### Scenario: A changed control is detected
- **WHEN** the classifier sees an authentication, authorization, secret or comparable control change
- **THEN** Main explains the signal and chooses useful security evidence with the operator when needed
