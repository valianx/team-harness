## Purpose

One Gate-1 approval carries bounded autonomous correction and the ship decision; Gate 3 executes mechanically. Eliminates the approve/approve-autonomous duality and every intermediate human touchpoint between Gate 1 and the draft PR.

## ADDED Requirements

### Requirement: Gate 1 offers a single approve that carries autonomy and the ship policy
The Gate-1 presentation SHALL offer exactly one approval option (`1 approve`, plus `3: detail` edit and `4: reason` reject). The presentation MUST disclose the active release policy, and an approval MUST record `release_policy: auto-ship` in the Gate-1 dual record alongside the existing nonce and state fields.

#### Scenario: Operator approves a plan
- **WHEN** the operator replies `1` to a Gate-1 presentation that disclosed the auto-ship policy
- **THEN** the pipeline records the approval with `release_policy: auto-ship` and proceeds without offering a separate autonomous variant

#### Scenario: Historical state is recovered
- **WHEN** recovery reads a persisted `gate1_release: approved-autonomous` from an older run
- **THEN** it is accepted as equivalent to `approved` and never re-emitted in new records

### Requirement: Post-approval execution is autonomous until the draft PR
After Gate-1 approval, the pipeline SHALL run implementation, validation, bounded correction (max-3 on the frozen result), and delivery through draft-PR creation without requesting operator input, provided validation reaches total green.

#### Scenario: Validation finds correctable findings
- **WHEN** validation returns findings correctable in scope and the correction budget is not exhausted
- **THEN** the pipeline corrects, revalidates the delta, and continues without pausing

#### Scenario: Validation is totally green
- **WHEN** validation completes with no open blocking findings
- **THEN** Gate 3 executes mechanically, citing the Gate-1 record, and publishes the draft PR

### Requirement: Pauses come only from the closed exception list
The pipeline SHALL pause between Gate 1 and the draft PR only for the closed exception classes: the design changed (structural contradiction, scope expansion), a security obligation changed or a surviving broke-it exists, or infrastructure failed (including correction-budget exhaustion). The exception list always takes precedence over auto-ship.

#### Scenario: A non-correctable concern survives validation
- **WHEN** validation ends with a concern that is not correctable in scope
- **THEN** the pipeline pauses loudly with the concern instead of shipping

#### Scenario: A convenience pause is proposed
- **WHEN** any flow, skill, or agent proposes an intermediate confirmation not on the exception list
- **THEN** the contract rejects it; no new gates or approval currencies are added

### Requirement: Recovery understands auto-ship and never releases
Recovery SHALL treat `{ship, auto-ship}` as cleared `gate3_release` values and MUST NOT execute an auto-release itself; it resumes the pipeline at the recorded next action.

#### Scenario: A run is interrupted after mechanical Gate 3
- **WHEN** recovery finds `gate3_release: auto-ship` with delivery incomplete
- **THEN** it resumes delivery mechanics without re-asking for a release decision and without re-releasing

### Requirement: Outward floors are unchanged
`dev-guard` SHALL continue to gate outward actions; the recorded auto-ship policy extends only to the benign push and `gh pr create` for the pipeline's own branch. Merge, force-push, and default-branch pushes remain `ask`.

#### Scenario: Auto-ship publishes the draft PR
- **WHEN** delivery mechanics push the feature branch and create the draft PR under a recorded auto-ship policy
- **THEN** those two actions proceed under the recorded authorization while every other outward action still requires live approval
