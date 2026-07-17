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
branch — never into a new branch or a separate patch PR.

**Teardown ownership (corrected — see Rule 7).** An earlier version of this rule stated that
teardown "fires in the delivery agent, post-merge." That is aspirational, not what actually
happens: `delivery` opens the PR in Phase 4 and its own run ends before a human or CI merges it —
`delivery` has no live trigger for a merge event that happens after its own session is over. In
the ordinary single-session flow, `delivery`'s own teardown attempt (Step 11.4b) is a
**same-session best-effort**: it only removes the worktree when the PR is somehow already merged
by the time delivery runs (e.g., an auto-merge landed mid-session). The **durable reaper** for the
general case — a worktree whose PR merges in a later session, which is the common case — is the
**preflight sweep at `th:leader`'s boot** (Rule 7 below). The Rule 4 teardown protocol itself is
not removed by this correction; it is still the exact sequence both the same-session best-effort
and the boot-time sweep execute once their own gate condition is met.

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

## Rule 6 — Per-lane worktree (th:leader fan-out)

When th:leader fans out N orchestrator lanes — a same-repo multi-task batch, or a multi-project
initiative (`agents/leader.md § Multi-Task fan-out`) — each lane runs in its OWN git worktree. Rules
1–5 apply per lane, with these lane-specific bindings:

- **One worktree per lane, addressed by `git -C`.** Each lane's orchestrator operates inside its own
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
  (`agents/leader.md § The fan-out mechanic → Pre-launch collision check`). An existing worktree or
  branch at any lane's target is a per-lane STOP — surface it and wait for the operator; never
  silently reuse or overwrite one lane's target because the other lanes were clean.
- **Plan declares each lane's worktree (Rule 5).** Every lane records its `worktree` /
  `worktree_branch` / `worktree_base` in its OWN orchestrator `00-state.md`, so teardown after each
  lane's PR merges (Rule 3/4) is a deterministic lookup, not a filesystem search.

---

## Rule 7 — Boot-time preflight sweep: the durable worktree reaper

`delivery`'s Step 11.4b teardown is a same-session best-effort (see Rule 3's correction above) — it
almost never fires, because the PR it just opened is rarely merged before its own run ends. The
**durable reaper** is this Rule 7's preflight sweep, run by `th:leader` at boot, before it fans out
into `th:orchestrator` (`agents/leader.md § Phase 0a`) — the first point in ANY later session that
runs after a previous session's PR could have merged.

This rule is the **canonical, single source of truth** for the worktree-sweep safety predicate.
`agents/leader.md` (the boot-time preflight sweep) and `agents/delivery.md` Step 11.4b (the
same-session teardown) each REFERENCE this rule by pointer — neither re-derives or duplicates the
predicate, the allow-list, or the action/report table. A divergence between what either site does
and what is written here is a defect in that site, not an allowed variation.

### The safety predicate — four cumulative conditions

All FOUR conditions below must hold for a worktree to be auto-removed. Any single failure means
**leave it and report** — never a silent skip, and never an auto-removal on a partial match.

