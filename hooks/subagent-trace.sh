#!/bin/bash
# hooks/subagent-trace.sh — SubagentStop coarse backstop.
#
# Wired on the SubagentStop event (matcher: th:.*) via hooks/config.json and
# .claude-plugin/hooks.json.  Appends a deterministic "subagent.stop" breadcrumb
# to a fixed-literal 00-subagent-trace.jsonl whenever a Team Harness pipeline
# subagent finishes.
#
# PURPOSE (backstop, NOT a replacement):
#   The SubagentStop payload carries only session_id, cwd, agent_id, agent_type,
#   and a path to the session file — no tokens, no duration, no result.  This hook provides
#   deterministic proof that a th:* subagent boundary occurred, complementing the
#   orchestrator's rich phase.end record.  It is strictly MORE than zero signal and
#   strictly LESS than the orchestrator's authoritative trace.
#
# SECURITY INVARIANTS (SEC-DR-002, SEC-DR-004, SEC-DR-005):
#   - Emits NOTHING on stdout on every path (breadcrumb → file via >>).
#   - No stdout JSON decision envelope emitted (the #298 class of violation).
#   - Every code path exits 0 — never blocks the subagent.
#   - Never reads from or opens the session transcript file.
#   - agent_id is treated as an opaque correlation key (SEC-DR-007).
#   - Writes only to a fixed-literal filename under a validated base.
#
# PROFILE GATE (AC-13):
#   Sources _hook-profile.sh; exits 0 silently under TH_HOOK_PROFILE=minimal.
#   Enforcement floors NEVER source _hook-profile.sh.
#
# SCOPE GUARD:
#   The SubagentStop matcher (th:.*) is the outer filter.  Defense-in-depth:
#   the hook also checks the extracted agent_type starts with "th:" before
#   writing.  Non-th: agents → silent exit 0, no write.
#
# Exit code: always 0.  stdout: always empty.
#
# Cross-platform: Git Bash on Windows, native bash on macOS/Linux.
# Generic: no tokens, no private endpoints.  CLAUDE.md §12.

# ---------------------------------------------------------------------------
# Step 0 — Profile gate (AC-13 / pipeline-observability class)
# ---------------------------------------------------------------------------
# Source the shared helper from the same directory.
# shellcheck source=./_hook-profile.sh
. "$(dirname "$0")/_hook-profile.sh" 2>/dev/null || true

th_observability_enabled "pipeline-observability" || exit 0

# ---------------------------------------------------------------------------
# Step 1 — Drain stdin (SubagentStop payload)
# ---------------------------------------------------------------------------
PAYLOAD=$(cat 2>/dev/null || true)

# ---------------------------------------------------------------------------
# Step 2 — Extract agent_type, agent_id, cwd from payload
# Python3 preferred; grep/sed fallback (mirrors worktree-guard.sh pattern)
# ---------------------------------------------------------------------------
AGENT_TYPE=""
AGENT_ID=""
CWD_VAL=""

if command -v python3 >/dev/null 2>&1; then
    AGENT_TYPE=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('agent_type', ''))
except Exception:
    print('')
" <<< "$PAYLOAD" 2>/dev/null || true)

    AGENT_ID=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('agent_id', ''))
except Exception:
    print('')
" <<< "$PAYLOAD" 2>/dev/null || true)

    CWD_VAL=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('cwd', ''))
except Exception:
    print('')
" <<< "$PAYLOAD" 2>/dev/null || true)
else
    # grep/sed fallback — adequate for simple string fields
    AGENT_TYPE=$(printf '%s' "$PAYLOAD" \
        | grep -o '"agent_type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
        | sed 's/.*"agent_type"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)
    AGENT_ID=$(printf '%s' "$PAYLOAD" \
        | grep -o '"agent_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
        | sed 's/.*"agent_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)
    CWD_VAL=$(printf '%s' "$PAYLOAD" \
        | grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
        | sed 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)
fi

# ---------------------------------------------------------------------------
# Step 3 — th: scope guard (defense-in-depth under the matcher)
# ---------------------------------------------------------------------------
case "$AGENT_TYPE" in
    th:*)
        # Expected — continue
        ;;
    *)
        # Not a TH pipeline subagent; silent exit 0, no write.
        exit 0
        ;;
esac

# ---------------------------------------------------------------------------
# Step 4 — Resolve workspace base from ~/.claude/.team-harness.json
# Mirrors session-start.sh config-read + SEC-DR-A control-char guard
# ---------------------------------------------------------------------------
CONFIG="${HOME}/.claude/.team-harness.json"
LOGS_MODE=""
LOGS_PATH=""
LOGS_SUBFOLDER=""

