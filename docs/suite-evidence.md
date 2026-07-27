# Suite Evidence — Canonical Contract

This document is the **single source of truth** for `{docs_root}/00-suite-evidence.md`, an
append-only, per-feature record of every full verification-command run — which command ran,
against which tree state, with what result. A downstream consumer reads this registry before
re-running an idempotent verification command; when a prior row proves the command already ran
against the identical tree state with a passing result, the consumer cites that row instead of
re-running. Agent files reference this contract by pointer — the schema and the resolution rules
live only here (multi-site invariant, `01-plan.md`).

**Origin.** Four redundant full-suite runs were observed across this feature's own worktrees —
each a legitimate, independent execution against a genuinely different tree state, none of them
avoidable by this registry. What the registry removes is the different failure mode: a consumer
re-running a command that a named producer already ran, and recorded, against the exact tree state
the consumer is about to check.

---

## 1. Row schema

| Field | Meaning |
|---|---|
| `command` | The exact verification command that ran (e.g. `bash tests/run-all.sh`). |
| `tree_anchor` | Tree-identity value at run time — see § 2. |
| `result` | `pass` \| `fail`. |
| `exit_code` | The command's raw process exit code. |
| `counts` | Free-form summary of the command's own reported counts (e.g. `passed:187 failed:0`). |
| `agent` | The writer of this row — must be one of the closed list in § 3. |
| `phase` | The pipeline phase the run belongs to (e.g. `Phase 3`, `Phase 3.75`, `Step 9b`, `Parallel Batch consolidation`). |
| `timestamp` | ISO timestamp of the run. |

### `tree_anchor`

Defined **by reference** to `docs/verification-packet.md § 2` "Tree anchor" field — the identical
mechanic (`git rev-parse HEAD`, plus a dirty-tree diff hash when uncommitted changes exist). This
document introduces no second tree-identity mechanism; a row's `tree_anchor` and a verification
packet's `Tree anchor` are the same primitive read at two different call sites.

---

## 2. Closed list of writers

Exactly three agents may append a row: **`tester`**, **`orchestrator`**, **`delivery`**. A row
whose `agent` field names anyone outside this list is ignored by every consumer and forces
execution of the command regardless of how well-formed the rest of the row looks — the list is
enforced by consumer-side discipline (§ 4), not by any write-side control on the file itself.

---

## 3. Producer → consumer pairs (named)

1. Producer `tester` (Phase 3, `agents/tester.md § Mode: verify-run`) → consumer `orchestrator`
   (`agents/orchestrator.md § Phase 3.75 — Build Verification`).
2. Producer `orchestrator` (`agents/orchestrator.md § Phase 3.75 — Build Verification`) → consumer
   `delivery` (`agents/delivery.md § Step 9b — Definition of Done (DoD) checklist`, "Recorded-state
   gate").
3. Producer AND consumer `orchestrator`, within its own consolidation loop
   (`agents/orchestrator.md § Parallel Batch Implementation`): each `git merge` moves the tree
   anchor, so re-consulting the registry after a merge and before the next `run-all.sh` correctly
   re-executes — the anchor no longer matches the row the prior merge produced.

---

## 4. Resolution — fail-closed in every direction

A consumer EXECUTES the command (never cites a row) when ANY of the following holds:

- The row is absent or unreadable.
- The row's `tree_anchor` differs from the current tree state.
- The row's `result` is `fail`.
- The row's `agent` names anyone outside the closed list in § 2.
- `git status --porcelain` reports any untracked path. `git diff` does not report untracked
  paths, so a new file left uncommitted would otherwise leave a prior anchor intact over a tree
  that in fact changed — citing a row in that state is prohibited outright, independent of what
  the anchor comparison itself would have concluded.

**Only** when none of the above fire — the row's `tree_anchor` matches the current tree state
exactly, `result: pass`, `agent` is in the closed list, and `git status --porcelain` reports no
untracked path — may a consumer skip the run and cite the row: report the command, the anchor, the
producer agent, and the row's timestamp in place of a fresh execution.

---

## 5. Out of scope — never a substitute for

This registry never satisfies a security floor, a STAGE-GATE release, or the Phase 3.8
Pre-Delivery Security Audit. Its scope is idempotent re-runs of a verification command only — it
never stands in for a decision that requires reasoning about the diff's content, only for whether
an already-checked command needs to run again against an unchanged tree.

---

## 6. Row skeleton

```markdown
| command | tree_anchor | result | exit_code | counts | agent | phase | timestamp |
|---|---|---|---|---|---|---|---|
| `bash tests/run-all.sh` | {sha[+dirty-hash]} | pass | 0 | passed:187 failed:0 | tester | Phase 3 | {ISO timestamp} |
```

One row per invocation, appended — never rewritten or removed. The file lives at
`{docs_root}/00-suite-evidence.md`, one per feature, alongside the other `00-*` workspace state
files.
