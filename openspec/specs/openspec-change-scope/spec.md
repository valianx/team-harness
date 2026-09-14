# openspec-change-scope Specification

## Purpose
TBD - created by archiving change right-size-pipeline-contracts. Update Purpose after archive.

## Requirements

### Requirement: A change exists only for product behavior
An active change under `openspec/changes/` SHALL add or modify at least one capability. Installation of tools, delivery of an already-approved change, and other repository chores SHALL use the normal branch and pull-request flow without a change directory. `tests/test_openspec_scope.py` SHALL fail on an active change whose `specs/` directory is empty or whose proposal declares no new and no modified capability.

#### Scenario: A chore is proposed as a change
- **WHEN** a change directory declares `New Capabilities: None` and `Modified Capabilities: None`
- **THEN** the scope test fails naming the change

### Requirement: Per-artifact rules bound the ceremony
`openspec/config.yaml` SHALL declare: proposal under 500 words with a `Non-Goals` section; tasks at most 20 items; requirements per change delta at most `max_requirements_per_change`. The scope test SHALL enforce the numeric rules on every active change.

#### Scenario: A proposal omits Non-Goals
- **WHEN** an active change's `proposal.md` has no `## Non-Goals` heading
- **THEN** the scope test fails naming the change

### Requirement: Completed changes are archived by the PR that finishes them
Once implementation and its relevant checks are complete, Main SHALL prepare authorized archive on the feature branch before final review, following `openspec-archive-lifecycle`. The completing PR SHALL contain implementation, updated living specs and the archived change unless the operator declines or defers archive; that exception SHALL remain pending without blocking ordinary review or delivery. A later PR is a recovery path for a missed or deferred archive. A change reported complete by `openspec list` across two releases is a lint warning naming the change.

#### Scenario: A change completes without archive
- **WHEN** `openspec list` reports a change complete and the release that followed did not archive it
- **THEN** `/th:lint` warns with the change name

#### Scenario: The completing pull request carries the archive
- **WHEN** a completed change with authorized archive is assembled for its final review
- **THEN** the same PR includes code, current specs and the archived change without requiring another PR after merge

#### Scenario: A later pull request recovers a missed archive
- **WHEN** completed work was merged without archive and a later PR carries its authorized recovery
- **THEN** that recovery is accepted without imposing a post-merge prerequisite on ordinary archive
