#!/bin/bash
# hooks/run-ts-hook.sh — fail-closed launcher for the compiled TS hook gates.
#
# Invoked ONLY by the plugin wiring (.claude-plugin/hooks.json), never by the
# installer. Carries no gate logic of its own — every decision (allow/ask/deny
# and additionalContext text) comes from the compiled hooks/ts/dist/<name>.cjs
# bundle. This script's only job is to run that bundle under node and to
# define what happens when node or the bundle is missing.
#
# Usage: run-ts-hook.sh <hook-name>
#   e.g. bash run-ts-hook.sh policy-block
#
# Contract (F5 — three classes, per issue #446 cutover plan):
#   1. deny-floors (policy-block, dev-guard, gcp-guard, prepublish-guard,
#      checkpoint-guard): node or the .cjs missing -> emit the explicit deny
#      envelope and block. Never pass-through.
#   2. worktree-guard: advisory/fail-open by contract — node or the .cjs
#      missing -> silent exit 0 (loses only the reminder, never escalates).
#   3. observational (notify-stage, subagent-trace, precompact-snapshot,
#      language-user-prompt, session-start): node or the .cjs missing ->
#      silent exit 0.

HOOK_NAME="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CJS="$ROOT/hooks/ts/dist/${HOOK_NAME}.cjs"

case "$HOOK_NAME" in
  policy-block|dev-guard|gcp-guard|prepublish-guard|checkpoint-guard)
    CLASS="deny-floor"
    ;;
  worktree-guard)
    CLASS="advisory"
    ;;
  *)
    CLASS="observational"
    ;;
esac

deny() {
  local reason="$1"
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked by team-harness policy: %s. Install Node.js or reinstall the plugin to restore this gate."}}\n' "$reason"
  exit 0
}

if ! command -v node >/dev/null 2>&1; then
  if [ "$CLASS" = "deny-floor" ]; then
    deny "node runtime missing"
  fi
  exit 0
fi

if [ ! -f "$CJS" ]; then
  if [ "$CLASS" = "deny-floor" ]; then
    deny "hook artifact missing"
  fi
  exit 0
fi

exec node "$CJS"
