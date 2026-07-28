#!/usr/bin/env python3
# tests/test_dispatch_contract_standard.py
# Structural tests for the canonical dispatch contract
# (agents/_shared/dispatch-contract.md) and its three registration sites
# (CLAUDE.md §5, CLAUDE.md §8, docs/decisions.md).
#
# Scope: this file asserts the dispatch-contract standard's own six
# acceptance criteria, against the tree state produced so far. It
# deliberately does NOT assert the cross-file, whole-tree checks
# (single-pointer-from-five-consumers, zero canonical-prose duplication
# across agents/leader.md and agents/orchestrator.md, language declared in
# the output contracts, the review-scope-absence check across the other
# named files) — those depend on the standard's remaining consumer files
# landing first and are deferred to the consolidated structural suite
# (tests/test_agent_structure.py). Registering this file in
# docs/testing.md and/or folding these checks into that consolidated suite
# is deferred there too — this file does not modify test_agent_structure.py,
# docs/testing.md, or tests/fixtures/fenced/manifest.json.
#
# This is NOT a behavioural test — agent/CLAUDE.md prose only runs inside
# Claude Code. It checks that what the files SAY about themselves is
# internally consistent and present, the same convention already used by
# tests/test_agent_structure.py.
#
# Usage:
#   python3 tests/test_dispatch_contract_standard.py
# Exit code:
#   0 if all cases pass, 1 otherwise.

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DISPATCH_CONTRACT = REPO_ROOT / "agents" / "_shared" / "dispatch-contract.md"
CLAUDE_MD = REPO_ROOT / "CLAUDE.md"
DECISIONS_MD = REPO_ROOT / "docs" / "decisions.md"

