#!/bin/bash
# policy-block.sh — Claude Code PreToolUse policy gate
# Reads tool call JSON from stdin and emits a hook decision JSON on stdout.
# Blocks destructive Bash commands, writes to sensitive files, reads of secret
# paths, weakening edits to linter/formatter configs, and high-confidence
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
#
# M3 additions (v2.90.0):
#   (a) Read-side egress guard: Read of secret paths -> ask
#   (b) Config-anti-weakening: Write/Edit that weakens linter/formatter configs -> ask
#   (c) Position-aware argv tokenizer replaces the naive --no-verify regex in both
#       python3 and bash paths. The tokenizer skips -m/--message/-F flag VALUES so
#       a commit whose message body mentions "--no-verify" is not falsely denied.

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

_bash_ask_reason() {
    local reason="$1"
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"team-harness policy: %s"}}\n' "$reason"
    exit 0
}

# ---------------------------------------------------------------------------
# Path 1 — python3-preferred (full gate including entropy scan)
# ---------------------------------------------------------------------------
# Test that python3 is functional, not merely present as a file on PATH.
# A shim that exits 127 (the "absent python3 simulation" in the test harness)
# must be treated as absent so the bash degraded path runs.
_python3_ok=false
if command -v python3 >/dev/null 2>&1 && python3 -c '' 2>/dev/null; then
    _python3_ok=true
fi

if [ "$_python3_ok" = "true" ]; then
    PAYLOAD="$PAYLOAD" python3 - <<'PYEOF'
import json
import math
import os
import re
import shlex
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

# Secret-path patterns for read-side egress guard (M3a).
# Mirrors SENSITIVE_PATHS with an additional *secret* glob pattern.
# Severity: ask (reads are often legitimate — agent may read own .env for debugging).
EGRESS_READ_PATHS = [
    r"(^|[/\\])\.env(\.|$)",
    r"\.pem$",
    r"\.key$",
    r"(^|[/\\])id_(rsa|ed25519|ecdsa|dsa)(\.|$)",
    r"(^|[/\\])\.ssh[/\\]",
    r"(^|[/\\])\.aws[/\\](credentials|config)$",
    r"(^|[/\\])credentials\.json$",
    r"(^|[/\\])secrets\.(ya?ml|json|toml)$",
    r"(^|[/\\])[^/\\]*secret[^/\\]*$",
]

# Allowlist suffixes exempt from the egress read guard.
EGRESS_READ_ALLOWLIST = (".env.example", ".env.sample", ".env.template")

# Linter/formatter config files subject to anti-weakening check (M3b).
CONFIG_WEAKENING_PATHS = re.compile(
    r"(^|[/\\])("
    r"\.eslintrc(\.(js|cjs|json|yaml|yml))?|"
    r"eslint\.config\.(js|cjs|mjs|ts)|"
    r"\.prettierrc(\.(js|cjs|json|yaml|yml))?|"
    r"prettier\.config\.(js|cjs|mjs)|"
    r"ruff\.toml|"
    r"\.ruff\.toml|"
    r"pyproject\.toml|"
    r"tsconfig.*\.json"
    r")$",
    re.IGNORECASE,
)

# Patterns that indicate a weakening edit inside a config file.
CONFIG_WEAKENING_PATTERNS = [
    (r'"rules"\s*:\s*\{\s*\}', 'rules object emptied ("rules": {})'),
    (r"'rules'\s*:\s*\{\s*\}", "rules object emptied ('rules': {})"),
    (r'/\*\s*eslint-disable\b', "broad eslint-disable block comment"),
    (r'//\s*eslint-disable\b(?!\s*eslint-enable)', "eslint-disable line comment (no matching enable)"),
    (r'"extends"\s*:\s*\[\s*\]', 'extends array emptied ("extends": [])'),
    (r'"plugins"\s*:\s*\{\s*\}', 'plugins object emptied'),
    (r'"noImplicitAny"\s*:\s*false', "TypeScript noImplicitAny disabled"),
    (r'"strict"\s*:\s*false', "TypeScript strict mode disabled"),
    (r'select\s*=\s*\[\s*\]', "ruff: all rules deselected"),
    (r'ignore-errors\s*=\s*true', "ruff: ignore-errors enabled"),
]

