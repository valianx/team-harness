# codex-update-convergence Specification

## Purpose
Make Team Harness updates on Codex fast and predictable while preserving native plugin authority, operator-owned configuration and execution preferences, and recoverable convergence of TH-owned installation domains.

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
After snapshot selection, the update flow SHALL reconcile and verify TH-owned snapshot bridging, workflow settings, feature prerequisites, bundled agents and expected MCP registrations in one bounded pass. Native execution preferences SHALL NOT be an installation domain or a reason to require another approval. The coordinator SHALL reuse the receipt instead of repeating successful installation checks.

#### Scenario: Native settings differ from former TH defaults
- **WHEN** the operator uses different sandbox, approval, reviewer, network or writable-root settings
- **THEN** update preserves them and completes based on the retained TH installation domains without reporting runtime drift or requesting profile approval

#### Scenario: Native settings are absent
- **WHEN** the native configuration has no explicit execution-policy settings
- **THEN** update leaves those settings absent while synchronizing TH-owned components

#### Scenario: Current installation takes the fast path
- **WHEN** every retained installation domain is current
- **THEN** the pass performs no repair writes and returns a successful current receipt

#### Scenario: Retired hooks are absent
- **WHEN** the snapshot has no TH permission hooks or global runtime-policy helper
- **THEN** update succeeds without recreating those assets or requesting restart for their absence

#### Scenario: Automatically managed domains need repair
- **WHEN** a retained TH installation domain needs repair
- **THEN** the bounded pass repairs and verifies it while preserving native execution preferences

#### Scenario: Persistent runtime approval is needed
- **WHEN** a prior-version receipt requests approval for its former runtime-profile domain
- **THEN** the current skill treats that as a legacy contract, preserves native settings and uses the current update flow without replaying the retired profile write

### Requirement: Convergence preserves ownership and security boundaries
The convergence pass SHALL use the validated selected snapshot, preserve operator-owned configuration and unrelated content, use bounded native command arguments and reject unsafe paths, unmanaged agent conflicts and secret-bearing diagnostics. It SHALL NOT modify native sandbox, approval, network or writable-root preferences, mutate another runtime's configuration, replace MCP registrations, delete prior snapshots or modify active workspace helper bundles. It SHALL preserve configured agent models and the complete supported roster.

#### Scenario: Operator-owned value differs from a Team Harness default
- **WHEN** agent synchronization updates TH-owned agent or fallback entries in a native configuration document
- **THEN** unrelated execution-policy values and structured custom configuration remain unchanged

#### Scenario: A protected target requires sandbox escalation
- **WHEN** a retained installation write is refused by native permissions
- **THEN** update reports the exact failed domain and follows bounded native escalation without widening global permissions

#### Scenario: Convergence encounters unsafe input
- **WHEN** a target path, managed file, native result or same-name agent conflict violates its integrity contract
- **THEN** convergence stops at that domain without exposing sensitive diagnostics or attempting an ad hoc repair

### Requirement: One closed receipt is the verification authority
Every convergence pass SHALL emit one bounded versioned receipt with selected snapshot identities, retained domain outcomes, changed domains, activation signals, failed domain when applicable and recovery invocation. Its statuses SHALL distinguish current, converged and partial convergence without a persistent-runtime approval state. The coordinator SHALL read the selected installation's current skill before interpreting a receipt; successful completion depends on verified postconditions.

#### Scenario: The receipt contract changed with the installed version
- **WHEN** an update started with older skill instructions selects a newer snapshot
- **THEN** the coordinator reads that snapshot's skill and interprets its receipt without rerunning installation or convergence merely because the old schema differs

#### Scenario: Convergence is interrupted by a domain failure
- **WHEN** earlier domains completed and a later domain fails
- **THEN** the receipt preserves completed outcomes, names the failed domain and reports partial convergence with the normal update invocation as recovery

#### Scenario: Convergence succeeds after changes
- **WHEN** every retained domain reaches its verified postcondition and at least one changed
- **THEN** the receipt reports converged and identifies only the domains that changed

#### Scenario: Receipt output is malformed or incomplete
- **WHEN** the pass produces no valid receipt under the selected installation's current contract
- **THEN** the coordinator reports the failed pass without claiming success

### Requirement: Recovery recomputes and skips completed work
Rerunning update after interruption, denial or partial convergence SHALL recompute actual TH-owned installation state and skip completed domains. Recovery SHALL NOT require a pipeline workspace, rely on conversational completion claims or restore retired runtime-profile writes.

#### Scenario: Update resumes after partial convergence
- **WHEN** the operator reruns update after some retained domains completed
- **THEN** current domains are skipped and the remaining work proceeds while native execution preferences remain unchanged

#### Scenario: Approval follows a pending receipt
- **WHEN** the operator continues after an older version's runtime-profile proposal
- **THEN** the current updater recomputes only retained installation domains and does not use that old approval to modify native execution policy
