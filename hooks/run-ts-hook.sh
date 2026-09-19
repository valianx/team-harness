#!/bin/bash
# Fail-open launcher for Team Harness context and observability hooks.
#
# Permission and process-enforcement hooks are intentionally not wired. This
# launcher only runs the registered context/observation bundles and silently
# returns when Node.js, an artifact, or the hook itself is unavailable.

set -u

HOOK_NAME="${1:-}"
case "$HOOK_NAME" in
  language-user-prompt|session-start|notify-stage|subagent-trace|precompact-snapshot)
    ;;
  *)
    exit 0
    ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CJS="$ROOT/hooks/ts/dist/${HOOK_NAME}.cjs"

command -v node >/dev/null 2>&1 || exit 0
[ -s "$CJS" ] || exit 0

OUTPUT="$(node "$CJS" 2>/dev/null)" || exit 0
[ -n "$OUTPUT" ] && printf '%s\n' "$OUTPUT"
exit 0