# High-confidence secret patterns → deny (fail-CLOSED).
# Each pattern is anchored to its documented format.
# The reason names the pattern CLASS, never the matched value.
HIGH_CONFIDENCE_SECRETS = [
    (r"AKIA[0-9A-Z]{16}", "AWS access key (AKIA… pattern)"),
    (r"\bghp_[A-Za-z0-9]{36}\b", "GitHub personal access token (ghp_… pattern)"),
    (r"\bgithub_pat_[A-Za-z0-9_]{22,}\b", "GitHub fine-grained PAT (github_pat_… pattern)"),
    (r"-----BEGIN (?:RSA |EC |OPENSSL |DSA )?PRIVATE KEY-----", "PEM private key header"),
    # Anthropic key — explicit label; also caught incidentally by the sk- rule below
    # but the sk-ant- prefix is Anthropic-specific and deserves its own labelled deny.
    (r"\bsk-ant-[A-Za-z0-9_-]{20,}\b", "Anthropic API key (sk-ant-… pattern)"),
    # OpenAI and OpenAI-compatible keys (sk-proj- / sk-svcacct- / plain sk-)
    (r"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b", "OpenAI-style secret key (sk-… pattern)"),
    (r"\bAIza[0-9A-Za-z_\-]{35}\b", "Google API key (AIza… pattern)"),
    (r"\b[rs]k_live_[0-9A-Za-z]{16,}\b", "Stripe live secret key (sk_live_/rk_live_ pattern)"),
    (r"\bglpat-[0-9A-Za-z_\-]{20}\b", "GitLab personal access token (glpat-… pattern)"),
    (r"\bgh[osru]_[A-Za-z0-9]{36}\b", "GitHub OAuth/server/refresh/user token (gho_/ghs_/ghr_/ghu_ pattern)"),
    (r"\bxoxb-[A-Za-z0-9-]{10,}\b", "Slack bot token (xoxb-… pattern)"),
    # SendGrid: SG. + 22 base64url chars + . + 43 base64url chars (documented canonical format)
    (r"\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b", "SendGrid API key (SG.… pattern)"),
    # Twilio: account SID (AC + 32 hex) and auth token / API key SID (SK + 32 hex)
    (r"\bAC[0-9a-f]{32}\b", "Twilio account SID (AC… pattern)"),
    (r"\bSK[0-9a-f]{32}\b", "Twilio API key SID (SK… pattern)"),
]

# Medium-confidence additional patterns → ask (entropy-noisy forms).
# These are in a separate list so they route to ask(), not deny().
MEDIUM_CONFIDENCE_SECRETS_FIXED = [
    # Generic JWT: three base64url segments separated by dots (eyJ header indicates JSON)
    (r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b",
     "possible JWT token (eyJ… three-segment base64url pattern)"),
    # Bearer token keyword form: Bearer <value of ≥20 chars>
    (r"\bBearer\s+[A-Za-z0-9_/+.=-]{20,}\b",
     "possible Bearer token (Bearer … keyword pattern)"),
    # Azure SAS token: sv= parameter is the canonical SAS signature anchor
    (r"\bsv=[0-9]{4}-[0-9]{2}-[0-9]{2}&[^\s'\"]{30,}\b",
     "possible Azure SAS token (sv=… signature pattern)"),
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


def ask_reason(reason: str) -> None:
    """ask() variant that uses the reason as-is (not wrapped in 'possible secret detected')."""
    json.dump({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "ask",
            "permissionDecisionReason": f"team-harness policy: {reason}",
        }
    }, sys.stdout)
    sys.exit(0)


def scan_for_secrets(content: str) -> None:
    """Scan content for high-confidence (deny) and medium-confidence (ask) secrets.
    Never emits the matched value — only the pattern class name."""
    for pattern, label in HIGH_CONFIDENCE_SECRETS:
        if re.search(pattern, content):
            deny(f"high-confidence secret detected: {label}")

    # Medium-confidence fixed patterns (JWT, Bearer, Azure SAS) — route to ask.
    for pattern, label in MEDIUM_CONFIDENCE_SECRETS_FIXED:
        if re.search(pattern, content):
            ask(f"possible secret detected: {label}")

    for match in MEDIUM_CONFIDENCE_PATTERN.finditer(content):
        # Strip any trailing quote that was captured as part of the ≥20-char value.
        candidate = match.group(1).rstrip("\"'")
        if len(candidate) >= 20 and shannon_entropy(candidate) >= 3.5:
            # Extract the keyword name for the reason message (no matched value emitted).
            raw = match.group(0).lstrip()
            keyword = raw.split("=")[0].split(":")[0].strip()
            ask(f"high-entropy {keyword}= assignment (medium-confidence secret)")


