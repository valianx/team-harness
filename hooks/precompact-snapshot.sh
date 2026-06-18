#!/bin/bash
# hooks/precompact-snapshot.sh — PreCompact state snapshot.
#
# Wired on the PreCompact event (matcher: manual|auto) via hooks/config.json and
# .claude-plugin/hooks.json.  Snapshots 00-state.md before context compaction so
# /th:recover can recover in-flight pipeline state.
#
# PURPOSE:
#   PreCompact fires immediately before context compaction — the one moment a hook
#   can snapshot state before it is at risk.  The snapshot is a single rolling file
#   (overwrite-in-place) beside 00-state.md; never an ever-growing set.
#
# SECURITY INVARIANTS (SEC-DR-001, SEC-DR-002, SEC-DR-004, SEC-DR-005, SEC-DR-006):
#   - Copies ONLY 00-state.md (no transcripts, no config, no events files).
#   - Snapshot path is always dirname(<resolved 00-state.md>)/00-state.precompact-snapshot.md
#     and nowhere else.
#   - Symlink guard: the located 00-state.md must be a regular file whose realpath
#     stays under the validated workspace base; a symlink leaving the base → skip.
#   - SEC-DR-A control-char guard on logs-path before use.
#   - Breadcrumb appended to its OWN sibling 00-precompact.jsonl; the
#     orchestrator's event stream file is never written by this hook
#     (exclusive-writer contract preserved — SEC-DR-005).
#   - Emits NOTHING on stdout on every path.
#   - Every code path exits 0 — never blocks compaction.
#   - The session transcript file is never opened or read.
#
# DATA EXPOSURE (SEC-DR-001):
#   The snapshot is a byte-identical copy of 00-state.md — a file the pipeline
#   already persists in the same workspace location.  In obsidian mode the vault is
#   a pre-existing, long-lived, possibly-synced surface; the snapshot inherits that
#   surface and does NOT widen it.  No new secret value is read or written; the
#   snapshot is bounded to the one file (00-state.md only).
#   In local mode the snapshot sits under workspaces/, already covered by the
#   /workspaces .gitignore entry.
#
# PROFILE GATE (AC-13):
#   Sources _hook-profile.sh; exits 0 silently under TH_HOOK_PROFILE=minimal.
#   Enforcement floors NEVER source _hook-profile.sh.
#
# Exit code: always 0.  stdout: always empty.
#
# Cross-platform: Git Bash on Windows, native bash on macOS/Linux.
# Generic: no tokens, no private endpoints.  CLAUDE.md §12.

# ---------------------------------------------------------------------------
# Step 0 — Profile gate (AC-13 / pipeline-observability class)
# ---------------------------------------------------------------------------
# shellcheck source=./_hook-profile.sh
. "$(dirname "$0")/_hook-profile.sh" 2>/dev/null || true

th_observability_enabled "pipeline-observability" || exit 0

# ---------------------------------------------------------------------------
# Step 1 — Drain stdin (PreCompact payload)
# ---------------------------------------------------------------------------
PAYLOAD=$(cat 2>/dev/null || true)

# ---------------------------------------------------------------------------
# Step 2 — Extract trigger from payload (manual|auto)
# Python3 preferred; grep/sed fallback
# ---------------------------------------------------------------------------
TRIGGER=""

if command -v python3 >/dev/null 2>&1; then
    TRIGGER=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('trigger', ''))
except Exception:
    print('')
" <<< "$PAYLOAD" 2>/dev/null || true)
else
    TRIGGER=$(printf '%s' "$PAYLOAD" \
        | grep -o '"trigger"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
        | sed 's/.*"trigger"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)
fi

# Normalize trigger to a safe literal; default "unknown" if absent/unrecognized.
case "$TRIGGER" in
    manual|auto) ;;
    *) TRIGGER="unknown" ;;
esac

# ---------------------------------------------------------------------------
# Step 3 — Resolve workspace base from ~/.claude/.team-harness.json
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
# Step 4 — Locate a single unambiguous 00-state.md
# local mode: search workspaces/*/00-state.md under cwd from payload
# obsidian mode: search <logs-path>/<logs-subfolder>/*/00-state.md (today only
#   if locatable; fallback to all if zero matches today)
# Zero or many matches → silent exit 0 (do not guess)
# ---------------------------------------------------------------------------
CWD_VAL=""
if command -v python3 >/dev/null 2>&1; then
    CWD_VAL=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('cwd', ''))
except Exception:
    print('')
