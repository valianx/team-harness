> Enforcement mandate for every task below: a task is done when an executable produces the governed artifact or a deterministic check fails on violation. Prose is written only to document the contract that executable enforces; a task that ends with a sentence added to a document and nothing that fails when the sentence stops being true is not done.
>
> Editing mandate: rewrite the affected section whole rather than appending a qualifier, and when a task changes a statement duplicated across carriers, update every carrier in that same task.
>
> Projection caveat: `plugins/team-harness/**`, `installer-assets/opencode-skills/**`, and `.codex/**` are generated or mirrored. Never hand-edit them — run `node tools/codex-runtime/sync-skills.mjs` and `node tools/codex-runtime/generate.mjs` and commit their output with the canonical change. Scripts triplicate byte-for-byte, which is why enforcement belongs in them rather than in adapted prose.
>
> Budget caveat: `agents/_shared/inline-review-contract.md` is already 1,824 words against a 1,500-word shared-contract budget. Additions to it are limited to the two genuinely shared rules in group 3.

## 1. Review Package Producer

- [x] 1.1 Create `skills/verify/scripts/review-fan.mjs` with a `package` subcommand that resolves the repository root, requires a clean index and worktree, resolves a committed range, and exits non-zero naming the failing precondition instead of emitting a package.
- [x] 1.2 Derive `changed_surface` and the scan list inside `package` from `git diff --name-status` over the resolved range, so no caller supplies them.
- [x] 1.3 Implement floor classification inside `package` over the changed paths and diff content, emitting `security_floor.applies` with the matching category as its reason, defaulting to sensitive when the classification is ambiguous.
- [x] 1.4 Implement required-lens resolution inside `package`: operator-named lenses are required, and `security` plus `adversary` are forced into the required set whenever the floor applies.
- [x] 1.5 Implement `--prior-anchor` in `package`: supplying it refuses full scope, names the prior anchor, and emits a delta-scoped package bounded to the range since that anchor.
- [x] 1.6 Create `tests/test_review_fan.mjs` covering the dirty-tree refusal, the uncommitted-range refusal, derived changed surface, ambiguous-classification-is-sensitive, forced floor lenses, and the second-full-scope refusal.

## 2. Ship Decision and Finding Classification

- [x] 2.1 Add a `gate` subcommand to `skills/verify/scripts/review-fan.mjs` that reads lens returns and resolves ready or not-ready, treating an absent required return as not-ready and never as a pass.
- [x] 2.2 Make `gate` name the missing or blocking lens in its not-ready output, and refuse to resolve ready while any required floor lens is absent or carries a blocker.
- [x] 2.3 Make `gate` classify every blocking finding against the bound written-intent criteria, reporting `covered` when a criterion anticipated it and `spec_defects` when none did.
- [x] 2.4 Make `gate` demote a finding whose file set lies outside a bounded package's range to a pull-request concern, so a requested closure look cannot escalate into a new round.
- [x] 2.5 Extend `tests/test_review_fan.mjs` with gate cases: absent required return, blocking floor lens, covered classification, spec-defect classification, out-of-range demotion, and the ready case.
- [x] 2.6 Rewrite the review step of `skills/spec/SKILL.md` as validation that confirms rather than iterates: a covered finding closes by executing its criterion's scenario, an uncovered finding above the floor returns to the authored change, an uncovered finding below the floor rides as a concern, and a reviewed closure pass runs only on explicit live request.

## 3. Written Intent and Lens Count

- [x] 3.1 Implement criteria binding in `review-fan.mjs package`: read the named `openspec/changes/<change>/specs/**` requirement headers and emit them as criteria with provenance `written-intent`, carried by anchored path.
- [x] 3.2 Make `package` exit non-zero when the named change does not validate under the pinned OpenSpec CLI, so unvalidated intent cannot become criteria.
- [x] 3.3 Add `written-intent` to the `criteria[].provenance` enum in the review package schema in `agents/_shared/inline-review-contract.md`.
- [x] 3.4 Add one sentence to `agents/_shared/inline-review-contract.md` stating that lens count never counts toward specialist count, and offset both additions with an equivalent net word reduction in the same file.
- [x] 3.5 Update the return schema in `agents/_shared/inline-review-contract.md` and the return section of `agents/inline-reviewer.md` so coverage against written-intent criteria reports separately from coverage against live-operator criteria, without granting the reviewer any new tool.
- [x] 3.6 Extend `tests/test_review_fan.mjs` with criteria-binding cases: bound requirement headers, the unvalidated-change refusal, and provenance separation in the emitted package.
- [x] 3.7 Run `node tools/codex-runtime/generate.mjs` and re-verify the pinned reviewer digest expectation in `tests/test_codex_runtime.py`.

