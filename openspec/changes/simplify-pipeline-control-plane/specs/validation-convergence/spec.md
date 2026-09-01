## MODIFIED Requirements

### Requirement: A persistent findings ledger is the correction flow's memory
The workspace SHALL carry `reviews/findings-ledger.md` as a rebuildable view
projected only by Main from accepted result events and live dispositions in the
control log. It SHALL expose one row per finding ID with class, severity,
disposition (`fixed | accepted-residual | open | rejected-with-rationale`),
causal identity, and operator ruling. Verifiers read the view and never edit it.

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

### Requirement: Ratchet termination ends correction on evidence, not patience
The ratchet SHALL govern the complete reasoning-lens finding set and require the
deterministic quality conjunctions green. Zero open critical/high findings and
neither named security-floor condition SHALL be convergence-complete. Remaining
sub-floor findings SHALL become projected residuals and PR-body concerns and
MUST NOT create another correction package. Blocking findings remain blocking
regardless of how many corrections occurred.

The named security conditions remain a correctable `broke-it` inside approved
scope and a `could-not-break` with `incomplete_on_changed_control: true` on a
sensitive pipeline. A blocking finding MAY trigger correction under existing
Gate-1 authority only when a different safe causal action exists. Counts and
labels such as `round`, `max-3`, or `N/3` MUST NOT select the route.

#### Scenario: Only sub-floor findings remain
- **WHEN** validation reports only medium-and-below findings and deterministic conjunctions are green
- **THEN** validation completes, auto-ship proceeds, and the findings ship as projected residual concerns

#### Scenario: A correctable broke-it survives
- **WHEN** validation reports a correctable `broke-it` or incomplete changed-control condition
- **THEN** validation remains failed and Main applies causal recovery without consulting a count

#### Scenario: The same correction strategy already failed
- **WHEN** a blocking finding remains but the proposed closure repeats the same causal identity
- **THEN** no redispatch occurs until evidence supports a different safe action

### Requirement: Convergence is measurable without controlling the route
Accepted result and recovery events SHALL contain stable finding
classifications, causal identities, and observed ordinals sufficient to derive
convergence trajectories. These values SHALL be observations only and MUST NOT
be duplicated as authority or required mutable state.

#### Scenario: Correction work begins
- **WHEN** Main continues work for a correction package
- **THEN** the control event cites the capability lease, causal identity, package identity, and classification counts without granting additional authority

#### Scenario: A projection counter is wrong
- **WHEN** a displayed counter disagrees with accepted control-log events
- **THEN** it is rebuilt or omitted and the recovery route remains unchanged

## ADDED Requirements

### Requirement: Validation lenses are derived from risk and changed evidence
Every new Freeze SHALL receive one fresh independent verifier that evaluates the
canonical OpenSpec scenarios against the candidate-bound quality receipt and
changed behavior. This ordinary verifier SHALL own the combined evidence audit
and semantic acceptance verdict; a second QA agent MUST NOT duplicate that
ordinary verdict.

A separate tester SHALL run only when the independent-test predicate matches bug
reproduction, migration/data safety, public contract or compatibility change,
security-control change, stale independently-authored evidence, or an explicit
operator request. Security SHALL run fresh only when a security finding,
protected invariant, security-relevant constraint, attack-surface path, or
unknown impact changed; otherwise its prior result MAY carry by exact audited
identity. `qa-plan` SHALL NOT exist as a dispatchable role, plan-review lens, or
acceptance-definition owner.

#### Scenario: Ordinary candidate reaches Freeze
- **WHEN** quality is green and no dedicated tester or security predicate matches
- **THEN** one fresh verifier evaluates evidence and canonical scenarios without another QA, tester, or plan-review dispatch

#### Scenario: Independent test authorship is required
- **WHEN** the recorded risk predicate requires a separate tester
- **THEN** tester evidence is produced or refreshed independently and the final verifier consumes its immutable receipt

#### Scenario: A correction changes one test dependency
- **WHEN** one evidence row becomes stale and other declared dependencies remain byte-identical
- **THEN** the risk-required tester refreshes that evidence, the independent verifier validates the new Freeze, and unchanged evidence is carried by identity

#### Scenario: Security impact is unknown
- **WHEN** the final delta cannot prove its security-relevant paths unchanged
- **THEN** a fresh security lens is required before validation can close

#### Scenario: An obsolete qa-plan route remains
- **WHEN** a skill, roster, projection, test, or document exposes `qa-plan` as a current role
- **THEN** validation of the shipped agent surface fails until that current route is removed or explicitly historical
