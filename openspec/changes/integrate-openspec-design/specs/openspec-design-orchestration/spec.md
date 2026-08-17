## Purpose

Defines how Team Harness treats OpenSpec as the canonical Design source while adding only its execution overlay, specialist governance, evidence, and gate controls.

## ADDED Requirements

### Requirement: Existing pipeline entry and lifecycle remain authoritative
Team Harness SHALL invoke OpenSpec only as an internal part of the Design phase of an explicitly activated TH pipeline. It MUST NOT introduce an additional pipeline entry point, alternate state machine, or OpenSpec-owned gate.

#### Scenario: Operator starts the normal pipeline
- **WHEN** the operator invokes `@Team-Harness pipeline` with a task and completes the existing intake
- **THEN** TH enters its existing Design phase and uses OpenSpec internally without requiring a separate OpenSpec workflow invocation

#### Scenario: OpenSpec reports artifact readiness
- **WHEN** OpenSpec reports that proposal, specs, design, or tasks are ready
- **THEN** TH treats that status as design input and does not advance state or release Stage Gate 1 from it

#### Scenario: An internal OpenSpec action completes normally
- **WHEN** preflight, planning, strict validation, snapshot, overlay generation, or another authorized internal action completes without a required gate, unresolved material decision, external mutation authority, or real blocker
- **THEN** Main continues to the next valid pipeline action automatically, reports concise progress without requesting an operator reply, and does not require the operator to invoke another OpenSpec or TH command

#### Scenario: Operator intervention is strictly required
- **WHEN** the next action is a mandatory TH gate, requires a material choice not fixed by the canonical artifacts, needs separate authority for an external mutation, or is blocked by an error that cannot be resolved safely within scope
- **THEN** Main pauses once with the exact decision or authority required and the evidence needed to answer it

### Requirement: OpenSpec artifacts are the canonical Design source
The Design phase SHALL use the installed OpenSpec CLI, generated planning skills, active schema, artifact graph, instructions, and templates to produce and reconcile the proposal, delta specs, technical design, and tasks for the bound change. TH MUST NOT create a competing editable representation of requirements, scenarios, design decisions, or OpenSpec task intent. Main SHALL retain ownership of TH state, evidence, deterministic validation, and operator communication.

#### Scenario: Design work is dispatched
- **WHEN** TH reaches the architect dispatch in Design
- **THEN** the architect receives the approved request, repository context, bound change identity, and upstream OpenSpec planning workflow it may use only inside the active change root

#### Scenario: OpenSpec planning is incomplete or contradictory
- **WHEN** the architect cannot produce coherent OpenSpec artifacts from the approved request
- **THEN** it reports the unresolved decision or contradiction to Main without changing TH state, releasing a gate, or starting implementation

### Requirement: TH derives a minimal execution overlay
After strict OpenSpec validation, TH SHALL derive an execution overlay that references the pinned OpenSpec requirements, scenarios, design decisions, and tasks without rewriting their semantic content. The overlay SHALL add only TH-owned execution concerns such as repository file scope, specialist ownership, dependencies, invariants, verification commands, evidence requirements, rollback, and delivery grouping.

#### Scenario: Execution overlay is complete and valid
- **WHEN** OpenSpec proposal, specs, design, and tasks are complete and valid
- **THEN** TH produces a bounded Gate-1 index and execution shards whose acceptance and task entries reference the pinned OpenSpec coordinates and validates the overlay before presenting Stage Gate 1

#### Scenario: A source requirement cannot be projected unambiguously
- **WHEN** an OpenSpec requirement, scenario, or task cannot map to the required TH acceptance or task contract without inventing intent
- **THEN** TH blocks Stage Gate 1 and requests reconciliation instead of silently weakening or fabricating the contract

### Requirement: Traceability is complete in both directions
TH SHALL validate that every OpenSpec scenario and task is mapped to the execution overlay or explicitly excluded, and that every TH execution or acceptance item references existing pinned OpenSpec coordinates or is declared as a TH-only operational extension. Each non-direct transformation MUST be classified as `split`, `merged`, `th-extension`, `excluded`, or `ambiguous`; `ambiguous` MUST block Stage Gate 1.

#### Scenario: Direct source mapping
- **WHEN** one OpenSpec scenario or task maps without semantic change to one TH acceptance or execution item
- **THEN** the overlay records a `direct` mapping to its pinned coordinate

#### Scenario: Source mapping transforms structure
- **WHEN** projection splits or merges source items, adds a TH-only operational obligation, or excludes an item
- **THEN** the transformation and rationale are recorded and surfaced to the operator before Stage Gate 1

#### Scenario: OpenSpec source coverage is incomplete
- **WHEN** any pinned OpenSpec scenario or task is neither mapped nor explicitly excluded
- **THEN** deterministic validation blocks Stage Gate 1 even when every TH-authored overlay item has a source reference

