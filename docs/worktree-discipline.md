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

### Codex protected-`.git` boundary

Gate 1 is functional authority for the approved implementation. It is never a
technical sandbox grant. In Codex `workspace-write`, the repository worktree
may be writable while the shared `.git` metadata remains protected; `git
worktree add` writes both a branch ref and `.git/worktrees`, so Main must obtain
native approval for that exact local command independently of the Gate-1
release and its auto-ship policy.

The plan records the absolute worktree path, branch, and an immutable base
commit before Gate 1. Physical creation happens only after a valid Gate-1
authority event exists in the v5 control log and before any implementation
dispatch. Main first performs the
read-only Rule-2 collision checks, verifies the base object, and proves the
planned path is equal to or below one of the current native `writable_roots`.
An escalated `git worktree add` can create a path that ordinary patch/edit
operations still cannot write; command approval is therefore not evidence of
implementation access. When only the repository root is writable, use an
ignored contained worktree path or branch in place. Main then runs the
single exact argv-equivalent command:

```bash
git worktree add -b <branch> <absolute-path> <immutable-base-sha>
```

If the sandbox rejects protected Git metadata, retry that same narrowly scoped
command through the native escalation surface. Never widen a writable root to
include `.git`, pre-authorize a blanket Git rule, substitute a clone/copy, or
implement in the dirty checkout. A native approval-review timeout is neither a
denial nor a functional pipeline failure: it does not revoke Gate 1, create a
replacement attempt, or authorize another automatic escalation. Keep
`phase: implementation`, set `status: paused`, and make `next_action` identify
the one exact pending worktree command. Report one instruction to approve that
technical action. A later live operator approval authorizes one resubmission of
the same escalation; it does not itself make `.git` writable.

The same separation applies after creation. Before a committing specialist is
dispatched, Main resolves `git rev-parse --absolute-git-dir`. If that directory
is outside the live writable roots—normally
`<main>/.git/worktrees/<name>`—the packet declares
`git_metadata_write_mode: native-escalation-required`. Source edits and tests
remain sandboxed normally; only exact path-scoped `git add` and `git commit`
(or a same-owner, no-intervening-commit amend) retry through native escalation
with `login:false` when protected index/ref writes fail. This never authorizes a
blanket `.git` root, broad staging, reset, or hook bypass.

A canonical worktree is also the concurrency boundary. Even disjoint source
paths share its index/ref metadata and repository-wide checks. Team Harness
therefore dispatches committing tester/implementer tasks sequentially within
one worktree and parallelizes only across distinct canonical worktrees or
repositories. A global diagnostic caused solely by another legacy active lane
is recorded as `concurrent-lane-interference` and rerun once by Main after the
round barrier on the consolidated clean tree.

On success, verify the registered path, exact branch, and `HEAD ==
<immutable-base-sha>` before setting `working_branch` or dispatching. On
recovery, all absent means resume the same technical approval; all matching
means verify and continue; any partial or mismatched branch/worktree state is a
collision that stops for operator direction without destructive repair.

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

