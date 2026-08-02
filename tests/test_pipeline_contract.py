#!/usr/bin/env python3
"""Structural checks for the converged Claude/Codex pipeline contract.

The pipeline is specified by Markdown because both runtimes consume prose.  This
suite checks the small set of machine-shaped invariants that must not drift across
the two projections: the v3 state sequence, correction routing, direct execution,
single-writer ownership, and gate input aliases.
"""

from __future__ import annotations

import re
import sys
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
    require("defect in scope → implementation" in claude_flow, "Claude defect edge drifted")
    require("amend → implementation" in claude_flow, "Claude amend edge drifted")
    require("edit/reject → design" in claude_flow, "Claude Gate 1 edge drifted")


def check_corrective_routes() -> None:
    """The final-result correction routes remain equivalent across projections."""
    claude_pipeline = read("agents/ref-pipeline.md")
    claude_correction = section(
        claude_pipeline,
        "## Final-result correction and structural contradiction",
        "### Implementation checkpoint",
    )
    claude_audit = section(
        claude_pipeline,
        "### The audit never iterates",
        "### Knowledge write on audit findings",
    )
    codex_pipeline = read("plugins/team-harness/skills/pipeline/SKILL.md")
    codex_validation = read("plugins/team-harness/skills/pipeline/references/validation.md")
    codex_security = read("runtime/codex/instructions/security.md")
    codex_tester = read("runtime/codex/instructions/tester.md")
    codex_routes = "\n".join((codex_pipeline, codex_validation, codex_security, codex_tester))
    codex_sensitive = section(
        codex_pipeline,
        "## Stage 1 and final-result routing",
        "## Start",
    )

    # Ordinary code/test/docs defects return to implementation; missing evidence
    # remains a tester responsibility in both runtimes.
    require("return to `implementation`" in claude_correction, "Claude defect route drifted")
    require("Evidence gaps return to `tester`" in claude_correction, "Claude evidence route drifted")
    require("return to the implementation executor" in codex_pipeline, "Codex defect route drifted")
    require("Missing evidence returns to" in codex_pipeline, "Codex evidence route drifted")
    require("`tester`" in codex_validation, "Codex evidence route lost tester owner")

    # Sensitive findings and incomplete sensitive coverage must go through the
    # same implementation → Freeze → audit loop, never silently pass validation.
    for label, text in (("Claude", claude_audit), ("Codex", codex_sensitive)):
        lowered = text.lower()
        require("implementation" in lowered, f"{label}: sensitive route lacks implementation")
        require("freeze" in lowered, f"{label}: sensitive route lacks Freeze reopening")
        require_any(
            text,
            ("fresh security audit", "fresh audit", "re-audit", "re-audit required"),
            f"{label}: sensitive route lacks fresh audit requirement",
        )

    require("broke-it" in claude_audit, "Claude audit route lost broke-it handling")
    require(
        "incomplete_on_changed_control" in claude_audit,
        "Claude audit route lost incomplete sensitive-coverage handling",
    )
    require("sensitive coverage gap" in codex_routes.lower(), "Codex route lost sensitive coverage handling")

    # A correctable break or incomplete sensitive coverage is a validation
    # failure: it cannot enter waiting_gate3 or be accepted by `ship`. The
    # compact Codex projection expresses the same invariant through its
    # current-anchor/no-ship rule rather than repeating the adversary vocabulary.
    claude_gate3 = section(claude_pipeline, "## STAGE-GATE-3", "## Delivery")
    require(
        "prevents this state entirely" in claude_gate3
        and "never reaches this gate" in claude_gate3,
        "Claude: correctable sensitive findings can reach Gate 3",
    )
    require(
        "broke-it" in claude_gate3 and "incomplete sensitive-coverage" in claude_gate3,
        "Claude: Gate 3 does not name both fail-closed security cases",
    )
    codex_validation_flat = re.sub(r"\s+", " ", codex_validation.lower())
    require(
        "do not ship until the audit has seen the current anchor" in codex_validation_flat,
        "Codex: Gate 3 can ship a sensitive delta before re-audit",
    )
    require(
        "correctable sensitive finding" in codex_pipeline.lower()
        and "fresh security audit" in codex_pipeline.lower(),
        "Codex: sensitive correction route is not tied to fresh audit",
    )

    # A structural contradiction is the only correction that can reopen design,
    # and it needs an operator decision plus a new Gate 1 in both projections.
    for label, text in (("Claude", claude_correction), ("Codex", codex_routes)):
        lowered = text.lower()
        require("structural contradiction" in lowered, f"{label}: contradiction route missing")
        require("operator" in lowered, f"{label}: contradiction route lacks operator decision")
        require("design" in lowered and "gate 1" in lowered, f"{label}: contradiction route lacks new Gate 1")


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
            r"\b(?:do not|never|must not)\b[^.;\n]*(?:\bwrite\b[^.;\n]*\b00-state\b|\bwrite coordination state\b)",
            adapter,
        )
        gate_denied = re.search(
            r"\b(?:do not|never|must not)\b[^.;\n]*\b(?:approve|release)\b[^.;\n]*\bgates?\b",
            adapter,
        )
        require(state_denied is not None, f"Codex {role}: may write coordination state")
        require(gate_denied is not None, f"Codex {role}: may approve or release a gate")


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
    require("returns to `implementation`" in validation.lower(), "Claude validation: security correction route missing")
    require("fresh audit" in validation.lower(), "Claude validation: fresh audit requirement missing")
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


