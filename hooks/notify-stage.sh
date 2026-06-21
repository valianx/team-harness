#!/bin/bash
# notify-stage.sh — Invoked by the orchestrator at stage boundaries (4 toasts/pipeline).
# Reads a JSON payload from stdin, detects the current OS, derives a one-line message
# from the stage fields, and routes to the matching ~/.claude/hooks/notify-{os}.sh.
#
# Payload schema (piped from orchestrator):
#   {"stage":N,"label":"<label>","status":"<complete|FAILED|BLOCKED>",
#    "feature":"<name>","summary":"<1-line ≤120 chars>","cwd":"<project root>"}
#
# Exit 0 on every path — never bubbles errors back to the orchestrator.

# Profile gate: suppress stage toasts under TH_HOOK_PROFILE=minimal.
# shellcheck source=./_hook-profile.sh
. "$(dirname "$0")/_hook-profile.sh" 2>/dev/null || true
th_observability_enabled "idle-notify" || exit 0

PAYLOAD=$(cat)

# Extract fields from the payload using python3 (same pattern as notify-*.sh siblings).
FEATURE=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('feature',''))" 2>/dev/null)
STAGE=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('stage',''))" 2>/dev/null)
LABEL=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('label',''))" 2>/dev/null)
STATUS=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status','complete'))" 2>/dev/null)
SUMMARY=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('summary','')[:120])" 2>/dev/null)
CWD=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('cwd',''))" 2>/dev/null)

MESSAGE="Pipeline ${FEATURE} · Stage ${STAGE} (${LABEL}) ${STATUS} — ${SUMMARY}"

HOOKS_DIR="$(dirname "$0")"

# OS detection: $OSTYPE is reliable under bash; uname -s is the fallback.
# Branch table is closed — unknown OS exits 0 silently (no toast, no error).
case "${OSTYPE:-$(uname -s 2>/dev/null)}" in
  msys* | cygwin* | win32* | MINGW*)
    NOTIFY_SCRIPT="${HOOKS_DIR}/notify-windows.sh"
    ;;
  darwin*)
    NOTIFY_SCRIPT="${HOOKS_DIR}/notify-mac.sh"
    ;;
  linux*)
    NOTIFY_SCRIPT="${HOOKS_DIR}/notify-linux.sh"
    ;;
  *)
    exit 0
    ;;
esac

if [ ! -x "$NOTIFY_SCRIPT" ]; then
  exit 0
fi

# Build the downstream payload via python3 to safely escape the message fields.
python3 -c "
import json, sys
msg = sys.argv[1]
cwd = sys.argv[2]
print(json.dumps({'last_assistant_message': msg, 'cwd': cwd}))
" "$MESSAGE" "$CWD" 2>/dev/null | bash "$NOTIFY_SCRIPT" 2>/dev/null

exit 0
