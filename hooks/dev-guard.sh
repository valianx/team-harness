#!/usr/bin/env bash
# hooks/dev-guard.sh
# PreToolUse hook — deterministic outward-action gate for dev mode.
#
# Wired via hooks/config.json (Go installer) and .claude-plugin/hooks.json
# (plugin runtime) as its OWN PreToolUse entry with matcher:"Bash".
# policy-block.sh is wired separately with matcher:"Bash|Write|Edit|NotebookEdit"
# so it continues to secret-scan write/edit content. Reads tool_input from
# stdin; intercepts outward/mutating actions when dev mode is active.
#
# Contract: docs/dev-mode.md § Outward-Action Gate
#
# WHAT THIS GATE COVERS (catalogue closed and enumerated here — paridad DENIED_BASH):
#   1. Push to a remote: git push (bare, git -C <path> push, GIT_DIR=... git push)
#      Note: git push --force is already denied by policy-block.sh; this gate
#      covers git push without --force — the important bypass.
#   2. PR merge/review/comment endpoints by ANY binary, matched by DESTINATION:
#      - gh pr merge
#      - gh pr review / gh pr review --dismiss
#      - gh pr comment
#      - gh api -X PUT|POST|PATCH|DELETE ... /pulls/.../merge|reviews|comments
#      - curl/wget with mutating method against api.github.com or those paths
#   3. Auto-manipulation of the dev-mode marker itself:
#      rm / mv / > / >> / tee / cp targeting ~/.claude/.dev-mode-active
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
#     is an unauthorised merge/push to main. Any uncertainty about the marker
#     state + covered action -> ask (or deny for auto-manipulation).
#   DEFAULT (non-covered calls): no-decision — exit 0, empty stdout; defers to
#     the operator's normal permission flow (prompts in normal mode; honors the
#     allowlist). ask/deny are EXCLUSIVELY for covered outward actions and
#     marker manipulation. allow is EXCLUSIVELY for the activation-write
#     (dev_mode: true) path — arming more gating is always the safe direction.
#
# AUTHORISATION MODEL:
#   permissionDecision:"ask" — the runtime prompts the OPERATOR interactively
#   for that specific call. The agent CANNOT auto-approve an "ask". There is
#   NO authorisation marker file that the agent can write to bypass this gate.
#   A forged ~/.claude/.dev-mode-active only makes the gate MORE active (ask
#   on more actions) — the safe direction.
#
# DEFAULT-ON (v2.56.0): dev mode is now the DEFAULT disposition. /th:setup and
#   /th:update write the marker (~/.claude/.dev-mode-active) automatically unless
#   the operator has explicitly opted out (dev_mode_choice: "off" in
#   ~/.claude/.team-harness.json). This gate does NOT read dev_mode_choice and is
#   NOT affected by default-on: it fires solely on the marker. The sentinel in
#   .team-harness.json influences only setup/update marker-write decisions — it
#   cannot disable this gate in a live session, by design. Activation writes
#   (printf 'dev_mode: true' > marker) remain allowed without prompting (Step 6
#   below) — that path is what makes /dev-mode and default-on reliable.
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

DEV_MODE_MARKER="${HOME}/.claude/.dev-mode-active"

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

allow() {
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}\n'
    exit 0
}