def check_review_artifacts(label: str, text: str) -> None:
    lowered = re.sub(r"\s+", " ", text.lower())
    require("ad hoc" in lowered or "ad-hoc" in lowered, f"{label}: ad-hoc review boundary missing")
    for artifact in ("workspace", "state", "events", "gates", "delivery"):
        require(artifact in lowered, f"{label}: ad-hoc review missing {artifact} prohibition")
        denied = re.search(rf"(?:\bcreates?\s+no\b|\bwithout\b|\bnever\s+(?:creates?|writes?|records?)\b)[^.;\n]{{0,180}}\b{artifact}\b", lowered)
        require(denied is not None, f"{label}: ad-hoc review does not clause-scope {artifact}")
    require(all(marker in lowered for marker in ("live", "tester", "qa", "security")), f"{label}: live roles drifted")


def check_codex_adapter_boundary(role: str) -> None:
    adapter = read(f"runtime/codex/instructions/{role}.md").lower()
    require("mode: inline-review" in adapter, f"Codex {role}: inline-review missing")
    require(re.search(r"creates? no workspace", adapter) is not None and "coordination state" in adapter, f"Codex {role}: state boundary missing")
    require("delivery record" in adapter and re.search(r"creates? no", adapter) is not None, f"Codex {role}: delivery boundary missing")
    require("run_inline_review.mjs" in adapter and "lens_status: unavailable" in adapter, f"Codex {role}: runner fail-close missing")


def check_ad_hoc_review_boundary() -> None:
    """Live tester/QA/security reviews stay inline and artifact-free."""
    claude = "\n".join(read(path) for path in ("agents/orchestrator.md", "agents/ref-direct-modes.md", "docs/pipeline-lanes.md", "agents/tester.md", "agents/qa.md", "agents/security.md"))
    codex = "\n".join(read(path) for path in ("plugins/team-harness/skills/init/SKILL.md", "plugins/team-harness/skills/pipeline/references/activation.md", "plugins/team-harness/skills/pipeline/references/validation.md", "runtime/codex/instructions/tester.md", "runtime/codex/instructions/qa.md", "runtime/codex/instructions/security.md"))
    check_review_artifacts("Claude", claude)
    check_review_artifacts("Codex", codex)
    for role in ("tester", "qa", "security"):
        check_codex_adapter_boundary(role)


def check_inline_markers(contract: str) -> None:
    markers = ("mode: inline-review", "allowed_roots", "content", "mode: inline-review", "requested_lenses", "required_lenses", "read_only: true", "target_id", "manifest_digest", "evidence_id", "realpath", "digest", "allowed root", "coverage.checked", "`evidence_id` values", "re-realpaths, re-reads", "incomplete|untrusted", "never produce PASS")
    for marker in markers:
        require(marker in contract, f"inline contract missing {marker!r}")
    for marker in ("no write", "network", "publication", "commands defined by `Main`", "untrusted data", "isolated runner", "no shell", "no direct tree access"):
        require(marker in contract, f"inline tool boundary missing {marker!r}")
    for marker in ("complete|incomplete|failed|unavailable|untrusted", "every `required_lenses`", "no blocker", "unresolved blocking disagreement", "never averages verdicts", "absent return as PASS", "verdict: pass", "resolved", "last-write-wins"):
        require(marker in contract, f"inline consolidation rule missing {marker!r}")


def check_pr_precedence(source: str, text: str) -> None:
    lowered = text.lower()
    require("review-pr" in lowered and "inline-review" in lowered, f"{source}: route missing")
    require("pr number" in lowered and "pr url" in lowered, f"{source}: PR aliases missing")
    require("pr review" in lowered or "pr-review" in lowered or "review a pr" in lowered, f"{source}: PR intent missing")
    require("exclusive" in lowered or ("precedence" in lowered and "must not intercept" in lowered), f"{source}: precedence missing")


