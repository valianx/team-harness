### Added

- Multi-project initiative layer: optional `initiative` field in `00-state.md` that groups separate per-project pipeline runs under a shared `00-overview.md` parent index. Triggered by detect-in-discover + explicit operator confirmation (never auto-created). In obsidian mode the overview lives at `{logs-path}/{logs-subfolder}/{initiative}/00-overview.md`; in local mode at the common parent directory of the sibling repos. Backward-compatible: `initiative: null` (the default) produces today's exact path and behaviour, byte-for-byte. Delivery agent gains Step 11.7 to write-back branch/version/PR/status into the overview row. Generic-root guard prevents misfire under `projects/`, `repos/`, `src/`, etc.

### Changed

- `agents/orchestrator.md`: Step 2 path-resolution gains an `initiative`-conditional branch (no-initiative rows are verbatim current expressions); Phase 0a gains Step 1f create-or-join with read-modify-write one-row-per-project rule; Step 6d-initiative sub-step added to Discover; new `## 00-overview.md Template` section with template, section-ownership map, and no-fork invariant.
- `agents/delivery.md`: new Step 11.7 initiative overview write-back (initiative-gated, best-effort).
- `CLAUDE.md §5`: new initiative-layer bullet; §3 version bumped to 2.59.0.
- `docs/discover-phase.md`: new § 11 Initiative detection sub-section.
- `docs/observability.md`: documents `00-overview.md` as a parent index (not an events file).
