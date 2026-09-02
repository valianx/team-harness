# Tasks

## 1. Identity helpers

- [ ] 1.1 Add `openspecContentIdentity({ change_root })` to `skills/pipeline/scripts/control-plane.mjs`: sorted relative paths, `path\0bytes` hashing, checkbox normalization in `tasks.md`; export it and sync the two mirrors.
- [ ] 1.2 Add `taskProgressDelta({ pinned, current })` returning `none | progress | regression | structural`; export it and sync the mirrors.
- [ ] 1.3 Add cases to `tests/test_pipeline_control_plane.mjs`: identity stable under a tick, changed under a rename, an added file, and a removed file; delta classification for each of the four outcomes.

## 2. Spec deltas

- [ ] 2.1 Author the `openspec-design-orchestration` delta: modified multi-repository and separate-homes requirements, modified pinning requirement, modified lifecycle scenario, added administrative-close requirement.
- [ ] 2.2 Author the `openspec-archive-lifecycle` delta: modified archive requirement, removed backfill requirement.
- [ ] 2.3 Run `openspec validate reconcile-v5-specs --strict` and `python3 tests/test_openspec_scope.py`.

## 3. Prose

- [ ] 3.1 Name `openspecContentIdentity` and `taskProgressDelta` in `agents/ref-pipeline.md § Recovery` and `docs/pipeline-v5-migration.md`, replacing the prose-only identity description.
- [ ] 3.2 Update `skills/spec/SKILL.md` step 7 and `agents/_shared/orchestrator-state.md` terminal close to the relaxed archive vehicle; regenerate the Codex projections.
- [ ] 3.3 Write `changelog.d/reconcile-v5-specs.md`.
