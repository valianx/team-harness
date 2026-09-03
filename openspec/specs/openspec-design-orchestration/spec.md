# openspec-design-orchestration Specification

## Purpose
Defines how Team Harness treats OpenSpec as the canonical Design source while adding only its execution overlay, specialist governance, evidence, and gate controls.

## Requirements

### Requirement: Existing pipeline entry and lifecycle remain authoritative
Team Harness SHALL invoke OpenSpec only as an internal part of the Design phase of an explicitly activated TH pipeline. It MUST NOT introduce an additional pipeline entry point, alternate state machine, or OpenSpec-owned gate.

#### Scenario: Operator starts the normal pipeline
- **WHEN** the operator invokes `@Team-Harness pipeline` with a task and completes the existing intake
- **THEN** TH enters its existing Design phase and uses OpenSpec internally without requiring a separate OpenSpec workflow invocation

#### Scenario: OpenSpec reports artifact readiness
- **WHEN** OpenSpec reports that proposal, specs, design, or tasks are ready
- **THEN** TH treats that status as design input and does not advance state or release Stage Gate 1 from it

#### Scenario: An internal OpenSpec action completes normally
- **WHEN** preflight, planning, strict validation, identity recomputation, projection rebuild, or another authorized internal action completes without a required gate, unresolved material decision, external mutation authority, or real blocker
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

### Requirement: Planning inputs are pinned for Gate 1
TH SHALL compute one content identity per writable service with `openspecContentIdentity` over the canonical OpenSpec artifacts — every file under the change root in sorted relative-path order, each contributing its length-prefixed relative path and its length-prefixed bytes to one SHA-256, with checkbox state in `tasks.md` normalized out — so a renamed, added, or removed file changes the identity. TH SHALL record it in the control log at Gate 1 together with the change name, path, and CLI version. TH SHALL recompute and compare the identity before every lease is issued and at Freeze. A mismatch SHALL pause with the diff shown and SHALL require Gate 1 to be re-presented over the revised change. A checkbox transition SHALL NOT change the identity; `taskProgressDelta` SHALL classify it as authorized progress, regression, or a structural change, and only authorized progress continues without a recorded action. No snapshot file, aggregate manifest, overlay hash, or helper-bundle identity is recorded.

#### Scenario: OpenSpec inputs remain unchanged
- **WHEN** TH recomputes the identity before issuing a lease
- **THEN** it matches the Gate-1 value and the lease is issued

#### Scenario: Canonical intent changes after projection
- **WHEN** any of `proposal.md`, `design.md`, `specs/**`, or the non-checkbox content of `tasks.md` differs from the pinned content
- **THEN** TH pauses, shows the diff, and re-presents Gate 1 over the revised change before any further lease

#### Scenario: OpenSpec records authorized task progress
- **WHEN** the only difference in `tasks.md` is a pending-to-complete transition on a task coordinate present in the pinned text
- **THEN** the identity is unchanged and the pipeline continues

#### Scenario: A file is renamed, added, or removed
- **WHEN** the change root gains, loses, or renames a file while every remaining byte is unchanged
- **THEN** the identity differs from the Gate-1 value and TH pauses as for a canonical change

#### Scenario: Aggregate implementation validation advances one service
- **WHEN** a multi-repository run issues a lease for one service
- **THEN** only that service's identity is checked for that lease

#### Scenario: Task progress mutation is not monotonic
- **WHEN** a completed checkbox returns to pending
- **THEN** the identity is unchanged, the regression is recorded in the control log, and the batch that owns the task is re-leased

#### Scenario: A required supplied artifact cannot be read
- **WHEN** the change directory or any file the identity covers cannot be read
- **THEN** TH pauses before issuing a lease, naming the unreadable path

### Requirement: OpenSpec skills remain upstream-owned and subordinate to TH authority
TH SHALL use and preserve the OpenSpec-generated skills required by the installed OpenSpec version rather than reimplementing or redistributing them as TH-owned workflows. Invoking an OpenSpec skill MUST NOT authorize state transitions, gate releases, Freeze invalidation, sync, archive, publication, or other actions outside the current TH phase and live operator authority.

#### Scenario: Design invokes an OpenSpec planning skill
- **WHEN** the architect uses a supported OpenSpec planning skill during Design
- **THEN** its writes remain limited to the active OpenSpec planning change and its results are validated and projected by TH

#### Scenario: A write-capable OpenSpec action is requested before authorization
- **WHEN** an OpenSpec apply, sync, archive, or equivalent action would exceed the active TH phase, frozen identity, or operator authority
- **THEN** TH refuses the action and preserves the current pipeline state

### Requirement: Specialists consume pinned OpenSpec acceptance directly
After Gate 1, every dispatched specialist SHALL consume original pinned
OpenSpec tasks and scenarios directly through immutable references in its
capability lease. The lease SHALL add only the authority, mutable scope,
ownership, role-specific verification obligations, and result shape needed for
the next bounded unit. TH MUST NOT substitute `01-plan.md`, architect
paraphrases, Main's transcript, prior specialist narrative, semantic overlays,
or prompt-level copies as acceptance. OpenSpec apply instructions MAY guide an
authorized implementer but MUST NOT select specialists, expand scope, mark TH
evidence complete, or advance state.

