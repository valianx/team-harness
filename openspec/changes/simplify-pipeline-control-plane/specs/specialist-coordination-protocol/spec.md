## Purpose

Defines how Main and bounded specialists exchange work and results with minimal
round trips while preserving one coordinator authority and exclusive mutable
ownership for every canonical worktree.

## ADDED Requirements

### Requirement: Every writer uses one capability lease
A writing specialist SHALL operate under one closed capability lease that binds
its logical role, live authority, semantic scope, canonical worktree, writable
paths, immutable inputs, context identity, and lifecycle state. Main SHALL be
the only lease issuer and SHALL prevent overlapping committing ownership in one
canonical worktree. Read-only specialists MAY inspect overlapping immutable
inputs without acquiring mutable ownership.

#### Scenario: Two writers share one worktree
- **WHEN** both specialists can mutate files or Git metadata in the same canonical worktree
- **THEN** Main serializes their ownership even when their planned file lists are disjoint

#### Scenario: Two validators inspect one Freeze
- **WHEN** QA and security need overlapping immutable evidence and neither can mutate it
- **THEN** they may run concurrently without receiving mutable ownership

#### Scenario: A lease contains an unsafe mutable path
- **WHEN** a writable path is outside the canonical worktree, resolves through a symlink, overlaps another committing owner, or is absent from approved scope
- **THEN** dispatch fails before the specialist can mutate files or Git metadata

### Requirement: Valid same-agent work continues without a new handshake
Main SHALL reuse the existing specialist session and capability lease when role,
authority, semantic scope, worktree, immutable inputs, context identity, and
exclusive ownership remain valid. It SHALL send only changed evidence. Main
SHALL revoke or replace the lease when an identity changes, ownership transfers,
the task closes, context integrity is unknown, or an independent validation
lens is required. Numeric counts alone MUST NOT force rotation.

#### Scenario: An implementer receives in-scope correction evidence
- **WHEN** the prior implementer remains valid and the correction changes none of the lease identities
- **THEN** Main continues the same session under the same lease with only delta evidence

#### Scenario: QA evaluates a changed Freeze
- **WHEN** correction changes the frozen candidate identity
- **THEN** Main starts a fresh QA lens bound to that candidate

#### Scenario: Context integrity is lost
- **WHEN** retained specialist context cannot be verified
- **THEN** Main revokes the lease and starts a fresh role from immutable inputs without asking the operator to restart the pipeline

### Requirement: Specialists return one result envelope through existing transport
Every specialist SHALL return one closed, versioned result envelope through the
runtime's existing terminal-result channel. It SHALL bind the capability lease
and include status, changed and evidence paths, artifact references, commits
when applicable, structured findings, closure evidence, bounded diagnostics,
next-prerequisite facts, and observed control-log position. Main alone SHALL
validate the result, append its acceptance to the control log, and update
projections and routing. No role-owned result inbox or receipt handshake SHALL
be required.

#### Scenario: A specialist completes work
- **WHEN** its terminal result envelope validates against the active lease and immutable inputs
- **THEN** Main verifies the actual Git diff, dirty state, and contiguous commits from the lease baseline, accepts it once, appends the result event, and derives the next action

#### Scenario: A specialist omits an out-of-scope mutation from its result
- **WHEN** the worktree diff contains a path absent from `changed_paths` or outside the lease
- **THEN** Main rejects the result before appending acceptance, even when the envelope's self-reported paths are valid

#### Scenario: Terminal chat delivery is interrupted
- **WHEN** the runtime exposes durable terminal status for the same specialist session
- **THEN** Main consumes that status without rerunning completed work or requiring a second result channel

#### Scenario: A duplicate result is observed
- **WHEN** Main sees the same validated result identity again
- **THEN** no projection or routing transition is applied twice

#### Scenario: A result reports unbounded or secret diagnostics
- **WHEN** terminal output includes credential-shaped content or exceeds the result envelope's bounded diagnostic contract
- **THEN** the envelope is rejected or safely redacted and cannot be accepted into the control log as evidence

### Requirement: Main remains the only authority and transition owner
Specialists MAY report immutable artifact identities and dependency facts, but
MUST NOT grant scope, transfer ownership, choose a phase, approve a gate, alter
authority, write coordinator projections, or direct another specialist to
mutate. Main SHALL remain the only operator-facing coordinator and transition
applier.
The immutable specialist helper bundle SHALL omit Main's control-log and
projection mutators and expose only non-authoritative lease/capsule validation
and result construction primitives.

#### Scenario: A specialist discovers an immutable dependency
- **WHEN** the dependency is already inside the lease and can be identified by hash and path
- **THEN** it reports that fact without creating another authority exchange

#### Scenario: A dependency requires scope expansion
- **WHEN** satisfying it would add mutable paths or change approved behavior
- **THEN** the specialist returns the need to Main and no peer message grants the expansion
