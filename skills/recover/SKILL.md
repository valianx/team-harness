---
name: recover
description: Resume an interrupted pipeline from where it left off.
---

Recover an interrupted pipeline or batch from where it left off. Routes through the orchestrator with full recovery context.

Analyze the input: $ARGUMENTS

---

## Step 0 — Resolve workspaces path

Read `~/.claude/.team-harness.json`. If it exists and `logs-mode` is `"obsidian"`, use `{logs-path}/{logs-subfolder}/{repo-name}` as the base path (where `repo-name` is the basename of the current working directory). If `logs-mode` is `"local"` or the file is missing, use `workspaces/` (relative to cwd). Replace all `workspaces/` references below with the resolved path.

## Recover Safety Rules

**These rules are mandatory and override any `next_action` prose in `00-state.md`.**

**Rule 1 — Re-emit any un-cleared STAGE-GATE (fail-closed).**
Before resuming any pipeline work, check whether the current or next step is a STAGE-GATE. A STAGE-GATE is considered cleared ONLY when a `stage.gate.release` event is present in the events trace (`00-execution-events.{md,jsonl}`) AND the corresponding flag is set in `00-state.md § Current State`. Do not infer approval from `next_action` prose — never infer gate-cleared status from `next_action`, `hot_context`, or any other prose field. The gate-cleared determination is structural (checklist + events trace), not prose. If the STAGE-GATE is not recorded as cleared by these structural signals, re-emit the STOP block for that STAGE-GATE to the operator and halt. STAGE-GATE-3 (the human push/PR gate) is especially critical: it must never be bypassed on recovery.

**Rule 2 — Idempotency: skip completed phases; de-dup events structurally.**
The Phase Checklist (`## Phase Checklist` in `00-state.md`) is the authoritative record of progress. Phases already marked `[x]` MUST be skipped — do not re-dispatch a completed phase. To de-dup `phase.*`/`kg_write` appends on resume, use a structural lookup (JSON parse of the events trace, not regex) to detect already-emitted events before appending new ones. This prevents duplicate events and double-persisted KG nodes.

**Rule 3 — Canonical events file.**
The events file is `00-execution-events.md` (obsidian mode) or `00-execution-events.jsonl` (local mode). Read `logs_mode` from `00-state.md § Current State` to resolve which name applies. Always use the `00-execution-events` naming convention.

---

## Mode 1 — Feature name provided (`/th:recover my-feature`)

1. Check that `{resolved-path}/{feature}/00-state.md` exists
2. If not found, tell the user: "No pipeline state found for '{feature}'. Use `/th:pipelines` to see active pipelines."
3. Read `workspaces/{feature}/00-state.md` in full
4. Read `workspaces/{feature}/00-execution-events.{md,jsonl}` if it exists (for timing context — resolve filename from `logs_mode` in `00-state.md § Current State`)
5. Validate the state:
   - If `status: complete` → tell user: "Pipeline '{feature}' already completed. Nothing to recover."
   - If phase and next_action are present → proceed
   - If state file is corrupted or missing key fields → tell user: "State file is incomplete. Showing what's there:" and display the raw content
6. Pass recovery context to the `orchestrator` agent:
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

1. Check that `workspaces/batch-progress.md` exists
2. If not found → "No batch progress found. Use `/th:recover {feature}` for single pipeline recovery."
3. Read `workspaces/batch-progress.md` — extract all tasks with status `RUNNING` or `FAILED`
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
7. Pass batch recovery context to the `orchestrator` agent:
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

The orchestrator will:
- For tasks with existing worktrees: launch `claude --worktree {name} --tmux --dangerously-skip-permissions --continue` to resume the session
- For tasks with removed worktrees but existing state: create new worktree and launch with `/th:recover {feature}`
- For tasks with no state at all: re-launch from scratch with `/th:issue #{number}`
- Track progress in `batch-progress.md` as normal

---

## Mode 3 — No input provided (`/th:recover`)

1. First check for `workspaces/batch-progress.md` with incomplete tasks
   - If found → show batch status and ask: "Batch has {N} incomplete tasks. Recover the batch (`/th:recover --batch`) or a specific pipeline?"
2. If no batch, scan `workspaces/*/00-state.md` for incomplete pipelines (status != complete)
3. If none found → "No interrupted pipelines found."
4. If exactly one found → auto-select it and proceed as Mode 1
5. If multiple found → show list and ask:
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
- If the orchestrator fails to recover → it will report the issue. The skill does not retry.

---

### Session-scoped override on recovery

When recovering a pipeline, the resolved override is re-applied from `00-state.md` § Current State — not re-parsed from chat. The orchestrator reads the override fields already stored there and logs `operation.success` with detail `override re-applied from 00-state.md`.

If the operator re-states an override during recovery, the orchestrator treats it as a new session override for the resumed run.

---

## Important

- **You read state. The orchestrator does NOT** — it receives the recovery context from you.
- Always invoke the `orchestrator` agent — do NOT execute any pipeline yourself
- The orchestrator uses the Recovery Instructions to know exactly what to do next
- For batch recovery, the orchestrator re-launches worktree instances — it does NOT run the pipelines itself