nodecision() {
    # No decision: exit 0 with empty stdout. Claude Code defers to the
    # operator's normal permission flow (prompts in normal mode; honors the
    # allowlist). Reserved for every default/fail-safe path — ask/deny are
    # EXCLUSIVELY for covered outward actions and marker manipulation;
    # allow is EXCLUSIVELY for the activation-write (dev_mode: true) path.
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

# Extract command from JSON payload. Two paths: python3 (preferred) or grep fallback.
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
    cmd=$(printf '%s' "$input" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
        | sed 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)"/\1/' 2>/dev/null || true)
fi

# If we cannot extract a command (e.g. Edit/Write payloads carry no command
# field), emit no decision — defer to the operator's normal permission flow.
# fix(dev-guard): default to no-decision instead of allow (#298)
if [ -z "$cmd" ]; then
    nodecision
fi

# ---------------------------------------------------------------------------
# Step 2 — Detect dev mode marker
# Parse strictly: the file must exist AND contain "dev_mode: true" as a whole
# line token (anti-spoof: "dev_mode: true # was false" does NOT match).
# If marker is present but unreadable/corrupt -> treat as active (fail-CLOSED).
# ---------------------------------------------------------------------------

dev_mode_active=false

if [ -f "$DEV_MODE_MARKER" ]; then
    # File exists. Read its content.
    marker_content=""
    if marker_content=$(cat "$DEV_MODE_MARKER" 2>/dev/null); then
        if [ -z "$marker_content" ]; then
            # File exists but is empty — treat as active (fail-CLOSED).
            # An operator who wrote the marker intends dev mode active; empty is not "absent".
            dev_mode_active=true
        elif printf '%s\n' "$marker_content" | grep -q "^[[:space:]]*dev_mode:[[:space:]]*true[[:space:]]*$" 2>/dev/null; then
            # File contains strict "dev_mode: true" token.
            dev_mode_active=true
        elif printf '%s\n' "$marker_content" | grep -q "^[[:space:]]*dev_mode:[[:space:]]*false[[:space:]]*" 2>/dev/null; then
            # File explicitly says dev_mode: false -> not active; no decision.
            nodecision
        else
            # File exists but content is not clearly parseable as active or inactive.
            # Fail-CLOSED: treat as active.
            dev_mode_active=true
        fi
    else
        # File exists but is unreadable -> treat as active (fail-CLOSED).
        dev_mode_active=true
    fi
fi

# If dev mode is demonstrably absent, allow activation writes through before
# exiting. An activation write (setting dev_mode: true) arms MORE gating — it
# is safe and must not require a prompt even on a marker-absent machine. This
# is the path /th:setup and /th:update use on a fresh install. We check the
# write pattern and the dev_mode: true payload together.
if [ "$dev_mode_active" = "false" ]; then
    MARKER_PATH_PATTERN_EARLY='\.claude/\.dev-mode-active'
    if printf '%s' "$cmd" | grep -qE "(>|>>|tee)\s.*${MARKER_PATH_PATTERN_EARLY}" 2>/dev/null \
        && printf '%s' "$cmd" | grep -qE "dev_mode:[[:space:]]*true" 2>/dev/null; then
        allow
    fi
    nodecision
fi

# Dev mode is active. Evaluate whether the command is a covered outward action.

# ---------------------------------------------------------------------------
# Step 3 — (marker manipulation is evaluated AFTER outward actions, in Step 6)
# Outward actions are checked FIRST so a combined command such as
# `rm <marker> && gh pr merge` surfaces the MERGE intent in the operator
# prompt, not merely the marker change. Standalone marker manipulation falls
# through to Step 6.
# ---------------------------------------------------------------------------

MARKER_PATH_PATTERN='\.claude/\.dev-mode-active'

# ---------------------------------------------------------------------------
# Step 4 — Detect outward/mutating actions by DESTINATION (-> ask)
# Gate by destination + mutating intent, not by binary name.
# ---------------------------------------------------------------------------

# 4a. Push to a remote (any form).
# git push bare, git push <remote>, git push <remote> <branch>,
# git -C <path> push ..., GIT_DIR=... git push
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]|;`])git(\s+-C\s+\S+|\s+\S+=\S+)*\s+push(\s|$)' 2>/dev/null; then
    ask "dev mode active — outward action 'git push' requires explicit operator approval (dev-guard.sh); see docs/dev-mode.md § Outward-Action Gate"
fi

# 4b. gh pr merge
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]|;`])gh\s+pr\s+merge(\s|$)' 2>/dev/null; then
    ask "dev mode active — outward action 'gh pr merge' requires explicit operator approval (dev-guard.sh); see docs/dev-mode.md § Outward-Action Gate"
