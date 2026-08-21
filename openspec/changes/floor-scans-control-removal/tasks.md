# Tasks

## 1. Close the additions-only fail-open

- [x] 1.1 Replace `readAddedByFile` in `skills/verify/scripts/review-fan.mjs` with a collector that
  gathers both `+` and `-` hunk lines per file, using positional header detection: a `---`/`+++`
  line counts as a file header only between a `diff --git` line and that file's first `@@`; after
  the first `@@`, every `+`/`-` line is content. Keep the per-file attribution the current function
  provides.
- [x] 1.2 Update the `FLOOR_CONTENT` comment and any other in-file wording that states the scan is
  additions-only, so the code's own description matches its behaviour.
- [x] 1.3 Correct `docs/pipeline-lanes.md:99-100` — the single sensitivity authority — to describe
  the classifier as deriving categories from changed paths and changed content.

## 2. Prove it with an oracle that compares real artifacts

- [x] 2.1 Add a behavioural test that builds a real git repository, commits a file at a path
  outside `FLOOR_PATHS` containing a security control, then commits its removal, and asserts the
  classifier reports the floor as applying over that range. Verify the test FAILS against the
  pre-fix collector before accepting it.
- [x] 2.2 Add a case to the same test covering the header collision: a removed line whose content
  is a `--`-style comment (so the diff line reads `--- …`) inside a hunk must be treated as content,
  not as a file header, and must not truncate collection for that file.
- [x] 2.3 Not applicable: the cases landed in the existing `tests/test_review_fan.mjs`, which
  `tests/run-all.sh` and `docs/testing.md` already register. No new suite was created.

## 3. Delete the retired forcing rule and repair its citations

- [x] 3.1 Remove the bug-fix forcing-rule bullet from `docs/dev-mode.md` and correct the
  path-pattern bullet above it, which cites a risk-metadata table that
  `agents/ref-intake-flows.md § "Lane Classification"` does not contain.
- [x] 3.2 Correct `CLAUDE.md:151`, which summarises the deleted rule and points at a section that
  never carried it.
- [x] 3.3 Correct `docs/discover-phase.md:187`, which names the forcing rule as one of only two
  writers of `security_sensitive` — both halves of that claim are false, and
  `agents/ref-pipeline.md:1487` is a third writer it omits.
- [x] 3.4 Correct the trailing clause of `agents/ref-pipeline.md:723-724`, which cites the same
  non-existent risk-metadata table.

## 4. Make the lane's stated guarantee match its producer

- [x] 4.1 Rewrite the guided lane's security-floor paragraph in `skills/spec/SKILL.md` so it states
  what the lane produces — the floor classification and the three-way stop when verification runs —
  without asserting a publication precondition no hook enforces.
- [x] 4.2 Reconcile `skills/verify/SKILL.md § Security floor` against the same wording.
- [x] 4.3 Reconcile `openspec/specs/spec-direct-lane/spec.md`, which still names a security floor as
  a hard router that ejects to the pipeline, against `guided-lane-verification`, which owns the
  three-way stop — two capabilities currently assert incompatible behaviour for the same event.

## 5. Propagate and verify

- [x] 5.1 Regenerate the runtime projections (`plugins/team-harness/**`,
  `installer-assets/opencode-skills/**`, `.codex/**`) so every runtime carries the fixed classifier
  and the corrected skill text.
- [x] 5.2 Bump the internal distribution version at every required site and add a `changelog.d/`
  fragment.
- [x] 5.3 Run `bash tests/run-all.sh` and the Codex projection suite; read the printed suite lines
  rather than trusting the exit code.

## 6. Record what is not built here

- [x] 6.1 Filed as issue #617: the guided lane has no two-revision regression proof, stating the
  pipeline mechanism it would mirror and why the tier-based one does not transfer.
