#!/usr/bin/env bash
# hooks/dev-guard.sh
# fix(dev-guard): escape-aware command extraction in bash fallback (F-016, #304)
# PreToolUse hook — deterministic outward-action gate (unconditional, SEC-DR-2).
#
# Wired via hooks/config.json (Go installer) and .claude-plugin/hooks.json
# (plugin runtime) as its OWN PreToolUse entry with matcher:"Bash" (outward Bash
# actions) AND a second entry with matcher:"mcp__.*__clickup_..." (ClickUp MCP
# outward writes). policy-block.sh is wired separately with
# matcher:"Bash|Write|Edit|NotebookEdit" for secret-scan. Reads tool_input from
# stdin; intercepts outward/mutating actions unconditionally.
#
# SEC-DR-2 re-founding (v2.89.0): inline orchestration is the CC architecture —
# the general top-level agent IS the orchestrator. The outward-action security
# property is enforced by THIS gate, armed UNCONDITIONALLY. There is no
# dev-mode marker. Any covered outward action triggers ask, always.
# Contract: docs/dev-mode.md § Outward-Action Gate
#
# WHAT THIS GATE COVERS (catalogue closed and enumerated here — parity DENIED_BASH):
#   1. Push to a remote: git push (bare, git -C <path> push, GIT_DIR=... git push)
#      Note: git push --force is already denied by policy-block.sh; this gate
#      covers git push without --force — the important bypass.
#   2. PR merge/review/comment endpoints by ANY binary, matched by DESTINATION:
#      - gh pr merge
#      - gh pr review / gh pr review --dismiss
#      - gh pr comment
#      - gh api -X PUT|POST|PATCH|DELETE ... /pulls/.../merge|reviews|comments
#      - gh api graphql with a PR-write mutation name (resolveReviewThread,
#        unresolveReviewThread, addPullRequestReviewThreadReply,
#        addPullRequestReview, submitPullRequestReview, mergePullRequest);
#        read-only reviewThreads listing queries stay nodecision
#      - curl/wget with mutating method against api.github.com or those paths
#   3. ClickUp MCP outward writes (via mcp__.*__clickup_(update_task|create_task|...))
#
# WHAT THIS GATE DOES NOT COVER (documented residual limit):
#   Obfuscation via eval/base64/alias/heredoc is a known limit of any
#   string-matching gate (parity with policy-block.sh). The threat model is
#   disposition that rationalises the readable path — not an adversary who
#   actively obfuscates. This limit is acceptable and documented.
#
# FAIL MODE ASYMMETRY (vs checkpoint-guard.sh):
#   checkpoint-guard.sh: FAIL-OPEN — the worst case is skipping a pedagogical
#     pause, not a security regression.
#   dev-guard.sh (this hook): FAIL-CLOSED for covered actions — the worst case
#     is an unauthorised merge/push to main. Any uncertainty about a covered
#     action -> ask (or deny for policy-block denials).
#   DEFAULT (non-covered calls): no-decision — exit 0, empty stdout; defers to
#     the operator's normal permission flow (prompts in normal mode; honors the
#     allowlist). ask/deny are EXCLUSIVELY for covered outward actions.
#
# AUTHORISATION MODEL:
#   permissionDecision:"ask" — the runtime prompts the OPERATOR interactively
#   for that specific call. The agent CANNOT auto-approve an "ask". This gate
#   is unconditional — there is no marker file that arms or disarms it.
#
# Cross-platform: runs under Git Bash on Windows, native bash on macOS/Linux.
# Generic: no tokens, no private endpoints, no personal config. CLAUDE.md §12.
#
# Exit behaviour (Claude Code hook contract):
#   exit 0 + JSON                -> Claude processes the JSON (ask, deny, or allow).
#   exit 0 + empty stdout        -> no decision; Claude defers to the operator's
#                                   normal permission flow (this hook's default).
#   Other exit                   -> undefined; do not use.

set -euo pipefail

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

nodecision() {
    # No decision: exit 0 with empty stdout. Claude Code defers to the
    # operator's normal permission flow (prompts in normal mode; honors the
    # allowlist). Reserved for every default/fail-safe path — ask/deny are
    # EXCLUSIVELY for covered outward actions.
    exit 0
}

