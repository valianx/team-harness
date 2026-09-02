#!/usr/bin/env python3
"""Fail when a contract restates a deterministic classification it does not own.

A contract names the helper that classifies and the vocabulary the helper returns.
Restating the helper's flag list, decision procedure, or attempt ordinals forks the
procedure: prose and helper then disagree silently, and the prose is what a reader
follows. The oracle is a closed list of tokens that only appear when that fork has
happened — helper subcommand names, its flag spellings, and its decision literals.

The list is closed on purpose. It is not a wording preference: each token is an
identifier owned by `skills/review-pr/scripts/review_context.py`, so a contract that
carries one is quoting an implementation instead of pointing at it.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

RETIRED_PHRASES = (
    "classify-agent-failure",
    "--contract-signal",
    "--attempt {1|2}",
    "retry-contract",
    "agent-contract-invalid",
    "absent after retry",
)

# Shrink-only. A value names the change that removes the entry; the suite fails when an
# exempted file no longer carries a phrase, so an exemption cannot outlive its reason.
EXEMPT = {
    "skills/review-pr/SKILL.md": "verify-review-findings",
}

# Where the closed list is written down. A file stating the rule quotes every phrase by
# construction, which is not the fork the rule is about.
DEFINITION_SITES = {"skills/lint/SKILL.md"}


def scan(text: str) -> list[str]:
    return [phrase for phrase in RETIRED_PHRASES if phrase in text]


def in_scope() -> list[Path]:
    return sorted([*ROOT.glob("agents/**/*.md"), *ROOT.glob("skills/**/SKILL.md")])


def main() -> int:
    failures: list[str] = []
    exempt_hits: set[str] = set()

    for path in in_scope():
        rel = path.relative_to(ROOT).as_posix()
        if rel in DEFINITION_SITES:
            continue
        hits = scan(path.read_text(encoding="utf-8"))
        if not hits:
            continue
        if rel in EXEMPT:
            exempt_hits.add(rel)
            continue
        for phrase in hits:
            failures.append(
                f"{rel}: carries the retired phrase {phrase!r} — name the helper and the "
                f"vocabulary it returns instead of restating its procedure"
            )

    for rel, change in sorted(EXEMPT.items()):
        if not (ROOT / rel).exists():
            failures.append(f"{rel}: exempt but no longer present — drop the entry")
        elif rel not in exempt_hits:
            failures.append(
                f"{rel}: no retired phrase left — drop its exemption entry (recorded against "
                f"{change})"
            )

    if failures:
        print("retired-phrases: FAIL", file=sys.stderr)
        for line in failures:
            print(f"  {line}", file=sys.stderr)
        return 1

    print(f"retired-phrases: PASS ({len(EXEMPT)} exempt file(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
