## MODIFIED Requirements

### Requirement: Blocking findings are verified against the frozen worktree before preview

After the canonical draft exists and before Preview, the coordinator SHALL dispatch one read-only `pr-review-verifier` with the inline findings, the captured diff, the frozen worktree, and the reviewed identity. For each Blocking finding the verifier SHALL return `confirmed` with a `file:line` citation and one sentence of evidence, `unconfirmed` with the reason, or `refuted` with the evidence that the cited behavior does not exist at the reviewed identity, and SHALL echo the reviewed identity. An unconfirmed Blocking SHALL be demoted to a Suggestion whose body begins with `(unverified)`. A Blocking whose cited behavior does not exist at the reviewed identity SHALL be dropped and recorded in the disposition ledger as `dropped: verifier — <reason>`. Verification SHALL NOT add findings. The coordinator SHALL append `verified k/n` to the `Lenses:` line; an absent verifier SHALL appear as `verified 0/n (verifier absent)` and force `COMMENT`.

When regression investigation was selected, the coordinator SHALL additionally supply the optional validated reproduction evidence and its identity as read-only input. The verifier SHALL inspect that evidence alongside code to assess the finding's causality and intended behavior, without executing the probe. Missing, inconclusive or rejected reproduction evidence SHALL NOT refute a code-proven defect or confirm a speculative one. A failing probe SHALL NOT automatically set severity or a publication verdict.

#### Scenario: A blocker cites behavior the code does not have
- **WHEN** the verifier finds that the cited path and line at the reviewed identity do not exhibit the claimed defect
- **THEN** the finding is dropped, the ledger records the verifier's reason, and the preview shows the remaining findings with `verified` counted on the coverage line

#### Scenario: The verifier cannot confirm a blocker
- **WHEN** the verifier returns `unconfirmed` for a Blocking finding
- **THEN** the finding is published as a Suggestion prefixed `(unverified)` and counted as unverified on the coverage line

#### Scenario: The verifier does not return
- **WHEN** the verifier dispatch produces no valid return
- **THEN** the coverage line reads `verified 0/n (verifier absent)`, the recommendation is `COMMENT`, and the normal preview and approval flow continues

#### Scenario: A reproduction supports a finding
- **WHEN** a validated comparison reproduces the claimed head failure and code demonstrates an unintended change to required behavior
- **THEN** the verifier can confirm the finding using both evidence sources while remaining read-only

#### Scenario: A reproduction records an environmental failure
- **WHEN** the comparison is inconclusive because the test environment is unavailable
- **THEN** the verifier evaluates the code evidence independently and preserves the reproduction limit
