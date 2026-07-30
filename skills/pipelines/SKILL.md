---
name: pipelines
description: Show current state of all pipelines in workspaces.
---

Show the current state of all pipelines in workspaces. This is a standalone utility — does NOT route through the orchestrator; it is a pure read-only renderer.

## Voice

You speak as a professional instrument: formal, neutral, declarative. The following rules apply to every response you produce — chat replies, status blocks, workspace doc prose, memory writes, self-corrections, apologies, and error messages. There is no informal-chat-mode loophole.

**Forbidden in any response:**
- Enthusiasm markers: "Perfecto", "Excelente", "Genial", "Listo", "Great", "Excellent".
- Emoji decoration of routine status (`✅`, `⚠️`, `🎉`, `✨`).
- First-person personality: "Creo que", "Me parece", "I think", "I believe".
- Anthropomorphic framing: "Yo voy a", "I'll go", "Quiero ayudarte", "Let me".
- Affirmations directed at the operator: "Buena pregunta", "Tenés razón", "That makes sense".
- Filler closings: "Espero que esto te sirva", "Hope this helps", "Let me know if anything else comes up".
- Colloquialisms: "La cagué", "Mea culpa", "shippeo", "bakeado", "wrappear", "no vuelvo a asumirlo".
- Marketing tone: "potente", "innovador", superlatives.

**Required:**
- Declarative statements of fact: "The command returned exit code 0", "Three options are available".
- Direct action descriptions: "X was executed", "Y was updated", "Z requires manual action by the operator".
- Concise summaries: a status block, a table, or a 2-3 sentence outcome. No padding, no celebration.

**Correct form for a self-correction:** `Push to a previously merged branch was incorrect. Future runs verify with gh pr view before pushing additional commits.`

**Incorrect form (forbidden):** `Mea culpa. La cagué pusheando. No vuelvo a asumirlo.`

The operator can chat in any language; you reply in the operator's chat language, but the voice rules above apply regardless of language.

## Read-only contract

**This skill NEVER modifies state.** No Edit, no Write, no JSONL append — no file under `workspaces/` is touched when this skill runs. It is a pure renderer: it reads files and prints output. Violating this contract would corrupt pipeline state and is forbidden.

Analyze the input: $ARGUMENTS

---

## What to scan

**Step 0 — Resolve workspaces path.** Read `~/.claude/.team-harness.json`. If it exists and `logs-mode` is `"obsidian"`, use `{logs-path}/{logs-subfolder}/{repo-name}` as the base path (where `repo-name` is the basename of the current working directory). If `logs-mode` is `"local"` or the file is missing, use `workspaces/` (relative to cwd). Use this resolved path for ALL glob patterns below.

1. Use Glob to find all `{resolved-path}/*/00-state.md` files
2. For each found, read the file and extract:
   - Feature name (from folder name)
   - Current phase
   - Status (in_progress, waiting, iterating, complete)
   - Iteration count
   - Last completed phase
   - Next action
   - Last updated timestamp
3. **Scan worktrees** — run `git worktree list` to find active worktrees. For each worktree path, check if `workspaces/*/00-state.md` exists inside and extract the same fields
4. **Verify live processes** — run `tmux list-sessions 2>/dev/null` (via WSL if on Windows: `wsl -e tmux list-sessions 2>/dev/null`). Map tmux session names to worktree/task names to determine which tasks have a live Claude Code process running

---

## Display format

### If pipelines found

```
Pipeline Status
===============

| Feature | Stage | Phase | Status | Iter | Process | Last Updated | Next Action |
|---------|-------|-------|--------|------|---------|-------------|-------------|
| auth-module | 2 | 2-implement | autonomous | 0/3 | LIVE | 2026-03-08 14:30 | implementer working |
| payments | 3 | complete | complete | 1/3 | — | 2026-03-07 18:00 | none |
```

**Process column values:**
- `LIVE` — tmux session found, Claude Code is actively running
- `DEAD` — worktree exists but no tmux session (process crashed or terminal closed)
- `—` — not a worktree task (running in main session)

Highlight:
- `DEAD` process — needs recovery, suggest `/th:recover {feature-name}` for that worktree's own pipeline
- `iterating` status — needs attention
- `complete` status — done
- Stale pipelines (last updated > 1h ago with status != complete) — mark as "stale?"

**No cross-task batch table.** Each worktree's pipeline is independent — there is no roster or `batch-progress.md` index spanning several tasks any more (the Multi-Task fan-out that produced one has been retired; see `agents/ref-special-flows.md`). Two or more concurrent worktree pipelines each show up as their own row in the Pipeline Status table above.

