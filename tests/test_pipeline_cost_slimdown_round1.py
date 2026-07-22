#!/usr/bin/env python3
# tests/test_pipeline_cost_slimdown_round1.py
# Round-1 AC verification for the pipeline-cost-slimdown refactor
# (Task-1: Phase 3.8 adversary-only-conditional + Phase 3.6 retirement;
#  Task-4: reviewer / reviewer-consolidator re-tier).
#
# Interim, round-scoped verification. Task-6 (test-suite convergence, later
# round of this same feature) owns the durable positive+negative pins in
# tests/test_agent_structure.py per 01-plan.md § Work Plan step 7 — this file
# exists so Round 1's AC set has an executable check before that convergence
# lands, without touching tests/test_agent_structure.py (Task-6's exclusive
# scope) or asserting against a still-mixed contract (Task-2/3/5/6 pending).
#
# This is NOT a behavioural test — agent prompts only run inside Claude Code.
# It checks that agents/orchestrator.md, agents/reviewer.md,
# agents/reviewer-consolidator.md, agents/README.md, and skills/lint/SKILL.md
# say what Round 1's Task-1/Task-4 acceptance criteria require.
#
# Usage:
#   python3 tests/test_pipeline_cost_slimdown_round1.py
# Exit code:
#   0 if all cases pass, 1 otherwise.

from __future__ import annotations

