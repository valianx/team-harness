"""Resolve `file.md § "Heading"` citations against real headings."""

from __future__ import annotations

import pathlib
import re

CITATION = re.compile(r'([A-Za-z0-9_./-]+\.md)\s*§+\s*"([^"]+)"', re.S)
SEARCH_ROOTS = ("", "agents/", "agents/_shared/", "docs/", "skills/")


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().strip("`").strip('"').rstrip(".").lower()


def headings(path: pathlib.Path, cache: dict) -> list | None:
    if path not in cache:
        try:
            lines = path.read_text(encoding="utf8").splitlines()
        except OSError:
            cache[path] = None
        else:
            cache[path] = [normalize(re.sub(r"^#+\s*", "", line)) for line in lines if line.startswith("#")]
    return cache[path]


def resolve(root: pathlib.Path, source: pathlib.Path, relative: str) -> pathlib.Path | None:
    for prefix in SEARCH_ROOTS:
        candidate = root / prefix / relative
        if candidate.exists():
            return candidate
    candidate = source.parent / relative
    return candidate if candidate.exists() else None


def scan(root: pathlib.Path, sources) -> list:
    cache: dict = {}
    dangling = []
    for source in sources:
        try:
            text = source.read_text(encoding="utf8")
        except OSError:
            continue
        for match in CITATION.finditer(text):
            relative, heading = match.group(1), normalize(match.group(2))
            target = resolve(root, source, relative)
            if target is None:
                dangling.append(f"{source.relative_to(root)} -> {relative} (file)")
                continue
            found = headings(target, cache)
            if found is None or not any(item == heading or item.startswith(heading) or heading.startswith(item) for item in found):
                dangling.append(f"{source.relative_to(root)} -> {relative} § {heading}")
    return sorted(set(dangling))
