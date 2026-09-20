## ADDED Requirements

### Requirement: Inline reviewer readiness preserves the current conversation
Local Codex review SHALL verify the selected managed reviewer definition and
native read-only dispatch boundary. A new conversation ID or proof of loaded
profile bytes SHALL NOT be required when the host exposes the native reviewer
role and the selected installed definition is verified. Activation visibility
limits SHALL remain explicit. An invalid definition or unavailable native
read-only role SHALL remain unavailable; observed stale activation SHALL use
supported refresh before considering a demonstrated reconnect need.

#### Scenario: Setup changes only another agent
- **WHEN** the selected installed reviewer definition and native read-only role remain available and unchanged
- **THEN** the local review can proceed in the same conversation

### Requirement: Review criteria validation launches on Windows without a shell
The local review package helper SHALL launch the pinned OpenSpec validator through
Node and npm's JavaScript entrypoint on Windows, keeping arguments separate and
literal. Missing launcher resolution SHALL be distinguished from a failed change
validation. Neither outcome SHALL bypass immutable written-intent binding.

#### Scenario: Node provides npx as a Windows batch shim
- **WHEN** review packaging validates an authored OpenSpec change
- **THEN** it invokes the npm JavaScript entrypoint with Node and does not attempt execFile on npx.cmd
