#!/usr/bin/env python3
"""Structural checks for the converged Claude/Codex pipeline contract.

The pipeline is specified by Markdown because both runtimes consume prose.  This
suite checks the small set of machine-shaped invariants that must not drift across
the two projections: the v3 state sequence, correction routing, direct execution,
single-writer ownership, and gate input aliases.
"""

from __future__ import annotations

import re
import subprocess
import sys
import tempfile
import os
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MACHINE = (
    "design",
    "waiting_gate1",
    "implementation",
    "validation",
    "waiting_gate3",
    "delivery",
    "complete",
)
MACHINE_TEXT = " → ".join(MACHINE)


def read(relative: str) -> str:
    path = ROOT / relative
    if not path.is_file():
        raise AssertionError(f"missing contract file: {relative}")
    return path.read_text(encoding="utf-8")


def section(text: str, start: str, *stops: str, to_end: bool = False) -> str:
    """Slice one named contract section without depending on line numbers."""
    begin = text.find(start)
    if begin < 0:
        raise AssertionError(f"missing section anchor: {start!r}")
    end = len(text)
    matched_stop = False
    for stop in stops:
        candidate = text.find(stop, begin + len(start))
        if candidate >= 0:
            end = min(end, candidate)
            matched_stop = True
    if not to_end and not matched_stop:
        raise AssertionError(f"missing section stop after {start!r}: {stops!r}")
    return text[begin:end]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def require_any(text: str, markers: tuple[str, ...], message: str) -> None:
    lowered = text.lower()
    require(any(marker.lower() in lowered for marker in markers), message)


@dataclass(frozen=True)
class TransitionOutcome:
    """Machine-shaped result extracted from one post-Gate-1 routing row."""

    owner: str
    phase: str
    architect: str
    gate: str
    delta: int


EXPECTED_POST_GATE1: dict[str, TransitionOutcome] = {
    "mechanical": TransitionOutcome("main", "implementation", "prohibited", "none", 0),
    "decision": TransitionOutcome(
        "main", "implementation", "explicit-only", "none", 0
    ),
    "architect-request": TransitionOutcome(
        "main", "design", "allowed", "new-gate1", 0
    ),
    "implementation": TransitionOutcome("main", "validation", "prohibited", "none", 1),
    "evidence": TransitionOutcome("main", "validation", "prohibited", "none", 1),
}


def _table_cells(line: str) -> list[str]:
    """Return Markdown table cells without treating inline pipes as fields."""
    if not line.lstrip().startswith("|"):
        return []
    cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
    if len(cells) < 2 or all(re.fullmatch(r":?-+:?", cell) for cell in cells):
        return []
    return cells


def _route_key(label: str) -> str | None:
    lowered = label.lower()
    if "mechanical" in lowered:
        return "mechanical"
    if "decision-bearing" in lowered or "security-obligation" in lowered:
        return "decision"
    if "explicit" in lowered and "architect" in lowered:
        return "architect-request"
    if "correctable code" in lowered or "implementation executor" in lowered:
        return "implementation"
    if "missing" in lowered or "insufficient evidence" in lowered:
        return "evidence"
    return None


def _table_owner(text: str) -> str:
    """Normalize one Codex routing-table owner cell."""
    if re.search(r"\btester\b", text):
        return "tester"
    if "implementation executor" in text:
        return "implementation"
    return "main" if re.search(r"\bmain\b", text) else ""


def _table_phase(text: str, key: str) -> str:
    """Extract the continuation phase, including table-specific shorthand."""
    match = re.search(r"`phase:\s*(design|implementation|validation)`", text)
    if match:
        return match.group(1)
    shorthand = {
        "evidence": ("affected validation", "validation"),
        "implementation": ("return to implementation", "implementation"),
        "architect-request": ("phase: design", "design"),
    }
    marker, phase = shorthand.get(key, ("", ""))
    return phase if marker in text else ""


def _table_architect(text: str) -> str:
    """Normalize the architect-permission cell."""
    if "prohibited unless" in text or "unless separately" in text:
        return "explicit-only"
    if "allowed" in text:
        return "allowed"
    return "prohibited" if "prohibited" in text else ""


def _table_gate(text: str) -> str:
    """Normalize the Gate-1 consequence from a continuation cell."""
    if re.search(r"\bno new gate 1\b", text):
        return "none"
    return "new-gate1" if re.search(r"\bnew gate 1\b", text) else ""


def _table_delta(text: str) -> int | None:
    """Return a valid iteration delta, or None for malformed table input."""
    match = re.fullmatch(r"`?([+-]?\d+)`?", text.strip())
    return int(match.group(1)) if match else None


def _parse_table_outcome(cells: list[str], source: str) -> tuple[str, TransitionOutcome] | None:
    """Parse one row from the Codex authoritative transition table."""
    if len(cells) != 5 or (key := _route_key(cells[0])) is None:
        return None
    continuation = cells[2].lower()
    owner = _table_owner(cells[1].lower())
    phase = _table_phase(continuation, key)
    architect = _table_architect(cells[3].lower())
    gate = _table_gate(continuation)
    delta = _table_delta(cells[4])
    if not all((owner, phase, architect, gate)) or delta is None:
        raise AssertionError(f"{source}: malformed transition row {cells!r}")
    return key, TransitionOutcome(owner, phase, architect, gate, delta)


def _parse_codex_transition_rows(text: str) -> dict[str, TransitionOutcome]:
    """Parse the exhaustive Codex post-Gate-1 table into transition results."""
    block = section(text, "### Authoritative post-Gate-1 routing", "## Start")
    rows: dict[str, TransitionOutcome] = {}
    for line in block.splitlines():
        parsed = _parse_table_outcome(_table_cells(line), "Codex routing table")
        if parsed is None:
            continue
        key, outcome = parsed
        if key in rows:
            raise AssertionError(f"Codex routing table repeats {key!r}")
        rows[key] = outcome
    return rows


def _claude_transition_sections(text: str) -> tuple[str, str]:
    """Return the fixed Claude matrix and its final-result correction contract."""
    route = section(
        text,
        "After Gate 1, the coordinator applies one fixed routing matrix:",
        "Every pipeline uses this exact sequence",
    )
    final_result = section(
        text,
        "## Final-result correction and structural contradiction",
        "### Implementation checkpoint",
    )
    return route.lower(), final_result.lower()


def _parse_claude_transition_rows(text: str) -> dict[str, TransitionOutcome]:
    """Parse explicit machine fields from Claude's fixed routing projection."""
    route, final_result = _claude_transition_sections(text)
    rows: dict[str, TransitionOutcome] = {}
    field_pattern = re.compile(
        r"`route: (?P<key>[a-z-]+)`;\s*"
        r"`owner: (?P<owner>main|implementation|tester)`;\s*"
        r"`phase: (?P<phase>design|implementation|validation)`;\s*"
        r"`architect: (?P<architect>prohibited|explicit-only|allowed)`;\s*"
        r"`gate: (?P<gate>none|new-gate1)`;\s*"
        r"`iteration delta: (?P<delta>[+-]?\d+)`"
    )
    for match in field_pattern.finditer(f"{route}\n{final_result}"):
        key = match.group("key")
        require(key not in rows, f"Claude routing prose repeats {key!r}")
        rows[key] = TransitionOutcome(
            match.group("owner"),
            match.group("phase"),
            match.group("architect"),
            match.group("gate"),
            int(match.group("delta")),
        )
    return rows


def _claude_security_obligation_contracts() -> tuple[tuple[str, str], ...]:
    """Return the two coordinator-owned Claude security-routing contracts."""
    pipeline = read("agents/ref-pipeline.md")
    return (
        ("Claude authoritative routing matrix", _claude_transition_sections(pipeline)[0]),
        (
            "Claude shared plan-write boundary",
            section(
                read("agents/_shared/plan-consolidation.md"),
                "## Write-scope on the plan set (closed list)",
                "## Final-result finding coordinates",
            ).lower(),
        ),
    )


def _require_claude_security_obligation_routes() -> None:
    """Require full decision/audit handling in both Claude coordinator contracts."""
    markers = (
        "security-obligation change is never mechanical",
        "decision-bearing",
        "bounded live operator decision",
        "implementation → freeze → fresh security audit → validation",
        "architect is prohibited unless the live operator separately and explicitly requests architect work",
        "`iteration` delta: `0`",
    )
    for label, contract in _claude_security_obligation_contracts():
        flat = re.sub(r"\s+", " ", contract.lower())
        require(all(marker in flat for marker in markers), f"{label}: security-obligation route drifted")


def _claude_decision_route_contracts() -> tuple[tuple[str, str], ...]:
    """Return Claude post-Gate-1 sections where decisions could select a phase."""
    pipeline = read("agents/ref-pipeline.md")
    return _claude_security_obligation_contracts() + (
        ("Claude iteration rules", section(pipeline, "## Iteration rules", "## Phase timeouts")),
        ("Claude final-result correction", _claude_transition_sections(pipeline)[1]),
        ("Claude audit correction", section(pipeline, "### The audit never iterates", "### Knowledge write on audit findings")),
    )


def _reject_unqualified_decision_to_design() -> None:
    """Reject post-Gate-1 decision clauses that can open design on their own."""
    required_request = "separately and explicitly requests architect work"
    transitions = (
        r"\bdecision(?:s)?\b[^.]{0,220}\b(?:reopen|open|return to|set)\s+`?(?:phase:\s*)?design\b[^.]*",
        r"\b(?:reopen|open|return to|set)\s+`?(?:phase:\s*)?design\b[^.]{0,220}\bdecision(?:s)?\b[^.]*",
        r"\bdecision(?:s)?\b[^.]{0,220}\bnew gate 1\b[^.]*",
        r"\bnew gate 1\b[^.]{0,220}\bdecision(?:s)?\b[^.]*",
    )
    for label, contract in _claude_decision_route_contracts():
        flat = re.sub(r"\s+", " ", contract.lower())
        for pattern in transitions:
            for match in re.finditer(pattern, flat):
                require(
                    required_request in match.group(0),
                    f"{label}: decision can open design without a separate explicit architect request",
                )


def _require_matching_post_gate1_rows(
    claude: dict[str, TransitionOutcome], codex: dict[str, TransitionOutcome]
) -> None:
    """Compare both projections with the authoritative machine-shaped outcomes."""
    for label, rows in (("Claude", claude), ("Codex", codex)):
        require(set(rows) == set(EXPECTED_POST_GATE1), f"{label} transition rows drifted: {sorted(rows)}")
        for key, expected in EXPECTED_POST_GATE1.items():
            require(rows[key] == expected, f"{label} {key} transition drifted: {rows[key]!r}")


def _require_codex_security_obligation_route() -> None:
    """Preserve the equivalent Codex security-obligation routing guarantee."""
    block = section(read("plugins/team-harness/skills/pipeline/SKILL.md"), "### Authoritative post-Gate-1 routing", "## Start").lower()
    markers = (
        "security-obligation classification",
        "bounded live operator decision",
        "implementation → freeze → validation",
        "conditional security review",
    )
    require(all(marker in block for marker in markers), "Codex security-obligation transition lost operator/Freeze/security validation")


def _require_iteration_cause_contract() -> None:
    """Keep fresh correction events verification-only while retaining old history."""
    iteration = section(read("agents/ref-pipeline.md"), "### `cause` and the severity floor", "### Pre-decision consolidation over a failed validation fan").lower()
    iteration_flat = re.sub(r"\s+", " ", iteration)
    state_iteration = re.sub(r"\s+", " ", read("agents/_shared/orchestrator-state.md").lower())
    require(
        "new `iteration.start` events are authorized-correction-only" in iteration_flat
        and "new writers emit only `cause: verification`" in state_iteration
        and "historical `cause: operator` remains readable" in iteration_flat
        and "is not produced" in iteration_flat,
        "Claude iteration compatibility permits new operator-cause correction events",
    )
    require(
        "every `iteration.start` carries `cause: operator" not in iteration_flat
        and "new writers emit only `cause: operator" not in state_iteration,
        "Claude iteration compatibility still produces operator-cause events",
    )


def check_authoritative_post_gate1_transitions() -> None:
    """Claude/Codex transition rows have identical machine-shaped outcomes."""
    claude = _parse_claude_transition_rows(read("agents/ref-pipeline.md"))
    codex = _parse_codex_transition_rows(read("plugins/team-harness/skills/pipeline/SKILL.md"))
    _require_matching_post_gate1_rows(claude, codex)
    _require_claude_security_obligation_routes()
    _reject_unqualified_decision_to_design()
    _require_codex_security_obligation_route()
    _require_iteration_cause_contract()


