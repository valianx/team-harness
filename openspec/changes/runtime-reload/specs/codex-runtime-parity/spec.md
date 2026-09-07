## ADDED Requirements

### Requirement: Inline reviewer readiness preserves the current conversation
Local Codex review SHALL verify the selected managed reviewer definition and
native read-only dispatch boundary. Activation SHALL be established for the
current backend through startup or verified reload/reconnect; a new conversation
ID SHALL NOT be required. No-op synchronization or changes to other agents SHALL
NOT invalidate a known-current selected profile. Unknown activation SHALL remain
unavailable with the missing evidence identified.

#### Scenario: Setup changes only another agent
- **WHEN** the selected reviewer definition and scope retain their verified activation basis
- **THEN** the local review can proceed in the same conversation

### Requirement: Review criteria validation launches on Windows without a shell
The local review package helper SHALL launch the pinned OpenSpec validator through
Node and npm's JavaScript entrypoint on Windows, keeping arguments separate and
literal. Missing launcher resolution SHALL be distinguished from a failed change
validation. Neither outcome SHALL bypass immutable written-intent binding.

#### Scenario: Node provides npx as a Windows batch shim
- **WHEN** review packaging validates an authored OpenSpec change
- **THEN** it invokes the npm JavaScript entrypoint with Node and does not attempt execFile on npx.cmd
