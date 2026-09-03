## Why

`/th:review-pr` is the most used Team Harness mode. Its snapshot, publication, and sizing invariants match current practice, but two things do not. First, no step verifies a finding before the operator sees it: the reviewer's draft goes straight to preview, while Claude Code Review, the `code-review` plugin, CodeRabbit, and Codex all validate candidates against the code before posting. Second, roughly 40% of the skill's 4,300 words describe how the coordinator repairs its own reviewers — a `classify-agent-failure` helper with eight flags, a `retry-contract` path, and per-dispatch Codex TOML validation — machinery no comparable tool carries and that the repository's own threat model ("honest-developer disposition") says it does not need.

The verification gap costs the operator time reading unsupported blockers. The repair machinery costs every reader of the skill and every helper change.

## What Changes

- Add a verification pass: after the canonical draft exists, one read-only `pr-review-verifier` (opus) checks every Blocking finding against the frozen worktree and returns `confirmed` with a `file:line` citation or `unconfirmed` with the reason. Unconfirmed blockers demote to Suggestion prefixed `(unverified)`; a blocker the verifier shows to be false is dropped and recorded in the disposition ledger. The `Lenses:` line gains `verified k/n`. Verification never adds findings.
- Let `.team-harness/review-policy.md` set the verification bar (`blocking-only` default, `all`, `off`) and the suggestion cap.
- Shorten the reviewer path rule to its boundary: reviewers read only supplied coordinates and verified worktree leaves. A return that breaks its contract is `absent ({reason})` and forces `COMMENT`; there is no coordinator retry. The `classify-agent-failure` subcommand is removed from `review_context.py`.
- Bring `skills/review-pr/SKILL.md` under 500 lines by moving the remaining mechanical steps into helper subcommands it names.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-independence`: verification before preview, policy-set verification bar, boundary-only path rule, skill budget.

## Non-Goals

- No change to snapshot capture, identity binding, freshness comparison, approval anchoring, or atomic publication.
- No second general reviewer, no convergence loop, no change to lens selection.
- No local test execution of the PR's code. Verification reads; it does not run.
- No change to `inline-reviewer` or `/th:verify`; pipeline-side specialist failures follow the v5 failure table in `agents/ref-pipeline.md § Failures`.

## Impact

`skills/review-pr/SKILL.md`, `skills/review-pr/scripts/review_context.py`, a new `agents/pr-review-verifier.md`, `agents/reviewer.md`, `agents/pr-review-qa.md`, `agents/pr-review-security.md`, `agents/reviewer-consolidator.md`, the Codex and opencode projections of the four review agents, `runtime/schema/codex-agents.json`, `tests/test_review_context.py`, and `docs/`. Depends on archiving `address-pr-review-recovery-review-findings` first so the removed requirement is edited at its current text; verified against 3.20.14, where the review skill and helper are unchanged. Audit source: vault note `work-logs/team-harness/2026-09-02_contract-audit/00-contract-audit.md`.
