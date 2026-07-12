# Worktree Discipline — Parallel Task Isolation

This document codifies the 5-rule worktree discipline for running two or more tasks in the same
repository at the same time without collisions. It applies to both the orchestrator-driven path
(agent-issued git operations) and the human-two-session path (own-terminal operations).

---

## Rule 1 — Start-gate: choose branch-in-place or worktree before touching anything

Before starting any work, inspect the shared tree:

```bash
git status            # is the tree clean?
git branch            # are you on main?
git worktree list     # are any worktrees already active?
```

**Decision:**

| Condition | Action |
|-----------|--------|
| Tree is clean AND at/behind `origin/main` | Branch in place is permitted — but see the note below. |
| Tree has uncommitted changes OR is ahead of `origin/main` (incl. on a non-main branch) | Create a worktree — do NOT branch in place. |
| Another session is running in the same tree (any doubt) | Create a worktree — the collision that motivated this rule was a clean-tree branch-in-place while another session held uncommitted WIP. |

**Detecting ahead of origin/main:** after `git fetch origin main`, run:

```bash
git rev-list --count origin/main..HEAD
```

A count `> 0` means the local branch is ahead of `origin/main` — a worktree is required. A count of `0` with a clean tree means branch-in-place is permitted.

**Always cut from fresh `origin/main`**, regardless of which path is chosen:

```bash
git fetch origin main
# For branch-in-place:
git checkout -b feat/<name> origin/main

# For a worktree:
git worktree add -b feat/<name> <path> origin/main
# Verify the HEAD matches the expected remote commit:
git -C <path> log --oneline -1
```

The `git fetch origin main` step is mandatory. It is not sufficient to branch from local `main` —
the local `main` may lag origin by one or more commits, re-introducing a collision. The `git
worktree add ... origin/main` form bases the new checkout from the named remote-tracking ref, which
is always the freshly fetched state.

> **U1 boundary statement (canonical):** A human's own-terminal `git checkout -b` cannot be
> intercepted by any hook. Git has no client-side pre-checkout hook. The `worktree-guard.sh`
> advisory hook fires only on agent-issued Bash tool calls and explicitly cannot cover operations
> a human types in a separate terminal or a second Claude session's own Bash. This start-gate is
> discipline for the human-two-session path — not a technical gate. The mechanical guard only
> covers the orchestrator-driven path.

---

## Rule 2 — No silent reuse: STOP if the target name already exists

Before running `git worktree add` or `git checkout -b`, check for collisions:

```bash
git worktree list               # any existing worktree for this task?
git branch --list feat/<name>   # any existing branch for this task?
```

