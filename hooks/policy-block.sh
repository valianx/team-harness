#!/bin/bash
# policy-block.sh — Claude Code PreToolUse policy gate
# Reads tool call JSON from stdin and emits a hook decision JSON on stdout.
# Blocks destructive Bash commands, writes to sensitive files, and high-confidence
# secrets in Write/Edit/NotebookEdit content and commit-Bash commands.
#
# Cross-platform: bash + python3 (matches the pattern of notify-*.sh).
# Exits 0 always — denials are communicated via permissionDecision in the JSON output.

PAYLOAD=$(cat)

PAYLOAD="$PAYLOAD" python3 - <<'PYEOF'
import json
import math
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
    (r"\brm\s+\S*[rR]\S*[fF]\S*\s+(?:--\s+)?(/|~|\$\{?HOME\}?)(\s|$)",
     "rm -rf targeting / ~ or HOME"),
    (r"\brm\s+\S*[fF]\S*[rR]\S*\s+(?:--\s+)?(/|~|\$\{?HOME\}?)(\s|$)",
     "rm -fr targeting / ~ or HOME"),
    (r"\brm\s+-r\b.*\s+-f\b.*\s+(?:--\s+)?(/|~|\$\{?HOME\}?)(\s|$)",
     "rm -r -f targeting / ~ or HOME"),
    (r"\brm\s+\S*[rR]\S*[fF]\S*\s+(?:--\s+)?\*(\s|$)",
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

# High-confidence secret patterns → deny (fail-CLOSED).
# Each pattern is anchored to its documented format.
# The reason names the pattern CLASS, never the matched value.
HIGH_CONFIDENCE_SECRETS = [
    (r"AKIA[0-9A-Z]{16}", "AWS access key (AKIA… pattern)"),
    (r"\bghp_[A-Za-z0-9]{36}\b", "GitHub personal access token (ghp_… pattern)"),
    (r"\bgithub_pat_[A-Za-z0-9_]{22,}\b", "GitHub fine-grained PAT (github_pat_… pattern)"),
    (r"-----BEGIN (?:RSA |EC |OPENSSL |DSA )?PRIVATE KEY-----", "PEM private key header"),
    (r"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b", "OpenAI-style secret key (sk-… pattern)"),
    (r"\bAIza[0-9A-Za-z_\-]{35}\b", "Google API key (AIza… pattern)"),
    (r"\b[rs]k_live_[0-9A-Za-z]{16,}\b", "Stripe live secret key (sk_live_/rk_live_ pattern)"),
    (r"\bglpat-[0-9A-Za-z_\-]{20}\b", "GitLab personal access token (glpat-… pattern)"),
    (r"\bgh[osru]_[A-Za-z0-9]{36}\b", "GitHub OAuth/server/refresh/user token (gho_/ghs_/ghr_/ghu_ pattern)"),
    (r"\bxoxb-[A-Za-z0-9-]{10,}\b", "Slack bot token (xoxb-… pattern)"),
]

# Medium-confidence: generic keyword assignment + high-entropy value → ask.
# Trigger: a variable name ending in KEY/TOKEN/SECRET/PASSWORD (case-insensitive,
# with optional prefix such as API_, MY_) followed by = and a value of ≥20
# alphanumeric/base64 characters with Shannon entropy ≥ 3.5 bits/char.
# Uses ^ | whitespace start so compound names like API_TOKEN and MY_SECRET match.
MEDIUM_CONFIDENCE_PATTERN = re.compile(
    r"""(?i)(?:^|[\s\x00-\x1f])(?:\w+_)?(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)\s*[:=]\s*["']?([A-Za-z0-9_/+.]{20,})["']?""",
    re.MULTILINE,
)


def shannon_entropy(value: str) -> float:
    """Compute Shannon entropy in bits per character for a string."""
    if not value:
        return 0.0
    freq: dict[str, int] = {}
    for ch in value:
        freq[ch] = freq.get(ch, 0) + 1
    length = len(value)
    return -sum((c / length) * math.log2(c / length) for c in freq.values())


def deny(reason: str) -> None:
    json.dump({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": (
                f"Blocked by team-harness policy: {reason}. "
                "If you genuinely need this, run it manually outside Claude "
                "or scope an exception in hooks/config.json."
            ),
        }
    }, sys.stdout)
    sys.exit(0)


def ask(reason: str) -> None:
    json.dump({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "ask",
            "permissionDecisionReason": (
                f"team-harness policy: possible secret detected ({reason}). "
                "Confirm this value is safe to commit, or cancel and remove it."
            ),
        }
    }, sys.stdout)
    sys.exit(0)


def scan_for_secrets(content: str) -> None:
    """Scan content for high-confidence (deny) and medium-confidence (ask) secrets.
    Never emits the matched value — only the pattern class name."""
    for pattern, label in HIGH_CONFIDENCE_SECRETS:
        if re.search(pattern, content):
            deny(f"high-confidence secret detected: {label}")

    for match in MEDIUM_CONFIDENCE_PATTERN.finditer(content):
        # Strip any trailing quote that was captured as part of the ≥20-char value.
        candidate = match.group(1).rstrip("\"'")
        if len(candidate) >= 20 and shannon_entropy(candidate) >= 3.5:
            # Extract the keyword name for the reason message (no matched value emitted).
            raw = match.group(0).lstrip()
            keyword = raw.split("=")[0].split(":")[0].strip()
            ask(f"high-entropy {keyword}= assignment (medium-confidence secret)")


if tool == "Bash":
    cmd = tool_input.get("command", "")
    for pattern, label in DENIED_BASH:
        if re.search(pattern, cmd, flags=re.IGNORECASE):
            deny(label)
    # Secret scan on commit-Bash commands only (covers inline -m "..." secrets).
    # File-redirection / heredoc forms are a documented residual limit (parity with dev-guard.sh).
    if re.search(r"\bgit\s+commit\b", cmd):
        scan_for_secrets(cmd)
elif tool in ("Write", "Edit", "NotebookEdit"):
    path = tool_input.get("file_path", "")
    if path.endswith((".env.example", ".env.sample", ".env.template")):
        sys.exit(0)
    for pattern in SENSITIVE_PATHS:
        if re.search(pattern, path):
            deny(f"writing to sensitive file '{path}'")
    # Secret scan on file content (all three write-like tools).
    if tool == "Write":
        content = tool_input.get("content", "")
    elif tool == "Edit":
        content = tool_input.get("new_string", "")
    else:  # NotebookEdit
        content = tool_input.get("new_source", "")
    if content:
        scan_for_secrets(content)

sys.exit(0)
PYEOF