def check_v3_machine() -> None:
    """Claude and Codex expose the same seven named states and no alternate v3."""
    state_paths = (
        "agents/_shared/orchestrator-state.md",
        "plugins/team-harness/skills/pipeline/references/state-and-gates.md",
    )
    for relative in state_paths:
        text = read(relative)
        require("pipeline_version: 3" in text, f"{relative}: missing v3 marker")
        match = re.search(r"(?m)^phase:\s*([^#\n]+)", text)
        require(match is not None, f"{relative}: missing phase schema")
        phases = tuple(part.strip() for part in match.group(1).split("|"))
        require(
            phases == MACHINE + ("blocked", "aborted"),
            f"{relative}: phase schema drifted: {phases!r}",
        )

    flow_paths = (
        "agents/ref-pipeline.md",
        "plugins/team-harness/skills/pipeline/SKILL.md",
        "plugins/team-harness/skills/pipeline/references/state-and-gates.md",
        "plugins/team-harness/skills/pipeline/references/design.md",
        "plugins/team-harness/skills/pipeline/references/recovery.md",
    )
    for relative in flow_paths:
        text = read(relative)
        require(
            MACHINE_TEXT in text,
            f"{relative}: canonical machine sequence is missing",
        )

    # The transition diagram is the Claude source of truth; Codex carries the
    # same phase and gate edges through its state/recovery references.
    claude_flow = section(read("agents/ref-pipeline.md"), "## Pipeline flow", "## Phase index")
    require(MACHINE_TEXT in claude_flow, "Claude transition diagram does not use v3 machine")
    require("failed fan → operator correction decision" in claude_flow, "Claude failed-fan edge drifted")
    require("amend → implementation" in claude_flow, "Claude amend edge drifted")
    require("edit/reject → design" in claude_flow, "Claude Gate 1 edge drifted")


def _corrective_route_contracts() -> dict[str, str]:
    """Collect the bounded Claude/Codex contracts used by correction checks."""
    claude_pipeline = read("agents/ref-pipeline.md")
    codex_pipeline = read("plugins/team-harness/skills/pipeline/SKILL.md")
    codex_validation = read("plugins/team-harness/skills/pipeline/references/validation.md")
    return {
        "claude_pipeline": claude_pipeline,
        "claude_correction": _claude_transition_sections(claude_pipeline)[1],
        "claude_audit": section(claude_pipeline, "### The audit never iterates", "### Knowledge write on audit findings"),
        "claude_gate3": section(claude_pipeline, "## STAGE-GATE-3", "## Delivery"),
        "codex_pipeline": codex_pipeline,
        "codex_validation": codex_validation,
        "codex_routes": "\n".join((codex_pipeline, codex_validation, read("runtime/codex/instructions/security.md"), read("runtime/codex/instructions/tester.md"))),
        "codex_sensitive": section(codex_pipeline, "## Stage 1 and final-result routing", "## Start"),
    }


def _require_ordinary_corrective_routes(contracts: dict[str, str]) -> None:
    """Require consolidated, explicitly authorized validation corrections."""
    claude = re.sub(r"\s+", " ", contracts["claude_pipeline"].lower())
    codex = re.sub(r"\s+", " ", contracts["codex_pipeline"].lower())
    for label, text in (("Claude", claude), ("Codex", codex)):
        require("complete" in text and "consolidat" in text, f"{label}: failed fan is not consolidated")
        require("authorize one correction round" in text, f"{label}: live correction choice missing")
        require("correction.decision" in text, f"{label}: correction decision is not dual-recorded")
        require("fresh" in text and "validation fan" in text, f"{label}: authorized round lacks a fresh full fan")
        require("automatic" in text, f"{label}: automatic correction prohibition missing")
    validation = re.sub(r"\s+", " ", contracts["codex_validation"].lower())
    require("choice `2` performs no repository or evidence mutation" in validation, "Codex pause choice can mutate")
    require("choice `3` aborts without correction" in validation, "Codex abort choice can mutate")
    require("a second failure requires a fresh presentation and nonce" in validation, "Codex second failure can loop automatically")


def _require_sensitive_audit_routes(contracts: dict[str, str]) -> None:
    """Require the implementation/Freeze/fresh-audit loop for sensitive findings."""
    for label, text in (("Claude", contracts["claude_audit"]), ("Codex", contracts["codex_sensitive"])):
        lowered = text.lower()
        require("implementation" in lowered, f"{label}: sensitive route lacks implementation")
        require("freeze" in lowered, f"{label}: sensitive route lacks Freeze reopening")
        require_any(text, ("fresh security audit", "fresh audit", "fresh full tester/qa/adversary", "re-audit", "re-audit required"), f"{label}: sensitive route lacks fresh audit requirement")
    require("broke-it" in contracts["claude_audit"], "Claude audit route lost broke-it handling")
    require("incomplete_on_changed_control" in contracts["claude_audit"], "Claude audit route lost incomplete sensitive-coverage handling")
    require("sensitive coverage gap" in contracts["codex_routes"].lower(), "Codex route lost sensitive coverage handling")


def _require_gate3_security_routes(contracts: dict[str, str]) -> None:
    """Ensure correctable sensitive findings cannot reach shipping approval."""
    claude_gate3 = re.sub(r"\s+", " ", contracts["claude_gate3"])
    require("prevents this state entirely" in claude_gate3 and "never reaches this gate" in claude_gate3, "Claude: correctable sensitive findings can reach Gate 3")
    require("broke-it" in claude_gate3 and "incomplete sensitive-coverage" in claude_gate3, "Claude: Gate 3 does not name both fail-closed security cases")
    validation = re.sub(r"\s+", " ", contracts["codex_validation"].lower())
    require("do not ship until every required audit has seen the current anchor" in validation, "Codex: Gate 3 can ship a sensitive delta before re-audit")
    codex = contracts["codex_pipeline"].lower()
    require("correctable sensitive finding" in codex and "fresh security audit" in codex, "Codex: sensitive correction route is not tied to fresh audit")


def _require_structural_contradiction_routes(contracts: dict[str, str]) -> None:
    """Require operator-controlled design/Gate-1 handling for contradictions."""
    for label, text in (("Claude", contracts["claude_correction"]), ("Codex", contracts["codex_routes"])):
        lowered = text.lower()
        require("structural contradiction" in lowered, f"{label}: contradiction route missing")
        require("operator" in lowered, f"{label}: contradiction route lacks operator decision")
        require("design" in lowered and "gate 1" in lowered, f"{label}: contradiction route lacks new Gate 1")


def check_corrective_routes() -> None:
    """The final-result correction routes remain equivalent across projections."""
    contracts = _corrective_route_contracts()
    _require_ordinary_corrective_routes(contracts)
    _require_sensitive_audit_routes(contracts)
    _require_gate3_security_routes(contracts)
    _require_structural_contradiction_routes(contracts)


def check_explicit_validation_correction_decision() -> None:
    """A failed fan pauses; one fresh live decision authorizes one round."""
    claude = "\n".join(
        (read("agents/ref-pipeline.md"), read("agents/_shared/orchestrator-state.md"))
    )
    codex = "\n".join(
        (
            read("plugins/team-harness/skills/pipeline/SKILL.md"),
            read("plugins/team-harness/skills/pipeline/references/state-and-gates.md"),
            read("plugins/team-harness/skills/pipeline/references/validation.md"),
        )
    )
    for label, text in (("Claude", claude), ("Codex", codex)):
        flat = re.sub(r"\s+", " ", text.lower())
        for marker in (
            "correction_pending: true",
            "correction_nonce",
            "correction.decision",
            "1 — authorize one correction round",
            "2 — pause without changes",
            "3 — abort pipeline",
            "generic `continue`",
            "3/3+exception",
            "correction_exceptional",
            "exceptional_correction_count",
        ):
            require(marker in flat, f"{label}: correction-decision marker missing: {marker}")
        require("every required" in flat and "lens" in flat, f"{label}: validation can short-circuit before the full fan")
        require("fresh" in flat and "nonce" in flat, f"{label}: repeated failure can reuse a decision")
        require("exactly one" in flat, f"{label}: authorization is not bounded to one round")
        for marker in (
            "bounded evidence triage",
            "resolve|design-consistent|decision-required",
            "proposal is advisory",
            "only the live operator",
            "security floor is violated",
            "part of the design",
        ):
            require(marker in flat, f"{label}: operator finding-disposition marker missing: {marker}")
        for marker in (
            "approved-autonomous",
            "correction_authority: gate1-autonomous",
            "correction_authority_gate_nonce",
            "iteration < 3",
            "fresh implementer",
            "scope expansion",
            "security ambiguity",
        ):
            require(marker in flat, f"{label}: bounded autonomous-loop marker missing: {marker}")
        require(
            "fresh full validation fan" in flat or "fresh complete validation fan" in flat,
            f"{label}: autonomous correction lacks a fresh complete validation fan",
        )
        require("normal approval" in flat and "paus" in flat, f"{label}: ordinary approve can loop automatically")

    for relative in (
        "agents/qa.md",
        "agents/security.md",
        "agents/adversary.md",
        "agents/tester.md",
        "runtime/codex/instructions/qa.md",
        "runtime/codex/instructions/security.md",
        "runtime/codex/instructions/tester.md",
    ):
        text = read(relative)
        flat = re.sub(r"\s+", " ", text.lower())
        require("suggested correction" in flat, f"{relative}: validator lacks advisory correction coordinate")
        for forbidden in (
            "correction route",
            "freeze: reopened",
            "re-audit: required",
            "correction_route",
            "freeze_reopened",
            "reaudit_required",
        ):
            require(forbidden not in flat, f"{relative}: validator still owns routing: {forbidden}")

    claude_iteration = section(
        read("agents/ref-pipeline.md"),
        "### Remediation prefers removal or replacement over addition",
        "### Authorized correction round",
    ).lower()
    for forbidden in ("`qa` only", "affected verifiers", "`qa` full"):
        require(forbidden not in claude_iteration, f"Claude correction table retains partial verifier rerun: {forbidden}")
    require(
        claude_iteration.count("fresh full tester/qa/adversary fan") == 3,
        "Claude correction cases do not all require the fresh full fan",
    )

    recovery = read("plugins/team-harness/skills/pipeline/references/recovery.md")
    recovery_flat = re.sub(r"\s+", " ", recovery.lower())
    for marker in (
        "stale or consumed nonce",
        "mismatched anchor/findings/scope",
        "reuse of one authorization",
        "without the matching decision",
        "recovery never synthesizes",
        "historical `3/3+exception`",
        "missing or mismatched `correction_exceptional` boolean",
        "authorize decision carrying `correction_exceptional: true`",
        "at most three `gate1-autonomous` correction decisions",
        "a fourth",
        "exact consumed gate-1 nonce",
        "no correction/execution budget exhaustion",
        "exact one-to-one disposition for every finding",
        "before issuing a fresh nonce",
        "missing, extra, duplicated, or mismatched findings/dispositions",
        "for `iteration < 3`, require `correction_exceptional: false`",
        "at `iteration: 3/3`, require `exceptional_correction_count: 0`",
        "`correction_exceptional: true`",
        "authorize one exceptional correction round",
        "ordinary recovered choice text can never authorize an exceptional round",
        "require `exceptional_correction_count: 0`",
        "may offer only pause or abort",
        "any second exceptional presentation",
        "`correction_nonce: null`",
        "exact token in `correction_decision_nonce`",
        "mismatched decision nonce",
    ):
        require(marker in recovery_flat, f"Codex recovery: fail-closed marker missing: {marker}")

    state_gate = re.sub(r"\s+", " ", read("plugins/team-harness/skills/pipeline/references/state-and-gates.md").lower())
    require(
        "correction/execution budget exhaustion" in state_gate,
        "Codex autonomous closed predicate omits budget exhaustion",
    )
    require(
        "consumed token in `correction_decision_nonce`" in state_gate
        and "`correction_nonce: null`" in state_gate,
        "Codex autonomous correction does not persist exact nonce consumption",
    )
    require(
        "only while `exceptional_correction_count: 0`" in state_gate
        and "sets `exceptional_correction_count: 1`" in state_gate
        and "only pause or abort" in state_gate,
        "Codex permits repeated exceptional correction rounds",
    )

    planning = re.sub(
        r"\s+",
        " ",
        section(
            read("plugins/team-harness/skills/pipeline/SKILL.md"),
            "## Stage 1 and final-result routing",
            "### Authoritative post-Gate-1 routing",
        ).lower(),
    )
    require("stage 1 is one bounded architect pass" in planning, "Codex planning is not Architect-only by default")
    require("do not run an automatic" in planning and "`qa-plan`" in planning and "`plan-reviewer`" in planning, "Codex planning can auto-dispatch plan reviewers")
    require("only when the operator explicitly invokes it" in planning, "Codex plan review is not explicit-only")
    claude_planning = re.sub(r"\s+", " ", read("agents/ref-pipeline.md").lower())
    require("`/th:plan-review` is an explicit operator flow only" in claude_planning, "Claude plan review is not explicit-only")


