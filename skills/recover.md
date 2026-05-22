Recover an interrupted pipeline or batch from where it left off. Routes through the th-orchestrator with full recovery context.

Analyze the input: $ARGUMENTS

---

## Mode 1 — Feature name provided (`/recover my-feature`)

1. Check that `session-docs/{feature}/00-state.md` exists
2. If not found, tell the user: "No pipeline state found for '{feature}'. Use `/status` to see active pipelines."
3. Read `session-docs/{feature}/00-state.md` in full
4. Read `session-docs/{feature}/00-execution-log.md` if it exists (for timing context)
5. Validate the state:
   - If `status: complete` → tell user: "Pipeline '{feature}' already completed. Nothing to recover."
   - If phase and next_action are present → proceed
   - If state file is corrupted or missing key fields → tell user: "State file is incomplete. Showing what's there:" and display the raw content
6. Pass recovery context to the `th-orchestrator` agent:
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

## Mode 2 — Batch recovery (`/recover --batch`)

Recovers ALL interrupted tasks from a multi-task batch (parallel dispatch via worktrees).

1. Check that `session-docs/batch-progress.md` exists
2. If not found → "No batch progress found. Use `/recover {feature}` for single pipeline recovery."
3. Read `session-docs/batch-progress.md` — extract all tasks with status `RUNNING` or `FAILED`
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
7. Pass batch recovery context to the `th-orchestrator` agent:
   ```
   Recover Batch:
   - Batch Progress File: session-docs/batch-progress.md
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

The th-orchestrator will:
- For tasks with existing worktrees: launch `claude --worktree {name} --tmux --dangerously-skip-permissions --continue` to resume the session
- For tasks with removed worktrees but existing state: create new worktree and launch with `/recover {feature}`
- For tasks with no state at all: re-launch from scratch with `/issue #{number}`
- Track progress in `batch-progress.md` as normal

---

## Mode 3 — No input provided (`/recover`)

1. First check for `session-docs/batch-progress.md` with incomplete tasks
   - If found → show batch status and ask: "Batch has {N} incomplete tasks. Recover the batch (`/recover --batch`) or a specific pipeline?"
2. If no batch, scan `session-docs/*/00-state.md` for incomplete pipelines (status != complete)
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

- If session-docs folder doesn't exist → "No session-docs found in this project."
- If state file exists but is empty → "State file is empty. The pipeline may not have started properly."
- If a worktree is listed in batch but doesn't exist on disk → mark it as "removed" and suggest re-launch
- If the th-orchestrator fails to recover → it will report the issue. The skill does not retry.

---

## Important

- **You read state. The th-orchestrator does NOT** — it receives the recovery context from you.
- Always invoke the `th-orchestrator` agent — do NOT execute any pipeline yourself
- The th-orchestrator uses the Recovery Instructions to know exactly what to do next
- For batch recovery, the th-orchestrator re-launches worktree instances — it does NOT run the pipelines itself
