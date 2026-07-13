#!/usr/bin/env python3
"""
tests/test_lane_marker_identity.py

Suite 151 — lane-marker-byte-identity

AC-7.4 (`01-plan.md`): a structural test asserting byte-identity of the
dispatch-marker literals `TH-STATE-REF` and `TH-LANE` between the PARSER
side (the hook body that reads the marker) and the INJECTOR side (the agent
prompt that stamps the marker into a dispatch payload's first line).

Extraction is structural, not hand-duplicated: each parser's own anchored
regex source (`^TH-STATE-REF:` / `^TH-LANE:`) is what proves the parser
recognizes that literal — this script does not separately assert "the
parser looks for X" by re-typing X from memory, it greps the parser's own
anchor and then checks the SAME literal appears in the injector.

Task ordering note: this repo's plan (`01-plan.md` § Work Plan) makes
Task-7 (this script) depend only on Task-4/5/6 (hooks), not on Task-2
(the split itself, which authors `agents/leader.md` / `agents/orchestrator.md`
— the injector side). When those files are absent, this script reports a
distinct PENDING status (exit 0, never a false PASS) rather than silently
skipping — see `tests/evidence/nested-lane-probes.md` § "Marker
byte-identity" for the operator-facing record of this state. Once Task-2/3
land in the same branch (both are part of the same all-tasks-one-pr
delivery), this script starts asserting for real.

Usage:
    python3 tests/test_lane_marker_identity.py
Exit code:
    0 if all checks PASS or the injector side is legitimately PENDING;
    1 if any check FAILS (parser anchor missing, or injector present but
      carrying a mismatched/absent marker literal).

Marker: lane-marker-byte-identity
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

CHECKPOINT_GUARD_TS = REPO_ROOT / "hooks" / "ts" / "bodies" / "checkpoint-guard.ts"
SUBAGENT_START_TS = REPO_ROOT / "hooks" / "ts" / "bodies" / "subagent-start.ts"

# Injector candidates — the split authors these in Task-2/Task-3, not Task-7.
ORCHESTRATOR_MD = REPO_ROOT / "agents" / "orchestrator.md"
LEADER_MD = REPO_ROOT / "agents" / "leader.md"

results: list[tuple[bool, str]] = []
pending: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((condition, name))
    status = "PASS" if condition else "FAIL"
    suffix = f" — {detail}" if detail and not condition else ""
    print(f"  [{status}] {name}{suffix}")


def note_pending(name: str, detail: str) -> None:
    pending.append(name)
    print(f"  [PENDING] {name} — {detail}")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def parser_anchors(text: str, canonical: str) -> bool:
    """True iff the parser's own regex source anchors on '^{canonical}:'."""
    return f"^{canonical}:" in text


def injector_carries(text: str, canonical: str) -> bool:
    """True iff the injector's prompt text stamps the identical literal
    '{canonical}:' (colon included, no substituted underscore/case drift)."""
    return f"{canonical}:" in text


print("=== Suite 151: lane-marker-byte-identity ===")
print()

# ---------------------------------------------------------------------------
# Parser side (Task-4/Task-5, already landed — hard requirement).
# ---------------------------------------------------------------------------
cg_exists = CHECKPOINT_GUARD_TS.exists()
ss_exists = SUBAGENT_START_TS.exists()
check("hooks/ts/bodies/checkpoint-guard.ts exists", cg_exists)
check("hooks/ts/bodies/subagent-start.ts exists", ss_exists)

if not (cg_exists and ss_exists):
    print()
    print("Parser-side hook files are missing — this is a hard failure "
          "(Task-4/Task-5 are prerequisites of Task-7, not concurrent).")
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
    "subagent-start.ts anchors ^TH-LANE: in its marker regex",
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
# Injector side (Task-2/Task-3 — may not exist yet in this branch).
# ---------------------------------------------------------------------------
orchestrator_exists = ORCHESTRATOR_MD.exists()
leader_exists = LEADER_MD.exists()

if not orchestrator_exists:
    note_pending(
        "agents/orchestrator.md carries TH-STATE-REF: literal",
        "file does not exist in this worktree yet (Task-2 not landed) — "
        "see tests/evidence/nested-lane-probes.md",
    )
else:
    orchestrator_src = read(ORCHESTRATOR_MD)
    check(
        "agents/orchestrator.md carries the identical TH-STATE-REF: literal",
        injector_carries(orchestrator_src, "TH-STATE-REF"),
        "orchestrator.md's specialist-dispatch payload does not stamp the "
        "exact literal checkpoint-guard.ts parses — marker drift",
    )

if not orchestrator_exists and not leader_exists:
    note_pending(
        "agents/leader.md or agents/orchestrator.md carries TH-LANE: literal",
        "neither file exists in this worktree yet (Task-2/3 not landed) — "
        "see tests/evidence/nested-lane-probes.md",
    )
else:
    lane_hits = []
    if leader_exists:
        lane_hits.append(("agents/leader.md", injector_carries(read(LEADER_MD), "TH-LANE")))
    if orchestrator_exists:
        lane_hits.append(
            ("agents/orchestrator.md", injector_carries(read(ORCHESTRATOR_MD), "TH-LANE"))
        )
    check(
        "at least one injector (leader.md spawn / orchestrator.md dispatch) "
        "carries the identical TH-LANE: literal",
        any(ok for _, ok in lane_hits),
        f"checked {[name for name, _ in lane_hits]}, none carried the "
        "exact literal — marker drift",
    )

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print()
passed = sum(1 for ok, _ in results if ok)
failed = sum(1 for ok, _ in results if not ok)
total = len(results)
print(f"Results: {passed}/{total} passed, {failed} failed, {len(pending)} pending")

if failed:
    print()
    print("FAILING assertions:")
    for ok, name in results:
        if not ok:
            print(f"  - {name}")
    sys.exit(1)

if pending:
    print()
    print("PENDING (not a failure — task-ordering gap, see "
          "tests/evidence/nested-lane-probes.md):")
    for name in pending:
        print(f"  - {name}")

print("No failing assertions.")
sys.exit(0)
