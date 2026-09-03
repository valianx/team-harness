# openspec-archive-lifecycle Specification

## Purpose
Wire in the archive half of the OpenSpec lifecycle so merged changes stop accumulating in `openspec/changes/` and a living spec base exists for future proposals to delta against.

## Requirements

### Requirement: Archive is offered on confirmed merge, behind explicit confirmation
The flow SHALL offer `openspec archive <change>` behind a one-line Y/n once the change's pull request is confirmed merged, and never before. Pipeline delivery ends at a draft PR, so terminal close fires the offer only when the merge is already confirmed at that point; otherwise the pending archive is recorded in the close record and re-offered on a later explicit request. The direct lane offers it at its own post-merge step. Archive SHALL never run silently, and a declined or deferred offer never blocks close. The resulting `openspec/specs/` and archive-directory mutation SHALL land through the repository's ordinary branch-and-pull-request conventions — a dedicated chore pull request or the next pull request that follows the merge — never the archived change's own pull request and never a direct default-branch push.

#### Scenario: A run's PR is confirmed merged
- **WHEN** the coordinator confirms the merge of an OpenSpec-bound run's pull request
- **THEN** it offers the archive with a one-line Y/n, and on acceptance the change's deltas merge into `openspec/specs/` and the change moves to the archive directory on a branch delivered through an ordinary pull request

#### Scenario: Terminal close arrives before the merge
- **WHEN** terminal close runs while the run's pull request is still an open draft
- **THEN** no archive is offered or executed, and the pending archive is recorded for a later explicit offer

#### Scenario: The operator declines the archive
- **WHEN** the operator answers no at the archive offer
- **THEN** close completes normally and the pending archive is noted for a later explicit run

#### Scenario: A merged change archives inside the next pull request
- **WHEN** the operator accepts the archive of an already-merged change while a later change is being delivered
- **THEN** the archive commit rides that later pull request, and the later change's own archive still waits for its merge
