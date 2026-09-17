# openspec-design-orchestration Specification

## Purpose

Keep OpenSpec the canonical source of written intent while Team Harness adds
only workflow guidance, coordination and evidence around it.

## Requirements

### Requirement: OpenSpec is available in the workflows that need written intent
Main SHALL use the installed OpenSpec instructions and CLI for a chosen `spec`
or coordinated pipeline workflow. OpenSpec is not a hidden second pipeline and
its artifact status does not itself grant permission, start implementation or
release delivery.

#### Scenario: The operator chooses a spec workflow
- **WHEN** a bounded objective needs written intent
- **THEN** Main uses the current OpenSpec change surface and reports validation and task progress in the native session

### Requirement: Canonical artifacts are not duplicated in prompts or plans
Proposal, requirements, design decisions and tasks SHALL remain in the owning
repository's OpenSpec change. A short workspace note MAY link them and record
progress, but it MUST NOT become another editable acceptance source or dispatch
contract.

#### Scenario: A plan projection is useful
- **WHEN** Main creates a progress note for continuity
- **THEN** it links canonical OpenSpec paths and current evidence instead of copying their semantic content

### Requirement: Planning authorship is proportional to the objective
Main SHALL reuse a complete valid change. When a material design question or
missing intent requires help, it MAY ask an architect or other specialist for
research and recommendations; there is no mandatory architect count or fixed
planning panel.

#### Scenario: Existing intent is complete
- **WHEN** the active OpenSpec change passes validation and answers the objective
- **THEN** Main proceeds to implementation without dispatching a duplicate planning review

### Requirement: OpenSpec validation failures remain visible and recoverable
If validation or an OpenSpec operation fails, Main SHALL report the concrete
failure, repair ordinary prerequisites when authorized and continue when the
same objective remains valid. A validation result is evidence about artifacts;
it does not create a gate or require a new session by itself.

#### Scenario: The CLI or change is unavailable
- **WHEN** strict validation cannot run or the change is malformed
- **THEN** Main preserves the current work, identifies the repair and waits only for a genuinely missing decision or prerequisite

### Requirement: Repository ownership remains clear
OpenSpec artifacts SHALL stay in the repository that owns the change. A shared
workspace may hold links, evidence and progress for a sequential or
multi-repository objective, but it SHALL not become a second OpenSpec root or a
Team Harness authority store.

#### Scenario: A service is evidence-only
- **WHEN** a repository is inspected without planned writes
- **THEN** its artifacts remain read-only evidence and no coordinator file is created there
