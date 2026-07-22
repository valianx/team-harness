#!/usr/bin/env python3
# tests/test_pipeline_cost_slimdown_round2.py
# Round-2 AC verification for the pipeline-cost-slimdown refactor
# (Task-2: adversary input contract rewrite — SEC-002 verdict, no more
#  reviews/04-security.md read; Task-3: full retirement of acceptance-checker).
#
# Companion to tests/test_pipeline_cost_slimdown_round1.py (Task-1 + Task-4).
# Kept as a separate file rather than appended to Round 1's, since Round 1's
# file is already closed/passing and each round's AC set is independently
# traceable to its own dispatch. Both are interim, round-scoped verification;
# Task-6 (later round, same feature) owns the durable positive+negative pins
# in tests/test_agent_structure.py per 01-plan.md § Work Plan step 7 — neither
# file touches tests/test_agent_structure.py or docs/testing.md (Task-6's
# exclusive scope).
#
# This is NOT a behavioural test — agent prompts only run inside Claude Code.
# It checks that agents/adversary.md says what Task-2's AC require, and that
# agents/acceptance-checker.md plus every reference site Task-3 owns reflect
# full retirement (excluding docs/knowledge.md superseded-history and
# docs/testing.md, both explicitly Task-5/Task-6 declared territory).
#
# Usage:
#   python3 tests/test_pipeline_cost_slimdown_round2.py
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
SKILLS_DIR = REPO_ROOT / "skills"
DOCS_DIR = REPO_ROOT / "docs"
CMD_INSTALL_DIR = REPO_ROOT / "cmd" / "install"
SITE_DIR = REPO_ROOT / "site"

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
adversary = read(AGENTS_DIR / "adversary.md")
architect = read(AGENTS_DIR / "architect.md")
readme = read(AGENTS_DIR / "README.md")
lint_skill = read(SKILLS_DIR / "lint" / "SKILL.md")
site_index = read(SITE_DIR / "index.html")


def slice_html_section(text: str, marker: str) -> str:
    """Return the body of an HTML `<!-- ── MARKER ── -->` section up to the
    next such comment marker."""
    pattern = re.escape(marker) + r"(.*?)(?=\n\s*<!-- ── |\Z)"
    m = re.search(pattern, text, re.DOTALL)
    return m.group(1) if m else ""

_adversary_frontmatter_match = re.search(r"^---\n(.*?)\n---\n", adversary, re.DOTALL)
adversary_frontmatter = _adversary_frontmatter_match.group(1) if _adversary_frontmatter_match else ""

CONTROL_VOCAB = (
    "a guard, a gate, a validation, an allowlist, an early-return, an error "
    "handler, an auth/authz check, a rate limit, a floor, a waiver, a "
    "kill-switch, or a flag that hides incomplete functionality"
)

print("=== Round 2: Task-2 (adversary input contract — SEC-002 verdict, sole Phase 3.8 lens) ===")

# ---------------------------------------------------------------------------
# Task-2 AC-1: agents/adversary.md no longer requires reviews/04-security.md
# as a fail-closed mandatory input anywhere (frontmatter, Untrusted-content
# floor, Critical Rules, Boundary table, Method §1, Session Context
# Protocol, Return Protocol). One explicit negation sentence in the Output
# Contract ("no reviews/04-security.md is written in this model") is
# EXPECTED and compliant — it confirms the file's absence, it does not
# require it as an input. All OTHER occurrences would indicate the file is
# still cited as a mandatory-input location.
# ---------------------------------------------------------------------------
mandatory_input_sections = {
    "frontmatter": adversary_frontmatter,
    "Untrusted content & prompt-injection floor": slice_section(
        adversary, "## Untrusted content & prompt-injection floor"
    ),
    "Critical Rules": slice_section(adversary, "## Critical Rules"),
    "Boundary with the Existing Security Agent": slice_section(
        adversary, "## Boundary with the Existing Security Agent"
    ),
    "Method § 1": slice_section(adversary, "### 1. Identify the changed controls"),
    "Session Context Protocol": slice_section(adversary, "## Session Context Protocol"),
    "Return Protocol": slice_section(adversary, "## Return Protocol"),
}
mandatory_input_hits = [
    name for name, body in mandatory_input_sections.items() if "reviews/04-security.md" in body
]
check(
    "T2-AC1: none of the 7 named mandatory-input sections (frontmatter, Untrusted-content floor, "
    "Critical Rules, Boundary table, Method §1, Session Context Protocol, Return Protocol) "
    "cite reviews/04-security.md",
    not mandatory_input_hits,
    f"sections still citing it: {mandatory_input_hits!r}",
)
non_negation_occurrences = adversary.count("reviews/04-security.md") - adversary.count(
    "no `reviews/04-security.md` is written in this model"
)
check(
    "T2-AC1: the file's only remaining mention of reviews/04-security.md is the explicit "
    "negation sentence in Output Contract confirming it is no longer written",
    non_negation_occurrences == 0,
    f"expected exactly the one negation sentence; found {adversary.count('reviews/04-security.md')} "
    "total occurrence(s)",
)

