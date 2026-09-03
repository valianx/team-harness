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
The pull request that checks the last task of a change SHALL include `openspec archive <change>`, or the next release PR SHALL. A change reported complete by `openspec list` across two releases is a lint warning naming the change.

#### Scenario: A change completes without archive
- **WHEN** `openspec list` reports a change complete and the release that followed did not archive it
- **THEN** `/th:lint` warns with the change name
