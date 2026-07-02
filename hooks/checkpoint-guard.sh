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
#
# subagent_type is a Task tool ARGUMENT, so in Claude Code's real PreToolUse
# payload it lives under tool_input.subagent_type — not at the payload root
# (code.claude.com/docs/en/hooks-guide: PreToolUse tool arguments travel in
# tool_input). Reading the root only matched a flat test fixture, never a
# real CC payload — corrected together with the fixtures (T6c).
# ---------------------------------------------------------------------------

# Strict line-level extraction: look for "subagent_type" key, take its value.
# Handles both compact and pretty-printed JSON.
subagent_type=""
if command -v python3 >/dev/null 2>&1; then
    subagent_type=$(python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    tool_input = data.get('tool_input', {})
    if not isinstance(tool_input, dict):
        tool_input = {}
    print(tool_input.get('subagent_type', ''))
except Exception:
    print('')
" <<< "$input" 2>/dev/null || true)
else
    # Fallback: minimal grep-based extraction (conservative — only exact key
    # match). Not JSON-structure-aware, so it matches "subagent_type" anywhere
    # in the payload regardless of nesting — already tool_input-agnostic.
    subagent_type=$(printf '%s' "$input" | grep -o '"subagent_type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"subagent_type"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)
fi

# ---------------------------------------------------------------------------
# Step 3 — Locate 00-state.md
#
# Search strategy (C1 fix: F-018 + F-010):
#   1. Collect candidates from local workspaces/ subtree under $CWD.
#   2. If logs-mode is "obsidian" in ~/.claude/.team-harness.json, also collect
#      candidates from the vault workspace root ({logs-path}/{logs-subfolder}).
#   3. Skip candidates whose status: field is terminal (complete, blocked-*).
#      A terminal workspace is no longer active and must not gate a new dispatch.
#   4. Among the remaining active candidates, select the NEWEST by mtime using a
#      portable ls -t sort (not find -printf which is GNU-only and absent on macOS).
#   5. If all candidates are terminal, fall-open (no active boundary to enforce).
#
# The false comment "most shallow / most recently created" is removed: mtime is
# the correct key; depth-ordering conflates filesystem depth with recency.
# ---------------------------------------------------------------------------

STATE_FILE=""
search_root="${CWD:-$(pwd)}"

# Collect raw candidates from local workspaces/ tree.
raw_candidates=()
# Constrain to workspace-shaped paths: workspaces/*/00-state.md up to 3 deep.
# This prevents stray test fixtures or deeply nested state files from hijacking
# the gate (the original find -maxdepth 5 with no path shape constraint could do this).
while IFS= read -r f; do
    raw_candidates+=("$f")
done < <(find "$search_root" -maxdepth 4 -name "00-state.md" 2>/dev/null || true)

# F-010: if logs-mode is "obsidian", also search the vault workspace root.
_th_config="${HOME:-~}/.claude/.team-harness.json"
if [ -f "$_th_config" ]; then
    _logs_mode=""
    _logs_path=""
    _logs_sub=""
    if command -v python3 >/dev/null 2>&1 && python3 -c '' 2>/dev/null; then
        # Pass the config content via stdin to avoid bash-vs-python HOME path mismatch
        # on Windows (bash HOME = /c/Users/x; python3 HOME = C:\Users\x).
        _vault_parse=$(python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    mode = data.get('logs-mode','')
    path = data.get('logs-path','')
    sub  = data.get('logs-subfolder','work-logs')
    print(mode)
    print(path)
    print(sub)
except Exception:
    print('')
    print('')
    print('')
" < "$_th_config" 2>/dev/null || printf '\n\n\n')
        _logs_mode=$(printf '%s' "$_vault_parse" | sed -n '1p')
        _logs_path=$(printf '%s' "$_vault_parse" | sed -n '2p')
        _logs_sub=$(printf '%s' "$_vault_parse" | sed -n '3p')
    else
        # Bash fallback: simple grep/sed for the three keys.
        _logs_mode=$(grep -o '"logs-mode"[[:space:]]*:[[:space:]]*"[^"]*"' "$_th_config" 2>/dev/null \
            | head -1 | sed 's/.*"logs-mode"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
        _logs_path=$(grep -o '"logs-path"[[:space:]]*:[[:space:]]*"[^"]*"' "$_th_config" 2>/dev/null \
            | head -1 | sed 's/.*"logs-path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
        _logs_sub=$(grep -o '"logs-subfolder"[[:space:]]*:[[:space:]]*"[^"]*"' "$_th_config" 2>/dev/null \
            | head -1 | sed 's/.*"logs-subfolder"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
    fi

    if [ "$_logs_mode" = "obsidian" ] && [ -n "$_logs_path" ]; then
        # Scope the search to THIS repo's work-logs subtree — never the whole vault.
        # Layout: {logs-path}/{logs-subfolder}/{repo}/{date}_{feature}/00-state.md, plus the
        # initiative variant {repo}/{date}_{initiative}/{project}/00-state.md (one level deeper).
        # The repo is the basename of the search root (the repo root in production).
        #
        # Why scoped, not vault-wide: a find over {logs-path}/{logs-subfolder} traverses the
        # operator's ENTIRE Obsidian vault (potentially thousands of unrelated notes) on every
        # single Task dispatch. That is multi-second latency in the common case and degrades to
        # an unbounded hang on a large vault — observed blocking the dispatch with no output.
        # Scoping to the repo keeps the find O(this repo's pipelines).
        #
        # `timeout` is intentionally NOT used to bound the find: it is absent on stock macOS
        # (BSD userland ships gtimeout only via coreutils), and this hook must stay portable
        # across Git Bash / macOS / Linux. Correct scoping removes the need for a wall-clock bound.
        _repo_name=$(basename "$search_root" 2>/dev/null || true)
        if [ -n "$_repo_name" ]; then
            _vault_root="${_logs_path}/${_logs_sub}/${_repo_name}"
            while IFS= read -r f; do
                raw_candidates+=("$f")
            done < <(find "$_vault_root" -maxdepth 3 -name "00-state.md" 2>/dev/null || true)
        fi
    fi
fi

if [ ${#raw_candidates[@]} -eq 0 ]; then
    # No state file found anywhere — fail-safe: allow.
    allow
fi

# ---------------------------------------------------------------------------
# Filter out terminal-status candidates.
# Terminal: status is "complete" or starts with "blocked-".
# A terminal workspace is done; it must not gate a new dispatch even if it is
# the alphabetically-first or most-recently-written candidate.
# ---------------------------------------------------------------------------
# Order ALL candidates newest-first with a SINGLE ls -t (one subprocess), then walk
# the list and select the first NON-terminal workspace — the active pipeline, normally
# the newest-mtime file. This stops at the live workspace instead of status-checking
# every historical one.
#
# Why this shape: a vault accumulates dozens of past 00-state.md files, most left at a
# non-"complete" status. The previous "status-check ALL candidates, then sort" path
# spawned ~5 subprocesses (grep+head+printf+sed+sed) PER candidate. On Windows Git Bash,
# where fork is expensive, dozens of stale workspaces turned a single Task dispatch into a
# multi-second-to-hanging operation with no output (the spin is mid-loop, before any echo).
# Newest-first + early-break is O(1) status checks in the common case (the newest file is
# the live pipeline) and is bounded by the number of trailing just-completed workspaces
# otherwise. The selection result is identical to the old code: the newest non-terminal
# candidate. ls -t is POSIX (Git Bash / macOS / Linux), no GNU find -printf.
ordered_candidates=()
if [ ${#raw_candidates[@]} -eq 1 ]; then
    ordered_candidates=("${raw_candidates[0]}")
else
    while IFS= read -r f; do
        [ -n "$f" ] && ordered_candidates+=("$f")
    done < <(ls -t "${raw_candidates[@]}" 2>/dev/null || printf '%s\n' "${raw_candidates[@]}")
fi

STATE_FILE=""
for candidate in "${ordered_candidates[@]}"; do
    [ -f "$candidate" ] || continue
    # Extract the status value from the candidate file.
    _status_line=$(grep "^[[:space:]]*-[[:space:]]*status:" "$candidate" 2>/dev/null | head -1 || true)
    _status_val=$(printf '%s' "$_status_line" \
        | sed 's/^[[:space:]]*-[[:space:]]*status:[[:space:]]*//' \
        | sed 's/[[:space:]]*$//' \
        || true)
    case "$_status_val" in
        complete|blocked-*) continue ;;          # terminal — skip to the next-newest
        *) STATE_FILE="$candidate"; break ;;     # first active (newest) workspace — done
    esac
done

if [ -z "$STATE_FILE" ] || [ ! -f "$STATE_FILE" ]; then
    # No active (non-terminal) workspace anywhere — nothing to gate. Fail-open.
    allow
fi

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