def check_direct_predicate() -> None:
    """Direct eligibility and a live `hazlo tú` preference cannot dispatch silently."""
    claude = "\n".join(
        (
            read("agents/orchestrator.md"),
            read("skills/setup/managed-blocks/orchestrator-dispatch-rule.md"),
        )
    ).lower()
    codex_init = read("plugins/team-harness/skills/init/SKILL.md").lower()
    codex_pipeline = read("plugins/team-harness/skills/pipeline/SKILL.md").lower()
    codex_implementation = read(
        "plugins/team-harness/skills/pipeline/references/implementation.md"
    ).lower()

    predicate_markers = (
        ("at most three", "three files", "≤3 files"),
        ("one top-level domain", "in one domain"),
        ("reversible",),
        ("non-sensitive",),
        ("public api", "public api/schema/security"),
        ("specialist-only",),
    )
    for label, text in (("Claude", claude), ("Codex init", codex_init)):
        missing = [
            "/".join(options)
            for options in predicate_markers
            if not any(option in text for option in options)
        ]
        require(not missing, f"{label}: direct predicate missing {missing}")

    require("hazlo tú" in claude or "hazlo tu" in claude, "Claude: missing live hazlo tú preference")
    require("hazlo tú" in codex_init or "hazlo tu" in codex_init, "Codex init: missing live hazlo tú preference")
    require_any(
        claude,
        ("must not dispatch `implementer`", "never dispatches implementer", "silent specialist dispatch"),
        "Claude: eligible hazlo tú path can silently dispatch",
    )
    require("never dispatches `implementer`" in codex_init, "Codex init: eligible hazlo tú path can dispatch")
    require_any(
        codex_init,
        ("stop before dispatching", "stops before dispatch"),
        "Codex init: ineligible hazlo tú path does not stop before dispatch",
    )

    # In an active pipeline the preference changes only the implementation
    # executor after Gate 1; it cannot waive validation, Freeze, or either gate.
    active = "\n".join((codex_pipeline, codex_implementation))
    require("after gate 1" in active, "Codex: hazlo tú is not bound to post-Gate-1 implementation")
    for marker in ("freeze", "validation", "both gates", "delivery"):
        require(marker in active, f"Codex: hazlo tú route can skip {marker}")


def check_single_writer() -> None:
    """Only the coordinator owns state, events, gate presentation, and releases."""
    claude_owner = "\n".join(
        (
            read("agents/_shared/orchestrator-state.md"),
            read("agents/ref-pipeline.md"),
            read("agents/orchestrator.md"),
        )
    ).lower()
    codex_owner = "\n".join(
        (
            read("plugins/team-harness/skills/pipeline/references/state-and-gates.md"),
            read("plugins/team-harness/skills/pipeline/SKILL.md"),
            read("plugins/team-harness/skills/pipeline/references/activation.md"),
        )
    ).lower()
    for label, text in (("Claude", claude_owner), ("Codex", codex_owner)):
        require(
            "sole writer" in text or "exclusively owns" in text,
            f"{label}: coordinator ownership marker missing",
        )
        require("gate" in text and "release" in text, f"{label}: gate ownership marker missing")
    require("primary codex thread exclusively owns" in codex_owner, "Codex: primary-thread ownership drifted")
    require("no specialist writes coordination state" in claude_owner, "Claude: specialist state prohibition drifted")

    # Runtime adapters are the executable role boundary. Every specialist must
    # explicitly deny both coordination-state writes and gate decisions.
    for role in ("architect", "implementer", "tester", "qa", "security", "delivery"):
        adapter = read(f"runtime/codex/instructions/{role}.md").lower()
        state_denied = re.search(
            r"\b(?:do not|never|must not|may not)\b[^.;\n]*\bwrite\b[^.;\n]*(?:\b00-state\b|\bcoordination state\b)",
            adapter,
        )
        gate_denied = re.search(
            r"\b(?:do not|never|must not)\b[^.;\n]*\b(?:approve|release)\b[^.;\n]*\bgates?\b",
            adapter,
        )
        require(state_denied is not None, f"Codex {role}: may write coordination state")
        require(gate_denied is not None, f"Codex {role}: may approve or release a gate")


def check_codex_qa_checkbox_mirror_owner() -> None:
    """Read-only QA reports AC PASS; Main alone persists the mirror."""
    sources = (
        ("Codex validation", read("plugins/team-harness/skills/pipeline/references/validation.md")),
        ("Codex QA adapter", read("runtime/codex/instructions/qa.md")),
        ("Codex pipeline", read("plugins/team-harness/skills/pipeline/SKILL.md")),
    )
    for label, text in sources:
        flat = re.sub(r"\s+", " ", text.lower())
        require("ac-n: pass" in flat, f"{label}: QA PASS result is missing")
        require("checkbox mirror" in flat, f"{label}: checkbox-mirror ownership is missing")
        require("only writer" in flat, f"{label}: Main single-writer ownership is missing")
    validation = sources[0][1].lower()
    adapter = sources[1][1].lower()
    require("qa may update" not in validation, "Codex validation: QA may still update checkbox mirrors")
    require("never edit a checkbox mirror yourself" in adapter, "Codex QA adapter: read-only mirror edit ban is missing")


def check_gate_aliases() -> None:
    """Numeric gate choices are exact text aliases; invalid replies release nothing."""
    claude = read("agents/_shared/gate-contract.md")
    codex = read("plugins/team-harness/skills/pipeline/references/state-and-gates.md")
    expected_aliases = (
        (
            ("`1`/`approve`", "1 — approve"),
            ("`2`/`approve autonomous`", "2 — approve autonomous"),
            ("`3: detail`/`edit`", "3: detail — edit"),
            ("`4: reason`/`reject`", "4: reason — reject"),
        ),
        (
            ("`1`/`ship`", "1 — ship"),
            ("`2`/`amend`", "2 — amend"),
            ("`3`/`abort`", "3 — abort"),
        ),
    )
    for label, text in (("Claude", claude), ("Codex", codex)):
        for alias_group in expected_aliases:
            for alternatives in alias_group:
                require(
                    any(alias in text for alias in alternatives),
                    f"{label}: numeric/text gate aliases drifted ({alternatives!r})",
                )
        lowered = text.lower()
        require_any(
            text,
            ("a bare `3` or `4`", "bare `3`/`4`", "bare 3/4", "bare 3 or 4"),
            f"{label}: bare edit/reject is not invalid",
        )
        require_any(
            text,
            ("unknown number", "out-of-allowlist", "does not map cleanly"),
            f"{label}: unknown numeric reply is not invalid",
        )
        require("releases nothing" in lowered, f"{label}: invalid reply can release a gate")
        require_any(
            text,
            ("dual-record", "matching event", "field without its event"),
            f"{label}: gate does not require the dual record",
        )
        require("fresh" in lowered and "nonce" in lowered, f"{label}: invalid reply does not re-present with a nonce")


def check_profile_and_document_guards() -> None:
    """The current contract has exactly two postures and no active route selector."""
    lanes = read("docs/pipeline-lanes.md")
    how = read("docs/how-it-works.md")
    intake = read("agents/ref-intake-flows.md")
    orchestrator = read("agents/orchestrator.md")
    state_contract = read("agents/_shared/orchestrator-state.md")
    codex_init = read("plugins/team-harness/skills/init/SKILL.md")
    codex_config = read("plugins/team-harness/skills/init/references/configuration.md")
    codex_pipeline = read("plugins/team-harness/skills/pipeline/SKILL.md")
    codex_activation = read("plugins/team-harness/skills/pipeline/references/activation.md")
    codex_state = read("plugins/team-harness/skills/pipeline/references/state-and-gates.md")

    posture_sources = (
        ("Claude lanes", lanes),
        ("Claude intake", intake),
        ("Claude orchestrator", orchestrator),
        ("Claude state", state_contract),
        ("Codex init", codex_init),
        ("Codex pipeline", codex_pipeline),
        ("Codex activation", codex_activation),
        ("Codex state", codex_state),
    )
    for label, text in posture_sources:
        lowered = text.lower()
        require("inline" in lowered and "pipeline" in lowered, f"{label}: posture names drifted")
    for label, text in (
        ("Claude lanes", lanes),
        ("Claude intake", intake),
        ("Codex init", codex_init),
        ("Codex pipeline", codex_pipeline),
        ("Codex activation", codex_activation),
    ):
        require_any(
            text,
            ("exactly two postures", "two postures only", "only postures"),
            f"{label}: exactly-two-postures invariant is missing",
        )

    # The machine schema itself must not acquire a lane/profile/tier selector.
    # Use the first fenced block after the Current State heading; this avoids
    # rejecting the explicit compatibility prose later in the same document.
    schema_open = state_contract.find("```", state_contract.find("Current State"))
    schema_close = state_contract.find("```", schema_open + 3)
    require(schema_open >= 0 and schema_close > schema_open, "Claude state: schema fence missing")
    claude_schema = state_contract[schema_open:schema_close].lower()
    codex_current = section(codex_state, "## One machine", "## Ownership and snapshot").lower()
    for label, schema in (("Claude", claude_schema), ("Codex", codex_current)):
        require("lane:" not in schema, f"{label}: active schema still exposes lane")
        require("lane_autoselect" not in schema, f"{label}: active schema exposes lane_autoselect")
        require("profile:" not in schema, f"{label}: active schema exposes a profile field")
        require("tier-0" not in schema and "tier 0" not in schema, f"{label}: active schema exposes Tier 0")

    # Active pipeline work cannot downgrade in place; the only transition is an
    # administrative close that writes no release and then returns to inline.
    for label, text in (("Claude", orchestrator + lanes), ("Codex", codex_pipeline + codex_activation)):
        flat = re.sub(r"\s+", " ", text.lower())
        require("administrative close" in flat, f"{label}: active inline switch lacks administrative close")
        require("no gate release" in flat, f"{label}: administrative close can release a gate")
        require("direct" in flat and "pipeline" in flat, f"{label}: direct/pipeline boundary missing")

    # Configuration is for bounded settings/workspace resolution only. Legacy
    # route/profile values are migration data and can never choose a posture.
    for label, text in (
        ("Claude lanes", lanes),
        ("Claude intake", intake),
        ("Codex configuration", codex_config),
        ("Codex activation", codex_activation),
    ):
        flat = re.sub(r"\s+", " ", text.lower())
        require_any(text, ("configuration-selected", "configuration never chooses", "never infer a posture from configuration"), f"{label}: config can select posture")
        require("1 — inline" in text and "2 — pipeline" in text, f"{label}: live migration choices missing")
        require_any(text, ("never silently mapped", "never infer", "not this live choice", "untrusted data", "never chooses a route", "authorize neither posture"), f"{label}: legacy value can be silently mapped")
        if label != "Codex configuration":
            gate_negation = re.search(
                r"(?:\b(?:never|no)\b[^.;\n]{0,180}\bgates?\b|"
                r"\bgates?\b[^.;\n]{0,180}\b(?:never|no)\b)",
                flat,
            )
            require(gate_negation is not None, f"{label}: legacy value can infer a gate")

    # Coordinator ownership remains explicit in both projections. This also
    # guards against reintroducing specialist writes while changing routing.
    specialist_write = re.compile(
        r"(?:`(?:architect|implementer|tester|qa|security|delivery|specialist)`|"
        r"\b(?:architect|implementer|tester|qa|security|delivery|specialist)\b(?!['’]s))"
        r"[^\.\n]*(?:\bwrite\w*|\bedit\w*|\brepair\w*|\bcreate\w*)[^\.\n]*00-state",
        re.IGNORECASE,
    )
    for relative, text in (
        ("agents/ref-special-flows.md", read("agents/ref-special-flows.md")),
        ("docs/how-it-works.md", how),
        ("docs/pipeline-lanes.md", lanes),
    ):
        for match in specialist_write.finditer(text):
            context = match.group(0).lower()
            require(any(marker in context for marker in ("never", "no ", "cannot", "do not", "not ")), f"{relative}: specialist state-writer drift: {match.group(0).strip()}")