### Requirement: Planning inputs are pinned for Gate 1
TH SHALL record the OpenSpec change identity, schema, CLI version, generated-skill identity, artifact paths, normalized coordinates, and raw content hashes in the configured workspace's single `inputs/openspec-snapshot.json`. For the OpenSpec task artifact it SHALL additionally record an intent hash calculated by normalizing only checkbox state. TH MUST detect changes to those inputs before Gate 1 release or implementation begins and MUST distinguish an authorized task-progress transition from a change to canonical intent after implementation begins.

#### Scenario: OpenSpec inputs remain unchanged
- **WHEN** TH checks the planning snapshot before presenting or consuming Stage Gate 1
- **THEN** the recorded paths, raw content hashes, task intent hash, and coordinates match the active OpenSpec artifacts and the pipeline may continue subject to the normal gate rules

#### Scenario: Canonical intent changes after projection
- **WHEN** any non-task artifact changes, task text or structure changes, a task coordinate is added or removed, a completed task returns to pending, or the normalized task intent hash differs from the snapshot used for the TH plan
- **THEN** TH blocks continuation and requires an explicit reconciliation and fresh projection before presenting or consuming Stage Gate 1

#### Scenario: OpenSpec records authorized task progress
- **WHEN** implementation has begun and the only difference in the task artifact is one or more known checkbox transitions from pending to complete produced by authorized work
- **THEN** TH accepts the verified progress transition, records the new raw content hash and completed task coordinates, and continues to use the unchanged intent hash and Gate-1 projection

#### Scenario: Task progress mutation is not monotonic
- **WHEN** a task checkbox changes outside an authorized pending-to-complete transition, a completed checkbox returns to pending, or task progress cannot be matched uniquely to the pinned coordinates
- **THEN** TH blocks specialist dispatch and requires explicit reconciliation rather than treating the mutation as progress

### Requirement: OpenSpec skills remain upstream-owned and subordinate to TH authority
TH SHALL use and preserve the OpenSpec-generated skills required by the installed OpenSpec version rather than reimplementing or redistributing them as TH-owned workflows. Invoking an OpenSpec skill MUST NOT authorize state transitions, gate releases, Freeze invalidation, sync, archive, publication, or other actions outside the current TH phase and live operator authority.

#### Scenario: Design invokes an OpenSpec planning skill
- **WHEN** the architect uses a supported OpenSpec planning skill during Design
- **THEN** its writes remain limited to the active OpenSpec planning change and its results are validated and projected by TH

#### Scenario: A write-capable OpenSpec action is requested before authorization
- **WHEN** an OpenSpec apply, sync, archive, or equivalent action would exceed the active TH phase, frozen identity, or operator authority
- **THEN** TH refuses the action and preserves the current pipeline state

### Requirement: Specialists consume pinned OpenSpec acceptance directly
After Gate 1, implementer, tester, and QA SHALL consume the original pinned OpenSpec tasks and scenarios together with the TH execution overlay. TH MUST NOT substitute architect-authored paraphrases as the acceptance source. OpenSpec apply instructions MAY guide an authorized implementer but MUST NOT select specialists, expand file scope, mark TH evidence complete, or advance pipeline state.

#### Scenario: Implementer receives authorized work
- **WHEN** Gate 1 authorizes a TH execution item
- **THEN** the implementer receives its pinned OpenSpec task/scenario references plus only the TH file scope, invariants, and verification obligations needed to execute it

#### Scenario: Tester or QA evaluates acceptance
- **WHEN** tester or QA validates an implemented change
- **THEN** it evaluates observable behavior against the pinned OpenSpec scenarios and records evidence through the existing TH validation contract

### Requirement: Repository and workspace artifacts retain separate homes
OpenSpec source-of-intent artifacts SHALL remain under the target repository's resolved OpenSpec planning root. TH state, execution overlay, decisions, reviews, and evidence SHALL remain in the configured TH workspace, including an Obsidian vault when configured. TH MUST NOT copy OpenSpec source into the workspace as a second editable root.

#### Scenario: Pipeline uses an Obsidian workspace
- **WHEN** TH is configured to store pipeline workspaces in Obsidian
- **THEN** the TH execution overlay, decisions, and evidence are written to the vault while OpenSpec artifacts remain in the target repository and are referenced by identity, coordinate, and hash

### Requirement: OpenSpec failures stop Design recoverably
TH MUST NOT silently fall back to its legacy design-authoring path when an OpenSpec command, schema validation, or projection fails. The pipeline SHALL remain recoverable in Design with the failure and next valid action recorded.

#### Scenario: OpenSpec validation fails
- **WHEN** the active change fails strict OpenSpec validation
- **THEN** TH records the failure, remains in Design, and does not present Stage Gate 1
