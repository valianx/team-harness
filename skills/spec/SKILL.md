---
name: spec
description: Coordinator-only OpenSpec lane for a short task that merits written intent — no pipeline, no specialist dispatch.
---

# Spec Lane (explicit direct mode)

This is not Discover's spec co-authoring flow (the pipeline's `00-spec-seed.md` intake step); it
is a standalone entry point for a task that is too small to justify the pipeline floor but still
merits a durable written intent. `/th:spec` runs entirely in the coordinator.

## Routing predicate

Plain inline handles mechanical, reversible work with no design decision worth recording. `/th:spec`
handles tasks that merit written intent and task decomposition — single repo, no security floor,
no public-contract break. `/th:pipeline` remains the hard router for security-sensitive,
multi-specialist, multi-task, or irreversible work — these are hard routers the lane never absorbs.
When an in-flight lane task grows a second specialist need or a security dimension, stop before
proceeding and offer the pipeline, carrying the authored change over.

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
5. **Review (optional).** On an explicit live operator request, run exactly one full-scope ad hoc
   review (`agents/_shared/inline-review-contract.md`) over the branch's diff. A sub-floor finding
   rides as a pull-request concern; the lane never opens a correction or re-audit loop.
6. **Publish.** Open the pull request under the repository's existing conventions (branch naming,
   commit style, outward-action approval).
7. **Archive.** After the PR merges, offer `openspec archive <change>` with a one-line Y/n exactly
   as the pipeline's terminal-close step does; a declined or deferred offer never blocks close.

## Escalation

If implementation reveals the change touches a security-sensitive surface, needs a second
specialist, spans more than one repository, or turns out irreversible, stop before proceeding:
state the concrete reason and offer `/th:pipeline {request}`, carrying the authored
`openspec/changes/` proposal and tasks over so the pipeline's Design phase starts from written
intent instead of a blank one.

## Canonical surface

A lane-authored change uses the identical `openspec/changes/` directory, schema, naming, and
archive path as a pipeline-authored change (`docs/openspec-integration.md`). Both entry points
validate under the same pinned CLI and archive through the same lifecycle; there is no
lane-specific layout.
