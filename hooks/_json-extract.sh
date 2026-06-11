#!/bin/bash
# hooks/_json-extract.sh
# Shared escape-aware JSON string-field extractor.
# Source this file in hooks that need to extract a JSON string field from a raw
# payload without relying on python3 or jq.
#
# Provides: extract_json_string_field <field_name> <json_string>
#   Outputs the field value (unquoted, JSON escapes NOT decoded) to stdout.
#   Returns empty string when the field is absent or the value is not a plain string.
#
# Design notes:
#   - Uses the verified bracket form [\\] for the backslash in the alternation
#     ([\\].|[^"\\])* — this is REQUIRED on GNU grep 3.0 shipped with Git for
#     Windows where the conventional \\.  ERE escape silently fails to match a
#     literal backslash inside a character class (F-016 root cause).
#   - Defence-in-depth: when the extracted value is empty or ends with a lone
#     backslash (ambiguous parse), the caller should fall back to scanning the
#     raw JSON for covered destination patterns and ask — the fail-safe direction
#     is ask, not allow.
#   - No dependency on python3, jq, or any GNU-only tool.  Works under Git Bash
#     on Windows (GNU grep 3.0+), macOS BSD grep, and Linux grep.
#
# Usage example:
#   . "$(dirname "$0")/_json-extract.sh"
#   cmd=$(extract_json_string_field "command" "$input")
#
# Cross-platform: bash + POSIX grep + sed. CLAUDE.md §12 (generic, no tokens).

extract_json_string_field() {
    local field_name="$1"
    local json_input="$2"

    # Escape-aware extraction using bracket form [\\] for the backslash.
    # The pattern matches: "field_name": "<value>" where <value> may contain
    # JSON escape sequences (\" \\ \/ \n \r \t \uXXXX etc.).
    # [\\]. matches a backslash followed by ANY character (an escape sequence).
    # [^"\\] matches any character that is neither a quote nor a backslash.
    local raw
    raw=$(printf '%s' "$json_input" \
        | grep -oE "\"${field_name}\"[[:space:]]*:[[:space:]]*\"([\\].|[^\"\\\\])*\"" \
        | head -1 \
        | sed -E "s/^\"${field_name}\"[[:space:]]*:[[:space:]]*\"(.*)\"\$/\\1/" \
        2>/dev/null || true)

    printf '%s' "$raw"
}
