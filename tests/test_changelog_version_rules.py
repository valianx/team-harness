#!/usr/bin/env python3
"""
tests/test_changelog_version_rules.py

Suite 119 — changelog-version-rules

Content-presence regression guard for the delivery changelog gate and
SemVer discipline fixes (delivery.md Step 7; agents/_shared/delivery-mechanics.md
§ 1 — successor to delivery.md's retired Step 9.2, per T3-AC-6; init.md §6.3).

Purpose: prevent silent reversion of the corrected instruction text introduced
in fix/delivery-changelog-version-rules.  Every assertion fails when the
corrected phrases are absent (i.e., on the pre-fix tree) and passes after the
implementer's edits land.

Asserts:
  (a) delivery.md Step 7 contains the internal-only no-fragment branch
      (phrases: "skipped (internal-only)" and "operator-facing").
  (b) delivery-mechanics.md § 1 contains the PATCH-default rule
      (phrase: "PATCH is the default") and the tight-MINOR trigger
      (phrase: "New public/observable surface").
  (c) delivery-mechanics.md § 1 contains the ESLint edge-case rule
      (phrase: "newly reject").
  (d) init.md §6.3 generated changelog bullet contains both the
      operator-facing gate and the internal-only no-entry branch
      (phrases: "internal-only" and "no changelog entry" — or the
      equivalent "no changelog entry" / "add no changelog entry").

Usage:
    python3 tests/test_changelog_version_rules.py
Exit code:
    0 if all assertions pass, 1 otherwise.

Marker: changelog-version-rules
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

# Normalise stdout encoding on Windows CP consoles.
if sys.stdout.encoding and sys.stdout.encoding.lower().startswith("cp"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = REPO_ROOT / "agents"

results: list[tuple[bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((condition, name))
    status = "PASS" if condition else "FAIL"
    suffix = f" — {detail}" if detail and not condition else ""
    print(f"  [{status}] {name}{suffix}")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Suite 119 — changelog-version-rules
# ---------------------------------------------------------------------------
print("=== Suite 119: changelog-version-rules ===")
print()

delivery_path = AGENTS_DIR / "delivery.md"
init_path = AGENTS_DIR / "init.md"
# Retargeted (pipeline-dispatch-shape, T7-AC-2, per T3-AC-6): the version-bump
# rule content (old Step 9.2 — PATCH-default, MINOR trigger, ESLint edge case)
# moved wholesale to the coordinator's own § 1, executed directly rather than
# dispatched — see agents/_shared/delivery-mechanics.md § 1.
delivery_mechanics_path = AGENTS_DIR / "_shared" / "delivery-mechanics.md"

# --- Precondition guards (file existence) ----------------------------------
delivery_exists = delivery_path.exists()
delivery_mechanics_exists = delivery_mechanics_path.exists()
init_exists = init_path.exists()

check("agents/delivery.md exists", delivery_exists)
check("agents/_shared/delivery-mechanics.md exists", delivery_mechanics_exists)
check("agents/init.md exists", init_exists)

if delivery_exists:
    delivery = read(delivery_path)
else:
    delivery = ""

if delivery_mechanics_exists:
    delivery_mechanics = read(delivery_mechanics_path)
else:
    delivery_mechanics = ""

if init_exists:
    init_md = read(init_path)
else:
    init_md = ""

# ---------------------------------------------------------------------------
# (a) Step 7 — internal-only no-fragment branch
# ---------------------------------------------------------------------------
print()
print("--- (a) delivery.md Step 7: internal-only no-fragment branch ---")

check(
    "delivery.md contains 'skipped (internal-only)' (Step 7 no-fragment log line)",
    "skipped (internal-only)" in delivery,
    "phrase absent — Step 7 no-fragment branch was not added or was reverted",
)

check(
    "delivery.md contains 'operator-facing' (Step 7 classification gate)",
    "operator-facing" in delivery,
    "phrase absent — Step 7 operator-facing gate was not added or was reverted",
)

# ---------------------------------------------------------------------------
# (b) delivery-mechanics.md § 1 — PATCH-default rule + tight-MINOR trigger
#     (successor to delivery.md's old Step 9.2, moved by T3-AC-6)
# ---------------------------------------------------------------------------
print()
print("--- (b) delivery-mechanics.md § 1: PATCH default + MINOR trigger ---")

check(
    "delivery-mechanics.md contains 'PATCH is the default' (§ 1 PATCH-default rule)",
    "PATCH is the default" in delivery_mechanics,
    "phrase absent — § 1 PATCH-default rule was not added or was reverted",
)

check(
    "delivery-mechanics.md contains 'New public/observable surface' (§ 1 MINOR trigger)",
    "New public/observable surface" in delivery_mechanics,
    "phrase absent — § 1 MINOR trigger was not added or was reverted",
)

# ---------------------------------------------------------------------------
# (c) delivery-mechanics.md § 1 — ESLint edge case
# ---------------------------------------------------------------------------
print()
print("--- (c) delivery-mechanics.md § 1: ESLint edge case ---")

check(
    "delivery-mechanics.md contains 'newly reject' (§ 1 ESLint edge case)",
    "newly reject" in delivery_mechanics,
    "phrase absent — § 1 ESLint edge case rule was not added or was reverted",
)

# ---------------------------------------------------------------------------
# (d) init.md §6.3 — operator-facing gate + internal-only no-entry branch
# ---------------------------------------------------------------------------
print()
print("--- (d) init.md §6.3: operator-facing gate + internal-only no-entry clause ---")

check(
    "init.md contains 'internal-only' (§6.3 internal-only no-entry branch)",
    "internal-only" in init_md,
    "phrase absent — init.md §6.3 internal-only clause was not added or was reverted",
)

# The implementer may word the no-entry clause as "add no changelog entry",
# "no changelog entry", or "no entry" — check for both main variants.
no_entry_present = (
    "no changelog entry" in init_md
    or "add no changelog entry" in init_md
)
check(
    "init.md contains 'no changelog entry' (§6.3 no-entry clause for internal-only PRs)",
    no_entry_present,
    "neither 'no changelog entry' nor 'add no changelog entry' found in init.md "
    "— §6.3 no-entry clause was not added or was reverted",
)

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print()
passed = sum(1 for ok, _ in results if ok)
failed = sum(1 for ok, _ in results if not ok)
total = len(results)
print(f"Results: {passed}/{total} passed, {failed} failed")

if failed:
    print()
    print("FAILING assertions:")
    for ok, name in results:
        if not ok:
            print(f"  - {name}")
    sys.exit(1)

print("All assertions passed.")
sys.exit(0)
