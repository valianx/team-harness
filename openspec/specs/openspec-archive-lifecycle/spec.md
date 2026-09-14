# openspec-archive-lifecycle Specification

## Purpose
Keep completed and obsolete changes visible until they are archived or reconciled, so `openspec/specs/` reflects accepted behavior.

## Requirements

### Requirement: Archive follows accepted delivery or approved retirement
Claude Code, Codex and OpenCode SHALL use the same lifecycle at authoring, resumption and close. Main SHALL offer `openspec archive <change>` after verified, accepted delivery when the required PR is confirmed merged, including a merge in another session, or when the agreed delivery required no PR. Checked tasks alone SHALL NOT prove acceptance or delivery. A planned but absent PR, an open PR, or missing evidence SHALL leave archive pending. Main SHALL surface concrete conflicts between affected requirements and relevant active changes, reconciling partial supersession before archive. Approved cancellation or wholesale retirement SHALL use `--skip-specs` without applying discarded deltas or falsely completing tasks. Archive SHALL require explicit authority covering the operation, reusing authority already granted or requesting one brief confirmation. A declined or deferred offer SHALL NOT block close or repeat without a new archive request or material evidence change. The mutation SHALL follow repository branch and outward-write conventions; for merged work it belongs to a subsequent change, never a rewrite of the accepted candidate or an implicitly authorized default-branch push. Task close, `pipelines` and `trace` SHALL display pending archive with its reason and next action, including direct work without pipeline state; status commands SHALL remain read-only.

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

#### Scenario: Accepted local delivery requires no PR
- **WHEN** completed work is verified and accepted under an agreement requiring no PR
- **THEN** Main offers archive using the existing confirmation, without inventing a PR prerequisite

#### Scenario: A PR was merged in another session
- **WHEN** resumed work has completed validation and its required PR now reports merged
- **THEN** Main offers archive without requiring a merge observed by the original session

#### Scenario: A replacement leaves an older change partially obsolete
- **WHEN** changed requirements contradict part of another active change while other requirements remain valid
- **THEN** Main identifies both sources and offers reconciliation before applying or retiring the older change

#### Scenario: An unimplemented change was cancelled
- **WHEN** the operator approves retirement of that change
- **THEN** Main archives without applying its deltas or falsely marking unfinished tasks complete

#### Scenario: Status is requested for completed direct work
- **WHEN** the change has no pipeline workspace
- **THEN** pipelines and trace report its pending archive and missing evidence without creating pipeline state or executing archive

#### Scenario: Delivery is not yet established
- **WHEN** validation or acceptance is missing, or a planned PR does not exist
- **THEN** Main reports the pending evidence or delivery instead of treating checked tasks as permission to archive
