### Fixed
- `agents/orchestrator.md` Step 6a intent table now contains a deterministic PR-review routing row: "review this PR / revisa el PR #N / @th:orchestrator review PR" routes to the `/th:review-pr` skill flow (read-only, auto-route). Eliminates non-deterministic routing for conversational PR-review requests.
- `agents/orchestrator.md` `:143/:150` wording reconciled: `reviewer` remains standalone and never bare-dispatched; the canonical pipeline for a PR review is the `/th:review-pr` skill flow.
- `skills/review-pr/SKILL.md` Phase 1 now fetches issue-level + line-level PR comments before the reviewer panel runs, passing them as `PR Comments:` to both single-reviewer and multi-reviewer dispatch payloads. Graceful degradation when `gh`/token unavailable.
- `agents/_shared/gh-fallback.md` new "Tier A — read PR comments" section covering issue-level and line-level fetch with full fallback chain.
- `agents/reviewer.md` Phase 0 parses `PR Comments:` context and does NOT re-raise points already resolved in the thread. No-Publish Invariant unchanged.

### Changed
- Plugin version bumped 2.64.0 → 2.65.0.