#### Scenario: Implementer receives authorized work
- **WHEN** Gate 1 authorizes a TH execution item
- **THEN** the implementer receives one verified lease with pinned OpenSpec coordinates and only the operational fields required by its coherent worktree batch

#### Scenario: Tester or QA evaluates acceptance
- **WHEN** an independent verifier, risk-required tester, or security reviewer validates an implemented change
- **THEN** it reads canonical pinned scenarios and returns evidence in one result envelope

#### Scenario: Prompt content duplicates canonical source or lease
- **WHEN** dispatch duplicates task meaning, acceptance prose, or authority already owned by OpenSpec or the lease
- **THEN** dispatch validation rejects the competing copy before repository work

### Requirement: Repository and workspace artifacts retain separate homes
Each service's OpenSpec source-of-intent artifacts SHALL remain under that service repository's resolved OpenSpec planning root. TH coordinator state — the control log, its projections, decisions, reviews, and evidence — SHALL remain under the one canonical initiative workspace. The coordinator workspace holds recorded identities and evidence only and MUST NOT become an editable OpenSpec root. Evidence-only repositories remain read-only and never inherit planning ownership.

#### Scenario: Pipeline uses an Obsidian workspace
- **WHEN** TH coordinates multiple service-owned OpenSpec changes in Obsidian mode
- **THEN** the coordinator workspace contains the control log and per-service evidence while each proposal, spec, design, and task remains editable only in its owning repository

#### Scenario: No repository is the initiative coordinator
- **WHEN** participating services are peers and none owns the cross-service initiative
- **THEN** Team Harness keeps coordination in the external initiative workspace and does not centralize sibling OpenSpec artifacts in any reference service

### Requirement: OpenSpec failures stop Design recoverably
TH MUST NOT silently fall back to its legacy design-authoring path when an OpenSpec command, schema validation, or projection fails. The pipeline SHALL remain recoverable in Design with the failure and next valid action recorded.

#### Scenario: OpenSpec validation fails
- **WHEN** the active change fails strict OpenSpec validation
- **THEN** TH records the failure, remains in Design, and does not present Stage Gate 1

### Requirement: Multi-repository Design binds OpenSpec per writable service
For a multi-repository initiative, Team Harness SHALL record in the Gate-1 event an ordered list with exactly one entry for every participating writable service that owns OpenSpec intent. Each entry SHALL identify the service, repository root and immutable repository identity, change name, planning root, CLI version, strict-validation result, and the service's content identity. No binding collection, snapshot, or execution overlay is recorded. Team Harness MUST NOT choose a coordinator or reference repository as a substitute source of intent.

#### Scenario: Three services own their own specifications
- **WHEN** `merchant-bridge`, `payments-orchestrator`, and `transactions` participate as writable services
- **THEN** the Gate-1 event lists three independently validated services with their content identities, and their planning artifacts remain in their owning repositories

#### Scenario: A repository is read-only evidence
- **WHEN** `payment-gateway` is consulted only as evidence
- **THEN** it is recorded with an evidence-only disposition and receives no Gate-1 entry, writable scope, task ownership, or acceptance coordinates

#### Scenario: A writable service has no valid binding
- **WHEN** a participating writable service lacks a readable and strictly valid service-owned OpenSpec change
- **THEN** Design remains recoverable and blocks consolidated Gate 1 without relocating or synthesizing that service's specification elsewhere

### Requirement: Multi-repository Gate 1 is consolidated and freshness-bound
An OpenSpec-bound multi-repository initiative SHALL present one consolidated Gate 1 only after every required service validates, every cross-service dependency and execution order is represented, and every recorded content identity is fresh. The approval SHALL bind the exact ordered service list, each service's content identity, repository roles, and read-only evidence dispositions. It MUST NOT authorize a missing, later-added, stale, or ownership-mismatched service.

#### Scenario: All service bindings are valid and fresh
- **WHEN** every writable service has a strictly valid change with a fresh content identity and cross-service dependencies are unambiguous
- **THEN** Team Harness presents one Gate 1 summary naming each service-owned change, its bounded scope, execution order, and content identity

#### Scenario: One service changes after the gate preview
- **WHEN** any service's content identity, repository identity, list membership, dependency, or order differs before approval is consumed
- **THEN** the aggregate freshness check invalidates the preview and requires reconciliation before Gate 1 can be released

#### Scenario: Evidence-only repository is promoted to writable scope
- **WHEN** implementation intent begins to modify a repository previously classified as evidence-only
- **THEN** Team Harness treats this as a service-list and scope change, selects or authors that service's OpenSpec change, records its content identity, and re-presents Gate 1