# ---------------------------------------------------------------------------
# Task-2 AC-2: fail-closed mandatory read re-pointed at the SEC-002
# design-review verdict; fail-closed status: blocked SCOPED to "verdict
# absent AND task was sensitive from Stage 1" — not an unconditional
# absent-always-blocked rule.
# ---------------------------------------------------------------------------
check(
    "T2-AC2: adversary.md points its mandatory input at reviews/01-plan-review.md § Security Design-Review",
    "reviews/01-plan-review.md § Security Design-Review" in adversary
    or "reviews/01-plan-review.md`, the SEC-002" in adversary
    or "the SEC-002 design-review verdict (`reviews/01-plan-review.md § Security Design-Review`)" in adversary,
)
check(
    "T2-AC2: adversary.md names a genuine-missing-artifact (fail-closed, blocks) case",
    "Genuine-missing-artifact" in adversary and "sensitive from Stage 1" in adversary,
)
check(
    "T2-AC2: the block is scoped — sensitivity condition appears alongside the blocked branch, "
    "not as an unconditional 'absence always blocks' rule",
    "task was sensitive from Stage 1" in adversary or "sensitive from Stage 1" in adversary,
)

# ---------------------------------------------------------------------------
# Task-2 AC-3: frontmatter description + Invocation & Scope describe
# adversary as the sole Phase 3.8 lens (no "in parallel with security");
# security_floor_applies trigger (fail-closed) unchanged.
# ---------------------------------------------------------------------------
check(
    "T2-AC3: frontmatter description no longer says 'in parallel with security'",
    "in parallel with security" not in adversary_frontmatter,
)
check(
    "T2-AC3: frontmatter description describes adversary as the sole lens of the audit",
    "sole lens" in adversary_frontmatter,
)
invocation_scope = slice_section(adversary, "## Invocation & Scope")
check(
    "T2-AC3: '## Invocation & Scope' section exists and describes the SOLE Phase 3.8 lens",
    bool(invocation_scope) and "SOLE lens" in invocation_scope,
)
check(
    "T2-AC3: '## Invocation & Scope' no longer says 'in the SAME parallel Task block as `security`'",
    "in the SAME parallel Task block as `security`" not in invocation_scope,
)
check(
    "T2-AC3: security_floor_applies fail-closed trigger is unchanged in Invocation & Scope",
    "security_floor_applies: true" in invocation_scope and "fail-closed to `true`" in invocation_scope,
)

# ---------------------------------------------------------------------------
# Task-2 AC-4: control-vocabulary list in '## Method § 1' is byte-identical
# with architect.md § Classification block.
# ---------------------------------------------------------------------------
method_1 = slice_section(adversary, "### 1. Identify the changed controls")
check(
    "T2-AC4: adversary.md '### 1. Identify the changed controls' contains the canonical control vocabulary",
    CONTROL_VOCAB in method_1,
)
classification_block = slice_section(architect, "### Classification block")
check(
    "T2-AC4: architect.md carries the same canonical control vocabulary (parity check)",
    CONTROL_VOCAB in architect,
    "expected the exact same vocabulary string to appear verbatim in agents/architect.md",
)
check(
    "T2-AC4: the two enumerations are byte-identical (explicit string-equality diff, not a substring guess)",
    CONTROL_VOCAB in method_1 and CONTROL_VOCAB in architect,
)

