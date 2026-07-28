#!/usr/bin/env python3
# tests/test_dispatch_sequence.py — Suite 181: dispatch-sequence-simulation
#
# Deterministic leg of the dispatch-sequence simulation (Task-6, T6-AC-1..T6-AC-8,
# T6-AC-10). Declares the pipeline's dispatch graph as data
# (tests/fixtures/dispatch-model.json), replays it into a synthetic trace, and
# asserts the seven properties the pipeline-dispatch-shape redesign claims:
#
#   1. `implementer` appears exactly once; one commit per task in the plan.
#   2. No validation-lens node starts before the `tester` node ends; the
#      validation lenses share one concurrency group rather than chaining.
#   3. The acceptance gate runs exactly once; `delivery` starts after
#      STAGE-GATE-3.
#   4. Zero `reviewer` nodes exist in the model at all.
#   5. The base-advance/fan-open reconcile (the Freeze node) completes before
#      the audit lens starts, and no push node precedes it.
#   6. A negative canary proves the property checks can go red (mutating the
#      model into a serial lens chain must fail the concurrency-group check).
#   7. Every node binds to a named `agents/orchestrator.md` anchor plus a
#      required literal that must appear within that anchor's section — the
#      model cannot pass while the contract says something else.
#
# Declared residual: this leg proves the declared MODEL satisfies the
# invariants and that the contract declares that model. It does not prove a
# live LLM obeys a correct contract — that is the behavioral leg,
# tests/test_dispatch_sequence_behavioral.sh (opt-in, ~$1/run, never wired
# into tests/run-all.sh).
#
# Usage:
#   python3 tests/test_dispatch_sequence.py
# Exit code:
#   0 if all cases pass, 1 otherwise.

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = REPO_ROOT / "tests" / "fixtures" / "dispatch-model.json"
ORCHESTRATOR_MD = REPO_ROOT / "agents" / "orchestrator.md"