---

## Refined `Status` value set

The `Status` column in the no-args table uses a 6-value enum derived by cross-referencing `phase`, `status`, and `autonomous` fields from `00-state.md`. This lets users distinguish "waiting at a human gate" from "actively iterating" from "autonomous-running" at a glance.

| `/th:pipelines` shows | Derived from `00-state.md` |
|---|---|
| `waiting_gate_1` | `status: waiting` AND `phase: 1.6` (STAGE-GATE-1 emitted, no release yet) |
| `waiting_gate_3` | `status: waiting` AND `phase: 3.5` (STAGE-GATE-3 emitted immediately before Phase 4) |
| `autonomous` | `status: in_progress` AND `autonomous: true` |
| `iterating` | `status: iterating` (any phase) |
| `complete` | `status: complete` |
| `paused` | `status: paused` OR `status: paused_for_amend` OR `status: blocked` |

If none of the derivations match (legacy pipeline, missing fields), fall back to the raw `status` value from `00-state.md`. The `Status` field in the state file is unchanged — this renderer is a presentation layer only.

**`Stage` column values:** `1` (analysis), `2` (implementation), `3` (delivery), or `—` for legacy pipelines (`pipeline_version: 1` or absent). Read from the `stage` field in `00-state.md`.

### Workspace folders without 00-state.md (diagram / spike)

When scanning `{resolved-path}/*/`, a workspace folder may exist that contains NO `00-state.md`. Do NOT raise an error or treat it as a corrupted pipeline. These are **diagram** or **spike** workspaces — named observability exemptions that produce output files (e.g. `diagram.excalidraw`, `02-implementation.md`) but no pipeline state. Report them separately in the table with status `untracked (diagram/spike)`:

```
| {feature} | — | — | untracked (diagram/spike) | — | — | {folder-mtime} | — |
```

Full exemption contract: `docs/observability.md § Lightweight direct-mode exemptions`.

### If no pipelines found

```
No active pipelines in workspaces/.
```

---

## In-flight lanes

**When rendered:** appended after the no-args Pipeline Status table, once per active pipeline row that has a `{resolved-path}/{feature}/00-subagent-trace.jsonl` file. This surfaces subagent dispatches that are blocked inside a concurrent `Task` call — precisely when the orchestrator itself cannot report progress.

**Source:** `00-subagent-trace.jsonl`, written by two deterministic PreToolUse/SubagentStop hooks (`subagent-start.cjs` and `subagent-trace.sh`) — see `docs/observability.md § subagent.start` and `§ 00-subagent-trace.jsonl`. Read-only: parsing this file never triggers a write.

**Derivation (FIFO pairing per `agent_type`).** The `subagent.start` line carries no `agent_id` (the runtime has not assigned one yet), so `agent_type` is the only correlation key available:
1. Read the file in order. Push every `subagent.start` line onto a pending queue keyed by `agent_type`.
2. Every `subagent.stop` line for that `agent_type` pops the OLDEST pending start for the same `agent_type` and forms a **completed pair** — duration = `stop.ts - start.ts`.
3. Any `subagent.start` left in the pending queue after the file is fully read is an **in-flight lane** — elapsed = `now - start.ts`.

**Render:**
```
In-flight lanes — {feature}
  {agent_type}      running   {elapsed}   (started {HH:MM:SS})
  {agent_type}      done      {duration}  ({HH:MM:SS} → {HH:MM:SS})
```

Sort in-flight lanes first (most recently started first), then completed pairs (most recently completed first, capped at the 5 most recent — this is a live-progress glance, not a history; the full history is `/th:trace {feature} --jsonl`).

**Fail-soft.** If `00-subagent-trace.jsonl` does not exist for a feature, or exists with zero parseable start/stop lines, omit the block for that feature silently — no error, no placeholder line.

---

## Initiative tree (serial multi-project sequencing)

**When rendered:** when the resolved workspaces path (or, for an initiative, the initiative root) contains an initiative-level `00-execution-events` file. There is no roster and no parallel fan-out to enumerate — one coordinator runs each project's Stage 1 → Stage 3 to completion, in sequence, before starting the next (`agents/ref-dispatch-machinery.md § Multi-project sequencing`). This renderer reads each project's own `00-state.md` directly — there is no separate index file to fall behind it.