ask() {
    local reason="$1"
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}\n' "$reason"
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
# Step 1a — Detect ClickUp MCP outward-write tool calls (D1, F-008).
# The matcher mcp__.*__clickup_(update_task|create_task|...) fires for any
# registered ClickUp MCP server (server segment is registration-dependent and
# must not be hard-coded). We extract tool_name and, if it matches the ClickUp
# write pattern, issue ask unconditionally.
# This branch runs before the Bash cmd-extraction path — ClickUp payloads have
# no "command" field and would otherwise produce an empty cmd and nodecision.
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

# ClickUp write pattern: mcp__ + any server segment (including underscores, for multi-word
# MCP server names that Claude Code normalizes spaces-to-underscores) + __clickup_(write verbs).
# fix(dev-guard): SEC-001 — mirror wiring semantics (.+) so multi-word servers match (#304)
_clickup_write_pattern='mcp__.+__clickup_(update_task|create_task|create_task_comment|attach_task_file)'
if printf '%s' "$_tool_name" | grep -qE "^${_clickup_write_pattern}" 2>/dev/null; then
    # ClickUp MCP outward write detected — unconditional ask (SEC-DR-2).
    ask "outward action — ClickUp MCP outward write ($_tool_name) requires explicit operator approval; preview the change before confirming (dev-guard.sh; see docs/dev-mode.md)"
fi

# Resolve _json-extract.sh shared helper via the same 3-tier chain as sketch-guard
# (plugin cache -> ~/.claude/hooks/ -> ./hooks/). Sourcing it gives us the
# extract_json_string_field function that uses the F-016-safe [\\] bracket form.
# If the helper is not found on any path, fall back to the inline pattern below.
_JSON_EXTRACT_HELPER=""
_PLUGIN_BASE="${HOME}/.claude/plugins/cache/team-harness-marketplace/th"
if [ -d "$_PLUGIN_BASE" ]; then
    _LATEST=$(ls -1 "$_PLUGIN_BASE" 2>/dev/null | sort -V | tail -1)
    if [ -n "$_LATEST" ] && [ -f "$_PLUGIN_BASE/$_LATEST/hooks/_json-extract.sh" ]; then
        _JSON_EXTRACT_HELPER="$_PLUGIN_BASE/$_LATEST/hooks/_json-extract.sh"
    fi
fi
if [ -z "$_JSON_EXTRACT_HELPER" ] && [ -f "${HOME}/.claude/hooks/_json-extract.sh" ]; then
    _JSON_EXTRACT_HELPER="${HOME}/.claude/hooks/_json-extract.sh"
fi
if [ -z "$_JSON_EXTRACT_HELPER" ]; then
    _SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
    if [ -f "${_SCRIPT_DIR}/_json-extract.sh" ]; then
        _JSON_EXTRACT_HELPER="${_SCRIPT_DIR}/_json-extract.sh"
    fi
fi
if [ -n "$_JSON_EXTRACT_HELPER" ]; then
    # shellcheck source=hooks/_json-extract.sh
    . "$_JSON_EXTRACT_HELPER"
fi

# Extract command from JSON payload. Two paths: python3 (preferred) or grep fallback.
# The grep fallback uses the F-016-safe bracket form [\\] for escape sequences;
# when the shared helper is loaded, its extract_json_string_field is used instead.
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
elif type extract_json_string_field >/dev/null 2>&1; then
    # Shared helper available — use the F-016-safe extractor.
    cmd=$(extract_json_string_field "command" "$input")
else
    # Inline F-016-safe fallback: bracket form [\\] for the backslash (escape sequences).
    # The conventional \\.  ERE escape silently fails on GNU grep 3.0 (Git for Windows).
    cmd=$(printf '%s' "$input" \
        | grep -oE '"command"[[:space:]]*:[[:space:]]*"([\\].|[^"\\])*"' | head -1 \
        | sed -E 's/^"command"[[:space:]]*:[[:space:]]*"(.*)"$/\1/' \
        2>/dev/null || true)
fi

# Defence-in-depth (F-016): if extraction yields empty or a trailing-backslash value on
# a Bash payload, scan the raw JSON for covered destination patterns and ask.
# An extra ask is the fail-safe direction (never converts ask -> allow on error).
if [ -z "$cmd" ] && printf '%s' "$input" | grep -q '"tool_name"[[:space:]]*:[[:space:]]*"Bash"' 2>/dev/null; then
    if printf '%s' "$input" | grep -qE '(git\s+push|gh\s+pr\s+merge|gh\s+pr\s+review|gh\s+pr\s+comment|gh\s+api.*pulls|api\.github\.com)' 2>/dev/null; then
        ask "outward action detected in raw payload (escape-aware extraction fallback); requires explicit operator approval (dev-guard.sh)"
    fi