**Teardown ownership (see Rule 7).** Delivery performs no post-PR tail and never touches
worktrees. The durable reaper is the **preflight sweep at `th:orchestrator` Intake step 1a**,
which handles a worktree whose PR merged after the originating session ended. Rule 4 remains the
exact removal protocol used once Rule 7's safety predicate clears.

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
- worktree_base: {immutable commit SHA | null}
```

```markdown
# in 01-plan.md ## Task List / Task-1 block
- **Worktree:** `<path>` — branch `<branch>`, base `<base>`
```

`null` values are valid for single-session tasks that run branch-in-place. When the worktree
field is populated before creation, it is the declared target rather than proof that the
filesystem entry already exists; `working_branch` stays `null` until the verified creation.
The coordinator and later preflight sweep use the recorded topology as the durable coordinate.
No filesystem search is needed.

---

## Rule 6 — Per-lane worktree — RETIRED for coordinator fan-out; worktree-per-project survives serially

**The coordinator-level fan-out this rule gated is retired.** It described two mechanisms that no
longer exist: a same-repo multi-task batch spawning one orchestrator instance per task (retired —
`agents/ref-dispatch-machinery.md § "What left this file"` names the multi-task fan-out and its
consolidator removed, measured at 0.6% of runs, both operator overrides), and a multi-project
initiative spawning one orchestrator instance per project concurrently. The latter survives only
as a **serial** sequence inside the single coordinator (`agents/ref-dispatch-machinery.md §
"Multi-project sequencing"`) — one project runs to completion before the next starts, so there is
no concurrent-lane collision class for this rule's per-lane STOP-on-unfamiliar-WIP check to guard
against. Each project may still use its own worktree, because each is a genuinely distinct
repository (proven by the repo-identity test, `agents/ref-dispatch-machinery.md § "Repo-identity
verification"`) — Rules 1–5 apply to that worktree exactly as they do to any single-project run,
with no lane-specific binding needed since nothing runs concurrently. Intra-task parallelism
(`agents/ref-pipeline.md § "Intra-task lane decomposition"`) is a different mechanism entirely and
was never governed by this rule: its lanes share ONE worktree and branch, with the coordinator as
sole committer of the consolidated result.

---

## Rule 7 — Boot-time preflight sweep: the durable worktree reaper

The **durable reaper** is this Rule 7's preflight sweep, run by `th:orchestrator` at Intake step
1a (`agents/ref-pipeline.md § "Intake"`) — the first point in any later session that runs after a
previous session's PR could have merged.

This rule is the **canonical, single source of truth** for the worktree-sweep safety predicate.
`agents/ref-pipeline.md § "Intake"` references this rule by pointer and never re-derives or
duplicates the predicate, allow-list, or action/report table. A divergence is a defect.

### The safety predicate — four cumulative conditions

All FOUR conditions below must hold for a worktree to be auto-removed. Any single failure means
**leave it and report** — never a silent skip, and never an auto-removal on a partial match.

**1. Not the main tree and not the current session's own active worktree.** Exclude the
repository's main working tree. Exclude the worktree this session itself is actively using, via TWO
independent signals — both applied, neither replacing the other:

- **Canonical-path comparison against the resolved session cwd/repository root.** Available at
  boot time regardless of whether any state file exists yet. Compare each candidate worktree's
  canonical path against the currently-resolved session cwd; a match excludes it. This is the
  primary signal and the only one guaranteed to exist at the very start of a boot sequence.
- **The `worktree:` field of this session's own `00-state.md`** (Rule 5's existing mechanism),
  when one already exists at this point in the boot sequence — a secondary, additional exclusion,
  not a substitute for the cwd comparison.

A session boots before its own `00-state.md` is written, so the state-file signal alone can miss
the exclusion at that moment; the cwd comparison closes that gap independent of file-write timing.
Either signal matching excludes the candidate.

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

