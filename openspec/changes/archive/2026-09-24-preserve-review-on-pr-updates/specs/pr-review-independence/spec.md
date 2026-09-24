## MODIFIED Requirements

### Requirement: Preview and publish are integral
The published body's verdict line SHALL match the chosen event; the coordinator SHALL present changed content or event again before ordinary publication. Approval SHALL bind the event, exact draft bytes and reviewed identity, without requiring the live PR to retain that identity. The normal preview SHALL retain an explicit publish/defer/cancel choice. The explicit `--auto-publish` option SHALL preserve its existing opt-in meaning and disclose reviewed scope without treating PR movement alone as a publication veto.

#### Scenario: The operator overrides the event
- **WHEN** the operator selects a different event than recommended
- **THEN** the body's verdict line is rewritten to match and the complete revised review is shown before publication

#### Scenario: The draft changes between preview and publish
- **WHEN** the review content differs from what the operator approved
- **THEN** the revised review is presented for approval while retaining completed review evidence

#### Scenario: Only the remote PR changes after approval
- **WHEN** the PR advances but the approved review remains accurate for its disclosed reviewed scope
- **THEN** that movement alone does not invalidate approval or discard the review

### Requirement: Reviewers read only supplied coordinates and verified worktree leaves
Reviewer agents SHALL read only supplied review artifacts and project leaves proven before content access to be existing, non-symlink regular files whose resolved paths remain inside the frozen worktree. This includes pertinent dependency and project-rule files discovered within that verified scope. Deleted paths SHALL be examined through the captured diff, not assumed to exist at head. Instruction-source markers, unresolved imports and optional coordinates set to `none` SHALL NOT themselves authorize content reads or operational actions.

The coordinator SHALL distinguish recoverable assignment/return defects from failed evidence integrity. It MAY correct a missing return field or mistaken optional path through bounded same-snapshot follow-up while preserving completed valid reports. If that assessment remains unavailable, the review SHALL disclose its absence and use COMMENT. Missing or mismatched reviewed identity, actual snapshot-integrity failure and an unreadable frozen worktree SHALL remain unavailable evidence; follow-up SHALL NOT substitute a different snapshot or fabricate findings. Remote PR movement SHALL instead preserve completed work and use scoped reconciliation. Existing preview, live publication approval and exact draft-content checks SHALL remain.

#### Scenario: A reviewer infers an absent project path
- **WHEN** an optional inferred path is absent from the frozen worktree
- **THEN** the reviewer skips that read, records the limitation and continues on verified evidence

#### Scenario: A reviewer omits its identity echo
- **WHEN** a returned assessment omits a required identity field but the captured snapshot remains intact
- **THEN** Main requests a bounded correction or records the assessment as absent, preserving successful assessments and never treating the omission as proof of verification

#### Scenario: Snapshot identity or freshness fails
- **WHEN** a returned identity differs or the captured snapshot is corrupted
- **THEN** the affected assessment is not used as trusted evidence and completed valid work is preserved for recovery
