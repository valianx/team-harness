# gate-single-approve-autonomy Specification

## Purpose
One Gate-1 approval carries bounded autonomous correction and the ship decision; Gate 3 executes mechanically. Eliminates the approve/approve-autonomous duality and every intermediate human touchpoint between Gate 1 and the draft PR.

## Requirements

### Requirement: Gate 1 offers a single approve that carries autonomy and the ship policy
The Gate-1 presentation SHALL offer exactly one approval outcome, plus edit and reject outcomes, using compact stable numbered choices with plain-language labels. A displayed number SHALL be a shortcut rather than an exclusive command grammar: an unambiguous live reply semantically equivalent to approve or continue SHALL select approval, and a natural-language edit or rejection that supplies its necessary detail SHALL select that outcome without requiring a `3:` or `4:` prefix. A reply that is ambiguous or omits detail necessary for edit or rejection MUST NOT release the gate and SHALL receive a concise clarification. The presentation MUST disclose the active release policy, and approval MUST append one authority event to the canonical control log containing the consumed presentation nonce, approved intent/scope, security floor, pinned canonical OpenSpec identity, and `release_policy: auto-ship`. Semantic interpretation MUST remain attributable to that current presentation and nonce; exact wording alone MUST NOT create authority. The presentation SHALL use the compact generated `01-plan.md` for operator readability and link canonical OpenSpec for detail; the projection MUST NOT replace or extend the approved semantic source. Any release field rendered in `00-state.md` SHALL be derived and MUST NOT act as a second authority record.

#### Scenario: Operator approves a plan
- **WHEN** the operator replies `1` to a Gate-1 presentation that disclosed the auto-ship policy
- **THEN** the pipeline appends the approval event, rebuilds its projection, and proceeds without offering a separate autonomous variant

#### Scenario: Operator approves a plan in natural language
- **WHEN** the operator gives an unambiguous live reply equivalent to approving or continuing the current Gate-1 presentation
- **THEN** the pipeline records the same approval authority as the displayed numeric shortcut without requiring an exact phrase

#### Scenario: Operator supplies an amendment directly
- **WHEN** the operator replies with an unambiguous change request that includes what must be adjusted
- **THEN** the gate records the edit outcome and supplied detail without requiring a `3:` prefix and does not release approval

#### Scenario: Operator gives an incomplete or ambiguous decision
- **WHEN** the live reply neither selects one outcome unambiguously nor provides detail required by the selected non-approval outcome
- **THEN** the gate remains unreleased and asks only for the unresolved choice or detail

#### Scenario: Historical state is recovered
- **WHEN** the v5 converter reads a valid persisted `gate1_release: approved-autonomous` and matching legacy release event
- **THEN** it records their equivalent current authority once and never emits that legacy value in new records

#### Scenario: The compact plan is stale
- **WHEN** `01-plan.md` does not bind the current validated OpenSpec identity
- **THEN** Gate 1 remains unreleased until Main regenerates the projection from canonical artifacts

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

### Requirement: The deterministic guard covers only the minimal outward floor
`dev-guard` SHALL cover only the irreversible publication boundary: pushes to the default branch, force/tag/non-benign pushes, and PR merge (`gh pr merge`, `gh api` merge endpoints) remain `ask`; the single clean non-default-branch push on `origin` remains `allow`. Every other outward write (`gh pr create/review/comment`, issue writes, non-merge API mutations, MCP tool writes) SHALL be uncovered by the hook — no decision — and governed by the host runtime's permission model. The `autogate` config mechanism SHALL be removed.

#### Scenario: Auto-ship publishes the draft PR
- **WHEN** delivery mechanics push the feature branch and create the draft PR under a recorded auto-ship policy
- **THEN** the clean feature-branch push resolves to `allow` and `gh pr create` receives no hook decision, while merge and default-branch pushes still require live approval

#### Scenario: A stale autogate key exists in config
- **WHEN** `~/.claude/.team-harness.json` still carries `autogate.pr_create: true`
- **THEN** the hook never reads it and `gh pr create` produces no decision regardless of its value
