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

### Requirement: Blocking findings are verified against the frozen worktree before preview
After the canonical draft exists and before Preview, the coordinator SHALL dispatch one read-only `pr-review-verifier` with the inline findings, the captured diff, the frozen worktree, and the reviewed identity. For each Blocking finding the verifier SHALL return `confirmed` with a `file:line` citation and one sentence of evidence, `unconfirmed` with the reason, or `refuted` with the evidence that the cited behavior does not exist at the reviewed identity, and SHALL echo the reviewed identity. An unconfirmed Blocking SHALL be demoted to a Suggestion whose body begins with `(unverified)`. A Blocking whose cited behavior does not exist at the reviewed identity SHALL be dropped and recorded in the disposition ledger as `dropped: verifier — <reason>`. Verification SHALL NOT add findings. The coordinator SHALL append `verified k/n` to the `Lenses:` line; an absent verifier SHALL appear as `verified 0/n (verifier absent)` and force `COMMENT`.

#### Scenario: A blocker cites behavior the code does not have
- **WHEN** the verifier finds that the cited path and line at the reviewed identity do not exhibit the claimed defect
- **THEN** the finding is dropped, the ledger records the verifier's reason, and the preview shows the remaining findings with `verified` counted on the coverage line

#### Scenario: The verifier cannot confirm a blocker
- **WHEN** the verifier returns `unconfirmed` for a Blocking finding
- **THEN** the finding is published as a Suggestion prefixed `(unverified)` and counted as unverified on the coverage line

#### Scenario: The verifier does not return
- **WHEN** the verifier dispatch produces no valid return
- **THEN** the coverage line reads `verified 0/n (verifier absent)`, the recommendation is `COMMENT`, and the normal preview and approval flow continues

### Requirement: The review policy sets the verification bar
`.team-harness/review-policy.md` MAY carry a fenced `yaml` block with `verification: blocking-only | all | off` and `max_suggestions: <n>`. Defaults SHALL be `blocking-only` and `5`. `all` SHALL verify Suggestions as well; `off` SHALL skip the verifier and SHALL print `verification off (policy)` on the coverage line.

#### Scenario: A repository turns verification off
- **WHEN** the policy declares `verification: off`
- **THEN** no verifier is dispatched and the published `Lenses:` line states `verification off (policy)`

### Requirement: The review skill fits the skill budget
`skills/review-pr/SKILL.md` SHALL be under 500 lines. Mechanical steps that do not describe the operator-facing flow SHALL live in named `review_context.py` subcommands.

#### Scenario: Lint measures the skill
- **WHEN** `/th:lint` measures `skills/review-pr/SKILL.md`
- **THEN** the line count is under 500 or the check fails naming the file

### Requirement: Reviewers read only supplied coordinates and verified worktree leaves
Reviewer agents SHALL read only coordinator-supplied artifacts and project leaves proven before content access to be existing, non-symlink regular files whose resolved paths remain inside the frozen worktree. A deleted changed-file path SHALL NOT authorize a head-worktree read; reviewers SHALL obtain deleted-file evidence from the captured diff. Instruction-source markers, semantic-source markers, conventional filenames, unresolved imports, and optional coordinates set to `none` SHALL NOT be opened as project context.

A reviewer return that omits a required field, echoes an identity different from the dispatched one, or reports a supplied artifact as unreadable SHALL be recorded as `absent ({reason})` on the coverage line and SHALL force a `COMMENT` recommendation. The coordinator SHALL NOT rebuild the packet, classify the mistake, or dispatch a correction. A missing or mismatched snapshot identity, an integrity or freshness failure, or an unreadable frozen worktree SHALL fail closed as before. Preview, live publish approval, approved-draft hash, and publish-time freshness are unchanged.

#### Scenario: A reviewer infers an absent project path
- **WHEN** a reviewer attempts to read a path the coordinator did not supply and the frozen worktree does not contain
- **THEN** the read is skipped as an absent optional path and the review continues on the supplied coordinates

#### Scenario: A reviewer omits its identity echo
- **WHEN** a lens return lacks the reviewed SHA or context hash
- **THEN** the lens is recorded `absent (missing identity echo)`, successful lenses complete, and the recommendation is `COMMENT`

#### Scenario: Snapshot identity or freshness fails
- **WHEN** the returned identity differs or snapshot integrity or freshness no longer matches
- **THEN** the review fails closed without preview or publication
