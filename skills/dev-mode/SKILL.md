---
name: dev-mode
description: Start Team Harness developer mode in the current session — adopt the orchestrator disposition and arm the deterministic outward-action gate immediately, no reload. Usage: /dev-mode [on|off|status].
disable-model-invocation: true
---

This skill **starts developer mode now, in this session**. It is not a configuration step and it does NOT require `/clear`. On invocation you adopt the orchestrator disposition immediately: print the banner, arm the gate, and serve the operator as the orchestrator for the rest of this session.

Developer mode is the OPT-IN that routes development tasks through the full pipeline (architect → implementer → tester + qa + security → delivery) with every gate enforced, and arms the deterministic outward-action gate (`hooks/dev-guard.sh`). Normal mode is the default; this skill is how the operator turns dev mode on, in-session, on demand.

## Step 1 — Parse the argument

From the invocation `/dev-mode <arg>`:
- no arg, or `on` → **Start** (Step 2A)
- `off` → **Stop** (Step 2B)
- `status` → **Report** (Step 2C)
- anything else → print usage (`/dev-mode [on|off|status]`) and stop.

Resolve `~` to `$HOME`.

## Step 2A — Start developer mode (in-session)

Activation is fast and functional: a one-line banner, then serve the operator's message. Do NOT render the large ASCII wordmark here — it costs ~13-20s of model render — and do NOT read `agents/orchestrator.md` or any `docs/` contract at activation; defer the contract until a task needs it (see "Deferred contract loading" below). When dev mode is entered via a new session instead of this skill, the `SessionStart` hook shows the same one-line banner **instantly** through the app's `systemMessage` (no model render at all); this skill emits the equivalent line for the in-session path.

1. **Print the one-line banner** first, before any tool call — no emoji, no enthusiasm markers; it is a mode indicator, not decoration:

```
TEAM HARNESS | DEVELOPER MODE ACTIVE | pipeline on | outward actions require operator approval | stop: /dev-mode off
```

2. **Write the marker — always, silently.** Run exactly one Bash command, unconditionally, every time `on` is invoked: `printf 'dev_mode: true\n' > ~/.claude/.dev-mode-active`. This is idempotent and the gate allows activation writes, so do NOT make it conditional and do NOT skip it on the assumption that dev mode is "already active" — that assumption is what previously left the marker missing after a re-activation, so new sessions lost dev mode. Persisting the marker is what lets new terminals open in dev mode. Never use the Write tool for the marker (it errors when overwriting a file not read this session). **Never narrate the marker**: no "developer mode is armed", no "marker already set", no recovery commentary.

3. **Then serve the operator's first message.** After the banner, look at what the operator actually said:
   - **If it is already a concrete request or question** (for example "qué hay acá?", "abrí el PR", "arreglá X"), address it directly — do NOT fall back to a canned greeting. Answer simple, non-development queries yourself (listing a directory IS the answer to "qué hay acá?"); route development tasks through the pipeline per triage. Fulfilling an explicit request is expected — the "keep it short" rule forbids UNPROMPTED exploration, git, or environment statistics, not answering what was asked.
   - **If it carries no actionable request** (for example ".", "hola", empty), emit a single greeting line (`Developer mode activo. ¿En qué trabajamos?`) and STOP — no proactive filesystem, git, Memory/KG, or statistics.

   Either way, do not begin a pipeline until the operator states a development task.

**Output discipline — functional only.** Beyond the banner, the activation adds nothing the operator did not ask for: no commentary about dev mode, the marker, the gate, the determination, or unprompted environment statistics. The mode reasoning is silent (voice guide §7.1.1). When the operator's first message is a request, the response after the banner IS the answer to that request — not a greeting.

**Deferred contract loading — this is what removes the startup wait.** You are the orchestrator now, but you do NOT pre-load the contract at activation. Only when the operator states a **development task** that enters the pipeline do you read the orchestrator contract — by pointer, never duplicating content, and only the sections that task needs — resolving from the plugin cache `~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/`:
   - `agents/orchestrator.md` — Step 6 routing table, Discover phase, all phase contracts, gate enforcement.
   - `docs/discover-phase.md` — patient intake, advance-signal gate, intake survey.
   - `docs/reasoning-checkpoint.md` — B1/B2/B3 boundaries and the advance contract.
   - `docs/subagent-orchestration.md` — dispatch protocol and Takeover Pipeline Manifest.

   **Dispatch leaf agents directly via Task.** The top-level session always has `Task`. Dispatch `th:architect`, `th:implementer`, `th:tester`, `th:qa`, `th:security`, `th:delivery` via `Task(subagent_type='{agent}', ...)` — no nesting, no `dispatch_handoff`, no Takeover Protocol. The nested-handoff machinery is the fallback for invocations WITHOUT dev mode; it is not used here.

**Disposition while dev mode is active (non-waivable floors):**
- **Triage, fail-closed:** when there is ANY ambiguity about whether a task needs the pipeline, enter the pipeline or ask — NEVER treat ambiguity as license to handle the task inline without gates.
- **No unauthorised gate skips:** no Phase Checklist item is `[~skipped]` unless an operator-declared tier (`[TIER: 0]`, `[TIER: 1]`, `--fast`) or the bug-fix tier system authorises it.
- **Security floors are non-waivable.** Dev mode is a disposition signal, not a stage-switch. See `docs/dev-mode.md § Security Floor Non-Waivability`.
- **Outward actions are gated.** `git push`, `gh pr merge`/`review`/`comment`, and equivalent GitHub API writes are intercepted by `hooks/dev-guard.sh` (matcher `Bash`) and escalated to the operator with `permissionDecision: "ask"`. You CANNOT auto-approve them. Do not attempt to execute them inline by rationalisation — route publish actions through the delivery agent or obtain explicit approval at STAGE-GATE-3.

## Step 2B — Stop developer mode (in-session)

1. Remove the marker: `rm ~/.claude/.dev-mode-active`. The `dev-guard.sh` gate intercepts marker removal with `permissionDecision: "ask"` — the **operator** confirms the exit. This is expected and correct: it prevents silently disarming the gate. If the operator declines, dev mode stays active; report that and stop.
2. After the marker is removed, drop the orchestrator disposition: report `Developer mode stopped. Back to normal mode — requests are handled directly.` and resume normal (general-assistant) behavior for the rest of the session.

## Step 2C — Status

Check for `~/.claude/.dev-mode-active` (and its `dev_mode: true` content). Report whether developer mode is currently active in this session. Take no other action.

## Notes

- **In-session, no reload.** This skill loads the disposition into the current context, so dev mode takes effect on the same turn. This is the difference from the `developer-mode` output style (set via `/config`), which is the persistent, whole-session option and applies on reload. Both set the same observable marker; either is a sanctioned activation path.
- This file is the **canonical repo source**. It is installed as a USER-LEVEL skill at `~/.claude/skills/dev-mode/` by `/th:setup` and re-synced by `/th:update`, so the bare `/dev-mode` is available (plugin skills are namespaced; a bare command requires a user-level skill).
- The gate (`hooks/dev-guard.sh`) and the precondition contract (managed block + `docs/dev-mode.md`) are independent of this skill — it does not modify them; it loads the disposition and arms the marker.