**1. Not the main tree and not the current session's own active worktree.** Exclude the
repository's main working tree. Exclude the worktree this session itself is actively using — read
the `worktree:` field of this session's own `00-state.md`, if one already exists at this point in
the boot sequence (Rule 5's existing mechanism supplies this field; no new lookup is invented).

**2. Pipeline provenance.** Either signal is sufficient:
- The branch name matches a conventional pipeline prefix (`feat/`, `fix/`, `refactor/`, `chore/`,
  `docs/`) — a primary signal.
- The worktree is registered in a discoverable `00-state.md` (`worktree:` field, Rule 5) —
  authoritative confirmation, stronger than the branch-name signal alone.

Neither signal present → provenance is unknown. Leave it and report as a candidate; never
auto-remove on unknown provenance.

**3. Branch merged to `origin/main` AND no commits ahead of the merge point.** Two
sub-conditions, AND-ed — both must hold, not either:

- **Merged.** Preferred: `gh pr view <branch> --json state,mergedAt` reports `MERGED` — this is a
  read-only call and does not require `gh auth switch`. Fallback when `gh` is unavailable:
  `git branch --merged origin/main` (ancestry check). See the squash-merge caveat below for this
  fallback's coverage limit.
- **No commits ahead.** `git -C <path> rev-list origin/main..HEAD` MUST be empty. A `MERGED` result
  (or a merge-ancestry match) does **not**, by itself, prove no work would be lost: it does not
  catch (a) a follow-up commit made in the worktree *after* the merge, with no new PR opened, where
  `gh pr view` still reports the old PR as `MERGED` and `git status` is clean because the follow-up
  work is committed, not just staged; or (b) a reused branch name, where `gh pr view <branch>` maps
  to a *prior* merged PR while the worktree's `HEAD` carries new, unmerged commits under the same
  branch name. AND-ing the commits-ahead check onto the merge check closes this gap: any commit past
  the merge point treats the worktree as unmerged.

Either sub-condition failing → treat the worktree as **unmerged**. Leave it and report; never
auto-remove.

**4. Clean beyond a mode-only allow-list.** `git -C <path> status --porcelain` must show nothing
except mode-only diffs:

- A modified path is **mode-only** — and does not count as dirty — only when BOTH
  `git -C <path> diff --numstat` and `git -C <path> diff --cached --numstat` show `0\t0` for that
  path (the canonical example: an executable-bit flip on `hooks/sketch-guard.sh`, tracked without
  content changes).
- Any modified path with a **non-zero** numstat on either command is a content change — blocks
  removal.
- Any **untracked** (`??`) path, or any **deleted** path, is a content change — blocks removal.

One non-mode-only entry anywhere in the status output fails this condition entirely — it is not a
per-file partial removal, it is a per-worktree pass/fail.

### Action and report table

| Conditions met | Action | Report |
|---|---|---|
| 1–4 (all) | Remove — `git worktree remove <path>` + `git worktree prune` + verify with `git worktree list` (Rule 4's exact protocol) | `worktree_swept: removed <path> (branch merged, clean)` |
| 1–3, fails 4 (dirty by content) | Leave | `worktree_swept: left <path> — uncommitted changes: <files>` |
| 1–2, fails 3 (unmerged, or merged-but-commits-ahead) | Leave | `worktree_swept: left <path> — branch unmerged` (or `— commits ahead of merge point` for the commits-ahead sub-case) |
| 1 only, fails 2 (provenance unknown) | Leave | `worktree_swept: candidate <path> — unknown provenance, not auto-removed` |

Never a silent, permanent skip: an unresolved worktree's report line reappears at every boot until
the operator resolves it (merges the branch, cleans the tree, or removes it manually).

### Atomicity discipline — minimize the TOCTOU window, do not claim to eliminate it

The four-condition predicate above is prose evaluated by an agent through separate, sequential
Bash tool calls — `git worktree list`, `gh pr view`/`git branch --merged`, `git rev-list`,
`git status`/`git diff --numstat`, and the final `git worktree remove` are each an independent
invocation, not one atomic transaction. There is no file-system lock, no PID file, and no
mutual-exclusion mechanism serializing this sweep against a concurrent writer. This is a genuine
time-of-check-to-time-of-use (TOCTOU) window: work can land in a candidate worktree after the
sweep's own safety check and before its `git worktree remove` call.

To minimize this window, the sweep MUST follow this discipline for every candidate:

1. **Process one worktree candidate fully before starting the next.** Do not evaluate conditions
   1–4 across all candidates first and remove them in a second pass. Each candidate goes through
   check → immediate re-check → remove-or-leave, in that order, before the sweep moves on to the
   next candidate.
2. **Re-verify conditions 3 and 4 immediately adjacent to the `git worktree remove` call for that
   specific worktree.** Once the first full four-condition pass qualifies a candidate for removal,
   re-run condition 3 (merged AND no commits ahead) and condition 4 (clean beyond the mode-only
   allow-list) again, right before issuing `git worktree remove <path>` — with no other Bash call,
   no other worktree's processing, and no unrelated work interleaved between this final re-check
   and the removal of that same worktree.
3. **Any re-check failure aborts the removal for that candidate.** If the immediate re-check finds
   a new commit, an unmerged state, or a dirty tree that the first pass did not see, treat the
   worktree as if it had failed the predicate on the first pass — leave it and report; do not
   remove.

**Residual risk, named honestly.** This discipline minimizes the TOCTOU window; it does not close
it. There is no true file-system-level lock in this agent-instruction-driven protocol — a human
editing or committing to the same worktree in the window between the final re-check and the
`git worktree remove` call is still technically possible and would not be caught. That window is
the width of several sequential tool-call round-trips — the re-check alone spans `git rev-list`,
`git status`/`git diff --numstat`, then the removal call itself, each a separate agent-issued Bash
invocation carrying its own inference and dispatch latency — realistically seconds to tens of
seconds, not sub-second, since this discipline runs as agent-issued commands, not a single atomic
system call. Any earlier framing of this predicate as one that "cannot cause a false removal" only
holds for a single atomic evaluation, which this multi-step, agent-executed reality is not. The
realistic concurrent writer is the human-two-session path (Rule 1's own U1 boundary statement) — a
human actively working in a worktree the sweep independently determines is merged-and-clean. This
is a low-frequency, bounded exposure (only uncommitted or committed-but-unmerged work landing in
that window is at risk; a worktree that is genuinely merged-and-clean at both checks has nothing
left to lose), not a claim of zero risk.

### Lock protocol — serializing cooperating sweepers (layered atop atomicity discipline)

The atomicity discipline above minimizes the TOCTOU window but cannot close it, because it runs as
sequential agent-issued Bash calls with no mutual-exclusion primitive. This subsection adds a
directory lock as an ADDITIONAL, external layer — it does not replace the atomicity discipline
above, which remains the sweep's only defense against a non-cooperating writer (see "Residual
closure" at the end of this subsection).

**1. Acquisition primitive — `mkdir "$LOCK"`.** `mkdir` of a not-yet-existing directory is atomic
creation in a single shell invocation: it fails with a nonzero exit (`EEXIST`) if the directory
already exists, and that atomicity is an OS-level guarantee (`mkdir(2)`), not a shell option.
Rejected alternative: `set -C; > file` (`noclobber`) — (a) `set -C` is a shell option, not an OS
guarantee, and its behavior is not uniform across Git Bash / non-bash shells / PowerShell (this repo
is cross-platform, per `CLAUDE.md §3`); (b) it persists in the shell's own state and would affect
every later redirection in that agent session; (c) a lock directory gives a natural place to also
hold the holder file. Acquisition and metadata write happen in one step:
`mkdir "$LOCK" 2>/dev/null && printf '...' > "$LOCK/holder"` — the `mkdir` is the atomic gate; the
`printf` only runs if the race was won.

**2. Location — central, under the common git dir, never inside the worktree.**
`LOCK_ROOT="$(git -C <path> rev-parse --git-common-dir)/th-worktree-sweep-locks"`;
`LOCK="$LOCK_ROOT/<key>.lock"`, with `<key>` the worktree's absolute path, sanitized (every run of
non-alphanumeric characters replaced by a single `-`; the path is already unique, so no collision
and no hashing tool is needed). Rationale: `git worktree remove <path>` deletes (a) the working
directory at `<path>` and (b) the per-worktree admin directory at
`<main>/.git/worktrees/<name>/` — it never touches any other path under the common `.git`. Living in
a sibling namespace under the common `.git` means: (i) `git worktree remove` (with or without
`--force`) never sees, rejects, or deletes it; (ii) `git status` of any tree never reports
`.git/**` as untracked, so the lock never trips condition 4 of the predicate above (a lock placed
inside the working tree would — that is why it is rejected); (iii) the lock survives the remove, so
release is deterministic and stale detection is always reachable (the lock always sits at a
computable path, never "stale-undetectable").

**3. Holder identification.** A `holder` file inside the lock directory, one `key=value` per line:
`pid=<acquiring shell's PID>`, `host=<hostname>`, `epoch=<acquisition epoch-seconds>`,
`holder=<th:leader-preflight-sweep | delivery:<feature>>`. `pid`/`host` are diagnostic only — for
the report line when a lock is found already held — not the operative liveness signal: the "holder"
is an ephemeral LLM-agent process with no reliable heartbeat (the shell that ran `mkdir` exits once
that command returns, so `kill -0 <pid>` is not reliable). The operative liveness signal is the
lock's age (next point).

**4. Stale-lock expiry — 15 minutes.** A lock is held only for the duration of one worktree's
re-check-to-remove sequence (seconds to tens of seconds, per the atomicity discipline above). 15
minutes is roughly 30-100x that expected hold, so an older lock is overwhelmingly likely orphaned (a
crashed or abandoned agent session), while still short enough that it does not block the next
legitimate sweep (the next boot is typically more than 15 minutes later). Single-invocation, portable
check (GNU/BSD/Git-Bash `find`): `find "$LOCK" -maxdepth 0 -mmin +15` prints the path when the lock
directory's mtime (set at `mkdir` time) is older than 15 minutes, empty otherwise. Age by mtime is
the signal — not the holder file's contents, which stay diagnostic-only. If stale: break it
(`rm -rf "$LOCK"`) and retry acquisition. **Named residual (stale-break race):** breaking a stale
lock is itself a small race — two processes could both see it as stale, both `rm -rf`, both
`mkdir`, and the loser's `rm -rf` could delete the winner's fresh lock (both then believe they hold
it). Accepted, because: (a) it only happens when breaking an ALREADY-stale lock (the prior holder
already crashed or was abandoned — a rare event, not the steady state); (b) it only affects sweep
ORDERING, never causes data loss by itself — every sweeper that proceeds after a stale-break still
runs the full four-condition predicate plus the immediate-adjacency re-check (atomicity discipline,
retained) before `git worktree remove`; the lock is a serialization optimization, not the safety
mechanism. Deliberately kept simple (an age check via `find`, not a full health-check protocol).

**5. Fail-safe defaults.** (a) **Acquisition fails** (another process holds a live, non-stale lock):
skip that worktree this pass, report, retry next boot — the same "never a silent, permanent skip"
contract Rule 7 already carries; report line
`worktree_swept: left <path> — sweep lock held (retry next boot)`. (b) **The lock mechanism itself
errors** (e.g., `rev-parse --git-common-dir` fails, `mkdir` fails for a reason other than `EEXIST`,
`find` errors, a filesystem permission error): treat as "cannot proceed safely" — leave the
worktree, report, do NOT remove; report line
`worktree_swept: left <path> — lock mechanism error, not auto-removed`. **Fail-safe direction:**
here the safe default is to LEAVE (conservative, no deletion) — not fail-open — unlike the guard
(whose fail-open permits a push, a recoverable action); here deletion is unrecoverable, so the
failure direction must be "do not delete". This is fail-safe, consistent with this repo's
convention for destructive operations.

**Sequence and release.** Acquire the lock → [re-check conditions 3 and 4 (atomicity discipline,
retained) + `git worktree remove` while holding the lock] → release (`rm -rf "$LOCK"`, best-effort;
if it fails, the stale-expiry check above cleans it up on a later pass). Release happens on BOTH the
remove path and the leave path — the lock is acquired for the re-check; it is released once a
decision is made either way.

**Residual closure — honest, not overclaimed.** Acquiring the lock immediately before the final
re-check and holding it through `git worktree remove` fully CLOSES the TOCTOU window for
COOPERATING processes: two `th:leader`/`delivery` instances that both follow this protocol
serialize — one acquires, the other's `mkdir` fails (`EEXIST`), so it skips that worktree, reports,
and retries next boot; the two can never both be inside the re-check-to-remove window for the same
worktree at the same time. The sweeper-vs-sweeper race that originally motivated the atomicity
discipline above is now fully closed. **Remaining residual (NOT closed by the lock):** a genuinely
non-cooperating actor — a human editing files directly in the worktree through their own terminal
(the human-two-session path) who never runs `mkdir` on the lock — is not coordinated by it (the lock
coordinates sweepers with each other, not a sweeper with a human's raw `git commit`/edit). Against
that human writer, the only defense remains the atomicity discipline above (which still catches a
commit landing before the final re-check); the one truly irreducible sliver is a human edit/commit
landing in the single-tool-call gap between the final re-check and the `git worktree remove` call
itself — the residual already named in the atomicity discipline subsection, which the lock does not
narrow (it was never sweeper-vs-sweeper contention to begin with). Additional bound (not
overclaimed): the removal never uses `--force` at either site, so a tree the human left dirty makes
`git worktree remove` REFUSE (a git-level backstop); and a human commit in that sliver survives on
the branch ref/reflog after the remove (the remove deletes the working directory and per-worktree
admin metadata, not the branch or its commits) — genuinely unrecoverable loss is limited to
uncommitted work in that sliver, which git's refusal-without-`--force` already covers. **The lock
does not eliminate the risk an out-of-band human edit could cause; it reduces it to that bounded
sliver and names it explicitly.**

### Squash-merge detection limit (documented, not a bug)

The durable reaping path depends on `gh pr view` succeeding for the `MERGED` detection. The
`git branch --merged origin/main` fallback is **conservative-only**: it cannot detect a
squash-merged branch, because squash-merge creates a brand-new commit on `main` and the feature
branch's tip is never that commit's ancestor. This repository's actual merge norm is squash-merge.
Consequence, stated plainly: a squash-merged worktree is never wrongly removed (the fallback simply
never confirms "merged" for it, so condition 3 fails and it is left) — but it is also **never
auto-reaped by condition 3's ancestry check even when `gh` access IS available**, because
`git -C <path> rev-list origin/main..HEAD` is never empty for a squash-merged branch's tip (the tip
commit itself is not on `main`; only its squashed content is). For a repo that squash-merges, this
sweep's practical auto-removal coverage is limited to non-squash-merged branches. Squash-merged
worktrees will keep being reported as candidates at every boot and likely need periodic manual
`git worktree remove` / `git worktree prune`.

### Nature of the operation

`git worktree remove` is a **local** git operation — it is not an outward action, and it is NOT
gated by `dev-guard`. It may still prompt for local filesystem-write permission under the
operator's own permission system; that prompt is expected and acceptable for a destructive-lite
local operation, and is a separate concern from the outward-action gate. Never use `--no-verify` or
bypass a hook to force a removal through.

### Composition with Rule 6

The sweep runs per-repo, at the point where `th:leader` touches that repo, respecting Rule 6's
per-lane isolation: a sibling project in a multi-project initiative is a distinct repository, and
the sweep never runs against a repo other than the one it is currently evaluating.

---

## Capability cache — operator-confirmed, version-pinned

The leader+orchestrator split is opt-in on confirmed evidence: it runs only after the operator has
confirmed, live, that this Claude Code build supports the nested-subagent gate-messaging round-trip
(M3). That confirmation is recorded as the **capability-cache field**, subject to two floors
(`agents/leader.md § Boot capability check (AC-2.6)`). It gates worktree-lane fan-out transitively —
no orchestrator spawns until it passes, so no per-lane worktree (Rule 6) is ever created on an
unconfirmed or version-drifted environment.

- **OPERATOR-CONFIRMED.** The `probe_result: PASS` value lives in the **Operator confirmation**
  section of `tests/evidence/nested-lane-probes.md`, filled ONLY by the operator via the gated
  `/th:setup` step — never written by an agent. An agent may read it; it may never author or advance
  it.
- **Version-PINNED (version-invalidation floor, AC-10.3).** The confirmation is pinned to the
  specific CC `version` it was recorded against. th:leader's boot capability check reads the running
  CC version and INVALIDATES the cached confirmation on any version drift — a PASS recorded on an
  older CC build does not carry forward. If the running version cannot be determined, the
  version-match is treated as FAILED; never assume a match.
- **On invalidation → hard-STOP + re-confirmation; NO monolith fallback.** When the version-pin
  fails (or the confirmation is absent), th:leader does NOT spawn an orchestrator and does NOT run the
  pipeline inline as a monolith. It STOPS with a single operator-facing error directing the operator
  to upgrade Claude Code and re-confirm via `/th:setup`. A silent monolith fallback is deliberately
  not provided — it would mask that the split is not actually running. Non-gated direct modes
  (research, translate, diagram, define-ac, security audit) never spawn an orchestrator and are
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