def check_no_verify_tokenized(cmd: str) -> bool:
    """Return True if --no-verify (or evasion forms) or -c core.hooksPath= appears
    as a real flag token in a git commit/rebase/push command (not inside a
    -m/-F/--message value).

    Position-aware tokenizer: walks the argv produced by shlex.split, skips the
    VALUE that follows -m / --message / -F / --file (those are message bodies or
    file paths, not flag tokens), and only fires on --no-verify or
    -c core.hooksPath= when they appear as actual flag tokens.

    SEC-001 evasion forms detected (git commit subcommand only for -n forms):
      - --no-verify           (exact)
      - --no-v ... --no-verify  (any unambiguous prefix; no other commit option starts with --no-v)
      - -n                    (short alias of --no-verify on git commit)
      - -nm, -vn, -fn, etc.  (bundled short-flag cluster containing 'n')
    Note: -n on git push/clean means --dry-run — NOT treated as bypass there.
    SEC-010 (known limitation): command-substitution / variable-expansion forms
      (e.g. git commit $(printf -- --no-verify), $VAR) evade any static tokenizer
      and are NOT detected — structurally unfixable without a shell interpreter.

    Falls back to False (no-decision) if shlex.split raises (malformed quoting),
    keeping the gate fail-closed by NOT denying an unparseble command.
    """
    # Quick pre-filter: only relevant if it's a git commit/rebase/push command.
    if not re.search(r'\bgit\b', cmd, re.IGNORECASE):
        return False
    if not re.search(r'\b(commit|rebase|push)\b', cmd, re.IGNORECASE):
        return False

    try:
        tokens = shlex.split(cmd)
    except ValueError:
        # Malformed quoting — cannot tokenize safely; do not deny.
        return False

    # Flags whose next token is a VALUE (message body or file path), not a flag.
    VALUE_FLAGS = {'-m', '--message', '-F', '--file', '-t', '--template'}
    # -c takes a key=value pair; we handle it separately below.
    C_FLAG = '-c'

    skip_next = False
    in_git_subcommand = False
    saw_git = False
    # Track the git subcommand so -n is scoped to commit only.
    git_subcommand = ''

    i = 0
    while i < len(tokens):
        tok = tokens[i]

        if not saw_git:
            if tok == 'git' or tok.endswith('/git') or tok.endswith('\\git'):
                saw_git = True
            i += 1
            continue

        if skip_next:
            skip_next = False
            i += 1
            continue

        # After `git`, the first non-flag token is the subcommand.
        if not in_git_subcommand and not tok.startswith('-'):
            in_git_subcommand = True
            git_subcommand = tok.lower()
            i += 1
            continue

        # Detect VALUE_FLAGS: skip the immediately following token.
        if tok in VALUE_FLAGS:
            skip_next = True
            i += 1
            continue

        # Handle --message=VALUE (inline form) — no skip needed.
        if tok.startswith('--message=') or tok.startswith('--file='):
            i += 1
            continue

        # Handle -c key=value: check if value contains hooksPath.
        if tok == C_FLAG and i + 1 < len(tokens):
            kv = tokens[i + 1]
            if re.search(r'core\.hooksPath\s*=', kv, re.IGNORECASE):
                return True
            skip_next = True
            i += 1
            continue

        # Handle -c=key=value (rare inline form).
        if tok.startswith(f'{C_FLAG}='):
            kv = tok[3:]
            if re.search(r'core\.hooksPath\s*=', kv, re.IGNORECASE):
                return True
            i += 1
            continue

        # SEC-001: --no-verify and its unambiguous abbreviation prefixes.
        # git parse-options honours any unambiguous prefix of a long option;
        # any unambiguous prefix from '--no-v' up to '--no-verify' is equivalent
        # to '--no-verify' (no other git-commit option starts with '--no-v').
        if tok == '--no-verify' or (tok.startswith('--no-v') and '--no-verify'.startswith(tok)):
            return True

        # SEC-001: -n / short-flag cluster containing 'n' — commit only.
        # On git push/clean, -n means --dry-run, NOT --no-verify.
        if git_subcommand == 'commit' and re.fullmatch(r'-[A-Za-z]*n[A-Za-z]*', tok):
            return True

        i += 1

    return False


