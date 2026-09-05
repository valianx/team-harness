## ADDED Requirements

### Requirement: Codex hooks have a native Windows execution alternative
Every distributed Codex command hook SHALL provide a `commandWindows` override
that executes the existing deterministic denial rules without Bash. The Windows
launcher SHALL use the host-provided plugin root or its compatibility alias,
support paths containing spaces and shell metacharacters, preserve stdin JSON and
the apply_patch adaptation, and never convert an unsupported ask into approval.
Invalid input, missing rule artifacts, failed execution and invalid decisions
SHALL fail closed without reflecting input. An unavailable plugin runtime SHALL
report its missing condition while preserving native Codex permissions. Setup
and update SHALL validate the override and exact launcher/manifest identities.
POSIX hook behavior and native hook trust SHALL remain unchanged.

#### Scenario: A Windows session invokes a safety hook
- **WHEN** Codex selects commandWindows and the plugin is installed in a path with spaces or symbols
- **THEN** the hook runs through Node and returns the same deterministic deny or silent outcome as the existing rule

#### Scenario: An active rule fails on Windows
- **WHEN** an active rule artifact is missing, input is malformed, execution fails or its decision is invalid
- **THEN** the launcher emits a bounded generic denial rather than approving the action or reflecting sensitive input

#### Scenario: Installation verifies the Windows alternative
- **WHEN** setup or update checks the shipped hook assets
- **THEN** it accepts the Windows field only with the expected manifest and launcher digests

#### Scenario: Windows commands are verified continuously
- **WHEN** the Windows hook suite runs in native Windows CI
- **THEN** it executes the literal manifest override through cmd.exe and checks safety, native approval ownership and error behavior