# ---------------------------------------------------------------------------
# Task-2 AC-5: Phase-2-close false→true escalation path — adversary proceeds
# over the diff with design_review: absent (escalated post-1.6), never
# status: blocked, never an operator-dismissable "unavailable" state; the
# Session Context Protocol distinguishes this from the genuine-missing-
# artifact block (AC-2).
# ---------------------------------------------------------------------------
session_context = slice_section(adversary, "## Session Context Protocol")
check(
    "T2-AC5: Session Context Protocol names the 'Escalated post-1.6' branch distinct from the block branch",
    "Escalated post-1.6" in session_context and "proceeds, never blocks" in session_context,
)
check(
    "T2-AC5: escalation branch records design_review: absent (escalated post-1.6)",
    "design_review: absent (escalated post-1.6)" in adversary,
)
check(
    "T2-AC5: escalation branch explicitly forbids status: blocked and an 'unavailable' degrade",
    "Do NOT return `status: blocked`" in session_context
    and "do NOT degrade to an operator-dismissable" in session_context,
)
check(
    "T2-AC5: escalation branch still yields a real broke-it/could-not-break verdict",
    "still return a real `broke-it`/`could-not-break` verdict" in session_context,
)

print()
print("=== Round 2: Task-3 (full retirement of acceptance-checker) ===")

# ---------------------------------------------------------------------------
# Task-3 AC-1: Phase 3 flow no longer dispatches acceptance-checker and no
# contract file still requires one (orchestrator.md side, re-verified
# independently of Round 1's Task-1 check for this task's own traceability).
# ---------------------------------------------------------------------------
check(
    "T3-AC1: agents/orchestrator.md contains no acceptance-checker dispatch reference",
    "acceptance-checker" not in orchestrator,
)
check(
    "T3-AC1: '## Phase 3.6' (the acceptance-checker's former dispatch phase) does not exist",
    "## Phase 3.6" not in orchestrator,
)

# ---------------------------------------------------------------------------
# Task-3 AC-2: agents/acceptance-checker.md does not exist; grep across
# agents/, skills/, docs/ (excluding docs/knowledge.md superseded-history),
# cmd/install/, site/ returns zero LIVE references EXCEPT docs/testing.md
# (Task-6's own registry, explicitly declared out of Task-3's scope, per its
# own Files: list, and per the dispatch instruction naming it as
# Task-5/Task-6 declared territory).
# ---------------------------------------------------------------------------
check(
    "T3-AC2: agents/acceptance-checker.md does not exist",
    not (AGENTS_DIR / "acceptance-checker.md").exists(),
)

EXCLUDED_FILES = {
    DOCS_DIR / "knowledge.md",  # superseded-history bullets, excluded per dispatch
    DOCS_DIR / "testing.md",  # Task-6's own registry, declared territory (Files: list)
    # Historical acceptance-matrix record for the unrelated, already-shipped
    # sketch-ui-wireframe-html feature (PR #471, pre-dates this refactor's base
    # commit 544bf2f; untouched by Task-1..Task-4 of this feature). Reports what
    # happened at the time ("Acceptance-checker (Phase 3.6) verdict: pass") —
    # the same class of dated, non-live historical record as docs/knowledge.md's
    # superseded-history bullets, not a live contract statement Task-3 owns.
    # Surfaced by the case-insensitive broadening in Iteration 1; not part of
    # Task-3's `Files:` list.
    DOCS_DIR / "specs" / "sketch-ui-wireframe-html" / "acceptance-matrix.md",
}
SCAN_ROOTS = [AGENTS_DIR, SKILLS_DIR, DOCS_DIR, CMD_INSTALL_DIR, SITE_DIR]
SCAN_EXTENSIONS = ("*.md", "*.go", "*.html")

live_hits: list[str] = []
for root in SCAN_ROOTS:
    if not root.exists():
        continue
    for pattern in SCAN_EXTENSIONS:
        for path in root.rglob(pattern):
            if path in EXCLUDED_FILES:
                continue
            text_lower = read(path).lower()
            # Case-insensitive: a capitalized live mention (e.g. "Acceptance-checker" in
            # prose, sentence-initial) is just as much a live reference as the lowercase
            # form — the original case-sensitive match let site/index.html:540's
            # "Acceptance-checker performs a final spec-vs-delivered audit." escape.
            if "acceptance-checker" in text_lower or "acceptance_checker" in text_lower:
                live_hits.append(str(path.relative_to(REPO_ROOT)))

check(
    "T3-AC2: zero LIVE 'acceptance-checker' references (case-insensitive) across agents/, "
    "skills/, docs/, cmd/install/, site/ (excluding docs/knowledge.md and docs/testing.md)",
    not live_hits,
    f"residual hits: {live_hits!r}",
)

# ---------------------------------------------------------------------------
# Task-3 AC-3: README Roster, low-cost matrix, promotion note, tally no
# longer list acceptance-checker; skills/lint/SKILL.md Check-7 inline table
# no longer lists it.
# ---------------------------------------------------------------------------
check(
    "T3-AC3: agents/README.md contains no acceptance-checker mention",
    "acceptance-checker" not in readme,
)
check(
    "T3-AC3: skills/lint/SKILL.md Check-7 canonical matrix contains no acceptance-checker row",
    "acceptance-checker" not in lint_skill,
)

