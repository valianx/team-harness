## MODIFIED Requirements

### Requirement: Native snapshot selection remains authoritative
The update flow SHALL derive the running version from the loaded plugin manifest, refresh only the configured Team Harness marketplace, compare versions semantically, and use Codex's native plugin installation operation when a newer snapshot or an explicitly forced equal-version refresh is selected. It MUST NOT downgrade, remove the active plugin before replacement, or treat a marketplace listing as proof that the loaded snapshot changed.

Before a marketplace or plugin mutation, the flow SHALL verify that its pinned Python interpreter is version 3.11 or later and report an actionable prerequisite failure otherwise.

#### Scenario: Newer marketplace snapshot is available
- **WHEN** the refreshed Team Harness marketplace exposes a version newer than the loaded plugin manifest
- **THEN** the flow installs that snapshot through Codex's native plugin operation and binds all later work to the exact installed path returned by that operation

#### Scenario: No installation is needed
- **WHEN** the marketplace and loaded versions are equal and the operator did not request a forced refresh
- **THEN** the flow skips plugin replacement and uses the validated loaded snapshot as the convergence source

#### Scenario: Marketplace would downgrade the installation
- **WHEN** the refreshed marketplace version is older than the loaded plugin version
- **THEN** the flow stops before replacement and reports the stale marketplace without changing the active installation

#### Scenario: Unsupported Python is selected
- **WHEN** the selected interpreter is older than Python 3.11
- **THEN** update stops before marketplace or plugin changes and identifies the supported interpreter prerequisite

### Requirement: Convergence preserves ownership and security boundaries
The convergence pass SHALL use the validated selected snapshot, preserve operator-owned configuration and unrelated content, use bounded native command arguments and reject unsafe paths, unmanaged agent conflicts and secret-bearing diagnostics. It SHALL NOT modify native sandbox, approval, network or writable-root preferences, mutate another runtime's configuration, replace MCP registrations, delete prior snapshots or modify active workspace helper bundles. It SHALL preserve configured agent models and the complete supported roster.

An absent generic fallback field SHALL NOT authorize replacing another configured field. Recognized complete managed legacy pairs MAY migrate together; partial custom selections SHALL retain their present values.

#### Scenario: Operator-owned value differs from a Team Harness default
- **WHEN** agent synchronization updates TH-owned agent or fallback entries in a native configuration document
- **THEN** unrelated execution-policy values and structured custom configuration remain unchanged

#### Scenario: A protected target requires sandbox escalation
- **WHEN** a retained installation write is refused by native permissions
- **THEN** update reports the exact failed domain and follows bounded native escalation without widening global permissions

#### Scenario: Convergence encounters unsafe input
- **WHEN** a target path, managed file, native result or same-name agent conflict violates its integrity contract
- **THEN** convergence stops at that domain without exposing sensitive diagnostics or attempting an ad hoc repair

#### Scenario: Only one custom fallback field is configured
- **WHEN** a custom model or reasoning effort is present while the other field is absent
- **THEN** convergence fills only the missing field and preserves the configured value and unrelated content
