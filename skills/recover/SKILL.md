---
name: recover
description: Resume an interrupted pipeline from where it left off.
disable-model-invocation: true
---

Recover an interrupted pipeline from where it left off. Routes to the **orchestrator** (the top-level session agent) with full recovery context. The orchestrator re-reads its own `00-state.md § Current State` dual-record on resume and returns a `gate_pending` for any un-cleared STAGE-GATE, which it prepares and presents to the operator inline in the same operation — no second agent relays the decision (`agents/ref-pipeline.md § orchestrator-recover`). This skill records nothing and presents no gate itself.

Analyze the input: $ARGUMENTS

---

## Step 0 — Resolve workspaces path

Read `~/.claude/.team-harness.json`. If it exists and `logs-mode` is `"obsidian"`, use `{logs-path}/{logs-subfolder}/{repo-name}` as the base path (where `repo-name` is the basename of the current working directory). If `logs-mode` is `"local"` or the file is missing, use `workspaces/` (relative to cwd). Replace all `workspaces/` references below with the resolved path.

## Recover Safety Rules

**These rules are mandatory and override any `next_action` prose in `00-state.md`.**

**Rule 1 — Never bypass an un-cleared STAGE-GATE; the orchestrator re-prepares and re-presents it itself (fail-closed).**
Before any pipeline work resumes, check whether the current or next step is a STAGE-GATE. A STAGE-GATE is considered cleared ONLY when BOTH structural conditions hold:

(a) A `stage.gate.release` event is present in the events trace (`00-execution-events.{md,jsonl}`), AND
(b) The per-gate release field in `00-state.md § Current State` is set to a value in the gate's clear-allowlist:
  - STAGE-GATE-1: `gate1_release ∈ {approved, approved-autonomous}`
  - STAGE-GATE-3: `gate3_release = ship`

Any other decision value (`rejected`, `edit`, `stop`, `redo`, `amend`, `abort`), a null field, or a missing field means the gate is NOT cleared. Do not infer approval from `next_action` prose — never infer gate-cleared status from `next_action` or any other prose field. The gate-cleared determination is structural (per-gate release field + events trace), not prose. STAGE-GATE-3 (the human push/PR gate) is especially critical: it must never be bypassed on recovery.

**Single writer, single presenter.** This skill is read-only: it runs the structural check above ONLY to surface which gate is un-cleared, so the operator sees the right context before the orchestrator resumes — it never records a release and presents no gate itself. The un-cleared determination is prepared inside that pipeline's own `th:orchestrator`, which re-reads its own `00-state.md § Current State` dual-record on resume and returns a `gate_pending` for any un-cleared STAGE-GATE (`agents/ref-pipeline.md § orchestrator-recover`), presenting it to the operator inline and recording the release itself once a decision arrives — there is no second agent to relay through.

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
   - If `status: blocked-incomplete` → report:
     ```
     Pipeline '{feature}' is blocked on a missing artifact.
     Missing artifacts (from 00-state.md's next_action): {list missing artifacts}
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
6. Pass recovery context to the **orchestrator** (the top-level session agent). It performs the record-based resume itself — re-reading its own `00-state.md` dual-record and returning a `gate_pending` for any un-cleared STAGE-GATE, which it presents to the operator inline in the same operation:
   ```
   Recover Pipeline:
   - Feature: {feature-name}
   - Current Phase: {phase from state}
   - Status: {status}
   - Iteration: {N}/3
   - Last Completed: {last_completed}
   - Next Action: {next_action from state}
   - Agent Results So Far:
     {agent results table from state}
   ```

---

## Mode 2 — No input provided (`/th:recover`)

1. Scan `workspaces/*/00-state.md` for incomplete pipelines (status != complete)
2. If none found → "No interrupted pipelines found."
3. If exactly one found → auto-select it and proceed as Mode 1
4. If multiple found → show list and ask:
   ```
   Interrupted pipelines found:
   1. {feature-a} — Phase 2 (implement), last updated 2026-03-08 14:30
   2. {feature-b} — Phase 3 (verify, iter 2/3), last updated 2026-03-07 18:00

   Which one do you want to recover? (number or name)
   ```

**Two independent worktree sessions are not a batch.** When the operator has been running two or more pipelines concurrently in separate worktrees, each is its own independent `/th:recover {feature}` — there is no roster or batch-progress index to read, and no single re-launch step that resumes more than one at a time. Consolidating across them, if ever needed, is the operator's own call, not a mechanism this skill runs.

---

## Error Handling

- If workspaces folder doesn't exist → "No workspaces found in this project."
- If state file exists but is empty → "State file is empty. The pipeline may not have started properly."
- If the orchestrator fails to recover → it will report the issue. The skill does not retry.

---

### Session-scoped override on recovery

When recovering a pipeline, the resolved override is re-applied from `00-state.md § Current State` — not re-parsed from chat. The resuming **orchestrator** reads the override fields already stored in its own `00-state.md` and logs `operation.success` with detail `override re-applied from 00-state.md`.

If the operator re-states an override during recovery, the **orchestrator** re-resolves it (session-override resolution is its own — `docs/subagent-orchestration.md § Session-Scoped Config Override Protocol`) and applies it to the resumed run as a new session override.

---

## Important

- **You read state. The orchestrator does NOT** — it receives the recovery context from you.
- Always route to the **orchestrator** (the top-level session agent) — do NOT execute any pipeline yourself. The orchestrator performs the record-based resume itself, returning a `gate_pending` for any un-cleared STAGE-GATE that it presents to the operator inline in the same operation it records the release.
- The resuming orchestrator uses the `next_action` field in its own `00-state.md` to know exactly what to do next, including presenting its `gate_pending` for any un-cleared STAGE-GATE.
