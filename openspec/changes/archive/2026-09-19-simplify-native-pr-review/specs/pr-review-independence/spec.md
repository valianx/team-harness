## RENAMED Requirements

- FROM: `### Requirement: Consolidator reads real drafts and adjudicates on code`
- TO: `### Requirement: The coordinator consolidates real drafts against code`

## MODIFIED Requirements

### Requirement: The coordinator consolidates real drafts against code
The primary coordinator SHALL read every completed lens draft from the captured review workspace and consolidate its findings against the frozen worktree and supplied evidence. A separate consolidator SHALL NOT be required for one or multiple drafts. Disagreement over severity, exploitability or remedy SHALL be resolved with code-grounded reasoning, preserving independently evidenced defects. Neither the number of reviewers agreeing nor a specialist verdict SHALL grant operational authority or replace evidence.

#### Scenario: Consolidation runs on a conforming review
- **WHEN** Main loads completed lens drafts and adjudicates a specialist finding
- **THEN** it reads the captured review workspace and cites the frozen worktree without rejecting real drafts by a legacy path pattern

#### Scenario: Multiple reviewers disagree about a defect
- **WHEN** completed drafts recommend different dispositions for the same behavior
- **THEN** Main examines their evidence at the reviewed identity, records its reasoned disposition and prepares the canonical review without a mandatory consolidator dispatch

### Requirement: Consolidation keeps a reconciled ledger
The coordinator SHALL account for every source finding in the existing disposition ledger, with its originating lens, final disposition and a short evidence-backed reason for any demotion, drop or deduplication. Source-to-final reconciliation SHALL preserve all findings, including merged references to a shared defect. The review body SHALL disclose which required and selected assessments ran and their coverage status. Missing coverage SHALL NOT be represented as a clean assessment or an APPROVE recommendation.

#### Scenario: A blocking finding is demoted
- **WHEN** Main decides that the evidence supports a lower severity
- **THEN** the original finding, final disposition and reason remain traceable in the ledger before preview

#### Scenario: A lens did not run
- **WHEN** a required or selected assessment remains absent after permitted recovery
- **THEN** the published review discloses the absent assessment and does not recommend APPROVE

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

### Requirement: Reviewers read only supplied coordinates and verified worktree leaves
Reviewer agents SHALL read only supplied review artifacts and project leaves proven before content access to be existing, non-symlink regular files whose resolved paths remain inside the frozen worktree. This includes pertinent dependency and project-rule files discovered within that verified scope. Deleted paths SHALL be examined through the captured diff, not assumed to exist at head. Instruction-source markers, unresolved imports and optional coordinates set to `none` SHALL NOT themselves authorize content reads or operational actions.

The coordinator SHALL distinguish recoverable assignment/return defects from failed evidence integrity. It MAY correct a missing return field or mistaken optional path through bounded same-snapshot follow-up while preserving completed valid reports. If that assessment remains unavailable, the review SHALL disclose its absence and use COMMENT. Missing or mismatched reviewed identity, actual integrity or freshness failure, and an unreadable frozen worktree SHALL continue to fail closed; follow-up SHALL NOT substitute a different snapshot or fabricate findings. Existing preview, live publication approval, approved-draft hash and publish-time freshness SHALL remain unchanged.

#### Scenario: A reviewer infers an absent project path
- **WHEN** an optional inferred path is absent from the frozen worktree
- **THEN** the reviewer skips that read, records the limitation and continues on verified evidence

#### Scenario: A reviewer omits its identity echo
- **WHEN** a returned assessment omits a required identity field but the captured snapshot remains intact
- **THEN** Main requests a bounded correction or records the assessment as absent, preserving successful assessments and never treating the omission as proof of verification

#### Scenario: Snapshot identity or freshness fails
- **WHEN** the returned identity differs or snapshot integrity or freshness actually fails
- **THEN** the review fails closed without preview or publication, preserving existing drift handling