### Requirement: OpenSpec dispatch uses the two-primitive control contract
OpenSpec-bound specialist work SHALL use one `capability_lease` and one
`result_envelope`. Artifact hashes and control-log positions SHALL remain fields
inside those objects. Main SHALL derive the minimum lease just in time from the
approved OpenSpec identity and current worktree facts. Design MUST NOT require
an exhaustive per-task execution contract, semantic overlay, permanent task
capsule, or complete future dispatch graph before Gate 1.

#### Scenario: A worktree batch becomes executable
- **WHEN** approved OpenSpec tasks form one coherent next batch in one canonical worktree
- **THEN** Main derives one bounded lease from current authority, ownership, pinned sources, writable scope, and required verification

#### Scenario: Future operational detail is not yet needed
- **WHEN** a later task has not reached its dependency boundary
- **THEN** Design and current dispatch do not require its exact files, seams, helper paths, commands, or evidence coordinates

### Requirement: Design keeps OpenSpec canonical and the operator plan compact
The pipeline SHALL retain `design` and `waiting_gate1` as state-machine phases.
Canonical proposal, specifications, design decisions, and work tasks SHALL live
only in the bound OpenSpec change. When that change already exists and passes
strict validation, Design SHALL reuse it without an architect dispatch. When
planning authorship or a requested semantic update is required, Design SHALL
dispatch at most one architect to run the upstream propose/update workflow.

TH SHALL generate `01-plan.md` as a compact, read-only operator projection that
contains the observable result, included and excluded scope, approach, coherent
work batches, material risks and decisions, preserved behavior, canonical links,
and approved OpenSpec identity. It MUST NOT duplicate acceptance criteria,
technical constraints, task implementation detail, or dispatch contracts, and
it MUST be regenerated rather than edited when OpenSpec changes.

#### Scenario: A valid change already exists
- **WHEN** activation binds an existing complete OpenSpec change that passes strict validation
- **THEN** Design regenerates `01-plan.md` and presents Gate 1 without spawning architect, `qa-plan`, plan reviewer, or security design reviewer

#### Scenario: Planning content must be authored
- **WHEN** no complete bound change exists or the operator requests a semantic edit
- **THEN** one architect updates canonical OpenSpec, strict validation passes, and TH regenerates the compact operator plan before Gate 1

#### Scenario: The operator requests plan review
- **WHEN** the live operator explicitly invokes the plan-review capability
- **THEN** one optional reviewer checks canonical OpenSpec and projection fidelity without editing either source, creating another plan, or releasing Gate 1

#### Scenario: OpenSpec changes after projection
- **WHEN** the canonical change identity no longer matches the identity recorded by `01-plan.md`
- **THEN** the projection is stale, Gate 1 cannot consume it, and Main regenerates it from the validated canonical source

### Requirement: Liveness reports facts and causal recovery chooses action
The liveness helper SHALL emit delivery, acknowledgement, terminality, declared
progress, and interruption facts. It MUST NOT select `resume`, replacement,
retry, or failure from an ordinal. `TH-LIVENESS-RESUME`, one-replacement
allowances, and retry-exhausted terminal states SHALL be absent from current
contracts and generated projections.

#### Scenario: A writer stops responding
- **WHEN** its delivery/acknowledgement contract closes without terminal success
- **THEN** liveness returns bounded facts and causal recovery audits ownership and progress before choosing an action

#### Scenario: A high attempt ordinal is observed
- **WHEN** current evidence supports a different safe action
- **THEN** recovery may proceed regardless of the ordinal

#### Scenario: A fixed probe, renewal, or replacement allowance is present in legacy state
- **WHEN** the v5 converter encounters the completed hardening contract's bounded liveness fields
- **THEN** it preserves them only as historical observations and current recovery does not interpret their count as authority, failure, or permission to replace

### Requirement: A workspace without a control log closes administratively
When recovery or activation selects a workspace whose `control/control.jsonl` is absent, TH SHALL NOT infer, convert, or repair state. It SHALL append exactly one `pipeline.close` entry with `terminal_state: closed-administratively` to the workspace events file and SHALL offer inline continuation or a fresh run. Before writing, TH SHALL refuse a `control/` entry or an events file that is a symbolic link or has more than one hard link, and SHALL verify after opening that the events file it writes is the regular file it checked. A workspace that has a control log SHALL never take this path.

#### Scenario: Orphan workspace is closed
- **WHEN** the selected workspace has no `control/control.jsonl`
- **THEN** one `pipeline.close` entry is appended, the outcome is `closed-administratively`, and the operator is offered inline continuation or a fresh run

#### Scenario: Control log is present
- **WHEN** the selected workspace has `control/control.jsonl`
- **THEN** the administrative close is refused with `CONTROL_LOG_PRESENT` and recovery replays the log instead

#### Scenario: A linked path is refused
- **WHEN** `control/` or the events file is a symbolic link or a hard link, or the opened events file differs from the one checked
- **THEN** nothing is written and the close is refused with `CONTROL_PATH_SYMLINK` or `EVENTS_PATH_INVALID`
