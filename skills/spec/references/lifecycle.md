# OpenSpec completion and retirement

Main applies this shared lifecycle in Claude Code, Codex, and OpenCode when
authoring or resuming OpenSpec work, closing the task, or reporting its status.
Upstream propose/apply completion returns to this lifecycle; it does not finish
Team Harness delivery or archive the change.

## Assess the relevant changes

Read active `openspec/changes/` entries, excluding `archive/`, in the current or
already-bound repositories. Use their proposal, tasks, deltas, existing plan,
validation and delivery evidence. A checked task list identifies an archive
candidate; it does not prove acceptance or delivery. Missing evidence stays explicit.

- **Completed:** offer archive after verified, accepted delivery when its PR is
  merged, including a merge from another session, or when the agreed delivery
  required no PR. A planned PR that has not been created is still pending delivery.
  Query an associated PR once when its current state is needed; reuse a fresh
  observation. An open PR is pending merge; a closed, unmerged PR alone proves
  neither delivery nor cancellation. Do not wait or poll for a merge.
- **Cancelled or wholly superseded:** explain which intent or delivered behavior
  makes the change obsolete and offer retirement without applying its deltas.
  Do not mark unfinished tasks complete to make retirement look like delivery.
- **Partially superseded or uncertain:** identify what remains valid and offer
  reconciliation first. Verify which requirements are already represented in
  the living specs before applying or retiring anything; do not discard valid
  work or apply the old change wholesale.

Before authoring or changing `MODIFIED`/`REMOVED` requirements, compare the affected
requirements with the living specs and relevant active changes. Surface concrete
contradictions with both source paths and propose amending, reconciling, or retiring
the older change. Shared capability names or age alone do not establish conflict,
and a proposed replacement is not evidence that the old behavior was retired.

## Offer and close

Show the change, the reason it is ready, and whether the operation will update
living specs or only retire the proposal. Reuse an explicit live authorization
covering that operation; otherwise ask one brief confirmation. A decline or
deferral leaves the disposition visible and never blocks task close. Do not
repeat the same offer without a new request to archive or material evidence change.

Use the pinned upstream `openspec archive <change>` for completed work and
`openspec archive <change> --skip-specs` for approved cancellation or wholesale
retirement. Keep validation enabled and surface any incomplete-task warning in
the retirement offer. Reconcile a mixed change before choosing either operation.
After execution, verify the archive and resulting specs, then refresh existing
plan links. A failure remains pending with its reason; do not claim closure.

Archive follows the repository's normal branch and outward-write permissions.
It is separate from the accepted implementation and any pipeline terminal
transition. For merged work, deliver archive in a subsequent change; never rewrite
the accepted candidate or infer authority for a default-branch push.

## Read-only status

At task close, and in `pipelines`/`trace`, show relevant unarchived candidates as
`archive pending` with source links, reason and next action, including incomplete
changes known to be cancelled or superseded. Status commands only report; they
never ask for archive approval, mutate files, or create pipeline state. Display
direct-mode OpenSpec changes even when no pipeline workspace exists. If completion
or obsolescence cannot be established, report the missing evidence rather than
inventing a completed or stale classification.
