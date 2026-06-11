#!/bin/bash
# policy-block.sh — Claude Code PreToolUse policy gate
# Reads tool call JSON from stdin and emits a hook decision JSON on stdout.
# Blocks destructive Bash commands, writes to sensitive files, and high-confidence
# secrets in Write/Edit/NotebookEdit content and commit-Bash commands.
#
# Cross-platform: bash + python3 (matches the pattern of notify-*.sh).
# Two-path shape: python3-preferred (full gate incl. entropy scan) or
# bash-native degraded gate (DENIED_BASH + SENSITIVE_PATHS + HIGH_CONFIDENCE_SECRETS,
# entropy scan skipped — documented as the single degraded-mode coverage gap).
# Both paths emit byte-identical permissionDecision JSON via shared shell emitters.
# The false "Exits 0 always" comment from the original is intentionally removed:
# the script exits 0 always ON NORMAL PATHS; in the python3 path, sys.exit(0) is
# called explicitly; in the bash path, the shell deny()/ask() functions exit 0.

PAYLOAD=$(cat)

# ---------------------------------------------------------------------------
# Shared JSON emitter functions (bash) — used by BOTH the python3 path's
# cleanup-on-python3-failure guard AND the bash degraded path directly.
# Emit the same JSON structure that the python3 deny() / ask() functions emit.
# ---------------------------------------------------------------------------

_bash_deny() {
    local reason="$1"
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked by team-harness policy: %s. If you genuinely need this, run it manually outside Claude or scope an exception in hooks/config.json."}}\n' "$reason"
    exit 0
}

_bash_ask() {
    local reason="$1"
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"team-harness policy: possible secret detected (%s). Confirm this value is safe to commit, or cancel and remove it."}}\n' "$reason"
    exit 0
}

# ---------------------------------------------------------------------------
# Path 1 — python3-preferred (full gate including entropy scan)
# ---------------------------------------------------------------------------
if command -v python3 >/dev/null 2>&1; then
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
    r"(^|[/\\])\.env(\.|$)",
    r"\.pem$",
    r"(^|[/\\])id_(rsa|ed25519|ecdsa|dsa)(\.|$)",
    r"(^|[/\\])\.ssh[/\\]",
    r"(^|[/\\])\.aws[/\\](credentials|config)$",
    r"(^|[/\\])credentials\.json$",
    r"(^|[/\\])secrets\.(ya?ml|json|toml)$",
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
    # F-015: normalise Windows backslash separators before SENSITIVE_PATHS matching.
    # The (^|/) anchors in SENSITIVE_PATHS only fire on forward-slash paths;
    # a raw Windows path like "C:\Users\x\.ssh\id_rsa" passes through without this.
    path = tool_input.get("file_path", "").replace("\\", "/")
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
    # python3 path complete; any exit from the heredoc is terminal.
    exit 0
fi

# ---------------------------------------------------------------------------
# Path 2 — bash-native degraded gate (python3 absent)
# Enforces: DENIED_BASH, SENSITIVE_PATHS, HIGH_CONFIDENCE_SECRETS.
# Skips: medium-confidence entropy scan (genuinely needs python3 — documented
# as the single degraded-mode coverage gap; operator advised to install python3
# via /th:setup or /th:update for full coverage).
#
# Failure semantics: degraded-but-enforcing (NOT fail-closed-deny-all).
# Non-matching tool calls produce NO decision (exit 0, empty stdout).
# This preserves usability on python3-less Windows while restoring the floor.
# The design choice mirrors dev-guard.sh lines 83-90 (nodecision = fail-open
# default) and honours the #298/#300 lesson: blanket fail-closed drives hook
# deletion, which is a net security loss.
# ---------------------------------------------------------------------------

