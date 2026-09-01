## Purpose

Defines the minimum executable control plane needed to preserve live authority,
exclusive writes, immutable inputs, trustworthy results, and recoverable state
without turning observations or compatibility details into routing controls.

## ADDED Requirements

### Requirement: The control plane uses exactly two primitives
Every current specialist interaction SHALL use exactly two control primitive
kinds: `capability_lease` for dispatch and `result_envelope` for return. Artifact
references and observed control-log positions SHALL be fields within those
objects and MUST NOT create independent authority, ownership, or transition
currencies. Both primitive schemas SHALL be closed and versioned.

#### Scenario: Main dispatches approved work
- **WHEN** a specialist can perform work under existing authority
- **THEN** Main sends one capability lease containing authority, scope, ownership, immutable inputs, and validity, and receives one result envelope

#### Scenario: A third coordination object is proposed
- **WHEN** the proposed object independently authorizes work, owns mutable scope, reports completion, or advances state
- **THEN** it is folded into the applicable primitive or rejected unless it prevents a distinct named safety failure

### Requirement: One append-only log owns control state
One coordinator-owned append-only control log SHALL be the durable source for
operator authority, capability-lease lifecycle, accepted results, pipeline
transitions, and mechanical release. `00-state.md`, `01-plan.md`, findings ledgers, counters,
and other human-readable views SHALL be rebuildable projections or telemetry and
MUST NOT independently authorize, pause, rotate, or advance work.

#### Scenario: Gate 1 is approved
- **WHEN** the operator answers the current Gate-1 presentation with an allowed approval value
- **THEN** Main appends one authority event and derives the current state without writing a second authoritative release field

#### Scenario: A projection is stale
- **WHEN** a projection disagrees with a valid control log
- **THEN** recovery rebuilds the projection from the log and does not re-present the gate or alter the legal route

#### Scenario: An operator plan disagrees with canonical OpenSpec
- **WHEN** generated `01-plan.md` names a different semantic value or source identity
- **THEN** it is regenerated from pinned OpenSpec and cannot release Gate 1 as an independent plan

#### Scenario: Required authority is absent
- **WHEN** the control log lacks a valid event for a protected action
- **THEN** the pipeline fails closed before that action and requests only the missing live decision or integrity prerequisite

### Requirement: Control records are bounded, canonical, and provenance-safe
Capability leases, result envelopes, and control-log records SHALL reject
unknown fields, invalid lifecycle transitions, oversized values, unsafe paths,
symlink escapes, secret-shaped content, forged provenance, stale sequences, and
non-canonical identities. Appending SHALL be atomic and commit-last. A failed
append or replay MUST preserve the last valid log prefix and MUST NOT authorize
or project any later record across the failure.

#### Scenario: A forged result names a valid lease
- **WHEN** the result provenance, immutable input identity, changed path, or observed log sequence does not match that lease
- **THEN** Main rejects the result before appending acceptance or changing a projection

#### Scenario: Log append is interrupted
- **WHEN** persistence fails before the next canonical record commits completely
- **THEN** replay returns the prior valid sequence and no partial record changes authority or state

#### Scenario: A diagnostic contains secret-shaped material
- **WHEN** a lease, result, or control event would persist credentials, tokens, or an unbounded diagnostic
- **THEN** validation rejects or safely bounds the record without writing the sensitive value to the log

### Requirement: Routing controls protect a concrete safety floor
A rule MAY block, pause, rotate, authorize, or advance the pipeline only when an
executable check protects live authority, exclusive mutable ownership,
immutable-input integrity, independent acceptance/security evidence, or native
permission/security enforcement. Rules without a named protected failure and
bounded recovery SHALL be advisory or telemetry.

#### Scenario: An unenforced mandatory marker remains in prose
- **WHEN** no executable current-path consumer uses that marker to protect a retained safety floor
- **THEN** the marker cannot route the pipeline and is removed or made advisory

#### Scenario: A numeric observation crosses a threshold
- **WHEN** attempt, correction, continuation, token, tool-call, or elapsed-time data changes
- **THEN** it may trigger diagnostics or handoff preparation but does not change authority or the recovery route

### Requirement: Causal evidence routes recovery
After non-success, Main SHALL preserve valid progress, establish safe mutable
ownership, classify the observable cause, and compare immutable recovery
evidence. Main MAY continue under unchanged authority only when a safe action is
available and its causal identity differs from the failed action. Ordinals MUST
NOT authorize, deny, pause, or close work.

#### Scenario: The cause is repaired inside approved scope
- **WHEN** evidence supports a different safe action and authority, scope, acceptance meaning, and security floor remain unchanged
- **THEN** Main continues without a live correction decision

#### Scenario: The same failed action would repeat
- **WHEN** every known safe action would reproduce the same causal identity
- **THEN** Main pauses with the missing condition and preserves authority, progress, and evidence

#### Scenario: Recovery changes approved meaning
- **WHEN** the proposed action changes intent, scope, acceptance meaning, security authority, or an outward effect
- **THEN** Main obtains the applicable bounded live decision before dispatch

### Requirement: Legacy control state is converted outside the hot path
The current runtime SHALL consume only the v5 control contract. A deterministic
one-shot converter SHALL validate supported v1-v4 state, gates, events,
bindings, findings, and immutable inputs and produce the v5 control log and
projections. It MUST NOT infer missing authority, rewrite historical evidence,
or leave a workspace with mixed writable schemas.

#### Scenario: A valid legacy run resumes
- **WHEN** supported legacy authority and immutable identities validate completely
- **THEN** the converter creates one v5 representation and current execution proceeds without evaluating legacy routing again

#### Scenario: Legacy authority is ambiguous
- **WHEN** historical gate and event records disagree or cannot prove the operator decision
- **THEN** conversion stops before current dispatch and reports the exact authority defect without synthesizing a decision

#### Scenario: One service binding fails legacy validation
- **WHEN** binding validation returns a bounded task-progress, source, repository, snapshot, or overlay error for one service
- **THEN** conversion preserves that exact error and service identity, writes no v5 switch, and does not collapse it into an undifferentiated migration failure

#### Scenario: A verified legacy continuation authorizes repaired state
- **WHEN** the original Gate, continuation certificate identity, repaired aggregate, binding services, repair evidence, and live authority event all verify
- **THEN** conversion preserves the original Gate plus continuation identity and permits current v5 dispatch without rewriting or synthesizing Gate 1

#### Scenario: Rollback encounters an existing v5 workspace
- **WHEN** older compatible software starts after a workspace has switched successfully to v5
- **THEN** it may read or report the v5 state but never overwrites it with a reconstructed v4 representation