# ---------------------------------------------------------------------------
# Task-3 AC-4: go build ./cmd/install exits 0 and go test ./cmd/install
# passes, with acceptance-checker removed from the embedded-roster
# assertion, lowCostMatrix, and agent lists.
# ---------------------------------------------------------------------------
go_files = list(CMD_INSTALL_DIR.glob("*.go"))
go_hits = [str(p.relative_to(REPO_ROOT)) for p in go_files if "acceptance-checker" in read(p)]
check(
    "T3-AC4: no cmd/install/*.go file references acceptance-checker (embedded roster / lowCostMatrix / agent lists)",
    not go_hits,
    f"residual hits: {go_hits!r}",
)


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)


build_result = run(["go", "build", "./cmd/install"])
check(
    "T3-AC4: `go build ./cmd/install` exits 0",
    build_result.returncode == 0,
    f"stderr: {build_result.stderr.strip()[-500:]}",
)

test_result = run(["go", "test", "./cmd/install", "-count=1"])
check(
    "T3-AC4: `go test ./cmd/install` passes",
    test_result.returncode == 0,
    f"stdout/stderr: {(test_result.stdout + test_result.stderr).strip()[-800:]}",
)

# ---------------------------------------------------------------------------
# Task-3 AC-5: /th:lint Check 7 does not WARN on an agent-file-not-in-matrix
# or FAIL on a matrix-entry-without-file for acceptance-checker (file and
# matrix rows removed together — Check 7's deterministic portion replicated
# here: neither the file nor the canonical matrix row exists).
# ---------------------------------------------------------------------------
check(
    "T3-AC5: no orphaned matrix row (skills/lint/SKILL.md has no acceptance-checker row) "
    "and no orphaned agent file (agents/acceptance-checker.md absent) — file and row removed together",
    not (AGENTS_DIR / "acceptance-checker.md").exists() and "acceptance-checker" not in lint_skill,
)

# ---------------------------------------------------------------------------
# Task-3 AC-6 (added Phase 2.5 reconciliation, Round 2 Iteration 1
# non-blocking close-out): site/index.html's "What You Get" pipeline-stage-
# name list no longer lists "acceptance check" as a distinct pipeline stage.
#
# Deliberately NARROW — this does NOT reuse or broaden T3-AC2's tree-wide
# 'acceptance-checker' scan. The AC's own text explains why: a bare
# "acceptance check" / "acceptance-check" phrase is not itself retired
# repo-wide — Phase 3.5's "Acceptance Gate" is a distinct, RETAINED stage,
# so a blanket grep for that bare phrase would false-positive on that
# legitimate survivor. This check is scoped to ONLY the "What You Get"
# section of site/index.html (the specific stage-name list the AC names),
# via an HTML-comment section slice, exactly as T1's checks slice `##`
# sections in agents/orchestrator.md.
# ---------------------------------------------------------------------------
what_you_get = slice_html_section(site_index, "<!-- ── WHAT YOU GET")
check(
    "T3-AC6: site/index.html 'What You Get' section exists",
    bool(what_you_get),
    "expected an HTML comment marker '<!-- ── WHAT YOU GET' in site/index.html",
)
what_you_get_lower = what_you_get.lower()
check(
    "T3-AC6: 'What You Get' stage-name list no longer names 'acceptance check' as a distinct stage "
    "(narrow, section-scoped — does not touch T3-AC2's tree-wide pattern)",
    "acceptance check" not in what_you_get_lower and "acceptance-check" not in what_you_get_lower,
    f"section text: {what_you_get.strip()[:300]!r}",
)
check(
    "T3-AC6: the RETAINED 'Acceptance Gate' stage (Phase 3.5, distinct from the retired "
    "acceptance-checker) is unaffected by this narrow check — confirming it is not part of "
    "this section at all (no false coupling to a phrase this AC does not touch)",
    "Acceptance Gate" not in what_you_get,
)

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print()
total = len(results)
passed = sum(1 for ok, _ in results if ok)
print("=" * 60)
print(f"  pipeline-cost-slimdown round-2 tests: {passed} passed / {total} total")
print("=" * 60)
if passed != total:
    print()
    print("Failures:")
    for ok, msg in results:
        if not ok:
            print(f"  - {msg}")
    sys.exit(1)
sys.exit(0)
