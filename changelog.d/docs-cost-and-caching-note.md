### Added
- `docs/cost-and-caching.md` — operator reference for Claude Code prompt-caching behavior and cost controls (1-hour TTL opt-in, per-model disable flags, hit-rate observation via `/cost`, pricing reference, and TTL regression awareness for issue #46829).

### Changed
- `CLAUDE.md` §6.3: noted that editing an `agents/*.md` cold-invalidates that agent's cached prefix for every operator until re-warmed, reinforcing the batch-per-release rule.
- `docs/document-hygiene.md`: noted that the CLAUDE.md size cap also bounds the per-session cached-token footprint because CLAUDE.md loads into Claude Code's cached project-context layer at session start.
- `docs/patch-mode.md`: noted that re-dispatching the same agent within the 5-minute subagent cache TTL reuses its warm cache, so selective re-runs should be kept prompt.
