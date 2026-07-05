### Added

- Gated local permission provisioning for the obsidian workspace and cross-repo work surfaces (#462): `/th:setup` § 3a offers to write `Edit`/`Write` rules (double-slash `//` anchor) plus an `additionalDirectories` entry for the obsidian vault to `~/.claude/settings.json`; the orchestrator's Phase 0a Step 1g re-offers the same obsidian rules on existing installs and offers scoped rules for declared cross-repo work-surface paths to `.claude/settings.local.json`. Every write is gated by an explicit Y/n, merge-write-whole-document, and reported; already-provisioned rules are a silent pass-through; outward-action rules (push/PR/API) are never touched. See `docs/permission-provisioning.md`.

### Fixed

- Phase 3.6 conditional re-run guard now watches `02-implementation.md` in addition to `01-plan.md` and `reviews/04-validation.md` (#464): a post-3.75 build/lint fix that updates the implementation record — the acceptance-checker's grounding read — now re-triggers the acceptance-checker instead of leaving a stale drift verdict in place.
