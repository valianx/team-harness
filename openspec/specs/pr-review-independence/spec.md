# pr-review-independence Specification

## Purpose
The PR-review flow's structural independence (immutable snapshot, coordinate-only dispatch, isolated parallel lenses) is preserved; its five bias zones are closed: consolidator paths/evidence, QA coverage honesty, reviewer anchoring, lens-library drift, publish integrity.

## Requirements

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

### Requirement: Frozen review artifacts outlive every specialist
The coordinator SHALL own the successful snapshot lifecycle independently of
the shell or PTY process that captures and materializes it. Capture,
materialization, promotion, and readiness commands MUST NOT register cleanup on
`EXIT` or another process-lifetime hook. The frozen worktree and required
artifacts SHALL remain available through every specialist terminal result,
retry, consolidation read, and post-dispatch integrity comparison. Cleanup
SHALL run explicitly only after all dispatched reviewers have joined or after
an explicit terminal cancel; unexpected coordinator loss SHALL preserve the
workspace for recovery rather than delete evidence still in use.

#### Scenario: Materialization shell ends before reviewers
- **WHEN** the command process that materialized the snapshot exits or yields for longer than 30 seconds while a reviewer is still reading
- **THEN** the review workspace remains intact and cleanup does not run until that reviewer and every other dispatched lens reaches a terminal result

### Requirement: Reviewer path mistakes recover without weakening snapshot safety
Reviewer agents SHALL read only coordinator-supplied artifacts and project leaves proven to exist inside the frozen worktree before content access. Instruction-source markers, semantic-source markers, conventional filenames, unresolved imports, and optional coordinates set to `none` SHALL NOT be opened as project context. A nonexistent path outside the supplied and verified set SHALL be classified as an agent path-scope mistake rather than a filesystem transport failure.

The same coordinator-owned correction SHALL apply to mechanically detectable reviewer contract defects, including claiming that a supplied coordinate is missing, omitting required return fields, selecting an unauthorized persistence path, rejecting the runtime's declared read transport, or reading an unverified inferred path. The coordinator SHALL rebuild the packet from captured coordinates, identify the violated rule, and retry once on the same immutable snapshot without an operator decision or gate. Contract correction SHALL NOT authorize snapshot rebuild, identity substitution, finding fabrication, or publication.

The recovery classification SHALL be executable and deterministic. It SHALL validate every required dispatch artifact and required directory, the frozen worktree, the exact failed path when available, the contract signal, the returned snapshot identity, snapshot integrity and freshness, reviewer role, and attempt number. It SHALL emit only `retry-contract`, `continue-comment`, or `fail-closed`; an incomplete or malformed classification SHALL fail closed.

After snapshot-integrity and freshness checks pass, a first mechanically detectable contract defect SHALL produce `retry-contract`. A repeated specialist-only contract defect SHALL produce `continue-comment`, mark that lens `absent after retry (agent contract)`, and force a `COMMENT` recommendation while allowing successful lenses to complete. A repeated general-review or consolidation defect that leaves no trustworthy canonical draft SHALL fail closed.

A missing or mismatched snapshot identity, freshness or integrity failure, unreadable required supplied artifact, unreadable frozen worktree, unreadable verified-existing project leaf, path outside the permitted review roots, or otherwise unclassifiable failure SHALL fail closed. Recovery SHALL preserve the existing preview, operator publish approval, approved-draft hash, and publish-time freshness requirements.

#### Scenario: Security reviewer infers an absent project path
- **WHEN** the security reviewer attempts to read a nonexistent project path that the coordinator did not supply and the frozen worktree did not verify
- **THEN** the coordinator preserves the immutable snapshot, automatically retries once with that path forbidden, and does not ask the operator to repair filesystem access

#### Scenario: Reviewer omits a supplied identity echo
- **WHEN** a reviewer receives the reviewed SHA and context hash but omits one from its return while the snapshot remains identical and fresh
- **THEN** the coordinator automatically reissues a corrected packet on the same snapshot without an operator decision

#### Scenario: Specialist repeats a contract defect
- **WHEN** a specialist repeats a mechanically detectable contract defect after its automatic retry
- **THEN** the coordinator marks the lens absent, continues with successful lenses, forces `COMMENT`, and retains the normal publication approval gate

#### Scenario: Canonical reviewer repeats a contract defect
- **WHEN** the general reviewer or consolidator repeats a contract defect and no trustworthy canonical draft remains
- **THEN** the coordinator fails closed without fabricating findings or publishing a review

#### Scenario: Required captured diff is unreadable
- **WHEN** the coordinator-supplied diff cannot actually be read
- **THEN** the review fails closed without previewing, approving, or publishing a draft

#### Scenario: Snapshot identity or freshness fails
- **WHEN** the returned snapshot identity differs or snapshot integrity or freshness no longer matches
- **THEN** the review fails closed and the coordinator does not relabel the failure as an agent contract defect

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
