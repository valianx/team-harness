#!/usr/bin/env python3
# tests/test_pipeline_cost_slimdown_round3.py
# Round-3 AC verification for the pipeline-cost-slimdown refactor
# (Task-5: rewrite the security-floor prose, managed block reconciliation,
#  CLAUDE.md §5/§7.2/§8, agents/architect.md residual-limitation paragraph).
#
# Companion to tests/test_pipeline_cost_slimdown_round1.py (Task-1 + Task-4)
# and tests/test_pipeline_cost_slimdown_round2.py (Task-2 + Task-3). Kept as
# a separate file per the same rationale as Round 2: each round's AC set is
# independently traceable to its own dispatch, and Round 1/2's scripts are
# already closed and passing. Task-6 (later round, same feature) owns the
# durable positive+negative pins in tests/test_agent_structure.py per
# 01-plan.md § Work Plan step 7 — this file does not touch that suite or
# docs/testing.md (Task-6's exclusive scope).
#
# This is NOT a behavioural test — agent prompts/docs only render as prose.
# It checks that docs/dev-mode.md, CLAUDE.md, and agents/architect.md say
# what Task-5's AC-1..6 require, that the fenced (INV-C) dev-mode.md lines
# are byte-unchanged against base 544bf2f, and that the 4-document
# consistency set (dev-mode.md + managed CLAUDE.md block +
# agents/orchestrator.md + agents/adversary.md) carries zero residual
# unconditional-Phase-3.8-security or Phase-3.6 references.
#
# `skills/setup/managed-blocks/orchestrator-dispatch-rule.md` was verified
# unchanged against base 544bf2f (confirmed empty diff) before writing this
# file — per the dispatch instruction, no test is added for that file beyond
# its inclusion as one of the 4 documents in the T5-AC2 consistency check.
#
# Known, out-of-scope observation (not asserted here): CLAUDE.md §7.2's
# illustrative TABLE (Stage 2 row) still lists "Acceptance Gate / Acceptance
# Checker" in its internal-mechanics column — byte-unchanged vs base, and
# NOT part of Task-5 AC-6's scope (AC-6 covers only the illustrative-example
# SENTENCE above the table, and explicitly declares "the surrounding rule
# text and Permitted Exceptions are otherwise unchanged" — the table is
# neither named nor touched). Reported in 03-testing.md as an observation for
# Task-6/operator disposition, not asserted as a failure in this round.
#
# Usage:
#   python3 tests/test_pipeline_cost_slimdown_round3.py
# Exit code:
#   0 if all cases pass, 1 otherwise.

from __future__ import annotations

