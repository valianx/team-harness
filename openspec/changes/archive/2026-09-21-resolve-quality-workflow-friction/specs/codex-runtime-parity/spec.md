## MODIFIED Requirements

### Requirement: Review artifacts stay inside the workspace
The frozen review worktree SHALL live under the git-ignored `workspaces/` tree and SHALL be pruned at flow close. Snapshot creation on Windows SHALL support nested paths beyond the legacy 260-character limit without changing the operator's Git configuration.

#### Scenario: A review flow completes
- **WHEN** review publication or abort finishes
- **THEN** no prunable review worktrees remain outside the workspace tree

#### Scenario: A nested snapshot exceeds the Windows legacy path limit
- **WHEN** supported repository paths become longer than 260 characters under the isolated review root
- **THEN** capture materializes them successfully using snapshot-local Git configuration and preserves the operator checkout

## ADDED Requirements

### Requirement: Shared setup asset checks respect native filesystem modes
Skill synchronization SHALL compare shared setup asset content on every supported platform. It SHALL check the executable mode on POSIX filesystems and SHALL NOT report stale assets solely because native Windows does not expose that POSIX mode.

#### Scenario: Matching content on Windows
- **WHEN** the distributed setup asset has the expected bytes on native Windows
- **THEN** the check succeeds without requiring POSIX executable bits

#### Scenario: Changed content
- **WHEN** a distributed setup asset differs from its canonical bytes
- **THEN** the check reports drift on both Windows and POSIX

#### Scenario: Wrong executable mode on POSIX
- **WHEN** a matching distributed setup asset loses its expected executable mode on POSIX
- **THEN** the check reports mode drift
