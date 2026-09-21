## ADDED Requirements

### Requirement: Helper Git access preserves the selected repository
Repository-bound helpers SHALL resolve Git operations in their supplied project
rather than inheriting ambient repository-selection overrides.

#### Scenario: The parent process selects another Git directory
- **WHEN** an inherited Git variable points at another repository
- **THEN** quality, dependency and review operations still inspect the explicitly selected project

### Requirement: Quality commands consume prepared dependencies
Quality execution SHALL report package installation or dependency mutation
commands as invalid declarations. Ordinary prepared project checks SHALL remain
usable. This declaration check SHALL NOT claim to sandbox arbitrary project code
or replace native execution permissions.

#### Scenario: A manifest declares a package installation
- **WHEN** a command requests npm, yarn, bun or pnpm dependency installation or an equivalent supported wrapper
- **THEN** validation reports the declaration before it executes

#### Scenario: A manifest declares a prepared test script
- **WHEN** its command runs an existing project test script with valid arguments
- **THEN** the command remains eligible for execution

### Requirement: Malformed reviewer results identify the invalid input
Review summarization SHALL reject malformed disagreement data as invalid reviewer
input rather than an internal execution failure, preserving valid advisory results.

#### Scenario: Disagreements is not an array of usable entries
- **WHEN** a return contains malformed disagreement data
- **THEN** the result identifies invalid returns instead of raising an internal error
