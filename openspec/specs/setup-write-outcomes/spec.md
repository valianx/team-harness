# setup-write-outcomes Specification

## Purpose
Make provisioning reports describe observed writes, failures and retained configuration without overstating setup completion.

## Requirements

### Requirement: Native installation records use portable paths
Installation and removal SHALL represent files beneath the selected configuration root with portable root-relative record paths on Windows and POSIX. Equivalent native path separators SHALL NOT prevent ownership records from being written.

#### Scenario: Windows removes a managed asset
- **WHEN** the selected root and managed file use native Windows separators
- **THEN** removal records the root-relative closure successfully without persisting a machine-specific absolute path.

### Requirement: Setup records the selected distribution version
Codex setup SHALL derive installation metadata from the selected plugin's manifest rather than a release literal, preserving unrelated operator preferences.

#### Scenario: Setup follows an update
- **WHEN** setup runs from a newer selected plugin
- **THEN** its recorded installed version equals that plugin's version and does not regress to a historical example.

### Requirement: Windows bootstrap arguments remain literal
Supported Windows bootstrap entrypoints SHALL preserve each forwarded argument, including whitespace, quotes and trailing backslashes, and retain the child exit status.

#### Scenario: Custom installation directory contains spaces
- **WHEN** an operator supplies a directory argument containing spaces
- **THEN** the installer receives exactly one unchanged directory value.

### Requirement: Reconciliation preserves additional nested MCP settings
Claude and OpenCode MCP reconciliation SHALL preserve custom headers and recognize a desired nested object already contained in the existing configuration as current, without repeated backups or writes.

#### Scenario: Custom header accompanies the configured authorization header
- **WHEN** both desired values and an additional custom header are already present
- **THEN** repeated reconciliation leaves the file unchanged.

#### Scenario: A required header differs
- **WHEN** an existing required header has a different value
- **THEN** reconciliation updates that value while retaining unrelated headers.

### Requirement: Provisioning reports observed write outcomes
Setup SHALL distinguish operator decline from a refused or failed approved configuration write. It SHALL verify the result before announcing provisioned rules, SHALL disclose partial or unknown state when verification is incomplete, and SHALL NOT record a runtime refusal as a durable operator decline.

#### Scenario: The operator declines
- **WHEN** the operator declines the provisioning offer
- **THEN** setup preserves the existing decline behavior and performs no provisioning write

#### Scenario: The runtime rejects an approved write
- **WHEN** the operator approved but the runtime refuses the write
- **THEN** setup reports provisioning as unconfirmed, names the pending target and continues independent steps without repeating the same rejected action or widening access

#### Scenario: A later step fails after partial progress
- **WHEN** some configuration operation may have succeeded but final verification is unavailable or fails
- **THEN** setup reports the known partial or unknown result, continues independent steps without retrying the write, and does not claim that nothing changed or that all rules were provisioned