If a worktree path **or** a branch of the target name already exists, **STOP and ask the
operator** before proceeding. Never silently reuse an existing worktree or branch (Claude Code
issue #51596 — silent hash-collision reuse produces undefined behavior). The operator decides
whether to resume the existing worktree, tear it down and start fresh, or rename the new task.

---

## Rule 3 — Finished means PR merged

A worktree is considered finished only when its corresponding PR has been **merged** to the base
branch — the objective, queryable merge event. "Finished" is not:

- The task passed its acceptance criteria (Stage 2 complete).
- The implementer returned `status: success`.
- The PR was opened.
- The PR was approved.

The worktree stays alive through review. Review-fix commits go into the same worktree on the same
branch — never into a new branch or a separate patch PR. Teardown fires in the delivery agent,
post-merge.

---

## Rule 4 — Teardown on PR merge: clean → remove + prune + verify; dirty → STOP

When the PR is merged, tear down the worktree in this exact sequence:

**If the worktree is clean (no uncommitted changes):**

```bash
git worktree remove <path>
git worktree prune
git worktree list   # verify: the path must NOT appear in the output
```

All three commands are required. `git worktree remove` removes the directory and the internal
git metadata. `git worktree prune` cleans up any stale metadata entries (e.g., if the directory
was already removed externally). The final `git worktree list` check is the verify step — if
`<path>` still appears, teardown did not complete and must be investigated before continuing.

**If the worktree is dirty (uncommitted changes exist):**

Stop. Do not remove. Surface to the operator:
```
STOP: worktree <path> has uncommitted changes — teardown blocked.
Inspect the worktree before removing: cd <path> && git status
Options: (A) commit or stash the changes, then re-run teardown; (B) discard with `git -C <path> checkout .`, then remove; (C) keep for inspection and remove manually later.
```

**Windows file-lock caveat (#57767):** On Windows, VS Code, language servers, or background
indexers may hold file handles in the worktree directory, causing `git worktree remove` to fail
with "failed to remove" even on a clean tree. Repair sequence:

```bash
git worktree prune                   # repairs stale metadata even if directory exists
git worktree remove --force <path>   # force-removes after closing file handles
git worktree list                    # verify again
```

If `remove --force` also fails, close any editor windows targeting the worktree directory, then
retry.

---

## Reviewing a PR

**Why always a worktree (never conditional).** A review must never force you to interrupt, stash, or
finish your current work first. Checking the PR branch out in the shared tree would move the shared
`HEAD` and require abandoning your in-progress task; a dedicated worktree lets the review run in
isolation while your current work stays exactly where it is. This is why review *always* uses a
worktree — not only when the review needs to run the code.

Every PR review materializes the PR branch in an isolated worktree in the same repository, compares it against the base branch, and removes the worktree when the review finishes.

**Teardown triggers — two distinct events:**

| Worktree type | Teardown trigger |
|---------------|-----------------|
| Implement worktree | PR merged to base branch (Rule 3) |
| Review worktree | Review complete — verdict posted (or returned to the skill for publishing) |

**Create:** apply the no-silent-reuse check (Rule 2) first. Use a `.claude/worktrees/pr-review-<number>` sibling path — never check out the PR branch in the shared main tree.

**Compare:** read files from the worktree path; use `git -C <path> diff <base>...HEAD` for the base-vs-head diff.

**Remove on review completion:** the same teardown sequence as Rule 4 applies:

```bash
git worktree remove <path>
git worktree prune
git worktree list   # verify: <path> must NOT appear
```

If the worktree is dirty (unexpected for a read-only review), STOP and surface to the operator — do not force-remove without operator instruction.

---

## Rule 5 — Plan declares the worktree

Every task's `00-state.md` and `01-plan.md` record the worktree so teardown is a deterministic
lookup rather than a search:

```yaml
# in 00-state.md ## Current State
- worktree: {absolute path | null}
- worktree_branch: {branch name | null}
- worktree_base: {origin/main | <dep-branch> | null}
```

```markdown
# in 01-plan.md ## Task List / Task-1 block
- **Worktree:** `<path>` — branch `<branch>`, base `<base>`
```

`null` values are valid for single-session tasks that run branch-in-place. When the worktree
field is populated, delivery reads it directly to know which path to verify and remove. No search
through the filesystem is needed.

---

## Rule 6 — Per-lane worktree (th:lider fan-out)

When th:lider fans out N orquestador lanes — a same-repo multi-task batch, or a multi-project
initiative (`agents/lider.md § Multi-Task fan-out`) — each lane runs in its OWN git worktree. Rules
1–5 apply per lane, with these lane-specific bindings:

- **One worktree per lane, addressed by `git -C`.** Each lane's orquestador operates inside its own
  worktree path; git operations target it explicitly with `git -C {worktree-path} …` rather than
  relying on a shared process cwd — lanes run concurrently and cannot share a working directory.
- **Base = the lane repo's freshly-updated `origin/main`.** Before creating a lane's worktree,
  `git fetch origin main` in that lane's repository, then
  `git worktree add -b {branch} {path} origin/main` (Round 1) — or the completed dependency branch
  for a Round N task. In a multi-project initiative each project is a distinct repository (proven by
  the repo-identity test, `docs/discover-phase.md § 11.6`), so "the lane repo's `origin/main`" is
  per-repo: fetch and base each lane against its OWN origin, never against a sibling project's.
- **STOP-on-unfamiliar-WIP, per lane.** The Rule 1 start-gate and the Rule 2 no-silent-reuse check
  run independently for each lane's target path and branch
  (`agents/lider.md § The fan-out mechanic → Pre-launch collision check`). An existing worktree or
  branch at any lane's target is a per-lane STOP — surface it and wait for the operator; never
  silently reuse or overwrite one lane's target because the other lanes were clean.
- **Plan declares each lane's worktree (Rule 5).** Every lane records its `worktree` /
  `worktree_branch` / `worktree_base` in its OWN orquestador `00-state.md`, so teardown after each
  lane's PR merges (Rule 3/4) is a deterministic lookup, not a filesystem search.

---

## Capability cache — operator-confirmed, version-pinned

The lider+orquestador split is opt-in on confirmed evidence: it runs only after the operator has
confirmed, live, that this Claude Code build supports the nested-subagent gate-messaging round-trip
(M3). That confirmation is recorded as the **capability-cache field**, subject to two floors
(`agents/lider.md § Boot capability check (AC-2.6)`). It gates worktree-lane fan-out transitively —
no orquestador spawns until it passes, so no per-lane worktree (Rule 6) is ever created on an
unconfirmed or version-drifted environment.

- **OPERATOR-CONFIRMED.** The `probe_result: PASS` value lives in the **Operator confirmation**
  section of `tests/evidence/nested-lane-probes.md`, filled ONLY by the operator via the gated
  `/th:setup` step — never written by an agent. An agent may read it; it may never author or advance
  it.
- **Version-PINNED (version-invalidation floor, AC-10.3).** The confirmation is pinned to the
  specific CC `version` it was recorded against. th:lider's boot capability check reads the running
  CC version and INVALIDATES the cached confirmation on any version drift — a PASS recorded on an
  older CC build does not carry forward. If the running version cannot be determined, the
  version-match is treated as FAILED; never assume a match.
- **On invalidation → hard-STOP + re-confirmation; NO monolith fallback.** When the version-pin
  fails (or the confirmation is absent), th:lider does NOT spawn an orquestador and does NOT run the
  pipeline inline as a monolith. It STOPS with a single operator-facing error directing the operator
  to upgrade Claude Code and re-confirm via `/th:setup`. A silent monolith fallback is deliberately
  not provided — it would mask that the split is not actually running. Non-gated direct modes
  (research, translate, diagram, define-ac, security audit) never spawn an orquestador and are
  unaffected by this floor.

---

## Known Caveats

### `worktree.baseRef: "fresh"` regression (#60588)

Claude Code has a documented regression (#60588) where setting `worktree.baseRef: "fresh"` in
settings causes new worktrees to branch from the local HEAD instead of from `origin/main` —
re-introducing the collision this discipline prevents. The 5-rule system does **not** rely on this
setting. Rules 1 and 5 mandate an explicit `git fetch origin main` + `git worktree add -b <branch>
<path> origin/main` + `git log --oneline -1` verification instead. Do not use `worktree.baseRef:
"fresh"` as a substitute for the explicit fetch-and-base sequence.

### Advisory hook scope

`hooks/worktree-guard.sh` fires only on agent-issued `git checkout -b`, `git switch -c`, and
`git worktree add` commands. It does not fire on human-typed terminal commands, commands run in a
second Claude session, or commands run inside a worktree's own Claude session. It is advisory and
fail-open — it cannot be used as a security gate for the human-two-session path.
