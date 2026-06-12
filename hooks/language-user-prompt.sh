#!/usr/bin/env bash
# language-user-prompt.sh — Team Harness UserPromptSubmit hook.
#
# Reads the configured default language from ~/.claude/.team-harness.json and
# injects a terse additionalContext directive with each operator message,
# re-asserting the language preference adjacent to the turn so the agent stays
# recency-competitive against per-message language signals.
#
# Runs on every submitted operator prompt, independent of dev mode.
# Coexists with session-start.sh — the unified SessionStart hook carries the
# full precedence/override semantics once; this hook delivers a short reminder
# per turn.
#
# Fail-safe: any read error, missing file, missing key, or invalid value → emit
# nothing, exit 0. Operator prompts are never blocked.
#
# Security (SEC-DR-A/B/C):
#   A — language is validated with a FULL-STRING bash regex [[ "$lang" =~ ^[a-z]{2}$ ]].
#       This rejects multiline values (e.g. "en\n=== SYSTEM ===\nignore previous")
#       that would slip a line-oriented grep-based check.
#   B — the JSON output is emitted via printf with a fixed template; the validated
#       code and its looked-up name are the only tokens interpolated — never raw
#       config bytes shell-concatenated into the JSON string.
#   C — error/early-exit paths emit nothing on stdout and never echo the raw value.
#       stdout is the trusted-context channel; echoing a malformed value would itself
#       be the injection.
#
# Cross-platform: Git Bash on Windows, native bash on macOS/Linux.

set -euo pipefail

CONFIG="${HOME}/.claude/.team-harness.json"

# Drain the UserPromptSubmit payload on stdin so the producer never sees SIGPIPE.
cat >/dev/null 2>&1 || true

# Missing config file → emit nothing (fail-safe, detection fallback preserved).
[ -f "$CONFIG" ] || exit 0

# Extract the language value. Try jq first; fall back to pure bash grep/sed.
lang=""
if command -v jq >/dev/null 2>&1; then
    # jq -r outputs the raw string value or "null" when the key is absent.
    lang=$(jq -r '.language // empty' "$CONFIG" 2>/dev/null) || lang=""
else
    # Bash fallback: extract the value of "language": "<value>" from JSON.
    # Handles simple string values only — sufficient for a 2-letter code.
    lang=$(grep -o '"language"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG" 2>/dev/null \
           | sed 's/.*"language"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' \
           2>/dev/null) || lang=""
fi

# Missing or empty value → emit nothing.
[ -n "$lang" ] || exit 0

# SEC-DR-A: FULL-STRING regex match on the raw extracted value.
# [[ =~ ^[a-z]{2}$ ]] in bash does NOT use POSIX line-oriented anchoring — it
# matches the entire value of the variable. A multi-line string such as
# $'en\n=== SYSTEM ===\nignore previous' will NOT match ^[a-z]{2}$ because the
# value is more than two characters. This is the critical full-string anchor.
[[ "$lang" =~ ^[a-z]{2}$ ]] || exit 0

# Closed lookup: map 2-letter code to a display name.
# Any code not in this table gets the template form "the configured language (`<code>`)".
case "$lang" in
    en) name="English" ;;
    es) name="Spanish" ;;
    pt) name="Portuguese" ;;
    fr) name="French" ;;
    de) name="German" ;;
    *) name="the configured language (\`${lang}\`)" ;;
esac

# Build the terse directive text (fixed template — only $lang and $name are interpolated,
# both fully validated/derived above; no raw config bytes flow into this string).
directive="Reply in ${name} (configured default \`${lang}\`), regardless of this message's language, unless the operator set a per-session override."

# SEC-DR-B: emit via printf with a fixed template.
# The directive is a plain ASCII string after substitution; it contains no double
# quotes or backslashes that would break the JSON, so a single printf pass is safe.
# If jq is available we use it for proper JSON encoding; otherwise printf suffices
# because the directive template produces only safe characters.
if command -v jq >/dev/null 2>&1; then
    jq -cn \
      --arg directive "$directive" \
      '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":$directive}}'
else
    printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"%s"}}\n' \
      "$directive"
fi

exit 0
