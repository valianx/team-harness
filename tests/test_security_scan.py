#!/usr/bin/env python3
# tests/test_security_scan.py
# Suite 12 — security self-scan
#
# Audits the shipped assets of this repo for the security issues a
# config-distribution repo must never ship:
#   Check 1 (FAIL) — read-only-tier agent carrying forbidden mutation tools:
#   Check 3 (FAIL) — hooks/*.sh containing injection anti-patterns
#   Check 4 (WARN) — hooks.json manifest non-canonical command / over-permissive matcher
#   Check 5 (FAIL) — concrete secrets in shipped assets
#
# Usage:
#   python3 tests/test_security_scan.py
# Exit code:
#   0 if all FAIL-severity checks pass (WARN findings may still be printed)
#   1 if any FAIL finding is present
#
# REPORT-only: no --fix, no Write/Edit of any audited file.
# The reason strings name the pattern CLASS, never a concrete matched value.

from __future__ import annotations

import io
import json
import re
import sys
import tempfile
import tomllib
from pathlib import Path

# ---------------------------------------------------------------------------
# Stdout encoding guard
# ---------------------------------------------------------------------------
if sys.stdout.encoding and sys.stdout.encoding.lower().startswith("cp"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = REPO_ROOT / "agents"
HOOKS_DIR = REPO_ROOT / "hooks"
PLUGIN_DIR = REPO_ROOT / ".claude-plugin"
CODEX_AGENTS_DIR = REPO_ROOT / ".codex" / "agents"

# ---------------------------------------------------------------------------
# Constants — this file is their single source of truth. They were previously
# mirrored from tests/test_agent_structure.py, which has been retired; the
# mirror-integrity check that guarded the copy is gone with it because there is
# no longer a second copy to diverge from. Keep these two lists correct here.
# ---------------------------------------------------------------------------

# These agents MUST NOT carry Bash in their frontmatter tools:.
# A read-only agent gaining Bash is a trust-boundary regression, which is why
# the list is declared rather than derived.
READ_ONLY_AGENTS = {
    "architect", "security", "qa", "qa-plan", "reviewer",
    "plan-reviewer", "mentor", "adversary", "pr-review-qa",
    "pr-review-security", "reviewer-consolidator",
}

PR_REVIEW_AGENT_TOOLS = {
    "reviewer": [
        "Read", "Glob", "Grep", "mcp__context7__resolve-library-id",
        "mcp__context7__query-docs",
    ],
    "pr-review-qa": ["Read", "Glob", "Grep"],
    "pr-review-security": ["Read", "Glob", "Grep"],
    "reviewer-consolidator": ["Read", "Glob", "Grep"],
}

NO_MUTATION_AGENTS = set(PR_REVIEW_AGENT_TOOLS)
CODEX_PR_REVIEW_CAPABILITIES = {"read", "glob", "grep"}

# The full agent roster. check_0_roster_reachability() below fails when a name
# here no longer resolves to a file.
EXPECTED_AGENTS = [
    "orchestrator", "architect", "agent-builder", "security", "reviewer",
    "reviewer-consolidator", "pr-review-qa", "pr-review-security",
    "qa", "qa-plan", "gcp-cost-analyzer", "gcp-infra", "init-project", "implementer", "tester",
    "plan-reviewer", "diagrammer", "documenter", "likec4-diagrammer",
    "d2-diagrammer", "translator", "delivery", "mentor",
    "researcher", "research-consolidator", "code-researcher", "adversary", "ux-reviewer",
]

# ---------------------------------------------------------------------------
# Check 5 — detector-file allowlist (skipped wholesale).
# These files hold secret regex literals and/or constructed test fixtures; a
# naive scan would false-FAIL the clean tree.
# ---------------------------------------------------------------------------
DETECTOR_FILE_ALLOWLIST = {
    "hooks/ts/bodies/policy-block.ts",
    "tests/test_policy_block.sh",
    "tests/test_security_scan.py",   # this file
}

# ---------------------------------------------------------------------------
# Check 5 — high-confidence secret patterns (class-anchored, not concrete).
# Repository-scan patterns. This scanner and the pre-tool guard have different
# input boundaries, so this list is maintained independently.
# Each pattern requires a non-trivial concrete VALUE after its prefix —
# a bare regex shell like the AKIA prefix alone does NOT match.
# ---------------------------------------------------------------------------
HIGH_CONFIDENCE_SECRETS = [
    (re.compile(r"AKIA[0-9A-Z]{16}"),
     "AWS access key (AKIA… pattern)"),
    (re.compile(r"\bghp_[A-Za-z0-9]{36}\b"),
     "GitHub personal access token (ghp_… pattern)"),
    (re.compile(r"\bgithub_pat_[A-Za-z0-9_]{22,}\b"),
     "GitHub fine-grained PAT (github_pat_… pattern)"),
    (re.compile(r"-----BEGIN (?:RSA |EC |OPENSSL |DSA )?PRIVATE KEY-----"),
     "PEM private key header"),
    (re.compile(r"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b"),
     "OpenAI-style secret key (sk-… pattern)"),
    (re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b"),
     "Google API key (AIza… pattern)"),
    (re.compile(r"\b[rs]k_live_[0-9A-Za-z]{16,}\b"),
     "Stripe live secret key (sk_live_/rk_live_ pattern)"),
    (re.compile(r"\bglpat-[0-9A-Za-z_\-]{20}\b"),
     "GitLab personal access token (glpat-… pattern)"),
    (re.compile(r"\bgh[osru]_[A-Za-z0-9]{36}\b"),
     "GitHub OAuth/server/refresh/user token (gho_/ghs_/ghr_/ghu_ pattern)"),
    (re.compile(r"\bxoxb-[A-Za-z0-9-]{10,}\b"),
     "Slack bot token (xoxb-… pattern)"),
]

# ---------------------------------------------------------------------------
# Check 5 — .env.example-style placeholder allowlist.
# Placeholder-file convention for the repository scan.
# Files matching these name suffixes are placeholders, not real secrets.
# ---------------------------------------------------------------------------
PLACEHOLDER_SUFFIXES = (".env.example", ".env.sample", ".env.template")


# ---------------------------------------------------------------------------
# Finding accumulator
# ---------------------------------------------------------------------------

findings: list[tuple[str, str, str]] = []  # (severity, check_id, message)


def finding(severity: str, check_id: str, message: str) -> None:
    """Record a finding. severity is FAIL or WARN."""
    findings.append((severity, check_id, message))
    print(f"  [{severity}] {check_id} — {message}")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def read(path: Path) -> str:
    """Read a file as UTF-8, replacing undecodable bytes."""
    return path.read_text(encoding="utf-8", errors="replace")


def parse_frontmatter(text: str) -> dict[str, str]:
    """Extract the YAML frontmatter block as a flat key→value dict.
    Deliberately minimal — a flat scan is all Checks 1 and 2 need."""
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end < 0:
        return {}
    block = text[3:end].strip()
    out: dict[str, str] = {}
    for line in block.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            out[k.strip()] = v.strip()
    return out


def tools_list(fm: dict[str, str]) -> list[str]:
    """Parse the tools: field into a list of stripped tool names."""
    raw = fm.get("tools", "")
    if not raw:
        return []
    return [t.strip() for t in raw.split(",")]


def repo_rel(path: Path) -> str:
    """Return a repo-relative path string for display."""
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(path)


def codex_capability_errors(manifest: dict[object, object]) -> list[str]:
    capabilities = manifest.get("capabilities")
    if not isinstance(capabilities, dict):
        return ["missing capabilities table"]
    if capabilities.get("default") != "deny":
        return ["capabilities.default must be deny"]
    allowed = capabilities.get("allow")
    if not isinstance(allowed, list) or not all(isinstance(item, str) for item in allowed):
        return ["capabilities.allow must be a string array"]
    if len(allowed) != len(set(allowed)) or set(allowed) != CODEX_PR_REVIEW_CAPABILITIES:
        return ["capabilities.allow must contain exactly read, glob, and grep"]
    unexpected = set(capabilities) - {"default", "allow"}
    if unexpected:
        return [f"unexpected capability fields: {sorted(unexpected)!r}"]
    return []


def scan_codex_pr_review_projections(directory: Path) -> tuple[int, list[tuple[Path, str]]]:
    discovered = 0
    errors: list[tuple[Path, str]] = []
    for agent_name in sorted(PR_REVIEW_AGENT_TOOLS):
        path = directory / f"{agent_name}.toml"
        if not path.exists():
            continue
        discovered += 1
        try:
            manifest = tomllib.loads(read(path))
        except (OSError, tomllib.TOMLDecodeError) as error:
            errors.append((path, f"invalid Codex projection: {error}"))
            continue
        errors.extend((path, error) for error in codex_capability_errors(manifest))
    return discovered, errors


# ---------------------------------------------------------------------------
# Check 0 — roster reachability: every name in EXPECTED_AGENTS/READ_ONLY_AGENTS
# resolves to a real file under agents/. The two lists are now declared here
# (see above) rather than mirrored from another suite, so there is no second
# copy left to diverge from. What remains worth checking is that neither list
# names an agent that no longer exists: Check 1 treats a missing agent file as
# "not our concern", so a stale name silently removes that agent from the scan
# while the run stays green. Reachability is a
# property of the filesystem and fails loudly.
# ---------------------------------------------------------------------------

def check_0_roster_reachability() -> int:
    """Return count of FAIL findings."""
    before = len(findings)

    for name in sorted(set(EXPECTED_AGENTS) | READ_ONLY_AGENTS | NO_MUTATION_AGENTS):
        if not (AGENTS_DIR / f"{name}.md").is_file():
            finding(
                "FAIL",
                "check-0",
                f"roster names '{name}' but agents/{name}.md does not exist —"
                " Checks 1 and 2 skip a missing file, so this name silently"
                " drops out of the scan instead of failing it",
            )

    unknown = set(READ_ONLY_AGENTS) - set(EXPECTED_AGENTS)
    if unknown:
        finding(
            "FAIL",
            "check-0",
            f"READ_ONLY_AGENTS contains {sorted(unknown)!r}, absent from"
            " EXPECTED_AGENTS — the read-only tier must be a subset of the roster",
        )

    unknown = NO_MUTATION_AGENTS - set(EXPECTED_AGENTS)
    if unknown:
        finding(
            "FAIL",
            "check-0",
            f"NO_MUTATION_AGENTS contains {sorted(unknown)!r}, absent from EXPECTED_AGENTS",
        )

    if len(findings) == before:
        print("  [PASS] check-0 — every rostered agent resolves to a real file and"
              " the read-only tier is a subset of the roster")
    return len(findings) - before


# ---------------------------------------------------------------------------
# Check 1 — read-only tiers must not carry forbidden mutation tools
# ---------------------------------------------------------------------------

def check_1_readonly_bash() -> int:
    """Return count of FAIL findings."""
    before = len(findings)
    passed_count = 0
    for agent_name in READ_ONLY_AGENTS:
        path = AGENTS_DIR / f"{agent_name}.md"
        if not path.exists():
            # A missing agent file is reported by check_0_roster_reachability();
            # not our concern here — skip silently.
            continue
        fm = parse_frontmatter(read(path))
        agent_tools = tools_list(fm)
        if "Bash" in agent_tools:
            finding(
                "FAIL",
                "check-1",
                f"agents/{agent_name}.md — read-only-tier agent carries Bash in tools: "
                f"(privilege-escalation grant)",
            )
        else:
            passed_count += 1

        if agent_name in NO_MUTATION_AGENTS:
            forbidden = sorted({"Bash", "Edit", "Write"} & set(agent_tools))
            if forbidden:
                finding(
                    "FAIL",
                    "check-1",
                    f"agents/{agent_name}.md — no-mutation agent carries {forbidden!r} in tools:",
                )

        expected_tools = PR_REVIEW_AGENT_TOOLS.get(agent_name)
        if expected_tools is not None and agent_tools != expected_tools:
            finding(
                "FAIL",
                "check-1",
                f"agents/{agent_name}.md — PR-review capability allowlist is {agent_tools!r},"
                f" expected exactly {expected_tools!r}",
            )

    if len(findings) == before:
        print(
            f"  [PASS] check-1 — {passed_count} read-only-tier agents audited;"
            " PR-review agents expose their exact read-only allowlists"
        )
    return len(findings) - before


# ---------------------------------------------------------------------------
# Check 2 — optional Codex PR-review projections must fail closed
# ---------------------------------------------------------------------------

def check_2_codex_pr_review_capabilities() -> int:
    """Validate any project-scoped Codex projection without requiring one."""
    before = len(findings)
    discovered, errors = scan_codex_pr_review_projections(CODEX_AGENTS_DIR)
    for path, error in errors:
        finding("FAIL", "check-2", f"{repo_rel(path)} — {error}")

    if len(findings) == before:
        print(
            f"  [PASS] check-2 — {discovered} optional Codex PR-review projections"
            " discovered; every discovered projection has an exact fail-closed allowlist"
        )
    return len(findings) - before

# ---------------------------------------------------------------------------
# Check 3 — hooks/*.sh must not contain injection anti-patterns
# ---------------------------------------------------------------------------

# MVP injection anti-patterns — short and precise to minimize false positives.
# Hardened idioms (2>/dev/null, standalone curl, base64, quoted interpolation,
# piping to a local known script) are deliberately NOT in this list.
#
# Pattern rationale:
#   (a) eval "$VAR" / eval "$(..." — eval of an interpolated var (command injection sink)
#   (b) curl ... | bash / wget ... | bash/sh — remote code execution vector
#       Note: "| bash" piping to a LOCAL script variable (like "| bash "$SCRIPT"")
#       is hardened and must NOT be flagged — only "curl|wget ... | bash/sh" matters.
#   (c) rm -rf $VAR / rm -rf "$VAR" where VAR is a shell variable — unanchored deletion
#   (d) unquoted $() in command position at line start or after ; & | — shell injection
#
# These patterns are ordered by specificity. False-positive risk is mitigated by
# requiring the dangerous COMBINATION (eval+interpolation, curl+pipe-to-bash, etc.)
# rather than the bare keyword.

HOOK_INJECTION_PATTERNS = [
    # (a) eval of an interpolated variable or command substitution
    # Matches: eval "$var", eval "$(cmd)", eval `cmd`
    # Does NOT match: eval '...' (single-quoted literals are safe)
    (re.compile(r'\beval\s+(?:"[^"]*\$|\$\(|`)'),
     "eval of an interpolated variable or command substitution"),

    # (b) curl or wget piped to bash or sh (remote code execution)
    # Matches: curl ... | bash, wget ... | sh, etc.
    # Does NOT match: local-script pipeline like python3 -c "..." | bash "$SCRIPT"
    # Requires "curl" or "wget" as the word immediately before the pipe chain.
    (re.compile(r'\b(curl|wget)\b[^\n|]*\|\s*(?:bash|sh)\b'),
     "curl/wget piped to bash/sh (remote code execution vector)"),

    # (c) rm -rf of an unquoted variable (unanchored deletion)
    # Matches: rm -rf $VAR, rm -rf ${VAR}, rm -fr $VAR
    # Does NOT match: rm -rf /specific/path or rm -rf "./known-dir"
    (re.compile(r'\brm\s+(?:-\S*[rR]\S*[fF]|-\S*[fF]\S*[rR])\s+\$(?:\{[^}]+\}|[A-Za-z_][A-Za-z0-9_]*)(?:\s|$)'),
     "rm -rf of an unquoted shell variable (unanchored deletion)"),
]


def check_3_hook_injection() -> int:
    """Return count of FAIL findings."""
    before = len(findings)
    ok_hooks: list[str] = []

    for hook_path in sorted(HOOKS_DIR.glob("*.sh")):
        content = read(hook_path)
        hook_rel = repo_rel(hook_path)
        flagged = False
        for pattern, reason in HOOK_INJECTION_PATTERNS:
            for match in pattern.finditer(content):
                # Surface the line, not the matched value, to avoid leaking context.
                line_no = content[: match.start()].count("\n") + 1
                finding(
                    "FAIL",
                    "check-3",
                    f"{hook_rel}:{line_no} — injection anti-pattern: {reason}",
                )
                flagged = True
        if not flagged:
            ok_hooks.append(hook_path.name)

    if len(findings) == before:
        print(
            f"  [PASS] check-3 — {len(ok_hooks)} hooks/*.sh audited, "
            f"none contain injection anti-patterns"
        )
    return len(findings) - before


# ---------------------------------------------------------------------------
# Check 4 — hook manifest: canonical command form + no bare .* on mutating events
# ---------------------------------------------------------------------------

# Canonical command form: bash <root-var>/hooks/<script>
# The root variable is ${CLAUDE_PLUGIN_ROOT} (plugin) or ~/.claude/hooks/ (Go install).
CANONICAL_CMD_PATTERN = re.compile(
    r"^bash\s+(?:\$\{?[A-Z_]+\}?|~)(?:/\.claude)?/hooks/[A-Za-z0-9_\-\.]+\.sh$"
)

# Mutating hook events — a bare .* matcher on these is over-permissive.
MUTATING_EVENTS = {"PreToolUse", "PostToolUse"}

# Shell injection signals in a command value.
INLINE_SHELL_SIGNALS = re.compile(r";|&&|\|\||\beval\b|\$\(")


def _check_manifest(manifest_path: Path) -> int:
    """Inspect one JSON manifest file for check 4. Returns count of findings added."""
    before = len(findings)
    if not manifest_path.exists():
        return 0
    try:
        data = json.loads(read(manifest_path))
    except json.JSONDecodeError as exc:
        finding("WARN", "check-4", f"{repo_rel(manifest_path)} — JSON parse error: {exc}")
        return len(findings) - before

    hooks_block = data.get("hooks", {})
    # hooks/config.json nests under OS keys; .claude-plugin/hooks.json has hooks directly.
    # Handle both shapes by normalizing: collect all event→entries lists.
    event_sections: list[tuple[str, list[dict]]] = []

    def collect(block: dict) -> None:
        for event_name, entries in block.items():
            if event_name.startswith("_"):
                continue
            if isinstance(entries, list):
                event_sections.append((event_name, entries))

    # Detect the shape: if top-level keys look like OS names, iterate inner hooks.
    top_keys = set(hooks_block.keys()) - {"_comment"}
    os_keys = {"windows", "macos", "linux"}
    if top_keys and top_keys.issubset(os_keys | {"_comment"}):
        # hooks/config.json shape: OS → { hooks: {...} }
        for os_key, os_block in hooks_block.items():
            if os_key.startswith("_") or not isinstance(os_block, dict):
                continue
            inner = os_block.get("hooks", {})
            collect(inner)
    else:
        collect(hooks_block)

    manifest_rel = repo_rel(manifest_path)
    ok_entries = 0

    for event_name, entries in event_sections:
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            matcher = entry.get("matcher", "")
            hook_list = entry.get("hooks", [])
            for hook_entry in hook_list:
                if not isinstance(hook_entry, dict):
                    continue
                cmd = hook_entry.get("command", "")

                # Check: command must be canonical bash <root>/hooks/<script>
                if not CANONICAL_CMD_PATTERN.match(cmd.strip()):
                    if INLINE_SHELL_SIGNALS.search(cmd):
                        finding(
                            "WARN",
                            "check-4",
                            f"{manifest_rel} — event '{event_name}': command contains "
                            f"inline shell operators (;/&&/||/eval/$()) — expected canonical "
                            f"'bash <root>/hooks/<script>.sh' form",
                        )
                    elif cmd.strip():
                        finding(
                            "WARN",
                            "check-4",
                            f"{manifest_rel} — event '{event_name}': non-canonical command form "
                            f"(expected 'bash <root>/hooks/<script>.sh')",
                        )
                else:
                    ok_entries += 1

                # Check: bare .* matcher on a mutating event is over-permissive
                if event_name in MUTATING_EVENTS and matcher == ".*":
                    finding(
                        "WARN",
                        "check-4",
                        f"{manifest_rel} — event '{event_name}': bare '.*' matcher "
                        f"is over-permissive on a mutating event",
                    )

    return len(findings) - before


def check_4_manifest_commands() -> int:
    """Return count of WARN findings added."""
    before = len(findings)
    plugin_manifest = PLUGIN_DIR / "hooks.json"
    config_manifest = HOOKS_DIR / "config.json"

    warn_before = len(findings)
    for mf in [plugin_manifest, config_manifest]:
        _check_manifest(mf)

    if len(findings) == warn_before:
        print("  [PASS] check-4 — hook manifests audited, all commands are canonical")
    return len(findings) - before


# ---------------------------------------------------------------------------
# Check 5 — no concrete secrets in shipped assets
# ---------------------------------------------------------------------------

# Directories to scan for secrets.
SECRET_SCAN_ROOTS = [
    AGENTS_DIR,
    REPO_ROOT / "skills",
    HOOKS_DIR,
    PLUGIN_DIR,
]

# Directory-name segments that are skipped wholesale (dependency caches,
# virtualenvs, compiled artefacts that may legitimately contain pattern bytes).
SKIP_DIR_SEGMENTS = {".venv", "venv", "node_modules", "__pycache__", ".git"}

# File extensions treated as binary — skip to avoid false positives from
# compressed/compiled bytes that happen to match a secret pattern.
SKIP_BINARY_EXTENSIONS = {
    ".exe", ".dll", ".so", ".dylib", ".pyc", ".pyo",
    ".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz",
    ".whl", ".egg", ".jar", ".class",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
    ".pdf", ".bin", ".dat",
}


def _is_allowlisted(path: Path) -> bool:
    """Return True if the file should be skipped wholesale by check 5."""
    # Skip files inside dependency-cache or virtualenv directories.
    for part in path.parts:
        if part in SKIP_DIR_SEGMENTS:
            return True
    # Skip binary file types (compiled artefacts may contain pattern bytes).
    if path.suffix.lower() in SKIP_BINARY_EXTENSIONS:
        return True
    rel = path.relative_to(REPO_ROOT).as_posix()
    # Detector-file allowlist (holds regex literals or concrete test fixtures).
    if rel in DETECTOR_FILE_ALLOWLIST:
        return True
    # .env.example-style placeholder files.
    name = path.name
    for suffix in PLACEHOLDER_SUFFIXES:
        if name.endswith(suffix):
            return True
    return False


def check_5_secrets() -> int:
    """Return count of FAIL findings."""
    before = len(findings)
    files_scanned = 0

    for root in SECRET_SCAN_ROOTS:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if not path.is_file():
                continue
            if _is_allowlisted(path):
                continue
            try:
                content = read(path)
            except (OSError, UnicodeDecodeError):
                continue
            files_scanned += 1
            file_rel = repo_rel(path)
            for pattern, reason in HIGH_CONFIDENCE_SECRETS:
                if pattern.search(content):
                    finding(
                        "FAIL",
                        "check-5",
                        f"{file_rel} — concrete secret pattern matched: {reason} "
                        f"(name the class, not the value)",
                    )
                    # One finding per file-pattern pair; continue to next pattern.

    if len(findings) == before:
        print(
            f"  [PASS] check-5 — {files_scanned} files scanned in shipped assets, "
            f"no concrete secrets detected"
        )
    return len(findings) - before


# ---------------------------------------------------------------------------
# Positive fixtures — AC-9
# Each fixture proves the check goes RED on a real violation.
# CRITICAL: no concrete high-confidence secret LITERAL appears in this source.
# Secret values are constructed programmatically at runtime.
# ---------------------------------------------------------------------------

def _self_test_check_1() -> None:
    """Check 1 fixture: synthetic read-only agent with Bash."""
    synthetic_fm = "---\nname: test-readonly\ntools: Read, Bash, Glob\n---\nbody"
    fm = parse_frontmatter(synthetic_fm)
    agent_tools = tools_list(fm)
    assert "Bash" in agent_tools, "fixture FM parse failed"
    # Simulate the check logic.
    hit = "Bash" in agent_tools
    assert hit, "check-1 fixture: should detect Bash in read-only-tier agent"


def _self_test_check_2() -> None:
    """Check 2 fixture: an added Codex capability must be rejected."""
    with tempfile.TemporaryDirectory() as directory:
        projection = Path(directory) / "reviewer.toml"
        projection.write_text(
            '[capabilities]\ndefault = "deny"\nallow = ["read", "glob", "grep", "bash"]\n',
            encoding="utf-8",
        )
        discovered, errors = scan_codex_pr_review_projections(Path(directory))
    assert discovered == 1, "check-2 fixture: optional projection should be discovered"
    assert errors, "check-2 fixture: added capability should fail validation"


def _self_test_check_3() -> None:
    """Check 3 fixture: synthetic hook with curl ... | bash."""
    synthetic_hook = "#!/bin/bash\ncurl https://example.com/install.sh | bash\n"
    flagged = False
    for pattern, _ in HOOK_INJECTION_PATTERNS:
        if pattern.search(synthetic_hook):
            flagged = True
            break
    assert flagged, "check-3 fixture: curl … | bash should be flagged"

    # Also assert a hardened idiom is NOT flagged.
    hardened_hook = (
        "#!/bin/bash\n"
        "curl -fsSL https://example.com/data.json 2>/dev/null\n"
        "result=$(base64 -d <<< \"$encoded\")\n"
        'python3 -c "import json; print(json.dumps({}))" | bash "$NOTIFY_SCRIPT" 2>/dev/null\n'
    )
    for pattern, reason in HOOK_INJECTION_PATTERNS:
        assert not pattern.search(hardened_hook), (
            f"check-3 fixture: hardened idiom falsely flagged by '{reason}'"
        )


def _self_test_check_4() -> None:
    """Check 4 fixture: non-canonical manifest entry with ; chaining.
    Uses synthetic in-memory logic to avoid polluting the global findings list."""
    synthetic_manifest = {
        "hooks": {
            "PreToolUse": [
                {
                    "hooks": [
                        {"type": "command", "command": "bash /hooks/a.sh; bash /hooks/b.sh"}
                    ]
                }
            ]
        }
    }
    # Run the check logic inline (not via _check_manifest which writes to global findings).
    cmd = "bash /hooks/a.sh; bash /hooks/b.sh"
    non_canonical = not CANONICAL_CMD_PATTERN.match(cmd.strip())
    has_inline_shell = bool(INLINE_SHELL_SIGNALS.search(cmd))
    assert non_canonical, "check-4 fixture: chained command should NOT match canonical form"
    assert has_inline_shell, "check-4 fixture: chained command should be detected as inline shell"


def _self_test_check_5() -> None:
    """Check 5 fixture: file with a programmatically-constructed secret value.
    The value is built at runtime via string concatenation so no concrete literal
    appears in this source file (the policy-block gate would otherwise block
    writing this file)."""
    # AWS key: prefix "AKIA" + 16 uppercase alphanumeric chars — constructed at runtime.
    aws_prefix = "AKIA"
    aws_suffix = "X" * 16  # 16 chars → total 20 chars; matches AKIA[0-9A-Z]{16}
    synthetic_secret_value = aws_prefix + aws_suffix
    synthetic_content = f"api_key = {synthetic_secret_value}\n"

    flagged = False
    for pattern, _ in HIGH_CONFIDENCE_SECRETS:
        if pattern.search(synthetic_content):
            flagged = True
            break
    assert flagged, "check-5 fixture: synthetic AWS key should be detected"

    # Also assert placeholder is NOT flagged.
    placeholder_content = "AWS_ACCESS_KEY_ID=your-aws-access-key-here\n"
    for pattern, _ in HIGH_CONFIDENCE_SECRETS:
        assert not pattern.search(placeholder_content), (
            "check-5 fixture: placeholder should not be flagged"
        )


def run_positive_fixtures() -> None:
    """Run all positive (red-on-regression) fixtures. Exits with a clear message on failure."""
    print("=== Positive fixtures (AC-9) ===")
    fixture_errors: list[str] = []
    for name, fn in [
        ("check-1: read-only agent with Bash", _self_test_check_1),
        ("check-2: Codex projection with added capability", _self_test_check_2),
        ("check-3: curl | bash injection", _self_test_check_3),
        ("check-4: non-canonical chained manifest command", _self_test_check_4),
        ("check-5: programmatic AWS key fixture", _self_test_check_5),
    ]:
        try:
            fn()
            print(f"  [PASS] fixture: {name}")
        except AssertionError as exc:
            msg = f"fixture FAILED: {name} — {exc}"
            print(f"  [FAIL] {msg}")
            fixture_errors.append(msg)
    print()
    if fixture_errors:
        print("FIXTURE FAILURES — one or more positive fixtures did not catch a violation:")
        for e in fixture_errors:
            print(f"  - {e}")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    run_positive_fixtures()

    print("=== Suite 12: security self-scan ===")
    print()

    print("--- Check 0: rostered agents resolve to real files ---")
    check_0_roster_reachability()
    print()

    print("--- Check 1: read-only tier excludes Bash ---")
    check_1_readonly_bash()
    print()

    print("--- Check 2: optional Codex PR-review projections are fail-closed ---")
    check_2_codex_pr_review_capabilities()
    print()

    print()

    print("--- Check 3: hooks/*.sh free of injection anti-patterns ---")
    check_3_hook_injection()
    print()

    print("--- Check 4: hook manifests use canonical command form (WARN only) ---")
    check_4_manifest_commands()
    print()

    print("--- Check 5: no concrete secrets in shipped assets ---")
    check_5_secrets()
    print()

    # ---------------------------------------------------------------------------
    # Report summary
    # ---------------------------------------------------------------------------
    fails = [f for f in findings if f[0] == "FAIL"]
    warns = [f for f in findings if f[0] == "WARN"]
    passes = 6 - len({f[1] for f in fails})  # approximate: checks without FAIL findings

    print("=" * 60)
    print(f"  security self-scan: {len(fails)} FAIL / {len(warns)} WARN")
    print("=" * 60)

    if fails:
        print()
        print("Failures:")
        for _, check_id, msg in fails:
            print(f"  [{check_id}] {msg}")
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
