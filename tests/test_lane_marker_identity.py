#!/usr/bin/env python3
"""
tests/test_lane_marker_identity.py

Suite 151 — lane-marker-byte-identity

AC-7.4 (`01-plan.md`): a structural test asserting byte-identity of the
dispatch-marker literal `TH-STATE-REF` between the PARSER side (the hook
body that reads the marker) and the INJECTOR side (the coordinator's
specialist-dispatch payload).

Extraction is structural, not hand-duplicated: each parser's own anchored
regex source (`^TH-STATE-REF:` / `^TH-LANE:`) is what proves the parser
recognizes that literal — this script does not separately assert "the
parser looks for X" by re-typing X from memory, it greps the parser's own
anchor and then checks the SAME literal appears in the injector.

`TH-LANE` retirement (coordinator-fusion). The `TH-LANE` INJECTOR — the
controlled header a coordinator stamped when spawning a per-project lane
under parallel multi-project dispatch — is retired along with that
mechanism: multi-project sequencing is now serial, so no coordinator ever
spawns a concurrent per-project lane to attribute. The PARSER
(`subagent-start.ts`'s `TH_LANE_MARKER_RE`) is retained regardless — it
fails open when no marker is present, so keeping it costs nothing and
still matters if a future change reintroduces per-project concurrency.
This suite's own leg inverts to match: it asserts NO current injector
site stamps `TH-LANE:` (the expected, clean-retirement state) while still
failing loudly if some site carries a near-miss marker that claims to be
`TH-LANE` without matching the parser's exact anchored literal — a
reintroduced injector with a drifted literal must not silently pass as
correct just because this test stopped requiring its presence.

Usage:
    python3 tests/test_lane_marker_identity.py
Exit code:
    0 if all checks PASS; 1 if any check FAILS (parser anchor missing, or
    a site carries a near-miss TH-LANE-like marker that does not match the
    parser's exact anchored literal).

Marker: lane-marker-byte-identity
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

CHECKPOINT_GUARD_TS = REPO_ROOT / "hooks" / "ts" / "bodies" / "checkpoint-guard.ts"
SUBAGENT_START_TS = REPO_ROOT / "hooks" / "ts" / "bodies" / "subagent-start.ts"

# Candidate sites that could carry a reintroduced TH-LANE injector: the
# active pipeline dispatch contract and its lazy-loaded reference file for
# multi-project sequencing. The lightweight startup kernel carries neither
# pipeline dispatch payload.
REF_PIPELINE_MD = REPO_ROOT / "agents" / "ref-pipeline.md"
REF_DISPATCH_MACHINERY_MD = REPO_ROOT / "agents" / "ref-dispatch-machinery.md"

results: list[tuple[bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((condition, name))
    status = "PASS" if condition else "FAIL"
    suffix = f" — {detail}" if detail and not condition else ""
    print(f"  [{status}] {name}{suffix}")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def parser_anchors(text: str, canonical: str) -> bool:
    """True iff the parser's own regex source anchors on '^{canonical}:'."""
    return f"^{canonical}:" in text


print("=== Suite 151: lane-marker-byte-identity ===")
print()

# ---------------------------------------------------------------------------
# Parser side — hard requirement, both markers.
# ---------------------------------------------------------------------------
cg_exists = CHECKPOINT_GUARD_TS.exists()
ss_exists = SUBAGENT_START_TS.exists()
check("hooks/ts/bodies/checkpoint-guard.ts exists", cg_exists)
check("hooks/ts/bodies/subagent-start.ts exists", ss_exists)

if not (cg_exists and ss_exists):
    print()
    print("Parser-side hook files are missing — this is a hard failure.")
    sys.exit(1)

checkpoint_guard_src = read(CHECKPOINT_GUARD_TS)
subagent_start_src = read(SUBAGENT_START_TS)

state_ref_anchored = parser_anchors(checkpoint_guard_src, "TH-STATE-REF")
lane_anchored = parser_anchors(subagent_start_src, "TH-LANE")
check(
    "checkpoint-guard.ts anchors ^TH-STATE-REF: in its marker regex",
    state_ref_anchored,
    "extractStateRefHeader()'s regex source no longer anchors on this "
    "literal — either the marker was renamed (update this test) or a real "
    "regression",
)
check(
    "subagent-start.ts anchors ^TH-LANE: in its marker regex (parser retained,"
    " fails open, per docs/subagent-orchestration.md's retirement note)",
    lane_anchored,
    "TH_LANE_MARKER_RE's source no longer anchors on this literal — "
    "either the marker was renamed (update this test) or a real "
    "regression",
)

if not (state_ref_anchored and lane_anchored):
    print()
    print("Parser-side anchor extraction failed — cannot proceed to "
          "injector-side comparison.")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Injector side — TH-STATE-REF: still stamped, hard requirement.
# ---------------------------------------------------------------------------
pipeline_src = read(REF_PIPELINE_MD)
check(
    "agents/ref-pipeline.md carries the identical TH-STATE-REF: literal",
    "TH-STATE-REF:" in pipeline_src,
    "ref-pipeline.md's specialist-dispatch payload does not stamp the "
    "exact literal checkpoint-guard.ts parses — marker drift",
)

# ---------------------------------------------------------------------------
# Injector side — TH-LANE: retired. Assert absence; fail on a near-miss
# marker that does not match the parser's exact anchored literal, so a
# reintroduced injector with a drifted literal cannot silently pass.
# ---------------------------------------------------------------------------
_NEAR_MISS_RE = re.compile(r"\bTH[-_]LANE\b", re.IGNORECASE)

for _label, _path in (
    ("agents/ref-pipeline.md", REF_PIPELINE_MD),
    ("agents/ref-dispatch-machinery.md", REF_DISPATCH_MACHINERY_MD),
):
    _text = read(_path)
    _near_misses = _NEAR_MISS_RE.findall(_text)
    _exact = "TH-LANE:" in _text
    if not _near_misses:
        check(f"{_label} carries no TH-LANE injector (clean retirement)", True)
    elif _exact:
        check(
            f"{_label} reintroduces a TH-LANE injector matching the parser's exact"
            " anchored literal",
            True,
        )
    else:
        check(
            f"{_label} carries no near-miss TH-LANE-like marker with a drifted literal",
            False,
            f"found {_near_misses!r} without the exact 'TH-LANE:' anchor the parser"
            " requires — a reintroduced injector with a drifted literal",
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

print("No failing assertions.")
sys.exit(0)
