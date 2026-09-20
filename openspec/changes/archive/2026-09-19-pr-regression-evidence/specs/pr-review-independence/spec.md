## MODIFIED Requirements

### Requirement: Blocking findings are verified against the frozen worktree before preview
Subject to the existing repository verification policy, proposed Blocking findings SHALL receive independent read-only verification against the captured diff, frozen worktree and reviewed identity before preview. The verifier SHALL return `confirmed`, `unconfirmed` or `refuted` with cited evidence or an explicit limitation and echo the reviewed identity. It SHALL NOT add findings or execute reproduction probes. Its classification SHALL be advisory: Main SHALL decide each final disposition from the evidence, recording any disagreement and its basis instead of automatically mapping a label to severity or deletion. An unresolved hypothesis SHALL NOT be presented as a proven blocker, and uncertainty or missing evidence SHALL NOT be presented as a clean approval.

When regression investigation was selected, the coordinator SHALL supply validated reproduction evidence and its identity as optional read-only input. The verifier SHALL assess that evidence alongside code for causality and intended behavior. Missing, inconclusive or rejected reproduction evidence SHALL NOT refute a code-proven defect or confirm a speculative one; a failing probe SHALL NOT determine severity or verdict automatically.

Coverage SHALL retain honest `verified k/n` accounting. An absent verifier SHALL be disclosed as `verified 0/n (verifier absent)`, preserving the non-approving COMMENT fallback and ordinary preview/publication flow. Explicit policy `verification: off` SHALL retain its existing meaning and disclosure. A conflicting result MAY prompt bounded coordinator-directed investigation at the same immutable identity; it SHALL NOT trigger an automatic full review loop.

#### Scenario: A blocker cites behavior the code does not have
- **WHEN** the verifier supplies code evidence refuting the claimed behavior
- **THEN** Main evaluates that evidence, drops the unsupported claim or records specific counterevidence for a different disposition, and preserves the original report and reason

#### Scenario: The verifier cannot confirm a blocker
- **WHEN** the verifier returns `unconfirmed`
- **THEN** Main resolves or discloses the uncertainty from available evidence without automatically demoting the finding or presenting it as verified

#### Scenario: The verifier does not return
- **WHEN** independent verification produces no valid result
- **THEN** coverage reports the absent verifier, the recommendation remains COMMENT, and the ordinary preview and approval flow continues

#### Scenario: A reproduction supports a finding
- **WHEN** validated comparison evidence and the code demonstrate an unintended change to required behavior
- **THEN** the verifier can confirm the finding from both evidence sources while remaining read-only, and Main decides its disposition

#### Scenario: A reproduction records an environmental failure
- **WHEN** comparison evidence is inconclusive because its test environment is unavailable
- **THEN** verification evaluates code evidence independently and preserves the reproduction limitation
