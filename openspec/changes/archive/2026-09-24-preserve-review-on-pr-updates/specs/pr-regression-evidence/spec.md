## MODIFIED Requirements

### Requirement: Reproduction evidence is bound to the compared inputs

Evidence SHALL identify the review run, compared commits, probe content and command, per-revision execution outcome, bounded diagnostic output and execution limits. The evidence consumer SHALL reject mismatched or modified records. A later PR update SHALL preserve reproduction evidence for its original compared inputs; that evidence SHALL NOT be attributed to a different head, base, probe or command. The coordinator SHALL renew only evidence needed to establish an affected finding's current applicability or disclose its historical scope, retaining otherwise reusable code-review findings.

#### Scenario: Evidence belongs to an earlier PR head
- **WHEN** a comparison record names a different head from the current reviewed identity
- **THEN** it remains evidence for its recorded inputs but cannot alone confirm behavior at the new identity

#### Scenario: The probe or its result changes after capture
- **WHEN** evidence integrity or the shared probe identity fails validation
- **THEN** the record is rejected and the review discloses unavailable reproduction evidence
