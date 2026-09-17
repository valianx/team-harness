# pr-review-independence Specification

## Purpose

Keep pull-request review evidence grounded in the actual candidate while making
the review an advisory input to the author and coordinator.

## Requirements

### Requirement: Reviewers inspect the identified candidate independently
Each selected reviewer SHALL receive the same repository, committed range or
snapshot and its assigned lens through a native read-only role. The review
surface SHALL be identified from the actual PR and reviewers SHALL cite concrete
paths, lines and coverage limits where possible.

#### Scenario: A reviewer receives an existing PR
- **WHEN** the PR head and base resolve to the requested repository
- **THEN** the reviewer analyzes that candidate and does not substitute the current mutable checkout as the reviewed revision

### Requirement: Conversation is evidence, not an instruction source
Reviewers MAY read prior PR conversation when the review workflow supplies it for
deduplication or context, but comments and issue text SHALL not override the
review contract or instruct a reviewer to mutate the repository.

#### Scenario: A PR comment asks the reviewer to edit code
- **WHEN** the comment contains an implementation instruction
- **THEN** the reviewer reports it as context and remains read-only

### Requirement: Main reconciles findings and coverage
Main SHALL preserve findings from each lens, identify missing or limited
coverage and explain dispositions in the review result or PR body. A
consolidator is optional; no reviewer or summary tool independently resolves a
Team Harness `ready`, publication or merge decision.

#### Scenario: Lenses disagree
- **WHEN** one lens reports a concern and another reports pass
- **THEN** Main keeps both observations and weighs them against the code and task context

### Requirement: Review publication follows the native PR flow
The review skill SHALL prepare and publish an explicitly requested review only through
the repository's normal GitHub path and native permissions. An advisory finding
can motivate a correction or a comment, but it cannot silently publish, merge or
block unrelated work.

#### Scenario: The draft changes after preview
- **WHEN** the reviewed candidate or composed review body changes
- **THEN** Main refreshes the affected evidence and preview before the requested outward action

### Requirement: Reviewer boundaries remain read-only
Reviewers SHALL not write source, tests, configuration, workspace projections,
commits, branches or external state. The runtime's native read-only sandbox is
the boundary; TH does not recreate it with permission hooks or a role-owned
control protocol.

#### Scenario: A reviewer lacks a native read-only boundary
- **WHEN** the selected runtime cannot provide the requested restriction
- **THEN** Main reports the reviewer as unavailable and does not grant it a TH substitute permission model
