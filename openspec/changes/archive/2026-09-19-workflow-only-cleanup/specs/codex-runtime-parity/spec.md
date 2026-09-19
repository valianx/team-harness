## REMOVED Requirements

### Requirement: Codex hook wiring carries the deny floor only
**Reason**: TH execution interception is retired; the host owns permission decisions.
**Migration**: Remove the TH hook chain and exclusive launchers from the plugin without changing native permission configuration. Retain specialist installation and supported workflow tools.

## ADDED Requirements

### Requirement: Codex uses native execution permissions
The Codex plugin SHALL ship no TH PreToolUse permission interceptor or exclusive guard launcher. Setup, update and reload SHALL consider retired hook assets unnecessary and SHALL preserve the operator's native permission settings, configured models and available workflow roles. Documentation SHALL NOT claim the native policy is identical to the removed TH checks.

#### Scenario: A tool call runs with the updated plugin
- **WHEN** Codex evaluates a tool call after loading the updated distribution
- **THEN** native runtime permissions decide execution without a TH guard response

#### Scenario: Installation verification checks the updated release
- **WHEN** no retired hook manifest or launcher exists
- **THEN** verification succeeds based on retained components and does not request a repair or restart for removed assets

### Requirement: Agent setup installs the complete packaged roster
Codex agent setup SHALL inspect, install, and repair every bundled generated role,
including `pr-review-verifier`, in both global and project scopes. Installing a
missing role SHALL report changed installation state; reload SHALL assess its
effective activation without requiring a new conversation solely from the
installation receipt. Repeating sync on a current installation SHALL report no
changed roles and no restart requirement. Regression coverage
SHALL compare the installed roster and bytes with the packaged agent artifacts.

#### Scenario: The review verifier is absent after an older installation
- **WHEN** agent setup sync runs with the verifier missing and all other roles current
- **THEN** it installs the packaged verifier and reports the changed role for activation assessment through supported refresh or reconnect

#### Scenario: All bundled roles are current
- **WHEN** agent setup sync runs again
- **THEN** it reports no changed roles and no restart requirement
