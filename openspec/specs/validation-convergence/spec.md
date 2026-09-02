# validation-convergence Specification

## Purpose
Make first-pass review exhaustiveness a contract and give the correction loop memory and a termination rule, so correction rounds converge instead of dripping findable findings one packet at a time. Review scope stays full; nothing here bounds a verifier.

## Requirements

### Requirement: Reasoning lenses sweep finding classes exhaustively in the first pass
When a reasoning verifier (qa, adversary, security) forms any finding, it SHALL enumerate every same-class instance within its declared scope in the same pass — one finding per root cause covering all sites. One instance of a class is a sweep obligation, not a report. Sweep obligations are a floor, never a ceiling: anything found beyond a known class MUST still be reported. Every reasoning-lens report SHALL end with a Coverage Declaration: files/areas read, areas not examined, known-unswept classes.

#### Scenario: An instance of an enumerable class is found
- **WHEN** a verifier finds one hardened-invocation flag missing on one call site
- **THEN** the same pass enumerates every call site in scope missing any flag of that class, as one root-cause finding covering all sites

#### Scenario: A later round reports on unchanged surface in a flagged class
- **WHEN** a round-N verifier reports a finding on surface unchanged since the first fan, in a class the first fan already flagged an instance of
- **THEN** the finding is classified `pre_existing_missed` — a first-pass coverage defect, not "genuinely new evidence" — and the coordinator cites the first fan's Coverage Declaration when recording the classification

### Requirement: A persistent findings ledger is the correction loop's memory
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

#### Scenario: A correction round is dispatched
- **WHEN** the coordinator dispatches any re-review after a correction
- **THEN** the dispatch context includes the ledger, and the verifier classifies every reported finding as `new_in_delta`, `pre_existing_missed`, or `reopened`

### Requirement: Ratchet termination ends the loop on severity, not patience
The ratchet SHALL govern the complete reasoning-lens finding set and require the
deterministic quality conjunctions green. Zero open critical/high findings and
a passing impact-required security result SHALL be convergence-complete. Remaining
sub-floor findings SHALL become projected residuals and PR-body concerns and
MUST NOT create another correction package. Blocking findings remain blocking
regardless of how many corrections occurred.

An in-scope critical/high security finding or incomplete security coverage
remains correctable. A blocking finding MAY trigger correction under existing
Gate-1 authority only when a different safe causal action exists. Counts and
labels such as `round`, `max-3`, or `N/3` MUST NOT select the route.

#### Scenario: Only sub-floor findings remain
- **WHEN** validation reports only medium-and-below findings and deterministic conjunctions are green
- **THEN** validation completes, auto-ship proceeds, and the findings ship as projected residual concerns

#### Scenario: A correctable security blocker survives
- **WHEN** validation reports a correctable critical/high security finding or incomplete changed-surface coverage
- **THEN** validation remains failed and Main applies causal recovery without consulting a count

#### Scenario: The same correction strategy already failed
- **WHEN** a blocking finding remains but the proposed closure repeats the same causal identity
- **THEN** no redispatch occurs until evidence supports a different safe action

#### Scenario: A sub-floor correctable security finding remains
- **WHEN** a re-review round's only open finding is a medium-severity security finding correctable in scope that is neither a `broke-it` nor an incomplete-changed-control condition
- **THEN** it records as a ledger residual and a PR-body concern, and no further correction round opens

#### Scenario: A correctable `broke-it` survives the round
- **WHEN** a re-review round reports a `broke-it` correctable within the approved scope, or an incomplete-changed-control condition on a sensitive pipeline
- **THEN** validation fails exactly as today, the finding is never a ledger residual, and the round is not convergence-complete at any severity label

#### Scenario: A new critical appears in the corrected delta
- **WHEN** a re-review round reports an open critical finding classified `new_in_delta`
- **THEN** a correction round opens exactly as today

### Requirement: Convergence is measurable in the event trace
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

#### Scenario: An iteration begins after a re-review
- **WHEN** the coordinator emits `iteration.start` following a correction fan
- **THEN** the event includes the three classification counts as one `convergence_counts` object, making per-run convergence trajectories derivable from the trace

### Requirement: Validation lenses are derived from risk and changed evidence
Every new Freeze SHALL receive one fresh independent verifier that evaluates the
canonical OpenSpec scenarios against the candidate-bound quality receipt and
changed behavior. This ordinary verifier SHALL own the combined evidence audit
and semantic acceptance verdict; a second QA agent MUST NOT duplicate that
ordinary verdict.

A separate tester SHALL run only when the independent-test predicate matches bug
reproduction, migration/data safety, public contract or compatibility change,
security-control change, stale independently-authored evidence, or an explicit
operator request. Main SHALL derive security impact from the frozen candidate
through the canonical type-agnostic classifier over changed paths and every
touched line, including removals. Its closed receipt SHALL be the only input to
validation lens selection. Complete negative evidence yields false; binary,
unscannable, malformed, missing, or otherwise unresolved evidence yields
unknown. Security SHALL run fresh for true or unknown impact; otherwise its
prior result MAY carry only by exact audited identity. `qa-plan` SHALL NOT
exist as a dispatchable role, plan-review lens, or acceptance-definition owner.

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
- **WHEN** the frozen changed-surface classifier is ambiguous or unresolved
- **THEN** a fresh security lens is required before validation can close

#### Scenario: An obsolete qa-plan route remains
- **WHEN** a skill, roster, projection, test, or document exposes `qa-plan` as a current role
- **THEN** validation of the shipped agent surface fails until that current route is removed or explicitly historical
