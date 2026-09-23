## ADDED Requirements

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
