## ADDED Requirements

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

### Requirement: Reload preserves work and reports a bounded outcome
Reload SHALL report active, partial, reconnect-required, or blocked, with verified
and pending components. It SHALL attempt each exposed refresh once. Instance
recycling SHALL require supported host scheduling at a safe boundary without
interrupting other active work. Reconnect SHALL retain the existing conversation.

#### Scenario: The host has no callable reload control
- **WHEN** documentation describes a reload API but the active host does not expose it
- **THEN** reload reports the limitation and a same-conversation reconnect route without starting a second server

#### Scenario: OpenCode has other active work
- **WHEN** recycling the instance would interrupt another session
- **THEN** reload leaves recycling pending and does not call instance disposal

### Requirement: Successful updates attempt session activation separately
Codex and OpenCode update SHALL invoke reload after a successful installation or
current-version verification. The installation result SHALL remain authoritative
for disk convergence, and reload SHALL independently report activation. A pending
approval or failed update SHALL NOT trigger activation of an unverified target.

#### Scenario: Installation converges but native hooks remain stale
- **WHEN** update succeeds and activation cannot refresh or verify the live hooks
- **THEN** the result reports successful installation and the remaining activation requirement separately