**Source (read-only, two files per project):**
- each project's own `{project}/00-state.md` — for the live `Stage` / `Phase` / `Status` of that project.
- the initiative-level `{initiative-root}/00-execution-events.{jsonl|md}` — for `initiative.start` / `project.start` / `project.end` / `initiative.converge` lifecycle events, so the renderer knows which project is currently running and which have completed.

**Gate values are read directly from each project's own `00-state.md`, never inferred.** `gate1_release` / `gate3_release` come straight from that project's own state file — there is no advisory roster field standing in for them.

**Cost rollup is READER-ONLY.** The per-project cost is a reader-only aggregation of that project's OWN events file — summed from its `phase.end` `tokens`. This renderer never writes to any project's events file or `00-state.md`; the rollup is a pure read and never touches the gate seam.

**Render (grouped by project — replaces the flat per-project rows for that initiative in the no-args view):**
```
parent: {initiative}   (serial — at most one project running at a time)
  ├─ {project-a}   Stage {N} / {phase}   {status}   gate: {gate1_release|gate3_release|—}   ~{K}K tok
  └─ {project-b}   Stage {N} / {phase}   {status}   gate: {gate1_release|gate3_release|—}   ~{K}K tok
```
Because execution is serial, at most one project is ever "running" at a time — there is no parallel-region rendering to reconcile. For a single-task run (no initiative) there is nothing to group; the feature renders as a single row in the flat table as today.

**Fail-soft.** No initiative-level events file → fall back silently to the flat per-project rows in the main Pipeline Status table. Any read/parse error → silently omit the tree and keep the flat table. This rendering is additive convenience, not a required view.

---

## How to detect live processes

### Step 1 — List worktrees
```bash
git worktree list --porcelain
```
Parse output to get worktree paths and branch names.

### Step 2 — List tmux sessions
```bash
# On WSL/Linux/macOS:
tmux list-sessions -F '#{session_name}:#{session_activity}' 2>/dev/null

# On Windows (via WSL):
wsl -e tmux list-sessions -F '#{session_name}:#{session_activity}' 2>/dev/null
```
If tmux is not available or returns error, skip process detection and show `?` in the Process column.

### Step 3 — Match sessions to tasks
Claude Code worktree sessions typically use the worktree name as part of the tmux session name. Match by checking if the task/feature name appears in the session name.

### Step 4 — Read state from worktrees
For each worktree path, check:
```
{worktree-path}/workspaces/*/00-state.md
```
If found, extract the same fields as regular workspaces.

---

## Actions (optional arguments)

- **No args or `list`** — show the tables above (pipelines + process status)
- **`<feature-name>`** — show detailed narrative state for one feature (see `<feature-name>` mode below)
- **`clean`** — list completed pipelines and ask user which to delete (also offers to remove completed worktrees)

---

## `<feature-name>` mode — narrative renderer

The detailed mode renders a structured narrative for one feature. **It is read-only — it never modifies state** (no Edit, no Write, no JSONL append).

### Renderer pipeline (in order)

1. **If `workspaces/{feature-name}/00-state.md` does not exist:** output `No state file at workspaces/{feature-name}/00-state.md.` and exit cleanly. No crash.

2. **Pipeline Summary panel** — read `workspaces/{feature-name}/00-pipeline-summary.md` if it exists. Render its `## TL;DR` block and its `## Phase Timeline` table verbatim under a top-level `## Pipeline Summary` header. This is the 30-second answer for "did this work?" that the user sees before the deeper narrative below.

   If `00-pipeline-summary.md` is absent: skip this panel silently and continue to step 3 (pipeline ran before observability was wired up, or trace not yet initialized). Do NOT emit a noise placeholder — the deeper narrative below is still useful.

   For the canonical observability views, point the reader to `/th:trace`:
   ```
   For tool effectiveness:  /th:trace {feature-name} --tools
   For failures only:       /th:trace {feature-name} --fails
   For raw events:          /th:trace {feature-name} --jsonl
   ```

3. **Read `00-state.md`.** `00-state.md § Current State` is fields only — narrative lives in the events file, and the recovery instruction is the `next_action` field (there is no `## TL;DR`, `## Hot Context`, or `## Recovery Instructions` section to extract; a pipeline written before this schema may still carry them — render verbatim if present, otherwise skip silently). Render in this sequence:
   - **Current State** — render the `## Current State` key-value block.
   - **Agent Results** — render the `## Agent Results` table. If the table body is empty (very early pipeline), render the header row and `(no agent results yet)`.
   - **Next action** — render the `next_action` field verbatim as the recovery instruction, ONLY if `status` is `paused`, `paused_for_amend`, `blocked`, `blocked-incomplete`, or the `Process` column was `DEAD` in the no-args view. Otherwise hide — recovery hints are noise when the pipeline is healthy.

