
# Spec Lane (explicit direct mode)

This is not Discover's spec co-authoring flow (the pipeline's `00-spec-seed.md` intake step); it
is a standalone entry point for a task that is too small to justify the pipeline floor but still
merits a durable written intent. `/th:spec` runs entirely in the coordinator.

## Routing predicate

Plain inline handles mechanical, reversible work with no design decision worth recording. `/th:spec`
handles tasks that merit written intent and task decomposition — single repo, no public-contract
break. `/th:pipeline` remains the hard router for multi-repository, multi-specialist, multi-task,
irreversible, or operator-absent work — these are hard routers the lane never absorbs. A security
dimension is not one of them: it stops the lane for the live choice in § Escalation, where the
in-lane option raises the required lens set instead of ejecting the task.

The lane is entered only by explicit `/th:spec` invocation. It creates no workspace, `00-state.md`,
execution events, pipeline summary, snapshot, overlay, traceability artifact, or gate ceremony, and
dispatches no specialist by default.

## Flow

1. **Author.** Write `proposal.md` and `tasks.md` under a new or existing kebab-case
   `openspec/changes/<change>/`, following the installed upstream OpenSpec propose/update skill.
   Add `design.md` or a `specs/**/spec.md` delta only when the task touches an existing specced
   capability; a purely mechanical or additive task needs neither.
2. **Validate.** Run the pinned `openspec validate <change> --strict` CLI. A failure returns to
   authoring; there is no separate repair mode.
3. **Approve.** Present the proposal and task list to the operator in one conversational turn and
   wait for an explicit approval before implementing. This is the lane's only approval — there is
   no second gate.
4. **Implement.** Work inline on a feature branch, checking off each `tasks.md` item as it lands,
   monotonically. No workspace, state file, or event trace is created.
5. **Validate.** On an explicit live operator request, run one full-scope review of the branch
   through `/th:verify`, which builds the package with `skills/verify/scripts/review-fan.mjs` and
   binds this change's validated requirements as `written-intent` criteria. Validation confirms
   the change; it does not iterate. `review-fan.mjs gate` classifies every blocking finding:

   - **covered** — a bound criterion anticipated it. Fix it, then close by executing that
     criterion's scenario and the deterministic suites. No reviewer is dispatched, and nothing is
     counted as a round.
   - **uncovered, above the floor** — the authored change failed to anticipate it, which is a
     defect in the change rather than a new finding. Revise `openspec/changes/<change>/`, revalidate,
     and take the operator's approval on the revision. Never answer it with another review.
   - **uncovered, below the floor** — record it as a pull-request concern.

   A reviewed closure pass over a fix runs only on an explicit live operator request, with the
   prior review anchor; the script refuses a second full scope. The lane opens no other review.
6. **Publish.** Open the pull request under the repository's existing conventions (branch naming,
   commit style, outward-action approval).
7. **Archive.** Check the pull request state once. When it reports merged, offer
   `openspec archive <change>` behind a one-line Y/n; on acceptance, run it on a branch delivered
   as its own pull request — never this run's own pull request, never a direct default-branch
   push. When the pull request is not yet merged, record the archive as pending instead. Archive
   never runs silently, and a declined or deferred offer never blocks close — either way, note the
   disposition for a later explicit request. Identical semantics to the pipeline's terminal-close
   step (`agents/_shared/orchestrator-state.md § "Terminal status write — mandatory"`).

## Escalation

If the change spans more than one repository, needs a second specialist that writes, turns out
irreversible, or grows into a multi-task build, stop before proceeding: state the concrete reason
and offer `/th:pipeline {request}`, carrying the authored `openspec/changes/` proposal and tasks
over so the pipeline's Design phase starts from written intent instead of a blank one. Review
lenses are not specialists — a request naming several lenses is one review.

A security dimension is a stop, not an ejection. When `review-fan.mjs` reports
`security_floor.applies`, present the matching category it named and three live options:

```text
1 — raise the bar in-lane
2 — pipeline
3 — narrow scope
```

Choice `1` keeps the work here with `security` and `adversary` in the required lens set; the pull
request does not open until `review-fan.mjs gate` resolves ready. Choice `2` carries the authored
change into the pipeline. Never absorb the dimension without asking, and never eject without
offering `1`. When any of the hard routers above also holds, option `1` is not offered.

## Canonical surface

A lane-authored change uses the identical `openspec/changes/` directory, schema, naming, and
archive path as a pipeline-authored change (`docs/openspec-integration.md`). Both entry points
validate under the same pinned CLI and archive through the same lifecycle; there is no
lane-specific layout.
