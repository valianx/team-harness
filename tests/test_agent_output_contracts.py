#!/usr/bin/env python3
# tests/test_agent_output_contracts.py
# Structural tests for the agent-authoring-standard change's per-agent
# output-contract scope: per-agent output-contract language declarations
# (13 agents), the `audit_coverage` self-declaration, qa.md's alignment
# with its own :95 statement, and the review-scope-bounding instruction's
# removal from its five real sites.
#
# Scope: this file asserts this scope's own six acceptance criteria against
# the tree state produced by commits f8cb9e1 (per-agent output contracts) and
# 67eacdd (bounded-patch fix adding the missing agents/reviewer.md
# declaration). It deliberately does NOT assert the whole-tree checks
# (fenced-manifest sha256 reconciliation, the consolidated Suite 180) owned
# by a later scope in the same change — those land once every scope in the
# change has closed. This file does not modify tests/test_agent_structure.py,
# docs/testing.md, or tests/fixtures/fenced/manifest.json.
#
# This is NOT a behavioural test — agent prose only runs inside Claude Code.
# It checks that what the files SAY about themselves is internally
# consistent, present, and — where a precise base-commit anchor is
# available — byte-identical to what the plan requires stay untouched.
#
# Usage:
#   python3 tests/test_agent_output_contracts.py
# Exit code:
#   0 if all cases pass, 1 otherwise.

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BASE_SHA = "7929343"  # worktree base for this scope — origin/main @ 7929343, 2.141.0

AGENTS = REPO_ROOT / "agents"
ORCHESTRATOR = AGENTS / "orchestrator.md"
PATCH_MODE = REPO_ROOT / "docs" / "patch-mode.md"
PLAN_REVIEWER = AGENTS / "plan-reviewer.md"
QA_PLAN = AGENTS / "qa-plan.md"
SECURITY = AGENTS / "security.md"
QA = AGENTS / "qa.md"
ADVERSARY = AGENTS / "adversary.md"
TESTER = AGENTS / "tester.md"
REVIEWER = AGENTS / "reviewer.md"

