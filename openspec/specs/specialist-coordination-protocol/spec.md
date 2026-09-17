# specialist-coordination-protocol Specification

## Purpose

Describe lightweight coordination for native specialist sessions without
duplicating the runtimes' permission, session and approval mechanisms.

## Requirements

### Requirement: A specialist receives a bounded objective and current sources
Main SHALL provide the objective, repository and worktree, owned files or
modules, relevant source links, constraints and expected evidence. The prompt
MAY state the immediate outcome, but SHALL not copy a competing authority,
lease, semantic task capsule or future dispatch graph.

#### Scenario: An implementer starts a task
- **WHEN** Main assigns a repository change
- **THEN** the implementer can identify its writable scope, source of intent and expected checks from the native task context

### Requirement: Native permissions govern specialist actions
Specialists SHALL use the selected runtime's native sandbox, tools and approval
prompts. A specialist MUST NOT expand scope, change another owner's files,
publish, merge, or delegate solely because TH text or a reviewer suggested it.

#### Scenario: A specialist needs a new path
- **WHEN** completing the objective would require a path outside its stated scope
- **THEN** it reports the need to Main and waits for the applicable native or operator decision

### Requirement: Specialist results are advisory evidence
A specialist result SHALL report outcome, changed paths, checks, findings,
coverage limits, prerequisites and decisions needed by Main in the runtime's
normal result channel. Main integrates the result and decides whether work is
complete, needs correction or should continue; no closed result envelope,
receipt handshake or control-log append is required.

#### Scenario: A specialist finishes with an omission
- **WHEN** a selected check could not run or its evidence is incomplete
- **THEN** the result names the omission and Main keeps it visible instead of treating exit zero as proof

### Requirement: Parallel work is coordinated by ownership and current state
Main MAY run independent read or write tasks concurrently when their actual
paths do not conflict. Shared files and Git operations SHALL be coordinated by
the current agent sessions. Main compares the real diff and worktree with each
reported scope before integrating results.

#### Scenario: Two tasks touch the same file
- **WHEN** their writable scopes overlap
- **THEN** Main serializes or reconciles the edits before accepting the combined change

### Requirement: Reviewer recommendations never authorize delivery
Review and adversarial specialists SHALL remain read-only and return findings,
evidence and limits. Their output informs Main's decision and may motivate a
correction, but it cannot release a stage, veto a PR, grant permissions or
require a fixed number of review rounds.

#### Scenario: A reviewer recommends publication
- **WHEN** the review returns a positive recommendation
- **THEN** Main still evaluates the complete objective and uses the normal PR and native permission flow