# Source the shared escape-aware JSON extractor when available.
_BASH_EXTRACT_HELPER=""
_PB_PLUGIN_BASE="${HOME}/.claude/plugins/cache/team-harness-marketplace/th"
if [ -d "$_PB_PLUGIN_BASE" ]; then
    _PB_LATEST=$(ls -1 "$_PB_PLUGIN_BASE" 2>/dev/null | sort -V | tail -1)
    if [ -n "$_PB_LATEST" ] && [ -f "$_PB_PLUGIN_BASE/$_PB_LATEST/hooks/_json-extract.sh" ]; then
        _BASH_EXTRACT_HELPER="$_PB_PLUGIN_BASE/$_PB_LATEST/hooks/_json-extract.sh"
    fi
fi
if [ -z "$_BASH_EXTRACT_HELPER" ] && [ -f "${HOME}/.claude/hooks/_json-extract.sh" ]; then
    _BASH_EXTRACT_HELPER="${HOME}/.claude/hooks/_json-extract.sh"
fi
if [ -z "$_BASH_EXTRACT_HELPER" ]; then
    _PB_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
    if [ -f "${_PB_SCRIPT_DIR}/_json-extract.sh" ]; then
        _BASH_EXTRACT_HELPER="${_PB_SCRIPT_DIR}/_json-extract.sh"
    fi
fi
if [ -n "$_BASH_EXTRACT_HELPER" ]; then
    # shellcheck source=hooks/_json-extract.sh
    . "$_BASH_EXTRACT_HELPER"
fi

# Extract tool_name from the JSON payload using F-016-safe bracket form.
_pb_extract_field() {
    local field="$1"
    local json="$2"
    if type extract_json_string_field >/dev/null 2>&1; then
        extract_json_string_field "$field" "$json"
    else
        # Inline F-016-safe fallback.
        printf '%s' "$json" \
            | grep -oE "\"${field}\"[[:space:]]*:[[:space:]]*\"([\\].|[^\"\\\\])*\"" \
            | head -1 \
            | sed -E "s/^\"${field}\"[[:space:]]*:[[:space:]]*\"(.*)\"\$/\\1/" \
            2>/dev/null || true
    fi
}

tool_name=$(_pb_extract_field "tool_name" "$PAYLOAD")

