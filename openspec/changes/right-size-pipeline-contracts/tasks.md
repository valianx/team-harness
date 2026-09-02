# Tasks

## 1. Real-run baseline

- [x] 1.1 Author three fixture requests under `tests/fixtures/pipeline-baseline/` (small fix, medium feature, security-sensitive fix) with request text and expected touched surface.
- [ ] 1.2 Run each through the live pipeline on the 3.20.14 tree once and record in `docs/benchmarks/pipeline-baseline.md`: tree anchor, time to Gate 1, architect dispatches, acceptance-criteria count, specialist dispatches, tool calls, correction rounds, terminal state, exclusive defects per lens.
- [x] 1.3 Reference the baseline from `docs/pipeline-v5-migration.md` next to the contract benchmark, stating what each measures.

## 2. Shrink-only ceilings

- [x] 2.1 Create `tests/fixtures/authoring-baseline.json` with the current word count as `ceiling` for every `agents/ref-*.md` and `agents/_shared/*.md` file over its class budget; set `target` 6000 for `ref-special-flows.md` and 4000 for `ref-direct-modes.md`.
- [x] 2.2 Extend `tests/test_authoring_budgets.py`: fail when a file exceeds its `ceiling`; fail when a `ceiling` sits more than 2% above the current count; print `target` distance.
- [x] 2.3 Document the ratchet in `docs/agent-authoring.md § Size budgets` in one paragraph.
- [x] 2.4 Correct `CLAUDE.md § 14` to cite the recorded kernel and pipeline-reference counts.

## 3. Retired phrases

- [x] 3.1 In `agents/ref-direct-modes.md § Review`, replace the four restated classification passages with the helper name and its output vocabulary.
- [x] 3.2 Add the retired-phrase list to `/th:lint` Check 12 and its test, with `skills/review-pr/SKILL.md` recorded as a shrink-only exemption until `verify-review-findings` lands; verify the check fails against the pre-edit `ref-direct-modes.md`.
- [x] 3.3 Regenerate projections for `ref-direct-modes.md` and run the projection suite.

## 4. Design granularity ceiling

- [x] 4.1 Add `max_requirements_per_change: 12` to `openspec/config.yaml` under a repository-owned key; read it in `agents/architect.md` propose/update mode.
- [x] 4.2 Add `design_status: oversize` with count and proposed seams to the architect's output template.
- [x] 4.3 Insert the three-option live choice between v5 Design steps 3 and 4 in `agents/ref-pipeline.md § Design`; record the decision as `design.oversize`.
- [x] 4.4 Add a behavioral test feeding an oversize delta to the Design step and asserting no identity is computed and no Gate 1 is presented before the choice.

## 5. OpenSpec scope

- [x] 5.1 Write `openspec/config.yaml` rules: proposal under 500 words with `Non-Goals`; tasks at most 20 items; requirements per delta at most the ceiling from 4.1.
- [x] 5.2 Add `tests/test_openspec_scope.py`: every active change has a non-empty `specs/`, declares at least one new or modified capability, and satisfies the numeric rules.
- [x] 5.3 Remove `install-agnix-cli`, `deliver-pr-review-contract-recovery`, and `repair-legacy-v1-migration-dispatch`; archive `simplify-pipeline-control-plane`, `simplify-operator-interaction`, `harden-multi-repo-coordination-contract`, `address-pr-review-recovery-review-findings`, `replace-terra-with-luna-max`, and `floor-scans-control-removal`.
- [x] 5.4 State the entry rule in `skills/spec/SKILL.md § Routing predicate` and `docs/openspec-integration.md`: a change exists only for product behavior.

## 6. Close

- [x] 6.1 Write `changelog.d/right-size-pipeline-contracts.md`; bump the internal-distribution version sites.
- [x] 6.2 Run `bash tests/run-all.sh`, `bash tests/run-behavioral.sh`, and `openspec validate --strict` over all active changes.
