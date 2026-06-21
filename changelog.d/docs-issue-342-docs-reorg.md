### Changed
- Finish #342 residual rewording: 5 remaining "orchestrator agent" phrasings in `skills/report-issue/SKILL.md`, `docs/troubleshooting.md`, `docs/how-it-works.md`, `docs/plugin-migration.md`, and `docs/integration.md` (ex-INTEGRATION.md) now name the orchestrator role/flow, not a dispatch-target agent.
- Move `INTEGRATION.md` to `docs/integration.md`; update `README.md` link accordingly.
- Move `UPSTREAM_ISSUE_DRAFT.md` to `docs/upstream-issue-draft.md`.
- Reconcile CONTRIBUTING duplication: merge maintainer-unique sections (gh-fallback smoke test, agent/pipeline changes, release process) from `docs/contributing.md` into `CONTRIBUTING.md`; remove `docs/contributing.md`; redirect its 5 inbound refs.
- Patch version bump to 2.116.1 across `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `CLAUDE.md §3` (the canonical plugin version; required because `skills/` content changed).
