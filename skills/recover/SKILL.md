---
name: recover
description: Resume an interrupted pipeline from where it left off.
---

Recover an interrupted pipeline or batch from where it left off. Routes to the **leader** (the top-level session agent) with full recovery context. The leader rebuilds tracking from `00-leader-roster.md` (roster-based; it never reads or writes any gate-release record — `agents/leader.md § leader-recover`); any un-cleared STAGE-GATE is re-prepared by the relevant **orchestrator** when it resumes (it re-reads its own `00-state.md` dual-record and returns a `gate_pending` — `agents/orchestrator.md § orchestrator-recover`), which the leader re-presents to the operator inline. This skill records nothing and presents no gate itself.

Analyze the input: $ARGUMENTS

---

## Step 0 — Resolve workspaces path

Read `~/.claude/.team-harness.json`. If it exists and `logs-mode` is `"obsidian"`, use `{logs-path}/{logs-subfolder}/{repo-name}` as the base path (where `repo-name` is the basename of the current working directory). If `logs-mode` is `"local"` or the file is missing, use `workspaces/` (relative to cwd). Replace all `workspaces/` references below with the resolved path.

## Recover Safety Rules

**These rules are mandatory and override any `next_action` prose in `00-state.md`.**

**Rule 1 — Never bypass an un-cleared STAGE-GATE; the orchestrator re-prepares it and the leader re-presents it (fail-closed).**
Before any pipeline work resumes, check whether the current or next step is a STAGE-GATE. A STAGE-GATE is considered cleared ONLY when BOTH structural conditions hold:

(a) A `stage.gate.release` event is present in the events trace (`00-execution-events.{md,jsonl}`), AND
(b) The per-gate release field in `00-state.md § Current State` is set to a value in the gate's clear-allowlist:
  - STAGE-GATE-1: `gate1_release ∈ {approved, approved-autonomous}`
  - STAGE-GATE-2: `gate2_release_last ∈ {next, next-autonomous}` (for the relevant `after_round`)
  - STAGE-GATE-3: `gate3_release = ship`

Any other decision value (`rejected`, `edit`, `stop`, `redo`, `amend`, `abort`), a null field, or a missing field means the gate is NOT cleared. Do not infer approval from `next_action` prose — never infer gate-cleared status from `next_action`, `hot_context`, or any other prose field. The gate-cleared determination is structural (per-gate release field + events trace), not prose. STAGE-GATE-3 (the human push/PR gate) is especially critical: it must never be bypassed on recovery.

**Who prepares, who presents (present-vs-record split).** This skill is read-only: it runs the structural check above ONLY to surface which gate is un-cleared, so recovery routes to the right orchestrator — it never records a release and presents no gate itself. The un-cleared determination is prepared inside that pipeline's own `th:orchestrator`, which re-reads its own `00-state.md § Current State` dual-record on resume and returns a `gate_pending` for any un-cleared STAGE-GATE (`agents/orchestrator.md § orchestrator-recover`); the leader re-presents that `gate_pending` to the operator inline and relays the decision back for the orchestrator to record. The leader rebuilds tracking from `00-leader-roster.md` without ever reading or writing a gate-release field — it presents and relays, but never records the release itself. The advisory `pending_gate` in the roster is a routing hint only — never a gate-clear signal.

**Rule 2 — Idempotency: skip completed phases; de-dup events structurally.**
The Phase Checklist (`## Phase Checklist` in `00-state.md`) is the authoritative record of progress. Phases already marked `[x]` MUST be skipped — do not re-dispatch a completed phase. To de-dup `phase.*`/`kg_write` appends on resume, use a structural lookup (JSON parse of the events trace, not regex) to detect already-emitted events before appending new ones. This prevents duplicate events and double-persisted KG nodes.

**Rule 3 — Canonical events file.**
The events file is `00-execution-events.md` (obsidian mode) or `00-execution-events.jsonl` (local mode). Read `logs_mode` from `00-state.md § Current State` to resolve which name applies. Always use the `00-execution-events` naming convention.

---

## Mode 1 — Feature name provided (`/th:recover my-feature`)

1. Check that `{resolved-path}/{feature}/00-state.md` exists
2. If not found, check whether the workspace folder itself exists:
   - If the folder exists but has no `00-state.md` → tell the user: "'{feature}' is a diagram or spike workspace (no pipeline state file). These modes are untracked by design and require no recovery. See `docs/observability.md § Lightweight direct-mode exemptions`."
   - If the folder does not exist at all → tell the user: "No pipeline state found for '{feature}'. Use `/th:pipelines` to see active pipelines."