## 4. Verification Invocation Surface

- [x] 4.1 Author `skills/verify/SKILL.md` as the invocation surface for `review-fan.mjs`, documenting the two subcommands and pointing at `agents/_shared/inline-review-contract.md` rather than restating it.
- [x] 4.2 State in `skills/verify/SKILL.md` that the skill creates no workspace, state, events, gate, branch, or delivery record, and that every refusal comes from the script rather than from operator discipline.
- [x] 4.3 Add the `verify` row to the `skills/modes/SKILL.md` catalog table in alphabetical position.
- [x] 4.4 Run `node tools/codex-runtime/sync-skills.mjs` and commit the generated `plugins/team-harness/skills/verify/**` and `installer-assets/opencode-skills/verify/**` projections, confirming the script triplicates byte-for-byte.
- [x] 4.5 Add a deterministic check to `tests/test_pipeline_contract.py` asserting the three script copies are byte-identical, so the capability cannot degrade in a projection.

## 5. Review Surface Economy

- [x] 5.1 Create `skills/pipeline/scripts/review-surface.mjs` that executes each covering parity checker over the current tree and derives the eligible prefix set from each checker's own expected file set.
- [x] 5.2 Make `review-surface.mjs` emit an empty exclusion set naming the withholding checker whenever any covering checker fails or skips, so a skipped runtime cannot silently grant eligibility.
- [x] 5.3 Make `review-surface.mjs` exclude any prefix whose checker cannot detect an unexpected extra file, and exclude hand-authored generator inputs, deriving both from the checkers rather than from a maintained list.
- [x] 5.4 Make `review-surface.mjs` emit both the pathspec for artifact construction and the enumeration of excluded prefixes with file and line counts and covering checker.
- [x] 5.5 Rewrite the frozen review diff construction step in `agents/ref-pipeline.md` to consume `review-surface.mjs` output for its pathspec, and to re-establish eligibility at every new freeze anchor.
- [x] 5.6 Update the empty-artifact rule in `agents/ref-pipeline.md` so a diff empty solely through exclusion reports as fully checker-verified with its covering checkers named, distinguishing it from the existing blocking condition.
- [x] 5.7 Update `docs/verification-packet.md` so the packet records the emitted enumeration, and update the git-anchored scan-list derivation in `agents/qa.md` to apply the same pathspec, preventing an excluded path from registering as a packet integrity mismatch.
- [x] 5.8 Create `tests/test_review_surface.mjs` covering checker-failure and checker-skip withholding, extra-file-blind prefix exclusion, generator-input exclusion, and the emitted pathspec and enumeration shape.
- [x] 5.9 Add a deterministic check to `tests/test_pipeline_contract.py` asserting that `agents/_shared/dispatch-contract.md`, `agents/adversary.md`, and `agents/qa.md` carry no review-scope clause, so the exclusion cannot migrate into a verifier contract.

## 6. Routing Predicate

- [x] 6.1 Add a deterministic check to `tests/test_pipeline_contract.py` that every `§ "<heading>"` citation in `agents/**`, `skills/**`, and `docs/**` resolves to an existing heading in the cited file, and fix every citation it reports.
- [x] 6.2 Add a deterministic check to `tests/test_pipeline_contract.py` asserting the routing predicate and hard-router list are byte-consistent across their declared carriers, and naming every drifting carrier on failure.
- [x] 6.3 Restore a sensitivity authority section in `docs/pipeline-lanes.md` defining the sensitive categories and the ambiguous-is-sensitive default, sourced from the same category list the producer classifies against.
- [x] 6.4 Repoint every citation of the removed anchor in `agents/orchestrator.md`, `agents/ref-direct-modes.md`, `agents/ref-pipeline.md`, and `docs/knowledge.md` to the restored section, verified by the check from task 6.1.
- [x] 6.5 Rewrite the posture guidance in `docs/pipeline-lanes.md` and `agents/orchestrator.md` so the spec lane is rendered whenever its predicate passes and the removing condition is named when it does not.
- [x] 6.6 Update the renderings that omit the spec option in `agents/ref-intake-flows.md`, `agents/ref-special-flows.md`, `docs/discover-phase.md`, `docs/reasoning-checkpoint.md`, and `docs/how-it-works.md`, verified by the check from task 6.2.
- [x] 6.7 Update `skills/setup/managed-blocks/orchestrator-dispatch-rule.md` and the two-posture bullet in `CLAUDE.md` § 5 to the same wording, and reconcile the stale inlined copy in `skills/setup/SKILL.md` with its declared source of truth.

