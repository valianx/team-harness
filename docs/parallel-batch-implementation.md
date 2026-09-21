# Parallel Batch Implementation

This reference describes bounded native parallel work for independent tasks in
one repository. The coordinator keeps dependency planning, workspace ownership,
result consolidation, and publication in one build and one PR.

## When this applies

Use this flow when:

1. the operator requested the batch and its scope;
2. the tasks share a repository and a selected absolute workspace;
3. the plan identifies independent tasks with explicit file ownership; and
4. dependent tasks can be ordered from the plan before dispatch.

If ownership overlaps or a dependency is unresolved, run that portion
sequentially. The batch route is a coordination choice, not a prerequisite for
ordinary direct work.

## Plan and workspace

The coordinator records the task list and dependency graph in the existing
plan. Each task names its objective, assigned files, worktree or repository
root, focused checks, and expected result location. Every destination is an
absolute path supplied by the workspace method.

Milestone builds keep one plan, one workspace, dependency annotations, and one
build-level PR. Independent milestones may use the same bounded native dispatch;
dependent milestones wait for their prerequisites. Do not create per-milestone
workspace copies, retired lane protocols, or a second coordinator.

The plan, tasks, and notes are the durable context. Direct batches do not create
knowledge-context, telemetry, event, or session scaffolding.

## Native bounded dispatch

The coordinator dispatches independent tasks through the active host's native
task or session mechanism. Use the configured concurrency cap (default five)
with eager slot filling when useful. If native parallel dispatch is unavailable,
run the same tasks sequentially.

Each task receives:

- the objective and acceptance scope;
- the absolute repository and workspace paths;
- its dependency status and assigned files;
- the requested deliverable path;
- native permission context; and
- focused checks to run.

Do not require a shell multiplexer, a particular coding host, a permission
bypass, or a fixed environment variable. A failed task is reported with its
diagnostic and does not erase completed task evidence.

## Worktree isolation

Parallel tasks that would share Git metadata use distinct host-managed
worktrees or checkouts. The coordinator records each returned absolute path and
base revision before dispatch. Tasks in one worktree run sequentially.

Never assume a path under a particular host's configuration directory, and
never discover a worktree by date, mtime, or newest-directory ordering. A
missing, conflicting, or outside path blocks that task before edits.

## Shared files and result ownership

The task list declares file ownership. A task edits only its assigned files and
returns changed paths, checks, findings, and its explicit output path. Shared
plan, index, manifest, or publication files remain coordinator-owned and are
updated serially after task results arrive.

When two results touch the same file, the coordinator reconciles the complete
set of changes in dependency order, preserving every compatible contribution.
An unresolved semantic conflict is reported for an operator decision; it is
never silently dropped or resolved by choosing the first result.

## Consolidation

After independent tasks complete, the coordinator:

1. verifies each result against its assigned scope;
2. applies or merges task changes serially in dependency order;
3. runs the appropriate focused checks after each material merge;
4. records the consolidated changed-file map and evidence; and
5. runs the repository-level checks appropriate to the final candidate once.

The resulting branch carries one plan, one implementation result set, one
validation record, and one PR by default. Version and publication work remain
with the current delivery route after the candidate is accepted.

## Verification and cleanup

Task checks are necessary evidence for their own scope. The consolidated check
covers interactions between tasks and is the final implementation signal. A
missing or failed task result stays visible in the consolidated report.

Remove only run-owned host-managed worktrees and scratch directories after the
coordinator confirms their evidence is retained. Keep failed worktrees when
their inspection is needed. Never delete a generic `/tmp` path, another run's
files, or a workspace destination supplied by the operator.

The coordinator returns the task map, absolute workspace, changed files,
verification results, unresolved conflicts, and the final deliverable path.