results: list[tuple[bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((condition, f"{name}{(' — ' + detail) if detail and not condition else ''}"))
    status = "PASS" if condition else "FAIL"
    suffix = f" — {detail}" if detail and not condition else ""
    print(f"  [{status}] {name}{suffix}")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def norm(text: str) -> str:
    """Collapse whitespace runs (including line wraps) to a single space, so a
    multi-word phrase check does not false-negative on a hard-wrapped line."""
    return re.sub(r"\s+", " ", text)


def slice_section(text: str, start_marker: str, end_markers: tuple[str, ...]) -> str:
    idx = text.find(start_marker)
    if idx == -1:
        return ""
    tail = text[idx:]
    stop = len(tail)
    for marker in end_markers:
        pos = tail.find(marker, len(start_marker))
        if pos != -1:
            stop = min(stop, pos)
    return tail[:stop]


def git_show(ref: str, rel_path: str) -> str:
    """Read a file's content at a given ref (base-commit anchor), without
    mutating the working tree — the same 'read tracked state, never a
    scratch copy' discipline this repo's own structural suite uses."""
    proc = subprocess.run(
        ["git", "show", f"{ref}:{rel_path}"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        return ""
    return proc.stdout


print("=== Task-2: per-agent output contracts; the dispatcher stops bounding review scope ===")

# =============================================================================
# Per-artifact language declared in each of the 13 agents' own return/output
# section, and no declaration contradicts docs/conventions.md § Document
# classification / CLAUDE.md §7.3
# =============================================================================
# rel_path -> (required substrings, whether this agent is one of the two
# permitted to declare an operator-facing artifact)
_LANGUAGE_AGENTS: dict[str, tuple[tuple[str, ...], bool]] = {
    "agents/architect.md": (
        ("01-plan.md", "01-root-cause.md", "operator's resolved language",
         "research/00-research.md", "research/00-audit.md", "01-planning.md"),
        True,
    ),
    "agents/implementer.md": (
        ("02-implementation.md", "agentic-tier", "no operator-language exception"),
        False,
    ),
    "agents/tester.md": (
        ("03-testing.md", "02-regression-test.md", "agentic-tier",
         "no operator-language exception"),
        False,
    ),
    "agents/qa-plan.md": (
        ("00-acceptance-criteria.md", "reviews/04-validation.md", "agentic-tier",
         "Plan Ratification (Phase 1.5)", "operator's resolved language"),
        True,
    ),
    "agents/reviewer.md": (
        ("review_body", "reply_body", "reviews/04-internal-review.md",
         "no operator-language exception"),
        False,
    ),
    "agents/ux-reviewer.md": (
        ("Both report bodies", "no operator-language exception"),
        False,
    ),
    "agents/diagrammer.md": (
        ("diagram.excalidraw", "05-diagram.md", "agentic-tier"),
        False,
    ),
    "agents/gcp-cost-analyzer.md": (
        ("00-gcp-costs.md", "agentic-tier"),
        False,
    ),
    "agents/gcp-infra.md": (
        ("02-gcp-infra.md", "agentic-tier"),
        False,
    ),
    "agents/adversary.md": (
        ("reviews/04-adversary.md", "reviews/04-adversary-amend.md"),
        False,
    ),
    "agents/security.md": (
        ("reviews/04-security.md",),
        False,
    ),
    "agents/qa.md": (
        ("reviews/04-validation.md", "agentic-tier", "no operator-language exception"),
        False,
    ),
    "agents/plan-reviewer.md": (
        ("reviews/01-plan-review.md", "Plan Review", "agentic-tier",
         "no operator-language exception"),
        False,
    ),
}

_OUTPUT_HEADING_RE = re.compile(
    r"^##+\s+(Return Protocol|Output Contract)\b", re.MULTILINE
)

for rel_path, (substrings, may_be_operator_facing) in _LANGUAGE_AGENTS.items():
    path = REPO_ROOT / rel_path
    text = read(path)
    text_norm = norm(text)
    lang_paras = [
        m.start() for m in re.finditer(r"^\*\*Language\.\*\*", text, re.MULTILINE)
    ]
    check(
        f"task2(ac1): {rel_path} declares a '**Language.**' paragraph",
        len(lang_paras) == 1,
        f"found {len(lang_paras)} occurrences, expected exactly 1",
    )
    if not lang_paras:
        continue
    lang_pos = lang_paras[0]
    lines_before = text.count("\n", 0, lang_pos)
    total_lines = text.count("\n") + 1
    # Location heuristic: the declaration must live in the back half of the
    # file (agent files place Return Protocol / Output Contract near the
    # end) OR within a small window of an output-related heading in either
    # direction (covers ux-reviewer's placement immediately before its own
    # '## Return Protocol' heading).
    headings = [m.start() for m in _OUTPUT_HEADING_RE.finditer(text)]
    heading_lines = [text.count("\n", 0, h) for h in headings]
    near_heading = any(abs(lines_before - hl) <= 15 for hl in heading_lines)
    in_back_half = lines_before >= total_lines * 0.5
    check(
        f"task2(ac1): {rel_path}'s language declaration sits in its own"
        " return/output section (not an early, unrelated mention)",
        near_heading or in_back_half,
        f"declaration at line {lines_before + 1} of {total_lines}, no output heading within 15"
        " lines",
    )
    missing = [s for s in substrings if s not in text_norm and s not in text]
    check(
        f"task2(ac1): {rel_path}'s language declaration names its own artifact(s)",
        not missing,
        f"missing expected substring(s): {missing}",
    )
    # Scope the operator-facing-tier check to the Language paragraph itself
    # (up to the next blank line), never the whole file — many of these
    # files legitimately mention "the operator" elsewhere (status blocks,
    # unrelated prose) without that being an operator-facing-tier claim.
    _lang_para_end = text.find("\n\n", lang_pos)
    _lang_para_text = norm(text[lang_pos : _lang_para_end if _lang_para_end != -1 else None])
    if not may_be_operator_facing:
        check(
            f"task2(ac2): {rel_path} does not claim an operator-facing tier for its own"
            " artifact (docs/conventions.md § Document classification reserves that to"
            " 01-plan.md/01-root-cause.md/sketches)",
            "operator's resolved language" not in _lang_para_text
            and "follows the operator" not in _lang_para_text,
            "found an operator-facing-tier claim in this agent's own Language paragraph",
        )

# =============================================================================
# Three named fences stay byte-identical to the tree state before this
# scope's own commits
# (agents/tester.md § "Status block from tester (pre-fix-regression mode)",
# agents/adversary.md § "1. Identify the changed controls",
# agents/qa.md § "Code Hygiene")
# =============================================================================
_FENCE_SPECS = (
    (
        "agents/tester.md",
        "### Status block from tester (pre-fix-regression mode)",
        ("\n---\n",),
    ),
    (
        "agents/adversary.md",
        "### 1. Identify the changed controls",
        ("\n### 2.",),
    ),
    (
        "agents/qa.md",
        "## Code Hygiene",
        ("\n## AC Reference Convention",),
    ),
)
for rel_path, start_marker, end_markers in _FENCE_SPECS:
    base_text = git_show(BASE_SHA, rel_path)
    current_text = read(REPO_ROOT / rel_path)
    base_slice = slice_section(base_text, start_marker, end_markers)
    current_slice = slice_section(current_text, start_marker, end_markers)
    check(
        f"task2(ac3): {rel_path} § '{start_marker}' is byte-identical to the pre-Task-2 tree"
        f" ({BASE_SHA})",
        bool(base_slice) and base_slice == current_slice,
        "slice differs or could not be located in one of the two trees"
        if base_slice
        else f"could not locate '{start_marker}' in the base tree",
    )

# =============================================================================
# adversary's audit_coverage self-declaration: enforcer, failure direction,
# and invoker declared; self-declaration/no-mechanical-check disclaimer
# stated; presentational (not detective) mitigation named
# =============================================================================
adversary_text = read(ADVERSARY)
adversary_norm = norm(adversary_text)
check(
    "task2(ac4): agents/adversary.md status block declares"
    " 'audit_coverage: full | sampled {what was sampled}'",
    re.search(r"audit_coverage:\s*full\s*\|\s*sampled\s*\{[^}]+\}", adversary_text)
    is not None,
    "the audit_coverage field line was not found in the expected shape",
)
check(
    "task2(ac4): enforcer/failure-direction/invoker are declared for audit_coverage",
    "enforcer:" in adversary_norm.lower()
    and "failure direction:" in adversary_norm.lower()
    and "invoker:" in adversary_norm.lower(),
    "one or more of enforcer/failure-direction/invoker is missing from the audit_coverage"
    " field-contract prose",
)
check(
    "task2(ac4): audit_coverage absence renders as 'coverage: undeclared', never as complete"
    " coverage",
    "coverage: undeclared" in adversary_text,
    "missing the 'coverage: undeclared' absence-rendering literal",
)
check(
    "task2(ac4): the field is declared a self-declaration whose incorrectness is not"
    " mechanically caught, with a presentational (not detective) mitigation",
    "self-declaration" in adversary_norm
    and "not caught by any check" in adversary_norm
    and "presentational" in adversary_norm
    and "not detective" in adversary_norm,
    "missing one of: self-declaration wording, 'not caught by any check', or the"
    " presentational/not-detective mitigation framing",
)
check(
    "task2(ac4): the mitigation is adjacency to delivery's independently computed"
    " diff-composition figure at the gate",
    "delivery" in adversary_norm and "independently" in adversary_norm,
    "missing the named adjacency to delivery's independent diff-composition figure",
)

# =============================================================================
# qa.md fully aligned with its own :95 statement; :44's removal resolves by
# pointer to the orchestrator's canonical Case → routing table, never a
# local re-definition
# =============================================================================
qa_text = read(QA)
qa_norm = norm(qa_text)
_qa_forbidden = (
    "and defines AC for features when invoked standalone",
    "and define acceptance criteria for any project type",
    "and acceptance criteria",
    "define the most reasonable criteria",
    "In define-ac mode",
)
_qa_hits = [p for p in _qa_forbidden if p in qa_text]
check(
    "task2(ac5): agents/qa.md no longer contains any of the five stale standalone-AC-"
    "definition residues",
    not _qa_hits,
    f"still present: {_qa_hits}",
)
check(
    "task2(ac5): agents/qa.md frontmatter/body point to agents/qa-plan.md for standalone AC"
    " definition instead of claiming it",
    "agents/qa-plan.md" in qa_text,
    "no pointer to agents/qa-plan.md found",
)
check(
    "task2(ac5): the successor of the removed :44 licence resolves ambiguity as Case C and"
    " routes, never stopping to ask",
    "Case C" in qa_text and "never stop to ask" in qa_norm,
    "missing the Case C routing language or the never-stop-to-ask direction",
)
check(
    "task2(ac5): agents/qa.md does NOT locally (re)define the Case C taxonomy — it points to"
    " the orchestrator's canonical table instead",
    "**Case → routing table:**" not in qa_text
    and not re.search(r"\|\s*[ABC]\s*\|.*\|.*\|", qa_text)
    and 'agents/orchestrator.md § "If any agent fails' in qa_text,
    "qa.md appears to restate the Case → routing table locally (bold header or a"
    " Case-lettered table row), or is missing the pointer to agents/orchestrator.md",
)
orchestrator_text = read(ORCHESTRATOR)
check(
    "task2(ac5): the Case → routing table qa.md points to actually exists in"
    " agents/orchestrator.md, with a Case C row",
    "**Case → routing table:**" in orchestrator_text
    and re.search(r"\|\s*C\s*\|", orchestrator_text) is not None,
    "the canonical Case → routing table (or its Case C row) is missing from"
    " agents/orchestrator.md",
)

# =============================================================================
# The review-scope-bounding instruction is removed from all five real
# sites, in one commit; the Correction scope: field survives as a coordinate;
# the anchor heading and two Suite-172 literals are preserved; what must NOT
# be touched (buckets table, fail-safes, Stage-2 Blast radius mechanism)
# stays byte-identical to the tree state before this scope's own commits
# =============================================================================
_FORBIDDEN_LITERALS = ("frozen/trusted", "review ONLY", "never re-reviewed")

_orch_correction_slice = slice_section(
    orchestrator_text,
    "### Correction-classification — selective panel re-firing",
    ("\n---\n",),
)
_five_sites = {
    "docs/patch-mode.md § Delta-scoped Stage-1 review": slice_section(
        read(PATCH_MODE),
        "### Delta-scoped Stage-1 review",
        ("\n### Carried-forward sub-verdicts",),
    ),
    "agents/orchestrator.md § Correction-classification (Delta-scoped dispatch para)":
        slice_section(_orch_correction_slice, "**Delta-scoped dispatch", ("\n\n**Carried-forward",)),
    "agents/plan-reviewer.md § Delta-scoped review": slice_section(
        read(PLAN_REVIEWER), "### Delta-scoped review", ("\n### Carried-forward",)
    ),
    "agents/qa-plan.md § Delta-scoped review on selective re-firing": slice_section(
        read(QA_PLAN),
        "### Delta-scoped review on selective re-firing",
        ("\n### Panel-verifier concision", "\n### Carried forward"),
    ),
    "agents/security.md § Delta-scoped review on selective re-firing": slice_section(
        read(SECURITY),
        "**Delta-scoped review on selective re-firing",
        ("\n\n**Panel-verifier concision",),
    ),
}

for site_label, site_text in _five_sites.items():
    check(
        f"task2(ac6a): {site_label} contains no forbidden literal"
        " (frozen/trusted, review ONLY, never re-reviewed)",
        bool(site_text) and not any(lit in site_text for lit in _FORBIDDEN_LITERALS),
        "site slice is empty (marker not found) or contains a forbidden literal"
        if site_text
        else "could not locate this site's section — marker not found",
    )
    check(
        f"task2(ac6b): {site_label} still names the '**Correction scope:**' coordinate,"
        " with no surviving 'localized {AC-IDs...} | structural' modal value",
        "**Correction scope:**" in site_text
        and "localized {AC-IDs, section-names} | structural" not in site_text,
        "either the Correction scope: field is missing, or the old modal value survives",
    )
    check(
        f"task2(ac6b): {site_label} frames the field as a coordinate ('naming what changed'"
        " / 'a coordinate, not a review bound'), not a review-scope instruction",
        "coordinate" in site_text,
        "no 'coordinate' framing found in this site's replacement prose",
    )

check(
    "task2(ac6c): the anchor heading '### Correction-classification — selective panel"
    " re-firing' is unchanged in name and level",
    "### Correction-classification — selective panel re-firing" in orchestrator_text,
    "heading text or level changed — this anchor is cited by name from"
    " agents/plan-reviewer.md and docs/patch-mode.md, and asserted by Suite 174",
)
check(
    "task2(ac6c): the two Suite-172-asserted precondition literals survive inside that"
    " section ('this procedure does not apply', 'plan_review_status: deferred')",
    "this procedure does not apply" in _orch_correction_slice
    and "plan_review_status: deferred" in _orch_correction_slice,
    "one or both Suite-172 precondition literals are missing from the section",
)

# Everything else in the orchestrator's Correction-classification section
# that was not licensed for change stays byte-identical to the tree state
# before this scope's own commits: compare line-by-line, ignoring only the
# two paragraphs explicitly named as licensed (Delta-scoped dispatch; the
# carried-forward paragraph's "delta-scoped the same way" tail).
_base_orch_slice = slice_section(
    git_show(BASE_SHA, "agents/orchestrator.md"),
    "### Correction-classification — selective panel re-firing",
    ("\n---\n",),
)
_base_lines = _base_orch_slice.splitlines()
_current_lines = _orch_correction_slice.splitlines()
_diff_lines = [
    i
    for i, (a, b) in enumerate(zip(_base_lines, _current_lines))
    if a != b
]
_allowed_changed_prefixes = ("**Delta-scoped dispatch", "**Carried-forward sub-verdicts")
_unexpected_diffs = [
    i
    for i in _diff_lines
    if not _current_lines[i].startswith(_allowed_changed_prefixes)
]
check(
    "task2(ac6d): only the two AC-6-licensed paragraphs changed inside"
    " '### Correction-classification' (buckets table, fail-safe rules, announce+override,"
    " security-never-carried-forward, and the prompt-caching paragraph are byte-preserved)",
    len(_base_lines) == len(_current_lines) and not _unexpected_diffs,
    f"unexpected line-count change or unlicensed diffs at line index(es): {_unexpected_diffs}"
    if len(_base_lines) == len(_current_lines)
    else f"line count changed: base={len(_base_lines)}, current={len(_current_lines)}",
)

# The byte-consistency table now enumerates the five real sites
_patch_mode_text = read(PATCH_MODE)
_byte_consistency_slice = slice_section(
    _patch_mode_text,
    "### Byte-consistency requirement (fenced multi-site invariant)",
    ("\n## ", "\n### Cost-Ordered"),
)
_table_rows = [
    line.strip()
    for line in _byte_consistency_slice.splitlines()
    if line.strip().startswith("|") and line.strip().endswith("|")
]
_data_rows = _table_rows[2:] if len(_table_rows) > 2 else []
check(
    "task2(ac6e): docs/patch-mode.md's byte-consistency table enumerates exactly five sites"
    " (was three)",
    len(_data_rows) == 5,
    f"found {len(_data_rows)} data rows, expected 5",
)
check(
    "task2(ac6e): the five sites are the canonical contract, its producer, and the three"
    " consumers (qa-plan.md and security.md now included)",
    "agents/qa-plan.md" in _byte_consistency_slice
    and "agents/security.md" in _byte_consistency_slice
    and "agents/plan-reviewer.md" in _byte_consistency_slice
    and "agents/orchestrator.md" in _byte_consistency_slice
    and "docs/patch-mode.md" in _byte_consistency_slice,
    "one or more of the five expected files is missing from the table",
)
check(
    "task2(ac6e): the dangling 'compounds with the delta-scoped review above' clause no"
    " longer references a removed bound",
    "compounds with the delta-scoped review above" not in _patch_mode_text,
    "the stale cross-reference clause still exists verbatim",
)

# The Stage-2 Blast radius mechanism is explicitly out of this removal's
# scope and stays byte-identical to the tree state before this scope's own
# commits
_base_patch_mode = git_show(BASE_SHA, "docs/patch-mode.md")


def _blast_radius_r0_slice(text: str) -> str:
    return slice_section(
        text,
        "**R0 — Deterministic test gate",
        ("\n## Coherence Gate",),
    )


check(
    "task2(ac6f): docs/patch-mode.md's Stage-2 'Blast radius' R0/R1/R2 mechanism is"
    " byte-identical to the pre-Task-2 tree (explicitly out of this removal's scope)",
    bool(_blast_radius_r0_slice(_base_patch_mode))
    and _blast_radius_r0_slice(_base_patch_mode) == _blast_radius_r0_slice(_patch_mode_text),
    "the Stage-2 Blast radius mechanism changed, or could not be located in one of the trees",
)


def _orch_blast_radius_slice(text: str) -> str:
    # End marker must occur AFTER the start marker in the document (a marker
    # sitting before it makes tail.find() come up empty and the slice run
    # silently to EOF instead of failing) -- "Default to `structural`" is
    # part of the PRECEDING "Case -> routing table" subsection (line 1135),
    # while "Scope." opens this one (line 1145); "KG read on error" closes
    # it, right after the structural-never-narrows fail-safe paragraph.
    return slice_section(
        text,
        "**Scope.** Applies to Case A with `Blast radius: localized",
        ("\n\n**KG read on error",),
    )


_base_orch_full = git_show(BASE_SHA, "agents/orchestrator.md")
check(
    "task2(ac6f): agents/orchestrator.md's Case-A blast-radius ordering subsection (with its"
    " structural-never-narrows fail-safe) is byte-identical to the pre-Task-2 tree",
    bool(_orch_blast_radius_slice(_base_orch_full))
    and _orch_blast_radius_slice(_base_orch_full) == _orch_blast_radius_slice(orchestrator_text),
    "the Case-A blast-radius ordering subsection changed, or could not be located in one of"
    " the trees",
)

# =============================================================================
# Summary
# =============================================================================
print()
total = len(results)
passed = sum(1 for ok, _ in results if ok)
print("=" * 60)
print(f"  Task-2 output-contract tests: {passed} passed / {total} total")
print("=" * 60)
if passed != total:
    print()
    print("Failures:")
    for ok, msg in results:
        if not ok:
            print(f"  - {msg}")
    sys.exit(1)
sys.exit(0)
