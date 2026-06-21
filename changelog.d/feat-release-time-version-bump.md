### Added
- `/th:release` skill: on-demand release step that aggregates all pending `changelog.d/` fragments and `version.d/` markers, derives the SemVer bump level, bumps all three synchronized version sites once, assembles the CHANGELOG, and pushes a `release/vX.Y.Z` branch (#405)
- Delivery `release-mode`: `release-mode: true` task signal re-enables Step 9 version bump; adds Step 9-R bump-level aggregation from fragments and markers, empties `version.d/` on release (#405)
- `version.d/` marker convention: feature delivery may write a `version.d/{slug}.bump` marker for fragment-less internal bumps so the release step can include them in the bump-level max (#405)

### Changed
- Orchestrator now passes `skip-version: true` as the DEFAULT for all feature (non-release) deliveries; `release-mode` is the only path that re-enables the version bump (#405)
- `hooks/prepublish-guard.sh` Check 1 reconciled: feature pushes now require a `changelog.d/` fragment or `version.d/` marker and are denied for stray version bumps; release pushes (`release/vX.Y.Z` branch) must have all three version sites bumped and matching the branch version; over-bump hard-deny relocated to the release path (#405)
- `CLAUDE.md §6.3` per-PR bump mandate reframed as release-time deferral, consistent with the `changelog.d/` precedent; `version.d/` marker convention documented (#405)
- `docs/cost-and-caching.md` cache-invalidation note formalizes batch-per-release as the recommended pattern (#405)
