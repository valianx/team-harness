#!/bin/bash
# hooks/run-ts-hook.sh — fail-open launcher for observational TS hooks.
#
# Invoked by the Claude Code plugin wiring for session context, language
# reminders, notifications, and optional pipeline traces. Claude Code's native
# permissions and approvals own every execution decision; this launcher never
# emits a permissionDecision and never turns a missing runtime into a block.

set -u

HOOK_NAME="${1:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CJS="$ROOT/hooks/ts/dist/${HOOK_NAME}.cjs"

# Keep this entrypoint limited to the hooks that remain observational. A stale
# caller cannot revive a retired enforcement hook by naming its old artifact.
case "$HOOK_NAME" in
  language-user-prompt|session-start|notify-stage|subagent-start|subagent-trace|precompact-snapshot)
    ;;
  *)
    exit 0
    ;;
esac

command -v node >/dev/null 2>&1 || exit 0
[ -f "$CJS" ] || exit 0

# Every retained hook is fail-open. Preserve valid context output for the
# SessionStart and UserPromptSubmit hooks; observational hooks normally emit
# nothing. Runtime errors are intentionally silent.
OUTPUT="$(node "$CJS" 2>/dev/null)" || exit 0
[ -n "$OUTPUT" ] && printf '%s\n' "$OUTPUT"
exit 0
