## MODIFIED Requirements

### Requirement: Frozen review artifacts outlive every specialist
The coordinator SHALL own the successful snapshot lifecycle independently of
the shell or PTY process that captures and materializes it. Capture,
materialization, promotion, and readiness commands MUST NOT register cleanup on
`EXIT` or another process-lifetime hook. The frozen worktree and required
artifacts SHALL remain available through every specialist terminal result,
retry, consolidation read, and post-dispatch integrity comparison. Cleanup
SHALL run explicitly only after all dispatched reviewers have joined or after
an explicit terminal cancel; unexpected coordinator loss SHALL preserve the
workspace for recovery rather than delete evidence still in use.

Review directories SHALL use normal platform creation permissions, respecting
inherited Windows ACLs and the POSIX umask, without a TH owner-only directory
policy. Creation SHALL preserve permissions of existing directories. Native
runtime permissions govern reviewer access; a previously restricted directory
requires scoped recovery rather than automatic recursive permission changes.

#### Scenario: Materialization shell ends before reviewers
- **WHEN** the command process that materialized the snapshot exits or yields for longer than 30 seconds while a reviewer is still reading
- **THEN** the review workspace remains intact and cleanup does not run until that reviewer and every other dispatched lens reaches a terminal result

#### Scenario: A new review uses native directory permissions
- **WHEN** a review creates its workspace, PR parent and run directory
- **THEN** all three retain normal platform permission inheritance and TH adds no owner-only access restriction

#### Scenario: An existing workspace has operator-managed permissions
- **WHEN** a review reuses an existing workspace or PR parent
- **THEN** creation preserves those permissions and reports any actual access failure for scoped native recovery