" <<< "$PAYLOAD" 2>/dev/null || true)
else
    CWD_VAL=$(printf '%s' "$PAYLOAD" \
        | grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
        | sed 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' 2>/dev/null || true)
fi

STATE_FILE=""

if [ "$LOGS_MODE" = "obsidian" ] && [ -n "$LOGS_PATH" ]; then
    SEARCH_BASE="${LOGS_PATH}/${LOGS_SUBFOLDER}"
    if [ -d "$SEARCH_BASE" ]; then
        # Search for exactly one 00-state.md one level deep under base.
        # Use a glob-based count; avoid pipelines that differ on missing files.
        _matches=()
        while IFS= read -r -d '' _f; do
            _matches+=("$_f")
        done < <(find "$SEARCH_BASE" -maxdepth 3 -name "00-state.md" -print0 2>/dev/null || true)

        if [ "${#_matches[@]}" -eq 1 ]; then
            STATE_FILE="${_matches[0]}"
        fi
        # 0 or many → STATE_FILE stays empty → exit 0 below
    fi
else
    # local mode: workspaces/*/00-state.md under cwd
    if [ -n "$CWD_VAL" ] && [ -d "${CWD_VAL}/workspaces" ]; then
        _matches=()
        while IFS= read -r -d '' _f; do
            _matches+=("$_f")
        done < <(find "${CWD_VAL}/workspaces" -maxdepth 2 -name "00-state.md" -print0 2>/dev/null || true)

        if [ "${#_matches[@]}" -eq 1 ]; then
            STATE_FILE="${_matches[0]}"
        fi
        # 0 or many → STATE_FILE stays empty → exit 0 below
    fi
fi

[ -n "$STATE_FILE" ] || exit 0

# ---------------------------------------------------------------------------
# Step 5 — Symlink / regular-file guard (SEC-DR-006)
# Snapshot only when the located 00-state.md is a regular file whose resolved
# realpath stays under the validated workspace base.
# ---------------------------------------------------------------------------

# Must be a regular file (not a symlink, device, etc.).
[ -f "$STATE_FILE" ] || exit 0

# Resolve realpath to detect symlinks that escape the base.
_REAL_STATE=""
if command -v realpath >/dev/null 2>&1; then
    _REAL_STATE=$(realpath "$STATE_FILE" 2>/dev/null || true)
elif command -v python3 >/dev/null 2>&1; then
    _REAL_STATE=$(python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$STATE_FILE" 2>/dev/null || true)
else
    # Fallback: use the path as-is; symlink guard is best-effort.
    _REAL_STATE="$STATE_FILE"
fi

if [ -z "$_REAL_STATE" ]; then
    exit 0
fi

# The resolved path must not be a different file than what we discovered
# (a symlink to an outside location would produce a different realpath).
# Check: the dirname of the resolved path should share the workspace base.
_STATE_DIR=$(dirname "$STATE_FILE")
_REAL_DIR=$(dirname "$_REAL_STATE")

# If realpath of the file is in a completely different tree, skip.
# We compare by checking if the realpath directory starts with a plausible base.
if [ "$LOGS_MODE" = "obsidian" ] && [ -n "$LOGS_PATH" ]; then
    _EXPECTED_BASE=$(realpath "${LOGS_PATH}/${LOGS_SUBFOLDER}" 2>/dev/null || true)
else
    _EXPECTED_BASE=$(realpath "${CWD_VAL}/workspaces" 2>/dev/null || true)
fi

if [ -n "$_EXPECTED_BASE" ]; then
    case "$_REAL_DIR" in
        "${_EXPECTED_BASE}"*)
            # Realpath stays inside the validated base — allow.
            ;;
        *)
            # Realpath escapes the validated base — symlink attack guard.
            exit 0
            ;;
    esac
fi

# ---------------------------------------------------------------------------
# Step 6 — Copy 00-state.md to fixed-literal rolling snapshot sibling
# Target: dirname(00-state.md)/00-state.precompact-snapshot.md
# Overwrite-in-place: one rolling file, never an ever-growing set.
# Prepend a one-line header comment with trigger + timestamp.
# ---------------------------------------------------------------------------
TS=$(python3 -c "import datetime; print(datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))" 2>/dev/null \
    || date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || true)

SNAPSHOT_FILE="${_STATE_DIR}/00-state.precompact-snapshot.md"
BREADCRUMB_FILE="${_STATE_DIR}/00-precompact.jsonl"

# Write header line followed by the verbatim 00-state.md content.
{
    printf '<!-- precompact-snapshot trigger=%s ts=%s -->\n' "$TRIGGER" "$TS"
    cat "$STATE_FILE"
} > "$SNAPSHOT_FILE" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Step 7 — Append one breadcrumb line to 00-precompact.jsonl
# Single atomic printf of one complete line (SEC-DR-005 exclusive-writer contract).
# This hook writes ONLY to 00-precompact.jsonl — the orchestrator's own event
# stream file is not touched by this hook.
# ---------------------------------------------------------------------------
if command -v python3 >/dev/null 2>&1; then
    python3 -c "
import json, sys
ts      = sys.argv[1]
trigger = sys.argv[2]
line = json.dumps({
    'ts':      ts,
    'event':   'precompact.snapshot',
    'trigger': trigger,
    'status':  'success',
})
print(line)
" "$TS" "$TRIGGER" >> "$BREADCRUMB_FILE" 2>/dev/null || true
else
    # Degraded fallback — TRIGGER is already normalized to safe literal.
    printf '{"ts":"%s","event":"precompact.snapshot","trigger":"%s","status":"success"}\n' \
        "$TS" "$TRIGGER" >> "$BREADCRUMB_FILE" 2>/dev/null || true
fi

exit 0