**Force-repair safety check — mandatory at this rule's automated call sites.** The 1–4 row above
delegates to "Rule 4's exact protocol," which includes a repair sequence for when the initial,
non-forced `git worktree remove` fails: `git worktree prune` then `git worktree remove --force
<path>` (Rule 4's "Windows file-lock caveat"). Rule 4's own text does not check WHY the initial
removal failed before escalating to `--force` — for a human executing Rule 4's protocol manually,
that is an acceptable simplification (the human can read the actual git error before deciding
whether to force). For THIS rule's sweep there is no human in the loop: an unattended,
agent-executed force-removal
cannot tell a genuine Windows file-lock quirk apart from git correctly REFUSING to delete a tree
that became dirty after the sweep's last check (e.g., a human's uncommitted edit landing in the
window this rule's own Atomicity discipline and Lock protocol below disclose as still open). Blindly
forcing in that second case destroys exactly the work git's own refusal was protecting.

Before invoking Rule 4's `git worktree prune` + `git worktree remove --force <path>` repair on an
initial-remove failure, collapse the re-check and the repair itself into **one single Bash tool
invocation** — a shell conditional, not two separate agent-issued tool calls:

```bash
porcelain="$(git -C <path> status --porcelain)"
tainted="$(printf '%s\n' "$porcelain" | awk '{code=substr($0,1,2); if (code=="??" || code ~ /D/) print}')"
if [ -z "$porcelain" ] || { [ -z "$tainted" ] && \
    [ -z "$(git -C <path> diff --numstat | awk '$1!=0||$2!=0')" ] && \
    [ -z "$(git -C <path> diff --cached --numstat | awk '$1!=0||$2!=0')" ]; }; then
  git worktree prune; git worktree remove --force <path>
else
  echo "ABORT: worktree became dirty since last check, not force-removing"
fi
```

- The `if` branch fires only when the re-check comes back **still clean** (mode-only-or-nothing,
  per the numstat allow-list already specified above) → proceed with the force-repair sequence —
  this is the genuine platform-quirk case Rule 4's caveat was written for.
- The `else` branch fires when the re-check comes back **now dirty** (a real content change) → do
  NOT force. Abort the removal for this candidate and fall through to the "fails 4 (dirty by
  content)" row above — treat it exactly like a first-pass dirty result, never force-remove content
  that became genuinely dirty after the last check.

Two prior rounds re-checked dirtiness and then force-removed as two *separate* Bash tool calls,
leaving an LLM-inference/dispatch-latency window (seconds to tens of seconds) between the check and
the force-call — a fresh writer could land content in that gap with zero backstop once force was in
play. Folding check + prune + force into one shell invocation narrows that window down to genuine
OS-level command latency (milliseconds), the practical minimum achievable in this tool-call
execution model. This is **not** a claim of full atomicity: the shell still executes `prune` and
`remove --force` as sequential OS processes inside that one invocation, and the `if` condition is
still evaluated before — not simultaneously with — the removal it gates. What this change closes is
specifically the agent-latency multiplier the last two rounds found, not the underlying
sequential-steps nature of check-then-act.

This closes the specific gap in the Lock protocol's own residual-closure claim below: the *initial*
`git worktree remove` call never uses `--force`, but Rule 4's repair-on-failure step does,
unconditionally — and only at this rule's automated call sites was that unconditional escalation
missing a human able to notice the difference. Rule 4's own original teardown-protocol text and
caveat (`## Rule 4` above, used by human-manual teardown flows outside this automated-sweep scope)
are unchanged by this safeguard.

### Atomicity — the window is narrowed, never closed

The sweep reads a worktree's state and then acts on it, so the state can change in between. Keep
the gap small: re-check the four conditions immediately before removing, and treat any change as
a reason to skip rather than to proceed. The window is not eliminated and no claim here should
say otherwise.

A prior revision specified a mkdir-based mutex with holder files and sanitized lock keys to
serialize concurrent sweepers. Nothing has ever implemented it and no incident called for it —
the sweep runs at boot in one session. Two sessions booting at once remains the case this does
not cover; a skipped removal is the failure mode, which is the safe direction.

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

The sweep runs per-repo, at the point where `th:orchestrator` touches that repo, respecting Rule 6's
per-lane isolation: a sibling project in a multi-project initiative is a distinct repository, and
the sweep never runs against a repo other than the one it is currently evaluating.

---

## Capability cache — RETIRED

**This entire mechanism is retired, not reduced.** It gated a prior two-coordinator design: a
`th:leader` that would not spawn a second-coordinator `th:orchestrator` subagent until the
operator had confirmed, live, that the running Claude Code build supported the nested-subagent
gate-messaging round-trip (M3), version-pinned and re-invalidated on drift. The coordinator
fusion removes the spawn this cache gated — `th:orchestrator` is the top-level session agent and
never dispatches another coordinator (`agents/ref-pipeline.md § "Dispatch invariants"` #2,
`agents/ref-pipeline.md § "No capability-check fallback"`) — so there is no nested-subagent
round-trip left to probe, no capability cache to consult, and no version-pin to invalidate.
Nothing replaces this mechanism; the retirement is a genuine loss of subject.

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
