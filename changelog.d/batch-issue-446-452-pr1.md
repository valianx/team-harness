### Added
- CI runtime locks (#448): the PR/main verification workflow now provisions Node and Bun, sets `TH_REQUIRE_RUNTIMES=1` so missing-runtime test skips fail the run instead of silently passing, and adds a dedicated dist-freshness job that rebuilds `hooks/ts/dist/*.cjs` and diffs against the committed bundles.
- Deterministic `subagent.start` TS hook (#452): emits a start-side breadcrumb paired with the existing `phase.end` stop-side event; `/th:pipelines` now renders in-flight lanes and `/th:trace` renders parallel-region fan-out instead of leaving the reader dead.
- `tag-sync.yml` workflow (#450): idempotent, minimal-permission post-merge tag step that dispatches `release.yml` via `workflow_dispatch`, documented in `/th:release` and the delivery agent as the canonical release-event trigger.
- Effective `model`/`effort` fields on `phase.end` status blocks (#451): all 26 leaf agents report the model that actually ran the phase; `/th:trace --cost` now classifies by a `event.model` → frontmatter → static-list priority chain instead of a 2-agent hardcode. `apply-review` disposition is wired to the disposition ledger, and a new session model-override subsection documents scope and its exclusion from the config-override whitelist.
- Dual-target (Bash|TS) functional test suites for the 6 security floors plus session-start/language-user-prompt, exercising both hook implementations from one spec.

### Changed
- `hooks/ts/dist/*.cjs` bundles are now tracked in git (removed from `.gitignore`) and marked `linguist-generated`; the CC plugin distributes the built dist tree directly with no build step at install time.
- `english_learning` is decoupled from `language: en` in both the Bash and TS `session-start` hook bodies (and the regenerated TS dist): skills no longer force-write `language: en` when English-learning mode is enabled, making immersion mode opt-in and independent of response language.

### Fixed
- Reconciled 5 real Bash↔TS behavioral divergences surfaced by the dual-target spike (interim Bash-canonical, tracked for the PR-2 TS cutover): `policy-block` secret-pattern set and malformed-payload contract, `prepublish-guard` bump-floor sub-stage, `worktree-guard` fallback behavior, `checkpoint-guard` nested `tool_input` handling (the one divergence ratified as a Bash-side production fix), and the `hookSpecificOutput` envelope on Claude Code hook entries.
