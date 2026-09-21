# OpenSpec completion and retirement

Main applies this shared lifecycle in Claude Code, Codex, and OpenCode when
authoring or resuming OpenSpec work, preparing a PR candidate, closing the task,
or reporting its status.
Upstream propose/apply completion returns to this lifecycle; it does not finish
Team Harness delivery or archive the change.

## Write only useful intent

Reuse the affected living specs and relevant active change before adding another
document. Specs describe observable behavior and acceptance scenarios; design
describes the approach. Update existing requirements instead of copying them
into parallel specs. Routine tooling, delivery, or repository chores need no
new OpenSpec change merely because a PR is being prepared.

Keep execution logs, reviewer transcripts, captures, scratch scripts, and operator
projections in the configured workspace or permitted temporary storage, outside
tracked product files. Preserve reusable tests, fixtures, tools, and deliberate
product documentation. An archive preserves canonical change history; it does
not turn execution debris into durable specifications. Do not purge active work
or relocate archives by age or by a PR request alone: the current archive and
review contracts require their canonical repository paths.

## Assess the relevant changes

Read active `openspec/changes/` entries and the current bound change, including
its archived location, in the current or already-bound repositories. Use their proposal, tasks, deltas, existing plan,
validation and delivery evidence. A checked task list identifies an archive
candidate; it does not prove implementation or verification. Missing evidence stays explicit.

- **Completed:** when implementation and its relevant checks are complete,
  prepare archive on the same feature branch before the final candidate review
  or publication authorization. Include implementation, updated living specs and the
  archived change in the same PR. An absent or open PR does not prevent archive;
  merge integrates the prepared state. Apply the same preparation to agreed
  delivery without a PR.
- **Delivered without archive:** offer a recovery archive after checking the
  implemented requirements against current specs. A follow-up PR is for this
  missed closure, not a prerequisite for ordinary archive. Do not wait or poll
  for a merge.
- **Cancelled or wholly superseded:** explain which intent or delivered behavior
  makes the change obsolete and offer retirement without applying its deltas.
  Do not mark unfinished tasks complete to make retirement look like delivery.
- **Partially superseded or uncertain:** identify what remains valid and offer
  reconciliation first. Verify which requirements are already represented in
  the living specs before applying or retiring anything; do not discard valid
  work or apply the old change wholesale.

If the bound change is already archived, keep its location and validate it with
the current specs; do not archive it again on resumption or close.

Before authoring or changing `MODIFIED`/`REMOVED` requirements, compare the affected
requirements with the living specs and relevant active changes. Surface concrete
contradictions with both source paths and propose amending, reconciling, or retiring
the older change. Shared capability names or age alone do not establish conflict,
and a proposed replacement is not evidence that the old behavior was retired.

## Check archive readiness before the PR

When preparing the candidate to create or update a PR, including direct work
outside the OpenSpec lane or pipeline, assess archive readiness for the
open changes related to its scope, including the bound change. Compare their requirements and tasks with the
implementation diff and relevant test or acceptance evidence; reuse existing
results when they still apply. Run strict upstream validation for each candidate
and check its deltas against current specs and relevant active changes. Archive
only completed, verified, coherent work. Report missing evidence or conflicts as
pending with the reason; checked tasks or structural validity alone are insufficient.
Report each relevant open change as `ready to archive`, `pending` or
`reconciliation needed`, with its source and evidence or missing prerequisite.
Keep unrelated changes outside the PR. This is candidate preparation, not another
review round or approval gate.

## Offer and close

Show the change, the reason it is ready, and whether the operation will update
living specs or only retire the proposal. Reuse an explicit live authorization
covering that operation; otherwise ask one brief confirmation. An explicit decline
or deferral permits ordinary review and delivery without archive, recording it as
pending; it never blocks task close. Do not
repeat the same offer without a new request to archive or material evidence change.

Use the pinned upstream `openspec archive <change>` for completed work and
`openspec archive <change> --skip-specs` for approved cancellation or wholesale
retirement. Keep validation enabled and surface any incomplete-task warning in
the retirement offer. Reconcile a mixed change before choosing either operation.
After execution, strictly validate the archived change and affected living specs,
then refresh existing plan links and bound source locations. Use the explicit archived reference
`archive/YYYY-MM-DD-<change>` with `review-fan.mjs --change`; its criteria must
come from the committed candidate. A failure remains pending with its reason;
do not claim closure.

Archive follows the repository's normal branch and outward-write permissions.
It belongs to candidate assembly, before final validation and acceptance.
In a pipeline, resolve outstanding review results against the candidate before
moving the change. Preserve its content identity, refresh its location and
projection, and carry the archived source references into the candidate review.
Delivery publishes the accepted candidate unchanged; archive grants no push, PR
or merge authority.

Review corrections keep code, living specs and the archived record consistent
on the same branch. Revalidate the changed candidate through the existing flow.
If intended behavior changes, use the normal amendment/reopening procedure and
obtain only missing scope authority; do not silently rewrite reviewed intent.

## Read-only status

At task close, and in `pipelines`/`trace`, show relevant unarchived candidates as
`archive pending` with source links, reason and next action, including incomplete
changes known to be cancelled or superseded. Status commands only report; they
never ask for archive approval, mutate files, or create pipeline state. Display
direct-mode OpenSpec changes even when no pipeline workspace exists. If completion
or obsolescence cannot be established, report the missing evidence rather than
inventing a completed or stale classification.
An archived change in an open PR is prepared for delivery, not yet integrated.
