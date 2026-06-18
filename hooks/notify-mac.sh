#!/bin/bash
# notify-mac.sh — Claude Code hook → macOS notification
# Requires: osascript (included in macOS)

# Profile gate: suppress notifications under TH_HOOK_PROFILE=minimal.
# shellcheck source=./_hook-profile.sh
. "$(dirname "$0")/_hook-profile.sh" 2>/dev/null || true
th_observability_enabled "idle-notify" || exit 0

PAYLOAD=$(cat)

LAST_MSG=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('last_assistant_message','')[:300])" 2>/dev/null)
CWD=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('cwd',''))" 2>/dev/null)

PROJECT=$(basename "$CWD")
TITLE="Claude Code — ${PROJECT}"
BODY="${LAST_MSG:-Waiting for input}"

# Escape double quotes and backslashes for AppleScript
AS_TITLE=$(printf '%s' "$TITLE" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
AS_BODY=$(printf '%s' "$BODY" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')

printf 'display notification "%s" with title "%s"\n' "$AS_BODY" "$AS_TITLE" | osascript >/dev/null 2>&1
