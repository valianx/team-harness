## MODIFIED Requirements

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

## ADDED Requirements

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

### Requirement: Active OpenSpec compatibility is one-shot
Legacy dispatch generations, reset allowances, stale correction counters,
snapshots, overlays, permanent seals, capsules, and v1-v4 binding shapes SHALL
be accepted only by the v5 converter. New OpenSpec identities, capability
leases, and result events SHALL use the current content-addressed schema and
MUST NOT call legacy branches after conversion.

#### Scenario: A converted service needs another dispatch
- **WHEN** its legacy workspace converted successfully
- **THEN** new dispatch derives one current capability lease from pinned OpenSpec, live ownership, and the control log

#### Scenario: A legacy generation field appears after conversion
- **WHEN** current runtime validation encounters it in writable state
- **THEN** validation fails as mixed-schema state rather than interpreting it as routing input

#### Scenario: Current multi-repository identity is stale
- **WHEN** aggregate membership, service ownership, pinned acceptance, or immutable repository identity fails validation
- **THEN** v5 remains fail closed with bounded service evidence without reconstructing a permanent future dispatch graph

#### Scenario: A repaired legacy aggregate uses a continuation certificate
- **WHEN** current dispatch consumes a workspace converted from a valid original Gate plus verified continuation identity
- **THEN** the converter proves the precise legacy authorization once and the resulting v5 lease carries only the current immutable aggregate identity
