## MODIFIED Requirements

### Requirement: Gate 1 offers a single approve that carries autonomy and the ship policy
The Gate-1 presentation SHALL offer exactly one approval option (`1 approve`,
plus `3: detail` edit and `4: reason` reject). It MUST disclose the active
release policy, and approval MUST append one authority event to the canonical
control log containing the consumed presentation nonce, approved intent/scope,
security floor, pinned canonical OpenSpec identity, and `release_policy:
auto-ship`. The presentation SHALL use the compact generated `01-plan.md` for
operator readability and link canonical OpenSpec for detail; the projection
MUST NOT replace or extend the approved semantic source. Any release field
rendered in `00-state.md` SHALL be derived and MUST NOT act as a second
authority record.

#### Scenario: Operator approves a plan
- **WHEN** the operator replies `1` to a Gate-1 presentation that disclosed the auto-ship policy
- **THEN** the pipeline appends the approval event, rebuilds its projection, and proceeds without offering a separate autonomous variant

#### Scenario: Historical state is recovered
- **WHEN** the v5 converter reads a valid persisted `gate1_release: approved-autonomous` and matching legacy release event
- **THEN** it records their equivalent current authority once and never emits that legacy value in new records

#### Scenario: The compact plan is stale
- **WHEN** `01-plan.md` does not bind the current validated OpenSpec identity
- **THEN** Gate 1 remains unreleased until Main regenerates the projection from canonical artifacts

### Requirement: Post-approval execution is autonomous until the draft PR
After Gate-1 approval, the pipeline SHALL run implementation, validation,
causal correction, and delivery through draft-PR creation without requesting
operator input while work remains inside approved intent, scope, acceptance
meaning, and security floor and validation reaches total green. No attempt,
correction, continuation, replacement, or iteration count SHALL limit that
authority.

#### Scenario: Validation finds correctable findings
- **WHEN** findings are correctable in scope and evidence supports a different safe causal action
- **THEN** the pipeline corrects, refreshes stale evidence, and continues without pausing

#### Scenario: Validation is totally green
- **WHEN** validation completes with no open blocking findings
- **THEN** Gate 3 executes mechanically, cites the Gate-1 authority event, and publishes the draft PR

### Requirement: Pauses come only from the closed exception list
The pipeline SHALL pause between Gate 1 and the draft PR only when authority is
absent for a semantic, scope, acceptance, security, or outward-effect change;
when mutable ownership cannot be made safe; when immutable identity or integrity
cannot be restored mechanically; when an external prerequisite is unavailable;
or when every known safe strategy repeats the same causal identity. Ordinal
exhaustion MUST NOT be an exception.

#### Scenario: A non-correctable concern survives validation
- **WHEN** validation ends with a concern that requires a semantic or authority change
- **THEN** the pipeline pauses with the bounded decision and evidence instead of shipping

#### Scenario: Recovery has no different safe action
- **WHEN** every known safe action would reproduce the same failed causal identity
- **THEN** the pipeline pauses with the missing condition and preserves authority, progress, and evidence

#### Scenario: A convenience pause is proposed
- **WHEN** any flow, skill, or agent proposes an intermediate confirmation outside the exception list
- **THEN** the contract rejects it and adds no gate, round approval, or approval currency

### Requirement: Recovery understands auto-ship and never releases
Recovery SHALL derive Gate-3 clearance from a valid control-log event with
decision `ship` or `auto-ship` and MUST NOT execute an auto-release itself. It
resumes at the next action derived from the log. Legacy release fields are
readable only by the converter and are never sufficient without matching
historical authority.

#### Scenario: A run is interrupted after mechanical Gate 3
- **WHEN** recovery finds a valid `auto-ship` event with delivery incomplete
- **THEN** it resumes delivery mechanics without another release decision or duplicate release event

#### Scenario: A projected release field disagrees
- **WHEN** `00-state.md` disagrees with the valid control log
- **THEN** recovery rebuilds the projection and does not infer or revoke authority from the cache
