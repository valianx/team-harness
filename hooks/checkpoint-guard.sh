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

# ---------------------------------------------------------------------------
# Step 3 — Locate 00-state.md
# The hook environment provides the working directory via $CWD or the process
# working directory. We search up to 5 levels for workspaces/ subtrees.
# ---------------------------------------------------------------------------

STATE_FILE=""
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
# Applied before the boundary branch; honoured at B1, B2, and B3 equally.
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
# Step 6 — Read checkpoint_boundary and determine which gate (if any) is armed
# ---------------------------------------------------------------------------

# checkpoint_boundary: null → checkpoint is not armed; allow the dispatch.
if read_field "checkpoint_boundary" "null"; then
    allow
fi

# If no checkpoint_boundary field at all, treat as unarmed.
if ! grep -q "^[[:space:]]*-[[:space:]]*checkpoint_boundary:" "$STATE_FILE" 2>/dev/null; then
    allow
fi

# Extract the checkpoint_boundary value with strict line-token parsing.
boundary_value=""
boundary_value=$(grep "^[[:space:]]*-[[:space:]]*checkpoint_boundary:[[:space:]]*" "$STATE_FILE" 2>/dev/null \
    | head -1 \
    | sed 's/^[[:space:]]*-[[:space:]]*checkpoint_boundary:[[:space:]]*//' \
    | sed 's/[[:space:]]*$//' \
    || true)

# ---------------------------------------------------------------------------
# Step 7 — B1 gate: name-keyed (preserves existing behaviour exactly).
# When B1 (intake-plan) is armed, only th:architect triggers the advance check.
# A non-architect dispatch while B1 is armed still allows (Case 8).
# ---------------------------------------------------------------------------

if [ "$boundary_value" = "intake-plan" ]; then
    if [ "$subagent_type" != "th:architect" ]; then
        allow
    fi
    # Fall through to advance-contract evaluation below (same predicate as B2/B3).
fi

# ---------------------------------------------------------------------------
# Step 8 — B2/B3 gate: boundary-keyed.
# When research-next or postverify-next is armed, the boundary itself is the
# arming signal — evaluate the advance contract on ANY Task dispatch regardless
# of destination agent. B2/B3 dispatch variable subagent types; keying on the
# boundary value is the only stable arming signal already recorded in 00-state.md.
# ---------------------------------------------------------------------------

if [ "$boundary_value" != "intake-plan" ] && \
   [ "$boundary_value" != "research-next" ] && \
   [ "$boundary_value" != "postverify-next" ]; then
    # Unknown boundary value — treat as unarmed (fail-open).
    allow
fi

# ---------------------------------------------------------------------------
# Step 9 — Evaluate the advance contract
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
# Step 10 — Deny: explain which condition is missing, naming the active boundary
# ---------------------------------------------------------------------------

case "$boundary_value" in
    "intake-plan")
        if [ "$advance_fresh" = "false" ] && [ "$clarity_confirmed" = "false" ]; then
            deny "Reasoning checkpoint not satisfied at boundary B1 (intake→plan): fresh advance signal missing and functional clarity artifact not confirmed. Respond to the planning-confirmation prompt and confirm the functional statement before the architect is dispatched."
        elif [ "$advance_fresh" = "false" ]; then
            deny "Reasoning checkpoint not satisfied at boundary B1 (intake→plan): fresh advance signal missing. Respond explicitly to the planning-confirmation prompt (¿Pasamos a planeación? [plan/explorar]) before the architect is dispatched."
        else
            deny "Reasoning checkpoint not satisfied at boundary B1 (intake→plan): functional clarity artifact not confirmed. Confirm a short functional statement (what we are building, functionally) before the architect is dispatched."
        fi
        ;;
    "research-next")
        if [ "$advance_fresh" = "false" ] && [ "$clarity_confirmed" = "false" ]; then
            deny "Reasoning checkpoint not satisfied at boundary B2 (research→next): fresh advance signal missing and functional clarity artifact not confirmed. Confirm what to do with the research findings and provide a fresh advance signal before the next phase is dispatched."
        elif [ "$advance_fresh" = "false" ]; then
            deny "Reasoning checkpoint not satisfied at boundary B2 (research→next): fresh advance signal missing. Respond explicitly to the checkpoint prompt before the next phase is dispatched."
        else
            deny "Reasoning checkpoint not satisfied at boundary B2 (research→next): functional clarity artifact not confirmed. Confirm the direction for the next step based on the research findings."
        fi
        ;;
    "postverify-next")
        if [ "$advance_fresh" = "false" ] && [ "$clarity_confirmed" = "false" ]; then
            deny "Reasoning checkpoint not satisfied at boundary B3 (postverify→next): fresh advance signal missing and functional clarity artifact not confirmed. Confirm direction for the next step after verification and provide a fresh advance signal."
        elif [ "$advance_fresh" = "false" ]; then
            deny "Reasoning checkpoint not satisfied at boundary B3 (postverify→next): fresh advance signal missing. Respond explicitly to the checkpoint prompt before the next phase is dispatched."
        else
            deny "Reasoning checkpoint not satisfied at boundary B3 (postverify→next): functional clarity artifact not confirmed. Confirm the direction for the next step after verification."
        fi
        ;;
    *)
        # Should not reach here (handled in Step 8), but fail-open just in case.
        allow
        ;;
esac
