# runtime-reload Specification

## Purpose
Refresh supported Team Harness components in the current conversation and distinguish installation from observed activation.

## Requirements

### Requirement: Reload targets the installed version and active conversation
Reload SHALL bind a verified installed Team Harness root to the active runtime,
project and conversation. It SHALL preserve that conversation and use only
capabilities exposed by its existing backend. It SHALL NOT download snapshots,
select an unused cache directory, or create another server as a reload substitute.

#### Scenario: An injected skill path names the old snapshot
- **WHEN** native installation metadata identifies a newer installed version
- **THEN** reload reads requested resources from the verified new root and separately assesses native activation

### Requirement: Activation evidence is distinct from installation evidence
Reload SHALL distinguish instruction rereading, native discovery and effective
runtime activation. A successful installer, manual hook test or queued refresh
SHALL NOT establish active hooks. Unavailable evidence SHALL remain unverified.

#### Scenario: Manual hook tests pass but the conversation executes old commands
- **WHEN** the installed launcher passes and active execution still uses its predecessor
- **THEN** reload reports the hooks pending and never reports full activation

### Requirement: Reload covers all applicable plugin components
Reload SHALL assess Team Harness skill and command discovery, active workflow
resources, agents, effective plugin configuration, hooks and MCP services. It
SHALL complete each independent supported refresh even when another component
has no available control, without disrupting unrelated integrations. Existing
activation evidence SHALL remain valid for unchanged component definitions on
the same backend. Absent integrations SHALL be reported as not applicable.

#### Scenario: Skill discovery updates while a hook observation is unavailable
- **WHEN** native discovery identifies the installed skills and no hook execution evidence is exposed
- **THEN** reload retains the skill evidence, attempts the other supported component refreshes, and leaves hooks unverified without inferring a restart requirement

#### Scenario: A plugin update leaves the loaded agent definitions unchanged
- **WHEN** the update preserves a previously verified agent definition and the same backend remains active
- **THEN** reload preserves that activation evidence without requiring a reconnect solely because the plugin version changed

### Requirement: Reload preserves work and reports a bounded outcome
Reload SHALL report active, partial, reconnect-required, or blocked, with verified
and pending components. It SHALL attempt each exposed refresh once. Instance
recycling SHALL require supported host scheduling at a safe boundary without
interrupting other active work. Reconnect SHALL retain the existing conversation.

#### Scenario: The host has no callable reload control
- **WHEN** documentation describes a reload API but the active host does not expose it
- **THEN** reload reports partial activation and the unavailable observations without prescribing a restart or starting a second server

#### Scenario: OpenCode has other active work
- **WHEN** recycling the instance would interrupt another session
- **THEN** reload leaves recycling pending and does not call instance disposal

#### Scenario: Some components refresh while another needs reconnecting
- **WHEN** the installed target is valid and some resources refresh but a required component needs the current runtime to reconnect
- **THEN** reload reports reconnect-required with both verified and pending components, preserving the conversation

#### Scenario: Components remain pending without a reconnect requirement
- **WHEN** the installed target is valid and activation evidence remains pending without requiring a reconnect
- **THEN** reload reports partial and does not claim full activation

### Requirement: Restart requirements need component evidence
Reload SHALL prefer supported refreshes and SHALL NOT infer a live restart
requirement solely from missing controls, unavailable evidence, an old injected
path, an optional snapshot alias failure or an installation receipt flag. A
remaining reconnect requirement SHALL identify observed stale activation or a
changed setting documented as requiring restart in the active runtime, explain
why supported refreshes cannot apply it, and state its effect and smallest
reconnect scope. Reload SHALL respect an operator constraint to avoid restarting.

#### Scenario: Windows cannot create an optional snapshot alias
- **WHEN** the alias is skipped but all other installation domains are current
- **THEN** update preserves the path and diagnostic without treating the alias as an installation restart requirement, and reload independently assesses live activation; the ordinary update summary remains concise without restart commentary

#### Scenario: A changed runtime setting cannot be refreshed in the active backend
- **WHEN** a setting changed and the active runtime documents it as session-static with no applicable refresh
- **THEN** reload completes independent refreshes and reports that specific setting, its deferred effect and the smallest reconnect scope, while preserving a no-restart constraint

### Requirement: Successful updates attempt session activation separately
Codex and OpenCode update SHALL invoke reload after a successful installation or
current-version verification. The installation result SHALL remain authoritative
for disk convergence, and reload SHALL independently assess activation. A pending
approval or failed update SHALL NOT trigger activation of an unverified target.

Across Claude Code, Codex and OpenCode, the ordinary update response SHALL report
the version and actual installation outcome without routine restart or reconnect
commentary, including negative assurances and hypothetical advice. Activation
observations SHALL remain distinct in retained diagnostic evidence; missing host
controls alone SHALL NOT add a restart caveat or imply full activation. Explicit
reload or diagnostic requests SHALL still receive the detailed activation result.

Update SHALL report a failed operation, an observed stale component or an actual
required operator action with its concrete impact and supported next step. Any
exceptional reconnect advice SHALL satisfy the component-evidence requirement;
ordinary summaries SHALL NOT include conditional reconnect boilerplate.

#### Scenario: Installation converges but native hooks remain stale
- **WHEN** update succeeds and actual native execution still uses stale hooks after applicable refreshes
- **THEN** the result reports successful installation and that concrete activation problem separately, with the affected component and supported next step

#### Scenario: Update succeeds with incomplete activation visibility
- **WHEN** installation converges but the host exposes no control to inspect part of live activation
- **THEN** the update response states the installed version and outcome without restart or reconnect commentary, while diagnostic evidence retains the unverified component without claiming it active

#### Scenario: Installation is already current
- **WHEN** update verifies the current version and no operator action is needed
- **THEN** the response states that TH is current without a restart assurance or speculative caveat

#### Scenario: Claude Code needs its native plugin reload
- **WHEN** a new plugin version is installed and activation requires the operator's supported reload command
- **THEN** update reports the version and that command without appending hypothetical reconnect advice

#### Scenario: Python installation is not visible on the current PATH
- **WHEN** a consented Python installation reports success but the current shell cannot resolve it
- **THEN** update reports the unresolved PATH visibility and affected capability without inferring that the terminal must restart

#### Scenario: Installation fails after a completed domain
- **WHEN** installation or convergence fails after earlier work succeeded
- **THEN** update reports the actual failure, completed work and scoped recovery without hiding the failure behind a success summary
