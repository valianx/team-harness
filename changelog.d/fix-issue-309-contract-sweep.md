### Fixed

- `acceptance-checker`: clarified that `fail` verdict routes back to implementer/architect while `concerns` is advisory — the previous "non-binding by design" phrasing incorrectly implied `fail` is also non-binding.
- `docs/observability.md`: `kg_write` invariant now excludes content-gate skips (`reason: "ok"`, `detail: "content-gate: …"`) from the `succeeded` count — content-gate skips were incorrectly counted as successful writes.
- `skills/review-pr/SKILL.md`: workspace-detection block now uses current pipeline filenames (`01-plan.md`, `02-implementation.md`) — legacy filenames (`01-architecture.md`, `02-task-list.md`) caused qa workspaces to be silently skipped.
- `agents/architect.md`: Full `01-plan.md` template now carries the `Base` column and `**Base:**` per-PR field, matching the Schema template — the drifted copy omitted these fields.
- `agents/delivery.md`: acceptance-matrix save path moved from git-ignored `workspaces/{feature-name}/` to `docs/specs/{feature-name}/` (committed, not ignored); Step 10.0 `git add` and Step 11.2 PR-body reference updated accordingly.
- `skills/update/SKILL.md`: bash managed-block sync now uses in-position Python 3 replacement (same behaviour as the PowerShell path) — the previous `sed -i.tmp` approach left `.tmp` litter on every run.

### Changed

- `docs/patch-mode.md` + `agents/orchestrator.md`: Case D (security-only localized patch) now explicitly requires a coherence gate (`qa validate` on patched AC IDs) after the security re-run — the omission allowed security-only patches to skip qa entirely.
- `agents/orchestrator.md` Phase Checklist: phases `2.0`, `2.5`, `4.5`, and `STAGE-GATE-2` are now documented as JSONL-only (not checklist rows); row `2.7 — Test Authoring` added; Phase 3.75 corrected to IS a top-level checklist row (was described as not being one).
- `agents/orchestrator.md` Phase 3.5 + `agents/ref-special-flows.md`: regression-still-passing gate now also checks assertion-content match — authored assertion patterns from `02-regression-test.md` must still be present in the actual test file; a weakened/replaced body fails the gate.
- `agents/plan-reviewer.md` + `agents/orchestrator.md` Phase 1.6: vacuous-success guard for the security-design-review label is now conditioned on `security_sensitive: true` from the dispatch payload — when `security_sensitive: false`, absence of the label is expected and does not trigger the guard.
- `agents/ref-direct-modes.md`: vacuous-success guard scope clarified — applies to `plan-review` direct mode and design/research panels; diagram modes (`/d2-diagram`, `/likec4-diagram`, `/excalidraw`) do not dispatch a qa/plan-review panel and are explicitly excluded.