if tool == "Bash":
    cmd = tool_input.get("command", "")
    for pattern, label in DENIED_BASH:
        if re.search(pattern, cmd, flags=re.IGNORECASE):
            deny(label)

    # Position-aware --no-verify / -c core.hooksPath= tokenizer (M3c).
    # Replaces the naive r"git\s+(?:commit|rebase|push)\s+.*--no-verify\b" regex
    # which matched --no-verify inside -m message bodies (false positive).
    if check_no_verify_tokenized(cmd):
        deny("--no-verify (bypasses pre-commit hooks)")

    # Secret scan on Bash commands that can carry secrets inline.
    # Broadened from git-commit-only to also cover curl/wget --data forms,
    # tee redirection (tee file << EOF), and env/export assignments.
    # File-redirection / heredoc forms remain a documented residual limit.
    _should_scan_bash = (
        bool(re.search(r"\bgit\s+commit\b", cmd))
        or bool(re.search(r"\bcurl\b.*--data(?:-[a-z]+)?\b", cmd, re.IGNORECASE))
        or bool(re.search(r"\bwget\b.*--post-(?:data|file)\b", cmd, re.IGNORECASE))
        or bool(re.search(r"\btee\b", cmd))
        or bool(re.search(r"\bexport\s+\w+\s*=", cmd))
        or bool(re.search(r"\benv\s+\w+=", cmd))
    )
    if _should_scan_bash:
        scan_for_secrets(cmd)

elif tool == "Read":
    # M3a — read-side egress guard: Read of secret/credential paths -> ask.
    # Allowlisted: .env.example / .env.sample / .env.template (safe templates).
    path = tool_input.get("file_path", "").replace("\\", "/")
    if path.endswith(EGRESS_READ_ALLOWLIST):
        sys.exit(0)
    for pattern in EGRESS_READ_PATHS:
        if re.search(pattern, path):
            ask_reason(
                f"reading a potential secret/credential file ('{path}'). "
                "Confirm this read is intentional and the file does not contain live secrets."
            )

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

    # M3b — config-anti-weakening: detect edits that weaken linter/formatter configs.
    if CONFIG_WEAKENING_PATHS.search(path):
        if tool == "Write":
            content_to_check = tool_input.get("content", "")
        elif tool == "Edit":
            content_to_check = tool_input.get("new_string", "")
        else:  # NotebookEdit
            content_to_check = tool_input.get("new_source", "")
        if content_to_check:
            for pattern, label in CONFIG_WEAKENING_PATTERNS:
                if re.search(pattern, content_to_check, re.MULTILINE):
                    ask_reason(
                        f"edit may weaken linter/formatter config '{path}' ({label}). "
                        "Confirm this change is intentional."
                    )

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
# Enforces: DENIED_BASH, SENSITIVE_PATHS, HIGH_CONFIDENCE_SECRETS,
#           Read egress guard (M3a), config-anti-weakening (M3b),
#           position-aware --no-verify tokenizer (M3c).
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
# M3c — position-aware --no-verify tokenizer (bash degraded path).
# Returns exit 0 if --no-verify (or evasion forms) / core.hooksPath= appears
# as a flag token (non-zero exit means "not found").
# Walks tokens after "git"; skips the VALUE following -m/--message/-F/--file.
#
# SEC-001 evasion forms (commit subcommand only for -n forms):
#   --no-verify, --no-ver* (unambiguous prefix), -n, -nm/-vn/etc. (clusters).
# On git push/clean, -n means --dry-run — NOT treated as bypass there.
#
# SEC-002: uses a quote-aware tokenizer (reads the command char-by-char) so
#   git commit -m "body mentioning --no-verify" is NOT falsely denied.
#   set -- $cmd is NOT used (it is quote-unaware and glob-expands).
# ---------------------------------------------------------------------------
_bash_tokenize_cmd() {
    # Emit NUL-delimited tokens from a shell command string, respecting
    # double-quoted and single-quoted groups.  Output is written to stdout
    # as newline-delimited tokens (newlines inside tokens are represented as
    # spaces — acceptable for flag scanning).
    local cmd="$1"
    local i=0
    local len=${#cmd}
    local tok=''
    local ch in_dq=0 in_sq=0

    while [ "$i" -lt "$len" ]; do
        ch="${cmd:$i:1}"
        i=$((i + 1))

        if [ "$in_sq" = "1" ]; then
            if [ "$ch" = "'" ]; then
                in_sq=0
            else
                tok="${tok}${ch}"
            fi
            continue
        fi

        if [ "$in_dq" = "1" ]; then
            if [ "$ch" = '"' ]; then
                in_dq=0
            elif [ "$ch" = '\\' ] && [ "$i" -lt "$len" ]; then
                # Inside double-quotes only \" \\ \$ \` are escapes.
                local nc="${cmd:$i:1}"
                i=$((i + 1))
                case "$nc" in
                    '"'|'\\'|'$'|'`') tok="${tok}${nc}" ;;
                    *) tok="${tok}\\${nc}" ;;
                esac
            else
                tok="${tok}${ch}"
            fi
            continue
        fi

        # Unquoted.
        case "$ch" in
            ' '|'	')
                if [ -n "$tok" ]; then
                    printf '%s\n' "$tok"
                    tok=''
                fi
                ;;
            '"')  in_dq=1 ;;
            "'")  in_sq=1 ;;
            '\\')
                if [ "$i" -lt "$len" ]; then
                    local nc2="${cmd:$i:1}"
                    i=$((i + 1))
                    tok="${tok}${nc2}"
                fi
                ;;
            *)    tok="${tok}${ch}" ;;
        esac
    done
    if [ -n "$tok" ]; then
        printf '%s\n' "$tok"
    fi
}

