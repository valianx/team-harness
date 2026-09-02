## MODIFIED Requirements

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