fi

# If we cannot extract a command (e.g. Edit/Write payloads carry no command
# field), emit no decision — defer to the operator's normal permission flow.
# fix(dev-guard): default to no-decision instead of allow (#298)
if [ -z "$cmd" ]; then
    nodecision
fi

# ---------------------------------------------------------------------------
# Step 2 — Detect outward/mutating actions by DESTINATION (-> ask)
# Gate by destination + mutating intent, not by binary name.
# Unconditional — no marker check needed (SEC-DR-2 re-founding, v2.89.0).
# ---------------------------------------------------------------------------

# 2a. Push to a remote (any form).
# git push bare, git push <remote>, git push <remote> <branch>,
# git -C <path> push ..., GIT_DIR=... git push
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]|;`])git(\s+-C\s+\S+|\s+\S+=\S+)*\s+push(\s|$)' 2>/dev/null; then
    ask "outward action 'git push' requires explicit operator approval (dev-guard.sh); see docs/dev-mode.md § Outward-Action Gate"
fi

# 2b. gh pr merge
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]|;`])gh\s+pr\s+merge(\s|$)' 2>/dev/null; then
    ask "outward action 'gh pr merge' requires explicit operator approval (dev-guard.sh); see docs/dev-mode.md § Outward-Action Gate"
fi

# 2c. gh pr review (including --dismiss)
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]|;`])gh\s+pr\s+review(\s|$)' 2>/dev/null; then
    ask "outward action 'gh pr review' requires explicit operator approval (dev-guard.sh); see docs/dev-mode.md § Outward-Action Gate"
fi

# 2d. gh pr comment
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]|;`])gh\s+pr\s+comment(\s|$)' 2>/dev/null; then
    ask "outward action 'gh pr comment' requires explicit operator approval (dev-guard.sh); see docs/dev-mode.md § Outward-Action Gate"
fi

# 2e. gh api with mutating HTTP method against PR endpoints
if printf '%s' "$cmd" | grep -qiE '(^|[[:space:]|;`])gh\s+api\s+.*(-X|--method)\s*(PUT|POST|PATCH|DELETE).*pulls' 2>/dev/null; then
    ask "outward action 'gh api' mutating PR endpoint requires explicit operator approval (dev-guard.sh); see docs/dev-mode.md § Outward-Action Gate"
fi

# 2e-bis. gh api graphql with a PR-write mutation name (reply/resolve/review).
# Read-only reviewThreads listing queries carry no mutation name -> stay nodecision
# (parallel to gh pr view --comments, which is also ungated).
# GraphQL always POSTs to /graphql with no -X flag, so the REST pattern (2e)
# does not match these commands; this branch closes the coverage gap (SEC-001).
if printf '%s' "$cmd" | grep -qiE '(^|[[:space:]|;`])gh\s+api\s+graphql' 2>/dev/null \
   && printf '%s' "$cmd" | grep -qE '(resolveReviewThread|unresolveReviewThread|addPullRequestReviewThreadReply|addPullRequestReviewComment|addPullRequestReview|submitPullRequestReview|mergePullRequest)' 2>/dev/null; then
    ask "outward action 'gh api graphql' PR-mutating operation requires explicit operator approval (dev-guard.sh); see docs/dev-mode.md § Outward-Action Gate"
fi

# 2f. curl/wget with mutating method against api.github.com
if printf '%s' "$cmd" | grep -qiE '(^|[[:space:]|;`])(curl|wget)\s.*(-X|--request)\s*(PUT|POST|PATCH|DELETE).*api\.github\.com' 2>/dev/null; then
    ask "outward action via curl/wget to api.github.com with mutating method requires explicit operator approval (dev-guard.sh); see docs/dev-mode.md § Outward-Action Gate"
fi

# Also catch curl/wget with api.github.com in URL and -X / --request anywhere in cmd
if printf '%s' "$cmd" | grep -qE 'api\.github\.com' 2>/dev/null \
   && printf '%s' "$cmd" | grep -qiE '(-X|--request)\s*(PUT|POST|PATCH|DELETE)' 2>/dev/null; then
    ask "outward action to api.github.com with mutating method requires explicit operator approval (dev-guard.sh); see docs/dev-mode.md § Outward-Action Gate"
fi

# ---------------------------------------------------------------------------
# Step 3 — No covered action detected; no decision (defer to normal flow).
# ---------------------------------------------------------------------------
nodecision