import io
import re
import subprocess
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower().startswith("cp"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = REPO_ROOT / "agents"
DOCS_DIR = REPO_ROOT / "docs"
SKILLS_DIR = REPO_ROOT / "skills"
CLAUDE_MD = REPO_ROOT / "CLAUDE.md"
BASE_REF = "544bf2f"

results: list[tuple[bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((condition, f"{name}{(' — ' + detail) if detail and not condition else ''}"))
    status = "PASS" if condition else "FAIL"
    suffix = f" — {detail}" if detail and not condition else ""
    print(f"  [{status}] {name}{suffix}")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


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


def slice_section(text: str, header: str, next_header_pattern: str = r"\n## ") -> str:
    """Return the body of a `header` section up to the next section marker."""
    pattern = re.escape(header) + r"(.*?)(?=" + next_header_pattern + r"|\Z)"
    m = re.search(pattern, text, re.DOTALL)
    return m.group(1) if m else ""


def extract_line(text: str, needle: str) -> str:
    for ln in text.splitlines():
        if needle in ln:
            return ln
    return ""


dev_mode = read(DOCS_DIR / "dev-mode.md")
claude_md = read(CLAUDE_MD)
architect = read(AGENTS_DIR / "architect.md")
orchestrator = read(AGENTS_DIR / "orchestrator.md")
adversary = read(AGENTS_DIR / "adversary.md")
managed_block = read(SKILLS_DIR / "setup" / "managed-blocks" / "orchestrator-dispatch-rule.md")

base_dev_mode = git_show(BASE_REF, "docs/dev-mode.md")
base_claude_md = git_show(BASE_REF, "CLAUDE.md")
base_managed_block = git_show(BASE_REF, "skills/setup/managed-blocks/orchestrator-dispatch-rule.md")
BASE_AVAILABLE = base_dev_mode is not None and base_claude_md is not None and base_managed_block is not None
if not BASE_AVAILABLE:
    print(f"  [SKIP] INV-C byte-unchanged checks: base commit {BASE_REF} is not"
          " reachable in this checkout (shallow clone / unfetched base) —"
          " skipped as an environment condition, not reported as drift")
    base_dev_mode = base_dev_mode or ""
    base_claude_md = base_claude_md or ""
    base_managed_block = base_managed_block or ""

print("=== Round 3: Task-5 (security-floor prose, managed block, CLAUDE.md §5/§7.2/§8) ===")

# ---------------------------------------------------------------------------
# Task-5 AC-1: docs/dev-mode.md's non-waivable floor no longer states "the
# security agent always runs at Phase 3"; states the new floor (SEC-002
# design-review on sensitive tasks + adversary at pre-delivery; code-level
# audit delegated to PR review, named generically).
# ---------------------------------------------------------------------------
check(
    "T5-AC1: dev-mode.md no longer states the old unconditional clause "
    "('the security agent always runs at Phase 3')",
    "the security agent always runs at Phase 3" not in dev_mode,
)
bug_fix_forcing_bullet = extract_line(dev_mode, "**Bug-fix forcing rule:**")
check(
    "T5-AC1: Bug-fix forcing rule bullet states the new floor (SEC-002 design-review at Stage 1 "
    "+ adversary at the Pre-Delivery Security Audit)",
    "SEC-002 design-review at Stage 1" in bug_fix_forcing_bullet
    and "adversary" in bug_fix_forcing_bullet
    and "Pre-Delivery Security Audit (Phase 3.8)" in bug_fix_forcing_bullet,
    f"bullet: {bug_fix_forcing_bullet!r}",
)
check(
    "T5-AC1: the same bullet delegates code-level audit to PR review, named generically "
    "(not tied to a specific configured tool such as coderabbit)",
    "code-level audit is delegated to PR review" in bug_fix_forcing_bullet
    and "coderabbit" not in bug_fix_forcing_bullet.lower(),
    f"bullet: {bug_fix_forcing_bullet!r}",
)

# ---------------------------------------------------------------------------
# Task-5 AC-2: dev-mode.md + managed CLAUDE.md block + agents/orchestrator.md
# (phase table + footnotes + express analog) + agents/adversary.md, read
# together, describe the new model consistently — zero residual references
# to an unconditional Phase 3.8 security audit or to Phase 3.6.
# ---------------------------------------------------------------------------
FOUR_DOC_SET = {
    "docs/dev-mode.md": dev_mode,
    "skills/setup/managed-blocks/orchestrator-dispatch-rule.md": managed_block,
    "agents/orchestrator.md": orchestrator,
    "agents/adversary.md": adversary,
}
UNCONDITIONAL_SECURITY_PATTERNS = (
    "security` unconditionally",
    "security's own audit dispatch is UNCONDITIONAL",
    "`security` (unconditional)",
    "the security agent always runs at Phase 3",
)
# One legitimate negation sentence survives in agents/orchestrator.md § Phase 3.75
# ("Phase 3.6 no longer exists, so there is no concurrent dispatch to pair with.")
# — it confirms the retirement, it does not require or describe a Phase 3.6
# dispatch. Excluded from the residual scan by exact-string match, same
# discipline as the reviews/04-security.md negation handled in Round 2's
# T2-AC1 (allow the explicit negation, forbid every other mention).
PHASE_36_NEGATION_SENTENCE = (
    "Phase 3.6 no longer exists, so there is no concurrent dispatch to pair with."
)
phase_36_hits: dict[str, str] = {}
for name, text in FOUR_DOC_SET.items():
    residual = text.replace(PHASE_36_NEGATION_SENTENCE, "")
    if "Phase 3.6" in residual or "## Phase 3.6" in residual:
        phase_36_hits[name] = residual
check(
    "T5-AC2: zero residual 'Phase 3.6' mentions across the 4-document consistency set "
    "(the one known negation sentence in agents/orchestrator.md § Phase 3.75 excluded — "
    "it confirms retirement, it does not describe a live dispatch)",
    not phase_36_hits,
    f"files still mentioning Phase 3.6: {list(phase_36_hits.keys())!r}",
)
unconditional_hits: dict[str, list[str]] = {}
for name, text in FOUR_DOC_SET.items():
    matched = [p for p in UNCONDITIONAL_SECURITY_PATTERNS if p in text]
    if matched:
        unconditional_hits[name] = matched
check(
    "T5-AC2: zero residual references to an unconditional Phase-3.8 `security` audit "
    "across the 4-document consistency set",
    not unconditional_hits,
    f"files still asserting unconditional security audit: {unconditional_hits!r}",
)

# ---------------------------------------------------------------------------
# Task-5 AC-3: CLAUDE.md §8 carries a new dated Architecture Decision entry
# describing the new model and marking the 2026-07-20 entry superseded;
# CLAUDE.md §5 security-model bullets are reconciled.
# ---------------------------------------------------------------------------
architecture_decisions = slice_section(claude_md, "## 8. Architecture Decisions")
check(
    "T5-AC3: CLAUDE.md §8 carries a new 2026-07-21 dated entry describing the "
    "adversary-only-conditional model",
    "**2026-07-21**" in architecture_decisions and "adversary-only-conditional" in architecture_decisions,
)
check(
    "T5-AC3: the 2026-07-20 entry is explicitly marked superseded by the 2026-07-21 entry",
    "superseded 2026-07-21 by the adversary-only-conditional model below" in architecture_decisions,
)
mandatory_agreements = slice_section(claude_md, "## 5. Architectural Conventions")
check(
    "T5-AC3: CLAUDE.md §5 carries a reconciled security-model bullet naming Phase 3.8 "
    "adversary-alone-conditional",
    "Pre-delivery security audit — `adversary` alone, conditional (Phase 3.8)" in mandatory_agreements,
)

# ---------------------------------------------------------------------------
# Task-5 AC-4: dev-mode.md §2a / HI-2 / path-pattern / Phase-2-close-backstop
# lines are byte-unchanged (INV-C fenced) — diffed against base 544bf2f; the
# honest-developer threat-model section is not weakened.
# ---------------------------------------------------------------------------
base_hi2 = extract_line(base_dev_mode, "**HI-2 (discover-phase.md §3):**")
cur_hi2 = extract_line(dev_mode, "**HI-2 (discover-phase.md §3):**")
base_path_pattern = extract_line(base_dev_mode, "**Path-pattern auto-escalation")
cur_path_pattern = extract_line(dev_mode, "**Path-pattern auto-escalation")
base_intro = extract_line(base_dev_mode, "run **input-independent** and are NOT waivable")
cur_intro = extract_line(dev_mode, "run **input-independent** and are NOT waivable")
if BASE_AVAILABLE:
    check(
        f"T5-AC4 (INV-C fenced): HI-2 bullet byte-unchanged vs base {BASE_REF}",
        bool(base_hi2) and base_hi2 == cur_hi2,
        f"base={base_hi2!r} current={cur_hi2!r}",
    )
    check(
        f"T5-AC4 (INV-C fenced): Path-pattern auto-escalation bullet byte-unchanged vs base {BASE_REF}",
        bool(base_path_pattern) and base_path_pattern == cur_path_pattern,
        f"base={base_path_pattern!r} current={cur_path_pattern!r}",
    )
    check(
        f"T5-AC4 (INV-C fenced): 'run input-independent and are NOT waivable' intro sentence "
        f"byte-unchanged vs base {BASE_REF}",
        bool(base_intro) and base_intro == cur_intro,
        f"base={base_intro!r} current={cur_intro!r}",
    )
check(
    "T5-AC4: honest-developer threat-model disposition sentence is not weakened "
    "(still forbids skipping findings, weakening floors, or changing dispatch)",
    "does NOT license skipping any real in-scope finding, does NOT weaken or waive any floor, "
    "and does NOT change when or whether the SEC-002 design-review or `adversary` dispatch — "
    "security floors stay non-waivable." in dev_mode,
)

# ---------------------------------------------------------------------------
# Task-5 AC-5: agents/architect.md § "Residual limitation, stated honestly"
# no longer asserts that Phase 3.8 dispatches `security` unconditionally for
# every delivery group; rewritten to describe the new model.
# ---------------------------------------------------------------------------
residual_limitation = slice_section(
    architect,
    "**Residual limitation, stated honestly.**",
    next_header_pattern=r"\n\*\*Multi-project clause",
)
check(
    "T5-AC5: architect.md 'Residual limitation, stated honestly' paragraph exists",
    bool(residual_limitation),
)
check(
    "T5-AC5: the paragraph no longer asserts Phase 3.8 dispatches `security` unconditionally "
    "for every delivery group",
    "dispatches `security` unconditionally for every delivery group" not in residual_limitation,
)
check(
    "T5-AC5: the paragraph now describes adversary's Phase 3.8 dispatch as the sole "
    "Pre-Delivery Security Audit lens, gated on security_floor_applies alone",
    "sole Pre-Delivery Security Audit lens" in residual_limitation
    and "gated on `security_floor_applies` alone" in residual_limitation,
    f"paragraph: {residual_limitation.strip()[:400]!r}",
)

# ---------------------------------------------------------------------------
# Task-5 AC-6: CLAUDE.md §7.2's dev-natural-verbs illustrative example no
# longer cites Phase 3.6 (replaced with an existing phase, e.g. Phase 3.8);
# §7.2's surrounding rule text and Permitted Exceptions are otherwise
# unchanged.
# ---------------------------------------------------------------------------
section_72 = slice_section(claude_md, "### 7.2 Vocabulary", next_header_pattern=r"\n### 7\.3")
base_section_72 = slice_section(base_claude_md, "### 7.2 Vocabulary", next_header_pattern=r"\n### 7\.3")
illustrative_example = extract_line(section_72, "The three things a developer already knows")
check(
    "T5-AC6: §7.2's illustrative example no longer cites 'Phase 3.6'",
    "Phase 3.6" not in illustrative_example and "`Phase 3.6`" not in illustrative_example,
    f"sentence: {illustrative_example!r}",
)
check(
    "T5-AC6: §7.2's illustrative example cites a phase number that still exists in the new model "
    "(e.g. Phase 3.8)",
    "Phase 3.8" in illustrative_example or "`Phase 3.8`" in illustrative_example,
    f"sentence: {illustrative_example!r}",
)
# Byte-unchanged check for everything in §7.2 EXCEPT the one illustrative-example
# sentence (the Rule paragraph, the table, and Permitted Exceptions) — remove
# both versions' illustrative-example line before diffing the remainder.
section_72_minus_example = section_72.replace(illustrative_example, "", 1)
current_illustrative_example = extract_line(
    base_section_72, "The three things a developer already knows"
)
base_section_72_minus_example = base_section_72.replace(current_illustrative_example, "", 1)
if BASE_AVAILABLE:
    check(
        "T5-AC6: §7.2's surrounding rule text, table, and Permitted Exceptions are byte-unchanged "
        f"vs base {BASE_REF} (only the illustrative-example sentence differs)",
        section_72_minus_example == base_section_72_minus_example,
        "expected the two sections to match after removing each one's own illustrative-example line",
    )

print()
print("=== Round 3: Task-5 supplementary — docs/knowledge.md (Files: list, no numbered AC) ===")

# ---------------------------------------------------------------------------
# Supplementary check (not one of the 6 numbered AC, but part of Task-5's own
# Files: list and Work Plan step 6 — "add decision/pattern bullets;
# SUPERSEDED-mark the Phase-3.6 KG-read pattern"). Verified for completeness
# since docs/knowledge.md was named as a changed file this round.
# ---------------------------------------------------------------------------
knowledge = read(DOCS_DIR / "knowledge.md")
check(
    "Supplementary: docs/knowledge.md SUPERSEDED-marks the Phase-3.6 KG-read pattern bullet",
    "[SUPERSEDED — pipeline-cost-slimdown, 2026-07-21" in knowledge
    and "Phase 3.6" in knowledge,  # the marker itself names Phase 3.6 to identify what it supersedes
)
check(
    "Supplementary: docs/knowledge.md adds a new decision bullet for the "
    "adversary-only-conditional narrowing",
    "Pre-Delivery Security Audit narrowed to `adversary` alone, conditional on "
    "`security_floor_applies == true`" in knowledge,
)

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print()
total = len(results)
passed = sum(1 for ok, _ in results if ok)
print("=" * 60)
print(f"  pipeline-cost-slimdown round-3 tests: {passed} passed / {total} total")
print("=" * 60)
if passed != total:
    print()
    print("Failures:")
    for ok, msg in results:
        if not ok:
            print(f"  - {msg}")
    sys.exit(1)
sys.exit(0)