## 7. Dispatch Cost Observability

- [x] 7.1 Extend `skills/pipeline/scripts/openspec-events.mjs` to require a derived wall time and a declared-input budget on every attempt record, rejecting an attempt that carries neither and naming it.
- [x] 7.2 Extend the same validator to keep rejecting an available token branch missing any of its frozen five components, and to reject a component presented without the available branch's full set.
- [x] 7.3 Extend `tests/test_openspec_events.mjs` with cases for the two new required measures, the unchanged unavailable branch, and rejection of a partial available set.
- [x] 7.4 Document in `agents/_shared/orchestrator-state.md` the attempt record the validator now enforces: wall time derived from the coordinator's own spawn and close timestamps including the stalled-without-result case, and the declared-input budget labelled as a declared-input measure rather than consumed tokens.
- [x] 7.5 Specify per-role declared-input totals and the unattributed-coordinator line in the run cost report in `agents/_shared/orchestrator-state.md`, so the difference between the run total and its attributed parts is stated rather than distributed.
- [x] 7.6 Restate in the packaged observability reference that per-attempt token components remain unavailable and that splitting, mining, correlation, and estimation stay forbidden, so the two new measures do not read as a relaxation.
- [x] 7.7 Mirror `openspec-events.mjs` to its projection copies and confirm byte parity.

## 8. Verification and Release

- [ ] 8.1 Run `node tools/codex-runtime/generate.mjs --check && node tools/codex-runtime/test_generate.mjs && python3 tests/test_codex_runtime.py` and record the result as suite evidence.
- [ ] 8.2 Run `node tools/codex-runtime/sync-skills.mjs --check` and `node tools/codex-runtime/sync-hooks.mjs --check` and record both results.
- [ ] 8.3 Run `node tests/test_review_fan.mjs`, `node tests/test_review_surface.mjs`, `node tests/test_openspec_events.mjs`, and `python3 tests/test_pipeline_contract.py` and record every result.
- [ ] 8.4 Run `bash tests/run-all.sh` and `bash tests/run-behavioral.sh` and record both results.
- [ ] 8.5 Run `npx --yes @fission-ai/openspec@1.9.0 validate guided-lane-completion --strict` and confirm it passes.
- [ ] 8.6 Run `/th:lint` and resolve any structure, frontmatter, or size finding it reports for the changed and new files.
- [ ] 8.7 Bump the four internal distribution version sites and add the `changelog.d/` fragment describing the guided-lane completion, the review-surface economy, the routing change, and the observability additions.

## 9. Security Classification Floor

- [x] 9.1 Replace the enumerated `REASONS_REQUIRING_SECURITY` set in `skills/review-pr/scripts/review_context.py` with a `REASONS_WAIVING_SECURITY` set holding only the positive benign classification, so a reason nobody enumerated inherits the floor instead of escaping it.
- [x] 9.2 Mirror the change to both runtime copies of `review_context.py` and confirm byte parity.
- [x] 9.3 Correct the case in `tests/test_review_context.py` that asserted an indeterminate classification does not require the lens, which encoded the defect as expected behaviour.
- [x] 9.4 Add a property test asserting the waiver set holds exactly one member and every other reason, including an unknown future one, requires the lens.
- [x] 9.5 Add a test enumerating every current producer of an indeterminate classification — empty changed-file list, empty diff, null byte in either — and asserting each requires the lens.
- [x] 9.6 Add a deterministic check to `tests/test_pipeline_contract.py` that fails when the waiver set is widened or when resolution reverts to enumerating the reasons that require the lens.
