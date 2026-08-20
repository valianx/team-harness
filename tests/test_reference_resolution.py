#!/usr/bin/env python3
"""Fail when a document points at a file or a section that does not exist.

A pointer is the mechanism this corpus uses instead of repeating itself, so a pointer that
does not resolve silently converts a reference into a dead end — and the reader cannot tell
the difference. Two of the anchors this check first found were load-bearing: the enforcer
CLAUDE.md names for the shared-review write discipline had no definition anywhere, and the
two summary-protocol sections that were missing are why `## Cost` and `## Lifecycle
Efficiency` were absent from a completed run whose trace held the events to fill them.

The oracle is existence, not wording: a heading is present or it is not, and no sentence can
be written to make this pass. That is what distinguishes it from the prose assertions retired
in the previous change.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# `file.md § "Heading"` — the quoted form this corpus uses for a section pointer.
CITATION = re.compile(r'([A-Za-z0-9_./-]+\.md)\s*§+\s*"([^"]+)"')

# Where a relative document reference may resolve from.
SEARCH_PREFIXES = ("", "agents/", "agents/_shared/", "docs/", "skills/")

# Generated or vendored trees: their sources are checked, so checking the copies duplicates.
SKIP_PARTS = ("plugins/", "installer-assets/", "node_modules/", ".codex/")


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().strip("`").strip('"').rstrip(".").lower()


def headings(path: Path, cache: dict) -> list | None:
    if path not in cache:
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except OSError:
            cache[path] = None
        else:
            cache[path] = [normalize(re.sub(r"^#+\s*", "", line)) for line in lines if line.startswith("#")]
    return cache[path]


def resolve(source: Path, relative: str) -> Path | None:
    for prefix in SEARCH_PREFIXES:
        candidate = ROOT / prefix / relative
        if candidate.exists():
            return candidate
    candidate = source.parent / relative
    return candidate if candidate.exists() else None


def sources() -> list[Path]:
    found = []
    for pattern in ("agents/**/*.md", "docs/**/*.md", "skills/**/*.md"):
        found.extend(ROOT.glob(pattern))
    found.extend(path for path in (ROOT / "CLAUDE.md", ROOT / "README.md") if path.exists())
    return sorted(path for path in found if not any(part in str(path) for part in SKIP_PARTS))


def unresolved() -> list[str]:
    cache: dict = {}
    problems = []
    for source in sources():
        try:
            text = source.read_text(encoding="utf-8")
        except OSError:
            continue
        for match in CITATION.finditer(text):
            relative, heading = match.group(1), normalize(match.group(2))
            target = resolve(source, relative)
            where = source.relative_to(ROOT)
            if target is None:
                problems.append(f"{where} -> {relative} (file does not exist)")
                continue
            present = headings(target, cache)
            if present is None:
                problems.append(f"{where} -> {relative} (unreadable)")
            # A citation may name a heading's prefix; it may not be longer than every heading.
            elif not any(item == heading or item.startswith(heading) for item in present):
                problems.append(f'{where} -> {relative} § "{match.group(2)}"')
    return sorted(set(problems))


def main() -> int:
    problems = unresolved()
    if problems:
        print(f"reference-resolution: FAIL ({len(problems)} unresolved)", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        print(
            "\n  Repoint the citation at a heading that exists, or drop the pointer and keep\n"
            "  the sentence. Do not add a heading to satisfy a pointer.",
            file=sys.stderr,
        )
        return 1
    print("reference-resolution: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
