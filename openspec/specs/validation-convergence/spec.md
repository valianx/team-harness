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
The workspace SHALL carry `reviews/findings-ledger.md`: append-only, written only by the coordinator (from fan status blocks and operator dispositions), one row per finding ID with class, severity, disposition (`fixed | accepted-residual | open | rejected-with-rationale`), and operator rulings including intentional waivers. Verifiers read the ledger; they never edit it. Prior-round review findings survive in the ledger even where the per-round report file is overwritten.

Every reasoning-lens status block SHALL carry the ledger's row material structurally, so the coordinator transcribes rather than infers: each returned finding entry carries a stable `id`, a `severity` from the closed vocabulary `critical | high | medium | low | info`, and its `class`, and a re-review entry additionally carries its `classification`. Severity, class, and classification SHALL NOT be read out of report prose — the same `id` denotes the same finding across rounds, which is what makes `reopened` detectable.

#### Scenario: A verifier returns findings
- **WHEN** a reasoning lens returns any finding in its status block
- **THEN** the entry carries a stable id, a closed-vocabulary severity, and its class, and the coordinator appends those values to the ledger verbatim

#### Scenario: A correction round is dispatched
- **WHEN** the coordinator dispatches any re-review after a correction
- **THEN** the dispatch context includes the ledger, and the verifier classifies every reported finding as `new_in_delta`, `pre_existing_missed`, or `reopened`

#### Scenario: A waived finding is re-raised without new evidence
- **WHEN** a verifier reports a finding whose ledger entry is `accepted-residual` or operator-ruled, without new evidence of a different root cause
- **THEN** the prior disposition stands, the ledger entry is cited, and no correction round opens for it

### Requirement: Ratchet termination ends the loop on severity, not patience
The ratchet extends the existing severity floor by citation; it does not restate it. It governs the reasoning-lens finding set only: convergence-complete additionally requires the deterministic conjunctions green (build/lint and `code_hygiene: pass`, which remains a gate conjunction in this change). A re-review round that reports zero open critical/high findings and neither of the two floor conditions named below SHALL be convergence-complete: the combined verdict proceeds as green for mechanical Gate 3, auto-ship executes citing the Gate-1 record, and all remaining sub-floor findings — including a correctable sub-floor security finding that is not one of those conditions — are recorded as residuals in the ledger and surfaced as concerns in the PR body. Ledger residuals SHALL NOT trigger the correctable-must-correct rule, SHALL NOT count as exception-pause concerns at Gate 3, and never authorize a further correction round. Open critical/high findings SHALL open a correction round regardless of classification; the derived security floor and the closed exception list are unchanged.

Two named security conditions are floor conditions by definition and are never sub-floor: a `broke-it` correctable within the approved scope, and a `could-not-break` carrying `incomplete_on_changed_control: true` on a sensitive pipeline. Each SHALL remain a validation failure whatever severity label it carries, keep its standing in the Gate-3 closed exception list, and never be recorded as a ledger residual. The residual path covers only findings below the severity floor that are neither of those two conditions.

#### Scenario: Only sub-floor findings remain
- **WHEN** a re-review round reports only medium-and-below findings on unchanged surface and the deterministic conjunctions are green
- **THEN** validation is convergence-complete, auto-ship proceeds citing the Gate-1 record, and the findings ship as PR-body concerns with ledger residual entries

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
Every `iteration.start` event SHALL carry the counts of `new_in_delta`, `pre_existing_missed`, and `reopened` findings from the round that triggered it. The counts travel as one conditional `convergence_counts` field holding exactly those three integer keys, declared in the canonical event schema next to the existing correction fields; a triggering round that produced no reasoning-lens findings records zeros rather than omitting the field.

#### Scenario: An iteration begins after a re-review
- **WHEN** the coordinator emits `iteration.start` following a correction fan
- **THEN** the event includes the three classification counts as one `convergence_counts` object, making per-run convergence trajectories derivable from the trace