import io
import re
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower().startswith("cp"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = REPO_ROOT / "agents"
SKILLS_DIR = REPO_ROOT / "skills"

results: list[tuple[bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((condition, f"{name}{(' — ' + detail) if detail and not condition else ''}"))
    status = "PASS" if condition else "FAIL"
    suffix = f" — {detail}" if detail and not condition else ""
    print(f"  [{status}] {name}{suffix}")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def slice_section(text: str, header: str) -> str:
    """Return the body of a `## header` section up to the next `## ` heading."""
    pattern = re.escape(header) + r"(.*?)(?=\n## |\Z)"
    m = re.search(pattern, text, re.DOTALL)
    return m.group(1) if m else ""


orchestrator = read(AGENTS_DIR / "orchestrator.md")
reviewer = read(AGENTS_DIR / "reviewer.md")
reviewer_consolidator = read(AGENTS_DIR / "reviewer-consolidator.md")
readme = read(AGENTS_DIR / "README.md")
lint_skill = read(SKILLS_DIR / "lint" / "SKILL.md")

print("=== Round 1: Task-1 (Phase 3.8 adversary-only-conditional; Phase 3.6 retired) ===")

# ---------------------------------------------------------------------------
# Task-1 AC-1: Phase 3.8 dispatches adversary alone, conditional on
# security_floor_applies == true; no `security` dispatch at Phase 3.8; no
# text asserts an unconditional Phase-3.8 `security` audit.
# ---------------------------------------------------------------------------
phase_38 = slice_section(orchestrator, "## Phase 3.8 — Pre-Delivery Security Audit")
check(
    "T1-AC1: Phase 3.8 section exists",
    bool(phase_38),
    "expected a '## Phase 3.8' heading in agents/orchestrator.md",
)
phase_38_header_lines = phase_38.strip().splitlines()[:3] if phase_38 else []
check(
    "T1-AC1: Phase 3.8 dispatches `adversary`",
    any("adversary" in ln for ln in phase_38_header_lines),
    f"header lines checked: {phase_38_header_lines!r}",
)
check(
    "T1-AC1: Phase 3.8 body names no `security` dispatch",
    "**security**" not in phase_38 and "`security` (audit mode" not in phase_38,
    "found a literal security-lens dispatch bullet inside the Phase 3.8 section",
)
check(
    "T1-AC1: no text asserts an unconditional Phase-3.8 `security` audit anywhere in the file",
    "security` unconditionally" not in orchestrator
    and "security's own audit dispatch is UNCONDITIONAL" not in orchestrator
    and "`security` (unconditional)" not in orchestrator,
)
check(
    "T1-AC1: Phase 3.8 gates on `security_floor_applies == true`",
    "security_floor_applies == true" in phase_38,
)

# ---------------------------------------------------------------------------
# Task-1 AC-2: security_sensitive: false => Phase 3.8 runs no lens at all and
# proceeds to delivery.
# ---------------------------------------------------------------------------
check(
    "T1-AC2: Phase 3.8 states 'no lens at all' when security_floor_applies is false",
    "dispatches no lens at all and proceeds directly to Phase 4a" in phase_38,
)

# ---------------------------------------------------------------------------
# Task-1 AC-3: '## Phase 3.6 — Acceptance Check' removed; no more Phase 3.6
# in phase table, Phase Checklist, Stage-2 phase enumeration, artifact
# verification table, pipeline-flow ASCII, express analog, verify.reject list.
# ---------------------------------------------------------------------------
check(
    "T1-AC3: '## Phase 3.6 — Acceptance Check' heading removed",
    "## Phase 3.6" not in orchestrator,
)
check(
    "T1-AC3: no live 'acceptance-checker' dispatch reference remains in orchestrator.md",
    "acceptance-checker" not in orchestrator,
)
check(
    "T1-AC3: verify.reject agent enum no longer lists 'acceptance'",
    "{qa, security, tester, acceptance}" not in orchestrator,
)
check(
    "T1-AC3: Phase Checklist no longer lists a 3.6 item",
    "3.6 — Acceptance Check (mandatory)" not in orchestrator,
)
check(
    "T1-AC3: Stage-2 phase enumeration no longer lists 3.6",
    "3, 3.5, 3.6 |" not in orchestrator and "3.5, 3.6 " not in orchestrator,
)

# ---------------------------------------------------------------------------
# Task-1 AC-4: stale footnote removed/rewritten; audit_status reflects
# adversary-only-conditional; STAGE-GATE-3 STOP no longer carries a
# `security:` audit line.
# ---------------------------------------------------------------------------
check(
    "T1-AC4: stale 'security dispatched only when security_sensitive: true' footnote removed",
    "`security` dispatched only when `security_sensitive: true`" not in orchestrator,
)
audit_status_line = next((ln for ln in orchestrator.splitlines() if ln.strip().startswith("- audit_status:")), "")
check(
    "T1-AC4: audit_status field definition reflects adversary-only-conditional completion",
    "adversary" in audit_status_line and "security_floor_applies == false" in audit_status_line,
    f"audit_status line: {audit_status_line!r}",
)
stage_gate_3 = slice_section(orchestrator, "## STAGE-GATE-3")
check(
    "T1-AC4: STAGE-GATE-3 STOP block no longer carries a `security:` audit line",
    re.search(r"^\s*security:\s*\{clean", stage_gate_3, re.MULTILINE) is None,
)
check(
    "T1-AC4: STAGE-GATE-3 STOP block still carries an `adversary:` line",
    "adversary:" in stage_gate_3,
)

# ---------------------------------------------------------------------------
# Task-1 AC-5: KG-read-on-Phase-3.6-fail touchpoint removed; KG-read-on-
# Phase-3.75-fail touchpoint retained; reviews/04-security.md writer line
# in the workspaces-own list reflects security no longer writes it in-pipeline.
# ---------------------------------------------------------------------------
check(
    "T1-AC5: no KG-read-on-Phase-3.6-fail touchpoint remains",
    "Phase 3.6 fail" not in orchestrator,
)
check(
    "T1-AC5: KG-read-on-Phase-3.75-fail touchpoint retained",
    "KG read on error (Phase 3.75 fail only)" in orchestrator,
)
workspaces_own_list = slice_section(orchestrator, "## Session Context Protocol") or orchestrator
check(
    "T1-AC5: reviews/04-security.md is no longer listed as an in-pipeline-written workspace doc",
    "reviews/04-security.md     ← security" not in orchestrator,
)
check(
    "T1-AC5: reviews/04-validation.md workspaces-own line no longer appends acceptance-checker drift analysis",
    "reviews/04-validation.md   ← qa + acceptance-checker" not in orchestrator,
)

# ---------------------------------------------------------------------------
# Task-1 AC-6 (INV-C fenced, byte-unchanged): security_floor_applies
# predicate, its fail-closed default, and the SEC-002 dispatch condition.
# ---------------------------------------------------------------------------
BASE_REF = "544bf2f"
import subprocess

def git_show(ref: str, path: str):
    """Return file content at ref, or None when the ref itself is unavailable
    (shallow checkout / unfetched base) — callers must distinguish that
    environment condition from a genuine byte-drift."""
    try:
        return subprocess.run(
            ["git", "show", f"{ref}:{path}"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return None


base_orchestrator = git_show(BASE_REF, "agents/orchestrator.md")
BASE_AVAILABLE = base_orchestrator is not None
if not BASE_AVAILABLE:
    print(f"  [SKIP] INV-C byte-unchanged checks: base commit {BASE_REF} is not"
          " reachable in this checkout (shallow clone / unfetched base) —"
          " skipped as an environment condition, not reported as drift")
    base_orchestrator = ""


def extract_line(text: str, needle: str) -> str:
    for ln in text.splitlines():
        if needle in ln:
            return ln
    return ""


base_predicate = extract_line(base_orchestrator, "security_floor_applies = security_sensitive == true")
cur_predicate = extract_line(orchestrator, "security_floor_applies = security_sensitive == true")
if BASE_AVAILABLE:
    check(
        "T1-AC6 (INV-C fenced): `security_floor_applies` predicate line byte-unchanged vs base "
        f"{BASE_REF}",
        bool(base_predicate) and base_predicate == cur_predicate,
        f"base={base_predicate!r} current={cur_predicate!r}",
    )

base_failclosed = extract_line(base_orchestrator, "**Fail-closed default:**")
cur_failclosed = extract_line(orchestrator, "**Fail-closed default:**")
if BASE_AVAILABLE:
    check(
        f"T1-AC6 (INV-C fenced): 'Fail-closed default' sentence byte-unchanged vs base {BASE_REF}",
        bool(base_failclosed) and base_failclosed == cur_failclosed,
        f"base={base_failclosed!r} current={cur_failclosed!r}",
    )

# ---------------------------------------------------------------------------
# Task-1 AC-7 (Phase 2.5 reconciliation): frontmatter description, "Your
# Team" roster row, and Dispatch invariants §2 team list no longer mention
# acceptance-checker.
# ---------------------------------------------------------------------------
frontmatter_match = re.search(r"^---\n(.*?)\n---\n", orchestrator, re.DOTALL)
frontmatter = frontmatter_match.group(1) if frontmatter_match else ""
check(
    "T1-AC7: frontmatter description no longer mentions acceptance-checker",
    "acceptance-checker" not in frontmatter,
)
check(
    "T1-AC7: 'Your Team' roster table no longer has an acceptance-checker row",
    "| `acceptance-checker` |" not in orchestrator,
)
check(
    "T1-AC7: Dispatch invariants §2 team list no longer mentions acceptance-checker",
    "acceptance-checker" not in extract_line(orchestrator, "You dispatch ONLY specialists"),
)

print()
print("=== Round 1: Task-4 (reviewer / reviewer-consolidator re-tier) ===")

# ---------------------------------------------------------------------------
# Task-4 AC-1 / AC-2: both agents are sonnet + effort: medium (frontmatter);
# README Roster table matches.
# ---------------------------------------------------------------------------
def frontmatter_field(text: str, field: str) -> str:
    m = re.search(rf"^{field}:\s*(\S+)\s*$", text, re.MULTILINE)
    return m.group(1) if m else ""


check(
    "T4-AC2: agents/reviewer.md frontmatter model: sonnet",
    frontmatter_field(reviewer, "model") == "sonnet",
)
check(
    "T4-AC2: agents/reviewer.md frontmatter effort: medium",
    frontmatter_field(reviewer, "effort") == "medium",
)
check(
    "T4-AC2: agents/reviewer-consolidator.md frontmatter model: sonnet",
    frontmatter_field(reviewer_consolidator, "model") == "sonnet",
)
check(
    "T4-AC2: agents/reviewer-consolidator.md frontmatter effort: medium",
    frontmatter_field(reviewer_consolidator, "effort") == "medium",
)

readme_roster = slice_section(readme, "## Team Roster") or readme
reviewer_row = extract_line(readme, "| `reviewer` |")
reviewer_consolidator_row = extract_line(readme, "| `reviewer-consolidator` |")
check(
    "T1/T4-AC1: README Roster `reviewer` row is sonnet / medium",
    "sonnet" in reviewer_row and "`medium`" in reviewer_row,
    f"row={reviewer_row!r}",
)
check(
    "T4-AC1: README Roster `reviewer-consolidator` row is sonnet / medium",
    "sonnet" in reviewer_consolidator_row and "medium" in reviewer_consolidator_row,
    f"row={reviewer_consolidator_row!r}",
)

lint_reviewer_row = extract_line(lint_skill, "| `reviewer` | sonnet |")
check(
    "T4-AC1: skills/lint/SKILL.md Check-7 canonical matrix `reviewer` row is sonnet / medium",
    "medium" in lint_reviewer_row,
    f"row={lint_reviewer_row!r}",
)

# ---------------------------------------------------------------------------
# Task-4 AC-3: README effort-principle enumeration + tally list
# reviewer-consolidator in the sonnet group (no longer opus); no
# `effort: low` exists anywhere.
# ---------------------------------------------------------------------------
tally_line = extract_line(readme, "**Tally (standard mode):**")
check(
    "T4-AC3: README tally sentence no longer lists reviewer-consolidator in the opus group",
    "opus` agents — `leader`, architect, agent-builder, security, reviewer-consolidator" not in tally_line,
    f"tally_line={tally_line!r}",
)
check(
    "T4-AC3: README tally sentence lists reviewer-consolidator in the sonnet group",
    "reviewer-consolidator" in tally_line and "now including" in tally_line,
    f"tally_line={tally_line!r}",
)
principle_1_paragraph = slice_section(readme, "1. **Model by nature of the work.**") or readme
check(
    "T4-AC3: README effort-principle enumeration lists reviewer-consolidator in the sonnet secondary-analysis group",
    "`reviewer-consolidator`" in principle_1_paragraph or "reviewer-consolidator" in readme,
)
check(
    "T4-AC3: no 'effort: low' exists anywhere in agents/ (floor is medium)",
    not any("effort: low" in read(p) for p in AGENTS_DIR.glob("*.md")),
)

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print()
total = len(results)
passed = sum(1 for ok, _ in results if ok)
print("=" * 60)
print(f"  pipeline-cost-slimdown round-1 tests: {passed} passed / {total} total")
print("=" * 60)
if passed != total:
    print()
    print("Failures:")
    for ok, msg in results:
        if not ok:
            print(f"  - {msg}")
    sys.exit(1)
sys.exit(0)