_bash_check_no_verify_tokenized() {
    local cmd="$1"
    # Quick pre-filter: must contain "git" and one of commit/rebase/push.
    if ! printf '%s' "$cmd" | grep -qiE '\bgit\b'; then
        return 1
    fi
    if ! printf '%s' "$cmd" | grep -qiE '\b(commit|rebase|push)\b'; then
        return 1
    fi

    # State machine variables.
    # pending: 'skip' = skip next token (message body / file path)
    #          'c'    = next token is a -c key=value pair
    #          ''     = normal
    local pending=''
    local saw_git=0
    local git_subcommand=''
    local tok

    # Quote-aware tokenization (SEC-002): avoids the false-positive from
    # set -- $cmd where -m "body mentioning --no-verify" splits --no-verify
    # as a bare token.
    while IFS= read -r tok; do

        # --- pending: skip the next token (message body, file path). ---
        if [ "$pending" = "skip" ]; then
            pending=''
            continue
        fi

        # --- pending: this token is the key=value arg to -c. ---
        if [ "$pending" = "c" ]; then
            pending=''
            if printf '%s' "$tok" | grep -qiE 'core\.hooksPath[[:space:]]*='; then
                return 0  # -c core.hooksPath=... found
            fi
            continue
        fi

        # --- not yet seen 'git'. ---
        if [ "$saw_git" = "0" ]; then
            case "$tok" in
                git|*/git) saw_git=1 ;;
            esac
            continue
        fi

        # --- record the git subcommand (first non-flag token after git). ---
        if [ -z "$git_subcommand" ]; then
            case "$tok" in
                -*) : ;;  # still a flag before subcommand (e.g. git -c x commit)
                *)  git_subcommand="$tok"; continue ;;
            esac
        fi

        # --- flag handling. ---
        case "$tok" in
            -m|--message|-F|--file|-t|--template)
                pending='skip'
                continue
                ;;
            --message=*|--file=*)
                # Inline value: no skip needed.
                continue
                ;;
            -c)
                pending='c'
                continue
                ;;
            -c=*)
                # Inline form: -c=core.hooksPath=...
                local kv="${tok#-c=}"
                if printf '%s' "$kv" | grep -qiE 'core\.hooksPath[[:space:]]*='; then
                    return 0
                fi
                continue
                ;;
            # SEC-001: --no-verify and unambiguous prefix abbreviations.
            # git parse-options honours any unambiguous prefix of a long option;
            # any unambiguous prefix from --no-v up to --no-verify is equivalent
            # to --no-verify (no other git-commit option starts with --no-v).
            --no-verify|--no-verif|--no-verifi|--no-veri|--no-ver|--no-ve|--no-v|--no-verify=*)
                return 0  # found
                ;;
        esac

        # SEC-001: -n / short-flag cluster containing 'n' — commit only.
        # On git push/clean, -n means --dry-run, NOT --no-verify.
        if [ "$git_subcommand" = "commit" ]; then
            if printf '%s' "$tok" | grep -qE '^-[A-Za-z]*n[A-Za-z]*$'; then
                return 0  # -n or cluster like -nm, -vn
            fi
        fi

    done < <(_bash_tokenize_cmd "$cmd")

    return 1  # not found
}

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
    # SEC-003: use POSIX [[:space:]] throughout — \s is a GNU-grep extension
    # that matches literal 's' on BSD/macOS grep, not whitespace.
    # Pattern 1: rm -rf / rm -fr / rm -r -f targeting / ~ $HOME
    if printf '%s' "$cmd" | grep -iE '\brm[[:space:]]+\S*[rR]\S*[fF]\S*[[:space:]]+(--|)?[[:space:]]*/($|[[:space:]])' >/dev/null 2>&1 || \
       printf '%s' "$cmd" | grep -iE '\brm[[:space:]]+\S*[rR]\S*[fF]\S*[[:space:]]+(--|)?[[:space:]]*~($|[[:space:]])' >/dev/null 2>&1 || \
       printf '%s' "$cmd" | grep -iE '\brm[[:space:]]+\S*[rR]\S*[fF]\S*[[:space:]]+(--|)?[[:space:]]*\$(\{?HOME\}?)($|[[:space:]])' >/dev/null 2>&1; then
        _bash_deny "rm -rf targeting / ~ or HOME"
    fi
    # Pattern 2: rm -rf with bare wildcard
    if printf '%s' "$cmd" | grep -iE '\brm[[:space:]]+\S*[rR]\S*[fF]\S*[[:space:]]+(--|)?[[:space:]]*\*($|[[:space:]])' >/dev/null 2>&1; then
        _bash_deny "rm -rf with bare wildcard"
    fi
    # Pattern 3: git push --force / -f / --force-with-lease
    if printf '%s' "$cmd" | grep -iE '\bgit[[:space:]]+push[[:space:]]+.*(-f\b|--force\b|--force-with-lease)' >/dev/null 2>&1; then
        _bash_deny "git push --force"
    fi
    # Pattern 4: git reset --hard
    if printf '%s' "$cmd" | grep -iE '\bgit[[:space:]]+reset[[:space:]]+--hard\b' >/dev/null 2>&1; then
        _bash_deny "git reset --hard"
    fi
    # Pattern 5: git clean -f
    if printf '%s' "$cmd" | grep -iE '\bgit[[:space:]]+clean[[:space:]]+\S*f' >/dev/null 2>&1; then
        _bash_deny "git clean -f"
    fi
    # Pattern 6: --no-verify / -c core.hooksPath= (M3c tokenizer)
    if _bash_check_no_verify_tokenized "$cmd"; then
        _bash_deny "--no-verify (bypasses pre-commit hooks)"
    fi
    # Pattern 7: destructive SQL
    if printf '%s' "$cmd" | grep -iE '\bdrop[[:space:]]+(table|database|schema)\b' >/dev/null 2>&1; then
        _bash_deny "destructive SQL: DROP"
    fi
    if printf '%s' "$cmd" | grep -iE '\btruncate[[:space:]]+table\b' >/dev/null 2>&1; then
        _bash_deny "destructive SQL: TRUNCATE TABLE"
    fi

    # HIGH_CONFIDENCE_SECRETS scan — broadened from git-commit-only to also
    # cover curl --data, wget --post, tee, and export/env assignments.
    _bash_should_scan=0
    if printf '%s' "$cmd" | grep -qE '\bgit[[:space:]]+commit\b' 2>/dev/null; then
        _bash_should_scan=1
    elif printf '%s' "$cmd" | grep -qiE '\bcurl\b.*--data(-[a-z]+)?\b' 2>/dev/null; then
        _bash_should_scan=1
    elif printf '%s' "$cmd" | grep -qiE '\bwget\b.*--post-(data|file)\b' 2>/dev/null; then
        _bash_should_scan=1
    elif printf '%s' "$cmd" | grep -qE '\btee\b' 2>/dev/null; then
        _bash_should_scan=1
    elif printf '%s' "$cmd" | grep -qE '\bexport[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=' 2>/dev/null; then
        _bash_should_scan=1
    elif printf '%s' "$cmd" | grep -qE '\benv[[:space:]]+[A-Za-z_][A-Za-z0-9_]*=' 2>/dev/null; then
        _bash_should_scan=1
    fi

    if [ "$_bash_should_scan" = "1" ]; then
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
        if printf '%s' "$cmd" | grep -qE '\bsk-ant-[A-Za-z0-9_-]{20,}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: Anthropic API key (sk-ant-... pattern)"
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
        if printf '%s' "$cmd" | grep -qE '\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: SendGrid API key (SG.... pattern)"
        fi
        if printf '%s' "$cmd" | grep -qE '\bAC[0-9a-f]{32}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: Twilio account SID (AC... pattern)"
        fi
        if printf '%s' "$cmd" | grep -qE '\bSK[0-9a-f]{32}\b' 2>/dev/null; then
            _bash_deny "high-confidence secret detected: Twilio API key SID (SK... pattern)"
        fi
        # Medium-confidence: JWT and Bearer — route to ask in bash path
        if printf '%s' "$cmd" | grep -qE '\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b' 2>/dev/null; then
            _bash_ask "possible JWT token (eyJ... three-segment base64url pattern)"
        fi
        if printf '%s' "$cmd" | grep -qE '\bBearer[[:space:]]+[A-Za-z0-9_/+.=-]{20,}\b' 2>/dev/null; then
            _bash_ask "possible Bearer token (Bearer ... keyword pattern)"
        fi
    fi

    # No match — no decision (exit 0, empty stdout). Non-matching Bash calls pass through.
    exit 0
