#!/usr/bin/env python3
"""Measure every agent file against the size budgets docs/agent-authoring.md declares.

The standard states word budgets, a 500-line hard cap, and a table-of-contents
requirement for reference files over 100 lines. Until now nothing measured any of
it, so a file could sit at 767 lines against a 500-line cap indefinitely.

The oracle is a measurement of a real file compared against a declared number, so
no sentence anywhere can make this test pass.

EXEMPT records the debt that already exists. An exempt entry is not permission:
the test fails when an exempt file becomes compliant, which forces the entry out
and keeps the list shrinking rather than accumulating.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

WORD_BUDGET = {"specialist": 2000, "shared": 1500}
LINE_CAP = 500
TOC_REQUIRED_OVER = 100
TOC_SCAN_LINES = 60
TOC_MIN_ITEMS = 3

# Files that exceed a budget today. Each entry names the measure it is exempt from.
# Remove an entry when its file comes into budget — the test fails if you do not.
EXEMPT = {
    "agents/gcp-cost-analyzer.md": {"words", "lines"},
    "agents/init-project.md": {"words", "lines"},
    "agents/translator.md": {"words", "lines"},
    "agents/agent-builder.md": {"words"},
    "agents/architect.md": {"words"},
    "agents/diagrammer.md": {"words"},
    "agents/gcp-infra.md": {"words"},
    "agents/implementer.md": {"words"},
    "agents/mentor.md": {"words"},
    "agents/orchestrator.md": {"words"},
    "agents/plan-reviewer.md": {"words"},
    "agents/qa.md": {"words"},
    "agents/security.md": {"words"},
    "agents/tester.md": {"words"},
    "agents/_shared/apply-review-disposition.md": {"words"},
    "agents/_shared/gate-contract.md": {"words"},
    "agents/_shared/gh-fallback.md": {"words"},
    "agents/_shared/inline-review-contract.md": {"words"},
    "agents/_shared/kg-write-policy.md": {"words"},
    "agents/_shared/orchestrator-state.md": {"words", "lines"},
    "agents/_shared/plan-consolidation.md": {"words"},
}

HEADING = re.compile(r"^#{2,6}\s+(.*?)\s*$")
LIST_ITEM = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+(.*?)\s*$")
LINK_TEXT = re.compile(r"\[([^\]]+)\]\([^)]*\)")


def classify(path: Path) -> str | None:
    rel = path.relative_to(ROOT).as_posix()
    if rel.startswith("agents/_shared/"):
        return "shared"
    if not rel.startswith("agents/") or "/" in rel[len("agents/") :]:
        return None
    name = path.name
    if name == "README.md":
        return None
    return "reference" if name.startswith("ref-") else "specialist"


def headings(lines: list[str]) -> set[str]:
    found = set()
    fenced = False
    for line in lines:
        if line.lstrip().startswith("```"):
            fenced = not fenced
            continue
        if fenced:
            continue
        match = HEADING.match(line)
        if match:
            found.add(normalize(match.group(1)))
    return found


def normalize(text: str) -> str:
    text = LINK_TEXT.sub(r"\1", text)
    text = text.replace("`", "").replace("*", "").replace("_", "")
    return " ".join(text.split()).strip().lower().rstrip(":")


def has_toc(lines: list[str]) -> bool:
    """A table of contents is a list near the top whose items name this file's own headings.

    Comparing the list against the real headings is what makes this an oracle: a
    file cannot satisfy it by containing a sentence that says it has a contents block.
    """
    own = headings(lines)
    if not own:
        return False
    hits = 0
    for line in lines[:TOC_SCAN_LINES]:
        match = LIST_ITEM.match(line)
        if match and normalize(match.group(1)) in own:
            hits += 1
    return hits >= TOC_MIN_ITEMS


def main() -> int:
    failures: list[str] = []
    stale_exemptions: list[str] = []
    seen: set[str] = set()

    for path in sorted(ROOT.glob("agents/**/*.md")):
        kind = classify(path)
        if kind is None:
            continue
        rel = path.relative_to(ROOT).as_posix()
        seen.add(rel)
        text = path.read_text(encoding="utf-8")
        lines = text.split("\n")
        words = len(text.split())
        line_count = len(lines) - 1 if text.endswith("\n") else len(lines)
        exempt = EXEMPT.get(rel, set())

        if kind == "reference":
            if line_count > TOC_REQUIRED_OVER and not has_toc(lines):
                failures.append(
                    f"{rel}: {line_count} lines and no table of contents — a reference over "
                    f"{TOC_REQUIRED_OVER} lines must open with a list of its own headings so a "
                    f"section can be loaded without reading the file in full"
                )
            continue

        budget = WORD_BUDGET[kind]
        if words > budget:
            if "words" in exempt:
                pass
            else:
                failures.append(f"{rel}: {words} words over the {budget}-word {kind} budget")
        elif "words" in exempt:
            stale_exemptions.append(f"{rel}: now {words} words, within the {budget}-word budget — drop its 'words' exemption")

        if line_count > LINE_CAP:
            if "lines" not in exempt:
                failures.append(f"{rel}: {line_count} lines over the {LINE_CAP}-line hard cap")
        elif "lines" in exempt:
            stale_exemptions.append(f"{rel}: now {line_count} lines, within the {LINE_CAP}-line cap — drop its 'lines' exemption")

    for rel in sorted(set(EXEMPT) - seen):
        stale_exemptions.append(f"{rel}: exempt but no longer present — drop the entry")

    if failures or stale_exemptions:
        for line in failures:
            print(f"OVER BUDGET  {line}", file=sys.stderr)
        for line in stale_exemptions:
            print(f"STALE EXEMPT {line}", file=sys.stderr)
        return 1

    print("authoring budgets: all agent files within budget or explicitly exempt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
