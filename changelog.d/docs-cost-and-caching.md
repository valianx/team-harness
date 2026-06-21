### Added
- `docs/cost-and-caching.md` — operator reference for Claude Code prompt-caching behavior and cost controls: automatic caching and the three cache layers, subagent 5-minute vs main-session 1-hour TTL, operator env-vars (`DISABLE_PROMPT_CACHING*`, `ENABLE_PROMPT_CACHING_1H`, `FORCE_PROMPT_CACHING_5M`), verified pricing multipliers and model-specific minimum cacheable prefixes, statusline cache-performance observation, and the TTL-regression caveat (claude-code issue 46829). All facts verified against Claude Code and Anthropic API documentation.

### Changed
- `CLAUDE.md §6.3`: noted that editing an `agents/*.md` cold-invalidates that agent's cached prefix for every operator until re-warmed, reinforcing the batch-edits-per-release rule.
- `docs/document-hygiene.md`: noted that the CLAUDE.md size cap also bounds the per-session cached-token footprint because CLAUDE.md loads into Claude Code's cached project-context layer at session start.
- `docs/patch-mode.md`: noted that re-dispatching the same agent within the 5-minute subagent cache TTL reuses its warm cache, so selective re-runs should be kept prompt.
