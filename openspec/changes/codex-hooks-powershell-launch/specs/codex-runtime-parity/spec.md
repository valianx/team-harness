## ADDED Requirements

### Requirement: Windows hook commands execute in the Codex host shell
The shipped `commandWindows` hooks SHALL execute through PowerShell 7 and Windows
PowerShell without parser errors. They SHALL resolve Node as an application from
PATH, preserve the existing deny-only decisions and missing-runtime diagnostic,
and emit a deny response when Node is unavailable or the launcher fails.
Native Windows regression tests SHALL execute the literal manifest commands in
both shells and SHALL reject nonzero exits, unexpected stderr, or invalid JSON.

#### Scenario: Codex evaluates a safe tool call on Windows
- **WHEN** either shell executes a shipped hook with a valid plugin runtime
- **THEN** the hook exits successfully with no parser error or denial

#### Scenario: Codex evaluates a prohibited tool call on Windows
- **WHEN** either shell executes a shipped hook for a deterministic deny condition
- **THEN** the hook returns the same deny decision as the existing Node guard

#### Scenario: Node cannot be resolved
- **WHEN** either shell executes a shipped hook without Node on PATH
- **THEN** the hook emits a valid deny response without reflecting internal errors

### Requirement: Agent setup installs the complete packaged roster
Codex agent setup SHALL inspect, install, and repair every bundled generated role,
including `pr-review-verifier`, in both global and project scopes. Installing a
missing role SHALL request a new thread; repeating sync on a current installation
SHALL report no changed roles and no restart requirement. Regression coverage
SHALL compare the installed roster and bytes with the packaged agent artifacts.

#### Scenario: The review verifier is absent after an older installation
- **WHEN** agent setup sync runs with the verifier missing and all other roles current
- **THEN** it installs the packaged verifier and reports that a new thread is required

#### Scenario: All bundled roles are current
- **WHEN** agent setup sync runs again
- **THEN** it reports no changed roles and no restart requirement
