# specialist-coordination-protocol Specification

## Purpose
Defines how Main and bounded specialists exchange work and results with minimal
round trips while preserving one coordinator authority and exclusive mutable
ownership for every canonical worktree.

## Requirements

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

### Requirement: Every writer receives useful scope and ownership
Every writer MUST receive a bounded objective, owned scope, relevant inputs and the shared workspace. Main SHALL avoid conflicting edits and preserve unrelated work. Implementers SHALL be able to write ordinary tests for their assigned behavior; a separate tester is additional expertise. Native assignments SHALL NOT require lease fields or a commit per documentary task.

#### Scenario: Parallel independent edits
- **WHEN** two tasks own different files
- **THEN** Main may run them concurrently while serializing shared Git mutations.

#### Scenario: Two writers share one worktree
- **WHEN** edits or Git operations overlap
- **THEN** Main coordinates ownership and ordering before integration.

#### Scenario: Two validators inspect one Freeze
- **WHEN** QA and security need overlapping immutable evidence
- **THEN** their independent read-only work can run concurrently.

#### Scenario: A lease contains an unsafe mutable path
- **WHEN** a compatibility reader validates an invalid historical writable path
- **THEN** it retains that rejection while current work uses native permissions and assigned ownership.

#### Scenario: Several approved tasks share one worktree and owner
- **WHEN** several ready tasks can be implemented and tested by the same specialist
- **THEN** Main assigns a coherent batch and chooses an appropriate integration boundary instead of requiring a separate handshake and commit for each task.

#### Scenario: Later task details are not yet known
- **WHEN** future work depends on results not yet produced
- **THEN** Main delegates current useful work and supplies later context when available.

### Requirement: Specialists return useful evidence through native transport
Specialists MUST report the outcome, changed files or inspected scope, relevant checks, findings and material limits through native transport. Main SHALL verify evidence and update existing progress without requiring an exact YAML block, extra report, acceptance matrix or event schema.

#### Scenario: Usable result
- **WHEN** a specialist returns verifiable work in ordinary prose
- **THEN** Main incorporates it without a formatting-only correction round.

#### Scenario: A specialist completes work
- **WHEN** a specialist returns changes and their evidence
- **THEN** Main verifies the candidate, incorporates the result once and updates useful workspace context.

#### Scenario: Terminal chat delivery is interrupted
- **WHEN** the runtime retains the session outcome
- **THEN** Main recovers that result without rerunning completed work or demanding a second result channel.

#### Scenario: A duplicate result is observed
- **WHEN** Main sees an already incorporated result
- **THEN** it avoids repeating integration and preserves any new information.

#### Scenario: A result reports unbounded or secret diagnostics
- **WHEN** a report contains secrets or irrelevant raw logs
- **THEN** Main avoids exposing sensitive output and retains a useful bounded summary with appropriate evidence links.

### Requirement: Specialists recover relevant context from current sources
Assignments MUST identify relevant sources and work still to be produced. Specialists SHALL read necessary project context within their role and scope, and report genuinely missing inputs. Missing optional historical reports or a fixed artifact layout SHALL NOT block current work.

#### Scenario: Minimal context
- **WHEN** the effort uses OpenSpec and ordinary workspace notes
- **THEN** specialists use those sources without requesting legacy state files.

#### Scenario: A specialist reads a retired plan shard
- **WHEN** current context is available but a historical report is absent
- **THEN** the specialist recovers equivalent relevant evidence instead of treating the filename as an execution prerequisite.

#### Scenario: A new artifact appears without a producer
- **WHEN** a specialist produces an assessment requested by an upstream method
- **THEN** it uses that method's supported outputs in the shared workspace, without adding a separate TH artifact registry or duplicate report.

#### Scenario: The bound change is missing at dispatch
- **WHEN** the supplied source path is stale
- **THEN** the specialist or Main resolves the bound change from current context and reports only an actual missing or ambiguous source.
