#!/usr/bin/env python3
# tests/test_gate_addressee_contract.py
# Structural tests for the gate-addressee/gate-data change: orchestrator
# STAGE-GATE-1/2/3 and the Express combined gate return structured gate
# DATA to th:leader (which renders the STOP block) instead of a pre-rendered
# ASCII block; the orchestrator keeps its own rendering only as the
# takeover-path fallback. The functional-clarity checkpoint is consumed as a
# `checkpoint.confirmed` event with `provenance`, with a one-shot re-ask and
# a named terminal state on a headless run. STAGE-GATE-3/Express gate data
# carries the real, criticals-conditional option set plus the mandatory
# security-decision fields. A named, additive exception to the free-text
# field bound covers the confirmatory-text field, mirrored at both sites.
#
# Scope: this file asserts the acceptance criteria for this scope against
# agents/orchestrator.md, agents/_shared/gate-contract.md, agents/leader.md,
# docs/subagent-orchestration.md, and docs/observability.md, as landed by
# commit d740b9c. It deliberately does NOT assert the whole-tree checks
# (fenced-manifest sha256 reconciliation, the consolidated structural suite)
# owned by a later scope in the same change — those land once every scope
# has closed. This file does not modify tests/test_agent_structure.py,
# docs/testing.md, or tests/fixtures/fenced/manifest.json; it only READS the
# manifest to confirm modal-token counts have not regressed below their
# canonical values for the fenced entries this scope touches.
#
# This is NOT a behavioural test — agent/CLAUDE.md prose only runs inside
# Claude Code. It checks that what the files SAY about themselves is
# internally consistent and present, the same convention already used by
# tests/test_agent_structure.py.
#
# Usage:
#   python3 tests/test_gate_addressee_contract.py
# Exit code:
#   0 if all cases pass, 1 otherwise.

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS = REPO_ROOT / "agents"

ORCHESTRATOR = AGENTS / "orchestrator.md"
GATE_CONTRACT = AGENTS / "_shared" / "gate-contract.md"
LEADER = AGENTS / "leader.md"
OPERATIONAL_RULES = AGENTS / "_shared" / "operational-rules.md"
SUBAGENT_ORCHESTRATION = REPO_ROOT / "docs" / "subagent-orchestration.md"
OBSERVABILITY = REPO_ROOT / "docs" / "observability.md"
MANIFEST_PATH = REPO_ROOT / "tests" / "fixtures" / "fenced" / "manifest.json"

