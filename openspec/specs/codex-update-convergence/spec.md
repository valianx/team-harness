# codex-update-convergence Specification

## Purpose

Make Team Harness updates and reloads predictable while leaving Codex runtime
settings and restart behavior under native ownership.

## Requirements

### Requirement: Update selects the active native plugin snapshot
The update flow SHALL inspect the loaded Team Harness manifest and the configured
marketplace, use the native plugin installation operation for a newer or
explicitly requested refresh, and avoid downgrade or removal of the active
snapshot before replacement.

#### Scenario: A newer snapshot is available
- **WHEN** the refreshed marketplace version is newer than the loaded manifest
- **THEN** update installs it through the native plugin operation and reports the loaded snapshot used for the remainder of the pass

#### Scenario: The active snapshot is current
- **WHEN** the versions are equal and no refresh was requested
- **THEN** update leaves the installation unchanged and reports the current state

### Requirement: Convergence inspects the installed workflow once
After snapshot selection, update MAY perform one bounded inspection or repair
pass for Team Harness managed workflow assets, skills and generated role
projections. It SHALL reuse native installation and reload operations and MUST
not reproduce domain checks as a second permission or control-plane protocol.

#### Scenario: A managed workflow asset is stale
- **WHEN** the installed snapshot exposes a stale Team Harness asset
- **THEN** update repairs or regenerates that asset through the supported native path and reports the result

#### Scenario: No managed asset needs a change
- **WHEN** the active snapshot and generated workflow surfaces are current
- **THEN** the pass makes no write and reports the fast path

### Requirement: Global runtime settings are not an update target
Update and reload SHALL preserve operator-owned runtime configuration and SHALL
not install global writable roots, model defaults, sandbox changes or other
settings as a Team Harness convergence requirement. Configuration drift can be
reported with a concrete explanation, but its repair is a separate operator
choice through the native runtime.

#### Scenario: A project has a conflicting setting
- **WHEN** the checked-out tree contains a project setting that differs from the operator configuration
- **THEN** update reports the conflict and preserves both sources rather than overwriting the operator setting

### Requirement: Restart reporting is conditional and evidence-based
A successful update or reload SHALL report `restart: not-required` when the
active native runtime refreshed the requested surface in place. It SHALL report
`restart: required` only when the native operation explicitly says the loaded
component cannot refresh in place, naming that component and the reason.

#### Scenario: Skills reload in place
- **WHEN** the native runtime confirms that the updated skills and hooks are loaded
- **THEN** update completes without asking for a restart

#### Scenario: A native component cannot refresh
- **WHEN** the runtime says a process or plugin must be restarted for the selected change
- **THEN** update reports the concrete reason and leaves the restart decision to the operator

### Requirement: Update results are concise and recoverable
The result SHALL identify the selected snapshot, changed workflow surfaces,
restart status, failures and the next useful invocation. Partial convergence
MAY be retried after the cause changes; a prior receipt or conversation does not
authorize repeating an uncertain outward write.

#### Scenario: A network operation has an uncertain result
- **WHEN** the native installation command returns without a reliable status
- **THEN** update inspects the active installation before retrying and does not blindly repeat the outward operation
