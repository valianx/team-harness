## Purpose

The PR-review flow's structural independence (immutable snapshot, coordinate-only dispatch, isolated parallel lenses) is preserved; its five bias zones are closed: consolidator paths/evidence, QA coverage honesty, reviewer anchoring, lens-library drift, publish integrity.

## ADDED Requirements

### Requirement: Consolidator reads real drafts and adjudicates on code
The consolidator contract SHALL reference draft paths under `workspaces/pr-review-{number}/` (the `.claude/pr-review-*` pattern is removed) and SHALL receive the frozen worktree coordinate read-only, so exploitability/fix adjudication is evidence-based rather than prose-based.

#### Scenario: Consolidation runs on a conforming review
- **WHEN** the consolidator loads lens drafts and adjudicates a specialist finding
- **THEN** it reads drafts from the review workspace and cites the frozen worktree, never rejecting real drafts by path pattern

### Requirement: Consolidation keeps a reconciled ledger
The consolidator's status block SHALL enumerate findings received per lens and their disposition (preserved, demoted, dropped, with one-line reasons); the coordinator SHALL reconcile source-vs-consolidated counts before preview; and the published body SHALL name which lenses ran and with what status.

#### Scenario: A blocking finding is demoted
- **WHEN** the consolidator demotes or drops any lens finding
- **THEN** the disposition and reason appear in the ledger and the coordinator's count reconciliation passes only if every finding is accounted for

#### Scenario: A lens did not run
- **WHEN** a selected lens is absent after its bounded retry
- **THEN** the published body discloses the absent lens; an APPROVE with silent lens absence is impossible

### Requirement: QA lens cannot pass by silence
The QA lens schema SHALL report coverage — `acs_evaluated`, non-verifiable ACs, and `lens_status: full|limited|absent` — with an absent or author-controlled-only oracle yielding `limited`, never a clean pass; severity assignment follows a declared rule; a missing coordinate blocks, matching the security lens.

#### Scenario: The frozen snapshot contains no acceptance criteria
- **WHEN** the QA lens finds no operator-provenance oracle
- **THEN** it returns `lens_status: limited` with the reason, and the preview shows the coverage limit instead of a clean pass

### Requirement: The reviewer analyzes code before conversation
The reviewer contract SHALL sequence code analysis and a draft verdict BEFORE reading the PR conversation (thread reading serves only dedup/supersede afterwards); the dispatch payload SHALL stay coordinate-only (no Title/Author); CI status reaches the reviewer only after its draft verdict.

#### Scenario: A prior review approved the PR
- **WHEN** the thread contains prior formal verdicts
- **THEN** the reviewer has already formed its draft verdict from code before reading them

### Requirement: The lens library matches the reviewer contract
Each review lens SHALL declare its severity mapping onto the reviewer's scale, reference only sections that exist, follow the declared precedence rule (the reviewer contract wins), and fold findings only into body sections the body contract allows.

#### Scenario: A lens grades on its own scale
- **WHEN** a lens table assigns a three-level severity
- **THEN** the declared mapping resolves it to the reviewer's two-level scale deterministically

### Requirement: Preview and publish are integral
The published body's verdict line SHALL match the chosen event (divergence forces a rewrite or re-preview); the approved draft SHALL be hash-anchored at approval and verified at publish; `--auto-publish` SHALL name its event and freshness bound; the preview presents evidence before recommendation.

#### Scenario: The operator overrides the event
- **WHEN** the operator selects a different event than recommended
- **THEN** the body's verdict line is rewritten to match (or re-previewed) before publish

#### Scenario: The draft changes between preview and publish
- **WHEN** the publish-time hash differs from the approved hash
- **THEN** publish fails closed and re-previews
