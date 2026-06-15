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

## Worktree isolation

Each item runs in its own `git worktree`. Follow `docs/worktree-discipline.md` rules:

- **Rule 1 (fresh base):** `git fetch origin main` first, then `git worktree add -b <item-branch> <item-path> origin/main`. Verify HEAD is on the fresh `origin/main` base before starting.
- **Rule 2 (no-silent-reuse):** check that neither the branch name nor the worktree path already exists before creating. Stop and report if either conflicts.
- **Rule 5 (plan records the worktree):** record the worktree path, branch name, and base commit in the item's `00-state.md` / `01-plan.md` before the implementer starts. Delivery uses this record for teardown.

Concurrent implementers never contend on the same working tree because each holds its own isolated directory under `.claude/worktrees/<item-branch>/` (or another non-root path).

---

## Concurrent implementer fan-out

Dispatch N implementers in parallel via concurrent `Task` calls in the parent orchestrator session. This is the same in-message mechanism already used for `tester + qa + security` at Phase 3 and for project lanes in `## Parallel Multi-Project Dispatch`.

Cap the concurrency at `batch_concurrency` (default 5) using the eager slot-fill wave model from `agents/orchestrator.md § Multi-Task Orchestration § Step 4`: fill all available slots immediately, and as each item finishes open the slot to the next queued item. This mirrors the Stage-1 planning fan-out (N architects + N plan-reviewers) on the implementation side.

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

Consolidation runs after all N implementers have finished and each item has passed its in-worktree verify step. The orchestrator performs consolidation on the consolidation branch (typically `feat/<batch-name>` checked out at `origin/main`).

### Item-local files

```bash
git checkout <item-branch> -- <item-local-file-1> <item-local-file-2> ...
```

Repeat for each item. Safe because the edit-class split guarantees no two items declare the same file as item-local. The wholesale checkout brings the file exactly as the implementer left it, with no conflict.

### Shared-serial files

For each contended file, walk items in **reserved order** (lowest reserved suite number first, or earliest registry slot first for non-suite files):

1. From each item's worktree branch, extract only that item's added block. The cleanest way: `git diff origin/main <item-branch> -- <shared-file>` then isolate the `+` lines scoped to the item's reserved region.
2. Concatenate the blocks in reserved order into the shared file. Because every block is a pure insertion at a reserved, non-overlapping location, the concatenation reproduces the intended final file.

No merge conflicts are possible under these constraints: every addition is additive, and reserved regions do not overlap.

### PR #338 worked example

PR #338 (Tier 3+4 batch) had 6 items with pre-reserved suite blocks 100–105.

For `tests/test_agent_structure.py`:

- Item (suite 100) wrote its suite-100 block as item-local. All other items wrote their own blocks as item-local (each had a unique, reserved region). The consolidation wholesale-checked out all six items' suite files — because each item owned a distinct file segment that no other item touched, the wholesale checkout did not conflict.
- The `docs/testing.md` registry rows were added in the order suite 100, 101, 102, 103, 104, 105 (ascending reserved order).

Result: single consolidated `run-all.sh` green on the first run.

### Version + CHANGELOG

Version bump and CHANGELOG entry are done ONCE at batch end by the delivery agent. Items do not bump the version individually. Delivery reads all `changelog.d/<item-slug>.md` fragments (if any) and assembles them into the versioned `## [Unreleased]` block.

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

Consolidation is owned by a SINGLE designated consolidator — the top-level orchestrator, never a subagent and never split across actors. The consolidator is the only writer of shared-serial files; parallel implementers never reconcile each other's work. The single-owner rule exists because concurrent implementers can contaminate even a notionally-isolated shared file — observed live, two worktrees' copies of `tests/test_agent_structure.py` cross-contaminated, each commit carrying the other item's suite block.

Four directives:

1. **Re-derive, do not trust.** Treat every worktree's copy of a shared-serial file as untrusted. Rebuild each shared-serial file from `base + each item's reserved block` (extract each item's block via `git diff <base>..<item-branch>`); never adopt a worktree's mutated shared file wholesale.
2. **All new suites must pass together.** Run `bash tests/run-all.sh` exactly once on the consolidated tree; every separately-authored suite must pass in that single together-run. A per-item in-worktree pass is necessary but never sufficient — the together-run is the gate, and consolidation is not done until it is green.
3. **No new suite may break a global guard.** A new suite's non-comment source must not embed the literal agent-invocation tokens that the whole-file free-suite guard scans for; phrase no-agent-call descriptions generically and assemble the tokens in variables (`"Age" + "nt("`), as the sibling suites do. Observed live: a new suite's check description embedded the literal tokens and tripped the whole-file guard — caught only by the together-run.
4. **One actor, one sequence.** The consolidator performs item-local checkouts, shared-serial re-derivation, the single version bump, and CHANGELOG assembly as one serial sequence in the parent session — never concurrently.