3. Read `{resolved-path}/{feature}/00-state.md` in full
4. Read `{resolved-path}/{feature}/00-execution-events.{md,jsonl}` if it exists (for timing context — resolve filename from `logs_mode` in `00-state.md § Current State`)
5. Validate the state:
   - If `status: complete` → tell user: "Pipeline '{feature}' already completed. Nothing to recover."
   - If `status: blocked-no-dispatch` → report:
     ```
     Pipeline '{feature}' hit a dispatch failure — the orchestrator could not reach a subagent via Task.
     Recovery path: top-level Claude takes over dispatch automatically. Parse the dispatch_handoff block
     in the state or execution-events file, invoke the named agent via Task, and continue the pipeline.
     Full takeover protocol: docs/subagent-orchestration.md § FALLBACK.
     If the session has expired, re-run: /th:recover {feature} (this skill re-reads state and re-dispatches).
     ```
   - If `status: blocked-incomplete` → report:
     ```
     Pipeline '{feature}' is blocked on a missing artifact.
     Missing artifacts (from 00-state.md § hot_context): {list missing artifacts}
     Recovery: provide the missing artifact or re-run the phase that produces it.
     Once the artifact is present, run /th:recover {feature} to resume.
     ```
   - If `status: blocked-manual-push` → report:
     ```
     Pipeline '{feature}' is waiting for a manual push — 'gh' is absent or unauthenticated.
     The branch has been committed locally. To complete delivery:
       1. git push origin {branch-name}
       2. Open a pull request manually (or run 'gh pr create' once gh is authenticated)
     Full fallback contract: agents/_shared/gh-fallback.md
     ```
   - If `status: blocked-pr-pending` → report:
     ```
     Pipeline '{feature}' created a pull request that is pending merge.
     PR URL (from 00-state.md): {pr_url}
     The pipeline is complete — no automated resume is needed. Merge the PR when it is ready.
     If CI is failing, investigate and push a fix commit, then re-run merge.
     ```
   - If phase and next_action are present → proceed
   - If state file is corrupted or missing key fields → tell user: "State file is incomplete. Showing what's there:" and display the raw content
6. Pass recovery context to the **leader** (the top-level session agent). The leader rebuilds tracking without reading or writing any gate-release record, then re-spawns / continues the relevant `th:orchestrator`, which performs the record-based resume (re-reading its own `00-state.md` dual-record and returning a `gate_pending` for any un-cleared STAGE-GATE, which the leader re-presents inline):
   ```
   Recover Pipeline:
   - Feature: {feature-name}
   - Current Phase: {phase from state}
   - Status: {status}
   - Iteration: {N}/3
   - Last Completed: {last_completed}
   - Next Action: {next_action from state}
   - Hot Context: {hot context items from state}
   - Recovery Instructions: {recovery instructions from state}
   - Agent Results So Far:
     {agent results table from state}
   ```

---

## Mode 2 — Batch recovery (`/th:recover --batch`)

Recovers ALL interrupted tasks from a multi-task batch (parallel dispatch via worktrees).

