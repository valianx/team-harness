### Added
- Recorded a real-run pipeline baseline (`docs/benchmarks/pipeline-baseline.md`) with three fixture requests, so a change that alters dispatch, state, or recovery contracts has a measurement to compare against; the runs themselves are executed separately and every cell reads `pending-runs` until then.
- Gated `agents/ref-*.md` and oversized `agents/_shared/*.md` files on shrink-only word ceilings recorded in `tests/fixtures/authoring-baseline.json`: a file over its ceiling fails, and a ceiling left more than 2% above the current count fails.
- Added a design requirement-count ceiling (`max_requirements_per_change`): past it the architect returns `design_status: oversize` with the seams it sees, and one live choice — split, accept with a recorded reason, or narrow — is decided and recorded as a `design.oversize` event before any content identity, `01-plan.md`, or Gate 1.
- Added `tests/test_openspec_scope.py`: an active change must hold a delta, declare a capability, and stay inside the proposal, task, and requirement limits now recorded in `openspec/config.yaml`.

### Changed
- Moved the review mode's failure classification back into its helper: the contract names `review_context.py` and the skill that owns the returned vocabulary instead of restating its flags, decisions, and attempt ordinals, and `/th:lint` Check 12 fails on the closed list of retired phrases.
- Corrected the orchestrator kernel and pipeline reference word counts in `CLAUDE.md § 14` to the values the authoring fixture records.
