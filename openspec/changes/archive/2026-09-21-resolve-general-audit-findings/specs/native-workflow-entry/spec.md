## ADDED Requirements

### Requirement: Maintained entry points agree with their native consumers
GCP cost analysis SHALL run through the current coordinator and its cost specialist
without an undocumented mode or nested coordinator. OpenCode SHALL retain workflow,
language, voice and workspace discovery through its registered native guide;
disconnected context-hook source SHALL NOT be presented as an active integration.

#### Scenario: Cost analysis is selected
- **WHEN** the operator requests costs for named projects or the supported quick/full scope
- **THEN** the current coordinator resolves the workspace and delegates the bounded read-only analysis to the cost specialist

#### Scenario: OpenCode installs or updates TH
- **WHEN** the native guide is registered
- **THEN** collaboration preferences and workspace remain discoverable without requiring the disconnected session-event adapter

### Requirement: Dependency guidance matches the active operating system
Installer advice for missing optional tools SHALL offer commands appropriate to
the active operating system and SHALL recognize supported executable alternatives.

#### Scenario: Windows lacks Python or GitHub CLI
- **WHEN** dependency preparation reports the missing tool
- **THEN** it offers Windows guidance rather than Linux package-manager commands

#### Scenario: Windows already exposes a supported Python executable
- **WHEN** Python is available through a supported executable alternative
- **THEN** the check reports availability instead of recommending a duplicate installation

### Requirement: Installer removal records use portable paths
Installer removal SHALL record owned file paths in the portable manifest format
on every supported operating system so that a valid removal can close its ledger
entry without a platform-separator error.

#### Scenario: Windows removes an owned component
- **WHEN** the removed component has Windows-native filesystem paths
- **THEN** its removal record uses the portable configuration-root path and passes structural validation