def check_inline_review_contract() -> None:
    """Inline evidence, tool, lens, and routing invariants stay fail-closed."""
    contract = read("agents/_shared/inline-review-contract.md")
    check_inline_markers(contract)
    for source, path in (("coordinator", "agents/orchestrator.md"), ("direct router", "agents/ref-direct-modes.md"), ("Codex init", "plugins/team-harness/skills/init/SKILL.md")):
        check_pr_precedence(source, read(path))
    for role in ("tester", "qa", "security"):
        lowered = read(f"runtime/codex/instructions/{role}.md").lower()
        for marker in ("requested_lenses", "required_lenses", "target_id", "manifest_digest", "lens_status: complete|incomplete|failed|unavailable|untrusted", "output: null", "run_inline_review.mjs", "no prose-only", "incomplete|untrusted"):
            require(marker in lowered, f"Codex {role}: inline field missing {marker!r}")


def check_single_ship_delivery() -> None:
    """Gate 3 ship is the one operator decision through draft PR."""
    sources = {
        "Claude gate": read("agents/_shared/gate-contract.md"),
        "Claude mechanics": read("agents/_shared/delivery-mechanics.md"),
        "Claude pipeline": read("agents/ref-pipeline.md"),
        "Codex pipeline": read("plugins/team-harness/skills/pipeline/SKILL.md"),
        "Codex state": read("plugins/team-harness/skills/pipeline/references/state-and-gates.md"),
        "Codex delivery skill": read("plugins/team-harness/skills/deliver/SKILL.md"),
        "Codex delivery reference": read("plugins/team-harness/skills/pipeline/references/delivery.md"),
    }
    for label, text in sources.items():
        flat = re.sub(r"\s+", " ", text.lower())
        for marker in ("version", "commit", "push", "draft pr"):
            require(marker in flat, f"{label}: ship delivery omits {marker}")
        require(
            "do not ask" in flat
            or "no second conversational" in flat
            or "without another conversational" in flat
            or "never ask" in flat,
            f"{label}: delivery can ask for another operator decision after ship",
        )
        require("merge" in flat and "release" in flat, f"{label}: ship exclusions are incomplete")

    codex_pipeline = sources["Codex pipeline"].lower()
    require(
        "does not authorize a push" not in codex_pipeline,
        "Codex pipeline still says Gate 3 ship cannot authorize push/PR",
    )
    codex_delivery = re.sub(r"\s+", " ", sources["Codex delivery reference"].lower())
    require(
        "technical runtime boundary" in codex_delivery
        and "not a new team harness" in codex_delivery,
        "Codex delivery conflates native tool permission with another operator gate",
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
    require("do not regenerate prose" in codex_delivery, "Codex delivery can regenerate approved prose")
    require("never recompose" in claude_delivery_flat, "Claude mechanics can recompose approved prose")
    require("--draft" in claude_delivery and "isdraft" in claude_delivery, "Claude mechanics do not enforce draft-only PR delivery")
    require("open` with `isdraft: false" in claude_delivery, "Ready-for-review PR mutation is not blocked")
    require(
        "approved title from delivery_preview" in claude_delivery_flat
        and "approved pr_body_path from delivery_preview" in claude_delivery_flat,
        "Claude mechanics can regenerate or select a different PR title/body",
    )
    require(
        "runs even when the version bump was skipped" in claude_delivery_flat
        and "stop this section after materialization" in claude_delivery_flat,
        "Claude mechanics can lose the approved fragment when versioning is deferred",
    )
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

    qa = read("agents/qa.md")
    qa_inline = section(qa, "### Ad-hoc inline review", "### Validate Mode")
    for marker in ("early return", "no workspace discovery", ".gitignore", "output: null"):
        require(marker in qa_inline, f"QA inline review: missing early-return guard {marker!r}")
    qa_session = section(qa, "## Session Context Protocol", "## Phase 0")
    require("inline-review" in qa_session and "never enters this protocol" in qa_session, "QA inline review can enter the workspace protocol")

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


def main() -> None:
    checks = (
        ("v3 machine", check_v3_machine),
        ("corrective routes", check_corrective_routes),
        ("direct predicate", check_direct_predicate),
        ("single writer", check_single_writer),
        ("gate aliases", check_gate_aliases),
        ("profile/document guards", check_profile_and_document_guards),
        ("recovery fail-closed", check_recovery_fail_closed),
        ("residual corrections", check_residual_corrections),
        ("sensitive inline authorization", check_sensitive_inline_authorization),
        ("ad-hoc review boundary", check_ad_hoc_review_boundary),
        ("inline review contract", check_inline_review_contract),
        ("single ship delivery", check_single_ship_delivery),
        ("delivery preview binding", check_delivery_preview_binding),
        ("terminal/transition mapping", check_terminal_and_transition_mapping),
        ("PR review regressions", check_review_comment_regressions),
        ("Claude/Codex parity", check_claude_codex_parity),
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
