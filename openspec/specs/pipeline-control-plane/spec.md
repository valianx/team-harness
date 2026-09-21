# pipeline-control-plane Specification

## Purpose
Defines the minimum executable control plane needed to preserve live authority,
exclusive writes, immutable inputs, trustworthy results, and recoverable state
without turning observations or compatibility details into routing controls.

## Requirements

### Requirement: The control plane uses exactly two primitives
Current pipelines MUST coordinate through native runtime tasks and ordinary reports. The former lease and envelope primitives MAY be read for compatibility and MUST NOT be prerequisites for new work.

#### Scenario: Native assignment
- **WHEN** approved pipeline work is ready
- **THEN** Main assigns an objective, scope, workspace, ownership and relevant references without issuing a TH capability lease.

#### Scenario: Main dispatches approved work
- **WHEN** a specialist can perform work under existing authority
- **THEN** Main sends a bounded native assignment with scope, ownership, workspace and relevant inputs, and receives an ordinary useful report.

#### Scenario: A third coordination object is proposed
- **WHEN** the proposed object independently authorizes work, owns mutable scope, reports completion, or advances state
- **THEN** Main reuses existing tasks and notes rather than adding another authorization object or redundant completion schema.

### Requirement: One append-only log owns control state
Current pipelines MUST use the shared plan, tasks and evidence to retain progress. Native runtime permissions govern execution; a TH log MUST NOT grant or withhold permission.

#### Scenario: Existing authorization
- **WHEN** the operator already approved unchanged work
- **THEN** Main continues without a control event, nonce or duplicate approval.

#### Scenario: Gate 1 is approved
- **WHEN** the operator answers the current Gate-1 presentation with an allowed approval value
- **THEN** Main continues the approved work without creating a nonce, authority event or duplicate permission record.

#### Scenario: A projection is stale
- **WHEN** a projection disagrees with a valid control log
- **THEN** Main reconciles the useful summary against trustworthy current tasks and evidence; no historical log grants current permission.

#### Scenario: An operator plan disagrees with canonical OpenSpec
- **WHEN** generated `01-plan.md` names a different semantic value or source identity
- **THEN** Main corrects the summary or resolves a real intent discrepancy without treating either artifact as an execution token.

#### Scenario: Required authority is absent
- **WHEN** the control log lacks a valid event for a protected action
- **THEN** absence of a log event does not block existing user authorization; Main asks only if actual required user intent is missing.

### Requirement: Control records are bounded, canonical, and provenance-safe
Compatibility readers MUST preserve validation of existing records and distinguish corrupt or incomplete history from verified evidence. New work MUST NOT require a new control journal.

#### Scenario: Historical evidence
- **WHEN** an old log has an invalid suffix
- **THEN** the reader reports its limits and Main uses verified task evidence without fabricating a prior result.

#### Scenario: A forged result names a valid lease
- **WHEN** the result provenance, immutable input identity, changed path, or observed log sequence does not match that lease
- **THEN** the historical validator rejects the mismatched record; Main does not use unverified claims as evidence or require a new lease for current work.

#### Scenario: Log append is interrupted
- **WHEN** persistence fails before the next canonical record commits completely
- **THEN** the legacy reader returns the valid prefix and reports the incomplete suffix without inventing a completed result.

#### Scenario: A diagnostic contains secret-shaped material
- **WHEN** a lease, result, or control event would persist credentials, tokens, or an unbounded diagnostic
- **THEN** retained compatibility validation rejects or bounds unsafe persistence; current reports also avoid exposing credentials.

### Requirement: Routing controls protect a concrete safety floor
Workflow selection MUST follow the operator's objective and chosen working method. Security impact and review findings inform coordination and MUST NOT automatically force a lane or extra TH authorization.

#### Scenario: Sensitive scoped work
- **WHEN** approved spec work touches a security-related file
- **THEN** Main selects useful checks and continues under native permissions without forcing pipeline activation.

#### Scenario: An unenforced mandatory marker remains in prose
- **WHEN** no executable current-path consumer uses that marker to protect a retained safety floor
- **THEN** the marker cannot route the pipeline and is removed or made advisory

#### Scenario: A numeric observation crosses a threshold
- **WHEN** attempt, correction, continuation, token, tool-call, or elapsed-time data changes
- **THEN** it may trigger diagnostics or handoff preparation but does not change authority or the recovery route

### Requirement: Causal evidence routes recovery
Recovery MUST use the observed failure and preserve valid progress. Counts, time or absent legacy bookkeeping MUST NOT independently stop authorized work.

#### Scenario: Recoverable failure
- **WHEN** a tool or specialist fails
- **THEN** Main diagnoses the cause, repairs or changes approach, and reports a genuine unresolved dependency.

#### Scenario: The cause is repaired inside approved scope
- **WHEN** evidence supports a different safe action and authority, scope, acceptance meaning, and security floor remain unchanged
- **THEN** Main verifies the repair and continues using existing authorization.

#### Scenario: The same failed action would repeat
- **WHEN** operational diagnosis finds no verifiable authorized repair and every known safe action would reproduce the same causal identity
- **THEN** Main reports the concrete missing condition and attempted remedies, preserving progress.

#### Scenario: Recovery changes approved meaning
- **WHEN** the proposed action changes intent, scope, acceptance meaning, security authority, or an outward effect
- **THEN** Main obtains any missing decision about the changed scope or effect before acting.

#### Scenario: A missing library or incorrect path interrupts direct work
- **WHEN** Main can restore a declared prerequisite in a permitted isolated environment or resolve the correct installed path without changing the deliverable
- **THEN** Main performs and verifies the repair, then resumes without asking the operator to approve the operational fix

#### Scenario: A malformed contract interrupts dispatch
- **WHEN** canonical inputs establish the missing formatting or derived coordinate without inventing a decision-bearing fact
- **THEN** Main supplies clear missing context from canonical sources and resumes without inventing an authority fact.

### Requirement: Legacy control state is converted outside the hot path
Existing workspaces MUST remain readable without forced conversion or administrative closure. Compatibility helpers MAY validate historical state but MUST NOT be the authorization path for current work.

#### Scenario: Workspace without a log
- **WHEN** a retained workspace has plans and evidence but no control log
- **THEN** Main resumes the approved objective from those artifacts and records uncertainty only where evidence is missing.

#### Scenario: A valid legacy run resumes
- **WHEN** supported legacy authority and immutable identities validate completely
- **THEN** Main reuses verified progress and the selected workspace without converting control schemas before continuing.

#### Scenario: Legacy authority is ambiguous
- **WHEN** historical gate and event records disagree or cannot prove the operator decision
- **THEN** Main distinguishes uncertain historical evidence from current user authorization and asks only for a genuinely missing decision.

#### Scenario: One service binding fails legacy validation
- **WHEN** binding validation returns a bounded task-progress, source, repository, snapshot, or overlay error for one service
- **THEN** Main preserves the precise service error and recovers trustworthy sources without a mandatory v5 conversion.

#### Scenario: A verified legacy continuation authorizes repaired state
- **WHEN** the original Gate, continuation certificate identity, repaired aggregate, binding services, repair evidence, and live authority event all verify
- **THEN** Main reuses verified progress under existing user authorization; a continuation certificate is not required for new work.

#### Scenario: Rollback encounters an existing v5 workspace
- **WHEN** older compatible software starts after a workspace has switched successfully to v5
- **THEN** historical inspection preserves its records rather than rewriting them to a different schema.
