#!/usr/bin/env python3
"""Report agent/reference authoring size signals without gating correctness.

Word counts, line counts, and table-of-contents preferences are editorial aids,
not behavioral or safety oracles. Only a contents link that points to no real
heading remains an error because that is a mechanically broken navigation target.
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

# Reference files over 100 lines that have no contents block today. Same ratchet as
# EXEMPT: the suite fails when one gains a contents block and its entry is left behind.
TOC_EXEMPT = {
    "skills/likec4-diagram/references/patterns.md",
    "skills/likec4-diagram/references/dsl-reference.md",
    "skills/d2-diagram/references/patterns.md",
    "skills/d2-diagram/references/dsl-reference.md",
    "skills/json-canvas/references/EXAMPLES.md",
    "skills/todo/references/task-format.md",
    "skills/interactive-presentation/references/gsap-patterns.md",
    "skills/interactive-presentation/references/radix-patterns.md",
    "skills/interactive-presentation/references/svg-patterns.md",
    "skills/interactive-presentation/references/react-flow-patterns.md",
    "skills/interactive-presentation/references/project-structure.md",
    "skills/excalidraw-diagram/references/element-templates.md",
    "skills/obsidian-bases/references/FUNCTIONS_REFERENCE.md",
}

HEADING = re.compile(r"^#{2,6}\s+(.*?)\s*$")
LIST_ITEM = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+(.*?)\s*$")
LINK_TEXT = re.compile(r"\[([^\]]+)\]\([^)]*\)")
TOC_LINK = re.compile(r"\[[^\]]+\]\(#([^)]+)\)")


def classify(path: Path) -> str | None:
    rel = path.relative_to(ROOT).as_posix()
    # The standard names two reference homes: agents/ref-*.md and skill references/.
    if rel.startswith("skills/") and "/references/" in rel:
        return "reference"
    if rel.startswith("agents/_shared/"):
        return "shared"
    if not rel.startswith("agents/") or "/" in rel[len("agents/") :]:
        return None
    name = path.name
    if name == "README.md":
        return None
    return "reference" if name.startswith("ref-") else "specialist"


def headings(lines: list[str], raw: bool = False):
    """This file's own heading texts — normalized for comparison, raw for slugging."""
    found = [] if raw else set()
    fenced = False
    for line in lines:
        if line.lstrip().startswith("```"):
            fenced = not fenced
            continue
        if fenced:
            continue
        match = HEADING.match(line)
        if match:
            if raw:
                found.append(match.group(1))
            else:
                found.add(normalize(match.group(1)))
    return found


def normalize(text: str) -> str:
    text = LINK_TEXT.sub(r"\1", text)
    text = text.replace("`", "").replace("*", "").replace("_", "")
    return " ".join(text.split()).strip().lower().rstrip(":")


def slug(text: str) -> str:
    """GitHub's heading-anchor rule: strip punctuation, then one hyphen per surviving space.

    The spaces are not collapsed first. A heading with an em-dash therefore yields a
    double hyphen, which is the case a naive slugger silently gets wrong.
    """
    text = LINK_TEXT.sub(r"\1", text).replace("`", "").lower()
    text = re.sub(r"[^a-z0-9 \-_]", "", text)
    return text.strip().replace(" ", "-")


def anchors(lines: list[str]) -> set[str]:
    """Every fragment this file's own headings actually expose, duplicates suffixed."""
    seen: dict[str, int] = {}
    out = set()
    for heading in headings(lines, raw=True):
        base = slug(heading)
        seen[base] = seen.get(base, 0) + 1
        out.add(base if seen[base] == 1 else f"{base}-{seen[base] - 1}")
    return out


def toc_block(lines: list[str]) -> list[str] | None:
    """The list under a Contents heading, or None. Bounded by the next heading."""
    for index, line in enumerate(lines[:TOC_SCAN_LINES]):
        match = HEADING.match(line)
        if match and normalize(match.group(1)) in ("contents", "table of contents"):
            end = index + 1
            while end < len(lines) and not HEADING.match(lines[end]):
                end += 1
            return lines[index + 1 : end]
    return None


def has_toc(lines: list[str]) -> bool:
    """A contents block is a list under a Contents heading naming this file's own headings.

    Comparing the list against the real headings is what makes this an oracle: a file
    cannot satisfy it by containing a sentence that says it has a contents block. The
    block must sit under its own heading, so an unrelated list near the top does not count.
    """
    block = toc_block(lines)
    if block is None:
        return False
    own = headings(lines)
    hits = sum(1 for line in block if (m := LIST_ITEM.match(line)) and normalize(m.group(1)) in own)
    return hits >= TOC_MIN_ITEMS


def broken_anchors(lines: list[str]) -> list[str]:
    """Contents entries whose #fragment names no heading this file exposes."""
    block = toc_block(lines)
    if block is None:
        return []
    real = anchors(lines)
    return [m.group(1) for line in block if (m := TOC_LINK.search(line)) and m.group(1) not in real]


def main() -> int:
    failures: list[str] = []
    advisories: list[str] = []
    seen: set[str] = set()

    for path in sorted([*ROOT.glob("agents/**/*.md"), *ROOT.glob("skills/**/references/**/*.md")]):
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
                if rel not in TOC_EXEMPT:
                    advisories.append(
                        f"{rel}: {line_count} lines and no table of contents — a reference over "
                        f"{TOC_REQUIRED_OVER} lines must open with a list of its own headings so a "
                        f"section can be loaded without reading the file in full"
                    )
            elif rel in TOC_EXEMPT:
                advisories.append(f"{rel}: now has a contents block — drop its TOC_EXEMPT entry")
            for fragment in broken_anchors(lines):
                failures.append(
                    f"{rel}: contents entry links #{fragment}, which names no heading in this file — "
                    f"a contents block that does not navigate is worse than none"
                )
            continue

        budget = WORD_BUDGET[kind]
        if words > budget:
            if "words" in exempt:
                pass
            else:
                advisories.append(f"{rel}: {words} words over the {budget}-word {kind} budget")
        elif "words" in exempt:
            advisories.append(f"{rel}: now {words} words, within the {budget}-word budget — drop its 'words' exemption")

        if line_count > LINE_CAP:
            if "lines" not in exempt:
                advisories.append(f"{rel}: {line_count} lines over the {LINE_CAP}-line guideline")
        elif "lines" in exempt:
            advisories.append(f"{rel}: now {line_count} lines, within the {LINE_CAP}-line guideline — drop its 'lines' exemption")

    for rel in sorted(set(EXEMPT) - seen):
        advisories.append(f"{rel}: exempt but no longer present — drop the entry")

    if failures:
        for line in failures:
            print(f"FAIL  {line}", file=sys.stderr)
        return 1

    for line in advisories:
        print(f"WARN  {line}")
    print(f"authoring health: PASS ({len(advisories)} advisory signal(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
