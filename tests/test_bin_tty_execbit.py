#!/usr/bin/env python3
"""
tests/test_bin_tty_execbit.py

Suite 158 — bin-tty-openability-execbit

Regression coverage for GitHub issue #473: two defects in the `bin/*.sh`
bootstrap scripts.

  (1) The git-tracked file mode for `bin/install.sh`, `bin/install-opencode.sh`,
      and `bin/update-opencode.sh` is `100644` (not executable), so the
      documented invocation `./bin/update-opencode.sh` fails with
      "Permission denied" even though the file content is a valid shell
      script.
  (2) All four `/dev/tty` guard sites across the three scripts test only
      EXISTENCE (`[ -e /dev/tty ]`) before redirecting `< /dev/tty`. In a
      shell without a controlling terminal (agentic Bash, CI, cron), the
      `/dev/tty` node can exist but not be OPENABLE — the guard passes, the
      redirect is attempted, and the run fails with "No such device or
      address" AFTER the download and checksum verification already
      completed. The fix replaces the guard with an openability test
      (`(exec < /dev/tty) 2>/dev/null` or `{ true < /dev/tty; } 2>/dev/null`)
      while preserving the existing no-redirect fallback branch. The
      `{ : < /dev/tty; }` form must never be used: `:` is a POSIX special
      builtin, and POSIX requires a redirection error on a special builtin to
      terminate a non-interactive shell — under dash (the shebang shell of
      all four sites) that form fails silently, never reaching the fallback
      branch.

Both defects are captured here BEFORE any fix lands in `bin/*.sh` (Phase 2.0,
pre-fix regression authoring). This suite is EXPECTED to fail against the
unmodified tree — that is the contract: the implementer (Phase 2) makes it
pass without editing this file.

Usage:
    python3 tests/test_bin_tty_execbit.py
Exit code:
    0 if all assertions pass, 1 otherwise.

Marker: bin-tty-openability-execbit
"""

from __future__ import annotations

import io
import re
import subprocess
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower().startswith("cp"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parent.parent
BIN_DIR = REPO_ROOT / "bin"

TARGET_SCRIPTS = [
    BIN_DIR / "install.sh",
    BIN_DIR / "install-opencode.sh",
    BIN_DIR / "update-opencode.sh",
]

# Number of independent /dev/tty guard sites expected in each script — used to
# check the approved idiom shows up at every site, not just once.
EXPECTED_GUARD_SITES = {
    "install.sh": 1,
    "install-opencode.sh": 2,
    "update-opencode.sh": 1,
}

EXISTENCE_GUARD_RE = re.compile(r"\[\s*-e\s+/dev/tty\s*\]")
APPROVED_IDIOM_RE = re.compile(
    r"\(\s*exec\s*<\s*/dev/tty\s*\)|\{\s*true\s*<\s*/dev/tty\s*;?\s*\}"
)
SPECIAL_BUILTIN_GUARD_RE = re.compile(r"\{\s*:\s*<\s*/dev/tty\s*;?\s*\}")

results: list[tuple[bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((condition, name))
    status = "PASS" if condition else "FAIL"
    suffix = f" — {detail}" if detail and not condition else ""
    print(f"  [{status}] {name}{suffix}")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def git_tracked_mode(path: Path) -> str | None:
    """Return the git-tracked file mode (e.g. '100755') for `path`, or None
    if the path is not tracked (empty `git ls-files -s` output)."""
    rel = path.relative_to(REPO_ROOT).as_posix()
    proc = subprocess.run(
        ["git", "ls-files", "-s", rel],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    line = proc.stdout.strip()
    if not line:
        return None
    # Format: "<mode> <blob-sha> <stage>\t<path>"
    return line.split()[0]


print("=== Suite 158: bin-tty-openability-execbit ===")
print()

missing = [p for p in TARGET_SCRIPTS if not p.exists()]
for p in TARGET_SCRIPTS:
    check(f"{p.relative_to(REPO_ROOT)} exists", p.exists())

if missing:
    print()
    print("Cannot proceed without all target scripts — aborting.")
    sys.exit(1)

# ---------------------------------------------------------------------------
# AC-1 / AC-5(a) — git-tracked exec bit
# ---------------------------------------------------------------------------
for p in TARGET_SCRIPTS:
    mode = git_tracked_mode(p)
    check(
        f"suite158(execbit): {p.relative_to(REPO_ROOT)} is git-tracked as mode 100755",
        mode == "100755",
        f"git-tracked mode is {mode!r} (expected '100755') — run "
        f"'git update-index --chmod=+x {p.relative_to(REPO_ROOT)}'",
    )

# ---------------------------------------------------------------------------
# AC-5(b) — no existence-only `[ -e /dev/tty ]` guard remains
# ---------------------------------------------------------------------------
for p in TARGET_SCRIPTS:
    src = read(p)
    hits = EXISTENCE_GUARD_RE.findall(src)
    check(
        f"suite158(no-existence-guard): {p.relative_to(REPO_ROOT)} has no "
        "'[ -e /dev/tty ]' existence-only guard",
        len(hits) == 0,
        f"found {len(hits)} existence-only guard(s) — replace with an "
        "openability test ('(exec < /dev/tty)' or '{ true < /dev/tty; }')",
    )

# ---------------------------------------------------------------------------
# AC-5(c) — the openability guard uses the approved non-special-builtin
# idiom, at every known guard site, and the fatal `{ : < /dev/tty; }` form
# never appears.
# ---------------------------------------------------------------------------
for p in TARGET_SCRIPTS:
    src = read(p)
    hits = APPROVED_IDIOM_RE.findall(src)
    expected = EXPECTED_GUARD_SITES[p.name]
    check(
        f"suite158(approved-idiom): {p.relative_to(REPO_ROOT)} uses the "
        f"approved openability idiom at all {expected} guard site(s)",
        len(hits) >= expected,
        f"found {len(hits)} approved-idiom occurrence(s), expected >= {expected} "
        "— guard(s) must use '(exec < /dev/tty)' or '{ true < /dev/tty; }'",
    )

special_builtin_hits: list[str] = []
for p in TARGET_SCRIPTS:
    src = read(p)
    if SPECIAL_BUILTIN_GUARD_RE.search(src):
        special_builtin_hits.append(str(p.relative_to(REPO_ROOT)))

check(
    "suite158(no-special-builtin-guard): no '{ : < /dev/tty; }' special-builtin "
    "guard form appears anywhere in bin/*.sh",
    len(special_builtin_hits) == 0,
    f"fatal special-builtin guard form found in: {special_builtin_hits} — "
    "under dash a redirection error on ':' terminates the non-interactive "
    "shell silently, never reaching the fallback branch",
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
