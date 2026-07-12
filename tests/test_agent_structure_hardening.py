#!/usr/bin/env python3
# tests/test_agent_structure_hardening.py
# Suite 85 structural checks — hook-gates-hardening (Phase 2.0, issue #304)
#
# SPEC-ASSERTING structural regression tests for issue #304 findings:
#   F-008  hooks.json: ClickUp MCP PreToolUse matcher present (the marketplace
#          plugin is the only CC wiring path since the hook Bash->TS cutover,
#          issue #446 — hooks/config.json, the Go installer's retired CC
#          wiring template, is not part of this check anymore)
#   F-038  skill/orchestrator invocations: sketch-guard resolution chain (not bare repo-relative)
#   F-009  recover predicate: decision-allowlist tokens + per-gate release fields
#   A1     setup + update SKILL.md: guided python3 install probe block present
#   Lint   skills/lint/SKILL.md: Check 8 hook runtime health sub-reports present
#
# ANTI-FALSE-GREEN: every check FAILS on current main (pre-fix tree @ fad06ea).
# Each check is anchor-scoped or uniquely token-scoped to prevent false-greens.
#
# Usage:
#   python3 tests/test_agent_structure_hardening.py
# Exit code:
#   0 if all checks pass, 1 otherwise.

from __future__ import annotations

