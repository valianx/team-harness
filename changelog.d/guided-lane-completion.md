### Added

- `/th:verify` runs the inline verification fan over a committed range and decides its ship join.
  `skills/verify/scripts/review-fan.mjs` builds the anchored review package from repository state
  rather than from a coordinator's recollection: it refuses a dirty tree or an uncommitted range,
  derives the changed surface from git, binds a change's validated requirements as
  `written-intent` criteria, classifies the security floor from the diff, and forces `security` and
  `adversary` into the required lens set whenever that floor applies.
- `skills/pipeline/scripts/review-surface.mjs` runs the parity checkers locally at the reviewed
  tree and returns the pathspec of changed paths proven byte-identical to their canonical source,
  so both the frozen review diff and the inline review package stop carrying verified mirrors. A
  failed or skipped checker returns an empty exclusion naming what withheld it.
- `agent.close` carries a derived wall time and a declared-input budget, validated by
  `openspec-events.mjs`, so a stalled attempt's consumed time and a repeated per-role fixed cost
  are visible. Per-attempt token components remain unavailable.

### Changed

- The guided lane validates instead of iterating. `review-fan.mjs gate` classifies every blocking
  finding against the bound criteria: one the spec anticipated closes by executing that criterion's
  scenario, one it did not is a defect in the authored change that returns there for an approved
  revision, and a sub-floor finding rides as a pull-request concern. None opens another review.
- A security dimension found in the guided lane stops for a live three-way choice — raise the bar
  in-lane under a ship-blocking conjunction, take the pipeline, or narrow scope — instead of
  ejecting the whole task to the pipeline. Multi-repository, multi-specialist, multi-task,
  irreversible, and operator-absent work remain hard routers.
- The spec lane is offered whenever its predicate passes rather than at coordinator discretion, in
  every posture rendering.

### Fixed

- An indeterminate security classification requires the security lens again. The waiver is keyed to
  the single positive benign classification, so an empty diff, an empty changed-file list, an
  embedded null byte, or any reason added later inherits the floor instead of escaping it.
- `docs/pipeline-lanes.md § "2a. What counts as a sensitive path (type-agnostic)"` is restored and
  its eight dangling citations repointed. A deterministic check now resolves every quoted section
  citation and caps the pre-existing dangling set so it cannot grow.
- The setup skill referenced its managed block instead of inlining a stale copy of it, and the
  generator fixture imports the shared pipeline-script roster instead of restating it.
