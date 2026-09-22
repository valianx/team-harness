## RENAMED Requirements

- FROM: `### Requirement: Every writer uses one capability lease`
- TO: `### Requirement: Every writer receives useful scope and ownership`
- FROM: `### Requirement: Specialists return one result envelope through existing transport`
- TO: `### Requirement: Specialists return useful evidence through native transport`
- FROM: `### Requirement: Specialist read manifests name produced artifacts`
- TO: `### Requirement: Specialists recover relevant context from current sources`

## MODIFIED Requirements

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