import io
import json
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower().startswith("cp"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = REPO_ROOT / "agents"
SKILLS_DIR = REPO_ROOT / "skills"
HOOKS_DIR = REPO_ROOT / "hooks"
PLUGIN_DIR = REPO_ROOT / ".claude-plugin"
DOCS_DIR = REPO_ROOT / "docs"

results: list[tuple[bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((condition, f"{name}{(' — ' + detail) if detail and not condition else ''}"))
    status = "PASS" if condition else "FAIL"
    suffix = f" — {detail}" if detail and not condition else ""
    print(f"  [{status}] {name}{suffix}")


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def skill_path(name: str) -> Path:
    sub = SKILLS_DIR / name / "SKILL.md"
    if sub.exists():
        return sub
    return SKILLS_DIR / f"{name}.md"


def _slice_section(text: str, anchor: str) -> str:
    """Return text from anchor (inclusive) to the next markdown heading or EOF.
    Returns '' if anchor not found."""
    import re
    idx = text.find(anchor)
    if idx == -1:
        return ""
    rest = text[idx:]
    m = re.search(r"\n(?:#{1,6}) ", rest[1:])
    if m:
        return rest[: m.start() + 1]
    return rest


# ---------------------------------------------------------------------------
# File reads
# ---------------------------------------------------------------------------
_hooks_json_text = read(PLUGIN_DIR / "hooks.json")
_orchestrator_text = read(AGENTS_DIR / "orquestador.md")
_recover_skill_text = read(skill_path("recover"))
_setup_skill_text = read(skill_path("setup"))
_update_skill_text = read(skill_path("update"))
_lint_skill_text = read(skill_path("lint"))
_deliver_skill_text = read(skill_path("deliver"))
_validate_skill_text = read(skill_path("validate"))
_review_pr_skill_text = read(skill_path("review-pr"))
_testing_md_text = read(DOCS_DIR / "testing.md")
_self_text = Path(__file__).read_text(encoding="utf-8")

# Parse hooks.json for structured access
try:
    _hooks_json_parsed = json.loads(_hooks_json_text)
except (json.JSONDecodeError, ValueError):
    _hooks_json_parsed = {}

# ---------------------------------------------------------------------------
# Helper: collect all PreToolUse matcher strings from a parsed hooks JSON
# ---------------------------------------------------------------------------
def get_pretooluse_matchers(parsed: dict) -> list[str]:
    """Extract all 'matcher' values from PreToolUse entries in a hooks JSON structure."""
    matchers: list[str] = []
    hooks_block = parsed.get("hooks", {})
    ptu_entries = hooks_block.get("PreToolUse", [])
    for entry in ptu_entries:
        m = entry.get("matcher", "")
        if m:
            matchers.append(m)
    return matchers


# ---------------------------------------------------------------------------
# ============================================================================
# F-008: ClickUp MCP PreToolUse matcher
# SPEC: .claude-plugin/hooks.json (the sole CC wiring path post-cutover) must
# contain a PreToolUse entry whose matcher covers
# mcp__<anyserver>__clickup_(update_task|create_task|...) tool calls.
# The matcher must NOT hard-code the server segment (uses mcp__.*__clickup_…).
# ============================================================================
print()
print("=== Suite 85-F008: ClickUp MCP PreToolUse matcher wiring ===")

# Check F008-1: hooks.json contains a matcher covering ClickUp MCP tools
# The matcher must use .* or similar to avoid hard-coding the server segment.
# Expected pattern: something like "mcp__.*__clickup_" or similar wildcard form.
_hooks_json_matchers = get_pretooluse_matchers(_hooks_json_parsed)

_clickup_matcher_in_hooks_json = any(
    "clickup" in m for m in _hooks_json_matchers
)
check(
    "F008-1: .claude-plugin/hooks.json PreToolUse entries contain a ClickUp MCP matcher",
    _clickup_matcher_in_hooks_json,
    f"No matcher containing 'clickup' found in PreToolUse entries of hooks.json;"
    f" found matchers: {_hooks_json_matchers!r};"
    " implementer must add a PreToolUse entry with matcher covering ClickUp MCP writes"
    " (mcp__.*__clickup_update_task etc.)",
)

# Check F008-2: the ClickUp matcher in hooks.json does NOT hard-code a server segment
# (must use .* or similar wildcard in the server portion)
# We verify it contains ".*" or at least "mcp__" + wildcard — not a fixed server name.
_clickup_matchers_in_hooks = [m for m in _hooks_json_matchers if "clickup" in m]
_clickup_matcher_no_hardcode = all(
    (".*" in m or "__.*__" in m or "mcp__.*__" in m)
    for m in _clickup_matchers_in_hooks
) if _clickup_matchers_in_hooks else False

check(
    "F008-2: ClickUp matcher in hooks.json does not hard-code the MCP server segment"
    " (uses wildcard .* instead of a fixed server name)",
    _clickup_matcher_no_hardcode,
    f"ClickUp matchers found: {_clickup_matchers_in_hooks!r};"
    " the server segment must be a wildcard (e.g. mcp__.*__clickup_…)"
    " — hard-coding the server segment breaks on any non-standard MCP registration",
)

# F008-3/4/5 RETIRED at the hook Bash->TS cutover (issue #446): they asserted
# per-OS ClickUp matcher wiring in hooks/config.json, the Go installer's CC
# wiring template. That file was deleted along with the installer's CC path —
# the marketplace plugin's .claude-plugin/hooks.json (F008-1/2 above) is now
# the ONLY CC wiring path, so the per-OS check has no successor to preserve.
check(
    "F008-3/4/5: hooks/config.json retired (Go installer CC path removed) — no file references it",
    not (HOOKS_DIR / "config.json").exists(),
    "hooks/config.json still exists — the Go installer's CC wiring template should have been deleted",
)


# ---------------------------------------------------------------------------
# ============================================================================
# F-038: sketch-guard invocation resolution chain
# SPEC: the four invocation sites (deliver, validate, review-pr, orchestrator)
# must no longer use a bare repo-relative 'bash hooks/sketch-guard.sh' path.
# They must carry the documented resolution chain:
#   1. plugin-cache path  (plugin installs)
#   2. ~/.claude/hooks/   (Go-installer installs)
#   3. ./hooks/           (repo clone)
# When unresolvable: emit a visible 'sketch-guard probe unavailable' line
# (never a silent 2>/dev/null no-op).
# PRE-FIX STATE: all four sites use bare 'bash hooks/sketch-guard.sh' which
# is dead on plugin installs (no ./hooks/ in CWD).
# ============================================================================
print()
print("=== Suite 85-F038: sketch-guard fail-visible resolution chain ===")

# Check F038-1: skills/deliver/SKILL.md does NOT contain bare 'bash hooks/sketch-guard.sh'
# (without any fallback resolution chain)
_bare_sketch_pattern = "bash hooks/sketch-guard.sh"

check(
    "F038-1: skills/deliver/SKILL.md does not contain bare 'bash hooks/sketch-guard.sh'"
    " (must use resolution chain, not repo-relative path)",
    _bare_sketch_pattern not in _deliver_skill_text,
    f"deliver/SKILL.md still contains bare repo-relative invocation '{_bare_sketch_pattern}';"
    " implementer must replace with the 3-tier resolution chain"
    " (plugin-cache -> ~/.claude/hooks/ -> ./hooks/sketch-guard.sh)",
)

# Check F038-2: skills/validate/SKILL.md does NOT contain bare path
check(
    "F038-2: skills/validate/SKILL.md does not contain bare 'bash hooks/sketch-guard.sh'",
    _bare_sketch_pattern not in _validate_skill_text,
    f"validate/SKILL.md still contains bare repo-relative invocation '{_bare_sketch_pattern}'",
)

# Check F038-3: skills/review-pr/SKILL.md does NOT contain bare path
check(
    "F038-3: skills/review-pr/SKILL.md does not contain bare 'bash hooks/sketch-guard.sh'",
    _bare_sketch_pattern not in _review_pr_skill_text,
    f"review-pr/SKILL.md still contains bare repo-relative invocation '{_bare_sketch_pattern}'",
)

# Check F038-4: agents/orchestrator.md does NOT contain bare path
check(
    "F038-4: agents/orchestrator.md does not contain bare 'bash hooks/sketch-guard.sh'",
    _bare_sketch_pattern not in _orchestrator_text,
    f"orchestrator.md still contains bare repo-relative invocation '{_bare_sketch_pattern}'",
)

# Check F038-5: skills/deliver/SKILL.md contains the visible-skip sentinel phrase
# When the script is unresolvable, it must emit a visible line — NOT "skip silently".
# ANTI-FALSE-GREEN: the pre-fix text says "skip this probe silently"; it also mentions
# "sketch-guard.sh as a best-effort probe" — both of which contain words like "probe"
# and "sketch-guard" without the required visible-sentinel semantics.
# The required sentinel phrase is "sketch-guard probe unavailable" (plan A2 design):
# this exact phrase is ABSENT pre-fix and PRESENT post-fix — a strict binary gate.
# The negative assertion is: "skip silently" must NOT appear (replaced by visible sentinel).
import re as _re

_deliver_sketch_guard_visible_sentinel = "sketch-guard probe unavailable"
_deliver_sketch_guard_silent_skip = "skip this probe silently"

# F038-5: FAIL pre-fix: visible sentinel absent; "skip silently" present (wrong behavior)
check(
    "F038-5: skills/deliver/SKILL.md contains 'sketch-guard probe unavailable' sentinel"
    " (visible emit when unresolvable, not silent skip)"
    " — exact phrase required (not just 'probe' or 'sketch-guard')",
    _deliver_sketch_guard_visible_sentinel in _deliver_skill_text,
    f"deliver/SKILL.md does not contain exact phrase '{_deliver_sketch_guard_visible_sentinel}';"
    " pre-fix text says 'skip this probe silently' — implementer must replace with"
    " a visible 'sketch-guard probe unavailable — skipping' emit (per plan A2 design)",
)

# F038-5b (negative): "skip this probe silently" must NOT appear post-fix
# Pre-fix: PASSES (current behavior IS silent skip; this negative guard is expected to PASS pre-fix)
# Post-fix: must also PASS (silent skip removed)
check(
    "F038-5b (negative): skills/deliver/SKILL.md does NOT instruct agent to"
    " 'skip this probe silently' — silent skip is the bug being fixed",
    _deliver_sketch_guard_silent_skip not in _deliver_skill_text,
    f"deliver/SKILL.md still contains '{_deliver_sketch_guard_silent_skip}';"
    " the silent skip must be replaced with a visible 'sketch-guard probe unavailable' emit",
)

# Check F038-6: the resolution chain mentions the plugin-cache path
# (the root cause of F-038 is that plugin installs have no ./hooks/ in CWD;
# the fix must resolve from the plugin cache)
_plugin_cache_tokens = ("plugin", "plugins/cache", "CLAUDE_PLUGIN_ROOT", "highest-version")
check(
    "F038-6: skills/deliver/SKILL.md mentions the plugin-cache resolution path"
    " (plugin installs have no ./hooks/ in CWD)",
    any(t in _deliver_skill_text for t in _plugin_cache_tokens),
    f"deliver/SKILL.md does not reference the plugin-cache resolution path;"
    f" tokens checked: {_plugin_cache_tokens!r};"
    " the resolution chain must start with the plugin-cache path"
    " (e.g. ~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/hooks/sketch-guard.sh)",
)


# ---------------------------------------------------------------------------
# ============================================================================
# F-009: recover gate-cleared predicate + Current State schema
# SPEC: the recover predicate in BOTH skills/recover/SKILL.md AND
# agents/orchestrator.md must key on the LAST stage.gate.release decision
# against a per-gate clear-allowlist, NOT merely on event presence.
# Per-gate release fields must be present: gate1_release, gate2_release_last,
# gate3_release (in orchestrator.md schema section).
# PRE-FIX STATE: predicate is event-presence only ("stage.gate.release event
# is present") with no decision-allowlist; the three per-gate fields are absent.
# Suite 48 currently passes on the flawed predicate — these new checks extend
# Suite 48 with the additional tokens mandated by the hardening plan.
# ============================================================================
print()
print("=== Suite 85-F009: recover gate-cleared predicate — decision-allowlist ===")

# Anchor the recover safety section in SKILL.md
_S85_RECOVER_SAFETY_ANCHOR = "## Recover Safety Rules"
_s85_recover_safety_slice = _slice_section(_recover_skill_text, _S85_RECOVER_SAFETY_ANCHOR)

# Anchor the recovery instructions section in orchestrator.md
_S85_ORCH_RECOVERY_ANCHOR = "## Recovery Instructions"
_s85_orch_recovery_slice = _slice_section(_orchestrator_text, _S85_ORCH_RECOVERY_ANCHOR)

# Anchor the current state schema in orquestador.md
# The schema section is identified by the "## Current State" heading.
# Newline-anchored: orquestador.md's own "Mandatory boot sequence" prose
# cross-references `` `## Current State` `` inline in backticks well before
# the real heading — a bare substring match would lock onto that mention.
_S85_CURRENT_STATE_ANCHOR = "\n## Current State\n"
_s85_orch_current_state_slice = _slice_section(_orchestrator_text, _S85_CURRENT_STATE_ANCHOR)

# Check F009-1: recover/SKILL.md references the decision-allowlist (not just event presence)
# Required tokens: clear-allowlist tokens for each gate
_GATE_CLEAR_ALLOWLIST_TOKENS = ("approved", "approved-autonomous", "next", "ship")

check(
    "F009-1: skills/recover/SKILL.md § Recover Safety Rules contains"
    " gate-clear allowlist decision tokens (approved, approved-autonomous, next, ship)",
    bool(_s85_recover_safety_slice) and all(
        t in _s85_recover_safety_slice for t in _GATE_CLEAR_ALLOWLIST_TOKENS
    ),
    f"anchor '{_S85_RECOVER_SAFETY_ANCHOR}' missing or allowlist tokens absent;"
    f" anchor found: {bool(_s85_recover_safety_slice)};"
    + " ".join(
        f" '{t}': {t in _s85_recover_safety_slice};"
        for t in _GATE_CLEAR_ALLOWLIST_TOKENS
    )
    + " implementer must add decision-allowlist to recover predicate"
    " (approved/approved-autonomous for gate-1, next/next-autonomous for gate-2, ship for gate-3)",
)

# Check F009-2: recover/SKILL.md references the per-gate release field names
# These fields are what the predicate reads to verify gate-cleared status.
_GATE_FIELD_TOKENS = ("gate1_release", "gate2_release_last", "gate3_release")

check(
    "F009-2: skills/recover/SKILL.md § Recover Safety Rules references"
    " per-gate release field names (gate1_release, gate2_release_last, gate3_release)",
    bool(_s85_recover_safety_slice) and all(
        t in _s85_recover_safety_slice for t in _GATE_FIELD_TOKENS
    ),
    f"anchor '{_S85_RECOVER_SAFETY_ANCHOR}' missing or per-gate field names absent;"
    f" anchor found: {bool(_s85_recover_safety_slice)};"
    + " ".join(
        f" '{t}': {t in _s85_recover_safety_slice};"
        for t in _GATE_FIELD_TOKENS
    )
    + " implementer must add per-gate release fields to recover predicate"
    " (these fields are written by the gate handlers and read by the predicate)",
)

# Check F009-3: recover/SKILL.md does NOT clear a gate on 'rejected' or 'edit' decisions
# (current code is decision-blind; the fix must NOT clear on rejected/edit)
_NEGATIVE_DECISIONS = ("rejected", "edit", "stop", "abort")
_s85_recover_full = _recover_skill_text

check(
    "F009-3: skills/recover/SKILL.md documents that 'rejected'/'edit'/'stop'/'abort'"
    " decisions do NOT clear a STAGE-GATE",
    bool(_s85_recover_safety_slice) and any(
        t in _s85_recover_safety_slice for t in _NEGATIVE_DECISIONS
    ),
    f"recover/SKILL.md does not document that negative decisions (rejected/edit/stop/abort)"
    " do NOT clear the gate;"
    " the decision-allowlist must be stated with the failing-case decisions"
    " (any other decision → NOT cleared → re-emit STOP block)",
)

# Check F009-4: orchestrator.md § Recovery Instructions references per-gate allowlist
# orquestador.md's Recovery Instructions now delegates the literal allowlist to the
# single-source `agents/_shared/gate-contract.md` ("per `gate-contract.md`") rather than
# duplicating it inline — check that referenced file too when the pointer is present.
_gate_contract_text = read(REPO_ROOT / "agents" / "_shared" / "gate-contract.md")
_s85_orch_recovery_slice_ext = (
    _s85_orch_recovery_slice + "\n" + _gate_contract_text
    if "gate-contract.md" in _s85_orch_recovery_slice
    else _s85_orch_recovery_slice
)
check(
    "F009-4: agents/orchestrator.md § Recovery Instructions contains"
    " gate-clear allowlist tokens (approved, approved-autonomous, next, ship)",
    bool(_s85_orch_recovery_slice) and all(
        t in _s85_orch_recovery_slice_ext for t in _GATE_CLEAR_ALLOWLIST_TOKENS
    ),
    f"anchor '{_S85_ORCH_RECOVERY_ANCHOR}' missing or allowlist tokens absent in orchestrator;"
    f" anchor found: {bool(_s85_orch_recovery_slice)};"
    + " ".join(
        f" '{t}': {t in _s85_orch_recovery_slice_ext};"
        for t in _GATE_CLEAR_ALLOWLIST_TOKENS
    ),
)

# Check F009-5: orchestrator.md Current State schema defines gate release fields
# The schema section must declare gate1_release, gate2_release_last, gate3_release.
check(
    "F009-5: agents/orchestrator.md § Current State schema defines"
    " per-gate release fields (gate1_release, gate2_release_last, gate3_release)",
    bool(_s85_orch_current_state_slice) and all(
        t in _s85_orch_current_state_slice for t in _GATE_FIELD_TOKENS
    ),
    f"anchor '{_S85_CURRENT_STATE_ANCHOR}' missing or per-gate fields absent in schema;"
    f" anchor found: {bool(_s85_orch_current_state_slice)};"
    + " ".join(
        f" '{t}': {t in _s85_orch_current_state_slice};"
        for t in _GATE_FIELD_TOKENS
    )
    + " implementer must add gate1_release/gate2_release_last/gate3_release to the Current State schema",
)


# ---------------------------------------------------------------------------
# ============================================================================
# A1: Guided python3 install in /th:setup and /th:update (AC-13)
# SPEC: BOTH skills/setup/SKILL.md AND skills/update/SKILL.md must contain:
#   1. A dedicated python3 section (heading anchored to "## python3") with
#      a Y/n consent-gate inside it — never auto-install
#   2. OS-appropriate command literals (winget, brew, apt-get/dnf/pacman)
#      in the python3 section
#   3. Post-install re-probe token (command -v python3) in the python3 section
#   4. Windows PATH caveat (restart the terminal) in the python3 section
#   NEGATIVE: winget install appears AFTER the consent gate (or not at all)
# PRE-FIX STATE: neither file has any python3 probe or install block.
# ANTI-FALSE-GREEN: all checks are anchored to the "## python3" section —
#   setup/update already contain "command -v python3" (plugin update mechanics)
#   and "restart" (plugin reload instructions) for completely unrelated reasons.
#   Global-file matching produces false-greens; section-anchored matching is
#   the only correct oracle.
# ============================================================================
print()
print("=== Suite 85-A1: guided python3 install in setup + update (AC-13) ===")

# Anchor: the implementer must add a "## python3" (or "### python3") section.
# The section heading must start with "python3" so the anchor isolates
# python3-install guidance from plugin-update mechanics elsewhere in the file.
# We try both "## python3" (top-level) and "### python3" (sub-section).
def _find_python3_section(text: str) -> str:
    """Return the text of the python3 install section, or ''."""
    for anchor in ("## python3", "### python3", "## Python 3", "### Python 3"):
        s = _slice_section(text, anchor)
        if s:
            return s
    return ""

_a1_setup_section = _find_python3_section(_setup_skill_text)
_a1_update_section = _find_python3_section(_update_skill_text)

# Check A1-1: setup/SKILL.md contains a dedicated python3 section
# with a Y/n consent-gate inside it
_CONSENT_TOKENS = ("Y/n", "Y/N")
check(
    "A1-1: skills/setup/SKILL.md contains a '## python3' section"
    " with a Y/n consent-gate inside it (never auto-install python3)",
    bool(_a1_setup_section) and any(t in _a1_setup_section for t in _CONSENT_TOKENS),
    f"setup/SKILL.md has no dedicated python3 section (## python3 / ### python3)"
    f" or no Y/n consent-gate within it;"
    f" section found: {bool(_a1_setup_section)};"
    f" tokens checked: {_CONSENT_TOKENS!r};"
    " implementer must add a dedicated python3 section with explicit Y/n prompt"
    " before any install command",
)

# Check A1-2: update/SKILL.md contains a dedicated python3 section
# with a Y/n consent-gate inside it
check(
    "A1-2: skills/update/SKILL.md contains a '## python3' section"
    " with a Y/n consent-gate inside it (never auto-install python3)",
    bool(_a1_update_section) and any(t in _a1_update_section for t in _CONSENT_TOKENS),
    f"update/SKILL.md has no dedicated python3 section or no Y/n consent-gate within it;"
    f" section found: {bool(_a1_update_section)};"
    f" tokens: {_CONSENT_TOKENS!r}",
)

# Check A1-3: setup/SKILL.md python3 section contains Windows install command
_WINGET_TOKEN = "winget install"
check(
    "A1-3: skills/setup/SKILL.md python3 section contains Windows install command"
    " (winget install)",
    bool(_a1_setup_section) and _WINGET_TOKEN in _a1_setup_section,
    f"setup/SKILL.md python3 section missing or does not contain '{_WINGET_TOKEN}';"
    f" section found: {bool(_a1_setup_section)};"
    " the Windows install path must be documented inside the python3 section",
)

# Check A1-4: update/SKILL.md python3 section contains Windows install command
check(
    "A1-4: skills/update/SKILL.md python3 section contains Windows install command"
    " (winget install)",
    bool(_a1_update_section) and _WINGET_TOKEN in _a1_update_section,
    f"update/SKILL.md python3 section missing or does not contain '{_WINGET_TOKEN}'",
)

# Check A1-5: setup/SKILL.md python3 section contains macOS install command
_BREW_TOKEN = "brew install python3"
check(
    "A1-5: skills/setup/SKILL.md python3 section contains macOS install command"
    " (brew install python3)",
    bool(_a1_setup_section) and _BREW_TOKEN in _a1_setup_section,
    f"setup/SKILL.md python3 section missing or does not contain '{_BREW_TOKEN}'",
)

# Check A1-6: update/SKILL.md python3 section contains macOS install command
check(
    "A1-6: skills/update/SKILL.md python3 section contains macOS install command"
    " (brew install python3)",
    bool(_a1_update_section) and _BREW_TOKEN in _a1_update_section,
    f"update/SKILL.md python3 section missing or does not contain '{_BREW_TOKEN}'",
)

# Check A1-7: setup/SKILL.md python3 section contains at least one Linux install command
_LINUX_TOKENS = ("apt-get install", "dnf install", "pacman -S")
check(
    "A1-7: skills/setup/SKILL.md python3 section contains at least one Linux install command"
    " (apt-get/dnf/pacman)",
    bool(_a1_setup_section) and any(t in _a1_setup_section for t in _LINUX_TOKENS),
    f"setup/SKILL.md python3 section missing or does not contain any of {_LINUX_TOKENS!r}",
)

# Check A1-8: update/SKILL.md python3 section contains at least one Linux install command
check(
    "A1-8: skills/update/SKILL.md python3 section contains at least one Linux install command",
    bool(_a1_update_section) and any(t in _a1_update_section for t in _LINUX_TOKENS),
    f"update/SKILL.md python3 section missing or does not contain any of {_LINUX_TOKENS!r}",
)

# Check A1-9: setup/SKILL.md python3 section contains post-install re-probe
# ANTI-FALSE-GREEN: update/SKILL.md already has 'command -v python3' at line 227
# for plugin update mechanics — anchored to the python3 section to avoid false-green.
_REPROBE_TOKENS_SECTION = "command -v python3"
check(
    "A1-9: skills/setup/SKILL.md python3 section contains post-install re-probe"
    " (command -v python3 AFTER the install commands)",
    bool(_a1_setup_section) and _REPROBE_TOKENS_SECTION in _a1_setup_section,
    f"setup/SKILL.md python3 section missing or does not contain '{_REPROBE_TOKENS_SECTION}'",
)

# Check A1-10: update/SKILL.md python3 section contains post-install re-probe
# ANTI-FALSE-GREEN: update/SKILL.md already has 'command -v python3' globally.
check(
    "A1-10: skills/update/SKILL.md python3 section contains post-install re-probe"
    " (command -v python3 INSIDE the python3 install section)",
    bool(_a1_update_section) and _REPROBE_TOKENS_SECTION in _a1_update_section,
    f"update/SKILL.md python3 section missing or does not contain '{_REPROBE_TOKENS_SECTION}';"
    " note: 'command -v python3' already exists globally in update/SKILL.md for other"
    " purposes — this check requires it inside the python3 install section specifically",
)

# Check A1-11: setup/SKILL.md python3 section contains Windows PATH caveat
# ANTI-FALSE-GREEN: update/SKILL.md already mentions 'restart' for plugin reload.
# Use the more specific phrase 'restart the terminal' as the anchor.
_WIN_PATH_CAVEAT_SPECIFIC = "restart the terminal"
check(
    "A1-11: skills/setup/SKILL.md python3 section documents the Windows PATH caveat"
    " ('restart the terminal' when winget-installed python3 not on PATH)",
    bool(_a1_setup_section) and _WIN_PATH_CAVEAT_SPECIFIC in _a1_setup_section,
    f"setup/SKILL.md python3 section missing or does not contain '{_WIN_PATH_CAVEAT_SPECIFIC}';"
    " the Windows PATH-refresh caveat must be inside the python3 section",
)

# Check A1-12: update/SKILL.md python3 section contains Windows PATH caveat
# ANTI-FALSE-GREEN: update/SKILL.md mentions 'restart' globally but not 'restart the terminal'.
check(
    "A1-12: skills/update/SKILL.md python3 section documents the Windows PATH caveat"
    " ('restart the terminal')",
    bool(_a1_update_section) and _WIN_PATH_CAVEAT_SPECIFIC in _a1_update_section,
    f"update/SKILL.md python3 section missing or does not contain '{_WIN_PATH_CAVEAT_SPECIFIC}'",
)

# Check A1-13 (negative): setup/SKILL.md does NOT contain unconditional install outside consent
# Winget must appear ONLY after the Y/n gate or not at all (pre-fix: not at all = pass vacuously).
_setup_winget_pos = _setup_skill_text.find(_WINGET_TOKEN)
_setup_consent_pos = min(
    (_setup_skill_text.find(t) for t in _CONSENT_TOKENS if t in _setup_skill_text),
    default=-1
)
_a1_13_setup_ok = (
    _setup_winget_pos == -1  # not present at all (pre-fix: passes vacuously)
    or (_setup_consent_pos != -1 and _setup_winget_pos > _setup_consent_pos)
)
check(
    "A1-13 (negative): skills/setup/SKILL.md — winget install appears AFTER the Y/n consent"
    " gate, not as an unconditional bare invocation",
    _a1_13_setup_ok,
    f"winget install at position {_setup_winget_pos},"
    f" consent gate at position {_setup_consent_pos};"
    " winget must appear after the consent gate (never unconditional)"
    " — this prevents auto-install without operator approval",
)

# Check A1-14 (negative): update/SKILL.md — same constraint
_update_winget_pos = _update_skill_text.find(_WINGET_TOKEN)
_update_consent_pos = min(
    (_update_skill_text.find(t) for t in _CONSENT_TOKENS if t in _update_skill_text),
    default=-1
)
_a1_14_update_ok = (
    _update_winget_pos == -1
    or (_update_consent_pos != -1 and _update_winget_pos > _update_consent_pos)
)
check(
    "A1-14 (negative): skills/update/SKILL.md — winget install appears AFTER the Y/n consent"
    " gate, not as an unconditional bare invocation",
    _a1_14_update_ok,
    f"winget install at position {_update_winget_pos},"
    f" consent gate at position {_update_consent_pos};"
    " winget must appear after the consent gate",
)


# ---------------------------------------------------------------------------
# ============================================================================
# Lint Check 8 — Hook runtime health sub-reports (AC-10, qa-plan C-4)
# SPEC: skills/lint/SKILL.md must contain a Check 8 (Hook runtime health) that:
#   1. Reports python3 degraded WARN (python3 absent -> policy gate running degraded)
#   2. Reports wired-but-missing hook FAIL (hook wired but not found on disk)
#   3. Reports obsidian checkpoint coverage status
# PRE-FIX STATE: lint/SKILL.md has no Check 8 — none of these sub-reports exist.
# ============================================================================
print()
print("=== Suite 85-Lint-Check8: /th:lint Check 8 hook runtime health sub-reports ===")

# Anchor on "Check 8" in lint/SKILL.md
_LINT_CHECK8_ANCHOR = "Check 8"
_s85_lint_check8_slice = _slice_section(_lint_skill_text, _LINT_CHECK8_ANCHOR)

# Check Lint-1: lint/SKILL.md contains Check 8 section
check(
    "Lint-1: skills/lint/SKILL.md contains a 'Check 8' section (Hook runtime health)",
    _LINT_CHECK8_ANCHOR in _lint_skill_text,
    f"lint/SKILL.md has no '{_LINT_CHECK8_ANCHOR}' section;"
    " implementer must add Check 8 — Hook runtime health"
    " (python3 probe + wired-script-on-disk + obsidian coverage)",
)

# Check Lint-2: Check 8 reports python3 degraded WARN
_PYTHON3_WARN_TOKENS = ("python3", "degraded", "WARN", "policy gate")
check(
    "Lint-2: lint/SKILL.md Check 8 reports python3 absence as WARN"
    " (policy gate running degraded — install python3 for full scan)",
    bool(_s85_lint_check8_slice) and any(
        t in _s85_lint_check8_slice for t in _PYTHON3_WARN_TOKENS
    ),
    f"Check 8 slice missing or lacks python3-degraded WARN sub-report;"
    f" tokens checked: {_PYTHON3_WARN_TOKENS!r};"
    " the sub-report must state 'policy gate running degraded — install python3'",
)

# Check Lint-3: Check 8 reports wired-but-missing hook as FAIL
_WIRED_MISSING_TOKENS = ("wired but not found", "wired-but-missing", "FAIL", "not found on disk", "dead")
check(
    "Lint-3: lint/SKILL.md Check 8 reports a wired-but-missing hook script as FAIL"
    " (hook wired in hooks.json but not found on disk -> gate is dead)",
    bool(_s85_lint_check8_slice) and any(
        t in _s85_lint_check8_slice for t in _WIRED_MISSING_TOKENS
    ),
    f"Check 8 slice missing or lacks wired-but-missing FAIL sub-report;"
    f" tokens checked: {_WIRED_MISSING_TOKENS!r}",
)

# Check Lint-4: Check 8 covers obsidian checkpoint coverage status (qa-plan C-4)
_OBSIDIAN_TOKENS = ("obsidian", "checkpoint", "coverage")
check(
    "Lint-4: lint/SKILL.md Check 8 covers obsidian-mode checkpoint coverage status"
    " (qa-plan C-4: visibility half of F-010/F-038 must be verifiable)",
    bool(_s85_lint_check8_slice) and any(
        t in _s85_lint_check8_slice for t in _OBSIDIAN_TOKENS
    ),
    f"Check 8 slice missing or lacks obsidian coverage sub-report;"
    f" tokens checked: {_OBSIDIAN_TOKENS!r};"
    " the sub-report must state the obsidian-mode checkpoint coverage status",
)


# ---------------------------------------------------------------------------
# ============================================================================
# Self-referential guard and registry
# ============================================================================
print()
print("=== Suite 85: self-referential guard and docs/testing.md registry ===")

# Check self-1: docs/testing.md registers Suite 85 and hook-gates-hardening marker
check(
    "self-1: docs/testing.md registers 'Suite 85' and 'hook-gates-hardening'",
    "Suite 85" in _testing_md_text and "hook-gates-hardening" in _testing_md_text,
    "docs/testing.md must name Suite 85 and 'hook-gates-hardening' marker"
    " — tester must register after authoring",
)

# Check self-2: this file contains 'Suite 85', '_slice_section', and 'hook-gates-hardening'
check(
    "self-2: this file (test_agent_structure_hardening.py) contains 'Suite 85',"
    " '_slice_section', and 'hook-gates-hardening'",
    "Suite 85" in _self_text
    and "_slice_section" in _self_text
    and "hook-gates-hardening" in _self_text,
    "self-referential guard: test file must contain its own suite number + slice function + marker",
)

# Check self-3: CLAUDE.md §11 does NOT contain 'Suite 85' (hygiene contract)
_claude_text = read(REPO_ROOT / "CLAUDE.md")
_claude_s11_start = _claude_text.find("## 11.")
_claude_s11_end   = _claude_text.find("## 12.", _claude_s11_start) if _claude_s11_start != -1 else -1
_claude_s11_slice = (
    _claude_text[_claude_s11_start:_claude_s11_end]
    if _claude_s11_start != -1 and _claude_s11_end != -1
    else (_claude_text[_claude_s11_start:] if _claude_s11_start != -1 else "")
)
check(
    "self-3: CLAUDE.md §11 does NOT contain 'Suite 85' (hygiene: register in docs/testing.md only)",
    "Suite 85" not in _claude_s11_slice,
    "CLAUDE.md §11 must not mention Suite 85 — register only in docs/testing.md"
    " (§11 is a pointer to docs/testing.md, not a per-suite registry)",
)


# Marker: hook-gates-hardening

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print()
total = len(results)
passed = sum(1 for ok, _ in results if ok)
print("=" * 60)
print(f"  Suite 85 structural hardening tests: {passed} passed / {total} total")
print("=" * 60)
if passed != total:
    print()
    print("Failures:")
    for ok, msg in results:
        if not ok:
            print(f"  - {msg}")
    sys.exit(1)
sys.exit(0)