fi

# ---------------------------------------------------------------------------
# M3a — Read egress guard (bash degraded path)
# Evaluate secret-path reads and ask for confirmation.
# ---------------------------------------------------------------------------
if [ "$tool_name" = "Read" ]; then
    file_path=$(_pb_extract_field "file_path" "$PAYLOAD")
    _norm_path=$(printf '%s' "$file_path" | tr '\\' '/')

    # Allowlist: .env.example / .env.sample / .env.template
    case "$_norm_path" in
        *.env.example|*.env.sample|*.env.template) exit 0 ;;
    esac

    # Egress guard: secret/credential paths -> ask.
    if printf '%s' "$_norm_path" | grep -qE '(^|[/\\])\.env(\.|$)' 2>/dev/null; then
        _bash_ask_reason "reading a potential secret/credential file ('${file_path}'). Confirm this read is intentional and the file does not contain live secrets."
    fi
    if printf '%s' "$_norm_path" | grep -qE '\.pem$' 2>/dev/null; then
        _bash_ask_reason "reading a potential secret/credential file ('${file_path}'). Confirm this read is intentional and the file does not contain live secrets."
    fi
    if printf '%s' "$_norm_path" | grep -qE '\.key$' 2>/dev/null; then
        _bash_ask_reason "reading a potential secret/credential file ('${file_path}'). Confirm this read is intentional and the file does not contain live secrets."
    fi
    if printf '%s' "$_norm_path" | grep -qE '(^|[/])id_(rsa|ed25519|ecdsa|dsa)(\.|$)' 2>/dev/null; then
        _bash_ask_reason "reading a potential secret/credential file ('${file_path}'). Confirm this read is intentional and the file does not contain live secrets."
    fi
    if printf '%s' "$_norm_path" | grep -qE '(^|[/])\.ssh/' 2>/dev/null; then
        _bash_ask_reason "reading a potential secret/credential file ('${file_path}'). Confirm this read is intentional and the file does not contain live secrets."
    fi
    if printf '%s' "$_norm_path" | grep -qE '(^|[/])\.aws/(credentials|config)$' 2>/dev/null; then
        _bash_ask_reason "reading a potential secret/credential file ('${file_path}'). Confirm this read is intentional and the file does not contain live secrets."
    fi
    if printf '%s' "$_norm_path" | grep -qE '(^|[/])credentials\.json$' 2>/dev/null; then
        _bash_ask_reason "reading a potential secret/credential file ('${file_path}'). Confirm this read is intentional and the file does not contain live secrets."
    fi
    if printf '%s' "$_norm_path" | grep -qE '(^|[/])secrets\.(ya?ml|json|toml)$' 2>/dev/null; then
        _bash_ask_reason "reading a potential secret/credential file ('${file_path}'). Confirm this read is intentional and the file does not contain live secrets."
    fi
    if printf '%s' "$_norm_path" | grep -qiE '(^|[/])[^/]*secret[^/]*$' 2>/dev/null; then
        _bash_ask_reason "reading a potential secret/credential file ('${file_path}'). Confirm this read is intentional and the file does not contain live secrets."
    fi

    exit 0
