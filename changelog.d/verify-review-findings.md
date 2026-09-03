### Added

- `pr-review-verifier`: a read-only opus agent that confirms, leaves unconfirmed, or refutes every Blocking finding against the frozen worktree before the review preview. Unconfirmed blockers publish as `(unverified)` suggestions; refuted blockers are dropped into the disposition ledger; the `Lenses:` line carries `verified k/n`. Registered across Claude Code, Codex, and opencode.
- `.team-harness/review-policy.md` may set `verification: blocking-only | all | off` and `max_suggestions`; `review_context.py policy` reads them.
- `review_context.py apply-verification`, `lenses-line`, and `preflight` subcommands carry the mechanical steps the skill used to narrate.

### Changed

- `skills/review-pr/SKILL.md` describes the operator-facing flow in under 500 lines. Reviewer path mistakes are no longer classified or retried: a return that breaks its contract is `absent ({reason})` and forces `COMMENT`.
- The four review agents state the read boundary and the no-correction rule; the consolidator ledger gains `verifier` entries.

### Removed

- `review_context.py classify-agent-failure` and its tests; the `review-pr` exemption in the retired-phrase lint map.