def check_recovery_fail_closed() -> None:
    """Legacy recovery requires an explicit 1/2 choice and never infers a gate."""
    recovery_paths = (
        "skills/recover/SKILL.md",
        "plugins/team-harness/skills/pipeline/references/recovery.md",
    )
    for relative in recovery_paths:
        text = read(relative)
        migration_heading = (
            "## v3 and lossless v2 migration"
            if "## v3 and lossless v2 migration" in text
            else "## Version migration (read-only until the orchestrator writes)"
        )
        migration = section(text, migration_heading, "## Gate and resume safety", "## Mode 1")
        lowered = migration.lower()
        flat = re.sub(r"\s+", " ", lowered)
        require("named v2 phases" in flat or "numeric or named v2 phases" in flat, f"{relative}: v2 migration marker missing")
        require("1 — inline" in migration and "2 — pipeline" in migration, f"{relative}: live migration choices missing")
        require("valid dual-record" in flat, f"{relative}: recovery does not require dual-record")
        require("missing field/event" in flat or "missing field" in flat, f"{relative}: partial dual-record is not named invalid")
        require("malformed record" in flat and "mismatched" in flat, f"{relative}: mismatched dual-record is not fail-closed")
        require("stays uncleared" in flat or "remains uncleared" in flat, f"{relative}: invalid dual-record can clear a gate")
        require("never repaired or inferred" in flat or "never repaired" in flat, f"{relative}: recovery repairs/inferences are allowed")
        require("never silently mapped" in flat or "not silently mapped" in flat, f"{relative}: legacy state maps without live choice")
        require(
            ("never infer" in flat or "never repaired or inferred" in flat or "never synthesize a release" in flat)
            and "gate" in flat,
            f"{relative}: legacy state can infer a gate",
        )

        # Numeric legacy phases.
        numeric_rows = (
            "numeric `1`–`1.8` without `01-plan.md`",
            "numeric `1`–`1.8` with Gate 1 uncleared",
            "numeric `1`–`1.8` with a valid Gate 1 dual-record",
            "numeric `2`–`2.7`",
            "numeric `2.8`–`3.5`",
            "numeric `4`–`5`",
            "numeric `6`",
        )
        for row in numeric_rows:
            require(row in migration, f"{relative}: numeric recovery row drifted: {row}")
        require(
            "legacy Gate 3 / numeric `4`–`5` without valid `ship`, `amend`, or `abort` | `waiting_gate3` with valid Gate 1; otherwise `blocked`"
            in migration,
            f"{relative}: numeric Gate 3 partial/mismatch prerequisite is not fail-closed",
        )
        require("numeric `2`–`2.7` | `implementation` only with valid Gate 1; otherwise `blocked`" in migration, f"{relative}: numeric implementation prerequisite is not fail-closed")
        require("numeric `2.8`–`3.5` | `validation` only with valid Gate 1; otherwise `blocked`" in migration, f"{relative}: numeric validation prerequisite is not fail-closed")
        require("numeric `4`–`5` with valid Gate 1 and Gate 3 `ship` | `delivery`" in migration, f"{relative}: numeric delivery prerequisite drifted")
        require("numeric `6` with valid Gate 1 and Gate 3" in migration, f"{relative}: numeric complete prerequisite drifted")

        # Named legacy positions use the same prerequisite matrix; there is no
        # express/profile exception that skips a fresh live choice or a gate.
        for row in (
            "named `design`",
            "named `implementation`",
            "named `validation`",
            "named `waiting_gate3`",
            "named `delivery`",
            "named `complete`",
            "named `aborted`",
        ):
            require(row in migration, f"{relative}: named recovery row drifted: {row}")
        require("named `implementation` | `implementation` only with valid Gate 1" in migration, f"{relative}: named implementation can bypass Gate 1")
        require("named `delivery` | `delivery` only with valid Gate 1 and Gate 3" in migration, f"{relative}: named delivery can bypass a gate")
        require("named `complete` | `complete` only with valid Gate 1 and Gate 3" in migration, f"{relative}: named complete can bypass a gate")
        require("express exception" not in flat, f"{relative}: retired express exception remains executable")
        require("gate_pending: null" in migration or "gate_pending: null" in text, f"{relative}: a pending gate can be treated as released")
        require("exact consumed nonce" in flat, f"{relative}: release validation does not bind the consumed nonce")
        require("presence alone is insufficient" in flat or "presence alone is insufficient" in re.sub(r"\s+", " ", text.lower()), f"{relative}: plan presence can satisfy recovery without structural validation")
        require("state.migrated" in flat, f"{relative}: legacy selectors are not archived")
        require("128 utf-8 bytes" in flat, f"{relative}: migrated legacy evidence is unbounded")
        require("redacted" in flat, f"{relative}: migrated legacy evidence can persist secrets")


def check_residual_corrections() -> None:
    """Negative guards for the remaining canonical-contract regressions."""
    state = read("plugins/team-harness/skills/pipeline/references/state-and-gates.md")
    current = section(state, "## One machine", "## Ownership and snapshot").lower()
    require("inline" in current and "pipeline" in current, "Codex state: two postures missing")
    require("lane:" not in current, "Codex state: lane field remains legal")
    require("lane_autoselect" not in current, "Codex state: lane_autoselect remains legal")
    require("profile:" not in current and "tier-0" not in current, "Codex state: profile/tier route remains legal")

    claude = read("agents/ref-pipeline.md")
    validation = section(claude, "### The audit never iterates", "### Knowledge write on audit findings")
    gate3 = section(claude, "## STAGE-GATE-3", "## Delivery")
    require("consolidated" in validation.lower() and "package" in validation.lower(), "Claude validation: security failure is not consolidated")
    require("fresh full tester/qa/adversary" in validation.lower(), "Claude validation: fresh audit requirement missing")
    require("operator-disposed" not in validation.lower(), "Claude validation: correctable findings remain operator-disposed")
    require("never reaches this gate" in gate3.lower(), "Claude Gate 3: correctable finding can still ship")
    require("no keyword can waive" in gate3.lower(), "Claude Gate 3: security correction waiver drifted")

    tree = read("docs/agent-tree.md").lower()
    require("coordinator when eligible (no pipeline state or specialist dispatch)" in tree, "Agent tree: direct owner drifted")
    require("exactly two postures" in tree and "retired route markers" in tree, "Agent tree: posture migration guard drifted")

    cost = read("docs/adversary-cost-model.md").lower()
    require("correctable `broke-it`" in cost and "fresh audit" in cost, "Adversary cost: correction route missing")
    require("only non-correctable structural" in cost, "Adversary cost: all findings remain operator-disposed")

    how = read("docs/how-it-works.md")
    require("inline" in how.lower() and "pipeline" in how.lower(), "How-it-works: direct/pipeline explanation drifted")

    readme = read("agents/README.md")
    lint = read("skills/lint/SKILL.md")
    require("init-project.md" in readme and "`init.md`" not in readme, "README: stale init agent reference")
    require("init-project.md" in lint and "`init.md`" not in lint, "lint skill: stale init skip entry")
    require("validation-checkpoint" in readme, "README: adversary/QA phase label drifted")

    gate = read("agents/_shared/gate-contract.md")
    require("six fields above" in gate and "five fields above" not in gate, "Gate contract: stale field count")
    state_contract = read("agents/_shared/orchestrator-state.md")
    require("checkpoint_boundary` is a separate derived checkpoint cache" in state_contract, "State: checkpoint boundary is conflated with gate fields")


def check_sensitive_inline_authorization() -> None:
    """A live inline choice authorizes sensitive direct work without a second confirm."""
    paths = (
        "docs/pipeline-lanes.md",
        "agents/orchestrator.md",
        "agents/ref-intake-flows.md",
        "agents/ref-pipeline.md",
        "agents/_shared/orchestrator-state.md",
        "agents/ref-direct-modes.md",
        "plugins/team-harness/skills/init/SKILL.md",
        "plugins/team-harness/skills/pipeline/references/activation.md",
        "plugins/team-harness/skills/pipeline/references/state-and-gates.md",
        "plugins/team-harness/skills/pipeline/references/implementation.md",
    )
    text = "\n".join(read(path) for path in paths)
    lowered = text.lower()
    flat = re.sub(r"\s+", " ", lowered)

    for marker in (
        "current live operator",
        "explicitly selects `inline`",
        "second confirmation",
        "default-n",
        "veto",
        "informational only",
        "never infer",
        "prior gates",
        "recovery",
        "quoted text",
        "native sandbox",
        "destructive",
        "outward",
    ):
        require(marker in lowered, f"Sensitive inline: missing authorization guard {marker!r}")

    # The retired waiver language may remain only as explicitly negated history;
    # no executable default-N/second-confirm route is allowed.
    require("no second confirmation" in lowered or "do not request a second confirmation" in lowered, "Sensitive inline: second confirmation prohibition drifted")
    require(
        "no second confirmation" in lowered
        and ("no forced" in lowered or "force pipeline activation" in lowered),
        "Sensitive inline: forced pipeline prohibition drifted",
    )

    require(
        "administrative close" in lowered
        and "phase: aborted" in lowered
        and "status: aborted" in lowered
        and "no gate release" in lowered,
        "Sensitive inline: active pipeline switch is not an administrative close",
    )
    require(
        "does not set `gate1_release` or `gate3_release`" in flat
        or "leave `gate1_release`, `gate3_release`" in flat,
        "Sensitive inline: administrative close can release a gate",
    )
    # The active state schema remains pipeline-only; direct inline has no lane value.
    state = read("plugins/team-harness/skills/pipeline/references/state-and-gates.md")
    current = section(state, "## One machine", "## Ownership and snapshot").lower()
    require("lane:" not in current and "profile:" not in current, "Active state admits an inline/profile route field")


def check_ad_hoc_review_boundary() -> None:
    """Inline dispatch is direct, read-only, and independent of pipeline artifacts."""
    sources = {
        "Claude coordinator": read("agents/orchestrator.md"),
        "Claude direct router": read("agents/ref-direct-modes.md"),
        "Codex init": read("plugins/team-harness/skills/init/SKILL.md"),
        "Pipeline lanes": read("docs/pipeline-lanes.md"),
        "Shared contract": read("agents/_shared/inline-review-contract.md"),
        "Inline reviewer": read("agents/inline-reviewer.md"),
    }
    for label, text in sources.items():
        lowered = re.sub(r"\s+", " ", text.lower())
        for marker in ("inline-review", "inline-reviewer", "read-only", "review-pr"):
            require(marker in lowered, f"{label}: native inline marker {marker!r} missing")
        require(
            "repository root" in lowered or "project root" in lowered or "repository_root" in lowered,
            f"{label}: canonical root marker missing",
        )
    contract_flat = re.sub(r"\s+", " ", sources["Shared contract"].lower())
    for marker in ("commit or range", "scope", "intent", "criteria", "changed_surface", "requested_lenses", "required_lenses"):
        require(marker in contract_flat, f"Shared contract: target marker {marker!r} missing")
    for artifact in ("workspace", "state", "events", "gates", "branch", "delivery record", "publication"):
        require(artifact in contract_flat, f"Shared contract: inline artifact marker {artifact!r} missing")
    contract = sources["Shared contract"].lower()
    for marker in ("native read-only sandbox", "tester|qa|security|adversary", "security floor", "security_floor", "dispatch_id", "expected_lens", "stale", "recaptures", "no blocker", "unresolved blocking disagreement"):
        require(marker in contract, f"Shared contract: current inline rule {marker!r} missing")
    for role in ("tester", "qa", "security"):
        semantic = read(f"agents/{role}.md").lower()
        adapter = read(f"runtime/codex/instructions/{role}.md").lower()
        for label, text in ((f"Claude {role}", semantic), (f"Codex {role}", adapter)):
            require("inline-review" not in text, f"{label}: retired inline responsibility remains")
            require("run_inline_review" not in text and "evidence_manifest" not in text, f"{label}: retired runner protocol remains")


def check_inline_markers(contract: str) -> None:
    markers = ("mode: inline-review", "repository_root", "commit_or_range", "scope", "intent", "criteria", "changed_surface", "requested_lenses", "required_lenses", "lens: tester|qa|security|adversary", "expected_lens", "dispatch_id", "security_floor", "read_only: true", "target_id", "native read-only sandbox", "security floor", "authentication", "authorization", "ambiguous classification", "currentness", "stale", "lens_status: complete|incomplete|failed|unavailable|untrusted", "verdict: pass", "no blocker", "unresolved blocking disagreement", "never averages verdicts", "absent", "return as pass", "review-pr")
    contract = contract.lower()
    for marker in markers:
        require(marker in contract, f"inline contract missing {marker!r}")
    for marker in ("edit or write", "network", "publication", "external state", "untrusted", "isolated runner", "unavailable", "git --no-pager", "--no-replace-objects", "--literal-pathspecs", "--no-ext-diff", "--no-textconv", "resolved object ids", "canonical repo-relative", "root-contained", "traversal", "control characters", "project-derived command", "filesystem-root confinement", "fresh codex session", "in-memory byte attestation"):
        require(marker in contract, f"inline tool boundary missing {marker!r}")
    for marker in ("every `required_lenses`", "no blocker", "unresolved blocking disagreement", "never averages verdicts", "absent", "return as pass", "verdict: pass"):
        require(marker in contract, f"inline consolidation rule missing {marker!r}")
    for marker in ("replay", "duplicate", "substitution", "mismatch"):
        require(marker in contract, f"inline attempt-identity rule missing {marker!r}")
    for retired in ("evidence_manifest", "manifest_digest", "allowed_roots", "run_inline_review.mjs"):
        require(retired not in contract, f"inline contract retains retired protocol field {retired!r}")