# ---------------------------------------------------------------------------
# Bash gate: tool_name == "Bash"
# Evaluate DENIED_BASH patterns against the extracted command.
# ---------------------------------------------------------------------------
if [ "$tool_name" = "Bash" ]; then
    cmd=$(_pb_extract_field "command" "$PAYLOAD")
    if [ -z "$cmd" ]; then
        exit 0  # no decision — cannot evaluate
    fi

    # DENIED_BASH — bash-native equivalents (case-insensitive grep -iE)
    # Pattern 1: rm -rf / rm -fr / rm -r -f targeting / ~ $HOME
    if printf '%s' "$cmd" | grep -iE '\brm\s+\S*[rR]\S*[fF]\S*\s+(--|)?[[:space:]]*/($|\s)' >/dev/null 2>&1 || \
       printf '%s' "$cmd" | grep -iE '\brm\s+\S*[rR]\S*[fF]\S*\s+(--|)?[[:space:]]*~($|\s)' >/dev/null 2>&1 || \
       printf '%s' "$cmd" | grep -iE '\brm\s+\S*[rR]\S*[fF]\S*\s+(--|)?[[:space:]]*\$(\{?HOME\}?)($|\s)' >/dev/null 2>&1; then
        _bash_deny "rm -rf targeting / ~ or HOME"
    fi
    # Pattern 2: rm -rf with bare wildcard
    if printf '%s' "$cmd" | grep -iE '\brm\s+\S*[rR]\S*[fF]\S*\s+(--|)?[[:space:]]*\*($|\s)' >/dev/null 2>&1; then
        _bash_deny "rm -rf with bare wildcard"
    fi
    # Pattern 3: git push --force / -f / --force-with-lease
    if printf '%s' "$cmd" | grep -iE '\bgit\s+push\s+.*(-f\b|--force\b|--force-with-lease)' >/dev/null 2>&1; then
        _bash_deny "git push --force"
    fi
    # Pattern 4: git reset --hard
    if printf '%s' "$cmd" | grep -iE '\bgit\s+reset\s+--hard\b' >/dev/null 2>&1; then
        _bash_deny "git reset --hard"
    fi
    # Pattern 5: git clean -f
    if printf '%s' "$cmd" | grep -iE '\bgit\s+clean\s+\S*f' >/dev/null 2>&1; then
        _bash_deny "git clean -f"
    fi
    # Pattern 6: --no-verify
    if printf '%s' "$cmd" | grep -iE '\bgit\s+(commit|rebase|push)\s+.*--no-verify\b' >/dev/null 2>&1; then
        _bash_deny "--no-verify (bypasses pre-commit hooks)"
    fi
    # Pattern 7: destructive SQL
    if printf '%s' "$cmd" | grep -iE '\bdrop\s+(table|database|schema)\b' >/dev/null 2>&1; then
        _bash_deny "destructive SQL: DROP"
    fi
    if printf '%s' "$cmd" | grep -iE '\btruncate\s+table\b' >/dev/null 2>&1; then
        _bash_deny "destructive SQL: TRUNCATE TABLE"
    fi

    # HIGH_CONFIDENCE_SECRETS scan on commit-Bash commands (covers inline -m "..." secrets).
    if printf '%s' "$cmd" | grep -qE '\bgit\s+commit\b' 2>/dev/null; then
        if printf '%s' "$cmd" | grep -qE 'AKIA[0-9A-Z]{16}' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: AWS access key (AKIA... pattern)"
        fi
        if printf '%s' "$cmd" | grep -qE '\bghp_[A-Za-z0-9]{36}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: GitHub personal access token (ghp_... pattern)"
        fi
        if printf '%s' "$cmd" | grep -qE '\bgithub_pat_[A-Za-z0-9_]{22,}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: GitHub fine-grained PAT"
        fi
        if printf '%s' "$cmd" | grep -qE -- '-----BEGIN (RSA |EC |OPENSSL |DSA )?PRIVATE KEY-----' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: PEM private key header"
        fi
        if printf '%s' "$cmd" | grep -qE '\bsk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: OpenAI-style secret key (sk-... pattern)"
        fi
        if printf '%s' "$cmd" | grep -qE '\bAIza[0-9A-Za-z_-]{35}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: Google API key (AIza... pattern)"
        fi
        if printf '%s' "$cmd" | grep -qE '\b[rs]k_live_[0-9A-Za-z]{16,}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: Stripe live secret key"
        fi
        if printf '%s' "$cmd" | grep -qE '\bglpat-[0-9A-Za-z_-]{20}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: GitLab personal access token"
        fi
        if printf '%s' "$cmd" | grep -qE '\bgh[osru]_[A-Za-z0-9]{36}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: GitHub OAuth/server/refresh/user token"
        fi
        if printf '%s' "$cmd" | grep -qE '\bxoxb-[A-Za-z0-9-]{10,}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: Slack bot token (xoxb-... pattern)"
        fi
    fi

    # No match — no decision (exit 0, empty stdout). Non-matching Bash calls pass through.
    exit 0
fi