if [ -f "$CONFIG" ]; then
    if command -v jq >/dev/null 2>&1; then
        LOGS_MODE=$(jq -r '."logs-mode" // empty' "$CONFIG" 2>/dev/null) || LOGS_MODE=""
        LOGS_PATH=$(jq -r '."logs-path" // empty' "$CONFIG" 2>/dev/null) || LOGS_PATH=""
        LOGS_SUBFOLDER=$(jq -r '."logs-subfolder" // empty' "$CONFIG" 2>/dev/null) || LOGS_SUBFOLDER=""
    else
        LOGS_MODE=$(grep -o '"logs-mode"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG" 2>/dev/null \
            | sed 's/.*"logs-mode"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)
        LOGS_PATH=$(grep -o '"logs-path"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG" 2>/dev/null \
            | sed 's/.*"logs-path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)
        LOGS_SUBFOLDER=$(grep -o '"logs-subfolder"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG" 2>/dev/null \
            | sed 's/.*"logs-subfolder"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)
    fi
fi

# SEC-DR-A: reject logs-path containing any control character.
if [[ "$LOGS_PATH" == *[[:cntrl:]]* ]]; then
    exit 0
fi

# Default subfolder when absent.
[ -n "$LOGS_SUBFOLDER" ] || LOGS_SUBFOLDER="work-logs"

# ---------------------------------------------------------------------------
# Step 5 — Determine trace file path
# Fixed-literal filename: 00-subagent-trace.jsonl
# local mode: <cwd>/workspaces/00-subagent-trace.jsonl (only if workspaces/ exists)
# obsidian mode: <logs-path>/<logs-subfolder>/00-subagent-trace.jsonl (only if base exists)
# ---------------------------------------------------------------------------
TRACE_FILE=""

if [ "$LOGS_MODE" = "obsidian" ] && [ -n "$LOGS_PATH" ]; then
    OBSIDIAN_BASE="${LOGS_PATH}/${LOGS_SUBFOLDER}"
    if [ -d "$OBSIDIAN_BASE" ]; then
        TRACE_FILE="${OBSIDIAN_BASE}/00-subagent-trace.jsonl"
    fi
else
    # local mode — use cwd from payload if workspaces/ dir exists there
    if [ -n "$CWD_VAL" ] && [ -d "${CWD_VAL}/workspaces" ]; then
        TRACE_FILE="${CWD_VAL}/workspaces/00-subagent-trace.jsonl"
    fi
fi

# No resolvable base → silent exit 0, no write.
[ -n "$TRACE_FILE" ] || exit 0

# ---------------------------------------------------------------------------
# Step 6 — Append one JSON line via python3 json.dumps (value fields only)
# Fields: ts (ISO timestamp), event, agent_type, agent_id, cwd
# Never shell-interpolated; cwd is a json.dumps value field, not a path.
# ---------------------------------------------------------------------------
TS=$(python3 -c "import datetime; print(datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))" 2>/dev/null \
    || date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || true)

if command -v python3 >/dev/null 2>&1; then
    python3 -c "
import json, sys
ts         = sys.argv[1]
agent_type = sys.argv[2]
agent_id   = sys.argv[3]
cwd        = sys.argv[4]
line = json.dumps({
    'ts':         ts,
    'event':      'subagent.stop',
    'agent_type': agent_type,
    'agent_id':   agent_id,
    'cwd':        cwd,
})
print(line)
" "$TS" "$AGENT_TYPE" "$AGENT_ID" "$CWD_VAL" >> "$TRACE_FILE" 2>/dev/null || true
else
    # python3 absent — write a minimal safe line using printf.
    # AGENT_TYPE is validated to start with "th:" (no special chars expected);
    # AGENT_ID and CWD_VAL are written in escaped form using sed.
    # This path is the degraded fallback; python3 is strongly preferred.
    _SAFE_ID=$(printf '%s' "$AGENT_ID" | sed 's/["\]/\\&/g' 2>/dev/null || true)
    _SAFE_CWD=$(printf '%s' "$CWD_VAL" | sed 's/["\\/]/\\&/g; s/	/\\t/g' 2>/dev/null || true)
    _SAFE_TYPE=$(printf '%s' "$AGENT_TYPE" | sed 's/["\\/]/\\&/g' 2>/dev/null || true)
    printf '{"ts":"%s","event":"subagent.stop","agent_type":"%s","agent_id":"%s","cwd":"%s"}\n' \
        "$TS" "$_SAFE_TYPE" "$_SAFE_ID" "$_SAFE_CWD" >> "$TRACE_FILE" 2>/dev/null || true
fi

exit 0
