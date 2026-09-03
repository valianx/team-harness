# Tasks

## 1. Prerequisite

- [x] 1.1 Archive `address-pr-review-recovery-review-findings` so `openspec/specs/pr-review-independence/spec.md` holds the current text of the path-mistake requirement before this change modifies it.

## 2. Verifier agent

- [x] 2.1 Author `agents/pr-review-verifier.md` (opus; `Read`, `Glob`, `Grep`; under 600 words) with the input coordinates, the per-finding `confirmed | unconfirmed | refuted` return with `file:line` evidence, and the echoed reviewed identity.
- [x] 2.2 Register the agent in `runtime/schema/codex-agents.json` as read-only and regenerate the Codex TOML, opencode asset, and roster projections.

## 3. Skill flow

- [x] 3.1 Insert the verification step in `skills/review-pr/SKILL.md` between the canonical draft and Preview: dispatch the verifier with the inline JSON, diff, worktree, and identity; apply demotion and drop rules; write the ledger when no consolidator ran.
- [x] 3.2 Add `verified k/n` to the coordinator-owned `Lenses:` line, including the absent-verifier and `verification off (policy)` forms.
- [x] 3.3 Parse `verification` and `max_suggestions` from the fenced `yaml` block of `.team-harness/review-policy.md` in `review_context.py` (`policy` subcommand) with the documented defaults.
- [x] 3.4 Replace the read-scope and failed-read recovery sections with the boundary-only rule: unreadable, incomplete, or mis-echoed returns are `absent ({reason})` and force `COMMENT`.
- [x] 3.5 Move helper resolution, snapshot-lifecycle warnings, and Codex agent-set checks into a `preflight` subcommand; the skill names it once. Bring `SKILL.md` under 500 lines.
- [x] 3.6 Remove the `review-pr` exemption from the retired-phrase lint map introduced by `right-size-pipeline-contracts`, and verify Check 12 passes on the rewritten skill.

## 4. Helper and tests

- [x] 4.1 Delete `classify-agent-failure` from `review_context.py` and its cases from `tests/test_review_context.py`.
- [x] 4.2 Add tests: verifier demotion and drop application to inline JSON; `Lenses:` line forms; policy parsing defaults and `off`; `preflight` outputs.
- [x] 4.3 Update `agents/reviewer.md`, `agents/pr-review-qa.md`, `agents/pr-review-security.md`, and `agents/reviewer-consolidator.md` to the boundary-only read rule and the ledger source; regenerate their projections and run the projection suite.

## 5. Close

- [x] 5.1 Update `docs/` review documentation and `skills/README.md` for the verification step and the policy keys.
- [x] 5.2 Write `changelog.d/verify-review-findings.md`; bump the internal-distribution version sites.
- [x] 5.3 Run `bash tests/run-all.sh` and `openspec validate verify-review-findings --strict`.