def check_inline_git_hardening() -> None:
    """Inline Git evidence has exact immutable IDs and no config helper execution."""
    contract = read("agents/_shared/inline-review-contract.md")
    resolver_contract = re.sub(r"\s+", " ", contract.lower())
    templates = (
        "git --no-pager --no-replace-objects --literal-pathspecs -c core.fsmonitor=false -c core.untrackedCache=false -c maintenance.auto=false -c gc.auto=0 -c log.showSignature=false -C <canonical-root> diff --no-ext-diff --no-textconv <base-oid> <head-oid> -- <path>...",
        "git --no-pager --no-replace-objects --literal-pathspecs -c core.fsmonitor=false -c core.untrackedCache=false -c maintenance.auto=false -c gc.auto=0 -c log.showSignature=false -C <canonical-root> show --no-ext-diff --no-textconv <object-oid> -- <path>...",
        "git --no-pager --no-replace-objects --literal-pathspecs -c core.fsmonitor=false -c core.untrackedCache=false -c maintenance.auto=false -c gc.auto=0 -c log.showSignature=false -C <canonical-root> log -p --no-ext-diff --no-textconv <base-oid>..<head-oid> -- <path>...",
    )
    for template in templates:
        require(template in contract, f"inline contract misses hardened template: {template}")
    require(
        "For Claude, the\nsemantic reviewer has no Bash capability, so Main MUST use the same hardened\nenvironment, object preflight, argv templates" in contract,
        "Claude Main may diverge from Codex hardened Git templates",
    )
    for marker in (
        "rev-parse --verify --end-of-options <rev>^{commit}",
        "one newline-terminated full 40- or 64-hex object id",
        "range resolves each endpoint separately",
        "<oid>^{tree}",
        "log.showsignature=false",
        "uncommitted inline review is explicitly unsupported",
        "status --porcelain=v1 --untracked-files=all --ignore-submodules=none",
        "verdict-supporting tracked-file bytes",
        "git_optional_locks=0",
        "git_no_lazy_fetch=1",
        "git_allow_protocol=",
        "cat-file -e <full-oid>^{commit|tree|blob}",
        "cat-file blob <blob-oid>",
        "exact keyed join",
    ):
        require(marker in resolver_contract, f"inline contract misses resolver/currentness rule: {marker}")

    with tempfile.TemporaryDirectory() as temporary:
        repo = Path(temporary)
        immutable_env = {
            **os.environ,
            "GIT_OPTIONAL_LOCKS": "0",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_COUNT": "0",
            "GIT_NO_LAZY_FETCH": "1",
            "GIT_ALLOW_PROTOCOL": "",
        }
        immutable_prefix = (
            "git", "--no-pager", "--no-replace-objects", "--literal-pathspecs",
            "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false",
            "-c", "maintenance.auto=false", "-c", "gc.auto=0",
            "-c", "log.showSignature=false", "-C", str(repo),
        )

        def git(*args: str) -> str:
            result = subprocess.run(
                ("git", *args), cwd=repo, check=True, text=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            return result.stdout

        def immutable(*args: str) -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                (*immutable_prefix, *args), text=True, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, check=False, env=immutable_env,
            )

        def resolved_endpoint(revision: str) -> str | None:
            """Executable model of Main's exact single-endpoint resolver."""
            if not revision or revision.startswith("-") or ".." in revision:
                return None
            if any(ord(character) < 32 or ord(character) == 127 for character in revision):
                return None
            result = immutable("rev-parse", "--verify", "--end-of-options", f"{revision}^{{commit}}")
            if result.returncode or not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", result.stdout.rstrip("\n")):
                return None
            if result.stdout.count("\n") != 1 or not result.stdout.endswith("\n"):
                return None
            return result.stdout[:-1]

        def resolved_tree(commit_oid: str) -> str | None:
            if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", commit_oid):
                return None
            result = immutable("rev-parse", "--verify", "--end-of-options", f"{commit_oid}^{{tree}}")
            if result.returncode or result.stdout.count("\n") != 1 or not result.stdout.endswith("\n"):
                return None
            return result.stdout[:-1] if re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", result.stdout[:-1]) else None

        def clean() -> bool:
            result = immutable("status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none")
            return result.returncode == 0 and result.stdout == ""

        git("init", "-q")
        git("config", "user.email", "inline@example.invalid")
        git("config", "user.name", "Inline Test")
        (repo / "normal.txt").write_text("normal\n")
        (repo / ":(glob)*.txt").write_text("literal\n")
        git("add", "--all")
        git("commit", "-qm", "first")
        first = git("rev-parse", "HEAD").strip()
        first_tree = git("rev-parse", f"{first}^{{tree}}").strip()
        require(clean(), "clean immutable inline target was rejected")
        require(resolved_endpoint("HEAD") == first, "exact endpoint resolver did not return HEAD commit ID")
        require(resolved_tree(first) == first_tree, "exact endpoint resolver did not bind HEAD tree ID")
        for injection in ("--all", "--show-toplevel", "--revs-only", "HEAD..HEAD", "HEAD\nHEAD"):
            require(resolved_endpoint(injection) is None, f"injected endpoint was accepted: {injection!r}")
        require(resolved_tree(f"{first}\n{first}") is None, "multi-output tree binding was accepted")
        (repo / "dirty.txt").write_text("uncommitted\n")
        require(not clean(), "dirty worktree was accepted as immutable inline target")
        (repo / "dirty.txt").unlink()
        require(clean(), "clean status did not recover after test cleanup")
        (repo / "normal.txt").write_text("replacement\n")
        git("commit", "-am", "second", "-q")
        second = git("rev-parse", "HEAD").strip()
        git("replace", first, second)

        hardened_tree = immutable("rev-parse", f"{first}^{{tree}}").stdout.strip()
        require(hardened_tree == first_tree, "replace ref altered hardened revision binding")
        literal = immutable("show", "--no-ext-diff", "--no-textconv", first, "--", ":(glob)*.txt").stdout
        require("+literal" in literal and "+normal" not in literal, "pathspec magic was not treated literally")

        marker = repo / ".git" / "gpg-program-ran"
        gpg_program = repo / ".git" / "hostile-gpg-program"
        gpg_program.write_text(f"#!/bin/sh\nprintf invoked > {marker}\nexit 1\n")
        os.chmod(gpg_program, 0o755)
        signed_content = (
            f"tree {first_tree}\n"
            "author Inline Test <inline@example.invalid> 0 +0000\n"
            "committer Inline Test <inline@example.invalid> 0 +0000\n"
            "gpgsig -----BEGIN PGP SIGNATURE-----\n"
            " invalid test signature\n"
            " -----END PGP SIGNATURE-----\n\n"
            "synthetic signed commit\n"
        )
        signed = subprocess.run(
            ("git", "hash-object", "-t", "commit", "-w", "--stdin"), cwd=repo,
            input=signed_content, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
        ).stdout.strip()
        git("update-ref", "refs/heads/signed", signed)
        git("config", "log.showSignature", "true")
        git("config", "gpg.program", str(gpg_program))
        subprocess.run(("git", "log", "-1", "signed"), cwd=repo, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        require(marker.exists(), "hostile local log.showSignature did not exercise gpg.program regression")
        marker.unlink()
        hardened_log = immutable("log", "-1", signed)
        require(hardened_log.returncode == 0 and not marker.exists(), "hardened log executed hostile gpg.program")

        fsmonitor_marker = repo / ".git" / "fsmonitor-ran"
        fsmonitor = repo / ".git" / "hostile-fsmonitor"
        fsmonitor.write_text(f"#!/bin/sh\nprintf invoked > {fsmonitor_marker}\nexit 0\n")
        os.chmod(fsmonitor, 0o755)
        git("config", "core.fsmonitor", str(fsmonitor))
        git("status", "--porcelain")
        require(fsmonitor_marker.exists(), "fixture did not exercise configured fsmonitor")
        fsmonitor_marker.unlink()
        index = repo / ".git" / "index"
        index_before = index.stat()
        require(clean(), "hardened clean status rejected clean fsmonitor fixture")
        index_after = index.stat()
        require(not fsmonitor_marker.exists(), "hardened status executed configured fsmonitor")
        require(
            (index_before.st_mtime_ns, index_before.st_size) == (index_after.st_mtime_ns, index_after.st_size),
            "hardened status refreshed the index",
        )
        require(not (repo / ".git" / "index.lock").exists(), "hardened status left an index lock")

        bound_blob = git("rev-parse", f"{first}:normal.txt").strip()
        require(immutable("cat-file", "-e", f"{bound_blob}^{{blob}}").returncode == 0, "bound blob preflight failed")
        original_bytes = immutable("cat-file", "blob", bound_blob).stdout
        (repo / "normal.txt").write_text("attacker edit\n")
        require(immutable("cat-file", "blob", bound_blob).stdout == original_bytes, "mutable worktree edit changed bound blob evidence")
        (repo / "normal.txt").write_text("replacement\n")
        require(clean(), "worktree restore did not return fixture to clean state")
        require(immutable("cat-file", "blob", bound_blob).stdout == original_bytes, "read/restore changed bound blob evidence")

        origin = Path(temporary) / "origin.git"
        source = Path(temporary) / "source"
        partial = Path(temporary) / "partial"
        subprocess.run(("git", "init", "--bare", "-q", str(origin)), check=True)
        subprocess.run(("git", "init", "-q", str(source)), check=True)
        subprocess.run(("git", "-C", str(source), "config", "user.email", "inline@example.invalid"), check=True)
        subprocess.run(("git", "-C", str(source), "config", "user.name", "Inline Test"), check=True)
        (source / "promisor.txt").write_text("promisor-only\n")
        subprocess.run(("git", "-C", str(source), "add", "promisor.txt"), check=True)
        subprocess.run(("git", "-C", str(source), "commit", "-qm", "promisor"), check=True)
        subprocess.run(("git", "-C", str(source), "remote", "add", "origin", str(origin)), check=True)
        subprocess.run(("git", "-C", str(source), "push", "-q", "origin", "HEAD"), check=True)
        subprocess.run(("git", "-C", str(origin), "config", "uploadpack.allowFilter", "true"), check=True)
        subprocess.run(("git", "clone", "-q", "--no-checkout", "--no-local", "--filter=blob:none", str(origin), str(partial)), check=True)
        promisor_blob = subprocess.run(
            ("git", "-C", str(partial), "rev-parse", "HEAD:promisor.txt"), text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
        ).stdout.strip()
        partial_env = {**immutable_env, "GIT_DIR": str(partial / ".git"), "GIT_WORK_TREE": str(partial)}
        objects = partial / ".git" / "objects"
        object_state = sorted((path.relative_to(objects), path.read_bytes()) for path in objects.rglob("*") if path.is_file())
        missing = subprocess.run(
            (*immutable_prefix[:-1], str(partial), "cat-file", "-e", f"{promisor_blob}^{{blob}}"),
            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, env=partial_env,
        )
        object_state_after = sorted((path.relative_to(objects), path.read_bytes()) for path in objects.rglob("*") if path.is_file())
        require(missing.returncode != 0, "hardened promisor preflight fetched a missing blob")
        require(object_state == object_state_after, "hardened promisor preflight mutated the object database")

    for invalid in ("/absolute", "../traversal", "dir/../traversal", "bad\x00path", "bad\npath"):
        absolute = invalid.startswith("/")
        traversal = any(part == ".." for part in invalid.split("/"))
        control = any(ord(character) < 32 or ord(character) == 127 for character in invalid)
        require(absolute or traversal or control, f"invalid path escaped validation: {invalid!r}")

    def consolidate(required: list[tuple[str, str, str, str]], returns: list[dict[str, object]]) -> tuple[bool, dict[tuple[str, str, str, str], str]]:
        """Executable contract model for Main's one-result keyed consolidation."""
        slots = {slot: "missing" for slot in required}
        trusted = True
        for returned in returns:
            slot = (returned["lens"], returned["dispatch_id"], returned["target_id"], returned["coordinates"])
            if slot not in slots or returned["expected_lens"] != returned["lens"]:
                trusted = False
                continue
            if slots[slot] != "missing":
                slots[slot] = "untrusted"
                continue
            if returned["lens_status"] != "complete" or returned["verdict"] != "pass" or returned["blocker"] or returned["blocking_disagreement"]:
                slots[slot] = "non-pass"
            else:
                slots[slot] = "pass"
        return trusted and all(value == "pass" for value in slots.values()), slots

    tester_slot = ("tester", "attempt-t", "target", "base..head")
    qa_slot = ("qa", "attempt-q", "target", "base..head")
    passing_tester = {"lens": "tester", "expected_lens": "tester", "dispatch_id": "attempt-t", "target_id": "target", "coordinates": "base..head", "lens_status": "complete", "verdict": "pass", "blocker": False, "blocking_disagreement": False}
    passing_qa = {**passing_tester, "lens": "qa", "expected_lens": "qa", "dispatch_id": "attempt-q"}
    passed, slots = consolidate([tester_slot, qa_slot], [passing_tester, passing_qa])
    require(passed and set(slots.values()) == {"pass"}, "valid distinct lens returns did not pass keyed consolidation")
    matrix = {
        "missing": [passing_tester],
        "failed": [{**passing_tester, "lens_status": "failed"}, passing_qa],
        "blocker": [{**passing_tester, "blocker": True}, passing_qa],
        "replay": [passing_tester, passing_qa, {**passing_tester, "dispatch_id": "old-attempt"}],
        "duplicate": [passing_tester, passing_tester, passing_qa],
        "substitution": [{**passing_tester, "lens": "qa"}, passing_qa],
    }
    for outcome, returns in matrix.items():
        passed, _ = consolidate([tester_slot, qa_slot], returns)
        require(not passed, f"{outcome} return incorrectly produced global PASS")


def check_pr_precedence(source: str, text: str) -> None:
    lowered = text.lower()
    require("review-pr" in lowered and "inline-review" in lowered, f"{source}: route missing")
    require("pr number" in lowered and "pr url" in lowered, f"{source}: PR aliases missing")
    require("pr review" in lowered or "pr-review" in lowered or "review a pr" in lowered, f"{source}: PR intent missing")
    require("exclusive" in lowered or ("precedence" in lowered and "must not intercept" in lowered), f"{source}: precedence missing")


def check_inline_review_contract() -> None:
    """Inline native project access, lens selection, currentness, and routing stay fail-closed."""
    contract = read("agents/_shared/inline-review-contract.md")
    check_inline_markers(contract)
    for source, path in (("coordinator", "agents/orchestrator.md"), ("direct router", "agents/ref-direct-modes.md"), ("Codex init", "plugins/team-harness/skills/init/SKILL.md")):
        check_pr_precedence(source, read(path))
    reviewer = read("agents/inline-reviewer.md").lower()
    adapter = read("runtime/codex/instructions/inline-reviewer.md").lower()
    for label, text in (("Claude inline-reviewer", reviewer), ("Codex inline-reviewer", adapter)):
        for marker in ("tester", "qa", "security", "adversary", "repository_root", "commit_or_range", "sandbox", "read-only", "target_id", "expected_lens", "dispatch_id", "coverage", "disagreements", "git diff"):
            if label == "Claude inline-reviewer" and marker == "git diff":
                require("immutable git view" in text, f"{label}: safe historical-view marker missing")
            else:
                require(marker in text, f"{label}: native lens marker {marker!r} missing")
        for retired in ("run_inline_review.mjs", "evidence_manifest", "manifest_digest", "stdin-only"):
            require(retired not in text, f"{label}: retired inline protocol {retired!r} remains")
    init = re.sub(r"\s+", " ", read("plugins/team-harness/skills/init/SKILL.md").lower())
    for marker in ("inline-reviewer", "commit/range", "sandbox_mode = \"read-only\"", "adversary", "security floor", "dispatch_id", "expected_lens", "regular non-symlink", "sha-256", "stale", "fresh codex session", "explicit restart", "in-memory byte attestation"):
        require(marker in init, f"Codex init native route missing {marker!r}")
    require("repository root" in init or "project root" in init, "Codex init native route missing canonical root")
    for retired in ("run_inline_review.mjs", "evidence_manifest", "manifest_digest", "stdin-only", "deny-root"):
        require(retired not in init, f"Codex init retired protocol {retired!r} remains")


def _delivery_publish_sources() -> dict[str, str]:
    return {
        "Claude gate": read("agents/_shared/gate-contract.md"),
        "Claude mechanics": read("agents/_shared/delivery-mechanics.md"),
        "Claude pipeline": read("agents/ref-pipeline.md"),
        "Codex pipeline": read("plugins/team-harness/skills/pipeline/SKILL.md"),
        "Codex state": read("plugins/team-harness/skills/pipeline/references/state-and-gates.md"),
        "Codex delivery skill": read("plugins/team-harness/skills/deliver/SKILL.md"),
        "Codex delivery reference": read("plugins/team-harness/skills/pipeline/references/delivery.md"),
    }


def _check_publish_contracts(publish_sources: dict[str, str]) -> None:
    for label, text in publish_sources.items():
        flat = re.sub(r"\s+", " ", text.lower())
        for marker in ("push", "draft pr"):
            require(marker in flat, f"{label}: ship delivery omits {marker}")
        require(
            "validated commit" in flat or "validated_commit_sha" in flat,
            f"{label}: ship delivery omits validated commit identity",
        )
        require(
            "do not ask" in flat
            or "no second conversational" in flat
            or "without another conversational" in flat
            or "never ask" in flat,
            f"{label}: delivery can ask for another operator decision after ship",
        )
        require("merge" in flat and "release" in flat, f"{label}: ship exclusions are incomplete")


def _check_implementation_assembly() -> None:
    assembly_sources = {
        "Claude assembly": read("agents/_shared/implementation-assembly.md"),
        "Codex implementation": read("plugins/team-harness/skills/pipeline/references/implementation.md"),
    }
    for label, text in assembly_sources.items():
        flat = re.sub(r"\s+", " ", text.lower())
        for marker in ("version", "changelog", "commit", "before freeze"):
            require(marker in flat, f"{label}: implementation assembly omits {marker}")
        for marker in ("diff composition", "mechanical", "substantive", "reviewability exceptions"):
            require(marker in flat, f"{label}: implementation assembly omits {marker}")
    claude_pipeline = read("agents/ref-pipeline.md")
    require(
        "agents/_shared/implementation-assembly.md" in claude_pipeline,
        "Claude pipeline does not invoke the canonical implementation assembly contract",
    )


def check_single_ship_delivery() -> None:
    """Implementation freezes a complete commit; delivery only publishes it."""
    publish_sources = _delivery_publish_sources()
    _check_publish_contracts(publish_sources)
    _check_implementation_assembly()
    mechanics = publish_sources["Claude mechanics"].lower()
    for forbidden in ("git commit -m", "git add ", "git fetch origin {default-branch}"):
        require(forbidden not in mechanics, f"Claude delivery still executes {forbidden!r}")
    for marker in ("validated_commit_sha", "validated_tree_sha", "git status --porcelain"):
        require(marker in mechanics, f"Claude delivery identity check omits {marker!r}")
    for marker in ("git ls-remote", "verification_base_ref", "current", "moved", "unknown"):
        require(marker in mechanics, f"Claude delivery base-status report omits {marker!r}")
    require("git fetch" not in mechanics, "Claude delivery base-status report mutates remote refs")

    codex_pipeline = publish_sources["Codex pipeline"].lower()
    require(
        "does not authorize a push" not in codex_pipeline,
        "Codex pipeline still says Gate 3 ship cannot authorize push/PR",
    )
    codex_delivery = re.sub(r"\s+", " ", publish_sources["Codex delivery reference"].lower())
    require(
        "technical runtime boundary" in codex_delivery
        and "not a new team harness" in codex_delivery,
        "Codex delivery conflates native tool permission with another operator gate",
    )
    require(
        "git ls-remote" in codex_delivery
        and "verification_base_ref" in codex_delivery
        and "without mutating refs" in codex_delivery,
        "Codex delivery omits the non-mutating base-status report",
    )


def check_delivery_preview_binding() -> None:
    """Gate 3 binds exact prose and standard delivery remains draft-only."""
    claude_pipeline = read("agents/ref-pipeline.md").lower()
    claude_delivery = read("agents/_shared/delivery-mechanics.md").lower()
    claude_delivery_flat = re.sub(r"\s+", " ", claude_delivery)
    delivery_role = read("agents/delivery.md").lower()
    codex_validation = read("plugins/team-harness/skills/pipeline/references/validation.md").lower()
    codex_delivery = read("plugins/team-harness/skills/pipeline/references/delivery.md").lower()
    deliver_skill = read("plugins/team-harness/skills/deliver/SKILL.md").lower()

    for label, text in (
        ("Claude pipeline", claude_pipeline),
        ("Codex validation", codex_validation),
    ):
        require("before" in text and "gate 3" in text and "sha-256" in text, f"{label}: exact prose is not bound before Gate 3")
    require("before stage-gate-3" in delivery_role, "Delivery role still runs after Gate 3")
    require("do not modify tracked repository files" in delivery_role, "Delivery preview can change the frozen tree")
    require("changelog-fragment-draft.md" not in delivery_role, "Delivery preview still owns changelog assembly")
    require("do not regenerate prose" in codex_delivery, "Codex delivery can regenerate approved prose")
    require("never recompose" in claude_delivery_flat, "Claude mechanics can recompose approved prose")
    require("--draft" in claude_delivery and "isdraft" in claude_delivery, "Claude mechanics do not enforce draft-only PR delivery")
    require(
        "ready-for-review" in claude_delivery and "never downgraded" in claude_delivery,
        "Ready-for-review PR mutation is not blocked",
    )
    require(
        "approved title from delivery_preview" in claude_delivery_flat
        and "approved pr_body_path from delivery_preview" in claude_delivery_flat,
        "Claude mechanics can regenerate or select a different PR title/body",
    )
    require("does not run tests" in claude_delivery_flat, "Claude delivery can rerun validated tests")
    require("moving base" in claude_delivery_flat and "does not change" in claude_delivery_flat, "Claude delivery can invalidate on base movement")
    require("exact `00-state.md`" in deliver_skill and "never scan" in deliver_skill, "Codex deliver can select another active workspace")
    codex_delivery_flat = re.sub(r"\s+", " ", codex_delivery)
    require(
        "non-default" in codex_delivery_flat
        and "not `main` or `master`" in codex_delivery_flat
        and "allowed delivery prefixes" in codex_delivery_flat,
        "Codex delivery can stage from an unapproved branch",
    )


def check_terminal_and_transition_mapping() -> None:
    """Gate decisions persist complete transitions and aborted runs stay terminal."""
    codex_state = read("plugins/team-harness/skills/pipeline/references/state-and-gates.md").lower()
    codex_pipeline = read("plugins/team-harness/skills/pipeline/SKILL.md").lower()
    recovery = read("plugins/team-harness/skills/pipeline/references/recovery.md").lower()
    claude_recovery = read("skills/recover/SKILL.md").lower()
    claude_pipeline = read("agents/ref-pipeline.md").lower()

    for marker in (
        "gate 1 `approve autonomous`",
        "autonomous_granted_at: stage-gate-1",
        "gate 3 `ship`",
        "phase: delivery",
        "gate 3 `abort`",
        "phase: aborted",
    ):
        require(marker in codex_state, f"Codex transition mapping missing {marker!r}")
    require("complete` and `aborted` are terminal" in codex_pipeline, "Codex continuation can recover a terminal run")
    for label, text in (("Codex", recovery), ("Claude", claude_recovery)):
        require("status" in text and "aborted" in text and "never recover" in text, f"{label}: aborted recovery is not terminal")
        require("valid `amend` decision record" in text, f"{label}: Gate 3 amend migration is missing")
    require("autonomous: true" in claude_pipeline and "autonomous_granted_at: stage-gate-1" in claude_pipeline, "Claude autonomous grant is not persisted")
    require("pipeline administratively closed" in claude_pipeline, "Claude administrative close does not clear next_action safely")


def check_review_comment_regressions() -> None:
    """Target the cross-document defects identified during PR review."""
    discover = read("docs/discover-phase.md")
    discover_flat = re.sub(r"\s+", " ", discover.lower())
    require("at most 500 utf-8 bytes" in discover_flat, "Discover: survey value bound is missing")
    require("at most 4 kb" in discover_flat, "Discover: spec-seed bound is missing")
    require("[redacted]" in discover, "Discover: secret redaction marker is missing")
    require("survey_effort" not in discover, "Discover: retired survey_effort field remains live")

    for role in ("tester", "qa", "security"):
        role_text = read(f"agents/{role}.md").lower()
        require("inline-review" not in role_text, f"{role}: retired inline role section remains")
        require("run_inline_review" not in role_text and "evidence_manifest" not in role_text, f"{role}: retired runner protocol remains")

    for relative in ("agents/ref-pipeline.md", "docs/reasoning-checkpoint.md"):
        checkpoint = read(relative)
        checkpoint_flat = re.sub(r"\s+", " ", checkpoint.lower())
        require("provenance: inferred" in checkpoint_flat or "`inferred`" in checkpoint_flat, f"{relative}: inferred checkpoint provenance is missing")
        require("discover open" in checkpoint_flat, f"{relative}: inferred checkpoint can close Discover")
        require(
            re.search(r"without dispatching (?:`?architect`?|design)", checkpoint_flat) is not None,
            f"{relative}: inferred checkpoint can dispatch the architect",
        )

    observability = read("docs/observability.md")
    envelope = section(observability, "## 2. Event envelope", "## Flow Telemetry Emission")
    require("sole envelope exception" in envelope and "`subagent.start`" in envelope, "Observability: subagent.start exception is undocumented")
    telemetry = section(observability, "## Flow Telemetry Emission", "## What operation.* is")
    telemetry_flat = re.sub(r"\s+", " ", telemetry.lower())
    require("exactly one local" in telemetry_flat and "`operation.failed`" in telemetry, "Observability: telemetry failure event is ambiguous")
    require("flow-telemetry: unavailable" not in observability, "Observability: obsolete telemetry failure event remains")


def check_pr_review_workspace_isolation() -> None:
    """PR review artifacts stay in an ignored repo-local workspace, never .claude."""
    canonical = read("skills/review-pr/SKILL.md")
    flattened = re.sub(r"\s+", " ", canonical.lower())
    require("workspaces/pr-review-{number}" in canonical, "PR review workspace is not repo-local")
    require("never use `.claude/` for review state" in flattened, "PR review can still use .claude for local state")
    require(".claude/pr-review" not in canonical, "PR review retains a .claude artifact path")
    require("^/workspaces/?$" in canonical, "PR review does not recognize the anchored workspace ignore rule")
    require("printf '\\n/workspaces/\\n' >> \"$GITIGNORE\"" in canonical, "PR review does not add the workspace ignore rule")
    require("git -C \"$REVIEW_ROOT\" check-ignore" in canonical, "PR review does not verify ignore coverage")
    ignore_write = canonical.index("printf '\\n/workspaces/\\n'")
    ignore_probe = canonical.index('check-ignore -q -- "workspaces/.team-harness-ignore-probe"')
    workspace_create = canonical.index('mkdir -m 700 "$ARTIFACTS"')
    require(ignore_write < ignore_probe < workspace_create, "PR review creates its workspace before effective ignore verification")
    require('[ -L "$WORKSPACES_ROOT" ]' in canonical, "PR review does not reject a symlinked workspace root")
    require('[ -L "$ARTIFACTS" ]' in canonical, "PR review does not reject a symlinked review workspace")
    require(canonical.count("candidate.relative_to(root)") == 2, "PR review lacks pre/post-create canonical containment checks")
    require("review workspace already exists; resume or cancel it first" in canonical, "fresh PR review can reuse a pre-existing artifact root")
    require("required artifact is not a regular non-symlink file" in canonical, "PR review resume accepts unsafe artifact leaves")
    require("Never redirect or open a fixed final artifact path directly" in canonical, "PR review lacks the leaf no-follow rule")
    require("atomically rename the temporary file over the final leaf" in canonical, "PR review lacks atomic artifact promotion")
    require('> "$DIFF"' not in canonical and '> "$FILES"' not in canonical and '> "$CHECKS"' not in canonical, "PR review writes a fixed artifact leaf directly")
    require(re.search(r"(?m)^/workspaces/$", read(".gitignore")) is not None, "repository workspace ignore rule is not canonical")
    require(".claude/pr-review" not in read("agents/ref-direct-modes.md"), "Claude direct review contract retains .claude artifacts")


def check_claude_codex_parity() -> None:
    """The two runtime projections expose the same posture and migration rules."""
    claude = "\n".join(
        (
            read("docs/pipeline-lanes.md"),
            read("agents/ref-intake-flows.md"),
            read("agents/ref-pipeline.md"),
            read("agents/_shared/orchestrator-state.md"),
        )
    )
    codex = "\n".join(
        (
            read("plugins/team-harness/skills/init/SKILL.md"),
            read("plugins/team-harness/skills/init/references/configuration.md"),
            read("plugins/team-harness/skills/pipeline/SKILL.md"),
            read("plugins/team-harness/skills/pipeline/references/activation.md"),
            read("plugins/team-harness/skills/pipeline/references/state-and-gates.md"),
            read("plugins/team-harness/skills/pipeline/references/recovery.md"),
        )
    )
    for label, text in (("Claude", claude), ("Codex", codex)):
        flat = re.sub(r"\s+", " ", text.lower())
        require("inline" in flat and "pipeline" in flat, f"{label}: posture parity missing")
        require(MACHINE_TEXT in text, f"{label}: canonical full v3 sequence missing")
        require("1 — inline" in text and "2 — pipeline" in text, f"{label}: migration choices drifted")
        require("never silently" in flat or "never infer" in flat or "not silently" in flat, f"{label}: legacy mapping can be inferred")
        require("configuration" in flat and "never" in flat, f"{label}: config authority boundary missing")
        require("ad-hoc" in flat or "ad hoc" in flat, f"{label}: ad-hoc review parity missing")

    # The Claude and Codex machine/state contracts expose exactly the same seven
    # named states, and neither exposes the retired route vocabulary as a field.
    for relative in (
        "agents/_shared/orchestrator-state.md",
        "plugins/team-harness/skills/pipeline/references/state-and-gates.md",
    ):
        text = read(relative)
        match = re.search(r"(?m)^phase:\s*([^#\n]+)", text)
        require(match is not None, f"{relative}: phase schema missing")
        require(tuple(part.strip() for part in match.group(1).split("|")) == MACHINE + ("blocked", "aborted"), f"{relative}: phase schema parity drifted")
        require(not re.search(r"(?m)^lane:\s*", text), f"{relative}: retired lane field remains active")
        require(not re.search(r"(?m)^profile:\s*", text), f"{relative}: retired profile field remains active")


def check_execution_efficiency_contract() -> None:
    """Codex execution stays interruptible, bounded, and diagnostically useful."""
    pipeline = re.sub(
        r"\s+", " ", read("plugins/team-harness/skills/pipeline/SKILL.md").lower()
    )
    implementation = read("plugins/team-harness/skills/pipeline/references/implementation.md")
    validation = read("plugins/team-harness/skills/pipeline/references/validation.md")
    contracts = {
        "implementation": re.sub(r"\s+", " ", implementation.lower()),
        "validation": re.sub(r"\s+", " ", validation.lower()),
    }

    for marker in (
        "pipeline preflight resolves",
        "absolute path relative to the loaded pipeline skill/reference",
        "`bounded_command_path`",
        "state, events, reports",
        "node <bounded_command_path> -- <argv...>",
        "`--success-diagnostic` before",
        "narrower query through the helper",
        "outside pipeline mode",
    ):
        require(marker in pipeline, f"pipeline: AC12 helper-route marker missing {marker!r}")

    for marker in (
        "classify expected output volume before execution",
        "small and bounded execute directly",
        "targeted file reads and searches",
        "focused tests configured to emit concise results",
        "large, verbose, or volume-unknown intermediate data",
        "full suites",
        "broad logs, diffs, or searches",
        "reactively retry through a different route",
        "direct execution remains the normal route",
        "development-output control, not a process-containment sandbox",
        "operator remains responsible for launched commands",
        "detached or reparented descendant",
        "native sandbox and permission policy remain the security boundary",
    ):
        require(marker in pipeline, f"pipeline: AC20 pre-execution routing marker missing {marker!r}")

    for label, text in contracts.items():
        for marker in (
            "execution tool receives a hard output cap before launch",
            "no larger than the known-small result budget",
            "classify the volume as unknown and use the helper before execution",
            "development-output control, not a process-containment sandbox",
            "operator remains responsible for launched commands",
            "detached or reparented descendant",
            "native sandbox and permission policy remain the security boundary",
        ):
            require(marker in text, f"{label}: direct-route hard-cap contract missing {marker!r}")

        for marker in (
            "completion or live operator input",
            "60 seconds",
            "`list_agents`",
            "live status request",
            "real timeout",
            "recovery",
            "without recap",
            "30%",
            "70% reduction",
        ):
            require(marker in text, f"{label}: AC8 execution marker missing {marker!r}")

        for marker in (
            "at most 30 tool calls",
            "50 tool calls",
            "first compaction",
            "75 tool calls",
            "8 m cumulative processed tokens",
            "second substantial scope change",
            "handoff",
            "freeze",
            "mandatory suite",
            "gate",
        ):
            require(marker in text, f"{label}: AC9 rotation marker missing {marker!r}")

        for marker in (
            "stdout and stderr",
            "64 kib",
            "8 kib",
            "exit code",
            "duration",
            "bytes",
            "`truncated`",
            "ansi",
            "binary",
            "sanitized",
            "successful command",
            "narrow follow-up",
            "replay",
        ):
            require(marker in text, f"{label}: AC12 tool-output marker missing {marker!r}")

        for marker in (
            "explicitly activated pipeline",
            "preflight resolves",
            "absolute path relative to the loaded pipeline skill/reference",
            "`bounded_command_path`",
            "state, events, reports",
            "node <bounded_command_path> -- <argv...>",
            "`--success-diagnostic` before",
            "narrow",
            "through the helper",
            "outside pipeline mode",
        ):
            require(marker in text, f"{label}: AC12 helper-route marker missing {marker!r}")

    for marker in (
        "before execution",
        "expected output volume",
        "expected small, bounded results run directly",
        "targeted reads/searches",
        "focused tests configured for concise output",
        "large, verbose, or volume-unknown intermediate data",
        "full suites",
        "broad logs, diffs, or searches",
        "unknown volume selects the helper",
        "does not make the wrapper the default",
        "reactively retry it through another route",
    ):
        require(marker in contracts["validation"], f"validation: AC20 pre-execution routing marker missing {marker!r}")

    for marker in (
        "before executing a command",
        "expected output volume",
        "expected small, bounded result run directly",
        "targeted file reads and searches",
        "focused tests configured for concise results",
        "large, verbose, or volume-unknown intermediate data",
        "full suites",
        "broad logs, diffs, or searches",
        "unknown volume selects the helper",
        "does not make the wrapper the default",
        "never reactively retry it through a different route",
    ):
        require(marker in contracts["implementation"], f"implementation: AC20 pre-execution routing marker missing {marker!r}")

    require(
        "giant line beyond 64 kib" in contracts["validation"],
        "validation: AC12 lacks giant-line coverage",
    )
    require(
        "nonzero failure without replay" in contracts["validation"],
        "validation: AC12 lacks no-replay failure coverage",
    )

    for role in ("implementer", "tester", "qa", "security"):
        adapter = re.sub(r"\s+", " ", read(f"runtime/codex/instructions/{role}.md").lower())
        for marker in (
            "heartbeat at most every 60 seconds",
            "`list_agents` only",
            "at most 30 tool calls",
            "50 tool calls",
            "first compaction",
            "75 tool calls",
            "8 m cumulative processed tokens",
            "second substantial scope change",
            "bounded handoff",
            "64 kib",
            "8 kib",
            "`truncated`",
            "strip ansi",
            "binary/control data safely",
            "successful bounded commands report only the envelope",
            "without replaying full output",
            "never waive acs, qa, security, freeze, mandatory suites, or gates",
            "explicitly activated pipeline",
            "`bounded_command_path`",
            "node <bounded_command_path> -- <argv...>",
            "`--success-diagnostic` before `--`",
            "narrow follow-up through the helper",
            "outside pipeline mode",
        ):
            require(marker in adapter, f"{role}: execution contract missing {marker!r}")

        for marker in (
            "before execution",
            "expected output volume",
            "expected-small command may execute directly only",
            "predeclared output cap",
            "no greater than the known-small result budget",
            "otherwise classify it as volume-unknown",
            "large, verbose, or volume-unknown intermediate data",
            "full suites",
            "broad logs, diffs, or searches",
            "reactively retry it through another route",
        ):
            require(marker in adapter, f"{role}: AC20 routing marker missing {marker!r}")

    bounded_helper = read("plugins/team-harness/skills/pipeline/scripts/bounded-command.mjs")
    for forbidden in (
        "DIRECT_COMMAND_MANIFEST",
        "classifyCommandOutputRoute",
        "/usr/bin/true",
        "/usr/bin/false",
    ):
        require(forbidden not in bounded_helper, f"bounded helper: misleading route manifest remains {forbidden!r}")

    for label, text in {"pipeline": pipeline, **contracts}.items():
        require("route every command" not in text, f"{label}: universal wrapper policy remains")


def check_context_isolation_rotation_contract() -> None:
    """AC9/AC13-AC16: fresh packets, closed attempts, and recoverable rotation."""
    pipeline = read("plugins/team-harness/skills/pipeline/SKILL.md")
    implementation = read("plugins/team-harness/skills/pipeline/references/implementation.md")
    validation = read("plugins/team-harness/skills/pipeline/references/validation.md")
    shards = read("docs/plan-shards.md")
    pipeline_flat = re.sub(r"\s+", " ", pipeline.lower())
    validation_flat = re.sub(r"\s+", " ", validation.lower())
    shards_flat = re.sub(r"\s+", " ", shards.lower())

    for marker in (
        "v2 `fork_turns: none`",
        "exact role packet",
        "terminal specialist result",
        "`followup_task` is prohibited",
        "no specialist attempt is continued",
        "follow_up_count: 0",
        "bounded correction packet",
        "`cause`",
        "`files`",
        "`ac`",
        "`suggested correction`",
        "current frozen anchor",
        "required evidence",
    ):
        require(marker in pipeline_flat, f"pipeline: AC13 lifecycle marker missing {marker!r}")

    for marker in (
        "preflight the exact shard",
        "required_invariants",
        "required_evidence_anchors",
        "cross_runtime_preservation",
        "fail closed",
        "transcript, full plan, or sibling shard is never a substitute",
        "models, gates, permissions, nor lifecycle routes",
    ):
        require(marker in pipeline_flat, f"pipeline: AC15 preflight marker missing {marker!r}")

    for marker in (
        "first compaction",
        "100 coordinator tool calls",
        "20 m cumulative processed tokens",
        "recoverable handoff",
        "fresh user thread",
        "implementation → validation",
        "automatic native main replacement",
        "nested orchestrator",
    ):
        require(marker in pipeline_flat, f"pipeline: AC16 Main-rotation marker missing {marker!r}")

    for marker in (
        "every tester, qa, and security dispatch uses a fresh",
        "v2 `fork_turns: none` agent",
        "current frozen commit/tree",
        "verification facts/evidence",
        "implementer's success narrative",
        "after an operator-authorized correction, every revalidation starts new tester, qa, and security agents",
        "never reuse a prior verifier",
    ):
        require(marker in validation_flat, f"validation: AC14 isolation marker missing {marker!r}")

    for marker in (
        "every task shard must declare all three fields",
        "required_invariants",
        "required_evidence_anchors",
        "cross_runtime_preservation",
        "fails closed",
        "attaching main's transcript, a sibling task shard, or the full plan set",
    ):
        require(marker in shards_flat, f"plan shards: AC15 declaration marker missing {marker!r}")

    for source, label in ((implementation, "implementation"), (validation, "validation")):
        flat = re.sub(r"\s+", " ", source.lower())
        for marker in (
            "at most 30 tool calls",
            "50 tool calls",
            "75 tool calls",
            "8 m cumulative processed tokens",
            "fresh",
            "correction",
        ):
            require(marker in flat, f"{label}: Task 3 routing marker missing {marker!r}")
        require("150 tool calls" not in flat and "25 m tokens" not in flat, f"{label}: superseded rotation limit remains")
    implementation_flat = re.sub(r"\s+", " ", implementation.lower())
    require("feedback, scope expansion, and every correction require a fresh agent" in implementation_flat, "implementation: automatic continuation remains")
    require("follow_up_count: 0" in implementation_flat, "implementation: new follow-up counts are not fixed at zero")
    require("failed validation never continues a verifier" in validation_flat, "validation: verifier continuation is not prohibited")

    for role in ("implementer", "tester", "qa", "security"):
        adapter = re.sub(r"\s+", " ", read(f"runtime/codex/instructions/{role}.md").lower())
        for marker in (
            "fresh v2 `fork_turns: none` attempt",
            "at most 30 tool calls",
            "50 tool calls",
            "75 tool calls",
            "8 m cumulative processed tokens",
            "post-terminal `followup_task`",
            "`cause`",
            "`files`",
            "`ac`",
        ):
            require(marker in adapter, f"{role}: AC9/AC13 marker missing {marker!r}")
        require("150 tool calls" not in adapter and "25 m tokens" not in adapter, f"{role}: superseded rotation limit remains")

    implementer_adapter = re.sub(r"\s+", " ", read("runtime/codex/instructions/implementer.md").lower())
    for marker in ("never retain this thread for feedback or correction", "every correction requires a fresh", "matching live correction decision", "`suggested correction`"):
        require(marker in implementer_adapter, f"implementer: fresh correction marker missing {marker!r}")

    for role in ("tester", "qa", "security"):
        adapter = re.sub(r"\s+", " ", read(f"runtime/codex/instructions/{role}.md").lower())
        require("implementer's success narrative" in adapter, f"{role}: implementer narrative is not excluded")
        require("every revalidation starts a new" in adapter, f"{role}: revalidation is not fresh")
        require("`suggested correction`" in adapter, f"{role}: advisory correction coordinate missing")
        require("never request or trigger a follow-up round" in adapter, f"{role}: automatic follow-up is not prohibited")


def check_codex_usage_observability_contract() -> None:
    """AC6/AC7: the native collector is the only accounting and cost authority."""
    observability = read("plugins/team-harness/skills/pipeline/references/observability.md")
    pipeline = read("plugins/team-harness/skills/pipeline/SKILL.md")
    activation = read("plugins/team-harness/skills/pipeline/references/activation.md")
    state = read("plugins/team-harness/skills/pipeline/references/state-and-gates.md")
    delivery = read("plugins/team-harness/skills/pipeline/references/delivery.md")
    shared_state = read("agents/_shared/orchestrator-state.md")
    docs = read("docs/observability.md")
    trace = read("skills/trace/SKILL.md")

    for source, marker in (
        (pipeline, "references/observability.md"),
        (activation, "[observability.md](observability.md)"),
        (state, "[observability.md](observability.md)"),
        (delivery, "[observability.md](observability.md)"),
        (shared_state, "references/observability.md"),
    ):
        require(marker in source, f"native usage contract is not linked by {marker!r}")

    for marker in (
        "checkpointFromUsage(await collectCodexUsage({ rolloutsRoot, rootThreadId }))",
        "checkpointFromUsage",
        "compareCheckpoints(start, end)",
        '"event":"phase.start"',
        '"event":"phase.end"',
        '"kind":"codex_usage_checkpoint"',
        '"kind":"codex_usage_delta"',
        "CHECKPOINT_UNAVAILABLE",
        "Every started pipeline phase",
        "never write either one",
        "reasoning_output_tokens",
        "never added to `total_tokens` again",
        "Cost: unavailable",
    ):
        require(marker in observability, f"observability reference misses {marker!r}")

    for source in (state, shared_state):
        for marker in (
            "usage_schema_version: 1|null",
            "usage_status: available|unavailable",
            "usage_reason_code:",
            "usage_components:",
            "total_tokens: N|unavailable",
            "cost_status: available|unavailable",
            "cost_usd: decimal|null",
        ):
            require(marker in source, f"state projection misses {marker!r}")

    legacy_shared_schema = section(
        shared_state,
        "## Current State — the schema you write",
        "**Native Codex accounting overlay — conditional.**",
    )
    require(
        re.search(r"(?m)^total_tokens:\s*N\s*$", legacy_shared_schema) is not None,
        "shared state lost the exact legacy total_tokens schema",
    )
    require(
        "Native Codex accounting overlay — conditional" in shared_state,
        "shared state does not make the Codex overlay conditional",
    )

    for source, label in ((docs, "observability docs"), (observability, "pipeline reference")):
        for marker in (
            "Cost: unavailable",
            '"provider"',
            '"model"',
            '"dimension"',
            '"currency": "USD"',
            '"source"',
            '"effective_from"',
        ):
            require(marker in source, f"{label}: exact-pricing marker missing {marker!r}")

    for marker in (
        "Cost: unavailable",
        "strictly positive decimal",
        "Native Codex branch — selected only by `usage.kind`",
        "exact, case-sensitive tuple",
        "provider",
        "model",
        "dimension",
        "currency: USD",
        "source",
        "effective",
    ):
        require(marker in trace, f"trace skill: exact-pricing marker missing {marker!r}")

    for source, label in ((docs, "observability docs"), (trace, "trace skill"), (shared_state, "shared state")):
        require("tokens_estimated" in source, f"{label}: legacy Claude token estimate was removed")
    for source, label in ((docs, "observability docs"), (trace, "trace skill")):
        for marker in (
            "~/.claude/.team-harness.json",
            "tokens_in",
            "tokens_out",
            "frontmatter",
            "Static opus-agent fallback",
            "price table not configured",
        ):
            require(marker in source, f"{label}: legacy Claude pricing marker missing {marker!r}")

    for marker in (
        "price table not configured",
        "Static opus-agent fallback",
        "all others → sonnet",
        "duration_min × 1500",  # noqa: RUF001 - exact canonical contract marker
    ):
        require(marker in docs or marker in trace, f"legacy Claude contract lost {marker!r}")

    native_section = section(
        docs,
        "### Native Codex branch — `usage.kind: codex_usage_delta`",
        "---",
    )
    for marker in (
        "Cost: unavailable",
        "never substitutes `0`",
        "Never infer this identity or rate",
        "never added again",
    ):
        require(marker in native_section, f"Codex docs branch misses strict marker {marker!r}")
    require("tokens_estimated" not in native_section, "Codex docs branch permits legacy estimation")

    usage_tests = read("tests/test_codex_usage.mjs")
    for marker in (
        "identical duplicate sessions contribute once",
        "checkpoints report only end - start",
        "CHECKPOINT_REGRESSION",
    ):
        require(marker in usage_tests, f"collector coverage missing reused-session/data-absence guard {marker!r}")


def check_declared_agent_lifecycle_contract() -> None:
    """AC17: lifecycle facts are finite, privacy-safe coordinator declarations."""
    observability = read("plugins/team-harness/skills/pipeline/references/observability.md")
    pipeline = read("plugins/team-harness/skills/pipeline/SKILL.md")
    codex_state = read("plugins/team-harness/skills/pipeline/references/state-and-gates.md")
    shared_state = read("agents/_shared/orchestrator-state.md")
    docs = read("docs/observability.md")
    trace = read("skills/trace/SKILL.md")
    observability_flat = re.sub(r"\s+", " ", observability)
    pipeline_flat = re.sub(r"\s+", " ", pipeline)
    codex_state_flat = re.sub(r"\s+", " ", codex_state)
    shared_state_flat = re.sub(r"\s+", " ", shared_state)
    docs_flat = re.sub(r"\s+", " ", docs)
    trace_flat = re.sub(r"\s+", " ", trace)

    for marker in (
        "not native Codex lifecycle telemetry",
        "`agent.spawn`",
        "`agent.close`",
        "`agent.correction.spawn`",
        "`agent_role`",
        "`task`",
        "`attempt_ordinal`",
        "`context_strategy: fresh|continued`",
        "`follow_up_count`",
        "`correction_cause: verification`",
        "`quality_verdict`",
        "codex_agent_attempt_metrics",
        "PER_ATTEMPT_METRICS_UNAVAILABLE",
        "MUST use `unavailable`",
        "cached_input_per_approved_ac",
        "never reconstructs one from rollout files, callbacks,",
        "does not create or promise such telemetry",
    ):
        require(marker in observability_flat, f"AC17 lifecycle reference misses {marker!r}")

    for role, task in (
        ("architect", "design"),
        ("implementer", "implementation"),
        ("tester", "test_evidence"),
        ("qa", "quality_review"),
        ("security", "security_review"),
        ("delivery", "delivery"),
    ):
        require(
            f"`{role}` | `{task}`" in observability,
            f"AC17 lifecycle role/task pair missing {role}/{task}",
        )

    for marker in (
        "Declared specialist lifecycle",
        "coordinator bookkeeping declarations, not native Codex telemetry",
        "strict native usage/cost branch or the legacy Claude route",
    ):
        require(marker in pipeline_flat, f"pipeline lifecycle instruction misses {marker!r}")

    for marker in (
        "Declared Codex agent-lifecycle overlay — conditional",
        "agent_lifecycle_schema_version: 1|null",
        "agent_lifecycle_metrics_status: available|unavailable|null",
        "agent_lifecycle_attempt_count: N|null",
        "agent_lifecycle_follow_up_count: N|null",
        "agent_lifecycle_correction_count: N|null",
        "agent_lifecycle_quality_verdicts:",
        "agent_lifecycle_metrics:",
        "approved_ac_count: N|null",
        "cached_input_per_approved_ac: decimal|unavailable",
        "n_a:N",
        "does not divide, attribute, or copy a root/phase usage delta",
    ):
        require(marker in shared_state_flat, f"lifecycle state overlay misses {marker!r}")

    for marker in (
        "agent_lifecycle_schema_version: 1|null",
        "agent_lifecycle_metrics_status: available|unavailable|null",
        "agent_lifecycle_quality_verdicts: {pass:N,concerns:N,fail:N,n_a:N}|null",
        "cached_input_per_approved_ac: decimal|unavailable",
        "The state key `n_a` aggregates only the closed event value `n-a`",
    ):
        require(marker in codex_state_flat, f"Codex lifecycle state schema misses {marker!r}")

    for marker in (
        "Declared Codex agent lifecycle",
        "`agent.spawn`, `agent.close`, `agent.correction.spawn`",
        "Declared lifecycle efficiency render",
        "## Lifecycle Efficiency",
        "Cached-input per approved AC",
        "does **not** select the Native Codex cost branch",
        "PER_ATTEMPT_METRICS_UNAVAILABLE",
    ):
        require(marker in docs_flat, f"observability docs AC17 marker missing {marker!r}")

    for marker in (
        "Declared Codex lifecycle efficiency — selected only by `agent.*`",
        "the legacy output above unchanged",
        "PER_ATTEMPT_METRICS_UNAVAILABLE",
        "aggregate key `n_a` represents only the closed event enum `n-a`",
        "Cached-input per approved AC",
        "never changes the legacy Claude cost route or the strict Native Codex cost semantics",
    ):
        require(marker in trace_flat, f"trace lifecycle renderer misses {marker!r}")

    require(
        "never selects the Native Codex cost branch" in docs,
        "AC17 lifecycle events can accidentally select native cost accounting",
    )
    require(
        "legacy Claude route" in observability and "legacy Claude route" in pipeline,
        "AC17 lifecycle contract can weaken the legacy Claude route",
    )


def main() -> None:
    checks = (
        ("v3 machine", check_v3_machine),
        ("corrective routes", check_corrective_routes),
        ("explicit validation correction decision", check_explicit_validation_correction_decision),
        ("authoritative post-Gate-1 transitions", check_authoritative_post_gate1_transitions),
        ("direct predicate", check_direct_predicate),
        ("single writer", check_single_writer),
        ("Codex QA checkbox-mirror owner", check_codex_qa_checkbox_mirror_owner),
        ("gate aliases", check_gate_aliases),
        ("profile/document guards", check_profile_and_document_guards),
        ("recovery fail-closed", check_recovery_fail_closed),
        ("residual corrections", check_residual_corrections),
        ("sensitive inline authorization", check_sensitive_inline_authorization),
        ("ad-hoc review boundary", check_ad_hoc_review_boundary),
        ("inline review contract", check_inline_review_contract),
        ("inline Git hardening", check_inline_git_hardening),
        ("single ship delivery", check_single_ship_delivery),
        ("delivery preview binding", check_delivery_preview_binding),
        ("terminal/transition mapping", check_terminal_and_transition_mapping),
        ("PR review regressions", check_review_comment_regressions),
        ("PR review workspace isolation", check_pr_review_workspace_isolation),
        ("Claude/Codex parity", check_claude_codex_parity),
        ("execution efficiency", check_execution_efficiency_contract),
        ("context isolation and rotation", check_context_isolation_rotation_contract),
        ("Codex usage observability", check_codex_usage_observability_contract),
        ("declared agent lifecycle", check_declared_agent_lifecycle_contract),
    )
    for name, check in checks:
        check()
        print(f"pipeline contract {name}: PASS")
    print("pipeline contract structure: PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"pipeline contract structure: FAIL: {error}", file=sys.stderr)
        raise