4. **Read the events file.** Detect dual-format:
   1. Use Glob to check for `workspaces/{feature-name}/00-execution-events.md`. If found, use it.
   2. If not found, check for `workspaces/{feature-name}/00-execution-events.jsonl`.
   3. If neither exists: render `Timeline\n--------\n(no events recorded — pre-refactor pipeline or trace not initialized)`. No crash, exit code 0.

   For the `.md` variant, extract the JSONL content from inside the code fence before parsing:
   ```bash
   sed -n '/^```jsonl$/,/^```$/{/^```/d;p}' workspaces/{feature-name}/00-execution-events.md
   ```
   For the `.jsonl` variant, read directly.

   Parse line by line into a list of events. Apply the Timeline rules below to produce the `## Timeline` section.

5. **Render Timeline** using the rules below.

### Timeline event types rendered

The Timeline section consumes these 11 event types from the JSONL trace:

| Event type | Rendered as |
|---|---|
| `pipeline.start` | `--- PIPELINE START at {ts} ---` header |
| `stage.gate` | `■ STAGE-GATE-{N} EMITTED at {ts} — verdict: {verdict}` (with `after_round` if `stage: 2`) |
| `stage.gate.release` | `→ STAGE-GATE-{N} RELEASED at {ts} — decision: {decision}` |
| `stage.gate.skipped` | `↷ STAGE-GATE-{N} SKIPPED at {ts} — reason: {reason}` (with `after_round`) |
| `phase.end` where `phase` starts with `2-` | `▸ Task-{i} Phase 2 (implementer) — {duration}s — {status} — "{summary}"` |
| `phase.end` where `phase` starts with `3-verify` | `▸ Task-{i} Phase 3 verify — {duration} — {status}` |
| `phase.end` where `phase` starts with `3.5-` | `▸ Task-{i} Phase 3.5 acceptance-gate — {status} — "{summary}"` |
| `gate.pass` | `✓ {phase} verdict: pass — "{summary}"` |
| `gate.fail` | `✗ {phase} verdict: fail — "{summary}"` |
| `iteration.start` | `↻ ITERATION {iteration} START — {summary}` |
| `policy.deny` | `⚠ policy.deny at {ts} — {summary}` (always surface — security signal) |
| `pipeline.end` | `--- PIPELINE END at {ts} — status: {status} ---` footer |

Other event types (`phase.start`, other `phase.end`) are read for grouping purposes but not individually rendered — they are too noisy. Malformed JSONL lines are silently skipped; a count of skipped lines is appended to the Timeline header as `(skipped N malformed events)`.

### Chronological ordering rules

- Events are rendered in file order (the JSONL is append-only, so file order ≡ chronological order).
- Events with the same `ts` value to the second are rendered in file order.
- The renderer does NOT re-sort by parsed timestamp — file order is authoritative.

### Task grouping (single-pass block)

Stage 2 is a single `implementer` pass over every task, each closing with its own commit — there are no rounds and no per-round gate. The renderer groups the JSONL's interleaved `phase.start` / `phase.end` events into one **pass block**:

- The block opens at the first `stage.gate.release` with `stage: 1`.
- Collect every `phase.end` event whose `phase` starts with `2-`, `2.5-`, `2.6-`, `2.7-`, `2.8-`, `3-`, or `3.5-`, per task, until `pipeline.end` fires.

Render the pass as a single block:
```text
Implementation pass ({N} tasks, started {ts}, closed {ts}):
  Task-1: Phase 2 (commit) — then, once for the whole pass: Phase 2.8 → Phase 3 → Phase 3.5
  Task-2: Phase 2 (commit) → ... ↻ ITERATION 1 → Phase 3 → ...
```
Tasks are listed in ascending task identifier order, regardless of which finished first.

### Formatting conventions

- Timestamps render as `HH:MM:SS` in the file's timezone (preserved from JSONL `ts` field).
- Durations render as `Ns` if `< 60s`, else `Mm Ss`.
- `summary` text is truncated at 80 characters with an ellipsis.
- Use ASCII glyphs only: `■ → ↷ ▸ ✓ ✗ ↻ ⚠ ---` — reliable across Windows/macOS/Linux without emoji fonts.