fi

# ---------------------------------------------------------------------------
# Bash gate: tool_name in (Write, Edit, NotebookEdit)
# Evaluate SENSITIVE_PATHS (with backslash normalisation), HIGH_CONFIDENCE_SECRETS,
# and config-anti-weakening (M3b).
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

    # M3b — config-anti-weakening (bash degraded path).
    # Check if the target is a linter/formatter config and the content weakens it.
    _is_config=0
    case "$_norm_path" in
        *.eslintrc|*.eslintrc.js|*.eslintrc.cjs|*.eslintrc.json|*.eslintrc.yaml|*.eslintrc.yml|\
        *eslint.config.js|*eslint.config.cjs|*eslint.config.mjs|*eslint.config.ts|\
        *.prettierrc|*.prettierrc.js|*.prettierrc.cjs|*.prettierrc.json|*.prettierrc.yaml|*.prettierrc.yml|\
        *prettier.config.js|*prettier.config.cjs|*prettier.config.mjs|\
        *ruff.toml|*.ruff.toml|*pyproject.toml|\
        *tsconfig*.json)
            _is_config=1
            ;;
    esac

    if [ "$_is_config" = "1" ]; then
        # Extract content field.
        case "$tool_name" in
            Write)        _content_field="content" ;;
            Edit)         _content_field="new_string" ;;
            NotebookEdit) _content_field="new_source" ;;
        esac

        if type extract_json_string_field >/dev/null 2>&1; then
            _cfg_content=$(extract_json_string_field "$_content_field" "$PAYLOAD")
        else
            _cfg_content=$(printf '%s' "$PAYLOAD" \
                | grep -oE "\"${_content_field}\"[[:space:]]*:[[:space:]]*\"([\\].|[^\"\\\\])*\"" \
                | head -1 \
                | sed -E "s/^\"${_content_field}\"[[:space:]]*:[[:space:]]*\"(.*)\"\$/\\1/" \
                2>/dev/null || true)
        fi

        if [ -n "$_cfg_content" ]; then
            # SEC-003: all 10 python3 CONFIG_WEAKENING_PATTERNS ported to bash.
            # Use POSIX [[:space:]] instead of \s (\s is a GNU-grep extension
            # that matches literal 's' on BSD/macOS grep — not whitespace).
            #
            # Quote handling: when the _json-extract.sh helper is absent, the
            # inline fallback leaves JSON-escaped sequences intact (e.g. the
            # pair \" in the original JSON becomes the two-character sequence
            # \"+char in the extracted string).  Patterns that match JSON keys
            # use [^a-zA-Z] as the left/right boundary (matches both the raw
            # double-quote and the JSON-escaped backslash-quote sequence) so the
            # check fires regardless of which extractor path ran.
            # {1,2} after the key name matches both the plain-quote form ("rules":)
            # and the JSON-escaped form (\"rules\":) — the backslash+quote occupies
            # two characters between the key name and the colon delimiter.
            if printf '%s' "$_cfg_content" | grep -qE 'rules[^a-zA-Z]{1,2}[[:space:]]*:[[:space:]]*\{[[:space:]]*\}' 2>/dev/null; then
                _bash_ask_reason "edit may weaken linter/formatter config '${file_path}' (rules object emptied). Confirm this change is intentional."
            fi
            if printf '%s' "$_cfg_content" | grep -qE '/\*[[:space:]]*eslint-disable' 2>/dev/null; then
                _bash_ask_reason "edit may weaken linter/formatter config '${file_path}' (broad eslint-disable block comment). Confirm this change is intentional."
            fi
            if printf '%s' "$_cfg_content" | grep -qE '//[[:space:]]*eslint-disable[^-]' 2>/dev/null; then
                _bash_ask_reason "edit may weaken linter/formatter config '${file_path}' (eslint-disable line comment). Confirm this change is intentional."
            fi
            if printf '%s' "$_cfg_content" | grep -qE 'extends[^a-zA-Z]{1,2}[[:space:]]*:[[:space:]]*\[[[:space:]]*\]' 2>/dev/null; then
                _bash_ask_reason "edit may weaken linter/formatter config '${file_path}' (extends array emptied). Confirm this change is intentional."
            fi
            if printf '%s' "$_cfg_content" | grep -qE 'plugins[^a-zA-Z]{1,2}[[:space:]]*:[[:space:]]*\{[[:space:]]*\}' 2>/dev/null; then
                _bash_ask_reason "edit may weaken linter/formatter config '${file_path}' (plugins object emptied). Confirm this change is intentional."
            fi
            if printf '%s' "$_cfg_content" | grep -qE 'noImplicitAny[^a-zA-Z]{1,2}[[:space:]]*:[[:space:]]*false' 2>/dev/null; then
                _bash_ask_reason "edit may weaken linter/formatter config '${file_path}' (TypeScript noImplicitAny disabled). Confirm this change is intentional."
            fi
            if printf '%s' "$_cfg_content" | grep -qE 'strict[^a-zA-Z]{1,2}[[:space:]]*:[[:space:]]*false' 2>/dev/null; then
                _bash_ask_reason "edit may weaken linter/formatter config '${file_path}' (TypeScript strict mode disabled). Confirm this change is intentional."
            fi
            if printf '%s' "$_cfg_content" | grep -qE 'select[[:space:]]*=[[:space:]]*\[[[:space:]]*\]' 2>/dev/null; then
                _bash_ask_reason "edit may weaken linter/formatter config '${file_path}' (ruff: all rules deselected). Confirm this change is intentional."
            fi
            if printf '%s' "$_cfg_content" | grep -qE 'ignore-errors[[:space:]]*=[[:space:]]*true' 2>/dev/null; then
                _bash_ask_reason "edit may weaken linter/formatter config '${file_path}' (ruff: ignore-errors enabled). Confirm this change is intentional."
            fi
        fi
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
