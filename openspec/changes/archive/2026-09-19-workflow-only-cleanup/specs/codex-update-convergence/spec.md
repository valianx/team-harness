## MODIFIED Requirements

### Requirement: Post-install convergence uses one bounded pass
After snapshot selection, the update flow SHALL invoke no more than one convergence pass before requiring operator input. That pass SHALL classify, reconcile where already authorized, and verify the snapshot bridge, Team Harness native settings, Codex feature requirements, bundled agents, and expected MCP registrations, and SHALL classify the persistent runtime profile without changing it absent live approval. The coordinator MUST NOT reproduce those domain checks as separate preflight or final-verification tool calls.

#### Scenario: Automatically managed domains need repair
- **WHEN** one or more automatically managed domains are stale and the persistent runtime profile needs no decision
- **THEN** one convergence pass repairs the stale domains, verifies their postconditions, and returns the final receipt

#### Scenario: Current installation takes the fast path
- **WHEN** every managed domain and the persistent runtime profile are already current
- **THEN** the pass performs no writes, invokes no per-domain repair operation, and returns a successful current receipt

#### Scenario: Persistent runtime approval is needed
- **WHEN** automatic domains can converge but the persistent runtime profile is stale
- **THEN** the pass completes and verifies the automatically authorized work, leaves the runtime profile unchanged, and returns one pending operator decision

#### Scenario: Retired hooks are absent
- **WHEN** the selected snapshot has no TH permission-hook manifest or launcher
- **THEN** convergence and the snapshot bridge succeed without requiring, recreating or reporting restart for those assets
- **AND** the versioned receipt reports only retained domains

### Requirement: Convergence preserves ownership and security boundaries
The convergence pass SHALL use only the validated new plugin snapshot as executable input, preserve opaque and operator-owned configuration, use fixed command arguments with bounded execution for native Codex operations, and reject unsafe paths, symlinks, unmanaged agent conflicts, invalid structured output, and secret-bearing diagnostics. It MUST NOT activate a pipeline, dispatch agents, mutate Claude Code or OpenCode configuration, replace MCP registrations, weaken the requested sandbox profile, delete prior snapshots, or modify active workspace helper bundles.

#### Scenario: Operator-owned value differs from a Team Harness default
- **WHEN** a supported configuration document contains a complete non-managed operator value
- **THEN** convergence preserves the value and identifies it as preserved rather than replacing it

#### Scenario: A protected target requires sandbox escalation
- **WHEN** an otherwise authorized write fails only because its declared target is protected by the current sandbox
- **THEN** the coordinator may retry the exact convergence invocation with narrow native escalation, while a rejected or failed retry becomes partial convergence

#### Scenario: Convergence encounters unsafe input
- **WHEN** a target path, managed file, native command result, or same-name agent conflict fails its safety contract
- **THEN** convergence stops at that domain, emits no sensitive content, and reports a failed receipt instead of attempting an ad hoc repair
