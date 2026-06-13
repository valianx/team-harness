#!/usr/bin/env bash
# hooks/worktree-guard.sh
# PreToolUse advisory hook — start-gate reminder for agent-issued worktree/branch operations.
#
# Wired via hooks/config.json (Go installer) and .claude-plugin/hooks.json
# (plugin runtime) as its OWN PreToolUse entry with matcher:"Bash", SEPARATE
# from policy-block.sh, dev-guard.sh, and gcp-guard.sh. Reads tool_input from
# stdin; intercepts agent-issued git checkout -b / git switch -c / git worktree add
# and emits an advisory `ask` to confirm the start-gate decision.
#
# PURPOSE:
#   Prompt the agent (and indirectly the operator) to confirm the worktree
#   discipline start-gate: clean+on-main → branch in place; dirty or non-main
#   → create a worktree. Advisory only — never blocks.
#
# SCOPE BOUNDARY:
#   This hook fires ONLY on commands that Claude's own Bash tool is about to run.
#   It CANNOT intercept a human typing `git checkout -b` in a separate terminal,
#   a second Claude session's own Bash calls, or commands run inside a worktree's
#   own session. This is an advisory reminder for the orchestrator-driven path;
#   the human-two-session path is governed by documented discipline only
#   (docs/worktree-discipline.md § "Rule 1" U1 boundary statement).
#
# CONTRACT:
#   FAIL-OPEN. On any error (stdin parse failure, python3 absent, unexpected
#   input), the hook exits 0 with no JSON — Claude proceeds normally.
#   An unparseable payload that does NOT contain the trigger tokens → nodecision.
#   An unparseable payload that DOES contain the trigger tokens → ask (fail-safe).
#
# MODELED ON: hooks/gcp-guard.sh (same stdin parsing, same output helpers,
# same fast-exit pattern, same Python3-with-grep-fallback approach).
#
# Cross-platform: runs under Git Bash on Windows, native bash on macOS/Linux.
# Generic: no tokens, no private endpoints, no personal config. CLAUDE.md §12.
#
# Exit behaviour (Claude Code hook contract):
#   exit 0 + JSON      -> Claude processes the JSON (ask).
#   exit 0 + empty     -> no decision; Claude defers to the normal permission flow.
#   Other exit         -> undefined; do not use.

set -euo pipefail

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

nodecision() {
    exit 0
}

ask() {
    local reason="$1"
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}\n' "$reason"
    exit 0
}

# ---------------------------------------------------------------------------
# Step 1 — Read stdin
# ---------------------------------------------------------------------------
input="$(cat)"

# ---------------------------------------------------------------------------
# Step 2 — Check tool_name; only gate on Bash tool calls
# ---------------------------------------------------------------------------
_tool_name=""
if command -v python3 >/dev/null 2>&1; then
    _tool_name=$(python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    print(data.get('tool_name', ''))
except Exception:
    print('')
" <<< "$input" 2>/dev/null || true)
else
    _tool_name=$(printf '%s' "$input" \
        | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
        | sed 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)
fi

# Non-Bash tool calls are never our concern
if [ "$_tool_name" != "Bash" ]; then
    nodecision
fi

# ---------------------------------------------------------------------------
# Step 3 — Extract the command from the JSON payload
# Python3 preferred; grep/sed fallback
# ---------------------------------------------------------------------------
cmd=""
if command -v python3 >/dev/null 2>&1; then
    cmd=$(python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    ti = data.get('tool_input', data)
    print(ti.get('command', ''))
except Exception:
    print('')
" <<< "$input" 2>/dev/null || true)
else
    cmd=$(printf '%s' "$input" \
        | grep -oE '"command"[[:space:]]*:[[:space:]]*"([\\].|[^"\\])*"' | head -1 \
        | sed -E 's/^"command"[[:space:]]*:[[:space:]]*"(.*)"$/\1/' \
        2>/dev/null || true)
fi

# ---------------------------------------------------------------------------
# Step 4 — Fast-exit: no trigger token → nodecision
# The trigger tokens are: git checkout -b / git switch -c / git worktree add
# This check is fast and covers the overwhelming majority of Bash commands.
# ---------------------------------------------------------------------------
_has_trigger=false
if printf '%s' "$cmd" | grep -qE 'git[[:space:]]+(checkout[[:space:]]+-b|switch[[:space:]]+-c|worktree[[:space:]]+add)' 2>/dev/null; then
    _has_trigger=true
elif printf '%s' "$input" | grep -qE 'git[[:space:]]+(checkout[[:space:]]+-b|switch[[:space:]]+-c|worktree[[:space:]]+add)' 2>/dev/null; then
    # Extraction failed but raw payload contains the trigger — fail-safe path
    _has_trigger=true
fi

if [ "$_has_trigger" = "false" ]; then
    nodecision
fi

# ---------------------------------------------------------------------------
# Step 5 — Emit advisory ask with start-gate reminder
# ---------------------------------------------------------------------------
ask "worktree-guard: agent-issued branch/worktree operation detected. Before proceeding, confirm the start-gate decision (docs/worktree-discipline.md): (1) run \`git status\` and \`git worktree list\`; (2) if clean AND on main → branch in place is permitted; if dirty OR on a non-main branch → create a worktree instead; (3) always cut from fresh origin/main (\`git fetch origin main\` first). NOTE: this hook only sees agent-issued commands — it cannot cover a human's own-terminal git operations (worktree-guard.sh; see docs/worktree-discipline.md)"
