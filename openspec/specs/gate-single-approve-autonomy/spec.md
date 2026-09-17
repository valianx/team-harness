# gate-single-approve-autonomy Specification

## Purpose

Replace the retired Gate-1/Gate-3 execution protocol with clear workflow
choices and native delivery authority.

## Requirements

### Requirement: Workflow stages describe progress rather than authority
Team Harness MAY name planning, implementation, validation and delivery stages
for readability. A stage, plan projection, review result or status label SHALL
not release, deny or pause native tool execution and SHALL not create a nonce,
control-log event or auto-ship record.

#### Scenario: A plan is ready
- **WHEN** Main presents the intended outcome and tasks
- **THEN** the operator's live response and native permissions determine whether implementation proceeds

### Requirement: Ask only for a material live decision
Main SHALL ask the operator when the objective, scope, acceptance meaning,
destructive effect or outward delivery decision is genuinely unresolved. It MAY
continue through ordinary in-scope corrections when the user's authorization and
the intended outcome remain unchanged. Review findings alone do not create a
second approval ceremony.

#### Scenario: A correction stays within scope
- **WHEN** evidence supports a safe in-scope correction
- **THEN** Main applies or coordinates it and verifies the result without inventing another TH gate

#### Scenario: A correction changes the requested outcome
- **WHEN** the proposed action materially changes scope or effect
- **THEN** Main asks the operator for that missing decision before continuing

### Requirement: Delivery uses the native outward-action boundary
PR creation, push, merge, release and other outward effects SHALL use the
selected runtime's native permission and the user's authorization. Team Harness
may prepare a reviewable candidate with `create-pr`, but a review verdict or
workflow stage MUST NOT publish or merge it automatically.

#### Scenario: Review findings are resolved
- **WHEN** Main decides the candidate is ready for delivery
- **THEN** the normal PR flow performs the requested outward action subject to native permissions

### Requirement: Recovery resumes from current facts
After an interruption, Main SHALL inspect the current repository, branch,
available agent results and native session status. It MAY reuse valid context or
choose another approach, but it MUST NOT require a restart or replay retired
release records merely because a stage projection is missing.

#### Scenario: A session loses context
- **WHEN** the native runtime can no longer provide the prior context
- **THEN** Main starts a useful native continuation from the current sources and reports any evidence gap
