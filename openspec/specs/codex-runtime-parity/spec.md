# codex-runtime-parity Specification

## Purpose

Keep Codex aligned with the native Team Harness workflow and role projections
without recreating Claude or Codex permission enforcement in hooks or settings.

## Requirements

### Requirement: Sandbox diagnosis explains the actual native condition
When a Codex write or tool probe fails, setup and update SHALL report the
observed native cause and a concrete repair. They MUST distinguish project
configuration shadowing, unavailable paths and a runtime session refresh, and
MUST not enter a restart loop or request a restart without evidence that the
native runtime needs it.

#### Scenario: A project config shadows operator roots
- **WHEN** the probe fails and the checked-out project declares a conflicting writable root
- **THEN** the diagnosis names the shadowing and offers the applicable config repair without repeating a generic restart request

#### Scenario: The native runtime actually needs a refresh
- **WHEN** the selected Codex installation reports that the loaded snapshot cannot refresh in place
- **THEN** the result names the affected component and reports a restart as a conditional next step

### Requirement: Role projections describe effective native capability
The canonical agent registry, generated TOMLs and instruction adapters SHALL
agree on each role's purpose, model metadata and native capability claims. A
projection MUST not claim that a Team Harness hook or prose rule enforces a
restriction that the runtime does not enforce.

#### Scenario: A projection is stale
- **WHEN** canonical role inputs and a generated Codex projection disagree
- **THEN** parity validation identifies the stale artifact and the normal regeneration remedy

#### Scenario: A review role is dispatched
- **WHEN** the selected role needs read-only access
- **THEN** Main relies on Codex's native role sandbox and reports unavailable capability instead of installing a TH permission substitute

### Requirement: Codex packaging carries workflow context, not permission gates
The Codex distribution MAY carry workflow skills, native-agent discovery,
language context and profile-controlled telemetry. It SHALL not install
`PreToolUse` permission gates, Codex launch shims or legacy OpenCode adapters as
Team Harness enforcement.

#### Scenario: The Codex package is assembled
- **WHEN** packaged assets are enumerated
- **THEN** discovery and workflow files are present and retired permission-hook assets are absent

### Requirement: Operator-owned model and runtime settings stay native-owned
Setup and update SHALL preserve complete operator-selected model, effort,
sandbox and runtime settings. A TH default or compatibility note MAY be
reported, but it SHALL not rewrite a user's setting or make a restart a generic
postcondition.

#### Scenario: A custom profile exists
- **WHEN** the active configuration contains an operator-selected model or effort
- **THEN** convergence reports it as preserved and leaves the setting unchanged

### Requirement: Review artifacts use the configured workspace
Frozen review worktrees and temporary evidence SHALL use the configured ignored
workspace or permitted temporary storage and SHALL be cleaned explicitly when
the review is complete. The location is an evidence concern, not a permission
or publication gate.

#### Scenario: A review completes
- **WHEN** the requested review and any follow-up have ended
- **THEN** disposable artifacts are removed from their configured temporary location without changing the product diff
