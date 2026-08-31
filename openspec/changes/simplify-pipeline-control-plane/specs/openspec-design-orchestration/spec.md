## MODIFIED Requirements

### Requirement: Specialists consume pinned OpenSpec acceptance directly
After Gate 1, implementer, tester, and QA SHALL consume original pinned OpenSpec
tasks and scenarios through immutable input fields in the work capsule's
capability lease. The capsule SHALL add only authority, mutable scope, execution
overlay, invariants, verification obligations, and result shape required by the
role. TH MUST NOT substitute architect paraphrases, Main's transcript, prior
specialist narrative, or prompt-level copies of the capsule graph as acceptance.
OpenSpec apply instructions MAY guide an authorized implementer but MUST NOT
select specialists, expand scope, mark TH evidence complete, or advance state.

#### Scenario: Implementer receives authorized work
- **WHEN** Gate 1 authorizes a TH execution item
- **THEN** the implementer receives one verified capsule binding pinned OpenSpec coordinates, capability lease, invariants, and verification obligations

#### Scenario: Tester or QA evaluates acceptance
- **WHEN** tester or QA validates an implemented change
- **THEN** it reads canonical pinned scenarios and returns evidence in one result envelope

#### Scenario: Prompt content duplicates the capsule
- **WHEN** dispatch duplicates roots, hashes, task text, helpers, seals, or evidence already owned by the capsule
- **THEN** dispatch validation rejects the competing copy before repository work

## ADDED Requirements

### Requirement: OpenSpec dispatch uses the two-primitive control contract
OpenSpec-bound specialist work SHALL use one `capability_lease` and one
`result_envelope`. Artifact hashes and control-log positions SHALL remain fields
inside those objects. Main SHALL validate the OpenSpec model and capsule once
before dispatch, and repeated derivation within one uninterrupted certification
transaction MUST NOT occur.

#### Scenario: A correction packet is certified
- **WHEN** preflight validates its model, sources, owners, evidence coverage, and capsule
- **THEN** certification persists and dispatches that validated capsule without recomputing the same graph

#### Scenario: Certification resumes after an external pause
- **WHEN** the transaction boundary was lost before dispatch
- **THEN** certification revalidates once against the prior identity before continuing

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
Legacy dispatch generations, reset allowances, stale correction counters, and
v1-v4 binding shapes SHALL be accepted only by the v5 converter. New OpenSpec
seals, evidence bindings, capsules, and result events SHALL use the current
content-addressed schema and MUST NOT call legacy branches after conversion.

#### Scenario: A converted service needs another dispatch
- **WHEN** its legacy workspace converted successfully
- **THEN** new dispatch reads only the current capsule, capability lease, and control log

#### Scenario: A legacy generation field appears after conversion
- **WHEN** current runtime validation encounters it in writable state
- **THEN** validation fails as mixed-schema state rather than interpreting it as routing input

#### Scenario: A hardened binding or dispatch seal is stale
- **WHEN** aggregate membership, service ownership, pinned acceptance, immutable dispatch artifacts, or a permanent dispatch binding fails validation
- **THEN** v5 remains fail closed with the bounded service evidence and does not weaken the multi-repository or seal contract to simplify routing

#### Scenario: A repaired legacy aggregate uses a continuation certificate
- **WHEN** current dispatch consumes a workspace converted from a valid original Gate plus verified continuation identity
- **THEN** the converter proves the precise legacy authorization once and the resulting v5 lease carries only the current immutable aggregate identity
