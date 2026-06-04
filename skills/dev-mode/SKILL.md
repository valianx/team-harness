---
name: dev-mode
description: Toggle Team Harness developer mode — activates or deactivates the developer-mode output style (the top-level orchestrator disposition) plus the deterministic outward-action gate. Usage: /dev-mode [on|off|status].
disable-model-invocation: true
---

You are toggling Team Harness **developer mode** for the operator. Developer mode is the OPT-IN that makes the top-level agent adopt the orchestrator disposition (via the `developer-mode` output style, which REPLACES the general-agent base) and arms the deterministic outward-action gate (`hooks/dev-guard.sh`). Normal mode is the default; this skill is the toggle.

This skill performs filesystem/config actions and reports — it does NOT itself start any development work. Developer mode only takes effect after the operator reloads the session (see the `/clear` note), because an output style replaces the system prompt and applies on context reload — a Claude Code constraint, not a choice.

## Step 1 — Parse the argument

From the invocation `/dev-mode <arg>`:
- no arg, or `on` → **Activate** (Step 2A)
- `off` → **Deactivate** (Step 2B)
- `status` → **Report** (Step 2C)
- anything else → print usage (`/dev-mode [on|off|status]`) and stop.

Resolve `~` to `$HOME`. Read the full `~/.claude/settings.json` as JSON before any write; back it up (`settings.json.bak-<UTC-ish suffix>`); merge only the owned key; write the whole document back (never overwrite the file with a partial payload).

## Step 2A — Activate developer mode

1. Merge `"outputStyle": "developer-mode"` into `~/.claude/settings.json` (preserve every other key).
2. Write the marker `~/.claude/.dev-mode-active` containing exactly `dev_mode: true`. (Activation runs while the gate is still inert — no marker yet — so this write is allowed.)
3. Report, in the operator's language, declaratively (no enthusiasm markers, no emoji — §7.1):
   - `Developer mode set. Run /clear (or start a new session) to enter it — the output style applies on reload. The DEVELOPER MODE banner appears when it is active.`
4. STOP. Do NOT begin orchestrating or any development work in this session — developer mode is not active until the operator reloads.

## Step 2B — Deactivate developer mode

1. Remove the `outputStyle` key from `~/.claude/settings.json` (preserve every other key).
2. Remove the marker: `rm ~/.claude/.dev-mode-active`. The `dev-guard.sh` gate intercepts marker removal with `permissionDecision: "ask"` — the **operator** confirms the exit. This is expected and correct: it prevents silently disabling the gate. If the operator declines the prompt, dev mode stays armed; report that and stop.
3. Report: `Developer mode unset. Run /clear (or a new session) to return to normal mode.`

## Step 2C — Status

Read `~/.claude/settings.json` (`outputStyle`) and check for `~/.claude/.dev-mode-active`. Report whether developer mode is currently set (output style + marker present) or not. Take no other action.

## Notes

- **The `/clear` is mandatory** for activation/deactivation to take effect — the output style replaces the system prompt, which only reloads on a fresh context. There is no clean mid-session toggle (a Claude Code constraint); this skill makes the toggle a single command instead of navigating `/config`.
- This skill is the **canonical repo source**; it is installed as a USER-LEVEL skill at `~/.claude/skills/dev-mode/` by `/th:setup` and re-synced by `/th:update`, so the bare `/dev-mode` is available (plugin skills are namespaced; the bare command requires a user-level skill).
- The gate (`hooks/dev-guard.sh`) and the precondition contract (managed block + `docs/dev-mode.md`) are unchanged by this skill — it only flips the output style + marker.
