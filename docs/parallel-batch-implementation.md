# Parallel Batch Implementation

**Status:** Proven in PR #338 (the Tier 3+4 batch — suites 101–105 implemented concurrently across isolated worktrees, consolidated into one PR). This document codifies that procedure as the normative contract.

Plain reference URL: https://github.com/valianx/team-harness/pull/338

---

## When this applies

This contract applies when ALL of the following conditions hold:

1. **Operator-authorized** — the operator approved the batch and its scope. Same authority gate as the batches in #336 and #338.
2. **Single repo** — every item in the batch lands in the same repository.
3. **ADDITIVE** — every item adds new files or makes pure insertions into existing shared files. No item rewrites or deletes lines owned by another item.
4. **Independent** — no item depends on another item's output at implementation time. Items with a dependency must be serialized.
5. **Pre-reserved suite block numbers** — each item was given its suite block number(s) at plan time. This reservation happens before implementation starts, not during, so concurrent implementers never race to claim the next free number.

If any condition is not met, fall back to the default serial implementation (today's behavior). This contract is opt-in; it never fires automatically.

---

## Intra-task lane fan-out — a third, distinct parallelism mechanism

This document covers ONE parallelism mechanism: an operator-authorized batch of independent ITEMS across isolated worktrees, consolidated into one PR. Team-harness has two other, structurally distinct parallelism mechanisms — naming all three prevents "parallel" from being read as one undifferentiated concept:

| Mechanism | Axis | Unit of fan-out | Gate | Canonical source |
|---|---|---|---|---|
| Inter-task DAG scheduler | tasks within one plan | one implementer per task | none — parallel-by-default, `Depends on:` rounds | `agents/orchestrator.md § Phase 2 — Implementation → Stage 2 scheduler (DAG by Depends on:)` |
| Parallel Multi-Project Dispatch | projects within one initiative | one implement+verify lane per project | operator confirm gate (`parallel` / `serial`) | `agents/leader.md § Parallel Multi-Project Dispatch` |
| Batch Implementation (this document) | independent items across an operator-authorized batch | one implementer per item, own worktree | operator authorization + the 5 preconditions in `## When this applies` | this document |
| **Intra-task execution-lane decomposition** | **files WITHIN one already-approved task** | **one implementer lane per architect-declared, file-disjoint seam** | **`Lane-decomposable: yes` in `01-plan.md` AND `Files:` count ≥ `LANE_DECOMPOSE_MIN_FILES` (8) AND ≥2 disjoint seams** | `agents/orchestrator.md § Phase 2 — Implementation → Intra-task execution-lane decomposition` |

**Intra-task execution-lane decomposition, in brief.** A task's architect-declared `seams:` (disjoint file subsets) and `frozen-contracts:` (shared files/symbols no seam may modify) let the orchestrator fan out ONE task's implementation into up to `LANE_CAP` (5) fresh-context implementer lanes at dispatch time, capped globally at `GLOBAL_ROUND_CONCURRENCY_CAP` (6) concurrent implementer subagents per round (summing inter-task DAG parallelism and intra-task lanes). A lane that discovers it must modify a frozen-contract returns `status: blocked, reason: seam-not-disjoint`; the orchestrator aborts the fan-out and re-dispatches the whole task monolithically — never a silent stop. The DELIVERABLE (plan, commit set, PR) is never divided; only EXECUTION may fan out into bounded lanes — the reader downstream of Phase 2 sees one task, one `02-implementation.md`, one commit set, exactly as the 1:1 path. Full gate mechanics, trace events, and the `00-state.md` schema live at `agents/orchestrator.md § Phase 2 — Implementation → Intra-task execution-lane decomposition`.

**Why this is not the same as this document's batch mechanism.** This document's batch mechanism fans out independent ITEMS — each with its own worktree, its own branch, its own full Stage-1-through-verify pipeline run, consolidated at the END via sequential `git merge`. Intra-task lane decomposition fans out FILES within a SINGLE task that already cleared Stage 1 — lanes share the SAME worktree and branch (deliverable cohesion, not execution cohesion), write disjoint files, and consolidate via a compact status-block report, never a merge. Do not apply this document's worktree-isolation or edit-class-split machinery to lane decomposition; it operates at a different, finer grain.

---

## Worktree isolation

Each item runs in its own `git worktree`. Follow `docs/worktree-discipline.md` rules:

- **Rule 1 (fresh base):** `git fetch origin main` first, then `git worktree add -b <item-branch> <item-path> origin/main`. Verify HEAD is on the fresh `origin/main` base before starting.
- **Rule 2 (no-silent-reuse):** check that neither the branch name nor the worktree path already exists before creating. Stop and report if either conflicts.
- **Rule 5 (plan records the worktree):** record the worktree path, branch name, and base commit in the item's `00-state.md` / `01-plan.md` before the implementer starts. Delivery uses this record for teardown.

Concurrent implementers never contend on the same working tree because each holds its own isolated directory under `.claude/worktrees/<item-branch>/` (or another non-root path).

---

## Concurrent implementer fan-out

Dispatch N implementers in parallel via concurrent `Task` calls in the parent orchestrator session. This is the same in-message mechanism already used for `tester + qa + security` at Phase 3 and for project lanes in `## Parallel Multi-Project Dispatch`.

Cap the concurrency at `batch_concurrency` (default 5) using the eager slot-fill wave model from `agents/leader.md § Multi-Task fan-out`: fill all available slots immediately, and as each item finishes open the slot to the next queued item. This mirrors the Stage-1 planning fan-out (N architects + N plan-reviewers) on the implementation side.

---

## Edit-class split

Every file an item touches MUST be declared in that item's `01-plan.md` with its edit class. There are two classes:

| Class | Examples | Where edited | Reconciliation |
|-------|----------|--------------|----------------|
| **item-local** | new skill/agent/script/doc file; the item's own pre-reserved suite block in `tests/test_agent_structure.py`; the item's own new `docs/` file | inside the item's worktree — no other item touches the same file | wholesale `git checkout <item-branch> -- <item-local-paths>` into the consolidation tree |
| **shared-serial** | `tests/test_agent_structure.py` overall (other items' suite blocks); `docs/testing.md` registry rows; `README.md` / `skills/README.md` listings; `.claude-plugin/plugin.json` + `marketplace.json`; `CHANGELOG.md` / `changelog.d/` entries | NEVER edited inside the worktree — the item declares its reserved insertion block in its plan and does not touch the file | orchestrator extracts each item's added block and splices all blocks centrally in reserved order at consolidation |

**The invariant:** a shared-serial file is never edited in an item's worktree. An item that needs to contribute to a shared-serial file declares its reserved insertion block in the plan (`01-plan.md` § Files, with class: `shared-serial`, content: `<the exact insertion>`). The orchestrator performs the splice centrally.

Items that touch only item-local files can be fully autonomous in their worktree (no coordination needed at file-write time). Items that touch shared-serial files are autonomous in their worktree too — they just do not write those files; the orchestrator handles the write at consolidation.

---

## Consolidation

Consolidation reuses the discipline of merging several PRs one at a time — applied to the item branches so the batch ships as ONE PR instead of N. It runs after all N implementers have finished and each item has passed its in-worktree verify. A SINGLE consolidator (a dedicated consolidator orchestrator) creates the integration branch (the eventual PR head) from the fresh base, then merges each item branch into it one at a time.

### Sequential merge, validate after each

```bash
git switch -c <integration-branch> <base>      # base = origin/main (fresh)
# then, per item, in reserved order (lowest reserved suite number first):
git merge <item-branch>                         # resolve conflicts (below)
bash tests/run-all.sh                           # validate; continue only when green
```

Validate after EVERY merge, not only at the end. Incremental validation localizes any failure to the item just merged (or its interaction with what is already integrated), and catches a contaminated or mislabeled item commit at the merge that introduces it — a single end-of-batch run cannot.

### Conflict resolution

git auto-merges disjoint edits (e.g., two items editing different regions of the same agent file). The expected conflicts are the shared-serial append points — two items each adding a suite block before the same `# Summary` anchor, or a row to the same `docs/testing.md` registry. Resolve by KEEPING ALL blocks in reserved order; never drop one and never pick a "winner". These are additive conflicts, not competing edits.

Item-local files (those only one item touches) ride along in that item's merge automatically — the edit-class split guarantees no two items touch the same item-local file, so they never conflict.

### Version + CHANGELOG

Done ONCE, after all items are merged and the full suite is green, by the delivery agent. Items do not bump the version individually. Open the PR only when every item branch is merged and `run-all.sh` is green on the integration branch.

### Evolution from the splice method

The first batch (PR #338) consolidated by hand-splicing each item's added lines into the shared files. A later batch hit cross-contamination (two worktrees' copies of the shared test file cross-mixed) and a global-guard collision (a new suite embedding literal agent-tokens that the whole-file guard scans for) — both caught only by the final run, not localized. Sequential `git merge` + validate-after-each replaces the splice: git surfaces real conflicts (resolved by keeping all blocks), and per-merge validation localizes failures. This is the hardened method.

---

## Verify

### Per-item (in the worktree)

```bash
python3 tests/test_agent_structure.py
```

Run this directly in the item's worktree. Do NOT run `bash tests/run-all.sh` concurrently across items. The reason: `run-all.sh` chains `checkpoint-guard.sh` on stdin; concurrent invocations contend on stdin and orphan bash process trees on Windows, leaving zombie processes and incomplete test output (confirmed platform constraint on Windows 11).

The per-item run is **necessary but not sufficient**. It confirms the item's own suite block passes and no preexisting suite regressed. It cannot detect cross-item interactions (e.g., two items that each pass alone but conflict when their shared-serial contributions are concatenated).

### Consolidated (once)

After consolidation, on the consolidated tree:

```bash
bash tests/run-all.sh
```

Run the full suite exactly once. This is the mandatory safety net. It covers:

- All structural checks (`test_agent_structure.py` — the concatenated suite blocks run together).
- `policy-block.sh` secret-scan of all new content.
- Agent frontmatter validation across all modified agents.

The consolidated full-suite run is the gate that separates the parallel implementation phase from delivery.

## Consolidator role and directives

Consolidation is owned by a SINGLE designated consolidator — a dedicated consolidator orchestrator, never a worker subagent and never split across actors. The consolidator is the only writer of shared-serial files; parallel implementers never reconcile each other's work. The single-owner rule exists because concurrent implementers can contaminate even a notionally-isolated shared file — observed live, two worktrees' copies of `tests/test_agent_structure.py` cross-contaminated, each commit carrying the other item's suite block.

Four directives:

1. **Re-derive, do not trust.** Treat every worktree's copy of a shared-serial file as untrusted. Rebuild each shared-serial file from `base + each item's reserved block` (extract each item's block via `git diff <base>..<item-branch>`); never adopt a worktree's mutated shared file wholesale.
2. **All new suites must pass together.** Run `bash tests/run-all.sh` exactly once on the consolidated tree; every separately-authored suite must pass in that single together-run. A per-item in-worktree pass is necessary but never sufficient — the together-run is the gate, and consolidation is not done until it is green.
3. **No new suite may break a global guard.** A new suite's non-comment source must not embed the literal agent-invocation tokens that the whole-file free-suite guard scans for; phrase no-agent-call descriptions generically and assemble the tokens in variables (`"Age" + "nt("`), as the sibling suites do. Observed live: a new suite's check description embedded the literal tokens and tripped the whole-file guard — caught only by the together-run.
4. **One actor, one sequence.** The consolidator performs item-local checkouts, shared-serial re-derivation, the single version bump, and CHANGELOG assembly as one serial sequence in the parent session — never concurrently.
