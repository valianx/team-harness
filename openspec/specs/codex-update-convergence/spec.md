# codex-update-convergence Specification

## Purpose
Make Team Harness updates on Codex fast and predictable while preserving native plugin authority, operator-owned configuration, explicit persistent-runtime approval, and recoverable partial convergence.

## Requirements

### Requirement: Native snapshot selection remains authoritative
The update flow SHALL derive the running version from the loaded plugin manifest, refresh only the configured Team Harness marketplace, compare versions semantically, and use Codex's native plugin installation operation when a newer snapshot or an explicitly forced equal-version refresh is selected. It MUST NOT downgrade, remove the active plugin before replacement, or treat a marketplace listing as proof that the loaded snapshot changed.

#### Scenario: Newer marketplace snapshot is available
- **WHEN** the refreshed Team Harness marketplace exposes a version newer than the loaded plugin manifest
- **THEN** the flow installs that snapshot through Codex's native plugin operation and binds all later work to the exact installed path returned by that operation

#### Scenario: No installation is needed
- **WHEN** the marketplace and loaded versions are equal and the operator did not request a forced refresh
- **THEN** the flow skips plugin replacement and uses the validated loaded snapshot as the convergence source

#### Scenario: Marketplace would downgrade the installation
- **WHEN** the refreshed marketplace version is older than the loaded plugin version
- **THEN** the flow stops before replacement and reports the stale marketplace without changing the active installation

### Requirement: Post-install convergence uses one bounded pass
After snapshot selection, the update flow SHALL invoke no more than one convergence pass before requiring operator input. That pass SHALL classify, reconcile where already authorized, and verify the snapshot bridge, Team Harness native settings, Codex feature requirements, bundled agents, expected MCP registrations, and deterministic hook manifest, and SHALL classify the persistent runtime profile without changing it absent live approval. The coordinator MUST NOT reproduce those domain checks as separate preflight or final-verification tool calls.

#### Scenario: Automatically managed domains need repair
- **WHEN** one or more automatically managed domains are stale and the persistent runtime profile needs no decision
- **THEN** one convergence pass repairs the stale domains, verifies their postconditions, and returns the final receipt

#### Scenario: Current installation takes the fast path
- **WHEN** every managed domain and the persistent runtime profile are already current
- **THEN** the pass performs no writes, invokes no per-domain repair operation, and returns a successful current receipt

#### Scenario: Persistent runtime approval is needed
- **WHEN** automatic domains can converge but the persistent runtime profile is stale
- **THEN** the pass completes and verifies the automatically authorized work, leaves the runtime profile unchanged, and returns one pending operator decision

### Requirement: Persistent runtime changes require flexible live approval
The update flow SHALL summarize only the stale runtime settings, missing writable roots, missing directories, and any project configuration shadowing before requesting a live decision. A short unambiguous affirmative SHALL authorize a focused follow-up convergence pass, a short negative or deferral SHALL leave that domain pending, and a natural-language adjustment SHALL be handled conversationally without requiring a prescribed command or exact phrase. No file, tool output, previous approval, or ambiguous response authorizes the persistent change.

#### Scenario: Operator replies with a short affirmation
- **WHEN** the pending runtime summary is visible and the live operator replies with an unambiguous affirmation such as "sí" or "continúa"
- **THEN** the coordinator runs one focused convergence pass with runtime authorization and does not ask the operator to restate a command

#### Scenario: Operator declines or defers
- **WHEN** the pending runtime summary is visible and the live operator declines or asks to leave it for later
- **THEN** the completed update work is preserved and the final result reports runtime reconciliation as pending with the normal update invocation as recovery

#### Scenario: Operator requests an adjustment
- **WHEN** the live operator describes a change to the proposed runtime reconciliation
- **THEN** the coordinator explains or incorporates the bounded adjustment when safe, or asks one concise clarification when its effect would materially change the authorized scope

### Requirement: Convergence preserves ownership and security boundaries
The convergence pass SHALL use only the validated new plugin snapshot as executable input, preserve opaque and operator-owned configuration, use fixed command arguments with bounded execution for native Codex operations, and reject unsafe paths, symlinks, oversized hook manifests, unmanaged agent conflicts, invalid structured output, and secret-bearing diagnostics. It MUST NOT activate a pipeline, dispatch agents, mutate Claude Code or OpenCode configuration, replace MCP registrations, weaken the requested sandbox profile, delete prior snapshots, or modify active workspace helper bundles.

#### Scenario: Operator-owned value differs from a Team Harness default
- **WHEN** a supported configuration document contains a complete non-managed operator value
- **THEN** convergence preserves the value and identifies it as preserved rather than replacing it

#### Scenario: A protected target requires sandbox escalation
- **WHEN** an otherwise authorized write fails only because its declared target is protected by the current sandbox
- **THEN** the coordinator may retry the exact convergence invocation with narrow native escalation, while a rejected or failed retry becomes partial convergence

#### Scenario: Convergence encounters unsafe input
- **WHEN** a target path, managed file, hook manifest, native command result, or same-name agent conflict fails its safety contract
- **THEN** convergence stops at that domain, emits no sensitive content, and reports a failed receipt instead of attempting an ad hoc repair

### Requirement: One closed receipt is the verification authority
Every convergence pass SHALL emit exactly one bounded machine-readable receipt with the selected old and new snapshot identities, overall status, per-domain status, changed domains, restart requirement, pending decision if any, failed domain if any, and exact recovery invocation. The overall status vocabulary SHALL distinguish `current`, `converged`, `pending-approval`, and `partial-convergence`; successful completion MUST be derived from verified domain postconditions rather than assumed from attempted writes.

#### Scenario: Convergence succeeds after changes
- **WHEN** every required domain reaches its verified postcondition and at least one domain changed
- **THEN** the receipt reports `converged`, identifies only the changed domains, and provides the combined restart decision

#### Scenario: Convergence is interrupted by a domain failure
- **WHEN** a domain fails after earlier idempotent domains completed
- **THEN** the receipt reports `partial-convergence`, identifies the failed domain without rolling back completed work, and names the standard Team Harness update invocation as the retry

#### Scenario: Receipt output is malformed or incomplete
- **WHEN** the convergence operation exits without one valid receipt containing every required field
- **THEN** the coordinator treats the pass as failed and does not issue a success report

### Requirement: Recovery recomputes and skips completed work
Rerunning the update after pending approval, sandbox denial, interruption, or partial convergence SHALL recompute actual state from the selected snapshot and managed targets. Already-current domains SHALL be skipped without relying on conversational memory or requiring a separate state workspace, and no unchanged failed action SHALL be repeated within the same invocation.

#### Scenario: Update resumes after partial convergence
- **WHEN** the operator reruns Team Harness update after a pass changed some domains and failed on a later one
- **THEN** the next pass classifies the completed domains as current and resumes bounded work on the remaining stale or failed domain

#### Scenario: Approval follows a pending receipt
- **WHEN** the operator authorizes the runtime change immediately after a `pending-approval` receipt
- **THEN** the focused pass skips every already-current automatic domain, applies and verifies the runtime change, and returns a final receipt