1. Check for `00-leader-roster.md` (the leader's durable index — `agents/leader.md § 00-leader-roster.md`) at the resolved base path or, for an initiative, the initiative root. This is the primary source: the leader re-launches an orchestrator for any roster row still `RUNNING`/`FAILED` (`agents/leader.md § Multi-Task fan-out`). Fall back to the legacy `workspaces/batch-progress.md` when no roster is present.
2. If neither is found → "No batch tracking found. Use `/th:recover {feature}` for single pipeline recovery."
3. Read the roster (or `batch-progress.md`) — extract all tasks/lanes whose coarse `Status` is `RUNNING`/`FAILED` (roster) or `in_progress`/`iterating`/`blocked` (per-lane `00-state.md`). Read only the roster's coarse `Phase`/`Status`/`pending_gate` columns — never any orchestrator gate-release field.
4. If none found → "All batch tasks are DONE or PENDING. Nothing to recover."
5. For each incomplete task, check if its worktree still exists:
   ```bash
   git worktree list
   ```
6. Report the batch state to the user:
   ```
   Batch recovery needed:
   | # | Task | Status | Worktree | Action |
   |---|------|--------|----------|--------|
   | 2 | token-service | RUNNING | .claude/worktrees/task-102 | resume via worktree |
   | 3 | refresh-flow | RUNNING | .claude/worktrees/task-103 | resume via worktree |
   | 5 | middleware | FAILED | (removed) | re-launch from scratch |
   ```
7. Pass batch recovery context to the **leader** (the top-level session agent):
   ```
   Recover Batch:
   - Batch Progress File: workspaces/batch-progress.md
   - Total Tasks: {N}
   - Completed: {N}
   - Need Recovery: {N}
   - Tasks to recover:
     --- Task {#} ---
     - Feature: {feature-name}
     - Issue: #{number}
     - Round: {N}
     - Last Status: {RUNNING/FAILED}
     - Worktree: {path or "removed"}
     - Has 00-state.md: {yes/no}
     ...
   ```

The leader will (re-launching one `th:orchestrator` per recovered lane — it never runs a pipeline itself):
- For tasks with existing worktrees: launch `claude --worktree {name} --tmux --dangerously-skip-permissions --continue` to resume the session
- For tasks with removed worktrees but existing state: create new worktree and launch with `/th:recover {feature}`
- For tasks with no state at all: re-launch from scratch with `/th:issue #{number}`
- Track progress in `00-leader-roster.md` (and `batch-progress.md` where present) as normal

---

## Mode 3 — No input provided (`/th:recover`)

1. **Roster-first — render the leader→orchestrator tree.** If `00-leader-roster.md` exists (resolved base path or initiative root), render it as the selection surface grouped by project — one row per orchestrator with its coarse `Phase` / `Status` and the advisory `pending_gate` (read verbatim from the roster; never inferred from a gate-release field — the roster is a leader tracking index that carries no gate-release record):
   ```
   parent: {initiative}   (leader roster: {N} orchestrators)
     ├─ {project-a}   Stage {N} / {phase}   {status}   gate: {pending_gate|—}
     └─ {project-b}   Stage {N} / {phase}   {status}   gate: {pending_gate|—}

   Which one do you want to recover? (number or name)
   ```
   Exactly one incomplete lane → auto-select and proceed as Mode 1. When no roster is present, fall through to the legacy scan below.
2. Check for `workspaces/batch-progress.md` with incomplete tasks
   - If found → show batch status and ask: "Batch has {N} incomplete tasks. Recover the batch (`/th:recover --batch`) or a specific pipeline?"
3. If no roster and no batch, scan `workspaces/*/00-state.md` for incomplete pipelines (status != complete)
4. If none found → "No interrupted pipelines found."
5. If exactly one found → auto-select it and proceed as Mode 1
6. If multiple found → show list and ask:
   ```
   Interrupted pipelines found:
   1. {feature-a} — Phase 2 (implement), last updated 2026-03-08 14:30
   2. {feature-b} — Phase 3 (verify, iter 2/3), last updated 2026-03-07 18:00

   Which one do you want to recover? (number or name)
   ```

---

## Error Handling

- If workspaces folder doesn't exist → "No workspaces found in this project."
- If state file exists but is empty → "State file is empty. The pipeline may not have started properly."
- If a worktree is listed in batch but doesn't exist on disk → mark it as "removed" and suggest re-launch
- If the leader (or the orchestrator it re-spawns) fails to recover → it will report the issue. The skill does not retry.

---

### Session-scoped override on recovery

When recovering a pipeline, the resolved override is re-applied from `00-state.md` § Current State — not re-parsed from chat. The resuming **orchestrator** reads the override fields already stored in its own `00-state.md` and logs `operation.success` with detail `override re-applied from 00-state.md`.

If the operator re-states an override during recovery, the **leader** re-resolves it (session-override resolution is the leader's — `agents/leader.md § Session-scoped config override`) and propagates it into the resumed orchestrator as a new session override for that run.

---

## Important

- **You read state. The leader and orchestrator do NOT** — they receive the recovery context from you.
- Always route to the **leader** (the top-level session agent) — do NOT execute any pipeline yourself. The leader rebuilds tracking from the roster (never reading or writing a gate-release record) and re-spawns the relevant `th:orchestrator`; that orchestrator performs the record-based resume, returning a `gate_pending` for any un-cleared STAGE-GATE that the leader re-presents inline.
- The resuming orchestrator uses the Recovery Instructions in its own `00-state.md` to know exactly what to do next, including returning its `gate_pending` for any un-cleared STAGE-GATE (which the leader re-presents to the operator inline).
- For batch recovery, the leader re-launches one orchestrator worktree instance per lane — neither the leader nor this skill runs the pipelines itself.