### Graceful degradation

| Condition | Behaviour |
|---|---|
| `00-execution-events.md` and `00-execution-events.jsonl` both missing | Current State + Agent Results render normally. Timeline renders `(no events recorded — pre-refactor pipeline or trace not initialized)`. No crash. |
| `pipeline_version: 1` or field absent | Stage column in no-args table shows `—`; Status uses the raw `status` value. Timeline degrades as above. |
| `## Agent Results` empty | Renders the table header row + `(no agent results yet)`. |
| Malformed JSONL line | Skip the line silently, count it. Surface as `Timeline (skipped N malformed events)` if any. |
| `00-state.md` missing entirely | Output `No state file at workspaces/{feature-name}/00-state.md.` Exit cleanly. |
| `## TL;DR` / `## Hot Context` / `## Recovery Instructions` present in `00-state.md` | These sections were retired from the schema; a pipeline started before the retirement may still carry them — render verbatim if present, otherwise skip silently (no placeholder). |

### Example output

```
Feature: auth-jwt
=================

Pipeline Summary
----------------
TL;DR
-----
- Now: Pipeline complete.
- Last: Phase 6 KG-save done (2 entities) + process reflection appended.
- Next: none — ready for handoff.
- Open issues: none

Current State
-------------
  pipeline_version: 2 | phase: 6 | stage: 3 | status: complete
  autonomous: true | autonomous_granted_at: STAGE-GATE-1
  iteration: 1/3 | total_rounds: 2 | prs_completed: [Task-1, Task-2, Task-3]

Agent Results
-------------
| Agent          | Phase                 | Status   | Summary                                     |
|----------------|-----------------------|----------|---------------------------------------------|
| orchestrator   | intake                | success  | feature classified standard, 8 AC           |
| architect      | 1-design              | success  | 3 tasks, 11 AC                              |
| implementer    | 2-implement (Task-1)    | success  | jwt issuance endpoint                       |
| tester         | 3-verify (Task-3) iter 0| fail     | AC-3 null check missing in login.ts:42      |

Timeline
--------
--- PIPELINE START at 13:58:14 ---
▸ Intake — 12s — success
▸ Phase 1 design (architect) — 2m 41s — success — "3 tasks, 11 AC"
✓ Phase 1.5 ratify-plan verdict: pass — "11/11 AC covered"
✓ Phase 1.6 plan-review verdict: pass — "0 findings"
■ STAGE-GATE-1 EMITTED at 14:05:23 — verdict: pass
→ STAGE-GATE-1 RELEASED at 14:08:01 — decision: approved-autonomous

Implementation pass (3 tasks, started 14:08:02, closed 14:31:02):
  Task-1: Phase 2 (1m 48s, success)
  Task-2: Phase 2 (1m 21s, success)
  Task-3: Phase 2 (2m 04s, success)
▸ Phase 2.8 freeze — 41s — success — "build/lint pass, base up to date"
▸ Phase 3 verify (qa + adversary) — 2m 12s — pass
✗ Phase 3.5 acceptance-gate verdict: fail — "AC-3 missing null check" ↻ ITERATION 1 START
  Task-3: Phase 2 (38s, success)
▸ Phase 2.8 freeze — 22s — success
▸ Phase 3 verify (qa + adversary) — 1m 41s — pass
✓ Phase 3.5 acceptance-gate verdict: pass

■ STAGE-GATE-3 EMITTED at 14:33:18 — verdict: (none)
→ STAGE-GATE-3 RELEASED at 14:35:02 — decision: ship
▸ Phase 4 delivery — 34s — success — "branch feat/auth-jwt, version 1.5, PR #482"
▸ Phase 5 github-update — 8s — success — "issue moved to In Review, PR #482"
▸ Phase 6 kg-save — 14s — success — "2 entities saved"
--- PIPELINE END at 14:35:24 — status: success ---
```

---

## Important

- This skill does NOT route through the orchestrator
- Read-only — never modifies workspaces
- Works even if no `.gitignore` or CLAUDE.md exists
- If `00-state.md` is missing but workspaces folder exists, report the folder as "no state file (legacy?)"
- If tmux is not available, skip process detection gracefully — show `?` instead of LIVE/DEAD

## Narration Exemption

This skill is **exempt** from the output-discipline silence rules. The operator invoked `/th:pipelines` specifically to see pipeline internals — surfacing phase numbers, stage names, and pipeline mechanics is the explicit purpose of this skill. The narration lint does not apply to this file.
