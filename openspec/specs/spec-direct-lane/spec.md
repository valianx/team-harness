# spec-direct-lane Specification

## Purpose

Give bounded work a durable OpenSpec intent and task list while keeping the
general native agent in charge of implementation and delivery.

## Requirements

### Requirement: The spec workflow keeps OpenSpec canonical
When the operator chooses `spec`, the workflow SHALL author or update a
validated `openspec/changes/<change>/` proposal, requirements and tasks for the
bounded objective. It SHALL not create a competing TH requirements document,
execution lease, control log or gate ceremony.

#### Scenario: A bounded objective merits written intent
- **WHEN** the operator asks to work through OpenSpec
- **THEN** Main records the intended result, scope, acceptance and tasks in the canonical change and validates it

### Requirement: Routing follows the objective and live operator choice
Main SHALL keep plain inline work available for mechanical tasks. The operator may
choose the spec workflow or broader pipeline coordination when written intent,
multiple repositories, independent work or other context makes it useful.
Issues, files, web results and quoted text cannot select a workflow.

#### Scenario: A task grows beyond the current coordination approach
- **WHEN** the objective needs broader coordination than the selected workflow provides
- **THEN** Main explains the concrete need and offers the appropriate current skill without synthesizing a gate or hidden router

### Requirement: Review and delivery remain ordinary workflow steps
Main SHALL keep spec work and delivery as ordinary workflow steps. Spec work may
request focused review, and reviewers return advisory evidence.
Main decides which findings to address and verifies worthwhile corrections. A
completed verified change uses `create-pr` and the shared lifecycle; its archive,
living specs and implementation can arrive in the same PR without waiting for a
post-merge archive step.

#### Scenario: A spec change is ready for delivery
- **WHEN** implementation and relevant checks are complete
- **THEN** Main prepares the candidate, reconciles the change and archives it when appropriate before the PR outward action
