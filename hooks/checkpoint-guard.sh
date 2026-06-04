#!/usr/bin/env bash
# hooks/checkpoint-guard.sh
# PreToolUse hook — reasoning checkpoint guard.
#
# Wired via hooks/config.json as a PreToolUse hook with matcher:"Task".
# Reads tool_input from stdin; blocks the Task dispatch with
# permissionDecision:"deny" when the reasoning checkpoint is armed and the
# advance contract is not satisfied.
#
# Contract: docs/reasoning-checkpoint.md § Enforcement § Layer 1
#
# Cross-platform: runs under Git Bash on Windows, native bash on macOS/Linux.
# Generic: no tokens, no private endpoints, no personal config. CLAUDE.md §12.
#
# Exit behaviour (Claude Code hook contract):
#   exit 0 + JSON → Claude processes the JSON (deny or allow).
#   exit 2         → non-blocking error (Claude continues; NOT used for deny).
#   Other exit     → undefined; do not use.
#
# Fail-safe: if anything prevents reading state, emit allow (exit 0 + allow JSON).
# Rationale: this hook gates functional clarity, not security. Layer-2 self-check
# is the fallback. Security floors are on a fully independent path.

set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

allow() {
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}\n'
    exit 0
}

deny() {
    local reason="$1"
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason"
    exit 0
}

# ---------------------------------------------------------------------------
# Step 1 — Read tool_input from stdin
# ---------------------------------------------------------------------------
input="$(cat)"

# ---------------------------------------------------------------------------
# Step 2 — Extract subagent_type from the JSON payload.
# We need to identify whether the Task targets a gated phase agent.
# Gated agents: th:architect (B1 — intake→plan).
# B2/B3 gates are enforced by the orchestrator self-check (Layer 2) because
# they dispatch non-fixed subagent types depending on context.
# ---------------------------------------------------------------------------

# Strict line-level extraction: look for "subagent_type" key, take its value.
# Handles both compact and pretty-printed JSON.
subagent_type=""
if command -v python3 >/dev/null 2>&1; then
    subagent_type=$(python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    print(data.get('subagent_type', ''))
except Exception:
    print('')
" <<< "$input" 2>/dev/null || true)
else
    # Fallback: minimal grep-based extraction (conservative — only exact key match).
    subagent_type=$(printf '%s' "$input" | grep -o '"subagent_type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"subagent_type"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)
fi

# Only B1 is hook-enforced. B2/B3 rely on Layer-2 self-check.
if [ "$subagent_type" != "th:architect" ]; then
    allow
fi

# ---------------------------------------------------------------------------
# Step 3 — Locate 00-state.md
# The hook environment provides the working directory via $CWD or the process
# working directory. We search up to 2 levels of workspaces/ directories.
# ---------------------------------------------------------------------------

STATE_FILE=""

# Search heuristic: walk up from cwd looking for a workspaces/ subtree
# containing 00-state.md (most recently modified wins if multiple found).
search_root="${CWD:-$(pwd)}"

# Look for workspaces/*/00-state.md and obsidian-style work-logs/*/*/00-state.md
# (both modes produce 00-state.md — the path differs by logs-mode).
state_candidates=()
while IFS= read -r f; do
    state_candidates+=("$f")
done < <(find "$search_root" -maxdepth 5 -name "00-state.md" 2>/dev/null | sort -t'/' -k1 | head -5)

if [ ${#state_candidates[@]} -eq 0 ]; then
    # No state file found — cannot evaluate checkpoint. Fail-safe: allow.
    allow
fi

# Use the first (most shallow / most recently created) state file.
STATE_FILE="${state_candidates[0]}"

# ---------------------------------------------------------------------------
# Step 4 — Read the four clarity fields with STRICT line-token parsing.
# Accepted format: "- checkpoint_advance_fresh: true" (exact token, whole line).
# A line like "- checkpoint_advance_fresh: false # was true" does NOT match.
# ---------------------------------------------------------------------------

read_field() {
    local field="$1"
    local value="$2"  # expected value to check for
    # Match the exact line: "- <field>: <value>" with optional surrounding whitespace.
    grep -q "^[[:space:]]*-[[:space:]]*${field}:[[:space:]]*${value}[[:space:]]*$" "$STATE_FILE" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Step 5 — Check skip markers (deliberate opt-out → allow unconditionally)
# ---------------------------------------------------------------------------

# fast_mode: true → skip marker active
if read_field "fast_mode" "true"; then
    allow
fi

# discover_state: bypassed → skip marker was used at intake
if read_field "discover_state" "bypassed"; then
    allow
fi

# bug_tier with a numeric value (0-4) → hotfix/fix tier, skip marker semantics
if grep -q "^[[:space:]]*-[[:space:]]*bug_tier:[[:space:]]*[0-4][[:space:]]*$" "$STATE_FILE" 2>/dev/null; then
    allow
fi

# ---------------------------------------------------------------------------
# Step 6 — Check whether the checkpoint is armed
# ---------------------------------------------------------------------------

# checkpoint_boundary: null → checkpoint is not armed; allow the dispatch.
if read_field "checkpoint_boundary" "null"; then
    allow
fi

# If no checkpoint_boundary field at all, treat as unarmed.
if ! grep -q "^[[:space:]]*-[[:space:]]*checkpoint_boundary:" "$STATE_FILE" 2>/dev/null; then
    allow
fi

# ---------------------------------------------------------------------------
# Step 7 — Evaluate the advance contract
# Both conditions must hold: checkpoint_advance_fresh: true AND
# functional_clarity_confirmed: true
# ---------------------------------------------------------------------------

advance_fresh=false
clarity_confirmed=false

if read_field "checkpoint_advance_fresh" "true"; then
    advance_fresh=true
fi
if read_field "functional_clarity_confirmed" "true"; then
    clarity_confirmed=true
fi

if [ "$advance_fresh" = "true" ] && [ "$clarity_confirmed" = "true" ]; then
    allow
fi

# ---------------------------------------------------------------------------
# Step 8 — Deny: explain which condition is missing
# ---------------------------------------------------------------------------

if [ "$advance_fresh" = "false" ] && [ "$clarity_confirmed" = "false" ]; then
    deny "Reasoning checkpoint not satisfied at boundary B1 (intake→plan): fresh advance signal missing and functional clarity artifact not confirmed. Respond to the planning-confirmation prompt and confirm the functional statement before the architect is dispatched."
elif [ "$advance_fresh" = "false" ]; then
    deny "Reasoning checkpoint not satisfied at boundary B1 (intake→plan): fresh advance signal missing. Respond explicitly to the planning-confirmation prompt (¿Pasamos a planeación? [plan/explorar]) before the architect is dispatched."
else
    deny "Reasoning checkpoint not satisfied at boundary B1 (intake→plan): functional clarity artifact not confirmed. Confirm a short functional statement (what we are building, functionally) before the architect is dispatched."
fi
