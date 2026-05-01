#!/bin/bash
# policy-block.sh — Claude Code PreToolUse policy gate
# Reads tool call JSON from stdin and emits a hook decision JSON on stdout.
# Blocks destructive Bash commands and writes to sensitive files.
#
# Cross-platform: bash + python3 (matches the pattern of notify-*.sh).
# Exits 0 always — denials are communicated via permissionDecision in the JSON output.

PAYLOAD=$(cat)

PAYLOAD="$PAYLOAD" python3 - <<'PYEOF'
import json
import os
import re
import sys

try:
    payload = json.loads(os.environ.get("PAYLOAD", ""))
except Exception:
    sys.exit(0)

tool = payload.get("tool_name", "")
tool_input = payload.get("tool_input", {})

DENIED_BASH = [
    (r"\brm\s+\S*[rR]\S*[fF]\S*\s+(/|~|\$\{?HOME\}?)(\s|$)",
     "rm -rf targeting / ~ or HOME"),
    (r"\brm\s+\S*[fF]\S*[rR]\S*\s+(/|~|\$\{?HOME\}?)(\s|$)",
     "rm -fr targeting / ~ or HOME"),
    (r"\brm\s+-r\b.*\s+-f\b.*\s+(/|~|\$\{?HOME\}?)(\s|$)",
     "rm -r -f targeting / ~ or HOME"),
    (r"\brm\s+\S*[rR]\S*[fF]\S*\s+\*(\s|$)",
     "rm -rf with bare wildcard"),
    (r"git\s+push\s+(?:[^|]*\s)?(-f\b|--force\b|--force-with-lease)",
     "git push --force"),
    (r"git\s+reset\s+--hard\b",
     "git reset --hard"),
    (r"git\s+clean\s+(?:[^|]*\s)?-\S*f",
     "git clean -f"),
    (r"git\s+(?:commit|rebase|push)\s+.*--no-verify\b",
     "--no-verify (bypasses pre-commit hooks)"),
    (r"\bdrop\s+(?:table|database|schema)\b",
     "destructive SQL: DROP"),
    (r"\btruncate\s+table\b",
     "destructive SQL: TRUNCATE TABLE"),
]

SENSITIVE_PATHS = [
    r"(^|/)\.env(\.|$)",
    r"\.pem$",
    r"(^|/)id_(rsa|ed25519|ecdsa|dsa)(\.|$)",
    r"(^|/)\.ssh/",
    r"(^|/)\.aws/(credentials|config)$",
    r"(^|/)credentials\.json$",
    r"(^|/)secrets\.(ya?ml|json|toml)$",
]

def deny(reason: str) -> None:
    json.dump({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": (
                f"Blocked by claude-dev-team policy: {reason}. "
                "If you genuinely need this, run it manually outside Claude "
                "or scope an exception in hooks/config.json."
            ),
        }
    }, sys.stdout)
    sys.exit(0)

if tool == "Bash":
    cmd = tool_input.get("command", "")
    for pattern, label in DENIED_BASH:
        if re.search(pattern, cmd, flags=re.IGNORECASE):
            deny(label)
elif tool in ("Write", "Edit", "NotebookEdit"):
    path = tool_input.get("file_path", "")
    if path.endswith((".env.example", ".env.sample", ".env.template")):
        sys.exit(0)
    for pattern in SENSITIVE_PATHS:
        if re.search(pattern, path):
            deny(f"writing to sensitive file '{path}'")

sys.exit(0)
PYEOF
