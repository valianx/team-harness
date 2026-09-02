## MODIFIED Requirements

### Requirement: A security dimension stops for a live three-way choice

Before publication, the guided lane's executable package producer SHALL classify the completed changed surface against the canonical security-floor categories. A true or unresolved classification MUST stop the lane and present the matching category together with three live options: raise the bar in-lane, take the pipeline, or narrow the scope. The lane MUST NOT absorb the security dimension on its own authority and MUST NOT eject to the pipeline without offering the in-lane option when no hard router applies. If the operator raises the bar in-lane, `security` and `adversary` become mandatory lenses and publication MUST remain blocked until both pass with no blocker; this verification does not require a later explicit review request.

#### Scenario: Implementation reveals a security-sensitive surface
- **WHEN** the completed changed-surface classifier reports a security-floor category
- **THEN** the lane stops before publication and waits for the operator to choose between raising the bar in-lane, the pipeline, and narrowing scope

#### Scenario: The operator raises the bar in-lane
- **WHEN** the operator selects the in-lane option
- **THEN** the producer places `security` and `adversary` in the required lens set, and the ship decision reports not-ready until both return a pass with no blocker

#### Scenario: Publication is attempted before required security lenses pass
- **WHEN** the in-lane security path was selected and either `security` or `adversary` is absent, failed, or blocking
- **THEN** publication remains blocked even when the operator did not separately request verification

#### Scenario: The floor applies and a required lens return is missing
- **WHEN** the ship decision is computed with a required floor lens absent or returning a blocker
- **THEN** it resolves to not-ready and names the missing or blocking lens, never defaulting an absent return to a pass

#### Scenario: The work is multi-repository, multi-specialist, irreversible, multi-task, or operator-absent
- **WHEN** any of those conditions holds alongside the security dimension
- **THEN** the pipeline remains a hard router and the in-lane option is not offered
