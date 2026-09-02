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

### Requirement: The deterministic guard covers only the minimal outward floor
`dev-guard` SHALL cover only the irreversible publication boundary: pushes to the default branch, force/tag/non-benign pushes, and PR merge (`gh pr merge`, `gh api` merge endpoints) remain `ask`; the single clean non-default-branch push on `origin` remains `allow`. Every other outward write (`gh pr create/review/comment`, issue writes, non-merge API mutations, MCP tool writes) SHALL be uncovered by the hook — no decision — and governed by the host runtime's permission model. The `autogate` config mechanism SHALL be removed.

#### Scenario: Auto-ship publishes the draft PR
- **WHEN** delivery mechanics push the feature branch and create the draft PR under a recorded auto-ship policy
- **THEN** the clean feature-branch push resolves to `allow` and `gh pr create` receives no hook decision, while merge and default-branch pushes still require live approval

#### Scenario: A stale autogate key exists in config
- **WHEN** `~/.claude/.team-harness.json` still carries `autogate.pr_create: true`
- **THEN** the hook never reads it and `gh pr create` produces no decision regardless of its value