fi

# 4c. gh pr review (including --dismiss)
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]|;`])gh\s+pr\s+review(\s|$)' 2>/dev/null; then
    ask "dev mode active — outward action 'gh pr review' requires explicit operator approval (dev-guard.sh); see docs/dev-mode.md § Outward-Action Gate"
fi

# 4d. gh pr comment
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]|;`])gh\s+pr\s+comment(\s|$)' 2>/dev/null; then
    ask "dev mode active — outward action 'gh pr comment' requires explicit operator approval (dev-guard.sh); see docs/dev-mode.md § Outward-Action Gate"
fi

# 4e. gh api with mutating HTTP method against PR endpoints
if printf '%s' "$cmd" | grep -qiE '(^|[[:space:]|;`])gh\s+api\s+.*(-X|--method)\s*(PUT|POST|PATCH|DELETE).*pulls' 2>/dev/null; then
    ask "dev mode active — outward action 'gh api' mutating PR endpoint requires explicit operator approval (dev-guard.sh); see docs/dev-mode.md § Outward-Action Gate"
fi

# 4f. curl/wget with mutating method against api.github.com
if printf '%s' "$cmd" | grep -qiE '(^|[[:space:]|;`])(curl|wget)\s.*(-X|--request)\s*(PUT|POST|PATCH|DELETE).*api\.github\.com' 2>/dev/null; then
    ask "dev mode active — outward action via curl/wget to api.github.com with mutating method requires explicit operator approval (dev-guard.sh); see docs/dev-mode.md § Outward-Action Gate"
fi

# Also catch curl/wget with api.github.com in URL and -X / --request anywhere in cmd
if printf '%s' "$cmd" | grep -qE 'api\.github\.com' 2>/dev/null \
   && printf '%s' "$cmd" | grep -qiE '(-X|--request)\s*(PUT|POST|PATCH|DELETE)' 2>/dev/null; then
    ask "dev mode active — outward action to api.github.com with mutating method requires explicit operator approval (dev-guard.sh); see docs/dev-mode.md § Outward-Action Gate"
fi

# ---------------------------------------------------------------------------
# Step 6 — Marker manipulation -> ask (operator confirms the dev-mode change).
# Reached only when the command did NOT contain an outward action above, so a
# standalone marker change (e.g. /dev-mode off running `rm <marker>`) prompts
# the operator to confirm. This enables the toggle while preventing the agent
# from SILENTLY disabling the gate; a combined marker+outward command already
# surfaced the outward-action ask in Step 4.
# ---------------------------------------------------------------------------
if printf '%s' "$cmd" | grep -qE "(rm|mv|cp)\s.*${MARKER_PATH_PATTERN}" 2>/dev/null; then
    ask "dev-guard: removing/moving the dev-mode marker EXITS developer mode and DISABLES the outward-action gate. Approve ONLY if you intend to deactivate dev mode (e.g. /dev-mode off)."
fi
if printf '%s' "$cmd" | grep -qE "(>|>>|tee)\s.*${MARKER_PATH_PATTERN}" 2>/dev/null; then
    # A write that SETS "dev_mode: true" is an ACTIVATION — it arms MORE gating,
    # so it is safe and is allowed without a prompt. This makes /dev-mode
    # (re)activation reliable and friction-free, including re-enabling after an
    # /dev-mode off in the same session. Any OTHER write to the marker (clearing
    # or disabling it) still prompts, since that would disarm the gate.
    if printf '%s' "$cmd" | grep -qE "dev_mode:[[:space:]]*true" 2>/dev/null; then
        allow
    fi
    ask "dev-guard: writing the dev-mode marker changes the gate's armed state. Approve ONLY if you intend to change developer mode."
fi

# ---------------------------------------------------------------------------
# Step 5 — No covered action detected; no decision (defer to normal flow).
# ---------------------------------------------------------------------------
nodecision