# ---------------------------------------------------------------------------
# Bash gate: tool_name in (Write, Edit, NotebookEdit)
# Evaluate SENSITIVE_PATHS (with backslash normalisation) and HIGH_CONFIDENCE_SECRETS.
# ---------------------------------------------------------------------------
if [ "$tool_name" = "Write" ] || [ "$tool_name" = "Edit" ] || [ "$tool_name" = "NotebookEdit" ]; then
    file_path=$(_pb_extract_field "file_path" "$PAYLOAD")

    # .env.example / .env.sample / .env.template allowlist (backslash-normalised).
    _normalised_path=$(printf '%s' "$file_path" | tr '\\' '/')
    case "$_normalised_path" in
        *.env.example|*.env.sample|*.env.template) exit 0 ;;
    esac

    # SENSITIVE_PATHS matching (B3: backslash normalised to forward-slash before match).
    # tr '\\' '/' converts Windows backslash paths so the (^|/) anchors fire correctly.
    _norm_path=$(printf '%s' "$file_path" | tr '\\' '/')

    if printf '%s' "$_norm_path" | grep -qE '(^|[/\\])\.env(\.|$)' 2>/dev/null; then
        _bash_deny "writing to sensitive file '${file_path}'"
    fi
    if printf '%s' "$_norm_path" | grep -qE '\.pem$' 2>/dev/null; then
        _bash_deny "writing to sensitive file '${file_path}'"
    fi
    if printf '%s' "$_norm_path" | grep -qE '(^|[/])id_(rsa|ed25519|ecdsa|dsa)(\.|$)' 2>/dev/null; then
        _bash_deny "writing to sensitive file '${file_path}'"
    fi
    if printf '%s' "$_norm_path" | grep -qE '(^|[/])\.ssh/' 2>/dev/null; then
        _bash_deny "writing to sensitive file '${file_path}'"
    fi
    if printf '%s' "$_norm_path" | grep -qE '(^|[/])\.aws/(credentials|config)$' 2>/dev/null; then
        _bash_deny "writing to sensitive file '${file_path}'"
    fi
    if printf '%s' "$_norm_path" | grep -qE '(^|[/])credentials\.json$' 2>/dev/null; then
        _bash_deny "writing to sensitive file '${file_path}'"
    fi
    if printf '%s' "$_norm_path" | grep -qE '(^|[/])secrets\.(ya?ml|json|toml)$' 2>/dev/null; then
        _bash_deny "writing to sensitive file '${file_path}'"
    fi

    # HIGH_CONFIDENCE_SECRETS scan on file content.
    # Extract the content field: "content" for Write, "new_string" for Edit, "new_source" for NotebookEdit.
    case "$tool_name" in
        Write)     _content_field="content" ;;
        Edit)      _content_field="new_string" ;;
        NotebookEdit) _content_field="new_source" ;;
    esac

    # Use the shared extractor for content; fall back to inline pattern.
    if type extract_json_string_field >/dev/null 2>&1; then
        _content=$(extract_json_string_field "$_content_field" "$PAYLOAD")
    else
        _content=$(printf '%s' "$PAYLOAD" \
            | grep -oE "\"${_content_field}\"[[:space:]]*:[[:space:]]*\"([\\].|[^\"\\\\])*\"" \
            | head -1 \
            | sed -E "s/^\"${_content_field}\"[[:space:]]*:[[:space:]]*\"(.*)\"\$/\\1/" \
            2>/dev/null || true)
    fi

    if [ -n "$_content" ]; then
        if printf '%s' "$_content" | grep -qE 'AKIA[0-9A-Z]{16}' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: AWS access key (AKIA... pattern)"
        fi
        if printf '%s' "$_content" | grep -qE '\bghp_[A-Za-z0-9]{36}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: GitHub personal access token (ghp_... pattern)"
        fi
        if printf '%s' "$_content" | grep -qE '\bgithub_pat_[A-Za-z0-9_]{22,}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: GitHub fine-grained PAT"
        fi
        if printf '%s' "$_content" | grep -qE -- '-----BEGIN (RSA |EC |OPENSSL |DSA )?PRIVATE KEY-----' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: PEM private key header"
        fi
        if printf '%s' "$_content" | grep -qE '\bsk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: OpenAI-style secret key (sk-... pattern)"
        fi
        if printf '%s' "$_content" | grep -qE '\bAIza[0-9A-Za-z_-]{35}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: Google API key (AIza... pattern)"
        fi
        if printf '%s' "$_content" | grep -qE '\b[rs]k_live_[0-9A-Za-z]{16,}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: Stripe live secret key"
        fi
        if printf '%s' "$_content" | grep -qE '\bglpat-[0-9A-Za-z_-]{20}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: GitLab personal access token"
        fi
        if printf '%s' "$_content" | grep -qE '\bgh[osru]_[A-Za-z0-9]{36}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: GitHub OAuth/server/refresh/user token"
        fi
        if printf '%s' "$_content" | grep -qE '\bxoxb-[A-Za-z0-9-]{10,}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: Slack bot token (xoxb-... pattern)"
        fi
    fi

    exit 0
fi

# Unknown tool_name — no decision (exit 0, empty stdout).
exit 0
