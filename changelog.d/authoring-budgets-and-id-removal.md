### Added

- `tests/test_authoring_budgets.py` measures every agent file against the size budgets
  `docs/agent-authoring.md` declares — word budgets per file class, the 500-line hard cap, and the
  table-of-contents requirement for reference files over 100 lines. Nothing had measured any of
  them, so `agents/_shared/orchestrator-state.md` sat at 767 lines against a 500-line cap. A
  reference file's contents block is compared against that file's own headings, so an invented list
  fails. Files already over budget are named in an `EXEMPT` map the suite forces to shrink: it fails
  when an exempt file becomes compliant and its entry is left behind.
- A table of contents in `ref-pipeline.md`, `ref-special-flows.md`, `ref-direct-modes.md`,
  `ref-intake-flows.md`, and `ref-dispatch-machinery.md`. The coordinator is instructed to load
  `ref-pipeline.md` by heading and never read its 1,991 lines in full; without a contents block
  there was no way to follow that instruction.

### Fixed

- The inline review contract declared a package shape the producer does not emit. `review-fan.mjs`
  had stopped sending `target_id` and `dispatch_id`, and `tests/test_review_fan.mjs` asserts their
  absence, but the contracts agents read still required them, and the declared `coordinates`,
  `scope`, and `criteria` shapes had drifted from `buildPackage` as well. The contract now matches
  the producer, and consolidation is described as what `gate()` implements — worst-outcome-wins,
  which closes the duplicate case without discarding a return.
- `tests/test_inline_git_hardening.py` carried an "executable contract model" of the retired keyed
  join: a `consolidate()` function the test defined and then verified against its own definition,
  proving nothing about shipped code while pinning the stale documentation alive through
  `test_codex_runtime.py`'s marker lists. Removed.