results: list[tuple[bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((condition, f"{name}{(' — ' + detail) if detail and not condition else ''}"))
    status = "PASS" if condition else "FAIL"
    suffix = f" — {detail}" if detail and not condition else ""
    print(f"  [{status}] {name}{suffix}")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def norm(text: str) -> str:
    """Collapse runs of whitespace (including line wraps inside a paragraph)
    to a single space, so a multi-word phrase check does not false-negative
    on a hard-wrapped line break in the middle of the phrase."""
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


_SELF_PATH = str(Path(__file__).resolve().relative_to(REPO_ROOT))


def git_grep_count(pattern: str) -> tuple[int, list[str]]:
    """Count of tracked files (repo-wide) containing an exact literal string.
    Uses `git grep -F -l` so the check reflects the committed tree, matching
    the convention Suite 174's no-relocation check already uses (read(path)
    against tracked files, never an untracked scratch copy). Excludes this
    test file's own path from the match list — a canary pattern is embedded
    here as a Python string literal for comparison purposes, which would
    otherwise self-match and produce a false "duplicated" count, the same
    self-exclusion convention Suite 174's own meta-check and no-relocation
    check already apply to their own source."""
    try:
        proc = subprocess.run(
            ["git", "grep", "-F", "-l", pattern],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        return (-1, [])
    if proc.returncode not in (0, 1):
        return (-1, [])
    files = [
        line
        for line in proc.stdout.splitlines()
        if line.strip() and line.strip() != _SELF_PATH
    ]
    return (len(files), files)


print("=== Task-1: canonical dispatch contract — one home, pointer-consumed ===")

dispatch_text = read(DISPATCH_CONTRACT)
claude_text = read(CLAUDE_MD)
decisions_text = read(DECISIONS_MD)

claude_s5 = slice_section(claude_text, "## 5. Architectural Conventions", ("\n## 6.",))
claude_s8 = slice_section(claude_text, "## 8. Architecture Decisions", ("\n## 9.",))
dispatch_norm = norm(dispatch_text)
claude_s5_norm = norm(claude_s5)

# ---------------------------------------------------------------------------
# The canonical rule lives in exactly one file, no duplicate elsewhere
# ---------------------------------------------------------------------------
_AC1_CANONICAL_PHRASE = (
    "The dispatcher never bounds review scope. The contract always bounds write scope."
)
_ac1_count, _ac1_files = git_grep_count(_AC1_CANONICAL_PHRASE)
check(
    "task1(ac1): the two-halves canonical sentence exists in exactly one tracked file",
    _ac1_count == 1,
    f"found in {_ac1_count} file(s): {_ac1_files}",
)
check(
    "task1(ac1): that one file is agents/_shared/dispatch-contract.md",
    _ac1_files == ["agents/_shared/dispatch-contract.md"],
    f"expected ['agents/_shared/dispatch-contract.md'], got {_ac1_files}",
)
check(
    "task1(ac1): the standard declares itself the single, never-copied home",
    "## Ownership — single source, never copied" in dispatch_text
    and "never restate its prose" in dispatch_norm,
    "missing the 'Ownership — single source, never copied' section or its"
    " never-restate declaration",
)

# ---------------------------------------------------------------------------
# A dispatch carries only: coordinates, task-scope decisions absent from the
# board, and the return form — a closed list of exactly three items
# ---------------------------------------------------------------------------
_may_carry = slice_section(
    dispatch_text, "## What a dispatch may carry", ("\n## What a dispatch must not carry",)
)
_may_carry_items = re.findall(r"^\d+\.\s+\*\*", _may_carry, flags=re.MULTILINE)
check(
    "task1(ac2): '## What a dispatch may carry' enumerates exactly three numbered items",
    len(_may_carry_items) == 3,
    f"found {len(_may_carry_items)} numbered items, expected 3",
)
check(
    "task1(ac2): the three items are Coordinates / task-scope decisions / return form",
    "**Coordinates.**" in _may_carry
    and "**Task-scope decisions" in _may_carry
    and "**The return form.**" in _may_carry,
    "one or more of the three canonical items is missing or renamed",
)

_must_not_carry = slice_section(
    dispatch_text, "## What a dispatch must not carry", ("\n## Two-halves rule",)
)
_must_not_carry_items = re.findall(r"^-\s+A \*\*", _must_not_carry, flags=re.MULTILINE)
check(
    "task1(ac2): '## What a dispatch must not carry' enumerates exactly four prohibited"
    " items",
    len(_must_not_carry_items) == 4,
    f"found {len(_must_not_carry_items)} prohibited items, expected 4",
)
check(
    "task1(ac2): the list is declared closed — no restatement of the recipient's own"
    " contract is permitted",
    "restatement of the destination agent's own contract" in norm(_must_not_carry)
    and "closed" in _must_not_carry,
    "missing the 'restatement of the destination agent's own contract' prohibition or"
    " the closed-list declaration",
)

# ---------------------------------------------------------------------------
# One two-halves formulation: review half never bounded by the dispatcher
# (adversary/SEC-002 example named), write half bounded by the recipient's
# own contract, by pointer only (no restated prose)
# ---------------------------------------------------------------------------
check(
    "task1(ac3): '## Two-halves rule' appears exactly once (single formulation)",
    dispatch_text.count("## Two-halves rule") == 1,
    f"found {dispatch_text.count('## Two-halves rule')} occurrences, expected 1",
)
_two_halves = slice_section(dispatch_text, "## Two-halves rule", ("\n## Control rubric",))
_two_halves_norm = norm(_two_halves)
check(
    "task1(ac3): review half — 'never bounds review scope' stated, safe-default direction"
    " (more scrutiny, never less) named",
    "never bounds review scope" in _two_halves_norm
    and "more scrutiny, never less" in _two_halves_norm,
    "missing the never-bounds-review-scope clause or its fail-safe direction",
)
check(
    "task1(ac3): write half is bounded by pointer to plan-consolidation.md, not restated",
    'agents/_shared/plan-consolidation.md § "Write-scope on \\`01-plan.md\\`"' in dispatch_text
    and "Write-tool discipline (shared review files)" in dispatch_text
    and "not restated here" in _two_halves_norm,
    "missing the plan-consolidation.md pointer (either section) or the"
    " not-restated-here disclaimer",
)
check(
    "task1(ac3): the affirmation-to-invert exception is named with its adversary/SEC-002"
    " example, distinguishing it from a restatement",
    "affirmation to invert" in dispatch_text
    and "adversary" in dispatch_text
    and "SEC-002" in dispatch_text,
    "missing the affirmation-to-invert naming or its adversary/SEC-002 example",
)

# ---------------------------------------------------------------------------
# The standard does not mention language on any line
# ---------------------------------------------------------------------------
_ac4_hits = [
    (i + 1, line)
    for i, line in enumerate(dispatch_text.splitlines())
    if re.search(r"language|idioma", line, re.IGNORECASE)
]
check(
    "task1(ac4): agents/_shared/dispatch-contract.md never mentions language/idioma",
    not _ac4_hits,
    f"unexpected hits: {_ac4_hits}",
)

# ---------------------------------------------------------------------------
# Every control claim lives in a five-column rubric; no empty cell; no
# bare '-' n/a; prose-only admitted; the mechanism's own limit is stated
# ---------------------------------------------------------------------------
_rubric = slice_section(dispatch_text, "## Control rubric", ("\n## Attribution",))
_rubric_rows = [
    line.strip()
    for line in _rubric.splitlines()
    if line.strip().startswith("|") and line.strip().endswith("|")
]
# Row 0 is the header, row 1 is the '---' separator, rows 2+ are data.
_header_cells = [c.strip() for c in _rubric_rows[0].strip("|").split("|")] if _rubric_rows else []
check(
    "task1(ac5): rubric header is exactly Control | Enforcer | Failure direction |"
    " Invoker | Read at",
    _header_cells == ["Control", "Enforcer", "Failure direction", "Invoker", "Read at"],
    f"got header cells: {_header_cells}",
)
_data_rows = _rubric_rows[2:] if len(_rubric_rows) > 2 else []
check(
    "task1(ac5): the rubric declares at least one control row",
    len(_data_rows) >= 1,
    "no data rows found under '## Control rubric'",
)
_bad_rows: list[str] = []
_prose_only_seen = False
for row in _data_rows:
    cells = [c.strip() for c in row.strip("|").split("|")]
    if len(cells) != 5:
        _bad_rows.append(f"wrong column count ({len(cells)}): {row}")
        continue
    if any(c == "" for c in cells):
        _bad_rows.append(f"empty cell: {row}")
    for cell in cells:
        if cell == "-":
            _bad_rows.append(f"bare-dash n/a (must be 'n/a — {{why}}'): {row}")
        if cell.lower().startswith("n/a") and not re.match(r"^n/a\s+—\s+\S", cell, re.IGNORECASE):
            _bad_rows.append(f"n/a cell without a ' — {{why}}' reason: {row}")
    if cells[1].strip().lower() == "prose-only":
        _prose_only_seen = True
check(
    "task1(ac5): no rubric row has a wrong column count, an empty cell, or a bare-dash"
    " n/a",
    not _bad_rows,
    f"bad rows: {_bad_rows}",
)
check(
    "task1(ac5): 'prose-only' is used as a legitimate Enforcer value at least once",
    _prose_only_seen,
    "no rubric row uses 'prose-only' as its Enforcer value",
)
check(
    "task1(ac5): the file states the rubric's own mechanism limit (visible omission,"
    " not incorrect-entry detection)",
    "makes an omission visible" in dispatch_norm
    and "does not detect an incorrect entry" in dispatch_norm,
    "missing the stated limit-of-the-mechanism sentence",
)

# ---------------------------------------------------------------------------
# Three registration sites exist, none left unwritten, none dependent on
# another
# ---------------------------------------------------------------------------
check(
    "task1(ac6): CLAUDE.md §5 gains exactly one bullet pointing at"
    " agents/_shared/dispatch-contract.md",
    claude_s5.count("agents/_shared/dispatch-contract.md") == 1,
    f"found {claude_s5.count('agents/_shared/dispatch-contract.md')} mentions in §5,"
    " expected exactly 1",
)
check(
    "task1(ac6): CLAUDE.md §5 bullet names the two-halves rule (review scope never"
    " bounded by the dispatcher; write scope always bounded by the recipient's own"
    " contract)",
    "review scope never bounded by the dispatcher" in claude_s5_norm
    and "write scope always bounded by the recipient's own contract" in claude_s5_norm,
    "the §5 bullet does not name both halves of the rule",
)
_S5_HOOK_NAMES = (
    "policy-block", "dev-guard", "gcp-guard", "gate-guard",
    "checkpoint-guard", "prepublish-guard", "worktree-guard",
)
_missing_hooks = [h for h in _S5_HOOK_NAMES if h not in claude_s5]
check(
    "task1(ac6): CLAUDE.md §5 still names all seven hook-gate identifiers (Suite 174"
    " floor) after the new bullet lands",
    not _missing_hooks,
    f"missing hook names in §5: {_missing_hooks}",
)
check(
    "task1(ac6): docs/decisions.md gains a dated entry pointing at"
    " agents/_shared/dispatch-contract.md",
    re.search(r"\*\*2026-07-27\*\*.*dispatch-contract\.md", decisions_text, re.DOTALL)
    is not None,
    "no 2026-07-27 docs/decisions.md entry pointing at dispatch-contract.md found",
)
check(
    "task1(ac6): CLAUDE.md §8 gains a recent-decision line pointing at the same file",
    re.search(r"\*\*2026-07-27\*\*.*dispatch-contract\.md", claude_s8, re.DOTALL) is not None,
    "no 2026-07-27 CLAUDE.md §8 line pointing at dispatch-contract.md found",
)
check(
    "task1(ac6): all three registration sites are independent files (none is a"
    " sub-slice of another)",
    len({DISPATCH_CONTRACT, CLAUDE_MD, DECISIONS_MD}) == 3,
    "registration sites collapsed onto fewer than three distinct files",
)
print(
    "  [note] task1(ac6): the 'no modal_count decrease' clause of AC-6 is covered by"
    " the pre-existing tests/test_agent_structure.py Suite 174"
    " suite174(modal-preservation): claude-md-5-conventions check against"
    " tests/fixtures/fenced/manifest.json — not duplicated here."
)

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print()
total = len(results)
passed = sum(1 for ok, _ in results if ok)
print("=" * 60)
print(f"  dispatch-contract standard (Task-1) tests: {passed} passed / {total} total")
print("=" * 60)
if passed != total:
    print()
    print("Failures:")
    for ok, msg in results:
        if not ok:
            print(f"  - {msg}")
    sys.exit(1)
sys.exit(0)