results: list[tuple[bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((condition, f"{name}{(' — ' + detail) if detail and not condition else ''}"))
    status = "PASS" if condition else "FAIL"
    suffix = f" — {detail}" if detail and not condition else ""
    print(f"  [{status}] {name}{suffix}")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def norm(text: str) -> str:
    """Collapse runs of whitespace (including line wraps inside a paragraph)
    to a single space, so a multi-word phrase check does not false-negative
    on a hard-wrapped line break in the middle of the phrase."""
    return re.sub(r"\s+", " ", text)


def slice_section(text: str, start_marker: str, end_markers: tuple[str, ...]) -> str:
    idx = text.find(start_marker)
    if idx == -1:
        return ""
    tail = text[idx:]
    stop = len(tail)
    for marker in end_markers:
        pos = tail.find(marker, len(start_marker))
        if pos != -1:
            stop = min(stop, pos)
    return tail[:stop]


def slice_heading(text: str, anchor: str) -> str:
    """Same nesting convention as the manifest generator: a `## ` anchor
    extends to the next `## ` (nested `### ` stays inside it), a `### `
    anchor stops at the next `### ` OR `## `, whichever comes first."""
    stops = ("\n## ", "\n---\n") if anchor.startswith("## ") else ("\n## ", "\n### ", "\n---\n")
    return slice_section(text, anchor, stops)


_CASE_SENSITIVE_MODALS = ("MUST NOT", "MUST", "NEVER")
_CASE_INSENSITIVE_MODALS = ("unconditionally", "non-waivable")


def modal_counts(text: str) -> dict:
    counts = {tok: len(re.findall(re.escape(tok), text)) for tok in _CASE_SENSITIVE_MODALS}
    counts.update(
        {
            tok: len(re.findall(re.escape(tok), text, re.IGNORECASE))
            for tok in _CASE_INSENSITIVE_MODALS
        }
    )
    return counts


print("=== Gate-addressee / gate-data contract ===")

orch_text = read(ORCHESTRATOR)
gate_contract_text = read(GATE_CONTRACT)
leader_text = read(LEADER)
operational_rules_text = read(OPERATIONAL_RULES)
subagent_orch_text = read(SUBAGENT_ORCHESTRATION)
observability_text = read(OBSERVABILITY)
manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
manifest_by_id = {e["id"]: e for e in manifest}

voice_slice = slice_section(orch_text, "## Voice", ("\n## Gate handling",))
gate_handling_slice = slice_section(
    orch_text, "## Gate handling", ("\n## Mandatory boot sequence",)
)
sg1_slice = slice_section(orch_text, "## STAGE-GATE-1", ("\n## STAGE-GATE-2",))
sg2_slice = slice_section(orch_text, "## STAGE-GATE-2", ("\n## STAGE-GATE-3",))
sg3_slice = slice_section(orch_text, "## STAGE-GATE-3", ("\n---\n\n## Phase 4a",))
express_slice = slice_section(
    orch_text, "### Express combined gate", ("\n---\n\n## Phase 1 — Design",)
)
b1_slice = slice_section(orch_text, "**Reasoning checkpoint B1", ("\n**Invoke via Task tool**",))
comm_protocol_slice = slice_section(
    orch_text, "## Communication Protocol", ("\n### To specialists",)
)
events_schema_slice = slice_section(
    orch_text, "## Execution Events JSONL", ("\n### `tools` propagation",)
)

# ---------------------------------------------------------------------------
# Addressee-per-surface: exactly three human-facing surfaces named, every
# STAGE-GATE/Express/phase-transition return is DATA, not rendered prose
# ---------------------------------------------------------------------------
check(
    "gate-addressee(ac1): '## Voice' declares a per-surface addressee rule",
    "Destinatario per surface" in voice_slice,
    "the addressee-per-surface declaration is missing from '## Voice'",
)
check(
    "gate-addressee(ac1): the three named human-facing surfaces are all present",
    "00-pipeline-summary.md" in voice_slice
    and "leader-relayed-operator" in voice_slice
    and "takeover" in voice_slice.lower(),
    "one or more of the three human-facing surfaces (pipeline summary, a"
    " direct relayed operator question, the takeover-path fallback) is not"
    " named in '## Voice'",
)
_OLD_ASCII_FENCE_40 = "=" * 40
_OLD_ASCII_FENCE_36 = "=" * 36
for _name, _slice in (
    ("STAGE-GATE-1", sg1_slice),
    ("STAGE-GATE-2", sg2_slice),
    ("STAGE-GATE-3", sg3_slice),
    ("Express combined gate", express_slice),
):
    check(
        f"gate-addressee(ac1): {_name} no longer renders its own ASCII"
        " STOP-block fence (data returned to th:leader instead)",
        _OLD_ASCII_FENCE_40 not in _slice and _OLD_ASCII_FENCE_36 not in _slice,
        f"a literal rendered ASCII fence still appears inside {_name}'s own"
        " section — every gate should return structured data, never a"
        " pre-rendered block, on the normal (non-takeover) path",
    )
for _name, _slice in (
    ("STAGE-GATE-1", sg1_slice),
    ("STAGE-GATE-2", sg2_slice),
    ("STAGE-GATE-3", sg3_slice),
    ("Express combined gate", express_slice),
):
    check(
        f"gate-addressee(ac1): {_name} returns gate DATA to th:leader, never a"
        " rendered STOP block",
        "Gate data you return to `th:leader`" in _slice
        or "structured, never a rendered STOP block" in _slice,
        f"{_name} does not declare itself as returning structured gate data",
    )
check(
    "gate-addressee(ac1): phase-transition reporting is data returned to"
    " th:leader, not a block rendered by the orchestrator itself",
    "Phase-transition data — returned to `th:leader`, not rendered by you"
    in comm_protocol_slice
    and "You are not a human-facing surface for a routine phase transition"
    in comm_protocol_slice,
    "the phase-transition section still frames itself as an operator-facing"
    " rendered report",
)

# ---------------------------------------------------------------------------
# Allowlist, gate_nonce, mandatory STOP, and dual-record ownership are
# unchanged across the addressee change
# ---------------------------------------------------------------------------
check(
    "gate-addressee(ac2): STAGE-GATE-1's four-item allowlist is unchanged",
    all(
        opt in sg1_slice
        for opt in ("`approve`", "`approve autonomous`", "`reject {reason}`", "`edit`")
    ),
    "one or more of STAGE-GATE-1's four allowlist options is missing",
)
check(
    "gate-addressee(ac2): STAGE-GATE-2's four-item allowlist is unchanged",
    all(
        opt in sg2_slice
        for opt in ("`next`", "`next autonomous`", "`stop`", "`redo Task-{i}`")
    ),
    "one or more of STAGE-GATE-2's four allowlist options is missing",
)
check(
    "gate-addressee(ac2): STAGE-GATE-3's conditional allowlist is unchanged"
    " (ship / amend / override / abort)",
    all(
        opt in sg3_slice
        for opt in ("`ship`", "`amend`", "`override {reason}`", "`abort`")
    ),
    "one or more of STAGE-GATE-3's four allowlist options is missing",
)
for _name, _slice in (
    ("STAGE-GATE-1", sg1_slice),
    ("STAGE-GATE-2", sg2_slice),
    ("STAGE-GATE-3", sg3_slice),
    ("Express combined gate", express_slice),
):
    check(
        f"gate-addressee(ac2): {_name} still carries a fresh, single-use"
        " gate_nonce",
        "gate_nonce" in _slice,
        f"{_name} no longer mentions gate_nonce",
    )
check(
    "gate-addressee(ac2): the orchestrator still records both halves of the"
    " dual-record itself",
    "You record both halves of the dual-record atomically" in gate_handling_slice,
    "the dual-record-recording statement is missing from '## Gate handling'",
)
check(
    "gate-addressee(ac2): STAGE-GATE-1 is still never skippable by any mode,"
    " flag, skill, or environment variable",
    "cannot be skipped by any mode, flag, skill, or environment variable" in sg1_slice,
    "STAGE-GATE-1's unconditional-skip-prohibition clause is missing",
)
check(
    "gate-addressee(ac2): STAGE-GATE-3 is still never skippable regardless"
    " of `autonomous`",
    "never skippable regardless of `autonomous`" in sg3_slice,
    "STAGE-GATE-3's unconditional-skip-prohibition clause is missing",
)

# ---------------------------------------------------------------------------
# A mid-run operator decision is reported and routed via the leader relay;
# no release is ever recorded without the gate's current gate_nonce
# ---------------------------------------------------------------------------
check(
    "gate-addressee(ac3): the attribution-required / synthesis-rejected"
    " clause is present unchanged",
    "Attribution is required; synthesis is rejected." in gate_handling_slice,
    "the attribution-required clause is missing from '## Gate handling'",
)
for _name, _slice in (
    ("STAGE-GATE-1", sg1_slice),
    ("STAGE-GATE-2", sg2_slice),
    ("STAGE-GATE-3", sg3_slice),
):
    check(
        f"gate-addressee(ac3): {_name} verifies the relayed gate_nonce before"
        " recording a release",
        "gate_nonce" in _slice and "leader-relayed-operator" in gate_handling_slice,
        f"{_name} or the gate-handling section no longer ties a release to"
        " the relayed gate_nonce/provenance",
    )

# ---------------------------------------------------------------------------
# gate-contract.md's STOP-block templates declare the leader as renderer and
# the implementing orchestrator's gate data as the real, possibly-conditional
# option set; the generic template is never substituted
# ---------------------------------------------------------------------------
stop_block_intro_slice = slice_section(
    gate_contract_text, "## STOP-block templates", ("\n**STAGE-GATE-1**",)
)
check(
    "gate-addressee(ac4): gate-contract.md declares the orchestrator returns"
    " DATA and th:leader renders it",
    "returns `gate_pending` status DATA to `th:leader`" in stop_block_intro_slice
    and "`th:leader` renders the STOP block" in stop_block_intro_slice,
    "the STOP-block templates intro no longer states leader-renders /"
    " orchestrator-returns-data",
)
check(
    "gate-addressee(ac4): substituting the generic template for the real,"
    " received option set is named a contract violation",
    "is a contract violation, not a formatting choice" in stop_block_intro_slice,
    "the anti-substitution contract-violation clause is missing",
)
_gate_contract_unconditionally = modal_counts(gate_contract_text)["unconditionally"]
check(
    "gate-addressee(ac4): gate-contract.md keeps `unconditionally` at or"
    " above its canonical count",
    _gate_contract_unconditionally >= manifest_by_id["gate-contract-whole"]["modal_counts"]["unconditionally"],
    f"unconditionally count dropped to {_gate_contract_unconditionally}, canonical"
    f" is {manifest_by_id['gate-contract-whole']['modal_counts']['unconditionally']}",
)
scoped_extension_slice = slice_section(
    gate_contract_text,
    "**Implementation-scoped reply extensions",
    ("\n## Record-based recover backstop",),
)
check(
    "gate-addressee(ac4): the scoped-extension worked example (override maps"
    " 1:1 onto `ship`) is present, byte-identical in substance",
    "maps 1:1 onto the" in norm(scoped_extension_slice)
    and "canonical `ship` value" in norm(scoped_extension_slice)
    and "gate-guard" in scoped_extension_slice,
    "the implementation-scoped reply extension worked example was altered"
    " or removed",
)

# ---------------------------------------------------------------------------
# Removing the rendered phase-transition block drops no event; the
# mandatory observability floor paragraph is unchanged
# ---------------------------------------------------------------------------
_MANDATORY_FLOOR_TEXT = (
    "**Mandatory observability floor (fenced — MUST NOT change).** The"
    " compaction rules below (§ \"Free-text field bound\" and the"
    " `00-state.md` bounded-snapshot conversion in § \"Phase Checkpointing\")"
    " bound FORMAT only. Every `phase.*`/`gate.*` event this schema requires"
    " still fires, unchanged, at every phase transition and every gate — no"
    " format bound ever removes an event."
)
check(
    "gate-addressee(ac5): the mandatory-observability-floor paragraph is"
    " unchanged",
    _MANDATORY_FLOOR_TEXT in orch_text,
    "the fenced mandatory-observability-floor paragraph was altered",
)
_PRE_EXISTING_EVENTS = (
    "phase.start", "phase.end", "gate", "gate.pass", "gate.fail",
    "iteration.start", "stage.gate", "stage.gate.release", "stage.gate.skipped",
    "stage.notify", "stage.notify.skipped", "stage2.hygiene", "plan_structure",
    "plan_review.deferred", "plan_review.offered", "plan_review.offer_declined",
    "kg_write", "artifact.missing", "operation.started/success/failed",
    "pipeline.complete", "pipeline.incomplete", "pipeline.end",
    "dispatch.blocked", "orchestrator.spawned",
)
_missing_events = [e for e in _PRE_EXISTING_EVENTS if e not in events_schema_slice]
check(
    "gate-addressee(ac5): every event name that existed before this change"
    " is still in the `event` schema row",
    not _missing_events,
    f"missing event names: {_missing_events}",
)
check(
    "gate-addressee(ac5): the new `checkpoint.confirmed` event is added, not"
    " substituted for an existing one",
    "checkpoint.confirmed" in events_schema_slice,
    "checkpoint.confirmed is not present in the `event` schema row",
)

# ---------------------------------------------------------------------------
# The eight fenced entries this scope touches keep modal-token counts >=
# canonical; the non-fenced '## Voice' section loses no prohibition on
# becoming a pointer
# ---------------------------------------------------------------------------
_FENCED_ENTRIES = (
    ("orch-gate-handling", ORCHESTRATOR),
    ("orch-stage-gate-1", ORCHESTRATOR),
    ("orch-stage-gate-2", ORCHESTRATOR),
    ("orch-stage-gate-3", ORCHESTRATOR),
    ("orch-express-combined-gate", ORCHESTRATOR),
    ("gate-contract-whole", GATE_CONTRACT),
    ("leader-gate-mediation", LEADER),
    ("leader-gate-presentation-protocol", LEADER),
)
_file_text_cache = {ORCHESTRATOR: orch_text, GATE_CONTRACT: gate_contract_text, LEADER: leader_text}
for _entry_id, _file_path in _FENCED_ENTRIES:
    _entry = manifest_by_id[_entry_id]
    _text = _file_text_cache[_file_path]
    _live_slice = _text if _entry["mode"] == "file" else slice_heading(_text, _entry["anchor"])
    _live_modal = modal_counts(_live_slice)
    _ok = all(_live_modal[tok] >= count for tok, count in _entry["modal_counts"].items())
    check(
        f"gate-addressee(ac6): fenced entry '{_entry_id}' keeps modal-token"
        " counts >= canonical",
        _ok,
        f"{_entry_id} modal-token count dropped below canonical"
        f" ({_entry['modal_counts']} -> {_live_modal})",
    )
check(
    "gate-addressee(ac6): leader-gate-presentation-protocol's heading level"
    " is unchanged",
    "### Gate presentation protocol (your gate-facing behaviour)" in leader_text,
    "the anchor heading for the gate presentation protocol changed level or"
    " wording",
)
_VOICE_PROHIBITION_CATEGORIES = (
    "Enthusiasm markers", "First-person personality", "Anthropomorphic framing",
    "Colloquialisms", "Affirmations", "Filler closings", "Marketing tone",
)
_missing_categories = [
    c for c in _VOICE_PROHIBITION_CATEGORIES if c not in operational_rules_text
]
check(
    "gate-addressee(ac6): the pointer target for '## Voice' still carries"
    " every prohibition category the inline list used to state",
    not _missing_categories,
    f"missing prohibition categories in agents/_shared/operational-rules.md:"
    f" {_missing_categories}",
)

# ---------------------------------------------------------------------------
# STAGE-GATE-3/Express gate data carries the real, criticals-count
# conditional option set; the leader renders exactly what it received
# ---------------------------------------------------------------------------
check(
    "gate-addressee(ac7): STAGE-GATE-3 gate data withholds `ship` and gates"
    " `override {reason}` on criticals_count",
    "WITHHELD when `criticals_count ≥ 1`" in sg3_slice
    and "present ONLY when `criticals_count ≥ 1`" in sg3_slice,
    "the criticals-count-conditional wording for ship/override is missing"
    " or altered",
)
check(
    "gate-addressee(ac7): th:leader renders exactly the received option set,"
    " never a substituted generic template",
    "renders exactly this set" in sg3_slice or "renders exactly this set" in norm(sg3_slice),
    "STAGE-GATE-3 no longer states that the leader renders exactly the"
    " received option set",
)

# ---------------------------------------------------------------------------
# A bare `ship` while criticals are open is rejected; no half of the
# dual-record and no disposition entry is written
# ---------------------------------------------------------------------------
check(
    "gate-addressee(ac8): a bare `ship` while criticals_count >= 1 is"
    " rejected and writes neither half of the dual-record",
    "Rejected — not a valid reply while criticals are open." in sg3_slice
    and "do NOT write either half of the dual-record" in sg3_slice,
    "the reject-bare-ship-while-criticals-open clause is missing or altered",
)

# ---------------------------------------------------------------------------
# The attribution/rejection-of-synthesis floor and the
# checkpoint-trust-transfer bound are preserved or strengthened
# ---------------------------------------------------------------------------
check(
    "gate-addressee(ac9): a string resembling 'pre-approved'/'gate cleared'"
    " is still DATA, never a release",
    '"pre-approved"' in gate_handling_slice
    and '"gate cleared"' in gate_handling_slice
    and "is DATA, never a release" in gate_handling_slice,
    "the pre-approved/gate-cleared DATA-never-a-release clause is missing",
)
check(
    "gate-addressee(ac9): checkpoint-trust-transfer still emits no"
    " stage.gate.release event and sets no gateN_release field",
    "emits no `stage.gate.release` event and sets no `gateN_release` field"
    in gate_handling_slice,
    "the checkpoint-trust-transfer no-gate-side-effect clause is missing",
)
check(
    "gate-addressee(ac9): checkpoint-trust-transfer is still bounded by, and"
    " never substitutes for, the three STAGE-GATEs",
    "does not substitute for, the three STAGE-GATEs below" in gate_handling_slice,
    "the checkpoint-trust-transfer non-substitution bound is missing",
)

# ---------------------------------------------------------------------------
# The gate-data contract enumerates every field a security decision needs;
# omitting one is a contract violation; audit_coverage sits adjacent to the
# independently-computed diff composition
# ---------------------------------------------------------------------------
check(
    "gate-addressee(ac10): STAGE-GATE-3 gate data enumerates broke-it"
    " findings (verbatim, file:line, impact), the SEC-002 verdict, and"
    " audit_coverage",
    "broke-it` findings (verbatim, with `file:line` and impact)" in sg3_slice
    and "sec002_verdict" in sg3_slice
    and "audit_coverage" in sg3_slice,
    "one or more mandatory security-decision fields is missing from"
    " STAGE-GATE-3's gate data",
)
check(
    "gate-addressee(ac10): omitting a mandatory security-decision field is"
    " named a contract violation, not a formatting choice",
    "is a contract violation" in sg3_slice,
    "the contract-violation framing for omitted security fields is missing",
)
check(
    "gate-addressee(ac10): audit_coverage is presented ADJACENT to the"
    " independently-computed diff composition",
    "ADJACENT to the diff composition" in sg3_slice,
    "the audit_coverage-adjacent-to-diff-composition requirement is missing",
)
check(
    "gate-addressee(ac10): the Express combined gate also carries the"
    " security verdict and audit_coverage, never omitted for being express",
    "sec002_verdict" in express_slice
    and "audit_coverage" in express_slice
    and "never omitted because the lane is express" in express_slice,
    "the express combined gate's mandatory security fields are missing or"
    " no longer unconditional",
)

# ---------------------------------------------------------------------------
# The takeover path names its own renderer; the mandatory STOP holds
# identically when no th:leader is in the loop
# ---------------------------------------------------------------------------
takeover_gate_rendering_slice = slice_section(
    subagent_orch_text,
    "**Gate rendering on this path.**",
    ("\n**Takeover Pipeline Manifest",),
)
check(
    "gate-addressee(ac11): the takeover protocol names the orchestrator as"
    " the fallback renderer when no th:leader is in the loop",
    bool(takeover_gate_rendering_slice)
    and "No `th:leader` is in the loop here" in takeover_gate_rendering_slice,
    "the takeover-path fallback-renderer paragraph is missing",
)
check(
    "gate-addressee(ac11): the mandatory STOP still holds identically on"
    " the takeover path (STAGE-GATE-1/3 never skipped, gate-guard fires)",
    "STAGE-GATE-1 and STAGE-GATE-3 are never skipped" in takeover_gate_rendering_slice
    and "gate-guard" in takeover_gate_rendering_slice,
    "the takeover-path mandatory-STOP-preservation clause is missing",
)
check(
    "gate-addressee(ac11): absent a renderer, the fallback is naming the"
    " orchestrator itself, never leaving gate data with no consumer",
    "naming the orchestrator as its own fallback renderer is what closes"
    " that gap" in takeover_gate_rendering_slice,
    "the no-renderer failure-direction statement is missing",
)

# ---------------------------------------------------------------------------
# A missing checkpoint.confirmed event is reported exactly once, never in
# a loop; a headless run has a named terminal state
# ---------------------------------------------------------------------------
check(
    "gate-addressee(ac12): a missing checkpoint.confirmed event triggers"
    " exactly one routed-back request, never a loop",
    "exactly once, never in a loop" in b1_slice,
    "the exactly-once/never-a-loop clause is missing from Reasoning"
    " checkpoint B1",
)
check(
    "gate-addressee(ac12): the headless-run terminal state is named"
    " (provenance: leader-inferred, never operator-live, never an abort"
    " reason)",
    "continue with `provenance: leader-inferred`" in b1_slice
    and "never registered as `operator-live`" in b1_slice
    and "never a reason to abort the run" in b1_slice,
    "one or more parts of the headless-run terminal-state declaration is"
    " missing",
)
check(
    "gate-addressee(ac12): the orchestrator never synthesizes a confirmed"
    " value when the event is absent or leader-inferred",
    "never synthesize `functional_clarity_confirmed: true` when the event"
    " is absent or `leader-inferred`" in b1_slice,
    "the no-synthesis-on-absent-event clause is missing",
)

# ---------------------------------------------------------------------------
# checkpoint.confirmed is the sole authority for the clarity check at every
# arrival, including recover; the two 00-state.md fields are named a
# derived cache, never consulted in its place
# ---------------------------------------------------------------------------
check(
    "gate-addressee(ac13): the event is declared sole authority at every"
    " arrival, including a recover re-entry",
    "this event is the sole authority for the check, at every arrival"
    " including a `/th:recover` re-entry" in gate_handling_slice,
    "the sole-authority-including-recover clause is missing",
)
_state_rows_slice = slice_section(
    orch_text, "- functional_clarity_confirmed:", ("\n- checkpoint_boundary:",)
)
check(
    "gate-addressee(ac13): both 00-state.md clarity fields are declared"
    " DERIVED CACHE ONLY, never consulted in place of the event",
    _state_rows_slice.count("DERIVED CACHE ONLY") == 2
    and "never consulted in place of the event" in _state_rows_slice,
    "one or both 00-state.md clarity fields are not declared a derived"
    " cache, or the never-consulted-in-place clause is missing",
)
check(
    "gate-addressee(ac13): checkpoint.confirmed is enumerated in the"
    " orchestrator's own event catalog",
    "checkpoint.confirmed" in events_schema_slice,
    "checkpoint.confirmed is missing from the `event` schema row",
)

# ---------------------------------------------------------------------------
# The confirmatory-text field gets a named, additive exception to the
# free-text field bound, written identically at both sites
# ---------------------------------------------------------------------------
_orch_freetext_slice = slice_section(
    orch_text,
    "### Free-text field bound",
    ("\n### `tools` propagation",),
)
_obs_freetext_slice = slice_section(
    observability_text,
    "### Free-text field bound",
    ("\n## Placement in 00-execution-events",),
)
for _site_name, _site_slice in (
    ("agents/orchestrator.md", _orch_freetext_slice),
    ("docs/observability.md", _obs_freetext_slice),
):
    check(
        f"gate-addressee(ac14): {_site_name} names the checkpoint.confirmed"
        " exception (<=280 chars, JSON-escaped, byte-level backtick escape,"
        " visible truncation, secret prohibition unaffected)",
        "≤280 chars" in _site_slice
        and "ESCAPED as JSON string escapes, never stripped" in _site_slice
        and "U+0060" in _site_slice
        and "…[truncated]" in _site_slice
        and "secret prohibition" in _site_slice.lower(),
        f"{_site_name}'s named exception is missing one or more required"
        " facets",
    )
    check(
        f"gate-addressee(ac14): {_site_name} keeps the general clause"
        " byte-preserved for every other free-text field",
        "≤120 chars" in _site_slice
        and "never multi-sentence narrative prose" in _site_slice,
        f"{_site_name}'s general free-text-bound clause was altered",
    )
    check(
        f"gate-addressee(ac14): {_site_name} declares the two sites must"
        " not diverge",
        "must not diverge" in _site_slice,
        f"{_site_name} no longer declares the two-site divergence bound",
    )

# ---------------------------------------------------------------------------
# leader.md — the two gate-facing sections declare ownership of rendering
# and name the anti-substitution rule, matching the orchestrator's own side
# ---------------------------------------------------------------------------
leader_mediation_slice = slice_section(
    leader_text, "## Gate mediation", ("\n1. **The orchestrator prepares",)
)
leader_presentation_slice = slice_section(
    leader_text, "### Gate presentation protocol", ("\n2. **Relay.**",)
)
check(
    "gate-addressee(leader): '## Gate mediation' declares the leader owns"
    " gate rendering on the normal path and names the takeover fallback",
    "You own gate rendering on the normal path" in leader_mediation_slice
    and "The one path where you are not in the loop is takeover"
    in leader_mediation_slice,
    "the leader's rendering-ownership statement or takeover-fallback"
    " statement is missing",
)
check(
    "gate-addressee(leader): '### Gate presentation protocol' keeps the"
    " byte-identical 'the STOP-block options the orchestrator returned'"
    " clause and adds the anti-substitution rule",
    "the STOP-block options the orchestrator returned" in leader_presentation_slice
    and "is a contract violation, not a formatting choice" in leader_presentation_slice,
    "the leader's presentation-step clause was altered or the"
    " anti-substitution rule is missing",
)

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print()
total = len(results)
passed = sum(1 for ok, _ in results if ok)
print("=" * 60)
print(f"  gate-addressee contract tests: {passed} passed / {total} total")
print("=" * 60)
if passed != total:
    print()
    print("Failures:")
    for ok, msg in results:
        if not ok:
            print(f"  - {msg}")
    sys.exit(1)
sys.exit(0)