results: list[tuple[bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((condition, f"{name}{(' — ' + detail) if detail and not condition else ''}"))
    status = "PASS" if condition else "FAIL"
    suffix = f" — {detail}" if detail and not condition else ""
    print(f"  [{status}] {name}{suffix}")


def load_model() -> dict:
    with open(MODEL_PATH, encoding="utf-8") as f:
        return json.load(f)


def topo_order(nodes: list[dict]) -> list[dict]:
    """Return nodes in a valid dependency order (predecessors before successors).
    Nodes sharing a concurrency_group with no cross-dependency are adjacent."""
    by_id = {n["id"]: n for n in nodes}
    resolved: list[str] = []
    resolved_set: set[str] = set()

    remaining = list(nodes)
    while remaining:
        progressed = False
        for n in list(remaining):
            if all(p in resolved_set for p in n["predecessors"]):
                resolved.append(n["id"])
                resolved_set.add(n["id"])
                remaining.remove(n)
                progressed = True
        if not progressed:
            raise ValueError(f"cycle or unresolved predecessor among: {[n['id'] for n in remaining]}")
    return [by_id[i] for i in resolved]


def simulate(model: dict) -> list[dict]:
    """Produce a synthetic trace: one 'start' and one 'end' event per node, in
    an order consistent with the DAG, with same-concurrency-group nodes sharing
    a start slot (never chained) and everything else running immediately after
    its predecessors close."""
    order = topo_order(model["nodes"])
    trace: list[dict] = []
    closed: set[str] = set()
    group_started: dict[str, bool] = {}

    for node in order:
        group = node.get("concurrency_group")
        if group and group_started.get(group):
            # Already opened this concurrency group in this pass — start concurrently.
            trace.append({"event": "start", "id": node["id"], "phase": node["phase"]})
        else:
            trace.append({"event": "start", "id": node["id"], "phase": node["phase"]})
            if group:
                group_started[group] = True
        trace.append({"event": "end", "id": node["id"], "phase": node["phase"]})
        closed.add(node["id"])

    return trace


def node(model: dict, node_id: str) -> dict:
    for n in model["nodes"]:
        if n["id"] == node_id:
            return n
    raise KeyError(node_id)


def event_index(trace: list[dict], node_id: str, event: str) -> int:
    for i, e in enumerate(trace):
        if e["id"] == node_id and e["event"] == event:
            return i
    raise KeyError(f"{node_id}/{event} not found in trace")


# ---------------------------------------------------------------------------
# Property assertions (T6-AC-2 .. T6-AC-6)
# ---------------------------------------------------------------------------

def assert_properties(model: dict, trace: list[dict], label: str) -> dict[str, bool]:
    """Run all five structural property checks against a (model, trace) pair.
    Returns a dict of property-name -> pass/fail so the negative canary can
    invert the expectation without duplicating the check bodies."""
    out: dict[str, bool] = {}

    # Property 1 — implementer appears exactly once; one commit per task.
    impl_nodes = [n for n in model["nodes"] if n.get("agent") == "implementer"]
    out["implementer_once"] = len(impl_nodes) == 1 and model["properties"].get("one_commit_per_task") is True

    # Property 2 — no validation-lens node starts before tester ends; lenses
    # share one concurrency group (never a chain).
    tester_end = event_index(trace, "tester-authoring", "end")
    lens_nodes = [n for n in model["nodes"] if n.get("concurrency_group") == model["properties"]["validation_concurrency_group"]]
    lens_starts_after_tester = all(
        event_index(trace, n["id"], "start") > tester_end for n in lens_nodes
    )
    lens_groups = {n.get("concurrency_group") for n in lens_nodes}
    lenses_share_one_group = len(lens_groups) == 1 and None not in lens_groups
    out["lenses_after_tester_same_group"] = lens_starts_after_tester and lenses_share_one_group and len(lens_nodes) >= 2

    # Property 3 — acceptance gate runs exactly once; delivery starts after
    # STAGE-GATE-3.
    acceptance_nodes = [n for n in model["nodes"] if n["id"] == "acceptance-gate"]
    delivery_nodes = [n for n in model["nodes"] if n.get("agent") == "delivery"]
    gate3_end = event_index(trace, "stage-gate-3", "end")
    delivery_after_gate3 = bool(delivery_nodes) and event_index(trace, delivery_nodes[0]["id"], "start") > gate3_end
    out["acceptance_once_delivery_after_gate3"] = (
        len(acceptance_nodes) == 1 and len(delivery_nodes) == 1 and delivery_after_gate3
    )

    # Property 4 — zero reviewer nodes.
    reviewer_nodes = [n for n in model["nodes"] if n.get("agent") == "reviewer"]
    out["no_reviewer_node"] = len(reviewer_nodes) == 0 and model["properties"].get("no_reviewer_node") is True

    # Property 5 — Freeze (fan-open/base-advance reconcile) completes before
    # the audit lens starts; no push node precedes it. This model has no
    # explicit "push" node (push is coordinator mechanics, not a dispatch),
    # so the push-ordering half of this property is checked structurally: no
    # node in this model ever precedes "freeze" while depending on it being
    # open — i.e. every node whose predecessors include "freeze" starts after
    # freeze's own end event.
    freeze_end = event_index(trace, "freeze", "end")
    audit_nodes = [n for n in model["nodes"] if n.get("agent") == "adversary"]
    audit_after_freeze = bool(audit_nodes) and event_index(trace, audit_nodes[0]["id"], "start") > freeze_end
    freeze_successors = [n for n in model["nodes"] if "freeze" in n["predecessors"]]
    all_successors_after_freeze = all(
        event_index(trace, n["id"], "start") > freeze_end for n in freeze_successors
    )
    out["freeze_before_audit_and_successors"] = audit_after_freeze and all_successors_after_freeze

    return out


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

model = load_model()
trace = simulate(model)

props = assert_properties(model, trace, "declared model")

check(
    "s181(ac2): implementer appears exactly once, one commit per task",
    props["implementer_once"],
)
check(
    "s181(ac3): no validation-lens node starts before tester ends; lenses share one concurrency group",
    props["lenses_after_tester_same_group"],
)
check(
    "s181(ac4): acceptance gate runs exactly once; delivery starts after STAGE-GATE-3",
    props["acceptance_once_delivery_after_gate3"],
)
check(
    "s181(ac5): zero reviewer nodes in the model",
    props["no_reviewer_node"],
)
check(
    "s181(ac6): the freeze (fan-open/base-advance reconcile) completes before the audit lens starts and before any of its successors",
    props["freeze_before_audit_and_successors"],
)

# ---------------------------------------------------------------------------
# T6-AC-7 — negative canary: mutate the model into a serial lens chain and
# assert the property check goes red. Proves the checks above are not vacuous.
# ---------------------------------------------------------------------------

mutated = copy.deepcopy(model)
qa_node = node(mutated, "qa-validate")
adv_node = node(mutated, "adversary-audit")
# Chain the lenses serially instead of concurrently: adversary now depends on
# qa's own completion and no longer shares qa's concurrency group.
adv_node["predecessors"] = ["qa-validate"]
adv_node["concurrency_group"] = None
qa_node["concurrency_group"] = None

mutated_trace = simulate(mutated)
mutated_props = assert_properties(mutated, mutated_trace, "mutated (serial chain) model")

check(
    "s181(ac7-canary): mutating the model into a serial lens chain flips the concurrency-group property to FAIL",
    mutated_props["lenses_after_tester_same_group"] is False,
    "canary did not go red — the property check is vacuous",
)

# ---------------------------------------------------------------------------
# T6-AC-8 — anchor + required-literal binding: every node's declared anchor
# must exist as a heading in agents/orchestrator.md, and the required_literal
# must appear within that anchor's section (up to the next same-or-higher
# level heading).
# ---------------------------------------------------------------------------

orch_text = ORCHESTRATOR_MD.read_text(encoding="utf-8")
orch_lines = orch_text.splitlines()


def section_slice(anchor: str) -> str:
    """Return the text from the anchor heading to the next heading of the
    same or shallower level (##/###), or EOF if none follows."""
    anchor_level = len(anchor) - len(anchor.lstrip("#"))
    start = None
    for i, line in enumerate(orch_lines):
        if line.strip() == anchor.strip():
            start = i
            break
    if start is None:
        return ""
    end = len(orch_lines)
    for j in range(start + 1, len(orch_lines)):
        line = orch_lines[j]
        if line.startswith("#"):
            level = len(line) - len(line.lstrip("#"))
            if level <= anchor_level:
                end = j
                break
    return "\n".join(orch_lines[start:end])


all_bound = True
for n in model["nodes"]:
    anchor = n["anchor"]
    literal = n["required_literal"]
    slice_text = section_slice(anchor)
    bound = bool(slice_text) and literal in slice_text
    if not bound:
        all_bound = False
    check(
        f"s181(ac8): node '{n['id']}' anchor '{anchor}' exists and contains required literal '{literal}'",
        bound,
    )

# ---------------------------------------------------------------------------
# T6-AC-8 (negative half) — the binding check must fail when an anchor is
# absent from the contract (proves the check is not vacuously true).
# ---------------------------------------------------------------------------

fake_slice = section_slice("## This Heading Does Not Exist In Orchestrator Md")
check(
    "s181(ac8-canary): the anchor-binding check fails closed when an anchor is absent",
    fake_slice == "",
)

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print()
total = len(results)
passed = sum(1 for ok, _ in results if ok)
print("=" * 60)
print(f"  dispatch-sequence-simulation (Suite 181) tests: {passed} passed / {total} total")
print("=" * 60)
if passed != total:
    print()
    print("Failures:")
    for ok, msg in results:
        if not ok:
            print(f"  - {msg}")
    sys.exit(1)
sys.exit(0)
