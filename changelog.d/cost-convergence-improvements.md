### Added

- `/th:spec`: a coordinator-only OpenSpec lane for short tasks, with zero specialist dispatches and no pipeline ceremony.
- A persistent findings ledger binds every re-review to prior rounds, so exhaustive class-sweep coverage is never lost.
- Correction rounds now emit measurable convergence counts in the event trace.
- Terminal close now offers to archive a merged OpenSpec change through its own pull request.

### Changed

- Design now dispatches the architect once; the execution overlay derives mechanically instead of a second dispatch.
- Validation now terminates on severity: sub-floor findings converge to a ledger residual and ship instead of looping.
- PR review now only restarts when code identity actually changes, and the security lens requires concrete evidence.

### Fixed

- `openspec-overlay.mjs derive` now refuses and writes nothing when its target files already exist, instead of overwriting them.
