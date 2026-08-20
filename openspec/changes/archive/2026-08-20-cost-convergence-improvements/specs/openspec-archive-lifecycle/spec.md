## Purpose

Wire in the archive half of the OpenSpec lifecycle so merged changes stop accumulating in `openspec/changes/` and a living spec base exists for future proposals to delta against.

## ADDED Requirements

### Requirement: Archive is offered on confirmed merge, behind explicit confirmation
The flow SHALL offer `openspec archive <change>` behind a one-line Y/n once the run's pull request is confirmed merged, and never before. Pipeline delivery ends at a draft PR, so terminal close fires the offer only when the merge is already confirmed at that point; otherwise the pending archive is recorded in the close record and re-offered on a later explicit request. The direct lane offers it at its own post-merge step. Archive SHALL never run silently, and a declined or deferred offer never blocks close. The resulting `openspec/specs/` and archive-directory mutation SHALL land through the repository's ordinary branch-and-pull-request conventions, never a direct default-branch push.

#### Scenario: A run's PR is confirmed merged
- **WHEN** the coordinator confirms the merge of an OpenSpec-bound run's pull request
- **THEN** it offers the archive with a one-line Y/n, and on acceptance the change's deltas merge into `openspec/specs/` and the change moves to the archive directory on a branch delivered as its own pull request

#### Scenario: Terminal close arrives before the merge
- **WHEN** terminal close runs while the run's pull request is still an open draft
- **THEN** no archive is offered or executed, and the pending archive is recorded for a later explicit offer

#### Scenario: The operator declines the archive
- **WHEN** the operator answers no at the archive offer
- **THEN** close completes normally and the pending archive is noted for a later explicit run

### Requirement: The merged backlog is backfilled once
The two already-merged changes (`integrate-openspec-design`, `pipeline-audit-improvements`) SHALL be archived in a one-time operator-confirmed chore, creating the initial `openspec/specs/` base.

#### Scenario: The backfill chore runs
- **WHEN** the operator confirms the backfill
- **THEN** both changes archive through the upstream CLI on a branch delivered as its own pull request, `openspec/specs/` exists with their capability specs, and subsequent proposals can declare Modified Capabilities against it
