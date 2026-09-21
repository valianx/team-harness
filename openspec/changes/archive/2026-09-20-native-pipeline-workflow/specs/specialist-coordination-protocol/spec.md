## MODIFIED Requirements

### Requirement: Every writer uses one capability lease
Every writer MUST receive a bounded native assignment with ownership, relevant inputs and the shared workspace. Main MUST avoid conflicting edits and preserve unrelated work; no TH lease is required.

#### Scenario: Parallel independent edits
- **WHEN** two bounded tasks own different files
- **THEN** Main may delegate both and integrates their results while serializing Git mutations.

#### Scenario: Two writers share one worktree
- **WHEN** both specialists can mutate files or Git metadata in the same canonical worktree
- **THEN** Main assigns disjoint ownership for concurrent edits and serializes overlapping writes and Git mutations.

#### Scenario: Two validators inspect one Freeze
- **WHEN** QA and security need overlapping immutable evidence and neither can mutate it
- **THEN** they may run concurrently without receiving mutable ownership

#### Scenario: A lease contains an unsafe mutable path
- **WHEN** a writable path is outside the canonical worktree, resolves through a symlink, overlaps another committing owner, or is absent from approved scope
- **THEN** legacy validation continues rejecting invalid historical leases; current assignments use native permissions and safe file handling within owned scope.

#### Scenario: Several approved tasks share one worktree and owner
- **WHEN** dependency-ready OpenSpec tasks can be completed coherently by one implementer without transferring ownership
- **THEN** Main assigns one coherent batch instead of separate ceremonial handshakes per documentary task.

#### Scenario: Later task details are not yet known
- **WHEN** a future task has not reached its dependency boundary
- **THEN** Main assigns ready work with enough context and defers details that depend on future evidence.

### Requirement: Valid same-agent work continues without a new handshake
Main MUST permit reuse of a useful specialist session with concise delta context when the objective and ownership remain suitable, without a new authorization handshake.

#### Scenario: Continuation
- **WHEN** a correction concerns the same owned surface
- **THEN** Main sends the correction without a new authorization handshake.

#### Scenario: An implementer receives in-scope correction evidence
- **WHEN** the prior implementer remains valid and the correction changes none of the lease identities
- **THEN** Main continues the useful session with delta context and existing ownership.

#### Scenario: QA evaluates a changed Freeze
- **WHEN** correction changes the frozen candidate identity
- **THEN** Main reviews affected changes with suitable independent coverage and reuses valid unaffected evidence.

#### Scenario: Context integrity is lost
- **WHEN** retained specialist context cannot be verified
- **THEN** Main starts a suitable native session from trustworthy sources without requiring the operator to restart the workflow.

### Requirement: Specialists return one result envelope through existing transport
Specialists MUST report outcome, changed files, checks, findings and material limits through native transport. Main MUST NOT require a separate envelope or event schema to use a clear result.

#### Scenario: Usable result
- **WHEN** a specialist returns verifiable work in ordinary prose
- **THEN** Main checks the evidence and incorporates it without ceremonial normalization.

#### Scenario: A specialist completes work
- **WHEN** its terminal result envelope validates against the active lease and immutable inputs
- **THEN** Main checks its actual changes and evidence, incorporates the result once and updates useful progress notes.

#### Scenario: Terminal chat delivery is interrupted
- **WHEN** the runtime exposes durable terminal status for the same specialist session
- **THEN** Main consumes that status without rerunning completed work or requiring a second result channel

#### Scenario: A duplicate result is observed
- **WHEN** Main sees the same validated result identity again
- **THEN** Main avoids repeating integration while retaining any additional findings and evidence.

#### Scenario: A result reports unbounded or secret diagnostics
- **WHEN** terminal output includes credential-shaped content or exceeds the result envelope's bounded diagnostic contract
- **THEN** Main avoids persisting or exposing sensitive output and obtains a bounded useful report without a control-log requirement.

### Requirement: Main remains the only authority and transition owner
Main MUST coordinate the authorized objective and judge specialist recommendations using full task context. Specialists provide evidence and MUST NOT make their proposed remedies binding.

#### Scenario: Advisory review
- **WHEN** a reviewer proposes a broader change
- **THEN** Main accepts, adapts or rejects the recommendation with evidence and continues the authorized scope.

#### Scenario: A specialist discovers an immutable dependency
- **WHEN** the dependency is already inside the lease and can be identified by hash and path
- **THEN** it reports the relevant dependency without creating a separate authority exchange.

#### Scenario: A dependency requires scope expansion
- **WHEN** satisfying it would add mutable paths or change approved behavior
- **THEN** the specialist returns the need to Main and no peer message grants the expansion

### Requirement: Specialist read manifests name produced artifacts
Assignments MUST point to existing relevant artifacts, or clearly identify work yet to be produced. Missing optional historical artifacts MUST NOT prevent useful work.

#### Scenario: Minimal context
- **WHEN** a current task uses OpenSpec and workspace notes without legacy state files
- **THEN** the specialist reads those sources and reports only genuinely missing inputs.

#### Scenario: A specialist reads a retired plan shard
- **WHEN** a scanned contract names `plan/tasks/Task-N.md` or another artifact registered as `retired`
- **THEN** the workspace-artifacts test fails naming the file and the token

#### Scenario: A new artifact appears without a producer
- **WHEN** a scanned contract names a workspace artifact absent from the registry
- **THEN** the test fails naming the file and the token, and passes only once the registry records a producer that mentions it

#### Scenario: The bound change is missing at dispatch
- **WHEN** `qa` or `implementer` cannot resolve the bound OpenSpec change named by the projection
- **THEN** the specialist reports the missing canonical source and Main repairs the path or obtains the genuinely missing intent.
