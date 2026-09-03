## MODIFIED Requirements

### Requirement: A persistent findings ledger is the correction loop's memory
The workspace SHALL carry `reviews/findings-ledger.md` as a rebuildable view
projected only by Main from accepted result events and live dispositions in the
control log. It SHALL expose one row per lens and finding ID pair — a finding ID two lenses
report occupies two rows — with class, severity,
disposition (`fixed | accepted-residual | open | rejected-with-rationale`),
causal identity, operator ruling, and the originating lens, derived from the
role of the lease under which the result was accepted and never from the
envelope's own text. The decision ledger's `disposition` record SHALL carry the
same `lens`. Verifiers read the view and never edit it.

Every reasoning-lens result envelope SHALL carry stable structured finding ID,
closed-vocabulary severity (`critical | high | medium | low | info`), class,
and, for later evidence, `new_in_delta`, `pre_existing_missed`, or `reopened`.
Those fields MUST NOT be inferred from prose. Correction dispatch SHALL receive
the current finding package and immutable evidence identities, not prior
reviewer narrative.

#### Scenario: A verifier returns findings
- **WHEN** Main accepts a valid result envelope containing structured findings
- **THEN** it appends the result event and projects the finding values into the ledger view

#### Scenario: A corrected Freeze is validated
- **WHEN** a later reasoning lens reports against a changed frozen identity
- **THEN** it classifies every finding relative to the prior accepted result events

#### Scenario: A waived finding is re-raised without new evidence
- **WHEN** an accepted residual or operator-ruled finding returns without a changed root cause
- **THEN** the prior disposition stands and no correction package is created

#### Scenario: A correction round is dispatched
- **WHEN** the coordinator dispatches any re-review after a correction
- **THEN** the dispatch context includes the ledger, and the verifier classifies every reported finding as `new_in_delta`, `pre_existing_missed`, or `reopened`

#### Scenario: Two lenses report the same defect
- **WHEN** `qa` and `security` each return a finding for one defect under separate leases
- **THEN** the ledger shows each finding with its own lens, and the baseline's exclusive-defect count credits neither lens for that defect
