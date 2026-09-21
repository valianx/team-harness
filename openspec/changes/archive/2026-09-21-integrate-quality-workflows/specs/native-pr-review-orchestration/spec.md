## ADDED Requirements

### Requirement: External quality evidence respects the captured review
Main SHALL prepare selected quality dependencies and obtain analyzer evidence from a disposable execution copy derived from the captured review candidate, preserving the frozen snapshot and operator checkout. Evidence SHALL identify its head, relevant base, scope, tool configuration and coverage limits. The coordinator SHALL translate supported candidates into the existing finding and verification process, retain their raw evidence and dispositions, and distinguish defects introduced or aggravated by the PR from pre-existing issues. Read-only specialists SHALL retain their existing authority. External output SHALL NOT create a second review, publication gate or bypass of finding verification.

Preparation in ordinary review-pr SHALL install only the external tool outside the snapshot; it SHALL NOT install the reviewed project's dependencies or execute its code or executable configuration. Static analysis SHALL treat captured source and declarative rules as data. Project-executing architecture analyzers remain available through separately scoped diagnostic work.

#### Scenario: A scanner needs local writable working files
- **WHEN** selected analysis requires caches or other temporary outputs
- **THEN** Main uses the permitted disposable execution area and selected evidence destination without modifying the frozen snapshot or giving mutation authority to reviewers

#### Scenario: A candidate already exists in the captured base
- **WHEN** the analyzer identifies an issue not introduced or aggravated by the PR
- **THEN** the coordinator retains its provenance and disposition but does not publish it as a PR regression

#### Scenario: Evidence belongs to an older candidate
- **WHEN** the captured head or relevant base changes after analysis
- **THEN** Main marks affected evidence stale and renews the analysis needed for the changed identity without silently reusing results for another candidate

#### Scenario: A scanner reports no candidates
- **WHEN** analysis finishes with no matches but some relevant files are unsupported or skipped
- **THEN** the review records the completed scope and limitations without treating the empty result as proof that all review obligations are complete
