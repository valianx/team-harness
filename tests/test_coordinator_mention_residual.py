#!/usr/bin/env python3
# tests/test_coordinator_mention_residual.py
# Suite — coordinator-mention residual guard (coordinator-fusion, T4-AC-6a/b/c)
#
# Re-derives the set of surviving mentions of the retired coordinator (family
# A: `leader` case-insensitive) and its wholly-retired mechanisms (family B:
# `dispatch_handoff`, `blocked-no-dispatch`, `00-leader-roster`,
# `skip_delivery`, `acceptance-checker`) from the tree, and fails on any
# mention inside a file `docs/coordinator-mention-allowlist.md` does not name.
#
# `TH-LANE` and `checkpoint_advance_fresh` are deliberately EXCLUDED from the
# scanned token set: 01-plan.md's own derivation states both are RETAINED
# (the parser/consumer survives; only the injector/second coordinator is
# retired), so a bare mention of either is never itself a site to edit — it
# would only flood this check with legitimate, still-live occurrences.
#
# Verification is per-FILE, not per-line: a file is "addressed" when its path
# appears anywhere (in a table row or a "no survivors" sentence) in
# docs/coordinator-mention-allowlist.md. This is a declared, coarser bound
# (see 01-plan.md's own AC-6c residuals) — it closes "a mention survives that
# is not declared here," not "a declared mention is still semantically live."
#
# Usage:
#   python3 tests/test_coordinator_mention_residual.py
# Exit code:
#   0 if every family-A/B mention in the scanned corpus is inside an
#   allowlisted file, 1 otherwise.
#
# Pure text/file reads — no network, no agent invocation, no paid spend.

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
ALLOWLIST_PATH = REPO_ROOT / "docs" / "coordinator-mention-allowlist.md"

results: list[tuple[bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((condition, f"{name}{(' — ' + detail) if detail and not condition else ''}"))
    status = "PASS" if condition else "FAIL"
    suffix = f" — {detail}" if detail and not condition else ""
    print(f"  [{status}] {name}{suffix}")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


# ---------------------------------------------------------------------------
# Corpus — the same seam families docs/coordinator-mention-allowlist.md
# itself organizes by (agents/**, skills/**, docs/**, the three root files,
# the Go-rendered managed-block carrier, and output-styles/**).
# ---------------------------------------------------------------------------
_CORPUS_FILES: list[Path] = (
    list(AGENTS_DIR.rglob("*.md"))
    + list(SKILLS_DIR.rglob("*.md"))
    + list((REPO_ROOT / "docs").rglob("*.md"))
    + list((REPO_ROOT / "output-styles").rglob("*.md"))
    + [
        REPO_ROOT / "CLAUDE.md",
        REPO_ROOT / "README.md",
        REPO_ROOT / "CONTRIBUTING.md",
        REPO_ROOT / "CHANGELOG.md",
        REPO_ROOT / "cmd" / "install" / "global_claude_md.go",
    ]
)
_CORPUS_FILES = [p for p in _CORPUS_FILES if p.exists() and p != ALLOWLIST_PATH]

# ---------------------------------------------------------------------------
# Token families (per 01-plan.md § "Derivation of the site set")
# ---------------------------------------------------------------------------
_FAMILY_A_RE = re.compile(r"\bleader\b", re.IGNORECASE)
_FAMILY_B_TOKENS = (
    "dispatch_handoff", "blocked-no-dispatch", "00-leader-roster",
    "skip_delivery", "acceptance-checker",
)


def _file_has_mention(text: str) -> bool:
    if _FAMILY_A_RE.search(text):
        return True
    return any(tok in text for tok in _FAMILY_B_TOKENS)


# ---------------------------------------------------------------------------
# Allowlist — every backtick-quoted path-like token mentioned anywhere in
# docs/coordinator-mention-allowlist.md, from a table row's File:line cell or
# a "no survivors" prose sentence's backtick list. Coarse by design (AC-6c).
# ---------------------------------------------------------------------------
_ALLOWLIST_PATH_RE = re.compile(
    r"`((?:[a-zA-Z0-9_.-]+/)*[a-zA-Z0-9_.-]+\.(?:md|go|sh|ts|py|json|cjs|yaml))"
)


def _parse_allowlisted_files() -> set[str]:
    text = read(ALLOWLIST_PATH)
    return {m.group(1) for m in _ALLOWLIST_PATH_RE.finditer(text)}


def check_residual_mentions() -> int:
    """Return count of FAIL findings."""
    allowlisted = _parse_allowlisted_files()
    unallowlisted: list[str] = []
    audited = 0
    for path in _CORPUS_FILES:
        text = read(path)
        if not _file_has_mention(text):
            continue
        audited += 1
        rel = path.relative_to(REPO_ROOT).as_posix()
        if rel not in allowlisted:
            unallowlisted.append(rel)

    check(
        "residual-mentions: every surviving family-A/B mention is inside a file"
        " docs/coordinator-mention-allowlist.md names",
        not unallowlisted,
        f"{len(unallowlisted)} file(s) carry a mention with no allowlist entry:"
        f" {unallowlisted}",
    )
    if not unallowlisted:
        print(f"  ({audited} file(s) with at least one family-A/B mention, all allowlisted)")
    return 0 if not unallowlisted else 1


def check_allowlist_nonempty() -> int:
    """Sanity: the allowlist itself is non-trivial — a canary against a
    silently-empty parse (e.g. a future markdown-format change breaking the
    path-extraction regex) making this suite vacuously pass."""
    allowlisted = _parse_allowlisted_files()
    check(
        "allowlist-nonempty: docs/coordinator-mention-allowlist.md yields at"
        " least one parsed file path",
        len(allowlisted) > 10,
        f"parsed only {len(allowlisted)} path(s) — the extraction regex may have"
        " stopped matching this file's format",
    )
    return 0 if len(allowlisted) > 10 else 1


def main() -> None:
    print("=== Coordinator-mention residual guard (T4-AC-6a/b/c) ===")
    print()

    fail_count = 0
    fail_count += check_allowlist_nonempty()
    fail_count += check_residual_mentions()

    print()
    print("=" * 60)
    print(f"  coordinator-mention residual guard: {'PASS' if fail_count == 0 else 'FAIL'}")
    print("=" * 60)
    sys.exit(1 if fail_count else 0)


if __name__ == "__main__":
    main()
