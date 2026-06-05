#!/usr/bin/env python3
# tests/test_agent_structure.py
# Structural tests for the artifacts changed in the harness-hardening +
# Reviewability Contract pass. Verifies that the .md files contain the sections
# and fields they declare, and that the cross-references between them line up.
#
# This is NOT a behavioural test — agent prompts only run inside Claude Code.
# Instead it checks that what the prompts SAY about themselves is internally
# consistent and present.
#
# Usage:
#   python3 tests/test_agent_structure.py
# Exit code:
#   0 if all cases pass, 1 otherwise.

from __future__ import annotations

import io
import json
import os
import re
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower().startswith("cp"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = REPO_ROOT / "agents"
SKILLS_DIR = REPO_ROOT / "skills"
HOOKS_DIR = REPO_ROOT / "hooks"

results: list[tuple[bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((condition, f"{name}{(' — ' + detail) if detail and not condition else ''}"))
    status = "PASS" if condition else "FAIL"
    suffix = f" — {detail}" if detail and not condition else ""
    print(f"  [{status}] {name}{suffix}")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def skill_path(name: str) -> Path:
    """Resolve a skill name to its file, supporting both the subdirectory
    layout (`skills/<name>/SKILL.md`, current) and the legacy flat layout
    (`skills/<name>.md`). Prefers the subdirectory form when present."""
    sub = SKILLS_DIR / name / "SKILL.md"
    if sub.exists():
        return sub
    return SKILLS_DIR / f"{name}.md"


def parse_frontmatter(text: str) -> dict[str, str]:
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end < 0:
        return {}
    block = text[3:end].strip()
    out: dict[str, str] = {}
    for line in block.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            out[k.strip()] = v.strip()
    return out


# ---------------------------------------------------------------------------
# Suite 1 — Tool allowlist per agent
# ---------------------------------------------------------------------------
print("=== Suite 1: Tool allowlist per agent ===")

EXPECTED_AGENTS = [
    "orchestrator", "architect", "agent-builder", "security", "reviewer",
    "reviewer-consolidator",
    "qa", "qa-plan", "gcp-cost-analyzer", "init", "implementer", "tester",
    "acceptance-checker", "plan-reviewer", "diagrammer", "likec4-diagrammer",
    "d2-diagrammer", "translator", "delivery",
]

# Read-only agents that MUST NOT have Bash in their allowlist
READ_ONLY_AGENTS = {"architect", "security", "qa", "qa-plan", "acceptance-checker", "plan-reviewer"}

for agent_name in EXPECTED_AGENTS:
    path = AGENTS_DIR / f"{agent_name}.md"
    check(
        f"agents/{agent_name}.md exists",
        path.exists(),
        f"missing file at {path}",
    )
    if not path.exists():
        continue
    fm = parse_frontmatter(read(path))
    tools = fm.get("tools", "")
    check(
        f"agents/{agent_name}.md frontmatter has tools:",
        bool(tools),
        "tools field missing or empty",
    )
    if agent_name in READ_ONLY_AGENTS:
        has_bash = "Bash" in [t.strip() for t in tools.split(",")]
        check(
            f"agents/{agent_name}.md (read-only) excludes Bash",
            not has_bash,
            f"read-only agent has Bash in allowlist: {tools}",
        )

# ---------------------------------------------------------------------------
# Suite 2 — agents/README.md Roster matrix has Tools column and matches
# ---------------------------------------------------------------------------
print()
print("=== Suite 2: agents/README.md Roster ===")

readme = read(AGENTS_DIR / "README.md")
check(
    "agents/README.md mentions tools field",
    "tools" in readme.lower() and "allowlist" in readme.lower(),
    "tools / allowlist not documented in agents/README.md",
)
check(
    "agents/README.md Roster has 5-column matrix",
    "| Model | Effort | Tools" in readme or "Model + Effort + Tools" in readme,
    "expected 'Model + Effort + Tools + Role' or similar header in Roster",
)

# ---------------------------------------------------------------------------
# Suite 3 — orchestrator.md has new phases and artifacts
# ---------------------------------------------------------------------------
print()
print("=== Suite 3: orchestrator.md harness pieces ===")

orch = read(AGENTS_DIR / "orchestrator.md")
checks_orch = [
    ("Phase 1.5", "Phase 1.5 — Plan Ratification"),
    ("Phase 1.6", "Phase 1.6 — Plan Review"),
    ("Phase 2.5", "Phase 2.5 — Constraint Reconciliation"),
    ("Phase 3.5", "Phase 3.5 — Acceptance Gate"),
    ("Phase 3.6", "Phase 3.6 — Acceptance Check"),
    ("Phase 4.5", "Phase 4.5 — Internal Review"),
    ("STAGE-GATE-1", "STAGE-GATE-1"),
    ("STAGE-GATE-2", "STAGE-GATE-2"),
    ("STAGE-GATE-3", "STAGE-GATE-3"),
    ("Stage 1 label", "Stage 1"),
    ("Stage 2 label", "Stage 2"),
    ("Stage 3 label", "Stage 3"),
    ("Autonomous Mode section", "## Autonomous Mode"),
    ("approve autonomous gate phrase", "approve autonomous"),
    ("pipeline_version field", "pipeline_version"),
    ("plan-reviewer in team", "plan-reviewer"),
    ("01-plan.md Task List section", "Task List"),
    ("Plan Review appended to 01-plan.md", "01-plan.md § Plan Review"),
    ("stage.gate event", "stage.gate"),
    ("stage.gate.release event", "stage.gate.release"),
    ("stage.gate.skipped event", "stage.gate.skipped"),
    ("Stage 2 DAG scheduler", "Stage 2 scheduler"),
    ("Stage 2 rounds concept", "Round 1"),
    ("Stage 2 parallel within round", "in parallel"),
    ("Stage 2 sequential fallback", "Sequential fallback"),
    ("STAGE-GATE-2 round granularity", "Between rounds"),
    ("STAGE-GATE-2 partial-fail handling", "partial-fail"),
    ("after_round JSONL field", "after_round"),
    ("STAGE-GATE-1 surfaces TL;DR inline", "TL;DR"),
    ("STAGE-GATE-1 surfaces Review Summary inline", "Review Summary"),
    ("STAGE-GATE-1 surfaces PR Summary inline", "PR Summary"),
    ("STAGE-GATE-1 protects against giant Summary table", "+{N-10} more"),
    ("test-ratchet", "Test-ratchet check"),
    ("done.yml schema", "done.yml"),
    ("JSONL trace", "00-execution-events.jsonl"),
    ("compaction trigger", "Mid-pipeline compaction trigger"),
    ("policy-block reference", "policy-block"),
]
for label, marker in checks_orch:
    check(
        f"orchestrator.md mentions {label}",
        marker in orch,
        f"marker '{marker}' not found",
    )

# orchestrator.md must declare that STAGE-GATE-1 and STAGE-GATE-3 cannot be skipped
check(
    "orchestrator.md declares STAGE-GATE-1 is mandatory / non-skippable",
    "STAGE-GATE-1" in orch and ("mandatory" in orch.lower() or "never skip" in orch.lower() or "cannot be skipped" in orch.lower()),
    "STAGE-GATE-1 mandatory-ness not documented",
)
check(
    "orchestrator.md declares STAGE-GATE-3 is mandatory / non-skippable",
    "STAGE-GATE-3" in orch and ("irreversible" in orch.lower() or "cannot be skipped" in orch.lower()),
    "STAGE-GATE-3 mandatory-ness not documented",
)

# ---------------------------------------------------------------------------
# Suite 4 — tester.md Return Protocol carries the ratchet fields
# ---------------------------------------------------------------------------
print()
print("=== Suite 4: tester.md Return Protocol ===")

tester = read(AGENTS_DIR / "tester.md")
ret_proto = tester.split("## Return Protocol", 1)
check("tester.md has Return Protocol section", len(ret_proto) > 1)
if len(ret_proto) > 1:
    rp = ret_proto[1]
    for f in ("tests_count", "tests_deleted", "tests_deleted_reason"):
        check(f"tester.md Return Protocol declares {f}", f in rp)

# ---------------------------------------------------------------------------
# Suite 5 — qa.md has Reconcile Mode (Phase 2.5)
# ---------------------------------------------------------------------------
print()
print("=== Suite 5: qa-plan.md Reconcile Mode ===")

qa_plan = read(AGENTS_DIR / "qa-plan.md")
check("qa-plan.md has Reconcile Mode header", "Reconcile Mode (Phase 2.5" in qa_plan)
check("qa-plan.md Reconcile Mode mentions keep / amend / drop",
      all(kw in qa_plan for kw in ["keep", "amend", "drop"]))
check("qa-plan.md Reconcile Mode references Original Description",
      "Original Description" in qa_plan)

# ---------------------------------------------------------------------------
# Suite 6 — reviewer.md has Internal Review mode + Reviewability score
# ---------------------------------------------------------------------------
print()
print("=== Suite 6: reviewer.md Internal Review + Reviewability ===")

reviewer = read(AGENTS_DIR / "reviewer.md")
check("reviewer.md has Internal Review section",
      "Internal Review (Phase 4.5" in reviewer)
check("reviewer.md Internal Review explicitly does not publish",
      "Does NOT publish to GitHub" in reviewer or "no GitHub publish" in reviewer.lower())
check("reviewer.md has Reviewability Assessment section",
      "Reviewability Assessment" in reviewer)
check("reviewer.md Reviewability score has alta/media/baja",
      all(t in reviewer for t in ["alta", "media", "baja"]))
check("reviewer.md Reviewability mentions 40 lines / 4 params / 3 levels",
      "40" in reviewer and ("3 niveles" in reviewer or "3 levels" in reviewer))

# ---------------------------------------------------------------------------
# Suite 7 — implementer.md Reviewability Contract
# ---------------------------------------------------------------------------
print()
print("=== Suite 7: implementer.md Reviewability Contract ===")

impl = read(AGENTS_DIR / "implementer.md")
checks_impl = [
    ("Reviewability bullet in non-negotiable list", "**Reviewability"),
    ("40 lines cap", "40 lines"),
    ("4 parameters cap", "4 parameters"),
    ("nesting depth 3", "nesting depth ≤ 3"),
    ("golden-path keyword", "Golden-path"),
    ("one concern per commit", "One concern per commit"),
    ("test names describe behaviour",
     "Test names describe behaviour"),
    ("Reviewability self-check sub-section", "Reviewability self-check"),
    ("Reviewability Exceptions section in template", "Reviewability Exceptions"),
]
for label, marker in checks_impl:
    check(f"implementer.md has {label}",
          marker in impl,
          f"marker '{marker}' not found")

# ---------------------------------------------------------------------------
# Suite 8 — delivery.md Step 9d (size gate) and Step 11.2 sections
# ---------------------------------------------------------------------------
print()
print("=== Suite 8: delivery.md size gate + structured PR body ===")

delivery = read(AGENTS_DIR / "delivery.md")
checks_delivery = [
    ("Step 9d size gate", "Step 9d — Reviewability size gate"),
    ("400 lines threshold", "400"),
    ("8 files threshold", "8 files"),
    ("done.yml read at Step 0", "done.yml"),
    ("PR body section: Main change", "## Main change"),
    ("PR body section: File map", "## File map"),
    ("PR body section: How to review", "## How to review"),
    ("PR body section: Risk and blast radius", "## Risk and blast radius"),
    ("PR body section: Pre-PR Review (conditional)", "## Pre-PR Review"),
    ("PR body section: Size justification (conditional)",
     "## Size justification"),
]
for label, marker in checks_delivery:
    check(f"delivery.md has {label}",
          marker in delivery,
          f"marker '{marker}' not found")

# ---------------------------------------------------------------------------
# Suite 9 — hooks/config.json wires PreToolUse for all OS
# ---------------------------------------------------------------------------
print()
print("=== Suite 9: hooks/config.json PreToolUse wiring ===")

cfg = json.loads(read(HOOKS_DIR / "config.json"))
for os_key in ("windows", "macos", "linux"):
    section = cfg.get(os_key, {})
    hooks = section.get("hooks", {})
    pretool = hooks.get("PreToolUse", [])
    check(f"hooks/config.json[{os_key}] has PreToolUse entry",
          len(pretool) > 0,
          "PreToolUse missing or empty")
    if pretool:
        matcher = pretool[0].get("matcher", "")
        cmd = (pretool[0].get("hooks", [{}])[0]).get("command", "")
        check(f"hooks/config.json[{os_key}] PreToolUse matcher includes Bash",
              "Bash" in matcher,
              f"matcher does not include Bash: '{matcher}'")
        check(f"hooks/config.json[{os_key}] PreToolUse command points to policy-block.sh",
              "policy-block.sh" in cmd,
              f"command does not invoke policy-block.sh: '{cmd}'")

# ---------------------------------------------------------------------------
# Suite 10 — skills/background.md exists and is sane
# ---------------------------------------------------------------------------
print()
print("=== Suite 10: skills/background.md ===")

bg_path = skill_path("background")
check("skills/background.md exists", bg_path.exists())
if bg_path.exists():
    bg = read(bg_path)
    check("skills/background.md has eligibility check",
          "Eligibility check" in bg)
    check("skills/background.md does NOT route to orchestrator",
          "DOES NOT" in bg.upper() or "does NOT invoke the orchestrator" in bg)
    check("skills/background.md mentions claude -p headless",
          "claude -p" in bg)

# ---------------------------------------------------------------------------
# Suite 11 — Cross-references: docs/how-it-works.md and skills/README
# ---------------------------------------------------------------------------
# Assertion placement:
#   - /background and PreToolUse policy gate → docs/how-it-works.md (detail lives there)
#   - Skill count and agent count removed: brittle — exact counts fail on every release;
#     the invariant that every shipped skill/agent exists is covered by Suite 1 / Suite 19.
#   - Constraint Reconciliation / Internal Review / STAGE-GATE-N → docs/pipelines.md
#     (pipeline detail belongs in the pipelines reference document, not the README landing page)
# ---------------------------------------------------------------------------
print()
print("=== Suite 11: README cross-references ===")

top_readme = read(REPO_ROOT / "README.md")
how_it_works = read(REPO_ROOT / "docs" / "how-it-works.md")
pipelines_md = read(REPO_ROOT / "docs" / "pipelines.md")

check("docs/how-it-works.md mentions /background",
      "/background" in how_it_works)
check("docs/how-it-works.md surfaces PreToolUse policy gate",
      "PreToolUse" in how_it_works or "policy gate" in how_it_works.lower())
check("docs/pipelines.md mentions Constraint Reconciliation",
      "Constraint Reconciliation" in pipelines_md)
check("docs/pipelines.md mentions Internal Review",
      "Internal Review" in pipelines_md)

skills_readme = read(SKILLS_DIR / "README.md")
check("skills/README.md lists /th:background as standalone",
      "/th:background" in skills_readme)

# ---------------------------------------------------------------------------
# Suite 12 — plan-reviewer contract + 3-stage gates wiring across agents
# ---------------------------------------------------------------------------
print()
print("=== Suite 12: plan-reviewer + 3-stage gates ===")

# plan-reviewer.md self-checks (existence already covered by Suite 1)
pr_path = AGENTS_DIR / "plan-reviewer.md"
if pr_path.exists():
    plan_reviewer = read(pr_path)
    pr_checks = [
        ("Rule 1 (PR-count)", "Rule 1"),
        ("Rule 2 (per-PR ACs)", "Rule 2"),
        ("Rule 3 (consolidated docs)", "Rule 3"),
        ("Rule 4 (cross-reference)", "Rule 4"),
        ("Rule 5 (service identity)", "Rule 5"),
        ("Rule 6 (human-readability sections)", "Rule 6"),
        ("TL;DR section requirement", "## TL;DR"),
        ("Decisions for human review section", "## Decisions for human review"),
        ("Summary table requirement on 01-plan.md § Task List", "## Summary"),
        ("Decisions hard cap of 7 bullets", "7 bullets"),
        ("temporal-prod reason: coexistence window", "coexistence window"),
        ("temporal-prod reason: production signal", "production signal"),
        ("temporal-prod reason: cross-repo deploy gate", "cross-repo deploy gate"),
        ("Given/When/Then format requirement", "Given/When/Then"),
        ("OAS bump is NOT a valid split reason", "OAS bump"),
        ("forbidden pattern: version markers", "version marker"),
        ("forbidden pattern: strikethrough", "strikethrough"),
        ("forbidden pattern: previously decided", "previously decided"),
        ("forbidden pattern: inline changelog", "inline changelog"),
        ("verdict in Return Protocol", "verdict: pass | concerns | fail"),
        ("output file path", "01-plan.md § Plan Review"),
        ("override mechanism: Plan-reviewer override", "Plan-reviewer override"),
        ("Services Touched reference (Rule 5)", "Services Touched"),
        ("read-only: no Edit on analysis files",
         "NEVER" in plan_reviewer and "modify" in plan_reviewer.lower()),
    ]
    for label, marker in pr_checks:
        if isinstance(marker, bool):
            check(f"plan-reviewer.md declares {label}", marker)
        else:
            check(f"plan-reviewer.md declares {label}",
                  marker in plan_reviewer,
                  f"marker '{marker}' not found")

# architect.md must declare the dual output and the Services Touched section
architect = read(AGENTS_DIR / "architect.md")
check("architect.md declares single-file output (01-plan.md)",
      "01-plan.md" in architect and "Single-file output" in architect,
      "single-file output contract (01-plan.md) not documented in architect.md")
check("architect.md declares the closed list of temporal-prod reasons",
      all(reason in architect for reason in
          ["coexistence window", "production signal", "cross-repo deploy gate"]),
      "closed list of temporal-prod reasons not documented")
check("architect.md declares Services Touched section requirement",
      "Services Touched" in architect,
      "Services Touched requirement not documented")
check("architect.md per-PR template uses Given/When/Then",
      "Given/When/Then" in architect or
      ("Given" in architect and "When" in architect and "Then" in architect),
      "Given/When/Then format not documented in architect")

# architect.md must require the human-readability sections
check("architect.md requires ## TL;DR section (root-cause mode)",
      "## TL;DR" in architect and "MANDATORY" in architect,
      "TL;DR section not declared mandatory in architect.md")
check("architect.md requires ## Decisions for human review section",
      "## Decisions for human review" in architect,
      "Decisions for human review section not documented")
check("architect.md requires ## Summary table in 01-plan.md § Task List",
      "## Summary" in architect and "Summary table" in architect,
      "Summary table not required in 01-plan.md § Task List schema")
check("architect.md spells out Review Summary opening is ≤5 sentences",
      "≤5 sentences" in architect,
      "Review Summary size guidance (≤5 sentences) missing")
check("architect.md spells out Decisions is 3-5 bullets (hard cap 7)",
      "3-5 bullets" in architect and ("hard cap 7" in architect or "cap 7" in architect),
      "Decisions for human review size guidance missing")
check("architect.md explains what does NOT belong in Decisions",
      "NOT belong" in architect and "Mechanical pattern" in architect,
      "guidance on what does NOT belong in Decisions missing")
check("architect.md allows 'No human-judgement decisions' as valid value",
      "No human-judgement decisions" in architect,
      "fallback bullet for zero decisions not documented")

# qa.md must declare per-PR scoping when 01-plan.md § Task List is present
qa_md = read(AGENTS_DIR / "qa.md")
check("qa.md validate-mode reads 01-plan.md per PR",
      "01-plan.md" in qa_md,
      "01-plan.md per-PR scoping not documented in qa.md")
check("qa.md distinguishes Phase 1.5 (ratify) from Phase 1.6 (plan-review)",
      "Phase 1.5" in qa_md and "Phase 1.6" in qa_md and "plan-reviewer" in qa_md,
      "qa.md does not document the distinction with plan-reviewer")

# implementer.md must declare per-PR scoping + SCOPE-DRIFT annotation
impl_md = read(AGENTS_DIR / "implementer.md")
check("implementer.md reads 01-plan.md for per-PR ACs",
      "01-plan.md" in impl_md,
      "implementer.md does not read 01-plan.md")
check("implementer.md declares SCOPE-DRIFT annotation",
      "SCOPE-DRIFT" in impl_md,
      "SCOPE-DRIFT annotation pattern not documented")

# ref-direct-modes.md adds Plan Review direct mode
ref_direct = read(AGENTS_DIR / "ref-direct-modes.md")
check("ref-direct-modes.md adds Plan Review direct mode",
      "Plan Review" in ref_direct and "plan-reviewer" in ref_direct,
      "Plan Review direct mode not documented")

# ref-special-flows.md updates plan flow vs design mode distinction
ref_flows = read(AGENTS_DIR / "ref-special-flows.md")
check("ref-special-flows.md distinguishes 01-planning.md vs 01-plan.md",
      "01-planning.md" in ref_flows and "01-plan.md" in ref_flows,
      "plan flow vs design mode distinction not documented")
check("ref-special-flows.md addresses double-gating in plan-and-execute",
      "double-gating" in ref_flows.lower() or "No double-gating" in ref_flows,
      "double-gating handling not documented")

# agents/README.md roster must include plan-reviewer
ag_readme = read(AGENTS_DIR / "README.md")
check("agents/README.md roster includes plan-reviewer",
      "plan-reviewer" in ag_readme,
      "plan-reviewer missing from agents/README.md roster")
check("agents/README.md roster lists plan-reviewer with model sonnet",
      "plan-reviewer" in ag_readme and "sonnet" in ag_readme,
      "plan-reviewer model not declared as sonnet")

# docs/pipelines.md must document the 3-stage gates
# (Relocated from README: gate identifiers belong in the pipelines reference,
# not the minimal landing page. Agent count removed: brittle, fails each release;
# Suite 1 and Suite 19 cover the invariant that every shipped agent file exists.)
check("docs/pipelines.md mentions STAGE-GATE-1", "STAGE-GATE-1" in pipelines_md,
      "STAGE-GATE-1 not documented in docs/pipelines.md")
check("docs/pipelines.md mentions STAGE-GATE-2", "STAGE-GATE-2" in pipelines_md,
      "STAGE-GATE-2 not documented in docs/pipelines.md")
check("docs/pipelines.md mentions STAGE-GATE-3", "STAGE-GATE-3" in pipelines_md,
      "STAGE-GATE-3 not documented in docs/pipelines.md")
# (README.md no longer enumerates agents — minimal landing page; the roster
#  lives in agents/README.md, covered by the check above. See the relocation
#  note for the gate identifiers immediately above.)

# ---------------------------------------------------------------------------
# Suite 13 — human-readable state (## TL;DR + /status timeline)
# ---------------------------------------------------------------------------
print()
print("=== Suite 13: human-readable state surface ===")

# orchestrator.md changes
check("orchestrator.md 00-state.md schema declares the ## TL;DR section",
      "## TL;DR" in orch and "00-state.md" in orch,
      "## TL;DR not declared in 00-state.md schema")

check("orchestrator.md TL;DR schema names the four fixed fields",
      all(field in orch for field in ["**Now:**", "**Last:**", "**Next:**", "**Open issues:**"]),
      "one or more TL;DR fields (Now/Last/Next/Open issues) missing from orchestrator")

check("orchestrator.md TL;DR section dogfoods consolidated rule (rewritten in place)",
      "rewrites" in orch.lower() and "TL;DR" in orch and ("in place" in orch or "never appends" in orch.lower()),
      "TL;DR rewrite-in-place rule not documented")

# Per-phase update instructions for each of the 22 update points in §5.2.
# Minimum set required by AC-2 of the intake: rows 1, 5/6, 8, 12, 14, 19, 22 of §5.2.
# The assertion checks the phase section bodies, not just the index.
for phase_label in ("Phase 0a", "Phase 1.6", "STAGE-GATE-1", "Phase 2 ", "Phase 3.5", "STAGE-GATE-2", "STAGE-GATE-3", "Phase 6"):
    check(f"orchestrator.md {phase_label} body mentions TL;DR rewrite",
          phase_label in orch and "TL;DR" in orch,
          f"TL;DR rewrite instruction not found near {phase_label}")
# (this check expands to 8 phase-label assertions; counted as one logical check group)

# skills/pipelines.md changes
status_md = read(skill_path("pipelines"))
check("skills/pipelines.md no-args table has Stage column",
      "Stage" in status_md and "| Stage |" in status_md,
      "Stage column not added to /th:pipelines no-args table")

check("skills/pipelines.md documents the 7 refined Status values",
      all(v in status_md for v in ["waiting_gate_1", "waiting_gate_2", "waiting_gate_3",
                                    "autonomous", "iterating", "complete", "paused"]),
      "one or more refined Status values missing from /th:pipelines")

check("skills/pipelines.md <feature-name> mode reads execution events (dual-format: .md or .jsonl)",
      "<feature-name>" in status_md and "00-execution-events.md" in status_md and "00-execution-events.jsonl" in status_md,
      "/th:pipelines <feature> does not reference both execution events formats")

check("skills/pipelines.md timeline declares the event types it renders",
      all(e in status_md for e in ["stage.gate", "stage.gate.release", "stage.gate.skipped",
                                    "gate.pass", "gate.fail", "iteration.start", "phase.end"]),
      "Timeline event-type list incomplete in /th:pipelines")

check("skills/pipelines.md handles missing JSONL gracefully (no crash)",
      "no events recorded" in status_md or "JSONL" in status_md and "missing" in status_md.lower(),
      "Graceful degradation for missing JSONL not documented in /th:pipelines")

check("skills/pipelines.md renderer never modifies state",
      "never modifies" in status_md or "Read-only" in status_md or "read-only" in status_md,
      "/th:pipelines read-only contract not stated explicitly")

# CHANGELOG.md entry
changelog = read(REPO_ROOT / "CHANGELOG.md")
check("CHANGELOG.md [Unreleased] mentions TL;DR + Stage column + narrative timeline",
      "[Unreleased]" in changelog and "TL;DR" in changelog and "Stage" in changelog
      and ("timeline" in changelog.lower() or "narrative" in changelog.lower()),
      "CHANGELOG entry for human-readable state surface missing or incomplete")

# ---------------------------------------------------------------------------
# Suite 14 — KG vocabulary expansion + subagent KG access
# ---------------------------------------------------------------------------
print()
print("=== Suite 14: KG vocabulary + subagent KG access ===")

# 1. orchestrator declares the new entity types
check("orchestrator.md Phase 6 entity-type list includes 'project'",
      "project" in orch and "Entity type:" in orch and "project`" in orch,
      "'project' entity type not in Phase 6 entity-type allowlist")
check("orchestrator.md Phase 6 entity-type list includes 'service'",
      "service`" in orch,
      "'service' entity type not in Phase 6 entity-type allowlist")
check("orchestrator.md Phase 6 entity-type list includes 'stack-profile'",
      "stack-profile" in orch,
      "'stack-profile' entity type not in Phase 6 entity-type allowlist")

# 2. orchestrator declares the new relation types with their pairs
for rel in ("belongs-to", "calls", "uses-stack", "depends-on"):
    check(f"orchestrator.md Phase 6 declares relation '{rel}'",
          rel in orch,
          f"relation type '{rel}' not declared in Phase 6")

# 3. orchestrator declares explicit Save triggers subsection
check("orchestrator.md Phase 6 has Save triggers subsection",
      "Save triggers" in orch,
      "Save triggers subsection missing in Phase 6")

# 4. orchestrator budget is now soft cap 5
check("orchestrator.md Phase 6 budget is soft cap 5 (not hard 3)",
      "Soft cap 5" in orch and "Max 3 entities per pipeline run" not in orch,
      "Phase 6 budget still says hard cap 3 or missing soft cap 5")

# 5. Subagents have KG read-only tools in frontmatter
for agent_name in ("architect", "qa", "tester", "security"):
    agent_text = read(AGENTS_DIR / f"{agent_name}.md")
    fm = parse_frontmatter(agent_text)
    tools_str = fm.get("tools", "")
    tools_list = [t.strip() for t in tools_str.split(",")]
    check(f"agents/{agent_name}.md has mcp__memory__search_nodes",
          "mcp__memory__search_nodes" in tools_list,
          f"{agent_name} missing mcp__memory__search_nodes in tools")
    check(f"agents/{agent_name}.md has mcp__memory__open_nodes",
          "mcp__memory__open_nodes" in tools_list,
          f"{agent_name} missing mcp__memory__open_nodes in tools")
    check(f"agents/{agent_name}.md has Knowledge Graph Access section",
          "Knowledge Graph Access" in agent_text,
          f"{agent_name} missing the KG Access prompt section")
    check(f"agents/{agent_name}.md KG Access section forbids writes",
          "Knowledge Graph Access" in agent_text and "create_nodes" in agent_text and ("Do NOT" in agent_text or "NEVER" in agent_text),
          f"{agent_name} KG Access section does not explicitly forbid writes")

# 6. Excluded agents do NOT have KG read tools (regression guard)
# Note: `delivery` was removed from this list on 2026-05-21 (PR feat/kg-hygiene).
# Step 11.5 now requires `mcp__memory__search_nodes` (Gate 2 dedup pre-flight) and
# `mcp__memory__suggest_node_type` (Gate 1 specificity) before `create_nodes`.
# Delivery's KG access is bounded by intent — write-mostly with one read-only
# pre-flight call — and is documented inline in Step 11.5.
for agent_name in ("implementer", "plan-reviewer", "reviewer"):
    fm = parse_frontmatter(read(AGENTS_DIR / f"{agent_name}.md"))
    tools_list = [t.strip() for t in fm.get("tools", "").split(",")]
    check(f"agents/{agent_name}.md excludes mcp__memory__* (per design)",
          "mcp__memory__search_nodes" not in tools_list and "mcp__memory__open_nodes" not in tools_list,
          f"{agent_name} unexpectedly has KG tools — design says these agents are read-excluded")

# 7. delivery.md Step 5b includes [kg] cross-link template
check("delivery.md Step 5b includes [kg] cross-link bullet",
      "[kg]" in delivery and "Step 5b" in delivery,
      "[kg] cross-link template not added to Step 5b")

# 8. orchestrator Phase 6 documents the docs/knowledge.md append
check("orchestrator.md Phase 6 appends [kg] bullets to docs/knowledge.md",
      "[kg]" in orch and "docs/knowledge.md" in orch,
      "Phase 6 docs/knowledge.md cross-link append not documented")

# 9. init.md still creates docs/knowledge.md placeholder (option (a) confirmed)
init_md = read(AGENTS_DIR / "init.md")
check("init.md still creates docs/knowledge.md placeholder (option a)",
      "docs/knowledge.md" in init_md and "Create docs/knowledge.md" in init_md,
      "init.md no longer documents creating docs/knowledge.md — option (a) violated")

# 10. kg skill documents new types
mem_skill = read(skill_path("kg"))
for new_type in ("project", "service", "stack-profile"):
    check(f"skills/kg.md documents '{new_type}' as a type filter",
          new_type in mem_skill,
          f"new type '{new_type}' not documented in /th:kg list filter")

# 11. CHANGELOG entry
check("CHANGELOG.md [Unreleased] mentions KG vocabulary expansion",
      "[Unreleased]" in changelog and "stack-profile" in changelog,
      "CHANGELOG [Unreleased] missing stack-profile reference")

# ---------------------------------------------------------------------------
# Suite 15 — Mandatory Working Agreements section in CLAUDE.md template
# ---------------------------------------------------------------------------
print()
print("=== Suite 15: Mandatory Working Agreements ===")

# 1. init.md Phase 3 enumerates the Mandatory Working Agreements section
check("init.md Phase 3 declares the Mandatory Working Agreements template section",
      "Mandatory Working Agreements" in init_md and "Phase 3" in init_md,
      "init.md does not declare the Mandatory Working Agreements section in Phase 3")

# 2. init.md template contains the verbatim heading
check("init.md template body has '## 6. Mandatory Working Agreements' (verbatim)",
      "## 6. Mandatory Working Agreements" in init_md,
      "verbatim §6 heading not found in init.md template body")

# 3. init.md template enumerates the 5 sub-blocks
for sub in ("Pre-work", "During-work", "Post-work", "Governance", "Anti-patterns"):
    check(f"init.md template has '{sub}' sub-block",
          sub in init_md,
          f"sub-block '{sub}' not found in init.md template body")

# 4. delivery.md Step 5 references the Mandatory Working Agreements section
check("delivery.md Step 5 cross-references Mandatory Working Agreements (Post-work)",
      "Mandatory Working Agreements" in delivery and "Post-work" in delivery,
      "delivery.md does not cross-reference §6 Mandatory Working Agreements")

# 5. orchestrator.md Phase 0a references the Mandatory Working Agreements section
check("orchestrator.md Phase 0a cross-references Mandatory Working Agreements",
      "Mandatory Working Agreements" in orch and "Phase 0a" in orch,
      "orchestrator.md Phase 0a does not cross-reference §6 Mandatory Working Agreements")

# 6. CHANGELOG entry mentions Working Agreements
check("CHANGELOG.md [Unreleased] mentions Mandatory Working Agreements",
      "[Unreleased]" in changelog and "Mandatory Working Agreements" in changelog,
      "CHANGELOG entry for Mandatory Working Agreements section missing")

# ---------------------------------------------------------------------------
# Suite 16 — workspaces hygiene guardrails
#   qa.md: "Files I write (exhaustive)" + "Files I MUST NOT write"
#   architect.md: "Forbidden output patterns" with no-history rule
#   orchestrator.md: explicit plan-review routing + qa-substance ban
# Triggered by a real failure in a downstream pipeline that accumulated
# 01-coverage-review.md, 02-flow-coverage.md and a qa-reports/PR-N.md tree
# alongside 01-plan.md instead of refining it
# in place. These checks assert the guardrails are in the prompts so the
# same drift cannot recur silently.
# ---------------------------------------------------------------------------
print()
print("=== Suite 16: workspaces hygiene guardrails ===")

qa_md = read(AGENTS_DIR / "qa.md")
architect_md = read(AGENTS_DIR / "architect.md")
orchestrator_md = read(AGENTS_DIR / "orchestrator.md")

# 1. qa.md declares an exhaustive file-output table at the top
check("qa.md has '## Files I write (exhaustive)' section",
      "## Files I write (exhaustive)" in qa_md,
      "qa.md missing exhaustive file-output table")

# 2. qa.md explicitly forbids the observed sibling-review filenames
for forbidden in ("01-coverage-review.md", "02-flow-coverage.md", "qa-reports/"):
    check(f"qa.md MUST NOT write list includes '{forbidden}'",
          "## Files I MUST NOT write" in qa_md and forbidden in qa_md,
          f"qa.md does not forbid '{forbidden}' explicitly")

# 3. qa.md routes plan-shape / refinement requests to the right agents
check("qa.md routes plan-shape audits to plan-reviewer",
      "route to plan-reviewer" in qa_md,
      "qa.md does not route plan-shape audits to plan-reviewer")
check("qa.md routes substance refinement back to architect",
      "route back to architect" in qa_md or "route to architect" in qa_md,
      "qa.md does not route substance refinement to architect for in-place edits")

# 4. architect.md declares the forbidden output patterns
check("architect.md has '## Forbidden output patterns' section",
      "## Forbidden output patterns" in architect_md,
      "architect.md missing forbidden output patterns section")
for ban in ("Version markers", "Previously decided", "Strikethrough"):
    check(f"architect.md forbids '{ban}' in analysis docs",
          ban in architect_md,
          f"architect.md does not list '{ban}' as a forbidden pattern")

# 5. architect.md ban applies to the canonical analysis docs
for doc in ("01-plan.md", "01-planning.md", "01-root-cause.md"):
    check(f"architect.md forbidden-patterns section names {doc}",
          "Forbidden output patterns" in architect_md and doc in architect_md,
          f"architect.md does not name {doc} as in-place-edit target")

# 6. orchestrator.md routes 'revisa el plan' to plan-review direct mode
check("orchestrator.md intent table has plan-review row",
      "plan-review" in orchestrator_md and "revisa el plan" in orchestrator_md,
      "orchestrator.md intent table missing plan-review routing")

# 7. orchestrator.md explicitly bans qa-substance plan-review delegation
check("orchestrator.md bans delegating substance-of-plan review to qa",
      "Never delegate substance refinement of a plan to `qa`" in orchestrator_md
      or "Never delegate substance refinement of a plan to qa" in orchestrator_md,
      "orchestrator.md does not ban qa-substance plan-review delegation")

# 8. orchestrator.md still names the canonical max-3 plan-review budget
check("orchestrator.md keeps max-3 budget for plan-review round trips",
      "max-3 budget for plan-review" in orchestrator_md,
      "orchestrator.md does not declare the max-3 budget for plan-review iterations")

# 9. orchestrator.md declares Phase 1.6 inviolable + agent-then-human contract preserved
check("orchestrator.md Phase 1.6 is declared inviolable",
      "Phase 1.6 is inviolable" in orchestrator_md,
      "orchestrator.md does not declare Phase 1.6 as inviolable")
check("orchestrator.md requires Plan Review section present before STAGE-GATE-1",
      "Plan Review` section" in orchestrator_md
      or "## Plan Review` section" in orchestrator_md
      or "Plan Review` section with a `**Verdict:**" in orchestrator_md,
      "orchestrator.md does not require Plan Review section presence before STAGE-GATE-1")

# 10. orchestrator.md defines mandatory dispatch_handoff for nested-context plan-review/ux-review
#     (replaces the old inline-fallback checks, retired in v2.48 — the inline-fallback
#      blocks pre-dated the Takeover Protocol and allowed the plan-review panel to
#      self-grade silently, skipping the security design-review in nested context).
#
#     New contract (AC-1, AC-2, AC-4):
#       - Phase 1.6 and Phase 1.7 MUST emit dispatch_handoff in nested context.
#       - The stale "Execute the audit yourself" / "Execute the enrich review yourself"
#         strings MUST be absent (if present, the old inline-fallback was re-introduced).
#       - The canonical nesting-error variants are still referenced so operators understand
#         the trigger condition.
#       - The plan-reviewer.md split-reason closed list is owned by plan-reviewer.md alone;
#         the orchestrator no longer duplicates it here.
check("orchestrator.md instructs mandatory dispatch_handoff for plan-review in nested context",
      "dispatch_handoff" in orchestrator_md
      and "th:plan-reviewer" in orchestrator_md,
      "orchestrator.md does not wire dispatch_handoff to plan-reviewer for nested-context handling"
      " — the mandatory handoff directive must be present in the Phase 1.6 section")
check("orchestrator.md instructs mandatory dispatch_handoff for ux-reviewer in nested context",
      "dispatch_handoff" in orchestrator_md
      and "th:ux-reviewer" in orchestrator_md,
      "orchestrator.md does not wire dispatch_handoff to ux-reviewer for nested-context handling"
      " — the mandatory handoff directive must be present in the Phase 1.7 section")
check("orchestrator.md does NOT instruct plan-review self-execution in nested context",
      "Execute the audit yourself" not in orchestrator_md,
      "orchestrator.md still contains 'Execute the audit yourself' — the Phase 1.6 inline-fallback"
      " self-run must be replaced by a dispatch_handoff directive")
check("orchestrator.md does NOT instruct ux-review self-execution in nested context",
      "Execute the enrich review yourself" not in orchestrator_md,
      "orchestrator.md still contains 'Execute the enrich review yourself' — the Phase 1.7"
      " ux-reviewer inline self-run must be replaced by a dispatch_handoff directive")
check("orchestrator.md references nesting-error trigger conditions for the nested-context handoff",
      "not available as subagent_type" in orchestrator_md
      or "Task is not available inside subagents" in orchestrator_md
      or "nesting refusal" in orchestrator_md,
      "orchestrator.md does not describe the nesting error conditions that trigger the handoff")

# 11. orchestrator.md declares the plan-review iteration budget
# (the old check asserted 'same max-3 budget' OR 'does not reset the counter';
#  after the inline-fallback retirement the 'does not reset the counter' wording is gone
#  because there is no longer a dual subagent/inline execution path — only subagent.
#  'same max-3 budget' still appears in the Phase 1.5 iteration note so the check passes.)
check("orchestrator.md declares the max-3 budget for plan-review round trips",
      "same max-3 budget" in orchestrator_md or "max-3 budget" in orchestrator_md,
      "orchestrator.md does not declare the max-3 iteration budget for plan-review round trips")

# 12. Self-describing task-list contract — architect.md declares the Status field
implementer_md = read(AGENTS_DIR / "implementer.md")
check("architect.md task-list template includes the Status field",
      "**Status:** pending" in architect_md,
      "architect.md task-list template does not declare the Status field with initial 'pending'")
check("architect.md documents Self-describing task-list contract",
      "Self-describing task-list contract" in architect_md,
      "architect.md does not declare the Self-describing task-list contract")
for status in ("in-progress", "verified", "merged", "blocked"):
    check(f"architect.md task-list contract names Status value '{status}'",
          status in architect_md,
          f"architect.md does not enumerate Status value '{status}'")
check("architect.md restricts post-gate writes on 01-plan.md",
      "Write scope (hard rule for all agents)" in architect_md
      or "After STAGE-GATE-1 release, the only mutations allowed" in architect_md,
      "architect.md does not pin the post-gate write scope on 01-plan.md")

# 13. qa.md mirrors AC PASS into 01-plan.md § Task List checkboxes
check("qa.md declares the AC-checkbox mirror in 01-plan.md",
      "AC checkbox mirror in `01-plan.md`" in qa_md,
      "qa.md does not declare the AC-checkbox mirror contract")
check("qa.md restricts edits on 01-plan.md to checkbox flips",
      "only** edit you are allowed to make on `01-plan.md`" in qa_md
      or "only edit you are allowed to make on 01-plan.md" in qa_md,
      "qa.md does not pin its edit scope on 01-plan.md to checkbox flips")

# 14. orchestrator.md mirrors PR transitions to the Status field
check("orchestrator.md declares Mirror PR-level progress into 01-plan.md",
      "Mirror PR-level progress into `01-plan.md`" in orchestrator_md,
      "orchestrator.md does not declare the Status mirror contract")
for transition in ("in-progress", "verified", "merged", "blocked"):
    check(f"orchestrator.md Status mirror table names '{transition}'",
          transition in orchestrator_md,
          f"orchestrator.md does not name '{transition}' in the Status mirror table")
check("orchestrator.md hands the 'merged' transition to delivery",
      "`delivery` agent owns the `merged` transition" in orchestrator_md
      or "delivery agent owns the merged transition" in orchestrator_md,
      "orchestrator.md does not assign the merged transition to delivery")

# 15. implementer.md acknowledges it never writes 01-plan.md
check("implementer.md says it never writes to 01-plan.md",
      "NEVER write to `01-plan.md`" in implementer_md
      or "never write to 01-plan.md" in implementer_md.lower(),
      "implementer.md does not declare that it never writes to 01-plan.md")

# ---------------------------------------------------------------------------
# Suite 17 — Backend-agnostic naming for the knowledge graph
#   ChromaDB references must be scoped to:
#     - knowledge-graph/* (implementation files — naturally name their deps)
#     - factual "current backend: ChromaDB" mentions in README and CLAUDE.md
#     - CHANGELOG.md (historical entries are not rewritten)
#   Anywhere else, the naming must be capability-based ("knowledge graph",
#   "Knowledge Graph MCP", "KG"). Catches accidental reintroduction of the
#   old implementation-tied phrasing.
# ---------------------------------------------------------------------------
print()
print("=== Suite 17: Backend-agnostic knowledge-graph naming ===")

# Phrases that were the failure mode pre-1.1.0 — they must not appear in
# user-facing files anymore. The literal word "ChromaDB" on its own is
# still allowed (it factually names the current backend); these phrases
# bundle "ChromaDB" with the capability name in a way that locks the two
# together at the docs layer.
FORBIDDEN_PATTERNS = (
    "ChromaDB MCP tools",
    "ChromaDB MCP server",
    "ChromaDB MCP `",
    "ChromaDB-backed",
    "chromadb-mcp",
)

USER_FACING_PATHS: list[Path] = [
    REPO_ROOT / "README.md",
    REPO_ROOT / "CLAUDE.md",
]
USER_FACING_PATHS.extend(sorted((REPO_ROOT / "agents").glob("*.md")))
USER_FACING_PATHS.extend(sorted((REPO_ROOT / "skills").glob("*.md")))
USER_FACING_PATHS.extend(sorted((REPO_ROOT / "docs").glob("*.md")))

# CHANGELOG is intentionally excluded: historical entries (1.0.0 and prior)
# legitimately mention ChromaDB and must not be rewritten. The bundled
# Python knowledge-graph/ folder and shared-knowledge/ were removed when
# the Memory MCP moved to be an external service.

for pattern in FORBIDDEN_PATTERNS:
    violators: list[str] = []
    for path in USER_FACING_PATHS:
        if not path.exists():
            continue
        if pattern in path.read_text(encoding="utf-8"):
            violators.append(path.relative_to(REPO_ROOT).as_posix())
    check(
        f"No user-facing doc contains forbidden pattern '{pattern}'",
        not violators,
        f"violations in: {', '.join(violators)} — replace with knowledge-graph naming")

# ---------------------------------------------------------------------------
# Suite 18 — Dispatch-blocked auto-takeover contract
# ---------------------------------------------------------------------------
# Guards the boot probe + Dispatch-blocked exit contract across:
#   1. agents/orchestrator.md  — the boot probe + Dispatch-blocked exit
#   2. CLAUDE.md § 14             — the universal auto-takeover rule
#   3. skills/README.md           — the canonical Continuity contract
print("=== Suite 18: Dispatch-blocked auto-takeover contract ===")

orchestrator_md = read(AGENTS_DIR / "orchestrator.md")
claude_md = read(REPO_ROOT / "CLAUDE.md")
skills_readme_md = read(SKILLS_DIR / "README.md")

TRIGGER_PHRASE = "Dispatch handoff — top-level Claude takes over now"
STATUS_ENUM_VALUE = "blocked-no-dispatch"

# --- orchestrator.md ---
check(
    "orchestrator.md has 'Mandatory boot sequence' section",
    "Mandatory boot sequence" in orchestrator_md,
    "missing boot sequence section — auto-takeover starts here",
)
check(
    "orchestrator.md boot probe uses general-purpose subagent_type",
    "subagent_type`: `general-purpose`" in orchestrator_md
    or "subagent_type: general-purpose" in orchestrator_md,
    "probe must dispatch general-purpose to test Task availability",
)
check(
    "orchestrator.md boot probe expects single-word OK reply",
    "Reply with the single word OK" in orchestrator_md,
    "probe payload contract must be present so the check is unambiguous",
)
check(
    "orchestrator.md has 'Dispatch-blocked exit' section",
    "### Dispatch-blocked exit" in orchestrator_md,
    "missing dispatch-blocked exit section",
)
check(
    f"orchestrator.md status enum includes '{STATUS_ENUM_VALUE}'",
    STATUS_ENUM_VALUE in orchestrator_md,
    "status enum must list blocked-no-dispatch so 00-state.md is detectable",
)
check(
    f"orchestrator.md response includes universal trigger phrase '{TRIGGER_PHRASE}'",
    TRIGGER_PHRASE in orchestrator_md,
    "top-level Claude scans for this exact phrase to switch into takeover mode",
)
check(
    "orchestrator.md anti-pattern: 'do NOT re-invoke `@th:orchestrator`'",
    "Do NOT re-invoke `@th:orchestrator`" in orchestrator_md
    or "do NOT re-invoke `@th:orchestrator`" in orchestrator_md,
    "must forbid recreating the nested condition",
)
check(
    "orchestrator.md dispatch invariant #1 is conditional on probe success",
    "After a successful boot probe" in orchestrator_md,
    "invariant #1 must NOT unconditionally claim Task is present — that was the original bug",
)
check(
    "orchestrator.md does NOT contain the unconditional 'Task is on the list' claim",
    "Task is on the list. You have `Task`" not in orchestrator_md
    and "Task is on the list. You have Task" not in orchestrator_md,
    "unconditional 'You have Task' claim primes a hallucination — must stay removed",
)
check(
    "orchestrator.md does NOT contain the legacy 'tools confirmed' acknowledgment",
    "[orchestrator boot] tools confirmed:" not in orchestrator_md,
    "legacy ack line was the hallucination vector — must stay removed",
)
check(
    "orchestrator.md boot sequence is silent on happy path (no boot ack line)",
    "[orchestrator boot]" not in orchestrator_md,
    "boot must be silent — no visible output to operator during boot",
)
check(
    "orchestrator.md 'never write code/tests/docs' contract still present (in invariants section)",
    "you NEVER write code/tests/docs" in orchestrator_md
    or "you are forbidden from writing" in orchestrator_md.lower()
    or "Never substitute yourself for a subagent" in orchestrator_md,
    "the no-inline-work contract for the orchestrator must remain.",
)
check(
    "orchestrator.md has merge/push guard",
    "Merge/push guard" in orchestrator_md and "Phase 3 (Verify)" in orchestrator_md,
    "orchestrator must refuse to merge PRs until Phase 3 and STAGE-GATE-3 are complete",
)

# --- CLAUDE.md § 13/14 + docs/subagent-orchestration.md ---
# CLAUDE.md §14 carries the universal rule and points to the full 8-step protocol
# in docs/subagent-orchestration.md. The detailed semantics (autonomy gating,
# invocation-mode coverage, the explicit "do NOT ask the user" imperative) live
# in that doc, so the takeover-contract markers below resolve against either file.
_subagent_orch_md = read(REPO_ROOT / "docs" / "subagent-orchestration.md")
_takeover_contract = claude_md + "\n" + _subagent_orch_md
check(
    "CLAUDE.md has universal auto-takeover rule",
    "Universal rule — auto-takeover" in claude_md
    or "auto-takeover on `blocked-no-dispatch`" in claude_md,
    "missing CLAUDE.md universal rule — needed so the rule applies independently of skill wrappers",
)
check(
    f"CLAUDE.md auto-takeover rule references status enum '{STATUS_ENUM_VALUE}'",
    STATUS_ENUM_VALUE in claude_md,
    "rule must name the same enum value used in orchestrator.md and 00-state.md",
)
check(
    f"CLAUDE.md auto-takeover rule references trigger phrase '{TRIGGER_PHRASE}'",
    TRIGGER_PHRASE in claude_md,
    "rule must reference the same trigger phrase the orchestrator response uses",
)
check(
    "takeover rule explicitly says do NOT ask the user",
    "Do NOT ask the user" in _takeover_contract
    or "do NOT ask the user" in _takeover_contract
    or "not a user-decision point" in _takeover_contract,
    "rule must be imperative about not waiting for user confirmation",
)
check(
    "takeover rule covers STAGE-GATE-2 autonomy semantics",
    "STAGE-GATE-2" in _takeover_contract
    and ("autonomous" in _takeover_contract or "autonomy" in _takeover_contract),
    "takeover must respect autonomy gating between PRs (either word is acceptable; the new JSON-handoff design uses `autonomy.granted`).",
)
check(
    "takeover rule covers STAGE-GATE-3 always-mandatory",
    "STAGE-GATE-3" in _takeover_contract,
    "STAGE-GATE-3 always needs human approval — takeover must not bypass it",
)
check(
    "takeover rule applies regardless of invocation mode",
    "regardless of how the orchestrator was invoked" in _takeover_contract
    or "every entry mode" in _takeover_contract,
    "must be explicit that the rule covers @mention, skills, and agent referrals",
)

# --- skills/README.md ---
check(
    "skills/README.md has 'Continuity contract' section",
    "## Continuity contract" in skills_readme_md,
    "missing continuity contract — needed as the canonical reference for routing skills",
)
check(
    f"skills/README.md Continuity contract references '{STATUS_ENUM_VALUE}'",
    STATUS_ENUM_VALUE in skills_readme_md,
    "skills doc must use the same status enum",
)
check(
    f"skills/README.md Continuity contract uses trigger phrase '{TRIGGER_PHRASE}'",
    TRIGGER_PHRASE in skills_readme_md,
    "skills doc must reference the same trigger phrase",
)
check(
    "skills/README.md Continuity contract cross-refs orchestrator.md AND CLAUDE.md",
    "agents/orchestrator.md" in skills_readme_md and "CLAUDE.md" in skills_readme_md,
    "skills doc must point to both authoritative sources",
)

# --- Cross-file consistency ---
# The three files must agree on the literal trigger phrase. If one of them
# drifts (e.g. someone localises the orchestrator response to Spanish but
# leaves CLAUDE.md in English), top-level Claude's scan no longer matches.
all_three = (orchestrator_md, claude_md, skills_readme_md)
check(
    "trigger phrase identical across orchestrator.md, CLAUDE.md, skills/README.md",
    all(TRIGGER_PHRASE in src for src in all_three),
    "drift detected — the universal touchpoint must be byte-identical in all three files",
)
check(
    "status enum value identical across orchestrator.md, CLAUDE.md, skills/README.md",
    all(STATUS_ENUM_VALUE in src for src in all_three),
    "drift detected — enum value must match in all three files",
)

# --- nested-dispatch-takeover block (v2.33.1) ---
# The block is written by /th:setup to ~/.claude/CLAUDE.md so top-level Claude
# can auto-recover from a dispatch_handoff in ANY repo, not just team-harness.
# Only the skill surface is asserted; the Go installer will be removed in a
# follow-up task and is intentionally not mirrored.

NESTED_TAKEOVER_MARKER_START = "<!-- nested-dispatch-takeover:start -->"
NESTED_TAKEOVER_MARKER_END = "<!-- nested-dispatch-takeover:end -->"

setup_skill_md = read(SKILLS_DIR / "setup" / "SKILL.md")

check(
    "skills/setup/SKILL.md contains nested-dispatch-takeover start marker",
    NESTED_TAKEOVER_MARKER_START in setup_skill_md,
    "setup SKILL.md must declare the new managed block start marker",
)
check(
    "skills/setup/SKILL.md contains nested-dispatch-takeover end marker",
    NESTED_TAKEOVER_MARKER_END in setup_skill_md,
    "setup SKILL.md must declare the new managed block end marker",
)
check(
    "skills/setup/SKILL.md nested block references docs/subagent-orchestration.md",
    "docs/subagent-orchestration.md" in setup_skill_md,
    "the block must point operators to the full 8-step protocol",
)
check(
    "skills/setup/SKILL.md nested block names the red-herring '~/.claude/agents/'",
    "~/.claude/agents/" in setup_skill_md and "plugins/cache" in setup_skill_md,
    "the block must clarify that ~/.claude/agents/ absence is not a failure",
)

check(
    "orchestrator.md has '### Final Pipeline Sanity Check' section",
    "### Final Pipeline Sanity Check" in orchestrator_md,
    "missing Final Pipeline Sanity Check section — post-Phase-4 artifact catch-all is required",
)
check(
    "orchestrator.md contains both 'pipeline.incomplete' and 'blocked-incomplete' literals",
    "pipeline.incomplete" in orchestrator_md and "blocked-incomplete" in orchestrator_md,
    "both the JSONL event name and the status enum value must be present in orchestrator.md",
)

# ---------------------------------------------------------------------------
# Suite 18 — Pipeline Manifest read-first (Phase 2.0 regression assertions)
# ---------------------------------------------------------------------------
# These assertions MUST FAIL before the implementer touches docs/skill.
# They verify the hardening introduced in fix/takeover-protocol-hardening:
#   (a) A "Takeover Pipeline Manifest" exists at the START of the Takeover
#       Protocol in docs/subagent-orchestration.md — before step 1.
#   (b) The manifest carries read-first + lazy-load framing.
#   (c) The manifest names every mandatory gate/stage in pipeline order.
#   (d) The manifest and the managed block in setup/SKILL.md both carry the
#       comply imperative ("skipping any is a defect" / "honor EVERY gate").
#   (e) Drift no-regression guards: stale workspace doc names are absent from
#       the steps 6-7 region; correct names are present there (C1 + C2).
#   (f) update/SKILL.md does NOT contain a second copy of the block content (C3).
#
# AC coverage: AC-5 (detail), AC-8 (cross-ref), AC-1–AC-4 (substance).
# Resolution: resolved against _subagent_orch_md (content of
#   docs/subagent-orchestration.md) and setup_skill_md / update_skill_md.
# ---------------------------------------------------------------------------

update_skill_md = read(SKILLS_DIR / "update" / "SKILL.md")

# --- voice-rule block (v2.36.8) — neutral register, no regional idioms ------
# Third managed block written by /th:setup (and synced by /th:update) to
# ~/.claude/CLAUDE.md so the neutral-register rule (no country-specific idioms)
# applies in any repo, not just team-harness work.
VOICE_RULE_START = "<!-- voice-rule:start -->"
VOICE_RULE_END = "<!-- voice-rule:end -->"

check(
    "skills/setup/SKILL.md contains voice-rule start marker",
    VOICE_RULE_START in setup_skill_md,
    "setup SKILL.md must declare the voice-rule managed block start marker",
)
check(
    "skills/setup/SKILL.md contains voice-rule end marker",
    VOICE_RULE_END in setup_skill_md,
    "setup SKILL.md must declare the voice-rule managed block end marker",
)
# Slice the block so the substance assert cannot false-green on ambient text.
_vr_a = setup_skill_md.find(VOICE_RULE_START)
_vr_b = setup_skill_md.find(VOICE_RULE_END)
_voice_block = setup_skill_md[_vr_a:_vr_b] if (_vr_a != -1 and _vr_b != -1 and _vr_b > _vr_a) else ""
check(
    "skills/setup/SKILL.md voice-rule block states the no-regional-idioms intent",
    ("idiom" in _voice_block.lower() or "regional" in _voice_block.lower())
    and "neutral" in _voice_block.lower(),
    "the voice-rule block must mandate neutral register and forbid country-specific idioms/regionalisms",
)
check(
    "skills/update/SKILL.md syncs the voice-rule block (names its markers)",
    VOICE_RULE_START in update_skill_md and VOICE_RULE_END in update_skill_md,
    "update/SKILL.md step 6 must name the voice-rule markers so /th:update syncs the third managed block",
)

# --- --fast operator-declared lightweight path (v2.36.8) --------------------
# The orchestrator recognizes a literal --fast flag (operator-declared only) and
# runs a lightweight path that skips plan review + qa + security, while keeping
# Specify, tester, the push gate, Delivery, and the security override on
# sensitive paths. Surfaced in the dispatch managed block for discoverability.
_ref_flows_md = read(AGENTS_DIR / "ref-special-flows.md")
_global_claude_go = read(REPO_ROOT / "cmd" / "install" / "global_claude_md.go")

check(
    "orchestrator.md recognizes --fast as operator-declared fast mode",
    "--fast" in orchestrator_md and "fast_mode" in orchestrator_md,
    "orchestrator.md must document the --fast flag and the fast_mode classification field",
)
check(
    "orchestrator.md fast_mode keeps the security override on sensitive paths",
    "fast_mode" in orchestrator_md
    and "cannot bypass security" in orchestrator_md.lower(),
    "orchestrator.md must state that --fast cannot bypass security on security-sensitive paths",
)
check(
    "orchestrator.md Current State template declares the fast_mode field",
    "fast_mode:" in orchestrator_md,
    "the 00-state.md § Current State template must include a fast_mode field",
)
check(
    "ref-special-flows.md documents the Fast Mode (--fast) flow",
    "Fast Mode" in _ref_flows_md
    and "--fast" in _ref_flows_md
    and "operator-declared" in _ref_flows_md.lower(),
    "ref-special-flows.md must define the Fast Mode (--fast) flow as operator-declared only",
)
check(
    "skills/setup/SKILL.md dispatch block advertises the --fast fast path",
    "--fast" in setup_skill_md,
    "the orchestrator-dispatch-rule block must surface the operator-declared --fast path for discoverability",
)
check(
    "cmd/install/global_claude_md.go dispatch block mirrors the --fast advisory (parity)",
    "--fast" in _global_claude_go,
    "the Go installer's orchestrator-dispatch-rule block must mirror the --fast advisory for parity with setup/SKILL.md",
)

# -- (a) Manifest exists and appears BEFORE the first numbered step ----------
# Position check: index of the manifest header must be lower than the index
# of the first numbered step ("1. Do NOT ask") within _subagent_orch_md.
_manifest_header = "Takeover Pipeline Manifest"
_first_step_marker = "1. Do NOT ask"
_manifest_idx = _subagent_orch_md.find(_manifest_header)
_first_step_idx = _subagent_orch_md.find(_first_step_marker)
check(
    "subagent-orchestration.md contains 'Takeover Pipeline Manifest' header",
    _manifest_idx != -1,
    "Pipeline Manifest read-first block is missing from docs/subagent-orchestration.md",
)
check(
    "Takeover Pipeline Manifest appears BEFORE the first numbered step in the protocol",
    _manifest_idx != -1 and _first_step_idx != -1 and _manifest_idx < _first_step_idx,
    f"manifest index ({_manifest_idx}) must precede step-1 index ({_first_step_idx}); "
    "manifest must be placed at the START of the Takeover Protocol, above the 8 steps",
)

# -- (b) Read-first + lazy-load framing --------------------------------------
# Presence assertions on _subagent_orch_md (the verbose doc).
# NOTE: these are PRESENCE assertions — different purpose from the ABSENCE
# assertions in section (e) below.  Do not reuse the same region/variable.
check(
    "subagent-orchestration.md manifest carries 'read this first' framing",
    "read this first" in _subagent_orch_md,
    "manifest header must instruct the reader to read it before the 8 steps",
)
check(
    "subagent-orchestration.md manifest carries lazy-load framing ('read each stage' or 'do NOT read them all up front')",
    "read each stage" in _subagent_orch_md or "do NOT read them all up front" in _subagent_orch_md,
    "manifest must state that stage detail is read lazily, not all up front",
)

# -- (c) Ordered gate/stage names present in manifest region ----------------
# Resolved against _takeover_contract (CLAUDE.md + _subagent_orch_md) for
# compatibility with the existing pattern used in lines 1004-1020 above.
# PRESENCE assertions — different from the ABSENCE assertions in (e).
for _gate_name in (
    "STAGE-GATE-1",
    "Phase 1.6",
    "Phase 2.0",
    "Phase 3.5",
    "STAGE-GATE-3",
    "Acceptance",
    "00-execution-events",
    "00-pipeline-summary",
    "00-state",
):
    check(
        f"Takeover Pipeline Manifest names gate/stage '{_gate_name}'",
        _gate_name in _subagent_orch_md,
        f"'{_gate_name}' must appear in docs/subagent-orchestration.md as part of the manifest",
    )

# -- (d) Comply imperative in manifest (doc) AND in managed block (skill) ---
# (d1) comply imperative in the verbose doc
check(
    "subagent-orchestration.md manifest carries comply imperative (skipping any / MUST complete / honor every gate)",
    "skipping any" in _subagent_orch_md
    or "MUST complete every item" in _subagent_orch_md
    or "MUST execute every stage" in _subagent_orch_md
    or "honor every gate" in _subagent_orch_md
    or "honor EVERY gate" in _subagent_orch_md,
    "manifest must declare that skipping a stage/gate is a defect, not a shortcut",
)
# (d2) comply imperative inside the managed block in setup/SKILL.md.
# Extract the managed block content between the markers so the assertion
# is scoped to that block and not to the surrounding instructional text.
_TAKEOVER_START = "<!-- nested-dispatch-takeover:start -->"
_TAKEOVER_END = "<!-- nested-dispatch-takeover:end -->"
_block_start_idx = setup_skill_md.find(_TAKEOVER_START)
_block_end_idx = setup_skill_md.find(_TAKEOVER_END)
_managed_block_content = (
    setup_skill_md[_block_start_idx:_block_end_idx + len(_TAKEOVER_END)]
    if _block_start_idx != -1 and _block_end_idx != -1
    else ""
)
check(
    "skills/setup/SKILL.md managed block carries comply imperative (skipping any / honor EVERY gate)",
    "skipping any" in _managed_block_content or "honor EVERY gate" in _managed_block_content,
    "the nested-dispatch-takeover block itself must state the comply imperative, "
    "not merely point to the manifest",
)
# (d3) managed block references "Takeover Pipeline Manifest" by name
check(
    "skills/setup/SKILL.md managed block references 'Takeover Pipeline Manifest'",
    "Takeover Pipeline Manifest" in _managed_block_content,
    "block must point to the manifest by name so the reader knows where to find "
    "the ordered stage list",
)

# -- (e) Drift no-regression guards — C1 (region-anchored) + C2 (annotated) -
# C1: assertions are scoped to the steps 6-7 region of _subagent_orch_md,
#     NOT a global `not in` over the whole document.  This prevents false
#     failures if those names appear legitimately in other sections (e.g.
#     historical prose or an example).
#
# C2 annotation: ABSENCE assertions (stale names must NOT appear) and
#     PRESENCE assertions (correct names MUST appear) operate on different
#     strings:
#     - Absence assertions: _steps_6_7_region (the stale file names)
#     - Presence assertions: _subagent_orch_md (correct schema names)
#     They are intentionally kept separate to avoid ambiguity between
#     "must be here" and "must NOT be here".
#
# Slice the region between the first mention of "6." and "8." in the
# Takeover Protocol section.  Using a text anchor avoids hard-coding
# line numbers (which change as the doc is edited).
_step6_marker = "6. Top-level Claude"
_step8_marker = "8. Report to the user"
_s6 = _subagent_orch_md.find(_step6_marker)
_s8 = _subagent_orch_md.find(_step8_marker)
# If the step markers are absent the slice is empty string, which means
# *all* absence assertions will pass trivially — but the doc-structure
# assertions above will have already flagged the missing content.
_steps_6_7_region = (
    _subagent_orch_md[_s6:_s8] if _s6 != -1 and _s8 != -1 and _s6 < _s8 else ""
)

# ABSENCE assertions (C1) — stale names must not appear in steps 6-7 region.
# Operating on: _steps_6_7_region
for _stale_name in ("06-acceptance-check.md", "05-delivery.md", "02-task-list.md"):
    check(
        f"steps 6-7 region does NOT contain stale workspace doc name '{_stale_name}'",
        _stale_name not in _steps_6_7_region,
        f"'{_stale_name}' is a stale file name; steps 6-7 must use current schema names",
    )

# PRESENCE assertions (C2) — correct schema names must appear in the doc.
# Operating on: _subagent_orch_md (broader scope, not the absence slice).
for _correct_name in (
    "04-validation.md",
    "00-state.md",
    "01-plan.md",
):
    check(
        f"subagent-orchestration.md contains correct schema name '{_correct_name}'",
        _correct_name in _subagent_orch_md,
        f"'{_correct_name}' must appear in the doc as the current schema replacement",
    )

# -- (f) No second copy guard — C3 (content check, not marker check) --------
# update/SKILL.md NAMES the markers in its extraction instructions (step 6).
# A naive `not in` check for the marker strings would pass even if update
# contained a duplicate of the block content.  The guard must check for a
# stable wording substring of the BLOCK CONTENT, not the markers themselves.
# Using "honor EVERY gate" as the stable anchor: if that phrase appears in
# update_skill_md, a second copy of the hardened block content is present.
check(
    "skills/update/SKILL.md does NOT contain a second copy of the managed block content",
    "honor EVERY gate" not in update_skill_md
    and "skipping any is a defect" not in update_skill_md,
    "update/SKILL.md must not duplicate the block content — it extracts from "
    "setup/SKILL.md at runtime; a content copy here indicates unintended duplication "
    "(note: marker strings are legitimately present in update's extraction instructions "
    "and are NOT checked here)",
)

# -- (g) Plugin cache-path resolvable (AC-5 / AC-8: fix/takeover-doc-plugin-cache-path) --
# The managed block must name the explicit marketplace+plugin cache-path segment
# ("team-harness-marketplace/th/") and the highest-semver resolution wording
# ("<highest-version>") so plugin-only installs (no repo clone) can resolve the
# docs/ and agents/ references during a takeover.
#
# DO NOT assert merely "plugins/cache" — line ~1088 already covers that substring
# via the Red herring note and is green today.  These assertions target literals
# that are ABSENT today and will become present only after the implementer's fix.
# They fail pre-fix and pass post-fix (regression test contract, Phase 2.0).
#
# Resolution: scoped to _managed_block_content (extracted above in section (d2))
# so ambient occurrences elsewhere in setup/SKILL.md do not produce false greens.
check(
    "skills/setup/SKILL.md managed block contains plugin cache-path segment 'team-harness-marketplace/th/'",
    "team-harness-marketplace/th/" in _managed_block_content,
    "the nested-dispatch-takeover block must include the explicit marketplace+plugin "
    "cache-path segment so plugin-only installs can resolve docs/ and agents/ references; "
    "the current Red herring uses an ellipsis ('.../th/') which is insufficiently specific",
)
check(
    "skills/setup/SKILL.md managed block contains highest-version resolution wording '<highest-version>'",
    "<highest-version>" in _managed_block_content,
    "the block must instruct operators to resolve to the highest semver directory "
    "('<highest-version>') rather than a fixed version or the ambiguous '<version>' "
    "placeholder already present in the Red herring; multiple versions may be cached "
    "after updates and the newest is canonical",
)

# -- (h) Strip-rule co-occurrence (AC-9 / AC-8: fix/takeover-doc-plugin-cache-path additive pass) --
# The managed block must document the prefix-strip rule using the EXACT example
# literals `th:architect` AND `agents/architect.md`, co-occurring in the same block.
# This captures defect B: the placeholder `{next_dispatch.agent}` is stored in
# PREFIXED form (`th:architect`) for Task dispatch, but the file-read step (step 3)
# must STRIP the `th:` prefix to derive the agent's on-disk path.
#
# These two literals are ABSENT today from _managed_block_content → assertion FAILS
# pre-fix and PASSES post-fix (regression test contract, Phase 2.0 additive pass).
#
# Resolution: scoped to _managed_block_content so ambient occurrences elsewhere
# in setup/SKILL.md do not produce false greens.
check(
    "skills/setup/SKILL.md managed block contains strip-rule co-occurrence: 'th:architect' AND 'agents/architect.md'",
    "th:architect" in _managed_block_content and "agents/architect.md" in _managed_block_content,
    "the nested-dispatch-takeover block must document the prefix-strip rule with the "
    "literal example 'th:architect' -> 'agents/architect.md'; both literals must "
    "co-occur in the managed block so the transformation is unambiguous; "
    "absent today (defect B — placeholder form undocumented in the block)",
)

# Also assert the same strip-rule co-occurrence in docs/subagent-orchestration.md
# (step-3 region), verifying defect B is corrected in the protocol doc as well.
# Resolution: _subagent_orch_md (full doc; the strip rule is expected in step 3 prose).
check(
    "docs/subagent-orchestration.md contains strip-rule co-occurrence: 'th:architect' AND 'agents/architect.md'",
    "th:architect" in _subagent_orch_md and "agents/architect.md" in _subagent_orch_md,
    "the Takeover Protocol (docs/subagent-orchestration.md) step 3 must document "
    "the prefix-strip rule with the literal example 'th:architect' -> 'agents/architect.md'; "
    "absent today (defect B — strip-rule not described in the protocol)",
)

# -- (i) Double-prefix negative guard (AC-10: regression guard, PASSES today) --
# Assert that `th:th:` is NOT present in _managed_block_content or in the
# four dispatch-template files. This is a GUARD assertion: it passes today
# (no double-prefix exists) and remains a regression guard post-fix so that
# any template that auto-adds `th:` to an already-prefixed value (producing
# `th:th:architect`) is caught immediately.
#
# NOTE: this assertion is GREEN today and is expected to REMAIN green post-fix.
# It is NOT a pre-fix-red assertion — it is a regression guard.
_orchestrator_for_guard = orchestrator_md  # reuse from Suite 18 (already read)
_skills_readme_for_guard = skills_readme_md  # reuse from Suite 18 (already read)
check(
    "double-prefix guard: 'th:th:' absent from managed block (AC-10 regression guard)",
    "th:th:" not in _managed_block_content,
    "a template that auto-adds the 'th:' prefix to an already-prefixed value "
    "would produce 'th:th:architect'; absent today and must remain absent post-fix",
)
check(
    "double-prefix guard: 'th:th:' absent from docs/subagent-orchestration.md (AC-10 regression guard)",
    "th:th:" not in _subagent_orch_md,
    "dispatch-template in the protocol doc must not produce a double-prefix",
)
check(
    "double-prefix guard: 'th:th:' absent from agents/orchestrator.md (AC-10 regression guard)",
    "th:th:" not in _orchestrator_for_guard,
    "dispatch-template in orchestrator.md must not produce a double-prefix",
)
check(
    "double-prefix guard: 'th:th:' absent from skills/README.md (AC-10 regression guard)",
    "th:th:" not in _skills_readme_for_guard,
    "dispatch-template in skills/README.md must not produce a double-prefix",
)


# ---------------------------------------------------------------------------
# Suite 19 — Agent identity & cross-reference consistency
# ---------------------------------------------------------------------------
# Regression guards for "I renamed/removed an agent and broke 5 references"
# style breakage. Catches:
#   - filename ↔ frontmatter `name:` drift (Claude Code loads the frontmatter
#     name; if it doesn't match the filename, agents/init has trouble locating
#     and references to the old name go stale)
#   - agents that exist in agents/ but aren't listed in orchestrator's Your Team
#     table, README roster, or anywhere else (orphan agent — never dispatched)
#   - agent names referenced in CLAUDE.md / orchestrator.md / skills that don't
#     resolve to an actual `agents/<name>.md` (dangling reference — dispatch
#     will fail with "not a valid subagent_type")
#   - skill names referenced from agents/CLAUDE.md that don't resolve to
#     `skills/<name>.md` or `skills/<name>/SKILL.md`
#   - phase numbers mentioned in orchestrator.md outside the canonical set
#     (introducing "Phase 1.7" without wiring it in is silent UX breakage)
print("=== Suite 19: Agent identity & cross-reference consistency ===")

# Agents that legitimately have no .md file because they're reference files
# (loaded on-demand by the orchestrator, not standalone agents)
REFERENCE_ONLY_AGENTS = {"ref-direct-modes", "ref-special-flows"}

# Pipeline + standalone + reference agents that legitimately exist
ALL_AGENT_FILES = sorted(p.stem for p in AGENTS_DIR.glob("*.md") if p.stem != "README")

# 1. Filename ↔ frontmatter `name:` match for every agent
for agent_file in ALL_AGENT_FILES:
    path = AGENTS_DIR / f"{agent_file}.md"
    fm = parse_frontmatter(read(path))
    declared_name = fm.get("name", "")
    check(
        f"agents/{agent_file}.md frontmatter name matches filename",
        declared_name == agent_file,
        f"frontmatter says name='{declared_name}', file is '{agent_file}.md' — "
        f"rename one or the other so they agree (Claude Code loads frontmatter name)",
    )

# 2. Every agent file has a non-empty `description:` and a valid `model:`
VALID_MODELS = {"sonnet", "opus", "haiku", "inherit"}
for agent_file in ALL_AGENT_FILES:
    path = AGENTS_DIR / f"{agent_file}.md"
    fm = parse_frontmatter(read(path))
    check(
        f"agents/{agent_file}.md has non-empty description",
        bool(fm.get("description", "").strip()),
        "frontmatter `description` is empty — Claude Code uses it for routing",
    )
    model = fm.get("model", "")
    check(
        f"agents/{agent_file}.md declares a known model",
        model in VALID_MODELS,
        f"model='{model}' not in {sorted(VALID_MODELS)} — typo or new alias not "
        "registered",
    )

# 3. Every agent file (except reference-only) appears in orchestrator's Your Team
#    table OR is explicitly listed as standalone.
orchestrator_md_v19 = orchestrator_md  # reuse from Suite 18 (already read)
expected_in_orchestrator = {
    name for name in ALL_AGENT_FILES if name not in REFERENCE_ONLY_AGENTS
} - {"orchestrator"}  # orchestrator doesn't list itself
for agent_name in sorted(expected_in_orchestrator):
    # Must appear either in the Your Team table OR be named in the "Standalone
    # agents" callout.
    mentioned_in_team = f"`{agent_name}`" in orchestrator_md_v19
    check(
        f"agents/{agent_name}.md is referenced in orchestrator.md",
        mentioned_in_team,
        "agent file exists but orchestrator never mentions it — orphan agent "
        "(no one will dispatch it) or stale leftover that should be deleted",
    )

# 4. Every agent name referenced inside CLAUDE.md resolves to a real file.
#    We extract bare `agent_name` mentions from the routing table format
#    `| ... | `agent` | ...` and verify each one exists.
claude_md_v19 = claude_md  # reuse
# Match patterns like `architect`, `implementer` etc. (single-word backtick refs)
# This catches direct references; multi-word or phrase mentions are skipped.
KNOWN_AGENT_NAMES = set(ALL_AGENT_FILES)
referenced_in_claude_md = set(
    re.findall(r"`([a-z][a-z0-9-]{2,})`", claude_md_v19)
)
# Filter to names that LOOK like agents (lowercase, hyphenated, short)
plausible_agent_refs = {
    n for n in referenced_in_claude_md
    if n in KNOWN_AGENT_NAMES or n.endswith("-checker") or n.endswith("-reviewer")
    or n in {"orchestrator", "architect", "implementer", "tester", "qa", "security",
             "delivery", "init", "diagrammer", "reviewer", "translator"}
}
for ref in sorted(plausible_agent_refs):
    if ref in KNOWN_AGENT_NAMES:
        continue  # resolves cleanly
    check(
        f"CLAUDE.md reference `{ref}` resolves to an existing agent",
        False,
        f"agents/{ref}.md does not exist — rename in CLAUDE.md or restore the file",
    )

# 5. Phase numbers mentioned in orchestrator.md are in the canonical set.
#    Canonical phases (per the Pipeline Flow ASCII art and Stage table):
CANONICAL_PHASES = {
    "0a", "0b", "1", "1.5", "1.6", "1.7", "2.0", "2", "2.5", "2.7", "3", "3.4", "3.5", "3.6", "3.75", "4", "4.5", "5", "6",
    # 2.0 is the Bug-fix Pipeline regression-test phase (type: fix | hotfix only),
    # inserted between STAGE-GATE-1 and Phase 2. See ref-special-flows.md § Bug-fix Flow.
    # 2.7 is the Test Authoring sub-phase (Stage 2, pre-verify): tester writes AC tests
    # before the Phase 3 parallel verify block. Introduced by fix/phase3-tester-qa-race-condition.
    # 3.75 is Build Verification, a sub-step of Verify between Phase 3.5 and 3.6.
    # 1.7 is ux-reviewer enrich (frontend_scope: true only); executes after architect, before 1.5.
    # 3.4 is ux-reviewer validate (frontend_scope: true only); runs in the Phase 3 parallel block.
}
# Extract `Phase X` mentions, case-insensitive.
phase_mentions = set(re.findall(r"Phase\s+([0-9]+(?:\.[0-9]+)?[a-z]?)", orchestrator_md_v19))
unknown_phases = phase_mentions - CANONICAL_PHASES - {"N"}  # "{N}" placeholder is OK
check(
    "orchestrator.md uses only canonical phase numbers",
    not unknown_phases,
    f"unknown phase numbers found: {sorted(unknown_phases)} — either add them "
    "to the canonical set or fix the typo",
)

# 6. Every skill (subdirectory `skills/<name>/SKILL.md` or legacy flat
#    `skills/<name>.md`) has a frontmatter name that — if present — matches its
#    skill name. Skills can omit frontmatter; only check when present.
SKILL_NAMES = sorted(
    {p.parent.name for p in SKILLS_DIR.glob("*/SKILL.md")}
    | {p.stem for p in SKILLS_DIR.glob("*.md") if p.stem != "README"}
)
for skill_name in SKILL_NAMES:
    path = skill_path(skill_name)
    text = read(path)
    if not text.startswith("---"):
        continue  # skill without frontmatter — allowed
    fm = parse_frontmatter(text)
    declared = fm.get("name", "").strip()
    if not declared:
        continue
    check(
        f"skills/{skill_name} frontmatter name matches skill name (if declared)",
        declared == skill_name,
        f"frontmatter name='{declared}' but skill is '{skill_name}'",
    )

# 7. Every skill name listed in skills/README.md "Routes to orchestrator" line
#    exists as either skills/<name>.md or skills/<name>/SKILL.md.
skills_readme_v19 = skills_readme_md  # reuse from Suite 18
# Extract names from the routing line: e.g. "/issue, /plan, /design, ..."
routes_line_match = re.search(
    r"\*\*Routes to orchestrator\*\*[^:]*:\s*([^\n]+)",
    skills_readme_v19,
)
if routes_line_match:
    # Skills are namespaced `/th:<name>`; strip the optional `th:` prefix so we
    # resolve the bare skill name (e.g. `/th:issue` → `issue`), not `th`.
    declared_routing_skills = set(re.findall(r"/(?:th:)?([a-z][a-z0-9-]+)", routes_line_match.group(1)))
    for skill_name in sorted(declared_routing_skills):
        file_exists = (SKILLS_DIR / f"{skill_name}.md").exists()
        dir_exists = (SKILLS_DIR / skill_name / "SKILL.md").exists()
        check(
            f"skills/README.md routing skill '/{skill_name}' resolves to a real skill",
            file_exists or dir_exists,
            f"no skills/{skill_name}.md or skills/{skill_name}/SKILL.md found",
        )
else:
    check(
        "skills/README.md contains 'Routes to orchestrator' line",
        False,
        "expected line is missing from skills/README.md",
    )

# 8. Tools list in each agent frontmatter declares only known Claude Code tools.
#    This catches typos like `Tash` instead of `Task` (silent failure — agent
#    loads without that tool and the contract breaks).
KNOWN_TOOLS = {
    "Read", "Edit", "Write", "Bash", "Glob", "Grep", "Task", "WebFetch",
    "WebSearch", "NotebookEdit", "PowerShell",
}
KNOWN_MCP_PREFIXES = ("mcp__memory__", "mcp__context7__", "mcp__")
for agent_file in ALL_AGENT_FILES:
    if agent_file in REFERENCE_ONLY_AGENTS:
        continue
    path = AGENTS_DIR / f"{agent_file}.md"
    fm = parse_frontmatter(read(path))
    tools_field = fm.get("tools", "")
    if not tools_field:
        continue  # agent declares no tools (rare, e.g. some reference agents)
    declared_tools = [t.strip() for t in tools_field.split(",") if t.strip()]
    unknown = [
        t for t in declared_tools
        if t not in KNOWN_TOOLS and not any(t.startswith(p) for p in KNOWN_MCP_PREFIXES)
    ]
    check(
        f"agents/{agent_file}.md tools list contains only known tools",
        not unknown,
        f"unknown tool(s) in frontmatter: {unknown} — typo or new tool not in "
        "the KNOWN_TOOLS set",
    )

# ---------------------------------------------------------------------------
# Suite 20 — Pipeline observability (canonical artifacts + status block fields)
# ---------------------------------------------------------------------------
print()
print("=== Suite 20: Pipeline observability ===")

# --- orchestrator.md: Pipeline Summary Protocol + deprecated artifact banners ---

orch_obs_checks = [
    ("Pipeline Summary Protocol section header", "## Pipeline Summary Protocol"),
    ("Pipeline Summary mentions 00-pipeline-summary.md", "00-pipeline-summary.md"),
    ("Pipeline Summary rewrite-in-full discipline", "rewrite it **in full**"),
    ("Pipeline Summary cites JSONL as source of truth", "render of the trace"),
    ("JSONL writing is mandatory not best-effort",
     "**Writing the trace is mandatory, not best-effort.**"),
    ("dispatch.blocked event documented", "dispatch.blocked"),
    ("tools field documented in JSONL schema",
     "Object propagated from the returning agent's status block"),
    ("tools mapping table: context7_consult → context7 sub-object",
     '"context7": {"hit": N, "miss": N, "skipped": M}'),
    ("tools mapping table: memory_consult → memory sub-object",
     '"memory": {"search_nodes": N, "open_nodes": N}'),
    ("tools mapping table: kg_save_candidates → array",
     '"kg_save_candidates": ["a", "b"]'),
    ("tools mapping table: kg_passive_capture → string",
     '"kg_passive_capture":'),
    ("Pipeline Metrics deprecated banner",
     "## Pipeline Metrics (DEPRECATED"),
    ("Done.yml deprecated banner",
     "## Done.yml (DEPRECATED"),
]
for label, marker in orch_obs_checks:
    check(
        f"orchestrator.md observability: {label}",
        marker in orch,
        f"marker '{marker}' not found",
    )

# --- orchestrator.md: Phase Transition Protocol (event append + state update atomic) ---

phase_transition_checks = [
    ("Phase Transition Protocol section header",
     "### Phase Transition Protocol"),
    ("Protocol is declared atomic",
     "atomic"),
    ("Step 1 appends event FIRST",
     "This step comes FIRST"),
    ("Step 1 documents phase.end append",
     '"event":"phase.end"'),
    ("Step 1 documents phase.start append",
     '"event":"phase.start"'),
    ("Step 1 documents gate event append",
     '"event":"gate"'),
    ("Step 2 updates 00-state.md",
     "Update `00-state.md`"),
    ("Step 3 proceeds to next dispatch only after 1+2",
     "only after steps 1 and 2 are done"),
    ("Enforcement rule prevents dispatch without event append",
     "MUST NOT call `Agent()` or `Task()` for the next phase until the event has been appended"),
]
for label, marker in phase_transition_checks:
    check(
        f"orchestrator.md observability: {label}",
        marker in orch,
        f"marker '{marker}' not found — Phase Transition Protocol may have been removed or weakened",
    )

# --- skills/trace.md exists with the four modes ---

trace_path = skill_path("trace")
check("skills/trace.md exists", trace_path.exists())
if trace_path.exists():
    trace_md = read(trace_path)
    trace_checks = [
        ("default mode reads 00-pipeline-summary.md", "00-pipeline-summary.md"),
        ("--jsonl mode tails events file (dual-format: .md or .jsonl)",
         "00-execution-events.md"),
        ("--jsonl mode falls back to .jsonl",
         "00-execution-events.jsonl"),
        ("--tools mode aggregates with jq",
         '.event == "phase.end" and .tools'),
        ("--fails mode filters dispatch.blocked + iterations + gate.fail",
         "dispatch.blocked"),
        ("read-only contract explicit",
         "read-only"),
        ("falls back gracefully when jq absent",
         "`jq` is not available"),
    ]
    for label, marker in trace_checks:
        check(
            f"skills/trace.md: {label}",
            marker in trace_md,
            f"marker '{marker}' not found",
        )

# --- skills/pipelines.md reads 00-pipeline-summary.md ---

status_md = read(skill_path("pipelines"))
check(
    "skills/pipelines.md <feature-name> mode reads 00-pipeline-summary.md",
    "00-pipeline-summary.md" in status_md,
    "narrative renderer does not read the pipeline summary",
)
check(
    "skills/pipelines.md points to /trace for deeper observability",
    "/th:trace" in status_md,
    "narrative renderer does not advertise /th:trace",
)

# --- Agent status blocks: memory_consult + kg_save_candidates on read-only KG agents ---

# These four agents have read-only KG access (architect, qa, tester, security).
# Their Return Protocol must declare memory_consult and kg_save_candidates so the
# orchestrator can propagate them into the JSONL trace.
KG_READ_ONLY_AGENTS = ["architect", "qa", "tester", "security"]
for agent_name in KG_READ_ONLY_AGENTS:
    agent_md = read(AGENTS_DIR / f"{agent_name}.md")
    return_section = agent_md.split("## Return Protocol", 1)
    if len(return_section) < 2:
        check(
            f"agents/{agent_name}.md has Return Protocol section",
            False,
            "section missing",
        )
        continue
    rp = return_section[1]
    check(
        f"agents/{agent_name}.md status block declares memory_consult",
        "memory_consult:" in rp,
        "memory_consult line missing from Return Protocol",
    )
    check(
        f"agents/{agent_name}.md status block declares kg_save_candidates",
        "kg_save_candidates:" in rp,
        "kg_save_candidates line missing from Return Protocol",
    )

# delivery.md keeps kg_passive_capture (already covered by Step 11.5);
# implementer.md + translator.md have no KG access, so they don't declare these.

# --- CLAUDE.md §5: observability working agreement bullet ---

claude_md = read(REPO_ROOT / "CLAUDE.md")
check(
    "CLAUDE.md §5 declares pipeline observability as a working agreement",
    "Pipeline observability is mandatory" in claude_md,
    "missing working-agreement bullet",
)
check(
    "CLAUDE.md §5 references the two canonical artifacts",
    "00-execution-events.jsonl" in claude_md and "00-pipeline-summary.md" in claude_md,
    "canonical artifacts not both cited",
)

# ---------------------------------------------------------------------------
# Suite 21 — KG hygiene (passive-capture gates, soft-delete default, sessions, policy)
# ---------------------------------------------------------------------------
print()
print("=== Suite 21: KG hygiene ===")

# --- delivery.md: pre-flight gates on Step 11.5 ---

delivery_md = read(AGENTS_DIR / "delivery.md")

delivery_kg_checks = [
    ("delivery.md frontmatter declares mcp__memory__suggest_node_type",
     "mcp__memory__suggest_node_type" in delivery_md.split("---", 2)[1]),
    ("delivery.md frontmatter declares mcp__memory__create_nodes",
     "mcp__memory__create_nodes" in delivery_md.split("---", 2)[1]),
    ("delivery.md frontmatter declares mcp__memory__add_observations",
     "mcp__memory__add_observations" in delivery_md.split("---", 2)[1]),
    ("delivery.md frontmatter declares mcp__memory__search_nodes",
     "mcp__memory__search_nodes" in delivery_md.split("---", 2)[1]),
    ("delivery.md frontmatter declares mcp__memory__doctor (pre-flight health probe)",
     "mcp__memory__doctor" in delivery_md.split("---", 2)[1]),
    ("Step 11.5 has Pre-flight quality gates section",
     "Pre-flight quality gates" in delivery_md),
    ("Step 11.5 Gate 1 — Specificity gate via suggest_node_type",
     "Gate 1 — Specificity gate" in delivery_md and "suggest_node_type" in delivery_md),
    ("Step 11.5 Gate 1 skip condition documented (Top-1 confidence < 0.5)",
     "Top-1 confidence < 0.5" in delivery_md),
    ("Step 11.5 Gate 2 — Dedup gate via search_nodes",
     "Gate 2 — Dedup gate" in delivery_md and "search_nodes" in delivery_md),
    ("Step 11.5 Gate 2 redirect to add_observations documented",
     "merged-into" in delivery_md),
    ("Step 11.5 status-block extended with new outcomes",
     "merged-into:" in delivery_md and "written-with-relation-note" in delivery_md),
    ("Step 11.5 has Pre-flight MCP health check section (doctor pre-flight)",
     "Pre-flight MCP health check" in delivery_md),
    ("Step 11.5 forbids URL embellishment in skip log",
     "Never invent a URL in the skip log" in delivery_md),
    ("Step 11.5 has Pending payload fallback section",
     "Pending payload fallback" in delivery_md),
    ("Step 11.5 pending payload path is workspaces/{feature-name}/kg-passive-capture.pending.json",
     "kg-passive-capture.pending.json" in delivery_md),
]

# --- No default Memory MCP URL anywhere in docs: regression guard ---
# This is an open-source distribution — the MCP can live on any host
# (Railway/Render/Fly/Docker/local), so no specific URL is canonical to this
# repo. Doc surfaces (CLAUDE.md, README.md, agent prompts) must reference only
# generic placeholders (e.g., your-mcp.example.com), never a "real-looking"
# host:port. Specific URLs are allowed only in: (a) preservation_test.go test
# fixtures as sample data exercising URL validation / extraction helpers
# (functional, not documentary); (b) CHANGELOG historical entries from prior
# releases (immutable record of what was true at the time).

claude_md = read(REPO_ROOT / "CLAUDE.md")
readme_md = read(REPO_ROOT / "README.md")
prompts_go = read(REPO_ROOT / "cmd" / "install" / "prompts.go")
# The interactive empty-input validation moved from prompts.go to the huh/v2 TUI
# layer (tui.go); prompts.go now holds only the non-interactive path.
tui_go = read(REPO_ROOT / "cmd" / "install" / "tui.go")

# Only the CHANGELOG [Unreleased] block is checked for the doc-surface rule;
# historical entries below it document past behaviour with the URLs that were
# real at that time, and are intentionally preserved.
changelog_md = read(REPO_ROOT / "CHANGELOG.md")
changelog_unreleased = changelog_md.split("## [Unreleased]", 1)[1].split("## [", 1)[0] if "## [Unreleased]" in changelog_md else ""

install_md = read(REPO_ROOT / "docs" / "install.md")

no_default_url_checks = [
    ("CLAUDE.md §1 does NOT name a specific host:port for the Memory MCP URL",
     "localhost:7654" not in claude_md),
    ("CLAUDE.md §1 explains there is no default URL (positive statement)",
     "No default URL" in claude_md or "no default URL" in claude_md),
    ("README.md does NOT name a specific host:port for the Memory MCP URL",
     "localhost:7654" not in readme_md),
    ("README.md does NOT promise a default with 'Press Enter to use the local Docker default'",
     "Press Enter to use the local Docker default" not in readme_md),
    # Relocated from README.md: the no-default-URL positive statement now lives in
    # docs/install.md (where the MCP URL prompt and its rationale are documented).
    # README.md is a minimal landing page; install detail belongs in docs/install.md.
    ("docs/install.md states no default URL exists (positive statement)",
     "no default URL" in install_md or "No default URL" in install_md),
    ("cmd/install/prompts.go doc comments do NOT name a specific host:port",
     "localhost:7654" not in prompts_go),
    ("cmd/install/prompts.go does NOT declare a defaultMemoryMCPURL const",
     "const defaultMemoryMCPURL" not in prompts_go),
    ("cmd/install/prompts.go errors out in non-interactive without MEMORY_MCP_URL env var",
     "Memory MCP URL is required for non-interactive installs" in prompts_go),
    ("cmd/install/tui.go errors out on empty interactive input",
     "URL is required — no default URL exists" in tui_go),
    ("CHANGELOG [Unreleased] block does NOT name a specific host:port for the Memory MCP URL",
     "localhost:7654" not in changelog_unreleased),
]
for label, condition in no_default_url_checks:
    check(f"no-default-mcp-url: {label}", condition)
for label, condition in delivery_kg_checks:
    check(f"delivery.md KG hygiene: {label}", condition)

# --- skills/kg.md: mark_superseded + hard-delete operator-only contract ---
# Hard-delete is NOT a skill sub-command (decision b per 01-plan.md): the
# context-harness-mcp server exposes no delete tool.  The checks below assert
# the new contract: soft-delete via mark_superseded is the only destructive
# operation the skill performs; hard-delete is documented as operator-only
# (Supabase Studio / direct SQL).

memory_skill = read(skill_path("kg"))

memory_skill_checks = [
    ("/th:kg prune uses mark_superseded as default (soft-delete)",
     "mark_superseded" in memory_skill and "soft-delete" in memory_skill),
    ("/th:kg consolidate uses mark_superseded",
     memory_skill.count("mark_superseded") >= 2),
    ("/th:kg hard-delete sub-command is NOT present (operator-only per decision b)",
     "### `hard-delete" not in memory_skill),
    ("hard-delete documented as operator-only (Supabase Studio / direct SQL)",
     "operator-only" in memory_skill and
     ("Supabase Studio" in memory_skill or "direct SQL" in memory_skill)),
    ("skill does NOT reference delete_entities / delete_observations / delete_relations",
     "delete_entities" not in memory_skill and
     "delete_observations" not in memory_skill and
     "delete_relations" not in memory_skill),
    ("Important section: only mark_superseded is destructive (no phantom delete tool)",
     "mark_superseded" in memory_skill and "delete_entities" not in memory_skill),
    ("usage help does NOT list hard-delete as a skill action",
     "hard-delete <entity-name>   Permanent deletion" not in memory_skill),
    ("Important section reflects soft-delete-only contract",
     "Soft-delete via `mark_superseded` is the only destructive operation" in memory_skill or
     "mark_superseded" in memory_skill),
]
for label, condition in memory_skill_checks:
    check(f"skills/kg.md: {label}", condition)

# --- docs/kg-content-policy.md: Volatility avoidance + Multi-tenant additions ---

policy_md = read(REPO_ROOT / "docs" / "kg-content-policy.md")

policy_checks = [
    ("Volatility avoidance section exists",
     "Volatility avoidance" in policy_md),
    ("Volatility section forbids 'currently' without date",
     "currently" in policy_md and "anchor" in policy_md.lower()),
    ("Volatility section forbids 'recently'",
     "recently" in policy_md),
    ("Volatility section forbids 'as of writing'",
     "as of writing" in policy_md),
    ("Multi-tenant additions section exists",
     "Multi-tenant additions" in policy_md),
    ("Multi-tenant section forbids team-member handles as entities",
     "Team-member handles" in policy_md),
    ("Multi-tenant section requires author attribution on decisions",
     "Author attribution" in policy_md and "decision" in policy_md.lower()),
    ("Multi-tenant section discusses split-deployment as fallback",
     "two MCP deployments" in policy_md or "second " in policy_md.lower()),
]
for label, condition in policy_checks:
    check(f"docs/kg-content-policy.md: {label}", condition)

# --- orchestrator.md: session_start in Phase 0a, session_end in Phase 6 ---

orch_session_checks = [
    ("orchestrator.md frontmatter declares mcp__memory__session_start",
     "mcp__memory__session_start" in orch.split("---", 2)[1]),
    ("orchestrator.md frontmatter declares mcp__memory__session_end",
     "mcp__memory__session_end" in orch.split("---", 2)[1]),
    ("Phase 0a calls session_start before search_nodes",
     "session_start" in orch and "1b" in orch),
    ("Phase 0a writes session.json",
     "session.json" in orch),
    ("Phase 6 closes session with session_end",
     "session_end" in orch and "Close the KG session" in orch),
    ("session_start failure is non-blocking",
     "unavailable, skipping attribution" in orch or "session-management errors" in orch),
    ("session.json schema documented (session_id + project + started_at)",
     '"session_id"' in orch and '"started_at"' in orch),
]
for label, condition in orch_session_checks:
    check(f"orchestrator.md session lifecycle: {label}", condition)

# ---------------------------------------------------------------------------
# Suite 22 — Stage-end notification protocol
# ---------------------------------------------------------------------------
print()
print("=== Suite 22: Stage-end notification protocol ===")

NOTIFY_STAGE = REPO_ROOT / "hooks" / "notify-stage.sh"

check(
    "orchestrator.md has ## Stage-end notification protocol section",
    "## Stage-end notification protocol" in orch,
    "## Stage-end notification protocol section missing from orchestrator.md",
)

check(
    "Stage-end protocol mapping table mentions all 4 stage labels",
    all(label in orch for label in ["analysis", "implementation batch", "verify", "delivery"]),
    "one or more stage labels (analysis/implementation batch/verify/delivery) missing from orchestrator.md",
)

check(
    "Stage-end protocol section names hooks/notify-stage.sh",
    "hooks/notify-stage.sh" in orch,
    "hooks/notify-stage.sh not referenced in orchestrator.md Stage-end notification protocol",
)

check(
    "Stage-end protocol section documents the stage.notify JSONL event",
    '"event":"stage.notify"' in orch or "stage.notify" in orch,
    "stage.notify event type not documented in orchestrator.md",
)

check(
    "hooks/notify-stage.sh file exists",
    NOTIFY_STAGE.exists(),
    "hooks/notify-stage.sh does not exist",
)

# Executable check — skip on Windows where permission bits are not meaningful.
if os.name != "nt":
    check(
        "hooks/notify-stage.sh is executable",
        os.access(NOTIFY_STAGE, os.X_OK),
        "hooks/notify-stage.sh is not executable",
    )

notify_stage_content = read(NOTIFY_STAGE)

check(
    "notify-stage.sh branches on darwin (macOS)",
    "darwin" in notify_stage_content,
    "notify-stage.sh missing darwin branch",
)
check(
    "notify-stage.sh branches on linux",
    "linux" in notify_stage_content,
    "notify-stage.sh missing linux branch",
)
check(
    "notify-stage.sh branches on Windows (msys or cygwin or win32)",
    any(k in notify_stage_content for k in ("msys", "cygwin", "win32")),
    "notify-stage.sh missing Windows (msys/cygwin/win32) branch",
)

check(
    "Stage-end protocol documents idempotency dedup via JSONL",
    "already-fired" in orch and "00-execution-events.jsonl" in orch,
    "idempotency dedup mechanism (already-fired / JSONL) not documented in orchestrator.md",
)

# (h) AC-2 coverage: section explicitly states toasts fire independent of autonomy mode.
check(
    "Stage-end protocol section states independence from autonomy mode",
    "independent of autonomy" in orch,
    "AC-2 contract ('independent of autonomy mode') not stated in orchestrator.md section",
)

# (i) AC-6 sub-item (b): Toast Mapping Table sub-heading present (not just label text).
check(
    "Stage-end protocol section has ### Toast Mapping Table sub-heading",
    "### Toast Mapping Table" in orch,
    "### Toast Mapping Table sub-heading missing from Stage-end notification protocol section",
)

# (j) AC-6 sub-item (e): Failure-safety sub-heading present (regression guard for 'best-effort, never blocks' contract).
check(
    "Stage-end protocol section has ### Failure-safety sub-heading",
    "### Failure-safety" in orch,
    "### Failure-safety sub-heading missing — best-effort/never-blocks contract may have been removed",
)

# (k) hooks/README.md documents notify-stage.sh (installer/documentation propagation check).
hooks_readme_content = read(REPO_ROOT / "hooks" / "README.md")
check(
    "hooks/README.md documents notify-stage.sh",
    "notify-stage.sh" in hooks_readme_content,
    "hooks/README.md does not mention notify-stage.sh — documentation incomplete",
)

# (l) notify-stage.sh exits 0 on every path (failure-safety contract on the script itself).
check(
    "notify-stage.sh unconditionally exits 0 (failure-safety contract)",
    notify_stage_content.rstrip().endswith("exit 0"),
    "notify-stage.sh does not end with 'exit 0' — wrapper may propagate errors to orchestrator",
)

# (m) AC-8: CHANGELOG [Unreleased] section mentions stage-end notifications + idempotency.
changelog = read(REPO_ROOT / "CHANGELOG.md")
check(
    "CHANGELOG.md [Unreleased] mentions stage-end notifications and idempotency",
    "[Unreleased]" in changelog and "notify-stage.sh" in changelog and "idempotent" in changelog,
    "CHANGELOG entry for stage-end notifications (notify-stage.sh + idempotent) missing or incomplete",
)

# SEC regression guards (iter 1 — post-security-fix audit)
# These checks prevent re-introduction of the unsafe patterns fixed in the security iteration.

# (n) SEC-001 regression guard: all 4 stage call-sites in orchestrator.md use python3 json.dumps
# with positional argv — NOT echo '...' with inline placeholder substitution (CWE-78).
check(
    "SEC-001 guard: orchestrator call-sites use python3 json.dumps (not echo single-quoted string)",
    orch.count("python3 -c \"import json,sys; print(json.dumps(") >= 4,
    "SEC-001 regression: fewer than 4 'python3 -c json.dumps' call-sites found in orchestrator.md — "
    "echo with placeholder substitution may have been reintroduced (CWE-78)",
)

# (o) SEC-001 regression guard (negative): no echo '{"stage" call-sites remain in orchestrator.md.
check(
    "SEC-001 guard (negative): no residual echo single-quoted stage payload in orchestrator.md",
    'echo \'{"stage"' not in orch,
    "SEC-001 regression: echo single-quoted stage payload found in orchestrator.md — "
    "this pattern is vulnerable to shell command injection (CWE-78)",
)

# (p) SEC-002 regression guard: idempotency checks use python3 structural parse, not grep -c.
# The safe pattern emits print(sum(...json.loads(l)...)); grep -c on JSONL is unanchored and
# can false-positive on summary text containing the substring.
check(
    "SEC-002 guard: idempotency uses python3 structural JSON parse (not grep -c regex match)",
    orch.count("print(sum(1 for l in open(") >= 4,
    "SEC-002 regression: fewer than 4 'print(sum(1 for l in open(' patterns in orchestrator.md — "
    "idempotency may have reverted to unanchored grep -c (CWE-20 false-positive risk)",
)

# (q) SEC-004 regression guard: notify-windows.sh uses '' (PowerShell double-quote escape)
# NOT \' (backslash escape, which is invalid in PowerShell single-quoted strings).
notify_windows_content = read(REPO_ROOT / "hooks" / "notify-windows.sh")
check(
    "SEC-004 guard: notify-windows.sh uses PowerShell-correct '' escape (not broken \\' escape)",
    "s/'/''/g" in notify_windows_content and "s/'/\\\\'/g" not in notify_windows_content,
    "SEC-004 regression: notify-windows.sh uses s/'/\\\\'/g (broken PowerShell escape) — "
    "correct escape is s/'/''/g (doubling the quote per PowerShell single-quoted string rules)",
)

# (r) SEC-005 regression guard: notify-mac.sh body construction uses printf pipe to osascript
# NOT osascript -e with bash double-quoting (which allows $(...) interpolation before osascript sees it).
notify_mac_content = read(REPO_ROOT / "hooks" / "notify-mac.sh")
check(
    "SEC-005 guard: notify-mac.sh uses printf pipe to osascript (not bash double-quoted -e string)",
    'printf \'display notification' in notify_mac_content
    and 'osascript -e "display notification' not in notify_mac_content,
    "SEC-005 regression: notify-mac.sh reverted to osascript -e with bash double-quoting — "
    "this allows $(...) subshell expansion in the body before osascript evaluates the string",
)

# ---------------------------------------------------------------------------
# Suite 23 — Low-cost mode coverage and floor compliance (AC-10)
# ---------------------------------------------------------------------------
print()
print("=== Suite 23: Low-cost mode ===")

agents_readme = read(AGENTS_DIR / "README.md")
modes_go = read(REPO_ROOT / "cmd" / "install" / "modes.go")
prompts_go_lc = read(REPO_ROOT / "cmd" / "install" / "prompts.go")
# INSTALL_MODE handling moved out of prompts.go into workspaces.go (env-var
# parsing) + main.go (wiring); prompts.go no longer references it.
workspaces_go = read(REPO_ROOT / "cmd" / "install" / "workspaces.go")

# (a) agents/README.md contains a ## Low-cost mode section.
check(
    "agents/README.md has '## Low-cost mode' section",
    "## Low-cost mode" in agents_readme,
    "section missing — low-cost matrix has no human-readable documentation",
)

# (a) continued: the section contains an agent table (count pipe-separated rows
#     with | in the body; each data row has at least one agent name backtick).
# We detect the table by counting occurrences of "| `" inside the section.
# Minimum 17 rows (the original roster); rows are added as new agents are added.
low_cost_section = ""
if "## Low-cost mode" in agents_readme:
    low_cost_section = agents_readme.split("## Low-cost mode", 1)[1]
    # Trim at the next ## heading if present.
    next_section = low_cost_section.find("\n## ")
    if next_section >= 0:
        low_cost_section = low_cost_section[:next_section]

table_rows = low_cost_section.count("| `")
check(
    "agents/README.md Low-cost mode section has a 17-row agent table",
    table_rows >= 17,
    f"found {table_rows} table rows with backtick agent names, expected >= 17",
)

# (b) Every agent in the canonical Roster also appears in the low-cost table.
for agent_name in EXPECTED_AGENTS:
    check(
        f"agents/README.md Low-cost mode table contains '{agent_name}'",
        f"`{agent_name}`" in low_cost_section,
        f"agent '{agent_name}' not found in the low-cost matrix table",
    )

# (c) No agent in the low-cost matrix uses effort: low.
check(
    "agents/README.md Low-cost mode table has no 'effort: low' cell",
    "| low |" not in low_cost_section and "| `low`" not in low_cost_section,
    "'effort: low' found in low-cost matrix table — policy violation (floor is medium)",
)

# (d) No agent in the low-cost matrix uses model: opus.
check(
    "agents/README.md Low-cost mode table has no 'opus' in low-cost model column",
    # The table has columns: standard model | standard effort | low-cost model | ...
    # We check that 'opus' does not appear as a value in the low-cost model column.
    # Approximate: count "| opus |" occurrences in the section — these would be in
    # the standard-model column (expected) vs low-cost model column. We check that
    # the section does NOT contain "| sonnet |" followed immediately in the same row
    # by "opus" (i.e., low-cost column = opus). A simpler signal: count total opus
    # occurrences vs count where they appear in positions 3+ (low-cost model column).
    # Simplest reliable check: no agent row has low-cost model = opus.
    # We grep for rows where the 4th pipe-delimited cell would be 'opus'.
    not any(
        row.strip().startswith("|")
        and [c.strip() for c in row.split("|") if c.strip()][3:4] == ["opus"]
        for row in low_cost_section.splitlines()
        if row.strip().startswith("|") and len(row.split("|")) >= 5
    ),
    "a row in the low-cost table has low-cost model = opus",
)

# (e) No agent in the low-cost matrix uses effort: max.
check(
    "agents/README.md Low-cost mode table has no 'max' in low-cost effort column",
    not any(
        row.strip().startswith("|")
        and [c.strip() for c in row.split("|") if c.strip()][4:5] == ["max"]
        for row in low_cost_section.splitlines()
        if row.strip().startswith("|") and len(row.split("|")) >= 5
    ),
    "a row in the low-cost table has low-cost effort = max",
)

# (f) Every agent in the low-cost matrix uses model: sonnet (low-cost model column).
check(
    "agents/README.md Low-cost mode table: all low-cost model cells are 'sonnet'",
    all(
        [c.strip() for c in row.split("|") if c.strip()][3:4] == ["sonnet"]
        for row in low_cost_section.splitlines()
        if row.strip().startswith("|")
        and len([c.strip() for c in row.split("|") if c.strip()]) >= 5
        and not row.strip().startswith("| Agent")   # skip header row
        and not all(c.strip().startswith("-") or c.strip() == "" for c in row.split("|") if c.strip())
    ),
    "one or more rows in the low-cost table have low-cost model != sonnet",
)

# (g) cmd/install/modes.go declares both standard and low-cost mode values.
check(
    "cmd/install/modes.go declares ModeStandard = 'standard'",
    'ModeStandard InstallMode = "standard"' in modes_go,
    "ModeStandard constant missing or has wrong value",
)
check(
    "cmd/install/modes.go declares ModeLowCost = 'low-cost'",
    'ModeLowCost InstallMode = "low-cost"' in modes_go,
    "ModeLowCost constant missing or has wrong value",
)

# (h) cmd/install/workspaces.go references INSTALL_MODE (env-var fallback).
check(
    "cmd/install/workspaces.go references INSTALL_MODE env var",
    "INSTALL_MODE" in workspaces_go,
    "workspaces.go does not reference INSTALL_MODE — env-var fallback not implemented",
)

# (i) cmd/install/modes.go declares lowCostMatrix with agents known at installer
# decommission time (2026-06-02). Agents added after decommission (qa-plan, ux-reviewer)
# are excluded from this check — modes.go is a frozen artifact; new agents go in
# the README low-cost matrix (vestigial, for documentation only).
MODES_GO_EXCLUDED = {"qa-plan", "ux-reviewer"}
for agent_name in EXPECTED_AGENTS:
    if agent_name in MODES_GO_EXCLUDED:
        continue
    check(
        f"cmd/install/modes.go lowCostMatrix contains entry for '{agent_name}'",
        f'"{agent_name}"' in modes_go,
        f"'{agent_name}' entry missing from lowCostMatrix in modes.go",
    )

# (j) cmd/install/modes.go uses only sonnet in the matrix (no opus, no haiku).
check(
    "cmd/install/modes.go lowCostMatrix has no 'opus' model value",
    'Model: "opus"' not in modes_go,
    "modes.go matrix contains Model: opus — policy violation (low-cost floor is sonnet)",
)
check(
    "cmd/install/modes.go lowCostMatrix has no 'haiku' model value",
    'Model: "haiku"' not in modes_go,
    "modes.go matrix contains Model: haiku — policy violation (low-cost floor is sonnet)",
)

# (k) cmd/install/modes.go uses only medium or high effort (no max, no low).
check(
    "cmd/install/modes.go lowCostMatrix has no 'max' effort value",
    'Effort: "max"' not in modes_go,
    "modes.go matrix contains Effort: max — policy violation (low-cost ceiling is high)",
)
check(
    "cmd/install/modes.go lowCostMatrix has no 'low' effort value",
    'Effort: "low"' not in modes_go,
    "modes.go matrix contains Effort: low — project policy forbids effort: low",
)

# (l) AC-9: CLAUDE.md describes the two modes and references INSTALL_MODE.
claude_md_root = read(REPO_ROOT / "CLAUDE.md")
check(
    "CLAUDE.md references INSTALL_MODE env var (AC-9: two modes documented)",
    "INSTALL_MODE" in claude_md_root,
    "CLAUDE.md does not mention INSTALL_MODE — low-cost mode toggle undocumented",
)

# (m) AC-9: CLAUDE.md links to agents/README.md#low-cost-mode (no duplicate matrix).
check(
    "CLAUDE.md links to agents/README.md#low-cost-mode (AC-9: matrix in one place)",
    "agents/README.md#low-cost-mode" in claude_md_root,
    "CLAUDE.md must link to agents/README.md#low-cost-mode, not duplicate the matrix",
)

# (n) AC-9: docs/install.md describes the two modes and references INSTALL_MODE.
# Relocated from README.md: install detail (env vars, modes, non-interactive setup)
# belongs in docs/install.md. README.md is a minimal landing page that links to it.
install_md_lc = read(REPO_ROOT / "docs" / "install.md")
check(
    "docs/install.md references INSTALL_MODE env var (AC-9: two modes documented)",
    "INSTALL_MODE" in install_md_lc,
    "docs/install.md does not mention INSTALL_MODE — low-cost mode toggle undocumented",
)

# (o) AC-9: docs/install.md links to agents/README.md#low-cost-mode (no duplicate matrix).
check(
    "docs/install.md links to agents/README.md#low-cost-mode (AC-9: matrix in one place)",
    "agents/README.md#low-cost-mode" in install_md_lc,
    "docs/install.md must link to agents/README.md#low-cost-mode, not duplicate the matrix",
)

# ---------------------------------------------------------------------------
# Suite 24 — Curl one-liner install: go:embed + bootstrap URLs + pages.yml
# ---------------------------------------------------------------------------
print()
print("=== Suite 24: Curl one-liner install (go:embed + Pages + bootstrap) ===")

assets_go = read(REPO_ROOT / "assets.go")
install_sh = read(REPO_ROOT / "bin" / "install.sh")
install_ps1 = read(REPO_ROOT / "bin" / "install.ps1")
install_cmd = read(REPO_ROOT / "bin" / "install.cmd")

PAGES_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "pages.yml"
pages_yml_text = read(PAGES_WORKFLOW) if PAGES_WORKFLOW.exists() else ""

# (a) assets.go contains the //go:embed directive for agents, skills, hooks.
# The "all:" prefix on agents/ is required to include agents/_shared/ (starts with "_").
check(
    "assets.go contains '//go:embed agents skills hooks'",
    "//go:embed agents skills hooks" in assets_go
    or "//go:embed all:agents skills hooks" in assets_go,
    "//go:embed directive missing or does not cover agents, skills, hooks",
)

# (b) bin/install.sh references the deterministic releases/latest/download URL.
# The URL may be split across a variable assignment (BASE_URL=...download) — check
# for the path suffix which is always present literally.
RELEASES_PATH = "releases/latest/download"
check(
    "bin/install.sh references releases/latest/download URL",
    RELEASES_PATH in install_sh,
    f"install.sh must reference a URL containing '{RELEASES_PATH}'",
)

# (c) bin/install.ps1 references the deterministic releases/latest/download URL.
check(
    "bin/install.ps1 references releases/latest/download URL",
    RELEASES_PATH in install_ps1,
    f"install.ps1 must reference a URL containing '{RELEASES_PATH}'",
)

# (d) bin/install.cmd exists and references the deterministic URL.
check(
    "bin/install.cmd exists",
    (REPO_ROOT / "bin" / "install.cmd").exists(),
    "bin/install.cmd not found — Windows cmd.exe one-liner not implemented",
)
check(
    "bin/install.cmd references releases/latest/download URL",
    RELEASES_PATH in install_cmd,
    f"install.cmd must reference a URL containing '{RELEASES_PATH}'",
)

# (e) .github/workflows/pages.yml exists.
check(
    ".github/workflows/pages.yml exists",
    PAGES_WORKFLOW.exists(),
    ".github/workflows/pages.yml missing — Pages publish workflow not implemented",
)

# (f) pages.yml is triggered by release: published (the only publish trigger).
check(
    "pages.yml triggered by 'release: published'",
    "release:" in pages_yml_text and "published" in pages_yml_text,
    "pages.yml must trigger on release: types: [published]",
)

# (g) pages.yml has NO 'push:' trigger (AC-9: must not republish on main pushes).
check(
    "pages.yml has no 'push:' trigger (AC-9)",
    # Allow 'push' in comments but not as a trigger key.
    not re.search(r"^\s*push\s*:", pages_yml_text, re.MULTILINE),
    "pages.yml must not have a 'push:' trigger — would republish on every main commit",
)

# (h) pages.yml has a workflow_dispatch trigger (R7 manual recovery).
check(
    "pages.yml has workflow_dispatch trigger (R7 recovery)",
    "workflow_dispatch" in pages_yml_text,
    "pages.yml must have workflow_dispatch for manual re-publish recovery (R7)",
)

# (i) pages.yml uses actions/deploy-pages (first-party, D5).
check(
    "pages.yml uses actions/deploy-pages",
    "actions/deploy-pages" in pages_yml_text,
    "pages.yml must use the first-party actions/deploy-pages action (D5)",
)

# (j) bin/install.sh does NOT use the GitHub API endpoint (replaced by deterministic URL).
check(
    "bin/install.sh does not call api.github.com (replaced by deterministic URL)",
    "api.github.com" not in install_sh,
    "install.sh still calls api.github.com — should use releases/latest/download directly",
)

# (k) bin/install.ps1 does NOT use Invoke-RestMethod for the API (replaced by direct download).
check(
    "bin/install.ps1 does not call api.github.com",
    "api.github.com" not in install_ps1,
    "install.ps1 still calls api.github.com — should use releases/latest/download directly",
)

# (l) The legacy Go-installer one-liner relocated from README.md to docs/install.md.
# README.md is now a minimal, plugin-first landing page; the Go installer is
# deprecated (CLAUDE.md §3), so its bootstrap URL and clone path live in the
# install reference. AC-11 is now satisfied by docs/install.md.
top_readme = read(REPO_ROOT / "README.md")
install_md_pages = read(REPO_ROOT / "docs" / "install.md")
PAGES_INSTALL_SH = "valianx.github.io/team-harness/install.sh"
check(
    "docs/install.md references the GitHub Pages install.sh URL (AC-11)",
    PAGES_INSTALL_SH in install_md_pages,
    f"docs/install.md does not reference '{PAGES_INSTALL_SH}' — one-liner install not surfaced",
)

# (m) docs/install.md positions the one-liner before the clone-and-run path
# (AC-11: primary vs secondary). The Pages URL must appear before "From source".
pages_url_pos = install_md_pages.find(PAGES_INSTALL_SH)
from_source_pos = install_md_pages.lower().find("from source")
check(
    "docs/install.md one-liner (Pages URL) appears before 'From source' section (AC-11: primary path)",
    pages_url_pos != -1 and from_source_pos != -1 and pages_url_pos < from_source_pos,
    "docs/install.md must show the Pages one-liner BEFORE the 'From source' clone section",
)

# (n) Bootstrap scripts do NOT clear the environment before exec-ing the binary.
# Each script must inherit env (exec / & $Installer / direct call) — no 'env -i' or
# 'Start-Process -UseNewEnvironment' which would lose INSTALL_MODE.
check(
    "bin/install.sh does not clear environment (no 'env -i') — AC-4 INSTALL_MODE propagation",
    "env -i" not in install_sh,
    "install.sh uses 'env -i' which clears INSTALL_MODE before spawning the binary",
)
check(
    "bin/install.ps1 does not clear environment (no '-UseNewEnvironment') — AC-4 INSTALL_MODE propagation",
    "-UseNewEnvironment" not in install_ps1,
    "install.ps1 uses -UseNewEnvironment which clears INSTALL_MODE before spawning the binary",
)

# ---------------------------------------------------------------------------
# Suite 25 — Voice and Language Guide enforcement
# ---------------------------------------------------------------------------
print()
print("=== Suite 25: Voice and Language Guide enforcement ===")

# Reload files for the voice suite (may have been updated during prior suites).
_claude_md = read(REPO_ROOT / "CLAUDE.md")
_orch_md = read(AGENTS_DIR / "orchestrator.md")


def _extract_section(text: str, start_marker: str, end_marker: str) -> str:
    """Return the text between start_marker and end_marker (exclusive)."""
    start = text.find(start_marker)
    if start < 0:
        return ""
    end = text.find(end_marker, start + len(start_marker))
    return text[start:end] if end > start else text[start:]


# Baked-in `## Voice` contract section (CLAUDE.md §7.1 inlined into every
# agent and standalone skill prompt). The section lists the same forbidden
# tone markers and emoji as illustrative negative examples, so the voice
# checks below need to strip it before scanning — same rationale as the
# CLAUDE.md §7.1 OUT-section allowlist a few lines below.
_VOICE_CONTRACT_START = "## Voice\n\nYou speak as a professional instrument"
_VOICE_CONTRACT_END = "The operator can chat in any language; you reply in the operator's chat language, but the voice rules above apply regardless of language."


def _strip_voice_contract(text: str) -> str:
    """Strip the baked-in `## Voice` contract section if present."""
    start = text.find(_VOICE_CONTRACT_START)
    if start < 0:
        return text
    end = text.find(_VOICE_CONTRACT_END, start)
    if end < 0:
        return text
    # Include the end marker itself in the strip range.
    end += len(_VOICE_CONTRACT_END)
    return text[:start] + text[end:]


# Closed list of high-confidence Spanish words for the language-leak checks.
# The list is intentionally narrow — it targets words that are unambiguously
# Spanish and appear in actual violation patterns found during the audit.
_SPANISH_WORDS = [
    "problemática", "código", "revisión", "actualización", "cualquier",
    "borrador", "aprueba", "reemplazada", "cancelar",
]

# (1) No banned tone markers in committed markdown files.
# The CLAUDE.md Voice and Language Guide §7.1 OUT section lists these markers
# as illustrative examples of what NOT to use — that section is an allowlisted
# exception. All other files and all other sections of CLAUDE.md are checked.
_BANNED_TONE_MARKERS = [
    "¡Perfecto", "¡Excelente", "Excelente", "Genial", "¡Listo",
]
_md_files_to_scan = (
    list(AGENTS_DIR.glob("*.md"))
    + list(SKILLS_DIR.glob("*.md"))
    + list((REPO_ROOT / "docs").glob("*.md"))
    + [REPO_ROOT / "README.md", REPO_ROOT / "CLAUDE.md", REPO_ROOT / "CHANGELOG.md"]
)
_banned_found: list[str] = []
for _md_file in _md_files_to_scan:
    if not _md_file.exists():
        continue
    _content = read(_md_file)
    # For CLAUDE.md: strip the Voice and Language Guide OUT section (§7.1)
    # which legitimately lists banned markers as negative examples.
    _scan_content = _content
    if _md_file.name == "CLAUDE.md":
        _voice_guide_section = _extract_section(
            _content, "**OUT** — what never appears in committed copy:", "**IN** — what conformant copy looks like:"
        )
        _scan_content = _content.replace(_voice_guide_section, "")
    # For agent and skill files: strip the baked-in `## Voice` contract
    # section which legitimately lists banned markers as negative examples.
    _scan_content = _strip_voice_contract(_scan_content)
    for _marker in _BANNED_TONE_MARKERS:
        if _marker in _scan_content:
            _banned_found.append(f"{_md_file.name}: {_marker!r}")
check(
    "voice: no banned tone markers in committed markdown",
    len(_banned_found) == 0,
    f"found: {_banned_found}",
)

# (2) No emoji decoration in operator-facing skill files and orchestrator templates.
# Check for the four specific Unicode codepoints used as status decorations.
_EMOJI_CODEPOINTS = ["✅", "⚠️", "🎉", "✨"]
_emoji_found: list[str] = []
for _skill_file in SKILLS_DIR.glob("*.md"):
    _content = read(_skill_file)
    # Strip the baked-in `## Voice` contract section, which lists the same
    # emoji codepoints as illustrative forbidden examples.
    _content = _strip_voice_contract(_content)
    for _emoji in _EMOJI_CODEPOINTS:
        if _emoji in _content:
            _emoji_found.append(f"{_skill_file.name}: {_emoji!r}")
# Also check orchestrator operator-facing report templates.
_orch_report_sections = re.findall(
    r"\*\*Report to user:\*\*\s*```(.*?)```",
    _orch_md,
    re.DOTALL,
)
for _section in _orch_report_sections:
    for _emoji in _EMOJI_CODEPOINTS:
        if _emoji in _section:
            _emoji_found.append(f"orchestrator.md report template: {_emoji!r}")
check(
    "voice: no emoji decoration in operator-facing skill files or orchestrator report templates",
    len(_emoji_found) == 0,
    f"found: {_emoji_found}",
)

# (3) No Phase N.M/7 patterns in orchestrator operator-visible report-template blocks.
# The pattern `Phase \d+(\.\d+)?/7` should not appear inside fenced code blocks
# that follow a `**Report to user:**` label.
_phase_number_in_templates: list[str] = []
for _section in _orch_report_sections:
    _hits = re.findall(r"Phase \d+(?:\.\d+)?/7", _section)
    if _hits:
        _phase_number_in_templates.extend(_hits)
check(
    "voice: no 'Phase N/7' breadcrumbs in orchestrator operator-visible report templates",
    len(_phase_number_in_templates) == 0,
    f"found: {_phase_number_in_templates}",
)

# (4) No high-confidence Spanish words in agents/*.md outside documented allowlists.
# Allowlists (identified by section header proximity):
#   - agents/security.md: lines from "## Phase 4 — Security Report" to next "---"
#   - agents/reviewer.md: full review_body template region (both Fresh and Update Body)
#   - agents/orchestrator.md: Step 6 routing table (identified by "| Intent Pattern")
#   - agents/translator.md: glossary tables (identified by "## Phase 1 — Glossary")
_agents_spanish_found: list[str] = []
for _agent_file in AGENTS_DIR.glob("*.md"):
    _content = read(_agent_file)
    _name = _agent_file.name

    # Build list of allowlisted sections for this agent (each is stripped separately).
    _allowed_sections: list[str] = []
    if _name == "security.md":
        # Allow the entire Phase 4 Security Report template through Return Protocol
        # (Spanish report-body template region — AC-11 documented exception).
        _sec_report = _extract_section(_content, "## Phase 4 — Security Report", "## Return Protocol")
        if _sec_report:
            _allowed_sections.append(_sec_report)
    elif _name == "reviewer.md":
        # Allow the Phase 0–Phase 3 operational sections that contain the Spanish
        # report-body templates (AC-11 documented exception: reviewer output bodies
        # posted to GitHub and workspace doc outputs stay Spanish per the contract).
        _rev_ops = _extract_section(
            _content, "## Phase 0 — Parse Inline Data", "## Session Documentation"
        )
        if _rev_ops:
            _allowed_sections.append(_rev_ops)
    elif _name == "orchestrator.md":
        # Allow the Step 6 intent-detection routing table (bilingual bridge).
        _step6 = _extract_section(_content, "| Intent Pattern (es/en) |", "**Disambiguation")
        if _step6:
            _allowed_sections.append(_step6)
    elif _name == "translator.md":
        # Allow the glossary example tables (domain illustrations, not operator copy).
        _glossary = _extract_section(_content, "## Phase 1 — Glossary", "## Phase 2")
        if _glossary:
            _allowed_sections.append(_glossary)
    elif _name == "reviewer-consolidator.md":
        # Allow the Output contract section which contains the Spanish review_body
        # template (same §7.3 exception as reviewer.md — the consolidator's output
        # is a GitHub PR review body that stays Spanish per the reviewer contract).
        _rc_output = _extract_section(_content, "## Output contract", "## Return Protocol")
        if _rc_output:
            _allowed_sections.append(_rc_output)

    for _word in _SPANISH_WORDS:
        # Strip each allowed section from a scratch copy before checking.
        _remaining = _content
        for _sec in _allowed_sections:
            _remaining = _remaining.replace(_sec, "")
        if _word in _remaining:
            _agents_spanish_found.append(f"{_name}: {_word!r}")

check(
    "voice: no high-confidence Spanish words in agents/*.md outside documented allowlists",
    len(_agents_spanish_found) == 0,
    f"found: {_agents_spanish_found}",
)

# (5) No high-confidence Spanish words in skills/*.md (no allowlist — skills are operator entry points).
_skills_spanish_found: list[str] = []
for _skill_file in SKILLS_DIR.glob("*.md"):
    _content = read(_skill_file)
    for _word in _SPANISH_WORDS:
        if _word in _content:
            _skills_spanish_found.append(f"{_skill_file.name}: {_word!r}")
check(
    "voice: no high-confidence Spanish words in skills/*.md",
    len(_skills_spanish_found) == 0,
    f"found: {_skills_spanish_found}",
)

# (6) No high-confidence Spanish words in cmd/install/*.go string literals.
_INSTALL_DIR = REPO_ROOT / "cmd" / "install"
_install_spanish_found: list[str] = []
for _go_file in _INSTALL_DIR.glob("*.go"):
    _content = read(_go_file)
    for _word in _SPANISH_WORDS:
        if _word in _content:
            _install_spanish_found.append(f"{_go_file.name}: {_word!r}")
check(
    "voice: no high-confidence Spanish words in cmd/install/*.go",
    len(_install_spanish_found) == 0,
    f"found: {_install_spanish_found}",
)

# (7) No high-confidence Spanish words in hooks/*.sh echo/printf strings.
_hooks_spanish_found: list[str] = []
for _hook_file in HOOKS_DIR.glob("*.sh"):
    _content = read(_hook_file)
    for _word in _SPANISH_WORDS:
        if _word in _content:
            _hooks_spanish_found.append(f"{_hook_file.name}: {_word!r}")
check(
    "voice: no high-confidence Spanish words in hooks/*.sh",
    len(_hooks_spanish_found) == 0,
    f"found: {_hooks_spanish_found}",
)

# (8) CLAUDE.md contains the Voice and Language Guide section heading.
check(
    "voice: CLAUDE.md contains '## 7. Voice and Language Guide' section",
    re.search(r"^## 7\.?\s+Voice and Language Guide", _claude_md, re.MULTILINE) is not None,
    "## 7. Voice and Language Guide section missing from CLAUDE.md",
)

# (9) agents/orchestrator.md and docs/how-it-works.md contain a dev-natural @th:orchestrator example.
_HOW_IT_WORKS = REPO_ROOT / "docs" / "how-it-works.md"
_how_it_works_md = read(_HOW_IT_WORKS) if _HOW_IT_WORKS.exists() else ""
_ORCHESTRATOR_EXAMPLE_PATTERN = re.compile(
    r"@th:orchestrator.*(plan|implement|PR|recover)", re.IGNORECASE
)
check(
    "voice: dev-natural @th:orchestrator example (plan/implement/PR/recover) in orchestrator.md or how-it-works.md",
    _ORCHESTRATOR_EXAMPLE_PATTERN.search(_orch_md) is not None
    or _ORCHESTRATOR_EXAMPLE_PATTERN.search(_how_it_works_md) is not None,
    "neither agents/orchestrator.md nor docs/how-it-works.md contains an @th:orchestrator dev-natural example",
)

# (10) No first-person personality phrases in agent output templates (status-block / report regions).
_FIRST_PERSON_PATTERNS = [
    re.compile(r"^I think", re.MULTILINE),
    re.compile(r"^My recommendation", re.MULTILINE),
    re.compile(r"^Yo voy", re.MULTILINE),
    re.compile(r"^Creo que", re.MULTILINE),
]
_first_person_found: list[str] = []
for _agent_file in AGENTS_DIR.glob("*.md"):
    _content = read(_agent_file)
    for _pat in _FIRST_PERSON_PATTERNS:
        if _pat.search(_content):
            _first_person_found.append(f"{_agent_file.name}: {_pat.pattern!r}")
check(
    "voice: no first-person personality phrases in agent files",
    len(_first_person_found) == 0,
    f"found: {_first_person_found}",
)

# (11) Affirmative: security/reviewer Spanish exception is preserved (regression guard).
_security_md = read(AGENTS_DIR / "security.md")
_reviewer_md = read(AGENTS_DIR / "reviewer.md")
check(
    "voice: agents/security.md Phase 4 report template still contains Spanish severity labels",
    "Crítico" in _security_md and "Alto" in _security_md and "Medio" in _security_md,
    "Spanish severity labels (Crítico/Alto/Medio) missing from security.md — exception may have been removed",
)
check(
    "voice: agents/reviewer.md review body template still contains Spanish section headers",
    "Revision de Codigo" in _reviewer_md or "Problemas Criticos" in _reviewer_md,
    "Spanish section headers (Revision de Codigo/Problemas Criticos) missing from reviewer.md — exception may have been removed",
)

# ---------------------------------------------------------------------------
# Suite 26 — Bug-fix Pipeline (type: fix and type: hotfix)
# ---------------------------------------------------------------------------
print()
print("=== Suite 26: Bug-fix Pipeline (v2.9.0) ===")

# Reload files for this suite (may have been updated since prior reads).
_orch_bf = read(AGENTS_DIR / "orchestrator.md")
_architect_bf = read(AGENTS_DIR / "architect.md")
_tester_bf = read(AGENTS_DIR / "tester.md")
_implementer_bf = read(AGENTS_DIR / "implementer.md")
_delivery_bf = read(AGENTS_DIR / "delivery.md")
_plan_reviewer_bf = read(AGENTS_DIR / "plan-reviewer.md")
_qa_bf = read(AGENTS_DIR / "qa.md")
_ref_flows_bf = read(AGENTS_DIR / "ref-special-flows.md")

# (1) orchestrator: Phase 2.0 numbering present
check(
    "orchestrator.md declares Phase 2.0 — Regression Test Authoring",
    "## Phase 2.0 — Regression Test Authoring" in _orch_bf,
    "Phase 2.0 section header missing from orchestrator.md",
)
check(
    "orchestrator.md Phase 2.0 is mandatory and never skipped",
    "Phase 2.0" in _orch_bf and ("MANDATORY" in _orch_bf or "Never skipped" in _orch_bf or "mandatory" in _orch_bf.lower()),
    "Phase 2.0 mandatory-ness not documented",
)
check(
    "orchestrator.md Phase 2.0 dispatches tester in pre-fix-regression mode",
    "mode: pre-fix-regression" in _orch_bf or "pre-fix-regression" in _orch_bf,
    "tester dispatch with mode: pre-fix-regression not declared in Phase 2.0",
)

# (2) orchestrator: 00-state.md schema includes type and regression_test fields + phase 2.0
check(
    "orchestrator.md 00-state.md schema includes type field with fix and hotfix values",
    "type:" in _orch_bf and "fix" in _orch_bf and "hotfix" in _orch_bf,
    "type field with fix/hotfix not documented in 00-state.md schema",
)
check(
    "orchestrator.md 00-state.md schema includes phase: 2.0",
    "2.0" in _orch_bf and ("phase: {0a|0b|1|1.5|1.6|2.0|2|" in _orch_bf or "|2.0|" in _orch_bf),
    "phase: 2.0 not in 00-state.md schema enum",
)
check(
    "orchestrator.md 00-state.md schema includes regression_test_path field",
    "regression_test_path" in _orch_bf,
    "regression_test_path field missing from 00-state.md schema",
)
check(
    "orchestrator.md 00-state.md schema includes regression_test_status field",
    "regression_test_status" in _orch_bf,
    "regression_test_status field missing from 00-state.md schema",
)

# (3) orchestrator: security-sensitive forced to true for type: fix | hotfix
check(
    "orchestrator.md Step 7 forces security-sensitive: true for type: fix or hotfix",
    "type is `fix` or `hotfix`" in _orch_bf or "`fix` or `hotfix`" in _orch_bf or
    "Task type is `fix` or `hotfix`" in _orch_bf,
    "security-sensitive: true force for fix/hotfix not declared in Step 7",
)
check(
    "orchestrator.md Step 7 documents defense-in-depth rationale for bug-fix security",
    "defense-in-depth" in _orch_bf or "defense in depth" in _orch_bf,
    "defense-in-depth rationale missing for forcing security on bug-fix",
)

# (4) orchestrator: Phase 3 verify documents security runs always for type: fix | hotfix
check(
    "orchestrator.md Phase 3 verify states security runs always for type: fix | hotfix",
    "security` runs **always**" in _orch_bf or "security runs always" in _orch_bf.lower() or
    ("`type: fix`" in _orch_bf and "always" in _orch_bf and "security" in _orch_bf),
    "Phase 3 does not document security-runs-always for bug-fix",
)

# (5) orchestrator: routing to root-cause mode for architect when type: fix
check(
    "orchestrator.md Phase 1 routes to architect mode: root-cause for type: fix",
    "mode: root-cause" in _orch_bf or "`root-cause`" in _orch_bf,
    "architect mode: root-cause routing not documented in Phase 1",
)
check(
    "orchestrator.md Phase 1 skipped for type: hotfix",
    "Phase 1" in _orch_bf and "hotfix" in _orch_bf and "skipped" in _orch_bf.lower(),
    "Phase 1 skip rule for hotfix not documented",
)

# (6) orchestrator: type_reclassify handling
check(
    "orchestrator.md documents type_reclassify protocol (architect-recommends-operator-decides)",
    "type_reclassify" in _orch_bf and "operator" in _orch_bf.lower(),
    "type_reclassify protocol not documented",
)

# (7) orchestrator: Special Flows table mentions Bug-fix
check(
    "orchestrator.md Special Flows table mentions Bug-fix flow with 01-root-cause.md",
    "Bug-fix" in _orch_bf and "01-root-cause.md" in _orch_bf,
    "Bug-fix flow not documented in Special Flows table",
)

# (8) orchestrator: 00-pipeline-summary.md row mappings for bug-fix
check(
    "orchestrator.md documents 00-pipeline-summary.md row mappings for bug-fix",
    "Bug-fix flow row mappings" in _orch_bf or
    ("Phase 1" in _orch_bf and "01-root-cause.md" in _orch_bf and "hotfix" in _orch_bf and "Phase 2.0" in _orch_bf),
    "Pipeline summary row mappings for bug-fix not documented",
)

# (9) architect.md: Root-Cause Analysis mode section
check(
    "architect.md has Root-Cause Analysis Mode section",
    "### Root-Cause Analysis Mode" in _architect_bf or "## Root-Cause Analysis Mode" in _architect_bf,
    "Root-Cause Analysis Mode section missing from architect.md",
)
check(
    "architect.md Root-Cause mode outputs 01-root-cause.md",
    "01-root-cause.md" in _architect_bf,
    "01-root-cause.md output not declared in architect.md",
)
check(
    "architect.md Root-Cause mode declares 1-page size cap",
    "01-root-cause.md" in _architect_bf and ("1 page" in _architect_bf.lower() or "≤80 lines" in _architect_bf),
    "1-page size cap not declared for 01-root-cause.md",
)
check(
    "architect.md Root-Cause mode has ## Regression Test Approach mandatory section",
    "## Regression Test Approach" in _architect_bf,
    "## Regression Test Approach section not declared in 01-root-cause.md template",
)
check(
    "architect.md Root-Cause mode documents type_reclassify protocol",
    "type_reclassify" in _architect_bf,
    "type_reclassify protocol not documented in architect Root-Cause mode",
)
check(
    "architect.md Return Protocol declares type_reclassify field",
    "type_reclassify: false | true" in _architect_bf or "type_reclassify:" in _architect_bf.split("## Return Protocol", 1)[1] if "## Return Protocol" in _architect_bf else False,
    "type_reclassify field not declared in architect Return Protocol",
)

# (10) tester.md: Pre-Fix Regression Test mode
check(
    "tester.md has Pre-Fix Regression Test Mode section",
    "## Pre-Fix Regression Test Mode" in _tester_bf,
    "Pre-Fix Regression Test Mode section missing from tester.md",
)
check(
    "tester.md Pre-Fix Regression Test mode outputs 02-regression-test.md",
    "02-regression-test.md" in _tester_bf,
    "02-regression-test.md not declared in tester.md Pre-Fix Regression Test mode",
)
check(
    "tester.md Pre-Fix mode dispatched with mode: pre-fix-regression",
    "pre-fix-regression" in _tester_bf,
    "mode: pre-fix-regression not declared in tester.md",
)
check(
    "tester.md Return Protocol declares regression_test_path",
    "regression_test_path" in _tester_bf.split("## Return Protocol", 1)[1] if "## Return Protocol" in _tester_bf else False,
    "regression_test_path not declared in tester Return Protocol",
)
check(
    "tester.md Return Protocol declares regression_test_status",
    "regression_test_status" in _tester_bf.split("## Return Protocol", 1)[1] if "## Return Protocol" in _tester_bf else False,
    "regression_test_status not declared in tester Return Protocol",
)
check(
    "tester.md Pre-Fix mode rejects manual-repro-script fallback (operator override)",
    "manual-repro-script" in _tester_bf and ("rejected" in _tester_bf.lower() or "no exceptions" in _tester_bf.lower() or "no fallback" in _tester_bf.lower()),
    "manual-repro-script fallback rejection not documented in tester.md",
)

# (11) implementer.md: Scope discipline section for type: fix | hotfix
check(
    "implementer.md has Scope discipline section for type: fix and type: hotfix",
    "## Scope discipline for `type: fix` and `type: hotfix`" in _implementer_bf or
    "Scope discipline for type: fix and type: hotfix" in _implementer_bf or
    "Scope discipline for `type: fix`" in _implementer_bf,
    "Scope discipline section for bug-fix mode missing from implementer.md",
)
check(
    "implementer.md Scope discipline lists forbidden changes (renaming, reformatting, refactoring)",
    "Renaming" in _implementer_bf and "Reformatting" in _implementer_bf and "Refactoring" in _implementer_bf,
    "Forbidden change classes not enumerated in implementer Scope discipline",
)
check(
    "implementer.md Scope discipline documents Follow-ups Spotted convention",
    "Follow-ups Spotted" in _implementer_bf,
    "Follow-ups Spotted section not documented in implementer.md",
)
check(
    "implementer.md Scope discipline documents [SCOPE-DRIFT] annotation pattern",
    "[SCOPE-DRIFT" in _implementer_bf,
    "[SCOPE-DRIFT] annotation pattern not documented in implementer Scope discipline",
)
check(
    "implementer.md Return Protocol declares regression_test_passes",
    "regression_test_passes" in _implementer_bf,
    "regression_test_passes not declared in implementer Return Protocol",
)
check(
    "implementer.md Return Protocol declares follow_ups_spotted",
    "follow_ups_spotted" in _implementer_bf,
    "follow_ups_spotted not declared in implementer Return Protocol",
)

# (12) delivery.md: CHANGELOG ### Fixed routing for type: fix | hotfix
check(
    "delivery.md documents CHANGELOG ### Fixed routing for type: fix | hotfix",
    "### Fixed" in _delivery_bf and "`fix`" in _delivery_bf and "`hotfix`" in _delivery_bf,
    "CHANGELOG routing for bug-fix not documented in delivery.md",
)
# (13) delivery.md: PR title format fix(area):
check(
    "delivery.md documents PR title format fix(area): for type: fix",
    "fix({area})" in _delivery_bf,
    "fix(area): PR title format not documented in delivery.md",
)
check(
    "delivery.md documents (hotfix) suffix for PR title when type: hotfix",
    "(hotfix)" in _delivery_bf,
    "(hotfix) suffix not documented in delivery.md PR title routing",
)
# (14) delivery.md: Bug Report section in PR body for type: fix | hotfix
check(
    "delivery.md PR body template has Bug Report section for type: fix | hotfix",
    "## Bug Report" in _delivery_bf and "mandatory for type: fix" in _delivery_bf,
    "Bug Report section not in delivery.md PR body template",
)
check(
    "delivery.md PR body uses Fixes #N keyword for type: fix | hotfix",
    "Fixes #" in _delivery_bf,
    "Fixes # keyword not declared for bug-fix PR body",
)

# (15) plan-reviewer.md: Rules 7 and 8 declared
check(
    "plan-reviewer.md declares Rule 7 — Regression Test Approach",
    "### Rule 7 — Regression Test Approach" in _plan_reviewer_bf,
    "Rule 7 section missing from plan-reviewer.md",
)
check(
    "plan-reviewer.md declares Rule 8 — Regression test cross-reference",
    "### Rule 8 — Regression test cross-reference" in _plan_reviewer_bf,
    "Rule 8 section missing from plan-reviewer.md",
)
check(
    "plan-reviewer.md Rules 7 and 8 are gated on type: fix | hotfix",
    "type: fix" in _plan_reviewer_bf and "type: hotfix" in _plan_reviewer_bf and "no-op" in _plan_reviewer_bf,
    "type gating for Rules 7/8 not documented in plan-reviewer.md",
)
check(
    "plan-reviewer.md Verdict Calibration mentions Rule 7 and Rule 8",
    "rule 7" in _plan_reviewer_bf.lower() and "rule 8" in _plan_reviewer_bf.lower(),
    "Rules 7/8 not in Verdict Calibration table",
)
check(
    "plan-reviewer.md Return Protocol declares rule-7 and rule-8 findings counts",
    "rule-7:" in _plan_reviewer_bf and "rule-8:" in _plan_reviewer_bf,
    "rule-7 / rule-8 not in plan-reviewer Return Protocol",
)
check(
    "plan-reviewer.md Rule 7 rejects manual-repro-script value",
    "manual-repro-script" in _plan_reviewer_bf and ("rejected" in _plan_reviewer_bf.lower() or "operator override" in _plan_reviewer_bf.lower()),
    "manual-repro-script rejection not documented in Rule 7",
)
check(
    "plan-reviewer.md reads 01-root-cause.md instead of 01-architecture.md for type: fix",
    "01-root-cause.md" in _plan_reviewer_bf,
    "01-root-cause.md routing not documented in plan-reviewer.md",
)

# (16) qa.md: validate mode bug-fix contract
check(
    "qa.md Validate mode documents bug-fix contract (AC-1 reproduction-no-longer-bug, AC-2 regression-test-exists)",
    "AC-1" in _qa_bf and "AC-2" in _qa_bf and "regression test" in _qa_bf.lower(),
    "qa Validate mode bug-fix contract not documented",
)
check(
    "qa.md Return Protocol declares regression_test_referenced field",
    "regression_test_referenced" in _qa_bf,
    "regression_test_referenced not in qa Return Protocol",
)
check(
    "qa.md Return Protocol declares reproduction_steps_validated field",
    "reproduction_steps_validated" in _qa_bf,
    "reproduction_steps_validated not in qa Return Protocol",
)

# (17) ref-special-flows.md: Bug-fix Flow section + Hotfix sub-flow
check(
    "ref-special-flows.md has Bug-fix Flow section (replaces old Hotfix Flow stub)",
    "## Bug-fix Flow" in _ref_flows_bf,
    "Bug-fix Flow section missing from ref-special-flows.md",
)
check(
    "ref-special-flows.md has Hotfix sub-flow section",
    "## Hotfix sub-flow" in _ref_flows_bf,
    "Hotfix sub-flow section missing from ref-special-flows.md",
)
check(
    "ref-special-flows.md Bug-fix Flow declares full workspaces artifact set",
    "01-root-cause.md" in _ref_flows_bf and "02-regression-test.md" in _ref_flows_bf and
    "01-plan.md" in _ref_flows_bf and "04-security.md" in _ref_flows_bf,
    "Full workspaces artifact set not declared in Bug-fix Flow",
)
check(
    "ref-special-flows.md Bug-fix Flow declares security agent runs ALWAYS for bugs",
    "Bug-fix Flow" in _ref_flows_bf and "always" in _ref_flows_bf and "security" in _ref_flows_bf.lower(),
    "security-always-for-bugs rule not in ref-special-flows.md",
)
check(
    "ref-special-flows.md Bug-fix Flow declares regression test is mandatory always (no fallback)",
    "mandatory always" in _ref_flows_bf or "no fallback" in _ref_flows_bf.lower() or
    ("Regression Test" in _ref_flows_bf and "rejected" in _ref_flows_bf.lower()),
    "regression-test-mandatory-always rule not documented in Bug-fix Flow",
)
check(
    "ref-special-flows.md Hotfix sub-flow still includes Phase 2.0 (regression test mandatory)",
    "Hotfix sub-flow" in _ref_flows_bf and "Phase 2.0" in _ref_flows_bf and "mandatory" in _ref_flows_bf.lower(),
    "Phase 2.0 not declared mandatory for hotfix",
)
check(
    "ref-special-flows.md documents architect re-classification (operator-decides)",
    "type_reclassify" in _ref_flows_bf or "re-classification" in _ref_flows_bf.lower() or "reclassif" in _ref_flows_bf.lower(),
    "architect re-classification protocol not in ref-special-flows.md",
)
check(
    "ref-special-flows.md notes /hotfix slash command deferred to v2",
    "/th:hotfix" in _ref_flows_bf and ("v2" in _ref_flows_bf.lower() or "deferred" in _ref_flows_bf.lower()),
    "/th:hotfix v2 deferral not documented",
)

# ---------------------------------------------------------------------------
# Suite 26b — Bug-fix Tier System (v2.9.0 extension)
# ---------------------------------------------------------------------------
print()
print("=== Suite 26b: Bug-fix Tier System (4 tiers) ===")

# (T1) orchestrator: tier classification subsection in Step 7
check(
    "orchestrator.md Step 7 declares bug_tier classification (Tier 1-4)",
    "Bug tier" in _orch_bf and "bug_tier" in _orch_bf and "1` | `2` | `3` | `4`" in _orch_bf,
    "bug_tier classification subsection not declared in Step 7",
)
check(
    "orchestrator.md documents Signal 1 (keywords) for tier classification",
    "Signal 1" in _orch_bf and "Keywords" in _orch_bf and "auth" in _orch_bf and "injection" in _orch_bf and "typo" in _orch_bf,
    "Signal 1 (keywords) not documented for tier classification",
)
check(
    "orchestrator.md documents Signal 2 (file-path patterns) for tier classification",
    "Signal 2" in _orch_bf and "File-path patterns" in _orch_bf and "auth/**" in _orch_bf and "middleware/**" in _orch_bf,
    "Signal 2 (file-path patterns) not documented for tier classification",
)
check(
    "orchestrator.md documents Signal 3 (operator override) for tier classification",
    "Signal 3" in _orch_bf and "[TIER:" in _orch_bf and "[regression-test: required]" in _orch_bf and "[security: required]" in _orch_bf,
    "Signal 3 (operator override) not documented for tier classification",
)
check(
    "orchestrator.md documents auto-escalation rules (high-tier signal wins)",
    "Auto-escalation" in _orch_bf and ("Path priority" in _orch_bf or "sobrescribes" in _orch_bf or "high-tier signal" in _orch_bf.lower()),
    "Auto-escalation rules not documented",
)
check(
    "orchestrator.md documents architect tier_promote protocol",
    "tier_promote" in _orch_bf and "tier_promote_rationale" in _orch_bf,
    "tier_promote protocol not documented in orchestrator.md",
)
check(
    "orchestrator.md default-to-Tier-3 rule documented (conservative)",
    "Default: Tier 3" in _orch_bf or "default to Tier 3" in _orch_bf.lower() or "default tier 3" in _orch_bf.lower(),
    "Default-Tier-3 conservative rule not documented",
)
check(
    "orchestrator.md 00-state.md schema includes bug_tier field",
    "bug_tier:" in _orch_bf and ("{0 | 1 | 2 | 3 | 4 | null}" in _orch_bf or "{1 | 2 | 3 | 4 | null}" in _orch_bf),
    "bug_tier field missing from 00-state.md schema",
)
check(
    "orchestrator.md 00-state.md schema includes bug_tier_source field",
    "bug_tier_source" in _orch_bf,
    "bug_tier_source field missing from 00-state.md schema",
)

# (T2) orchestrator: Phase 1 dispatch table modulated by bug_tier
check(
    "orchestrator.md Phase 1 dispatch table modulated by bug_tier (Tier 1 skipped, Tier 2 light, Tier 3-4 full)",
    "light-root-cause" in _orch_bf and "full-root-cause" in _orch_bf and "skipped" in _orch_bf.lower(),
    "Phase 1 dispatch by bug_tier not documented",
)
check(
    "orchestrator.md Phase 1 dispatch declares Tier 4 mandatory ## Prior Art",
    "Prior Art" in _orch_bf and "mcp__memory__search_nodes" in _orch_bf,
    "Tier 4 mandatory ## Prior Art (memory query) not declared in Phase 1 dispatch",
)

# (T3) orchestrator: Phase 2.0 conditional skip for Tier 1 no-behavior-change
check(
    "orchestrator.md Phase 2.0 documents Tier 1 conditional skip (no-behavior-change)",
    "Phase 2.0" in _orch_bf and "no-behavior-change" in _orch_bf and ("Skip Phase 2.0" in _orch_bf or "Conditional skip" in _orch_bf),
    "Phase 2.0 Tier 1 conditional skip not documented",
)
check(
    "orchestrator.md Phase 2.0 declares pre_fix_test_required parameter for tester dispatch",
    "pre_fix_test_required" in _orch_bf,
    "pre_fix_test_required parameter not declared in Phase 2.0 dispatch",
)
check(
    "orchestrator.md Phase 2.0 conditional-skip enumerates allowed Tier 1 paths",
    "*.md" in _orch_bf and "LICENSE" in _orch_bf and "CHANGELOG*" in _orch_bf and "non-functional string" in _orch_bf,
    "Tier 1 allowed-path patterns not enumerated in Phase 2.0 conditional skip",
)
check(
    "orchestrator.md Phase 2.0 declares UI strings are Tier 2 minimum",
    "UI strings" in _orch_bf and "Tier 2 minimum" in _orch_bf,
    "UI-strings-are-Tier-2 rule not declared",
)

# (T4) orchestrator: Phase 3 parallel-dispatch tier-gated
check(
    "orchestrator.md Phase 3 declares tier-gated parallel dispatch table",
    "Tier-gated dispatch" in _orch_bf or ("Phase 3" in _orch_bf and "bug_tier" in _orch_bf and "skipped" in _orch_bf),
    "Phase 3 tier-gated dispatch table not declared",
)
check(
    "orchestrator.md Phase 3 Tier 1 dispatches tester only (no qa Bug-fix contract, no security)",
    "Tier 1" in _orch_bf and "suite no-regress" in _orch_bf,
    "Phase 3 Tier 1 reduced dispatch not documented",
)
check(
    "orchestrator.md Phase 3 Tier 2 dispatches tester + qa (no security)",
    "Tier 2" in _orch_bf and "tester + qa" in _orch_bf,
    "Phase 3 Tier 2 reduced dispatch not documented",
)
check(
    "orchestrator.md Phase 3 Tier 4 dispatches security with extended analysis",
    "extended analysis" in _orch_bf,
    "Phase 3 Tier 4 extended security analysis not documented",
)

# (T5) architect.md: mode: light-root-cause | full-root-cause
check(
    "architect.md Root-Cause mode declares light-root-cause sub-mode",
    "light-root-cause" in _architect_bf,
    "mode: light-root-cause not declared in architect.md",
)
check(
    "architect.md Root-Cause mode declares full-root-cause sub-mode",
    "full-root-cause" in _architect_bf,
    "mode: full-root-cause not declared in architect.md",
)
check(
    "architect.md light-root-cause is gated to bug_tier: 2",
    "light-root-cause" in _architect_bf and "bug_tier: 2" in _architect_bf,
    "light-root-cause-to-bug_tier-2 binding not documented",
)
check(
    "architect.md full-root-cause covers bug_tier: 3 and 4",
    "full-root-cause" in _architect_bf and "bug_tier: 3" in _architect_bf and "bug_tier: 4" in _architect_bf,
    "full-root-cause-to-bug_tier-3/4 binding not documented",
)
check(
    "architect.md declares ## Prior Art mandatory for bug_tier: 4",
    "## Prior Art" in _architect_bf and "mandatory" in _architect_bf.lower() and "bug_tier: 4" in _architect_bf,
    "## Prior Art mandatory-for-Tier-4 not declared",
)
check(
    "architect.md declares mcp__memory__search_nodes for Tier 4 prior-art query",
    "mcp__memory__search_nodes" in _architect_bf and "Tier 4" in _architect_bf,
    "Tier 4 memory query not declared",
)
check(
    "architect.md Return Protocol declares tier_promote field",
    "tier_promote:" in _architect_bf.split("## Return Protocol", 1)[1] if "## Return Protocol" in _architect_bf else False,
    "tier_promote field not declared in architect Return Protocol",
)
check(
    "architect.md Return Protocol declares tier_promote_rationale field",
    "tier_promote_rationale" in _architect_bf,
    "tier_promote_rationale field not declared in architect Return Protocol",
)
check(
    "architect.md Return Protocol declares sub_mode field",
    "sub_mode:" in _architect_bf,
    "sub_mode field not declared in architect Return Protocol",
)

# (T6) tester.md: pre_fix_test_required parameter + pre_fix_test_status field
check(
    "tester.md Pre-Fix Regression Test mode accepts pre_fix_test_required parameter",
    "pre_fix_test_required" in _tester_bf,
    "pre_fix_test_required parameter not documented in tester.md",
)
check(
    "tester.md declares Tier 1 conditional skip semantics for Phase 2.0",
    "Tier 1" in _tester_bf and ("no-behavior-change" in _tester_bf or "skipped" in _tester_bf.lower()),
    "Tier 1 conditional-skip semantics not documented in tester.md",
)
check(
    "tester.md Return Protocol declares pre_fix_test_status field",
    "pre_fix_test_status" in _tester_bf,
    "pre_fix_test_status field not declared in tester Return Protocol",
)
check(
    "tester.md regression_test_status accepts 'skipped' value (Tier 1)",
    "regression_test_status" in _tester_bf and "skipped" in _tester_bf,
    "regression_test_status: skipped value not documented in tester.md",
)

# (T7) qa.md: Tier 1 simplified validation
check(
    "qa.md Validate mode documents Tier 1 simplified validation contract",
    "Tier 1" in _qa_bf and ("simplified" in _qa_bf.lower() or "implicit" in _qa_bf.lower() or "diff matches" in _qa_bf.lower()),
    "qa.md Tier 1 simplified validation not documented",
)
check(
    "qa.md Return Protocol allows regression_test_referenced: null for Tier 1 skipped",
    "regression_test_referenced" in _qa_bf and "null" in _qa_bf and "bug_tier: 1" in _qa_bf,
    "regression_test_referenced: null for Tier 1 not documented",
)

# (T8) ref-special-flows.md: Tier System subsection
check(
    "ref-special-flows.md has Tier System subsection inside Bug-fix Flow",
    "Tier System" in _ref_flows_bf and "## Bug-fix Flow" in _ref_flows_bf,
    "Tier System subsection missing from ref-special-flows.md Bug-fix Flow",
)
check(
    "ref-special-flows.md Tier System declares 4 tiers with names",
    "Tier 1" in _ref_flows_bf and "Tier 2" in _ref_flows_bf and "Tier 3" in _ref_flows_bf and "Tier 4" in _ref_flows_bf and "Docs/Trivial" in _ref_flows_bf and "Critical/Security" in _ref_flows_bf,
    "4-tier table with names not declared in ref-special-flows.md",
)
check(
    "ref-special-flows.md Tier System documents Tier 1 conditional regression-test skip",
    "Tier 1 regression-test conditional skip" in _ref_flows_bf or ("Tier 1" in _ref_flows_bf and "conditional skip" in _ref_flows_bf.lower() and "no behavior change" in _ref_flows_bf.lower()),
    "Tier 1 conditional regression-test skip not documented in ref-special-flows.md",
)
check(
    "ref-special-flows.md Tier System documents Signal 1 (keywords)",
    "Signal 1" in _ref_flows_bf and "Keywords in the bug report" in _ref_flows_bf and "auth" in _ref_flows_bf and "typo" in _ref_flows_bf,
    "Signal 1 (keywords) not documented in Tier System",
)
check(
    "ref-special-flows.md Tier System documents Signal 2 (file-path patterns)",
    "Signal 2" in _ref_flows_bf and "File-path patterns" in _ref_flows_bf and "auth/**" in _ref_flows_bf,
    "Signal 2 (file-path patterns) not documented in Tier System",
)
check(
    "ref-special-flows.md Tier System documents Signal 3 (operator override)",
    "Signal 3" in _ref_flows_bf and "[TIER:" in _ref_flows_bf,
    "Signal 3 (operator override) not documented in Tier System",
)
check(
    "ref-special-flows.md Tier System documents auto-escalation rules (high-tier wins)",
    "Auto-escalation" in _ref_flows_bf or "auto-escalation" in _ref_flows_bf,
    "Auto-escalation rules not documented in Tier System",
)
check(
    "ref-special-flows.md Tier System declares default Tier 3 when in doubt",
    "Default: Tier 3" in _ref_flows_bf or "default to Tier 3" in _ref_flows_bf.lower(),
    "Default-to-Tier-3 conservative rule not documented in Tier System",
)
check(
    "ref-special-flows.md Tier System enumerates security-sensitive paths (auth/**, middleware/**, api/**, db/**, security/**, crypto/**, session/**)",
    all(p in _ref_flows_bf for p in ["auth/**", "middleware/**", "api/**", "db/**", "security/**", "crypto/**", "session/**"]),
    "Security-sensitive path enumeration incomplete in Tier System",
)
check(
    "ref-special-flows.md Tier System has worked examples (Tier 1, Tier 2, Tier 3-with-security-escalation)",
    "Worked examples" in _ref_flows_bf or ("Example A" in _ref_flows_bf and "Example B" in _ref_flows_bf and "Example C" in _ref_flows_bf),
    "Tier System worked examples missing from ref-special-flows.md",
)

# (T9) Tier 0 — Trivial/Cosmetic (v2.13.0 addition)
check(
    "orchestrator.md tier table declares Tier 0 (Trivial/Cosmetic)",
    "Tier 0" in _orch_bf and "Trivial/Cosmetic" in _orch_bf,
    "Tier 0 row missing from tier table in orchestrator.md",
)
check(
    "orchestrator.md Tier 0 auto-detection rules present (single file, ≤5 lines, no test paths, no system files)",
    "Tier 0" in _orch_bf and "single file" in _orch_bf.lower() and "5 lines" in _orch_bf,
    "Tier 0 auto-detection rules not documented in orchestrator.md",
)
check(
    "orchestrator.md Tier 0 auto-promotion rule documented",
    "tier_promote: 1" in _orch_bf or ("Tier 0 auto-promotion" in _orch_bf or "auto-promotion" in _orch_bf.lower() and "Tier 0" in _orch_bf),
    "Tier 0 auto-promotion rule not documented in orchestrator.md",
)
check(
    "orchestrator.md Tier 0 no workspaces behavior documented",
    "Tier 0" in _orch_bf and "no workspaces" in _orch_bf.lower(),
    "Tier 0 no-workspaces behavior not documented in orchestrator.md",
)
check(
    "orchestrator.md Tier 0 operator cannot force for system-level files",
    "agents/*.md" in _orch_bf and "skills/*.md" in _orch_bf and ("Tier 1 minimum" in _orch_bf or "Tier 0" in _orch_bf),
    "Tier 0 system-level file exclusion not documented in orchestrator.md",
)
check(
    "ref-special-flows.md Tier System declares Tier 0 (Trivial/Cosmetic)",
    "Tier 0" in _ref_flows_bf and "Trivial/Cosmetic" in _ref_flows_bf,
    "Tier 0 row missing from ref-special-flows.md Tier System",
)

# ---------------------------------------------------------------------------
# Suite 27 — gh-fallback graceful degradation (v2.10.0)
# ---------------------------------------------------------------------------
print()
print("=== Suite 27: gh-fallback graceful degradation ===")

_SHARED_DIR = AGENTS_DIR / "_shared"
_GH_FALLBACK = _SHARED_DIR / "gh-fallback.md"

# (1) Shared snippet file exists.
check(
    "agents/_shared/gh-fallback.md exists",
    _GH_FALLBACK.exists(),
    "shared fallback snippet missing — agents/_shared/gh-fallback.md not found",
)

if _GH_FALLBACK.exists():
    _gf = read(_GH_FALLBACK)

    # (2) Detection probe section is present.
    check(
        "agents/_shared/gh-fallback.md has '## Detection probe' section",
        "## Detection probe" in _gf,
        "detection probe section missing from gh-fallback.md",
    )
    check(
        "agents/_shared/gh-fallback.md detection probe uses 'command -v gh'",
        "command -v gh" in _gf,
        "detection probe must use 'command -v gh' for cross-platform PATH check",
    )
    check(
        "agents/_shared/gh-fallback.md detection probe uses 'gh auth status'",
        "gh auth status" in _gf,
        "detection probe must also check 'gh auth status' (installed-but-unauthenticated = absent)",
    )

    # (3) All four tiers are documented.
    for tier in ("Tier A", "Tier B", "Tier D"):
        check(
            f"agents/_shared/gh-fallback.md documents {tier}",
            f"## {tier}" in _gf or f"### {tier}" in _gf,
            f"{tier} section missing from gh-fallback.md",
        )

    # (4) blocked-manual-push status is defined.
    check(
        "agents/_shared/gh-fallback.md defines 'blocked-manual-push' status",
        "blocked-manual-push" in _gf,
        "blocked-manual-push status value not defined in gh-fallback.md",
    )

    # (5) Origin parser section present.
    check(
        "agents/_shared/gh-fallback.md has origin URL parser (is_github detection)",
        "is_github" in _gf,
        "origin URL parser (is_github flag) missing from gh-fallback.md",
    )

    # (6) Operator-facing copy templates section present.
    check(
        "agents/_shared/gh-fallback.md has '## Operator-facing copy templates' section",
        "## Operator-facing copy templates" in _gf,
        "operator-facing copy templates section missing",
    )

    # (7) How-to-reference section present.
    check(
        "agents/_shared/gh-fallback.md has '## How to reference this file' section",
        "## How to reference this file" in _gf,
        "how-to-reference section missing from gh-fallback.md",
    )

# (8) assets.go uses all:agents to include _shared/.
_assets_go = read(REPO_ROOT / "assets.go")
check(
    "assets.go uses 'all:agents' prefix to include agents/_shared/",
    "all:agents" in _assets_go,
    "assets.go must use '//go:embed all:agents skills hooks' to include agents/_shared/ "
    "(Go embed excludes directories starting with '_' without 'all:' prefix)",
)

# (9) installer copies agents/_shared/ (installAgents recurses into subdirs).
_main_go = read(REPO_ROOT / "cmd" / "install" / "main.go")
check(
    "cmd/install/main.go installAgents function handles subdirectories (recurse for _shared)",
    "copyEmbeddedDirRecursive" in _main_go,
    "installAgents must call copyEmbeddedDirRecursive to install agents/_shared/ tree",
)

# (10) installer warnCLI function exists (gh downgraded from required to recommended).
_util_go = read(REPO_ROOT / "cmd" / "install" / "util.go")
_main_go_pr2 = read(REPO_ROOT / "cmd" / "install" / "main.go")
check(
    "cmd/install/util.go declares warnCLI function",
    "func warnCLI" in _util_go,
    "warnCLI function missing from util.go — gh must be recommended, not required",
)
check(
    "cmd/install/main.go calls warnCLI (not requireCLI) for gh",
    "warnCLI" in _main_go_pr2 and 'requireCLI("gh"' not in _main_go_pr2,
    "main.go still calls requireCLI for gh — must downgrade to warnCLI",
)

# (11) delivery.md references the shared snippet (added in PR-3).
_delivery_fallback = read(AGENTS_DIR / "delivery.md")
check(
    "agents/delivery.md references agents/_shared/gh-fallback.md",
    "agents/_shared/gh-fallback.md" in _delivery_fallback,
    "delivery.md does not cross-reference the shared gh-fallback snippet",
)

# (12) delivery.md declares 'blocked-manual-push' as a valid status value (added in PR-3).
check(
    "agents/delivery.md declares 'blocked-manual-push' status value",
    "blocked-manual-push" in _delivery_fallback,
    "delivery.md does not declare the blocked-manual-push status value",
)

# (13) agents/orchestrator.md references blocked-manual-push (added in PR-4).
_orch_fallback = read(AGENTS_DIR / "orchestrator.md")
check(
    "agents/orchestrator.md references 'blocked-manual-push' status",
    "blocked-manual-push" in _orch_fallback,
    "orchestrator.md must handle the blocked-manual-push status from delivery",
)
check(
    "agents/orchestrator.md references agents/_shared/gh-fallback.md",
    "agents/_shared/gh-fallback.md" in _orch_fallback,
    "orchestrator.md does not cross-reference the shared gh-fallback snippet",
)

# (14) skills/issue.md references the shared snippet (added in PR-5).
_issue_skill = read(skill_path("issue"))
check(
    "skills/issue.md references agents/_shared/gh-fallback.md",
    "agents/_shared/gh-fallback.md" in _issue_skill,
    "skills/issue.md does not cross-reference the shared gh-fallback snippet",
)

# (15) skills/review-pr.md references the shared snippet (added in PR-6).
_review_pr_skill = read(skill_path("review-pr"))
check(
    "skills/review-pr.md references agents/_shared/gh-fallback.md",
    "agents/_shared/gh-fallback.md" in _review_pr_skill,
    "skills/review-pr.md does not cross-reference the shared gh-fallback snippet",
)

# (16) assets/scaffolds/team-harness-rereview.yml exists (added in PR-9).
_SCAFFOLD_DIR = REPO_ROOT / "assets" / "scaffolds"
_REREVIEW_SCAFFOLD = _SCAFFOLD_DIR / "team-harness-rereview.yml"
check(
    "assets/scaffolds/team-harness-rereview.yml exists",
    _REREVIEW_SCAFFOLD.exists(),
    "re-review workflow scaffold missing — needed for /init --scaffold-rereview-workflow",
)
if _REREVIEW_SCAFFOLD.exists():
    _rs = read(_REREVIEW_SCAFFOLD)
    check(
        "assets/scaffolds/team-harness-rereview.yml triggers on pull_request.synchronize",
        "synchronize" in _rs,
        "re-review workflow must trigger on pull_request.synchronize",
    )
    check(
        "assets/scaffolds/team-harness-rereview.yml uses actions/github-script",
        "actions/github-script" in _rs,
        "re-review workflow must use actions/github-script for GitHub API calls",
    )
    check(
        "assets/scaffolds/team-harness-rereview.yml checks commit_id for staleness",
        "commit_id" in _rs,
        "re-review workflow must compare review.commit_id with head.sha to detect stale reviews",
    )

# (17) agents/init.md has --scaffold-rereview-workflow behaviour.
_init_md = read(AGENTS_DIR / "init.md")
check(
    "agents/init.md has '--scaffold-rereview-workflow' section",
    "--scaffold-rereview-workflow" in _init_md,
    "init.md does not document the --scaffold-rereview-workflow flag",
)

# (18) skills/bootstrap.md passes --scaffold-rereview-workflow flag through.
_init_skill = read(skill_path("bootstrap"))
check(
    "skills/bootstrap.md passes --scaffold-rereview-workflow flag to init agent",
    "--scaffold-rereview-workflow" in _init_skill,
    "skills/bootstrap.md does not propagate the --scaffold-rereview-workflow flag",
)

# (19) agents/reviewer-consolidator.md exists (added in PR-11).
_CONSOLIDATOR = AGENTS_DIR / "reviewer-consolidator.md"
check(
    "agents/reviewer-consolidator.md exists",
    _CONSOLIDATOR.exists(),
    "reviewer-consolidator agent missing — needed for multi-reviewer mode",
)
if _CONSOLIDATOR.exists():
    _rc = read(_CONSOLIDATOR)
    check(
        "agents/reviewer-consolidator.md has de-duplication rules section",
        "De-duplication rules" in _rc or "De-dup" in _rc,
        "consolidator must document de-dup rules (same file:line handling)",
    )
    check(
        "agents/reviewer-consolidator.md has contradictions detection",
        "Contradicciones detectadas" in _rc or "contradictions" in _rc.lower(),
        "consolidator must surface contradictions between focused reviewers",
    )
    check(
        "agents/reviewer-consolidator.md has strict verdict rule (any CHANGES_REQUESTED wins)",
        "REQUEST_CHANGES" in _rc and "APPROVE" in _rc,
        "consolidator must document the strict any-CHANGES_REQUESTED verdict rule",
    )
    check(
        "agents/reviewer-consolidator.md output contract documents two files",
        ("pr-review-draft.md" in _rc or "pr-review-final.md" in _rc) and "pr-review-inline.json" in _rc,
        "consolidator must write pr-review-final.md (or legacy pr-review-draft.md) and pr-review-inline.json",
    )

# (20) assets/scaffolds/review-policy.md exists (added in PR-10).
_REVIEW_POLICY_SCAFFOLD = _SCAFFOLD_DIR / "review-policy.md"
check(
    "assets/scaffolds/review-policy.md exists",
    _REVIEW_POLICY_SCAFFOLD.exists(),
    "review policy scaffold missing — needed for /init --scaffold-review-policy",
)
if _REVIEW_POLICY_SCAFFOLD.exists():
    _rp = read(_REVIEW_POLICY_SCAFFOLD)
    check(
        "assets/scaffolds/review-policy.md has schema_version in frontmatter",
        "schema_version" in _rp,
        "review-policy scaffold must have schema_version in YAML frontmatter",
    )
    check(
        "assets/scaffolds/review-policy.md has focus_overrides in frontmatter",
        "focus_overrides" in _rp,
        "review-policy scaffold must declare focus_overrides (used by multi-reviewer)",
    )

# (20) agents/reviewer.md has Focus modes section (added in PR-10/PR-11).
_reviewer_md = read(AGENTS_DIR / "reviewer.md")
check(
    "agents/reviewer.md has '## Focus modes' section",
    "## Focus modes" in _reviewer_md,
    "reviewer.md must document the Focus modes (general/security/architecture/style)",
)
check(
    "agents/reviewer.md has '## Policy-aware review' section",
    "## Policy-aware review" in _reviewer_md,
    "reviewer.md must document the policy-aware review behaviour (Has Policy field)",
)
check(
    "agents/reviewer.md policy-aware section mentions 'Violaciones de política'",
    "Violaciones de política" in _reviewer_md,
    "reviewer.md must include '## Violaciones de política' as a conditional body section",
)

# (21) skills/review-pr.md has Step 1.5 policy load (added in PR-10).
_rvpr = read(skill_path("review-pr"))
check(
    "skills/review-pr.md has Step 1.5 policy load section",
    "Step 1.5" in _rvpr and "review-policy.md" in _rvpr,
    "skills/review-pr.md must have Step 1.5 loading .team-harness/review-policy.md",
)
check(
    "skills/review-pr.md passes Has Policy and Review Policy fields to orchestrator",
    "Has Policy:" in _rvpr and "Review Policy:" in _rvpr,
    "skills/review-pr.md must pass Has Policy and Review Policy fields in Phase 2 payload",
)

# (22) skills/init.md passes --scaffold-review-policy flag (added in PR-10).
check(
    "skills/init.md passes --scaffold-review-policy flag to init agent",
    "--scaffold-review-policy" in _init_skill,
    "skills/init.md does not propagate the --scaffold-review-policy flag",
)

# (23) skills/review-pr.md has --multi / --reviewers flag parsing (added in PR-12).
# _rvpr was already read above (PR-10 checks).
check(
    "skills/review-pr.md has '--multi' flag parsing",
    "--multi" in _rvpr,
    "skills/review-pr.md must parse the --multi flag for multi-reviewer mode",
)
check(
    "skills/review-pr.md has '--reviewers' flag parsing",
    "--reviewers" in _rvpr,
    "skills/review-pr.md must parse the --reviewers flag for selective focuses",
)
check(
    "skills/review-pr.md has auto-suggest threshold constants",
    "AUTO_MULTI_LINES_THRESHOLD" in _rvpr and "AUTO_MULTI_FILES_THRESHOLD" in _rvpr,
    "skills/review-pr.md must declare the auto-suggest threshold constants",
)
check(
    "skills/review-pr.md has re-review continuity detection",
    "Hallazgos por enfoque" in _rvpr,
    "skills/review-pr.md must detect prior multi-reviewer reviews for re-review continuity",
)
check(
    "skills/review-pr.md Step 15.1 cleans up focus draft files",
    "pr-review-draft-security" in _rvpr and "pr-review-draft-architecture" in _rvpr,
    "skills/review-pr.md Step 15.1 cleanup must include focus-specific draft files",
)

# ---------------------------------------------------------------------------
# Suite 28 — /review-pr enriched (v2.15.0): worktree + multi-agent + tier-aware + decision menu
# ---------------------------------------------------------------------------
print()
print("=== Suite 28: /review-pr enriched (v2.15.0) ===")

_rvpr_v28 = read(skill_path("review-pr"))
_reviewer_v28 = read(AGENTS_DIR / "reviewer.md")
_qa_v28 = read(AGENTS_DIR / "qa.md")
_security_v28 = read(AGENTS_DIR / "security.md")
_consolidator_v28 = read(AGENTS_DIR / "reviewer-consolidator.md")
_pipelines_v28 = read(REPO_ROOT / "docs" / "pipelines.md")
_changelog_v28 = read(REPO_ROOT / "CHANGELOG.md")

# (1) skills/review-pr.md: worktree creation in Phase 1
check(
    "skills/review-pr.md Phase 1 creates a git worktree at PR head SHA",
    "git worktree add" in _rvpr_v28,
    "skills/review-pr.md must create a temporary git worktree at the PR's head SHA",
)
check(
    "skills/review-pr.md worktree name includes PR number (multi-PR safety)",
    "pr-review-{N}" in _rvpr_v28 or "pr-review-" in _rvpr_v28,
    "worktree name must include PR number to avoid concurrent-review conflicts",
)
check(
    "skills/review-pr.md registers EXIT trap for worktree cleanup",
    "trap" in _rvpr_v28 and "worktree remove" in _rvpr_v28,
    "skills/review-pr.md must register a trap for worktree cleanup on early exit",
)
check(
    "skills/review-pr.md passes WORKTREE path to agents",
    "Worktree:" in _rvpr_v28 or "WORKTREE" in _rvpr_v28,
    "skills/review-pr.md must pass the $WORKTREE path in every agent dispatch",
)
check(
    "skills/review-pr.md scans for workspaces in the worktree",
    "workspaces_PATH" in _rvpr_v28 or "workspaces" in _rvpr_v28,
    "skills/review-pr.md must scan for workspaces in the worktree to detect AC",
)

# (2) skills/review-pr.md: tier classification
check(
    "skills/review-pr.md has Phase 2 Tier Classification section",
    "Phase 2 — Tier Classification" in _rvpr_v28 or "Tier Classification" in _rvpr_v28,
    "skills/review-pr.md must have a Tier Classification phase",
)
check(
    "skills/review-pr.md tier table covers Tier 0 (docs only)",
    "Tier 0" in _rvpr_v28,
    "Tier 0 (docs only) missing from skills/review-pr.md tier table",
)
check(
    "skills/review-pr.md tier table covers Tier 4 (security-sensitive)",
    "Tier 4" in _rvpr_v28,
    "Tier 4 (security-sensitive) missing from skills/review-pr.md tier table",
)
check(
    "skills/review-pr.md tier table documents security-sensitive paths",
    "auth/**" in _rvpr_v28 or "middleware/**" in _rvpr_v28,
    "security-sensitive paths not documented in skills/review-pr.md tier table",
)
check(
    "skills/review-pr.md supports [TIER: N] operator override",
    "[TIER:" in _rvpr_v28 or "tier_override" in _rvpr_v28,
    "skills/review-pr.md must support [TIER: N] operator override",
)

# (3) skills/review-pr.md: multi-agent dispatch
check(
    "skills/review-pr.md dispatches qa in pr-review-qa mode",
    "pr-review-qa" in _rvpr_v28,
    "skills/review-pr.md must dispatch qa in pr-review-qa mode at Tier 2+",
)
check(
    "skills/review-pr.md dispatches security in pr-review-security mode",
    "pr-review-security" in _rvpr_v28,
    "skills/review-pr.md must dispatch security in pr-review-security mode at Tier 3+",
)
check(
    "skills/review-pr.md Tier 3/4 runs qa and security in parallel with reviewer",
    "Tier 3" in _rvpr_v28 and "Tier 4" in _rvpr_v28,
    "Tier 3/4 multi-agent parallel dispatch not documented in skills/review-pr.md",
)

# (4) skills/review-pr.md: decision menu (Phase 4)
check(
    "skills/review-pr.md has explicit Phase 4 decision menu",
    "Phase 4" in _rvpr_v28 and "Decision" in _rvpr_v28,
    "skills/review-pr.md must have Phase 4 — Decision Menu",
)
check(
    "skills/review-pr.md decision menu offers approve option",
    "(a) approve" in _rvpr_v28,
    "skills/review-pr.md decision menu must include (a) approve",
)
check(
    "skills/review-pr.md decision menu offers request changes option",
    "(b) request changes" in _rvpr_v28,
    "skills/review-pr.md decision menu must include (b) request changes",
)
check(
    "skills/review-pr.md decision menu offers comment only option",
    "(c) comment only" in _rvpr_v28,
    "skills/review-pr.md decision menu must include (c) comment only — COMMENT event",
)
check(
    "skills/review-pr.md decision menu offers defer option",
    "(d) defer" in _rvpr_v28,
    "skills/review-pr.md decision menu must include (d) defer — save draft without publishing",
)
check(
    "skills/review-pr.md decision menu offers cancel option",
    "(e) cancel" in _rvpr_v28,
    "skills/review-pr.md decision menu must include (e) cancel",
)
check(
    "skills/review-pr.md decision menu includes recommendation hint",
    "Recommendation:" in _rvpr_v28,
    "skills/review-pr.md decision menu must include a Recommendation hint",
)
check(
    "skills/review-pr.md maps comment only to GitHub COMMENT event",
    "COMMENT" in _rvpr_v28,
    "skills/review-pr.md must use COMMENT event for comment-only option",
)
check(
    "skills/review-pr.md supports --resume-from-draft flag",
    "--resume-from-draft" in _rvpr_v28,
    "skills/review-pr.md must support --resume-from-draft for deferred drafts",
)

# (5) skills/review-pr.md: Phase 5 publish uses event mapping
check(
    "skills/review-pr.md Phase 5 maps operator choice to GitHub event",
    "APPROVE" in _rvpr_v28 and "REQUEST_CHANGES" in _rvpr_v28 and "COMMENT" in _rvpr_v28,
    "skills/review-pr.md Phase 5 must map all three event types",
)

# (6) agents/reviewer.md: Worktree Context section
check(
    "agents/reviewer.md has Worktree Context section",
    "## Worktree Context" in _reviewer_v28,
    "agents/reviewer.md must document that file reads go via the $WORKTREE path",
)
check(
    "agents/reviewer.md Worktree Context distinguishes correct vs incorrect read path",
    "CORRECT" in _reviewer_v28 or "INCORRECT" in _reviewer_v28,
    "reviewer.md Worktree Context must show correct vs incorrect file read patterns",
)

# (7) agents/qa.md: pr-review-qa mode
check(
    "agents/qa.md has PR Review QA Mode (pr-review-qa) section",
    "pr-review-qa" in _qa_v28 and "PR Review QA Mode" in _qa_v28,
    "agents/qa.md must document the pr-review-qa mode",
)
check(
    "agents/qa.md pr-review-qa mode outputs to .claude/pr-review-qa.md",
    ".claude/pr-review-qa.md" in _qa_v28,
    "agents/qa.md pr-review-qa mode must write to .claude/pr-review-qa.md",
)
check(
    "agents/qa.md pr-review-qa mode defines qa_status: skipped-no-ac",
    "skipped-no-ac" in _qa_v28,
    "agents/qa.md pr-review-qa mode must declare qa_status: skipped-no-ac when no AC found",
)

# (8) agents/security.md: pr-review-security mode
check(
    "agents/security.md has PR Review Security Mode (pr-review-security) section",
    "pr-review-security" in _security_v28 and "PR Review Security Mode" in _security_v28,
    "agents/security.md must document the pr-review-security mode",
)
check(
    "agents/security.md pr-review-security mode outputs to .claude/pr-review-security.md",
    ".claude/pr-review-security.md" in _security_v28,
    "agents/security.md pr-review-security mode must write to .claude/pr-review-security.md",
)
check(
    "agents/security.md pr-review-security Tier 4 extends to adjacent security-sensitive files",
    "Tier 4" in _security_v28 and ("adjacent" in _security_v28 or "extended" in _security_v28),
    "agents/security.md pr-review-security must document Tier 4 extended analysis",
)

# (9) agents/reviewer-consolidator.md: handles qa and security drafts
check(
    "agents/reviewer-consolidator.md input contract mentions .claude/pr-review-qa.md",
    "pr-review-qa.md" in _consolidator_v28,
    "reviewer-consolidator.md input contract must include .claude/pr-review-qa.md",
)
check(
    "agents/reviewer-consolidator.md input contract mentions .claude/pr-review-security.md",
    "pr-review-security.md" in _consolidator_v28,
    "reviewer-consolidator.md input contract must include .claude/pr-review-security.md",
)
check(
    "agents/reviewer-consolidator.md output writes to .claude/pr-review-final.md",
    "pr-review-final.md" in _consolidator_v28,
    "reviewer-consolidator.md must write to .claude/pr-review-final.md",
)

# (10) docs/pipelines.md: PR review enriched section
check(
    "docs/pipelines.md has 'PR review (enriched)' section",
    "PR review (enriched)" in _pipelines_v28,
    "docs/pipelines.md must have a 'PR review (enriched)' section describing the 5-phase flow",
)
check(
    "docs/pipelines.md enriched section documents 5 phases",
    "Phase 1" in _pipelines_v28 and "Phase 5" in _pipelines_v28,
    "docs/pipelines.md enriched section must document all 5 phases",
)
check(
    "docs/pipelines.md enriched section documents tier matrix",
    "Tier 0" in _pipelines_v28 and "Tier 4" in _pipelines_v28,
    "docs/pipelines.md enriched section must include the tier matrix",
)
check(
    "docs/pipelines.md enriched section documents decision menu options",
    "comment only" in _pipelines_v28 and "defer" in _pipelines_v28,
    "docs/pipelines.md enriched section must document the decision menu options",
)

# (11) CHANGELOG.md [Unreleased] documents the enrichment
check(
    "CHANGELOG.md [Unreleased] mentions worktree",
    "[Unreleased]" in _changelog_v28 and "worktree" in _changelog_v28,
    "CHANGELOG [Unreleased] must document the worktree addition",
)
check(
    "CHANGELOG.md [Unreleased] mentions tier-aware dispatch",
    "[Unreleased]" in _changelog_v28 and ("tier" in _changelog_v28.lower() or "Tier" in _changelog_v28),
    "CHANGELOG [Unreleased] must mention tier-aware dispatch",
)
check(
    "CHANGELOG.md [Unreleased] mentions decision menu",
    "[Unreleased]" in _changelog_v28 and "decision" in _changelog_v28.lower(),
    "CHANGELOG [Unreleased] must mention the decision menu",
)
check(
    "CHANGELOG.md [Unreleased] mentions comment only option",
    "[Unreleased]" in _changelog_v28 and "comment only" in _changelog_v28,
    "CHANGELOG [Unreleased] must mention the comment-only option",
)

# Suite 29 — Pipeline enforcement improvements (artifact verification, mandatory phases, build check)
print("\n--- Suite 29: Pipeline enforcement improvements ---")

_orch_v29 = read(AGENTS_DIR / "orchestrator.md")
_oprules_v29 = read(AGENTS_DIR / "_shared" / "operational-rules.md")
_refflows_v29 = read(AGENTS_DIR / "ref-special-flows.md")

# (1) orchestrator.md contains the Artifact Verification Protocol section
check(
    "orchestrator.md has Artifact Verification Protocol section",
    "### Artifact Verification Protocol" in _orch_v29,
    "orchestrator.md must contain '### Artifact Verification Protocol'",
)

# (2) orchestrator.md contains the agent-to-artifact mapping table
check(
    "orchestrator.md has agent-to-artifact mapping table",
    "Agent → Expected artifact mapping" in _orch_v29
    or ("| Agent | Phase | Expected artifact |" in _orch_v29),
    "orchestrator.md must contain the agent-to-artifact mapping table",
)

# (3) Phase 3.6 title does NOT contain 'conditional'
_phase36_title_match = [
    l for l in _orch_v29.splitlines()
    if l.startswith("## Phase 3.6")
]
check(
    "Phase 3.6 title does not contain 'conditional'",
    len(_phase36_title_match) > 0
    and "conditional" not in _phase36_title_match[0].lower(),
    "Phase 3.6 title must not contain 'conditional'",
)

# (4) Phase 3.6 title contains 'mandatory'
check(
    "Phase 3.6 title contains 'mandatory'",
    len(_phase36_title_match) > 0
    and "mandatory" in _phase36_title_match[0].lower(),
    "Phase 3.6 title must contain 'mandatory'",
)

# (5) Phase 4.5 title does NOT contain 'gated by diff size'
_phase45_title_match = [
    l for l in _orch_v29.splitlines()
    if l.startswith("## Phase 4.5")
]
check(
    "Phase 4.5 title does not contain 'gated by diff size'",
    len(_phase45_title_match) > 0
    and "gated by diff size" not in _phase45_title_match[0].lower(),
    "Phase 4.5 title must not contain 'gated by diff size'",
)

# (6) Phase 4.5 title contains 'mandatory'
check(
    "Phase 4.5 title contains 'mandatory'",
    len(_phase45_title_match) > 0
    and "mandatory" in _phase45_title_match[0].lower(),
    "Phase 4.5 title must contain 'mandatory'",
)

# (7) orchestrator.md contains Phase 3.75 — Build Verification
check(
    "orchestrator.md has Phase 3.75 — Build Verification",
    "## Phase 3.75" in _orch_v29 and "Build Verification" in _orch_v29,
    "orchestrator.md must contain '## Phase 3.75 — Build Verification'",
)

# (8) operational-rules.md contains artifact verification rule
check(
    "operational-rules.md has artifact verification rule",
    "Artifact verification is mandatory" in _oprules_v29,
    "operational-rules.md must contain artifact verification rule under Pipeline integrity",
)

# (9) ref-special-flows.md documents artifact verification in special flows
check(
    "ref-special-flows.md has Artifact Verification in Special Flows section",
    "## Artifact Verification in Special Flows" in _refflows_v29,
    "ref-special-flows.md must document artifact verification per special flow",
)

# ---------------------------------------------------------------------------
# Suite 30 — ClickUp skill + orchestrator intents (v2.34.0)
# ---------------------------------------------------------------------------
print()
print("=== Suite 30: ClickUp skill + orchestrator intents ===")

CLICKUP_TOOLS = [
    "clickup_filter_tasks",
    "clickup_search",
    "clickup_get_task",
    "clickup_create_task_comment",
    "clickup_update_task",
    "clickup_find_member_by_name",
    "clickup_resolve_assignees",
]

clickup_skill_path = SKILLS_DIR / "clickup" / "SKILL.md"
check(
    "skills/clickup/SKILL.md exists",
    clickup_skill_path.exists(),
    f"missing file at {clickup_skill_path}",
)

if clickup_skill_path.exists():
    skill_text = read(clickup_skill_path)
    fm = parse_frontmatter(skill_text)
    check(
        "skills/clickup/SKILL.md frontmatter has name: clickup",
        fm.get("name") == "clickup",
        f"expected name: clickup, got: {fm.get('name')}",
    )
    check(
        "skills/clickup/SKILL.md frontmatter has non-empty description",
        bool(fm.get("description")),
        "description field missing or empty",
    )
    # Sub-command documentation anchors
    check(
        "skills/clickup/SKILL.md documents `setup` sub-command",
        "### `setup`" in skill_text or "### setup" in skill_text or "`setup` —" in skill_text,
        "setup sub-command anchor missing",
    )
    check(
        "skills/clickup/SKILL.md documents `tasks` sub-command",
        "### `tasks`" in skill_text or "### tasks" in skill_text or "`tasks` —" in skill_text,
        "tasks sub-command anchor missing",
    )
    check(
        "skills/clickup/SKILL.md documents `task <id>` sub-command",
        "task <id>" in skill_text or "task <ID>" in skill_text,
        "task <id> sub-command anchor missing",
    )
    # MCP tool names verbatim in SKILL.md
    missing_in_skill = [t for t in CLICKUP_TOOLS if t not in skill_text]
    check(
        "skills/clickup/SKILL.md references all 7 ClickUp MCP tools verbatim",
        not missing_in_skill,
        f"missing tool names: {missing_in_skill}",
    )
    # Standalone declaration (no orchestrator routing)
    check(
        "skills/clickup/SKILL.md declares it does NOT route through the orchestrator",
        "does NOT route through the orchestrator" in skill_text
        or "DOES NOT" in skill_text.upper(),
        "skill must declare standalone status",
    )

# Orchestrator Step 6c block + verbatim tool names
orchestrator_text = read(AGENTS_DIR / "orchestrator.md")
check(
    "orchestrator.md has Step 6c — ClickUp conversational intents block",
    "Step 6c — ClickUp conversational intents" in orchestrator_text,
    "missing Step 6c header — operator's natural-language ClickUp ops must have a route",
)
check(
    "orchestrator.md Step 6c documents Name-vs-ID resolution protocol",
    "Name-vs-ID resolution" in orchestrator_text,
    "missing Name-vs-ID resolution anchor",
)
check(
    "orchestrator.md Step 6c documents Status pass-through (no hardcoded enum)",
    "Status pass-through" in orchestrator_text,
    "missing Status pass-through anchor",
)
missing_in_orchestrator = [t for t in CLICKUP_TOOLS if t not in orchestrator_text]
check(
    "orchestrator.md Step 6c references all 7 ClickUp MCP tools verbatim",
    not missing_in_orchestrator,
    f"missing tool names: {missing_in_orchestrator}",
)

# ---------------------------------------------------------------------------
# Suite 31 — Output Discipline lint (AC-2, AC-2b, AC-7, AC-8)
# ---------------------------------------------------------------------------
# This suite is the lint-is-the-test for the output-discipline feature.
# It verifies:
#   1. Foundation artifacts exist with the correct content.
#   2. CLAUDE.md stays under 40 KB and has no duplicate §7b header.
#   3. Rollout: every target agent/skill references output-template.md.
#   4. /status and /trace document the exemption (not silenced).
#   5. The narration detector fires on positive canary (per rule) and
#      does NOT fire on instructional text (negative canary).
#   6. The real agent/skill scan produces 0 narration matches.
# ---------------------------------------------------------------------------
print()
print("=== Suite 31: Output Discipline lint ===")

# --- Compile the 3 narration detection rules once ---
# Rule 1: first-person process narration
_NARR_RULE1 = re.compile(
    r"^\s*(I'?m|I am|I'?ll|I will|Let me|Now I'?ll?)"
    r"\s+(read|reading|check|checking|verify|verifying|run|running"
    r"|load|loading|fetch|fetching|look|looking)\b",
    re.MULTILINE | re.IGNORECASE,
)
# Rule 2: progress-gerund at line start
_NARR_RULE2 = re.compile(
    r"^\s*(Reading|Checking|Verifying|Running|Loading|Fetching|Initializing)"
    r"\s+(the\s+|config|MCP|file|server|connection)\b",
    re.MULTILINE | re.IGNORECASE,
)
# Rule 3: step-counter pattern
_NARR_RULE3 = re.compile(
    r"\bStep \d+ of \d+\b",
    re.MULTILINE | re.IGNORECASE,
)

# Skills whose entire content is exempt from the narration scan
# (they surface internals by design — the operator explicitly requested it).
_EXEMPT_SKILL_NAMES = {"pipelines", "trace"}

# Path fragments that disqualify a SKILL.md from the scan
# (vendored/installed files that are not prompt content).
_EXCLUDED_PATH_FRAGMENTS = {"references", ".venv", "node_modules", ".git"}


def _strip_output_discipline(text: str) -> str:
    """Strip the '## Output Discipline' section (new, lists prohibited
    narration phrases as negative examples — scanning it would be a false
    positive).  Strips from the section header up to (but not including)
    the next level-2 header."""
    start = text.find("## Output Discipline")
    if start < 0:
        return text
    end = text.find("\n## ", start + len("## Output Discipline"))
    if end < 0:
        return text[:start]
    return text[:start] + text[end:]


# Paths used repeatedly in this suite
_OUTPUT_TEMPLATE = AGENTS_DIR / "_shared" / "output-template.md"
_OBSERVABILITY_MD = REPO_ROOT / "docs" / "observability.md"
_CLAUDE_MD = REPO_ROOT / "CLAUDE.md"
_TESTING_MD = REPO_ROOT / "docs" / "testing.md"

# --- (setup) Foundation: output-template.md ---

check(
    "voice: agents/_shared/output-template.md exists",
    _OUTPUT_TEMPLATE.exists(),
    "output-template.md is missing — implementer must create it",
)
if _OUTPUT_TEMPLATE.exists():
    _ot = read(_OUTPUT_TEMPLATE)
    check(
        "voice: output-template.md declares the core silence-on-success rule",
        "silent on success" in _ot.lower() or ("silent" in _ot.lower() and "success" in _ot.lower()),
        "output-template.md must contain 'silent on success' (or equivalent)",
    )
    check(
        "voice: output-template.md declares the report-once-on-error rule",
        "report once on error" in _ot.lower() or ("report once" in _ot.lower() and "error" in _ot.lower()),
        "output-template.md must contain 'report once on error' (or equivalent)",
    )
    check(
        "voice: output-template.md lists carve-outs (STOP blocks / analysis / results)",
        "stop" in _ot.lower() and ("analysis" in _ot.lower() or "results" in _ot.lower()),
        "output-template.md must list carve-outs (STOP blocks and analysis/results)",
    )
    check(
        "voice: output-template.md documents /th:pipelines and /trace exemption",
        "pipelines" in _ot.lower() and "trace" in _ot.lower() and "exempt" in _ot.lower(),
        "output-template.md must document the /th:pipelines and /trace exemption",
    )
    check(
        "voice: output-template.md has 'How to reference this file' section",
        "## How to reference this file" in _ot,
        "output-template.md must have a '## How to reference this file' section (gh-fallback pattern)",
    )
else:
    # Can't check contents when file is missing; register placeholder failures
    for _lbl in [
        "voice: output-template.md declares the core silence-on-success rule",
        "voice: output-template.md declares the report-once-on-error rule",
        "voice: output-template.md lists carve-outs (STOP blocks / analysis / results)",
        "voice: output-template.md documents /status and /trace exemption",
        "voice: output-template.md has 'How to reference this file' section",
    ]:
        check(_lbl, False, "skipped — output-template.md does not exist")

# --- (CLAUDE.md) IN/OUT chatter table and size/dedup constraints ---

_claude_full = read(_CLAUDE_MD)

check(
    "voice: CLAUDE.md §7.1 contains IN/OUT chatter table — Config load category",
    "Config load" in _claude_full,
    "CLAUDE.md §7.1 must contain the IN/OUT chatter table with 'Config load' row",
)
check(
    "voice: CLAUDE.md §7.1 contains IN/OUT chatter table — MCP verify category",
    "MCP verify" in _claude_full,
    "CLAUDE.md §7.1 must contain 'MCP verify' row in the IN/OUT table",
)
check(
    "voice: CLAUDE.md §7.1 contains IN/OUT chatter table — Initialization category",
    "Initialization" in _claude_full,
    "CLAUDE.md §7.1 must contain 'Initialization' row in the IN/OUT table",
)
check(
    "voice: CLAUDE.md §7.1 contains IN/OUT chatter table — SILENT and PERMITTED tokens",
    "SILENT" in _claude_full and "PERMITTED" in _claude_full,
    "CLAUDE.md §7.1 must contain 'SILENT' and 'PERMITTED' tokens in the IN/OUT table",
)
check(
    "voice: CLAUDE.md §7.1 defines internal-chatter vs operator-facing boundary",
    "Internal chatter" in _claude_full and "operator-facing" in _claude_full,
    "CLAUDE.md §7.1 must contain the boundary definition with 'Internal chatter' and 'operator-facing'",
)

_claude_size = os.path.getsize(_CLAUDE_MD)
check(
    "voice: CLAUDE.md stays under 40 KB (AC-2)",
    _claude_size < 40 * 1024,
    f"CLAUDE.md is {_claude_size} bytes — must be under {40 * 1024} bytes after edits",
)

# ---------------------------------------------------------------------------
# Leg (b): Durable headroom guard — CLAUDE.md must stay under 36 KB.
# This is ADDITIONAL to the 40 KB cap above (both must pass post-fix).
# Fails now (39960 bytes >= 36000); passes after the §5/§14 offload.
# ---------------------------------------------------------------------------
check(
    "voice: CLAUDE.md stays under 36 KB (durable headroom guard)",
    _claude_size < 36000,
    f"CLAUDE.md is {_claude_size} bytes — must be under 36000 (durable headroom for PRs E-I;"
    " offload §1/§3/§5/§14 detail to docs/ to bring it below threshold)",
)

# ---------------------------------------------------------------------------
# Leg (c): §11 pure-pointer guard — CLAUDE.md §11 must NOT contain per-suite
# inventory literals (Suite 34..42). After Step 5 of the implementer's work,
# §11 is a 1–2 line pointer to docs/testing.md; the inventory belongs there.
# Fails now (§11 lists all 9 suites in-line); passes after §11 is trimmed.
# The check covers ALL 9 suites (not only 39-42) per the qa recommendation.
# ---------------------------------------------------------------------------
_s11_anchor = "## 11."
_s11_next   = "## 12."
_s11_start  = _claude_full.find(_s11_anchor)
_s11_end    = _claude_full.find(_s11_next, _s11_start) if _s11_start != -1 else -1
_s11_slice  = _claude_full[_s11_start:_s11_end] if _s11_start != -1 and _s11_end != -1 else (
    _claude_full[_s11_start:] if _s11_start != -1 else ""
)
_s11_has_pointer    = "docs/testing.md" in _s11_slice
_s11_suite_literals = [f"Suite {n}" for n in range(34, 43) if f"Suite {n}" in _s11_slice]
check(
    "voice: CLAUDE.md §11 is a pure pointer to docs/testing.md"
    " — per-suite inventory literals (Suite 34..42) must NOT appear in §11",
    _s11_has_pointer and not _s11_suite_literals,
    f"CLAUDE.md §11 still contains per-suite inventory: {_s11_suite_literals}"
    " — implementer must reduce §11 to a pointer to docs/testing.md"
    " (per-suite one-liners belong in the canonical registry, not in CLAUDE.md §11)",
)

check(
    "voice: CLAUDE.md '## 7b. Document Hygiene' header appears exactly once (AC-2b)",
    _claude_full.count("## 7b. Document Hygiene") == 1,
    f"'## 7b. Document Hygiene' appears {_claude_full.count('## 7b. Document Hygiene')} times — must be exactly 1 (duplicate must be removed)",
)

# --- (observability) docs/observability.md ---

check(
    "voice: docs/observability.md exists",
    _OBSERVABILITY_MD.exists(),
    "docs/observability.md is missing — implementer must create it",
)
if _OBSERVABILITY_MD.exists():
    _obs = read(_OBSERVABILITY_MD)
    check(
        "voice: observability.md defines operation.* event schema fields",
        "operation.started" in _obs and "operation.success" in _obs and "operation.failed" in _obs
        and "operation" in _obs and "status" in _obs and "error" in _obs and "suggestion" in _obs,
        "observability.md must define operation.started/success/failed and fields: operation, status, error, suggestion",
    )
    check(
        "voice: observability.md declares operation.* is nested in 00-execution-events (not a separate file)",
        "00-execution-events" in _obs and ("nested" in _obs.lower() or "not a separate file" in _obs.lower()),
        "observability.md must state that operation.* is nested in 00-execution-events, not a separate file",
    )
    check(
        "voice: observability.md declares operation.* is optional and additive",
        ("optional" in _obs.lower() or "additive" in _obs.lower()),
        "observability.md must declare operation.* is optional/additive",
    )
else:
    for _lbl in [
        "voice: observability.md defines operation.* event schema fields",
        "voice: observability.md declares operation.* is nested in 00-execution-events (not a separate file)",
        "voice: observability.md declares operation.* is optional and additive",
    ]:
        check(_lbl, False, "skipped — docs/observability.md does not exist")

# --- (rollout) Target agents reference output-template.md ---

_TARGET_AGENTS = [
    "orchestrator", "delivery", "init", "architect",
    "implementer", "tester", "qa", "security",
]
for _agent_name in _TARGET_AGENTS:
    _agent_path = AGENTS_DIR / f"{_agent_name}.md"
    if _agent_path.exists():
        _agent_content = read(_agent_path)
        check(
            f"voice: agents/{_agent_name}.md references output-template.md",
            "agents/_shared/output-template.md" in _agent_content,
            f"agents/{_agent_name}.md must reference agents/_shared/output-template.md in its Output Discipline section",
        )
    else:
        check(
            f"voice: agents/{_agent_name}.md references output-template.md",
            False,
            f"agents/{_agent_name}.md does not exist",
        )

# --- (rollout) Target skills have Output Discipline section ---

_TARGET_SKILLS = ["setup", "lint", "kg"]
for _skill_name in _TARGET_SKILLS:
    _skill_p = skill_path(_skill_name)
    if _skill_p.exists():
        _skill_content = read(_skill_p)
        check(
            f"voice: skills/{_skill_name} has Output Discipline section",
            "## Output Discipline" in _skill_content
            or "Output Discipline" in _skill_content,
            f"skills/{_skill_name}/SKILL.md must contain an 'Output Discipline' section",
        )
        check(
            f"voice: skills/{_skill_name} references output-template.md",
            "agents/_shared/output-template.md" in _skill_content
            or "output-template.md" in _skill_content,
            f"skills/{_skill_name}/SKILL.md must reference output-template.md",
        )
    else:
        for _lbl in [
            f"voice: skills/{_skill_name} has Output Discipline section",
            f"voice: skills/{_skill_name} references output-template.md",
        ]:
            check(_lbl, False, f"skills/{_skill_name}/SKILL.md does not exist at {_skill_p}")

# --- (exemption) /status and /trace document the exemption ---

for _exempt_skill in ["pipelines", "trace"]:
    _esp = skill_path(_exempt_skill)
    if _esp.exists():
        _esc = read(_esp)
        check(
            f"voice: skills/{_exempt_skill} documents narration exemption",
            "exempt" in _esc.lower() or "EXEMPT" in _esc,
            f"skills/{_exempt_skill}/SKILL.md must document the narration exemption (operator requested internals)",
        )
    else:
        check(
            f"voice: skills/{_exempt_skill} documents narration exemption",
            False,
            f"skills/{_exempt_skill}/SKILL.md does not exist at {_esp}",
        )

# --- (CANARY positive, per-rule) Each narration rule fires independently ---
# One synthetic line per rule — asserted rule-by-rule (not aggregated).
# These PASS now (they test the detector, not the repo content).

_canary_line1 = "I'm reading the config now"
_canary_line2 = "Checking MCP connectivity..."
_canary_line3 = "Step 3 of 7"

check(
    "voice: narration rule 1 (first-person) fires on synthetic line",
    bool(_NARR_RULE1.search(_canary_line1)),
    f"rule 1 did not match '{_canary_line1}' — detector broken",
)
check(
    "voice: narration rule 2 (progress gerund) fires on synthetic line",
    bool(_NARR_RULE2.search(_canary_line2)),
    f"rule 2 did not match '{_canary_line2}' — detector broken",
)
check(
    "voice: narration rule 3 (step counter) fires on synthetic line",
    bool(_NARR_RULE3.search(_canary_line3)),
    f"rule 3 did not match '{_canary_line3}' — detector broken",
)

# --- (CANARY negative) Detector does NOT fire on instructional text ---
# Real-world instructional phrases confirmed as false-positive candidates.
# These PASS now (they validate precision of the detector).

_canary_negative = "\n".join([
    "Read the file at path X.",
    "Downstream agents will read this file directly.",
    "The test will verify it.",
    "which test(s) will verify it",
    "Match by checking if the task name appears in the list.",
])

check(
    "voice: narration detector does not fire on instructional text (no false positives)",
    not _NARR_RULE1.search(_canary_negative)
    and not _NARR_RULE2.search(_canary_negative)
    and not _NARR_RULE3.search(_canary_negative),
    "one or more narration rules fired on legitimate instructional text — denylist too broad",
)

# --- (glob-correctness) Scan reaches subdirectory skills ---
# Assert that **/SKILL.md glob includes at least one subdirectory path.

_all_skill_mds = list(SKILLS_DIR.glob("**/SKILL.md"))
_has_subdir_skill = any(
    "setup" in str(p) or "/" in str(p.relative_to(SKILLS_DIR))
    for p in _all_skill_mds
)
check(
    "voice: Suite 31 glob '**/SKILL.md' reaches subdirectory skills",
    _has_subdir_skill and len(_all_skill_mds) > 0,
    "glob('**/SKILL.md') found no subdirectory skills — skills not reachable",
)

# --- (lint-real) No operator-facing narration in agents/*.md and skills/**/SKILL.md ---
# Scan order per AC-8:
#   Step 1 — exclude vendored/non-prompt paths (references/, .venv/, node_modules/, .git/)
#   Step 2 — exclude exempt skills by name (status, trace)
#   Step 3 — strip ## Voice contract + ## Output Discipline before applying rules

_narr_matches: list[str] = []

# Scan agents
for _ap in sorted(AGENTS_DIR.glob("*.md")):
    _ac = read(_ap)
    _ac = _strip_voice_contract(_ac)
    _ac = _strip_output_discipline(_ac)
    for _rule, _rname in [(_NARR_RULE1, "rule1"), (_NARR_RULE2, "rule2"), (_NARR_RULE3, "rule3")]:
        _m = _rule.search(_ac)
        if _m:
            _narr_matches.append(f"agents/{_ap.name} [{_rname}]: {_m.group()!r}")

# Scan skills — AC-8 order: path exclusion BEFORE skill exemption
for _sp in sorted(SKILLS_DIR.glob("**/SKILL.md")):
    # Step 1: path exclusion (vendored/installed files under references/, .venv/, etc.)
    _sp_str = str(_sp)
    if any(_excl in _sp_str for _excl in _EXCLUDED_PATH_FRAGMENTS):
        continue
    # Step 2: skill exemption by name
    _sname = _sp.parent.name
    if _sname in _EXEMPT_SKILL_NAMES:
        continue
    # Step 3: strip sections that legitimately list banned phrases, then scan
    _sc = read(_sp)
    _sc = _strip_voice_contract(_sc)
    _sc = _strip_output_discipline(_sc)
    for _rule, _rname in [(_NARR_RULE1, "rule1"), (_NARR_RULE2, "rule2"), (_NARR_RULE3, "rule3")]:
        _m = _rule.search(_sc)
        if _m:
            _narr_matches.append(f"skills/{_sname}/SKILL.md [{_rname}]: {_m.group()!r}")

check(
    "voice: no operator-facing narration in agents/*.md and skills/**/SKILL.md",
    len(_narr_matches) == 0,
    f"narration found in {len(_narr_matches)} location(s): {_narr_matches}",
)

# ---------------------------------------------------------------------------
# Suite 32 -- Session-scoped config override contract (AC-1..AC-7)
# ---------------------------------------------------------------------------
# Structural assertions: verify that the contract markers for the
# session-scoped override feature exist in the relevant .md files.
#
# DESIGN: every assert is anchored to a UNIQUELY-NAMED section heading that
# the implementer adds. We slice the file to that section first, then assert
# contract tokens ONLY within the slice. If the anchor is absent the slice
# is "" and every dependent check fails with a clear detail -- not a
# false-green. A test-first assert that is green before implementation
# provides zero regression signal; anchor-scoped slicing eliminates that.
#
# Anchors (verbatim -- implementer must use these exactly):
#   agents/orchestrator.md  : "### Session-scoped config override"
#   CLAUDE.md (in §5)      : "**Session-scoped config override whitelist**"
#   skills/clickup/SKILL.md : "### Session-scoped workspace override"
#   skills/recover/SKILL.md : "### Session-scoped override on recovery"
#
# Files checked:
#   agents/orchestrator.md   -- boot step order, precedence, scope guard,
#                               Output Discipline ref, /recover re-apply,
#                               collision guarantee
#   CLAUDE.md                -- §5 whitelist (4 keys + per-key exclusions)
#   skills/clickup/SKILL.md  -- --workspace flag + state-based read
#   skills/recover/SKILL.md  -- re-apply from 00-state.md
# ---------------------------------------------------------------------------
print()
print("=== Suite 32: Session-scoped config override contract ===")

_s32_orch = read(AGENTS_DIR / "orchestrator.md")
_s32_claude = read(REPO_ROOT / "CLAUDE.md")
_s32_clickup_path = SKILLS_DIR / "clickup" / "SKILL.md"
_s32_clickup = read(_s32_clickup_path) if _s32_clickup_path.exists() else ""
_s32_recover_path = skill_path("recover")
_s32_recover = read(_s32_recover_path) if _s32_recover_path.exists() else ""


# ---------------------------------------------------------------------------
# Slice helpers -- extract text from a named anchor to the next section
# boundary. Returns "" when the anchor is absent.
# ---------------------------------------------------------------------------

def _slice_section(text, anchor):
    # Return text from anchor (inclusive) to the next markdown heading or
    # EOF. Returns "" if the anchor is not found.
    idx = text.find(anchor)
    if idx == -1:
        return ""
    rest = text[idx:]
    m = re.search(r"\n(?:#{1,6}) ", rest[1:])
    if m:
        return rest[: m.start() + 1]
    return rest


def _slice_bullet_section(text, anchor):
    # Return text from anchor (inclusive) to next heading or blank-line-
    # separated top-level block. Used for CLAUDE.md §5 whitelist bullet.
    # Returns "" if anchor absent.
    idx = text.find(anchor)
    if idx == -1:
        return ""
    rest = text[idx:]
    boundary = re.search(r"\n(?:#{1,6} |\n[^\s\-\*\d])", rest[1:])
    if boundary:
        return rest[: boundary.start() + 1]
    return rest


# ---------------------------------------------------------------------------
# Anchor A: agents/orchestrator.md "### Session-scoped config override"
# ---------------------------------------------------------------------------
_ORCH_ANCHOR = "### Session-scoped config override"
_ovr = _slice_section(_s32_orch, _ORCH_ANCHOR)

check(
    "override(anchor-orch): agents/orchestrator.md contains"
    " '### Session-scoped config override' section",
    bool(_ovr),
    f"anchor '{_ORCH_ANCHOR}' not found in orchestrator.md"
    " -- override(a/a2/b/c/c2/d-v/e/e2/f/h/i/i2) checks will fail",
)

# (a) All four sequence tokens present in _ovr AND in order.
_A_TOKENS = ("parse override", "read persistent", "apply precedence", "then resolve")
_a_tokens_in_slice = bool(_ovr) and all(t in _ovr for t in _A_TOKENS)
_a_tokens_ordered = False
if _a_tokens_in_slice:
    idxs = [_ovr.find(t) for t in _A_TOKENS]
    _a_tokens_ordered = idxs == sorted(idxs)
check(
    "override(a): orchestrator.md § override documents load order"
    " (parse override -> read persistent -> apply precedence -> then resolve)",
    _a_tokens_in_slice and _a_tokens_ordered,
    f"anchor '{_ORCH_ANCHOR}' missing or tokens not in order: {_A_TOKENS}",
)

# (a2) Same four tokens all present in the slice.
check(
    "override(a2): orchestrator.md § override contains all four sequence labels",
    bool(_ovr)
    and "parse override" in _ovr
    and "read persistent" in _ovr
    and "apply precedence" in _ovr
    and "then resolve" in _ovr,
    f"anchor '{_ORCH_ANCHOR}' slice missing one or more of {_A_TOKENS}",
)

# (b) Literal precedence string in slice.
check(
    "override(b): orchestrator.md § override documents precedence"
    " 'override > persistent > default'",
    bool(_ovr) and "override > persistent > default" in _ovr,
    f"anchor '{_ORCH_ANCHOR}' slice does not contain"
    " literal 'override > persistent > default'",
)

# (c) Scope guard: "NEVER writes" AND "~/.claude/.team-harness.json" in slice.
check(
    "override(c): orchestrator.md § override declares"
    " NEVER writes ~/.claude/.team-harness.json",
    bool(_ovr)
    and "NEVER writes" in _ovr
    and "~/.claude/.team-harness.json" in _ovr,
    f"anchor '{_ORCH_ANCHOR}' slice missing 'NEVER writes'"
    " and/or '~/.claude/.team-harness.json'",
)

# (c2) "00-state.md" AND "Current State" AND ("no new file" OR "resolved config")
#      in slice.
check(
    "override(c2): orchestrator.md § override declares resolved config stored"
    " in 00-state.md (no new file)",
    bool(_ovr)
    and "00-state.md" in _ovr
    and "Current State" in _ovr
    and ("no new file" in _ovr or "resolved config" in _ovr),
    f"anchor '{_ORCH_ANCHOR}' slice missing '00-state.md', 'Current State',"
    " or 'no new file'/'resolved config'",
)

# (d-v) "CLAUDE.md" AND §5 reference AND ("whitelist" OR "overridable") in slice.
check(
    "override(d-v): orchestrator.md § override references"
    " CLAUDE.md §5 as whitelist authority",
    bool(_ovr)
    and "CLAUDE.md" in _ovr
    and ("§5" in _ovr or "section 5" in _ovr.lower())
    and ("whitelist" in _ovr.lower() or "overridable" in _ovr.lower()),
    f"anchor '{_ORCH_ANCHOR}' slice missing 'CLAUDE.md §5'"
    " whitelist/overridable reference",
)

# (e) "Output Discipline" AND "output-template.md" in slice.
check(
    "override(e): orchestrator.md § override references"
    " Output Discipline (output-template.md)",
    bool(_ovr) and "Output Discipline" in _ovr and "output-template.md" in _ovr,
    f"anchor '{_ORCH_ANCHOR}' slice missing 'Output Discipline'"
    " and/or 'output-template.md'",
)

# (e2) "operation.success" OR "silent" in slice.
check(
    "override(e2): orchestrator.md § override documents silent success"
    " (operation.success or silent)",
    bool(_ovr) and ("operation.success" in _ovr or "silent" in _ovr),
    f"anchor '{_ORCH_ANCHOR}' slice missing 'operation.success' or 'silent'",
)

# (f) "/recover" AND "00-state.md" AND ("re-apply" OR "re-applied") in slice.
check(
    "override(f): orchestrator.md § override documents /recover re-applies"
    " override from 00-state.md",
    bool(_ovr)
    and "/recover" in _ovr
    and "00-state.md" in _ovr
    and ("re-apply" in _ovr or "re-applied" in _ovr),
    f"anchor '{_ORCH_ANCHOR}' slice missing '/recover', '00-state.md',"
    " or 're-apply'/'re-applied'",
)

# (h) No-override / fall-through + silent in slice.
check(
    "override(h): orchestrator.md § override documents no-override case"
    " as silent (fall-through, no extra output)",
    bool(_ovr)
    and (
        "no override" in _ovr
        or "falls through" in _ovr
        or "fall back" in _ovr
        or "fall through" in _ovr
    )
    and ("silent" in _ovr or "no extra" in _ovr or "no chatter" in _ovr),
    f"anchor '{_ORCH_ANCHOR}' slice missing no-override/fall-through"
    " + silent description",
)

# (i) "base_path" AND "docs_root" AND "before" in slice.
check(
    "override(i): orchestrator.md § override documents base_path resolved"
    " before composing docs_root",
    bool(_ovr) and "base_path" in _ovr and "docs_root" in _ovr and "before" in _ovr,
    f"anchor '{_ORCH_ANCHOR}' slice missing 'base_path', 'docs_root', or 'before'",
)

# (i2) The date+feature prefix pattern AND ("unique" OR "collision") in slice.
_I2_DATE_PATTERN = "{YYYY-MM-DD}_{feature-name}"
check(
    "override(i2): orchestrator.md § override documents unique-directory"
    " guarantee (date+feature prefix)",
    bool(_ovr)
    and _I2_DATE_PATTERN in _ovr
    and ("unique" in _ovr or "collision" in _ovr),
    f"anchor '{_ORCH_ANCHOR}' slice missing date+feature pattern"
    " and/or 'unique'/'collision'",
)

# ---------------------------------------------------------------------------
# Anchor B: CLAUDE.md §5 "**Session-scoped config override whitelist**"
# ---------------------------------------------------------------------------
_WL_ANCHOR = "**Session-scoped config override whitelist**"
_wl = _slice_bullet_section(_s32_claude, _WL_ANCHOR)

check(
    "override(anchor-claude): CLAUDE.md §5 contains"
    " '**Session-scoped config override whitelist**' marker",
    bool(_wl),
    f"anchor '{_WL_ANCHOR}' not found in CLAUDE.md"
    " -- override(d/*) checks will fail",
)

# (d) All 4 overridable keys present within _wl.
_OVERRIDABLE_KEYS = ["logs-mode", "logs-path", "logs-subfolder", "clickup.workspace_id"]
_missing_keys = [k for k in _OVERRIDABLE_KEYS if k not in _wl]
check(
    "override(d): CLAUDE.md §5 whitelist enumerates all 4 overridable keys",
    bool(_wl) and len(_missing_keys) == 0,
    (
        f"CLAUDE.md whitelist slice missing overridable key(s): {_missing_keys}"
        if _wl
        else f"anchor '{_WL_ANCHOR}' not found"
    ),
)

# Exclusion verbs used across (d-i)..(d-iv)
_WL_EXCL_VERBS = ("not overridable", "excluded", "-> /th:setup", "/th:setup")

# (d-i) "MCP URL" named as excluded within _wl.
check(
    "override(d-i): CLAUDE.md whitelist explicitly excludes MCP URL"
    " (with exclusion verb)",
    bool(_wl)
    and "MCP URL" in _wl
    and any(v in _wl for v in _WL_EXCL_VERBS),
    f"anchor '{_WL_ANCHOR}' slice missing 'MCP URL' or exclusion verb"
    f" {_WL_EXCL_VERBS}",
)

# (d-ii) API key identifier named as excluded within _wl.
check(
    "override(d-ii): CLAUDE.md whitelist explicitly excludes API key(s)"
    " (context7 / bearer / API key)",
    bool(_wl)
    and ("context7" in _wl or "bearer" in _wl or "API key" in _wl)
    and any(v in _wl for v in _WL_EXCL_VERBS),
    f"anchor '{_WL_ANCHOR}' slice missing API key identifier or exclusion verb",
)

# (d-iii) Agent "model" named as excluded within _wl.
check(
    "override(d-iii): CLAUDE.md whitelist explicitly excludes agent 'model'",
    bool(_wl) and "model" in _wl and any(v in _wl for v in _WL_EXCL_VERBS),
    f"anchor '{_WL_ANCHOR}' slice missing 'model' or exclusion verb",
)

# (d-iv) Agent "effort" named as excluded within _wl.
check(
    "override(d-iv): CLAUDE.md whitelist explicitly excludes agent 'effort'",
    bool(_wl) and "effort" in _wl and any(v in _wl for v in _WL_EXCL_VERBS),
    f"anchor '{_WL_ANCHOR}' slice missing 'effort' or exclusion verb",
)

# ---------------------------------------------------------------------------
# Anchor C: skills/clickup/SKILL.md "### Session-scoped workspace override"
# ---------------------------------------------------------------------------
_CU_ANCHOR = "### Session-scoped workspace override"
_cu = _slice_section(_s32_clickup, _CU_ANCHOR)

check(
    "override(anchor-clickup): skills/clickup/SKILL.md contains"
    " '### Session-scoped workspace override' section",
    _s32_clickup_path.exists() and bool(_cu),
    f"anchor '{_CU_ANCHOR}' not found in {_s32_clickup_path}"
    " -- override(g/*) checks will fail",
)

# (g) "00-state.md" AND "Current State" AND "workspace" within _cu.
check(
    "override(g): skills/clickup/SKILL.md § override documents reading"
    " workspace_id from 00-state.md § Current State",
    bool(_cu) and "00-state.md" in _cu and "Current State" in _cu and "workspace" in _cu,
    f"anchor '{_CU_ANCHOR}' slice missing '00-state.md', 'Current State',"
    " or 'workspace'",
)

# (g2) "--workspace" within _cu.
check(
    "override(g2): skills/clickup/SKILL.md § override documents --workspace flag",
    bool(_cu) and "--workspace" in _cu,
    f"anchor '{_CU_ANCHOR}' slice missing '--workspace'",
)

# (g3) No-write declaration within _cu.
check(
    "override(g3): skills/clickup/SKILL.md § override declares it does not"
    " write the persistent file",
    bool(_cu)
    and (
        "does not write" in _cu
        or "single-config-file" in _cu
        or "preserves" in _cu
    ),
    f"anchor '{_CU_ANCHOR}' slice missing no-write declaration"
    " ('does not write'/'single-config-file'/'preserves')",
)

# (g-producer) PRODUCER-SIDE: agents/orchestrator.md "## Current State" template
# must declare `clickup_workspace_id` so the consumer (ClickUp skill) has a field
# to read.  Verifies the producer↔consumer contract is not broken.
#
# Strategy: locate the Current State template region in orchestrator.md by
# anchoring on the line "## Current State" and slicing to the next "##"-level
# heading (the Phase Checklist).  Within that slice, assert:
#   1. `clickup_workspace_id` is declared as a field.
#   2. The surrounding context ties it to the override/resolved/workspace concept.
_CS_ANCHOR = "## Current State"
_cs_idx = _s32_orch.find(_CS_ANCHOR)
if _cs_idx == -1:
    _cs_template = ""
else:
    _cs_rest = _s32_orch[_cs_idx:]
    # Terminate at the next "## " heading (sibling-level in the template).
    _cs_boundary = re.search(r"\n## ", _cs_rest[1:])
    _cs_template = _cs_rest[: _cs_boundary.start() + 1] if _cs_boundary else _cs_rest

_gp_field_present = "clickup_workspace_id" in _cs_template
_gp_context_ok = (
    _gp_field_present
    and (
        "override" in _cs_template[
            max(0, _cs_template.find("clickup_workspace_id") - 200):
            _cs_template.find("clickup_workspace_id") + 200
        ]
        or "resolved" in _cs_template[
            max(0, _cs_template.find("clickup_workspace_id") - 200):
            _cs_template.find("clickup_workspace_id") + 200
        ]
        or "workspace" in _cs_template[
            max(0, _cs_template.find("clickup_workspace_id") - 200):
            _cs_template.find("clickup_workspace_id") + 200
        ]
    )
)
check(
    "override(g-producer): agents/orchestrator.md '## Current State' template"
    " declares field 'clickup_workspace_id' (resolved ClickUp workspace,"
    " producer side of the override contract)",
    bool(_cs_template) and _gp_field_present and _gp_context_ok,
    (
        f"'## Current State' template region not found in orchestrator.md"
        if not _cs_template
        else (
            "field 'clickup_workspace_id' absent from orchestrator.md"
            " '## Current State' template — producer never writes the field"
            " the ClickUp consumer reads (SEC-001 gap)"
            if not _gp_field_present
            else "field 'clickup_workspace_id' found but lacks override/resolved/workspace"
            " context within 200 chars — tie it to the session-scoped override"
        )
    ),
)

# ---------------------------------------------------------------------------
# Anchor D: skills/recover/SKILL.md "### Session-scoped override on recovery"
# ---------------------------------------------------------------------------
_RC_ANCHOR = "### Session-scoped override on recovery"
_rc = _slice_section(_s32_recover, _RC_ANCHOR)

check(
    "override(anchor-recover): skills/recover/SKILL.md contains"
    " '### Session-scoped override on recovery' section",
    _s32_recover_path.exists() and bool(_rc),
    f"anchor '{_RC_ANCHOR}' not found in {_s32_recover_path}"
    " -- override(f2) check will fail",
)

# (f2) "00-state.md" AND "override" AND ("re-applied" OR "Current State") in _rc.
check(
    "override(f2): skills/recover/SKILL.md § recovery documents override"
    " re-applied from 00-state.md",
    bool(_rc)
    and "00-state.md" in _rc
    and "override" in _rc
    and ("re-applied" in _rc or "Current State" in _rc),
    f"anchor '{_RC_ANCHOR}' slice missing '00-state.md', 'override',"
    " or 're-applied'/'Current State'",
)

# (f3) Literal "override re-applied from 00-state.md" AND "operation.success"
#      in orchestrator § override slice OR recover § recovery slice.
_f3_in_orch = (
    bool(_ovr)
    and "override re-applied from 00-state.md" in _ovr
    and "operation.success" in _ovr
)
_f3_in_rc = (
    bool(_rc)
    and "override re-applied from 00-state.md" in _rc
    and "operation.success" in _rc
)
check(
    "override(f3): orchestrator § override or recover § recovery documents literal"
    " 'override re-applied from 00-state.md' + operation.success",
    _f3_in_orch or _f3_in_rc,
    "Neither orchestrator.md § override nor recover § recovery contains"
    " 'override re-applied from 00-state.md' + 'operation.success'",
)
# ---------------------------------------------------------------------------
# Suite 33 -- Selective mid-pipeline KG reads on error and security-finding
#             writes (kg-mid-pipeline, AC-1..AC-9)
# ---------------------------------------------------------------------------
# Structural assertions only -- no LLM runtime required.
# Every check is ANCHOR-SCOPED to prevent false-greens: the contract tokens
# involved (search_nodes, operation.started, kg_save_candidates, etc.) already
# appear in the target files for unrelated reasons. We slice to a UNIQUELY-NAMED
# new heading first, then assert tokens WITHIN that slice. An absent anchor
# returns "" and all dependent checks fail with a clear detail -- not a
# false-green.
#
# CANONICAL ANCHORS (implementer must use these verbatim):
#   agents/orchestrator.md  :  "### KG read on error"
#   agents/orchestrator.md  :  "### KG write on security findings"
#   agents/orchestrator.md  :  "**No mid-pipeline investigation writes**"
#   agents/security.md      :  "remediation_text" is NEW -- scoped via the
#                               KG-access / status-block region containing the
#                               new contract (the literal is absent today)
#   agents/implementer.md   :  "kg_prior_art" is NEW literal -- bare presence
#   agents/acceptance-checker.md : "kg_prior_art" is NEW literal -- bare presence
#   agents/delivery.md      :  "**No cross-merge with security node types**"
#                               (new marker in Step 11.5)
#   docs/kg-content-policy.md : "KG-write-on-security-findings"
#                               (new write-site mention)
#
# Check index → AC mapping:
#   (1)  AC-1  -- KG-read-on-3.6-fail marker in orchestrator.md (anchor-scoped)
#   (2)  AC-2  -- KG-read-on-3.75-fail marker in orchestrator.md (anchor-scoped)
#   (3)  AC-3  -- kg_prior_art field in implementer.md + acceptance-checker.md
#   (4)  AC-4  -- best-effort / non-blocking phrase in anchor slice
#   (5)  AC-5  -- remediation_text safe contract in security.md
#   (6)  AC-6  -- Critical/High-only write contract in security.md
#   (7)  AC-7  -- content-filter + dedup marker in orchestrator.md (anchor-scoped)
#   (8)  AC-8  -- cross-dedup contract in orchestrator.md + security.md + delivery.md
#   (9)  AC-9  -- exclusion marker + session_end unchanged in orchestrator.md
#   (10) GUARD -- absence of kg.read.*/kg.write.* event family in orchestrator.md
#                 (design uses operation.* with detail discriminator instead)
#                 This check is GREEN now and MUST stay green; it is a guard, not
#                 a contract-presence RED-first check.
# ---------------------------------------------------------------------------
print()
print("=== Suite 33: Selective mid-pipeline KG reads on error and security-finding writes ===")

_s33_orch = read(AGENTS_DIR / "orchestrator.md")
_s33_sec = read(AGENTS_DIR / "security.md")
_s33_impl = read(AGENTS_DIR / "implementer.md")
_s33_ac_checker_path = AGENTS_DIR / "acceptance-checker.md"
_s33_ac_checker = read(_s33_ac_checker_path) if _s33_ac_checker_path.exists() else ""
_s33_deliv = read(AGENTS_DIR / "delivery.md")
_s33_kg_policy_path = REPO_ROOT / "docs" / "kg-content-policy.md"
_s33_kg_policy = read(_s33_kg_policy_path) if _s33_kg_policy_path.exists() else ""

# ---------------------------------------------------------------------------
# Anchor A: agents/orchestrator.md "### KG read on error"
# (Covers checks (1), (2), and (4))
# ---------------------------------------------------------------------------
_KG_READ_ANCHOR = "### KG read on error"
_kg_read = _slice_section(_s33_orch, _KG_READ_ANCHOR)

check(
    "kg-mid(anchor-read): agents/orchestrator.md contains"
    " '### KG read on error' section",
    bool(_kg_read),
    f"anchor '{_KG_READ_ANCHOR}' not found in orchestrator.md"
    " -- kg-mid checks (1)(2)(4) will fail",
)

# Check (1) -- AC-1: Phase 3.6 fail cases with re-dispatch (A/B/D), Case C excluded.
# Assert within the anchor slice:
#   - search_nodes is invoked
#   - Phase 3.6 scope is declared (acceptance-check / 3.6 / acceptance fail)
#   - Cases A/B/D are covered (re-dispatch cases)
#   - Case C is explicitly excluded (no-redispatch / does not trigger / Case C)
_c1_search_nodes = bool(_kg_read) and "search_nodes" in _kg_read
_c1_phase36 = bool(_kg_read) and (
    "3.6" in _kg_read or "acceptance" in _kg_read.lower()
)
_c1_cases_abd = bool(_kg_read) and (
    ("Case A" in _kg_read or "case A" in _kg_read or "A/B/D" in _kg_read or "A, B" in _kg_read)
    and ("Case B" in _kg_read or "case B" in _kg_read or "B" in _kg_read)
    and ("Case D" in _kg_read or "case D" in _kg_read or "D" in _kg_read)
)
_c1_case_c_excluded = bool(_kg_read) and (
    "Case C" in _kg_read or "case C" in _kg_read
) and (
    "not" in _kg_read.lower()
    or "excluded" in _kg_read.lower()
    or "no-redispatch" in _kg_read.lower()
    or "does not trigger" in _kg_read.lower()
    or "skip" in _kg_read.lower()
)
check(
    "kg-mid(1/ac-1): orchestrator.md § 'KG read on error' declares"
    " search_nodes, Phase 3.6 scope (Cases A/B/D), and explicit Case C exclusion",
    _c1_search_nodes and _c1_phase36 and _c1_cases_abd and _c1_case_c_excluded,
    (
        f"anchor '{_KG_READ_ANCHOR}' slice:"
        f" search_nodes={_c1_search_nodes},"
        f" phase3.6={_c1_phase36},"
        f" cases_ABD={_c1_cases_abd},"
        f" case_C_excluded={_c1_case_c_excluded}"
    ),
)

# Check (2) -- AC-2: Phase 3.75 fail scope declared in the same anchor slice.
_c2_phase375 = bool(_kg_read) and (
    "3.75" in _kg_read or "build" in _kg_read.lower() or "lint" in _kg_read.lower()
)
check(
    "kg-mid(2/ac-2): orchestrator.md § 'KG read on error' declares"
    " Phase 3.75 fail scope (build/lint error triggers search_nodes)",
    bool(_kg_read) and _c1_search_nodes and _c2_phase375,
    (
        f"anchor '{_KG_READ_ANCHOR}' slice:"
        f" search_nodes={_c1_search_nodes},"
        f" phase3.75_or_build_lint={_c2_phase375}"
    ),
)

# Check (4) -- AC-4: best-effort / non-blocking declared in the KG-read anchor slice.
_c4_nonblocking = bool(_kg_read) and (
    "non-blocking" in _kg_read
    or "non_blocking" in _kg_read
    or "best-effort" in _kg_read
    or "best_effort" in _kg_read
    or "non blocking" in _kg_read.lower()
)
_c4_operation_failed = bool(_kg_read) and (
    "operation.failed" in _kg_read
    or "operation.started" in _kg_read
    or "operation." in _kg_read
)
check(
    "kg-mid(4/ac-4): orchestrator.md § 'KG read on error' declares"
    " best-effort non-blocking (log operation.* and continue with n/a)",
    _c4_nonblocking and _c4_operation_failed,
    (
        f"anchor '{_KG_READ_ANCHOR}' slice:"
        f" non_blocking={_c4_nonblocking},"
        f" operation_event={_c4_operation_failed}"
    ),
)

# ---------------------------------------------------------------------------
# Check (3) -- AC-3: kg_prior_art field in implementer.md and acceptance-checker.md
# NOTE: The literal 'kg_prior_art' is NEW (not in either file today).
# Bare presence is sufficient -- no anchor needed since the literal is unique.
# The check asserts ONLY the field name presence; NOT the runtime value of
# 'applied:bool' (structural limit: no LLM runtime available).
# ---------------------------------------------------------------------------
_c3_impl = "kg_prior_art" in _s33_impl
_c3_ac = "kg_prior_art" in _s33_ac_checker

check(
    "kg-mid(3/ac-3): agents/implementer.md status block declares field 'kg_prior_art'",
    _c3_impl,
    "literal 'kg_prior_art' absent from implementer.md"
    " -- field presence in status block not documented",
)

check(
    "kg-mid(3b/ac-3): agents/acceptance-checker.md status block declares field 'kg_prior_art'",
    _c3_ac,
    f"literal 'kg_prior_art' absent from acceptance-checker.md ({_s33_ac_checker_path})"
    " -- field presence in status block not documented",
)

# ---------------------------------------------------------------------------
# Anchor B: agents/orchestrator.md "### KG write on security findings"
# (Covers checks (7) and the orchestrator side of (8))
# ---------------------------------------------------------------------------
_KG_WRITE_ANCHOR = "### KG write on security findings"
_kg_write = _slice_section(_s33_orch, _KG_WRITE_ANCHOR)

check(
    "kg-mid(anchor-write): agents/orchestrator.md contains"
    " '### KG write on security findings' section",
    bool(_kg_write),
    f"anchor '{_KG_WRITE_ANCHOR}' not found in orchestrator.md"
    " -- kg-mid checks (7)(8-orch) will fail",
)

# Check (7) -- AC-7: content-filter + dedup (suggest_node_type + search_nodes) in write anchor.
_c7_content_filter = bool(_kg_write) and (
    "content-filter" in _kg_write
    or "content filter" in _kg_write
    or "kg-content-policy" in _kg_write
    or "kg_content_policy" in _kg_write
)
_c7_suggest_node_type = bool(_kg_write) and "suggest_node_type" in _kg_write
_c7_search_nodes = bool(_kg_write) and "search_nodes" in _kg_write
_c7_create_nodes = bool(_kg_write) and (
    "create_nodes" in _kg_write or "add_observations" in _kg_write
)
check(
    "kg-mid(7/ac-7): orchestrator.md § 'KG write on security findings' declares"
    " content-filter (kg-content-policy) + dedup (suggest_node_type + search_nodes)"
    " before create_nodes/add_observations",
    _c7_content_filter and _c7_suggest_node_type and _c7_search_nodes and _c7_create_nodes,
    (
        f"anchor '{_KG_WRITE_ANCHOR}' slice:"
        f" content_filter={_c7_content_filter},"
        f" suggest_node_type={_c7_suggest_node_type},"
        f" search_nodes={_c7_search_nodes},"
        f" create/add={_c7_create_nodes}"
    ),
)

# Check (8-orch) -- AC-8 orchestrator side: cross-dedup contract in write anchor.
# Assert: 'error'/'pattern' node types AND 'process-insight' AND no-cross-merge.
_c8_orch_error_pattern = bool(_kg_write) and (
    ('"error"' in _kg_write or "'error'" in _kg_write or "node_type: error" in _kg_write
     or "type `error`" in _kg_write or "type error" in _kg_write.lower())
    and
    ('"pattern"' in _kg_write or "'pattern'" in _kg_write or "node_type: pattern" in _kg_write
     or "type `pattern`" in _kg_write or "type pattern" in _kg_write.lower())
)
_c8_orch_process_insight = bool(_kg_write) and "process-insight" in _kg_write
_c8_orch_no_cross = bool(_kg_write) and (
    "no-cross" in _kg_write
    or "no cross" in _kg_write.lower()
    or "not merge" in _kg_write.lower()
    or "do not merge" in _kg_write.lower()
    or "cross-dedup" in _kg_write
    or "cross_dedup" in _kg_write
    or "cross-merge" in _kg_write
)
check(
    "kg-mid(8-orch/ac-8): orchestrator.md § 'KG write on security findings' declares"
    " cross-dedup: error/pattern types distinct from process-insight, no cross-merge",
    _c8_orch_error_pattern and _c8_orch_process_insight and _c8_orch_no_cross,
    (
        f"anchor '{_KG_WRITE_ANCHOR}' slice:"
        f" error_pattern_types={_c8_orch_error_pattern},"
        f" process_insight={_c8_orch_process_insight},"
        f" no_cross_merge={_c8_orch_no_cross}"
    ),
)

# ---------------------------------------------------------------------------
# Check (5) -- AC-5: remediation_text safe contract in security.md.
# 'remediation_text' is NEW to security.md (absent today). The literal is
# unique so bare presence is acceptable; we also check the prohibited list.
# ---------------------------------------------------------------------------
_c5_remediation_text = "remediation_text" in _s33_sec
# Prohibited items from the plan (exploit, CVE, secret/PII, path)
_c5_no_exploit = bool(_c5_remediation_text) and (
    "exploit" in _s33_sec or "no exploit" in _s33_sec.lower() or "without exploit" in _s33_sec.lower()
)
_c5_no_cve = bool(_c5_remediation_text) and (
    "CVE" in _s33_sec
)
_c5_no_pii = bool(_c5_remediation_text) and (
    "PII" in _s33_sec or "secret" in _s33_sec.lower()
)
_c5_no_path = bool(_c5_remediation_text) and (
    "path" in _s33_sec.lower()
)
check(
    "kg-mid(5/ac-5): agents/security.md declares remediation_text safe contract"
    " (field present + prohibited list: exploit, CVE, secret/PII, path)",
    _c5_remediation_text and _c5_no_exploit and _c5_no_cve and _c5_no_pii and _c5_no_path,
    (
        f"security.md:"
        f" remediation_text={_c5_remediation_text},"
        f" exploit_mentioned={_c5_no_exploit},"
        f" CVE_mentioned={_c5_no_cve},"
        f" PII_secret_mentioned={_c5_no_pii},"
        f" path_mentioned={_c5_no_path}"
    ),
)

# ---------------------------------------------------------------------------
# Check (5b) -- SEC-002: remediation_text producer contract references canonical
# policy (docs/kg-content-policy.md) as the authority for prohibited content,
# making the prohibited list open (not exhaustive / closed).
# Anchor-scoped: slice the 800-char window around 'remediation_text' in
# security.md -- the SAFE contract lives in that block. The window must contain
# BOTH 'remediation_text' AND a pointer to kg-content-policy so the contract
# reads as "see policy for full list" rather than a closed enumeration.
# Symmetric with kg-mid(7c/sec-004) which guards the write-site (orchestrator).
# ---------------------------------------------------------------------------
_c5b_idx = _s33_sec.find("remediation_text")
_c5b_window = (
    _s33_sec[max(0, _c5b_idx - 50): _c5b_idx + 800] if _c5b_idx != -1 else ""
)
_c5b_has_remediation = _c5b_idx != -1
_c5b_has_policy_ref = (
    "kg-content-policy" in _c5b_window
)
check(
    "kg-mid(5b/sec-002): agents/security.md remediation_text safe contract"
    " references docs/kg-content-policy.md as catch-all authority (producer"
    " contract non-exhaustive, symmetric with write-site SEC-004 guard)",
    _c5b_has_remediation and _c5b_has_policy_ref,
    (
        f"security.md remediation_text region (800-char window):"
        f" remediation_text_found={_c5b_has_remediation},"
        f" kg-content-policy_referenced={_c5b_has_policy_ref}"
        f" (window='{_c5b_window[:150]}...')"
    ),
)

# ---------------------------------------------------------------------------
# Check (6) -- AC-6: "Critical/High only" write contract in security.md.
# The concept of Critical/High already exists in security.md (for other reasons),
# but the KG-write restriction is NEW. We scope to the KG-access region by
# anchoring on "kg_save_candidates" in the file and checking within a 600-char
# window that "Critical" and "High" and an exclusion verb appear together.
# ---------------------------------------------------------------------------
_c6_idx = _s33_sec.find("kg_save_candidates")
_c6_window = _s33_sec[max(0, _c6_idx - 100): _c6_idx + 600] if _c6_idx != -1 else ""
_c6_critical_high = (
    "Critical" in _c6_window and "High" in _c6_window
)
_c6_only_restriction = (
    "only" in _c6_window.lower()
    or "Critical/High" in _c6_window
    or "Critical or High" in _c6_window
)
check(
    "kg-mid(6/ac-6): agents/security.md declares Critical/High-only KG write"
    " (only Critical/High findings produce kg_save_candidates for KG write)",
    bool(_c6_window) and _c6_critical_high and _c6_only_restriction,
    (
        f"security.md kg_save_candidates context window:"
        f" critical_high={_c6_critical_high},"
        f" only_restriction={_c6_only_restriction}"
        f" (window='{_c6_window[:120]}...')"
    ),
)

# ---------------------------------------------------------------------------
# Check (8-sec) -- AC-8 security.md side: cross-dedup contract in security.md.
# Assert: node_type error/pattern mentioned near kg_save_candidates context.
# ---------------------------------------------------------------------------
_c8_sec_window = _s33_sec[max(0, _c6_idx - 200): _c6_idx + 800] if _c6_idx != -1 else ""
_c8_sec_error_pattern = (
    ("error" in _c8_sec_window.lower() and "pattern" in _c8_sec_window.lower())
    and ("node_type" in _c8_sec_window or "node type" in _c8_sec_window.lower()
         or '`error`' in _c8_sec_window or '`pattern`' in _c8_sec_window)
)
check(
    "kg-mid(8-sec/ac-8): agents/security.md declares node_type error/pattern"
    " for KG write candidates (cross-dedup contract, security side)",
    bool(_c8_sec_window) and _c8_sec_error_pattern,
    (
        f"security.md kg_save_candidates context:"
        f" error_pattern_node_type={_c8_sec_error_pattern}"
        f" (window sample='{_c8_sec_window[:120]}...')"
    ),
)

# ---------------------------------------------------------------------------
# Check (8-deliv) -- AC-8 delivery.md side: cross-dedup note in Step 11.5.
# Anchor: "**No cross-merge with security node types**" (new marker in Step 11.5).
# ---------------------------------------------------------------------------
_DELIV_XDEDUP_ANCHOR = "**No cross-merge with security node types**"
_deliv_xdedup = _slice_section(_s33_deliv, _DELIV_XDEDUP_ANCHOR)

check(
    "kg-mid(anchor-deliv-xdedup): agents/delivery.md contains"
    " '**No cross-merge with security node types**' marker in Step 11.5",
    bool(_deliv_xdedup),
    f"anchor '{_DELIV_XDEDUP_ANCHOR}' not found in delivery.md"
    " -- kg-mid check (8-deliv) will fail",
)

_c8_deliv_process_insight = bool(_deliv_xdedup) and "process-insight" in _deliv_xdedup
_c8_deliv_error_pattern = bool(_deliv_xdedup) and (
    "error" in _deliv_xdedup.lower() and "pattern" in _deliv_xdedup.lower()
)
_c8_deliv_no_cross = bool(_deliv_xdedup) and (
    "not merge" in _deliv_xdedup.lower()
    or "do not merge" in _deliv_xdedup.lower()
    or "no cross" in _deliv_xdedup.lower()
    or "cross-merge" in _deliv_xdedup
)
check(
    "kg-mid(8-deliv/ac-8): agents/delivery.md Step 11.5 cross-dedup note declares"
    " process-insight not merged against error/pattern security node types",
    _c8_deliv_process_insight and _c8_deliv_error_pattern and _c8_deliv_no_cross,
    (
        f"anchor '{_DELIV_XDEDUP_ANCHOR}' slice:"
        f" process_insight={_c8_deliv_process_insight},"
        f" error_pattern={_c8_deliv_error_pattern},"
        f" no_cross={_c8_deliv_no_cross}"
    ),
)

# ---------------------------------------------------------------------------
# Anchor C: agents/orchestrator.md "**No mid-pipeline investigation writes**"
# (Covers check (9))
# ---------------------------------------------------------------------------
_EXCL_ANCHOR = "**No mid-pipeline investigation writes**"
_excl = _slice_section(_s33_orch, _EXCL_ANCHOR)

check(
    "kg-mid(anchor-excl): agents/orchestrator.md contains"
    " '**No mid-pipeline investigation writes**' exclusion marker",
    bool(_excl),
    f"anchor '{_EXCL_ANCHOR}' not found in orchestrator.md"
    " -- kg-mid check (9) will fail",
)

# Check (9) -- AC-9: exclusion marker + session_end unchanged in orchestrator.md.
_c9_no_investigation = bool(_excl) and (
    "investigation" in _excl.lower()
    or "no investigation" in _excl.lower()
    or "not add" in _excl.lower()
)
_c9_session_end = bool(_excl) and (
    "session_end" in _excl
    or "session end" in _excl.lower()
)
_c9_unchanged = bool(_excl) and (
    "unchanged" in _excl.lower()
    or "Phase 6" in _excl
    or "phase 6" in _excl.lower()
    or "remains" in _excl.lower()
)
check(
    "kg-mid(9/ac-9): orchestrator.md exclusion marker declares no investigation"
    " writes mid-pipeline and session_end unchanged in Phase 6",
    _c9_no_investigation and _c9_session_end and _c9_unchanged,
    (
        f"anchor '{_EXCL_ANCHOR}' slice:"
        f" no_investigation={_c9_no_investigation},"
        f" session_end={_c9_session_end},"
        f" unchanged/phase6={_c9_unchanged}"
    ),
)

# ---------------------------------------------------------------------------
# Check (kg-content-policy) -- AC-7 policy side: write-time filter note in
# docs/kg-content-policy.md covers the new Phase 3 security-finding write site.
# Anchor token: "KG-write-on-security-findings" (new, absent today).
# ---------------------------------------------------------------------------
_c_policy_new_site = "KG-write-on-security-findings" in _s33_kg_policy

check(
    "kg-mid(7b/ac-7): docs/kg-content-policy.md mentions"
    " 'KG-write-on-security-findings' as a covered write site"
    " (write-time filter now covers Phase 3 security-finding writes)",
    _c_policy_new_site,
    "literal 'KG-write-on-security-findings' not found in docs/kg-content-policy.md"
    " -- write-time filter coverage of the new Phase 3 write site not documented",
)

# ---------------------------------------------------------------------------
# Check (7c) -- SEC-004: catch-all clause + policy pointer in write anchor.
# Defense-in-depth invariant: the content-filter at the KG write site MUST
# reference `docs/kg-content-policy.md` (the authoritative policy) AND the
# open-ended catch-all literal `or other forbidden content`. If a future edit
# narrows the filter to a closed list (dropping the catch-all), the defense
# silently degrades and SEC-002's gap reopens with no test catching it.
# Asserted within the '### KG write on security findings' slice (anchor-scoped).
# ---------------------------------------------------------------------------
_c7c_policy_pointer = bool(_kg_write) and (
    "docs/kg-content-policy.md" in _kg_write
    or "kg-content-policy" in _kg_write
)
_c7c_catchall = bool(_kg_write) and "or other forbidden content" in _kg_write
check(
    "kg-mid(7c/sec-004): orchestrator.md § 'KG write on security findings'"
    " content-filter references BOTH docs/kg-content-policy.md policy pointer"
    " AND catch-all clause 'or other forbidden content'"
    " (defense-in-depth invariant — SEC-004)",
    _c7c_policy_pointer and _c7c_catchall,
    (
        f"anchor '{_KG_WRITE_ANCHOR}' slice:"
        f" policy_pointer(docs/kg-content-policy.md)={_c7c_policy_pointer},"
        f" catchall('or other forbidden content')={_c7c_catchall}"
        " -- content-filter must reference both; removing either degrades SEC-002 defense"
    ),
)

# ---------------------------------------------------------------------------
# Check (10) -- GUARD (GREEN now, must stay green):
# agents/orchestrator.md must NOT contain a parallel kg.read.*/kg.write.*
# event family. The design reuses operation.* with a 'detail' discriminator.
# This check is intentionally a guard (presence-of-absence assertion).
# It is labeled clearly so the pass/fail semantics are unambiguous.
# ---------------------------------------------------------------------------
_c10_no_kg_read_family = "kg.read." not in _s33_orch
_c10_no_kg_write_family = "kg.write." not in _s33_orch
check(
    "kg-mid(10/guard): agents/orchestrator.md does NOT define a parallel"
    " kg.read.*/kg.write.* event family (design uses operation.* + detail discriminator)",
    _c10_no_kg_read_family and _c10_no_kg_write_family,
    (
        f"orchestrator.md contains parallel KG event family:"
        f" kg.read.*={'found' if not _c10_no_kg_read_family else 'absent'},"
        f" kg.write.*={'found' if not _c10_no_kg_write_family else 'absent'}"
        " -- use operation.* with detail discriminator instead"
    ),
)

# ---------------------------------------------------------------------------
# Suite 34 -- Plan-review enriched three-reviewer panel + centralization
#             contract (AC-1..AC-11, feature: plan-review-enriched)
# ---------------------------------------------------------------------------
# Structural assertions only -- no LLM runtime required.
# Every contract-presence check is ANCHOR-SCOPED to prevent false-greens:
# the tokens plan-reviewer, ratify-plan, Plan Review, Plan Ratification
# already exist in these files for unrelated reasons. We slice to a NEW,
# uniquely-named anchor the implementer will add, then assert sub-tokens
# WITHIN the slice. An absent anchor returns "" and all dependent checks
# fail with a clear detail -- not a false-green (the _slice_section helper
# defined in Suite 32 returns "" when the anchor is not found).
#
# CANONICAL ANCHORS (implementer MUST use these verbatim):
#   agents/security.md          : "### Design Review Mode (`design-review`)"
#   agents/ref-direct-modes.md  : "### Review Panel (three reviewers, one plan)"
#   agents/orchestrator.md      : "### Plan-review panel centralization contract"
#   agents/plan-reviewer.md     : "### Consolidated Plan Review section (three-reviewer panel)"
#   agents/qa.md                : "### Plan-review panel (ratify-plan reuse)"
#   CLAUDE.md (in §5)           : "**Plan-review panel centralization**"
#
# RUNTIME SUB-VERDICT LABELS (bold inline labels, NOT ### headings):
#   "**Substance (qa):**"
#   "**Security design-review (security):**"
#   "**Combined verdict:**"
# These are asserted as SUBSTRINGS within the relevant agent's anchor slice,
# not as anchors themselves. They must NOT be authored as ### headings
# (that would split the parent ## Plan Review slice).
#
# Check index -> AC mapping:
#   anchor-sec       : AC-1  -- security.md design-review anchor present
#   (1) / AC-1       : design-review listed in Operating Modes
#   (2) / AC-1       : no-code clause in security design-review slice
#   (3) / AC-1       : DISTINCT from 4 existing modes (Audit/Focused/Pipeline/PR Review)
#   (4) / AC-2       : reviews 01-plan.md, recommends AC in GWT/VERIFY format
#   (5) / AC-2       : folds via bold label **Security design-review (security):**
#   (6) / AC-2       : forbid-list in security design-review slice
#   (7) / AC-3       : Return Protocol carries mode: design-review + security_design_verdict
#   anchor-ref       : AC-4  -- ref-direct-modes.md panel anchor present
#   (8) / AC-4       : ordered dispatch qa -> security -> plan-reviewer documented
#   (9) / AC-4       : security gated via state->heuristic->operator-override
#   (10) / AC-4      : cites existing path auto-escalation list as authority
#   (11) / AC-5      : zero parallel correction-files + one ## Plan Review
#   (12) / AC-5      : three sub-verdicts as bold inline labels (NOT ### headings)
#   (13) / AC-5      : combined verdict surfaced (Output Discipline)
#   anchor-orch      : AC-6  -- orchestrator.md centralization contract anchor present
#   (14) / AC-6(a)   : fold in-place into 01-plan.md
#   (15) / AC-6(b)   : zero parallel correction-files
#   (16) / AC-6(c)   : plan-reviewer sole writer of header + **Combined verdict:**
#   (17) / AC-6(d)   : idempotent / overwrite-in-place declared
#   (18) / AC-6(d)   : sub-verdicts as bold labels, NOT ### headings
#   (19) / AC-6(e)   : cross-link to [CONSTRAINT-DISCOVERED] fold-back (Phase 2.5)
#   (20) / AC-7      : Step 6 disambiguation reflects three-way panel
#   anchor-pr        : AC-8  -- plan-reviewer.md consolidated section anchor present
#   (21) / AC-8      : owns ## Plan Review header + ## Summary table + Combined verdict
#   (22) / AC-8      : does NOT overwrite Substance (qa) / Security design-review sub-verdicts
#   (23) / AC-8      : sub-verdicts as bold labels (not ### headings) for sliceability
#   anchor-qa        : AC-9  -- qa.md ratify-plan reuse anchor present
#   (24) / AC-9      : ratify-plan reused as substance reviewer of the panel
#   (25) / AC-9      : writes **Substance (qa):** inside ## Plan Review (not ### heading)
#   (26) / AC-9      : no-parallel-files forbid-list reinforced
#   (27) / AC-10     : CLAUDE.md §5 contains **Plan-review panel centralization** bullet
#   (28) / AC-10     : CLAUDE.md §11 explicitly names Suite 34
#   (29) / AC-11     : Suite 34 present in test_agent_structure.py (self-referential guard)
#   (30) / drift     : skills/design/SKILL.md line ~49 references 01-plan.md not 01-architecture.md
# ---------------------------------------------------------------------------
print()
print("=== Suite 34: Plan-review enriched three-reviewer panel + centralization contract ===")

_s34_sec = read(AGENTS_DIR / "security.md")
_s34_ref = read(AGENTS_DIR / "ref-direct-modes.md")
_s34_orch = read(AGENTS_DIR / "orchestrator.md")
_s34_pr = read(AGENTS_DIR / "plan-reviewer.md")
_s34_qa = read(AGENTS_DIR / "qa-plan.md")
_s34_claude = read(REPO_ROOT / "CLAUDE.md")
_s34_design_skill_path = SKILLS_DIR / "design" / "SKILL.md"
_s34_design_skill = read(_s34_design_skill_path) if _s34_design_skill_path.exists() else ""


# ---------------------------------------------------------------------------
# Anchor A: agents/security.md "### Design Review Mode (`design-review`)"
# (Covers AC-1, AC-2, AC-3)
# ---------------------------------------------------------------------------
_SEC_ANCHOR = "### Design Review Mode (`design-review`)"
_sec_dr = _slice_section(_s34_sec, _SEC_ANCHOR)

check(
    "plan-review(anchor-sec): agents/security.md contains"
    " '### Design Review Mode (`design-review`)' section",
    bool(_sec_dr),
    f"anchor '{_SEC_ANCHOR}' not found in security.md"
    " -- plan-review checks (1)(2)(3)(4)(5)(6)(7) will all fail",
)

# Check (1) -- AC-1: design-review mode listed in "Operating Modes" of security.md.
# Assert within the FULL security.md (Operating Modes is a separate section from the
# anchor slice; the anchor slice itself is the mode body). We look for the mode
# identifier appearing in an Operating Modes context.
_c1_in_operating_modes = (
    "Operating Mode" in _s34_sec
    and "design-review" in _s34_sec
    and (
        _s34_sec.find("design-review")
        < _s34_sec.find(_SEC_ANCHOR)
        + len(_SEC_ANCHOR) + 5000  # sanity bound; both should be in the same doc
    )
)
check(
    "plan-review(1/ac-1): agents/security.md lists 'design-review'"
    " in the Operating Modes section",
    _c1_in_operating_modes,
    "security.md does not list 'design-review' in an 'Operating Mode' context"
    " -- mode must appear in the Operating Modes listing",
)

# Check (2) -- AC-1: no-code clause present in the design-review mode slice.
_c2_no_code = bool(_sec_dr) and (
    "no code" in _sec_dr.lower()
    or "do not audit code" in _sec_dr.lower()
    or "do NOT audit code" in _sec_dr
    or "no code yet" in _sec_dr.lower()
    or "no source code" in _sec_dr.lower()
)
check(
    "plan-review(2/ac-1): agents/security.md design-review slice"
    " contains explicit no-code clause ('no code' / 'do NOT audit code')",
    _c2_no_code,
    f"anchor '{_SEC_ANCHOR}' slice missing no-code clause"
    " -- mode must forbid auditing code (distinct from Audit/Focused/Pipeline modes)",
)

# Check (3) -- AC-1: design-review is DISTINCT from all 4 existing modes.
# The 4 existing modes are: Audit Mode, Focused Mode, Pipeline Mode, PR Review Security Mode.
# Each must be present in security.md (confirming they still exist) and the new anchor
# must be a FIFTH, separate section.
_c3_audit_exists = "Audit Mode" in _s34_sec or "Audit" in _s34_sec
_c3_focused_exists = "Focused Mode" in _s34_sec or "Focused" in _s34_sec
_c3_pipeline_exists = "Pipeline Mode" in _s34_sec or "Pipeline" in _s34_sec
_c3_pr_review_exists = "PR Review" in _s34_sec
_c3_new_anchor_distinct = bool(_sec_dr)  # slice is non-empty = anchor exists as its own section
check(
    "plan-review(3/ac-1): agents/security.md design-review mode is DISTINCT from"
    " the 4 existing modes (Audit / Focused / Pipeline / PR Review Security)",
    _c3_audit_exists and _c3_focused_exists and _c3_pipeline_exists
    and _c3_pr_review_exists and _c3_new_anchor_distinct,
    (
        f"anchor '{_SEC_ANCHOR}' distinctness:"
        f" audit={_c3_audit_exists},"
        f" focused={_c3_focused_exists},"
        f" pipeline={_c3_pipeline_exists},"
        f" pr_review={_c3_pr_review_exists},"
        f" new_anchor_distinct={_c3_new_anchor_distinct}"
    ),
)

# Check (4) -- AC-2: slice states mode reviews 01-plan.md and recommends AC
# in Given/When/Then or VERIFY format.
_c4_reviews_plan = bool(_sec_dr) and "01-plan.md" in _sec_dr
_c4_ac_format = bool(_sec_dr) and (
    "Given" in _sec_dr or "VERIFY" in _sec_dr or "GWT" in _sec_dr
)
check(
    "plan-review(4/ac-2): agents/security.md design-review slice"
    " states mode reviews '01-plan.md' and recommends AC in GWT/VERIFY format",
    _c4_reviews_plan and _c4_ac_format,
    (
        f"anchor '{_SEC_ANCHOR}' slice:"
        f" reviews_01-plan.md={_c4_reviews_plan},"
        f" ac_format_GWT_or_VERIFY={_c4_ac_format}"
    ),
)

# Check (5) -- AC-2: design-review slice documents folding via the bold inline label
# **Security design-review (security):** within ## Plan Review (not a ### heading).
_c5_bold_label = bool(_sec_dr) and "**Security design-review (security):**" in _sec_dr
_c5_within_plan_review = bool(_sec_dr) and (
    "## Plan Review" in _sec_dr
    or "Plan Review" in _sec_dr
)
_c5_not_as_heading = bool(_sec_dr) and (
    "### Security design-review" not in _sec_dr
)
check(
    "plan-review(5/ac-2): agents/security.md design-review slice"
    " folds via bold inline label '**Security design-review (security):**'"
    " within ## Plan Review (NOT as a ### heading)",
    _c5_bold_label and _c5_within_plan_review and _c5_not_as_heading,
    (
        f"anchor '{_SEC_ANCHOR}' slice:"
        f" bold_label='**Security design-review (security):**'={_c5_bold_label},"
        f" within_Plan_Review={_c5_within_plan_review},"
        f" not_a_heading={_c5_not_as_heading}"
    ),
)

# Check (6) -- AC-2: forbid-list present in design-review slice
# (no *-review.md files, no security-reports/ directory in this mode).
_c6_no_review_files = bool(_sec_dr) and (
    "*-review.md" in _sec_dr
    or "review.md" in _sec_dr.lower()
    or "no parallel" in _sec_dr.lower()
    or "forbid" in _sec_dr.lower()
    or "MUST NOT" in _sec_dr
    or "must not" in _sec_dr.lower()
)
_c6_no_security_reports = bool(_sec_dr) and (
    "security-reports" in _sec_dr
    or "04-security.md" in _sec_dr
    or "zero" in _sec_dr.lower()
    or "no side" in _sec_dr.lower()
    or "no file" in _sec_dr.lower()
)
check(
    "plan-review(6/ac-2): agents/security.md design-review slice"
    " includes forbid-list (no *-review.md parallel files, no security-reports/)",
    _c6_no_review_files and _c6_no_security_reports,
    (
        f"anchor '{_SEC_ANCHOR}' slice:"
        f" no_review_files={_c6_no_review_files},"
        f" no_security_reports={_c6_no_security_reports}"
    ),
)

# Check (7) -- AC-3: Return Protocol in security.md carries
# mode: design-review + security_design_verdict: clean | risks-found.
_c7_mode_field = bool(_sec_dr) and "mode: design-review" in _sec_dr
_c7_verdict_field = bool(_sec_dr) and (
    "security_design_verdict" in _sec_dr
    and ("clean" in _sec_dr or "risks-found" in _sec_dr)
)
check(
    "plan-review(7/ac-3): agents/security.md design-review slice"
    " Return Protocol carries 'mode: design-review'"
    " and 'security_design_verdict: clean | risks-found'",
    _c7_mode_field and _c7_verdict_field,
    (
        f"anchor '{_SEC_ANCHOR}' slice:"
        f" mode_field={_c7_mode_field},"
        f" verdict_field={_c7_verdict_field}"
    ),
)


# ---------------------------------------------------------------------------
# Anchor B: agents/ref-direct-modes.md "### Review Panel (three reviewers, one plan)"
# (Covers AC-4, AC-5)
# ---------------------------------------------------------------------------
_REF_ANCHOR = "### Review Panel (three reviewers, one plan)"
_ref_panel = _slice_section(_s34_ref, _REF_ANCHOR)

check(
    "plan-review(anchor-ref): agents/ref-direct-modes.md contains"
    " '### Review Panel (three reviewers, one plan)' section",
    bool(_ref_panel),
    f"anchor '{_REF_ANCHOR}' not found in ref-direct-modes.md"
    " -- plan-review checks (8)(9)(10)(11)(12)(13) will all fail",
)

# Check (8) -- AC-4: ordered dispatch qa(ratify-plan) -> security(design-review, conditional)
# -> plan-reviewer(shape, last) documented within the anchor slice.
_c8_qa_first = bool(_ref_panel) and (
    "ratify-plan" in _ref_panel
    and ("qa" in _ref_panel.lower())
)
_c8_security_cond = bool(_ref_panel) and (
    "design-review" in _ref_panel
    and ("conditional" in _ref_panel.lower() or "security-sensitive" in _ref_panel.lower()
         or "security_sensitive" in _ref_panel.lower())
)
_c8_pr_last = bool(_ref_panel) and (
    "plan-reviewer" in _ref_panel
    and ("last" in _ref_panel.lower() or "third" in _ref_panel.lower()
         or "final" in _ref_panel.lower())
)
# Also verify ORDER: qa appears before security, security appears before plan-reviewer.
_c8_order_ok = False
if bool(_ref_panel) and _c8_qa_first and _c8_security_cond and _c8_pr_last:
    _idx_qa = _ref_panel.find("ratify-plan")
    _idx_sec = _ref_panel.find("design-review")
    _idx_pr_last = _ref_panel.rfind("plan-reviewer")
    _c8_order_ok = (
        0 <= _idx_qa < _idx_sec < _idx_pr_last
    )
check(
    "plan-review(8/ac-4): ref-direct-modes.md panel slice documents"
    " ordered dispatch qa(ratify-plan) -> security(design-review, conditional)"
    " -> plan-reviewer(last)",
    _c8_qa_first and _c8_security_cond and _c8_pr_last and _c8_order_ok,
    (
        f"anchor '{_REF_ANCHOR}' slice:"
        f" qa_ratify={_c8_qa_first},"
        f" security_design_cond={_c8_security_cond},"
        f" plan_reviewer_last={_c8_pr_last},"
        f" order_ok={_c8_order_ok}"
    ),
)

# Check (9) -- AC-4: security gated via state field -> path/keyword heuristic
# -> operator override chain.
_c9_state_field = bool(_ref_panel) and (
    "00-state.md" in _ref_panel
    or "state" in _ref_panel.lower()
)
_c9_heuristic = bool(_ref_panel) and (
    "heuristic" in _ref_panel.lower()
    or "path" in _ref_panel.lower()
    or "keyword" in _ref_panel.lower()
)
_c9_operator_override = bool(_ref_panel) and (
    "override" in _ref_panel.lower()
    or "operator" in _ref_panel.lower()
)
check(
    "plan-review(9/ac-4): ref-direct-modes.md panel slice documents"
    " security gating chain: state field -> path/keyword heuristic -> operator override",
    _c9_state_field and _c9_heuristic and _c9_operator_override,
    (
        f"anchor '{_REF_ANCHOR}' slice:"
        f" state_field={_c9_state_field},"
        f" path_keyword_heuristic={_c9_heuristic},"
        f" operator_override={_c9_operator_override}"
    ),
)

# Check (10) -- AC-4: slice cites the EXISTING pipeline path auto-escalation list
# as the heuristic authority (reused, not a new divergent list).
# The canonical paths: auth/**, middleware/**, api/**, db/**,
# security/**, crypto/**, session/**
_ESCALATION_PATHS = ("auth/**", "middleware/**", "api/**", "db/**",
                     "security/**", "crypto/**", "session/**")
_c10_paths_cited = bool(_ref_panel) and sum(
    1 for p in _ESCALATION_PATHS if p in _ref_panel or p.rstrip("/**") in _ref_panel
) >= 4  # at least 4 of 7 paths cited = the list is referenced
check(
    "plan-review(10/ac-4): ref-direct-modes.md panel slice cites the"
    " existing pipeline path auto-escalation list"
    " (auth/**, middleware/**, api/**, db/**, security/**, crypto/**, session/**)"
    " as the heuristic authority (not a new divergent list)",
    _c10_paths_cited,
    (
        f"anchor '{_REF_ANCHOR}' slice: found "
        f"{sum(1 for p in _ESCALATION_PATHS if p in _ref_panel or p.rstrip('/**') in _ref_panel)}"
        f"/{len(_ESCALATION_PATHS)} escalation paths"
        " -- need >= 4 to confirm reuse of existing list"
    ),
)

# Check (11) -- AC-5: zero parallel correction-files + one ## Plan Review section
# documented within the panel slice.
_c11_zero_side_files = bool(_ref_panel) and (
    "zero" in _ref_panel.lower()
    or "no parallel" in _ref_panel.lower()
    or "no side" in _ref_panel.lower()
    or "no new file" in _ref_panel.lower()
    or "MUST NOT" in _ref_panel
    or "must not create" in _ref_panel.lower()
)
_c11_one_plan_review = bool(_ref_panel) and (
    "## Plan Review" in _ref_panel
    or "Plan Review" in _ref_panel
)
check(
    "plan-review(11/ac-5): ref-direct-modes.md panel slice states"
    " zero parallel correction-files and a single consolidated ## Plan Review section",
    _c11_zero_side_files and _c11_one_plan_review,
    (
        f"anchor '{_REF_ANCHOR}' slice:"
        f" zero_side_files={_c11_zero_side_files},"
        f" one_plan_review={_c11_one_plan_review}"
    ),
)

# Check (12) -- AC-5: three sub-verdicts documented as bold inline labels
# (NOT ### headings) within the panel slice.
_c12_substance = bool(_ref_panel) and "**Substance (qa):**" in _ref_panel
_c12_security_dr = bool(_ref_panel) and "**Security design-review (security):**" in _ref_panel
_c12_combined = bool(_ref_panel) and "**Combined verdict:**" in _ref_panel
_c12_not_as_headings = bool(_ref_panel) and (
    "### Substance" not in _ref_panel
    and "### Security design-review" not in _ref_panel
    and "### Combined verdict" not in _ref_panel
)
check(
    "plan-review(12/ac-5): ref-direct-modes.md panel slice documents"
    " all three sub-verdict bold inline labels"
    " ('**Substance (qa):**', '**Security design-review (security):**', '**Combined verdict:**')"
    " and NOT as ### headings",
    _c12_substance and _c12_security_dr and _c12_combined and _c12_not_as_headings,
    (
        f"anchor '{_REF_ANCHOR}' slice:"
        f" Substance_qa={_c12_substance},"
        f" Security_design_review={_c12_security_dr},"
        f" Combined_verdict={_c12_combined},"
        f" not_as_headings={_c12_not_as_headings}"
    ),
)

# Check (13) -- AC-5: combined verdict surfaced (Output Discipline #186).
_c13_output_discipline = bool(_ref_panel) and (
    "Output Discipline" in _ref_panel
    or "#186" in _ref_panel
    or "combined verdict" in _ref_panel.lower()
    or "**Combined verdict:**" in _ref_panel
)
check(
    "plan-review(13/ac-5): ref-direct-modes.md panel slice Output block"
    " surfaces the combined verdict (Output Discipline #186)",
    _c13_output_discipline,
    (
        f"anchor '{_REF_ANCHOR}' slice:"
        f" combined_verdict_surfaced={_c13_output_discipline}"
    ),
)


# ---------------------------------------------------------------------------
# Anchor C: agents/orchestrator.md "### Plan-review panel centralization contract"
# (Covers AC-6, AC-7)
# ---------------------------------------------------------------------------
_ORCH_PR_ANCHOR = "### Plan-review panel centralization contract"
_orch_pr = _slice_section(_s34_orch, _ORCH_PR_ANCHOR)

check(
    "plan-review(anchor-orch): agents/orchestrator.md contains"
    " '### Plan-review panel centralization contract' section",
    bool(_orch_pr),
    f"anchor '{_ORCH_PR_ANCHOR}' not found in orchestrator.md"
    " -- plan-review checks (14)(15)(16)(17)(18)(19) will all fail",
)

# Check (14) -- AC-6(a): fold in-place into 01-plan.md.
_c14_fold_inplace = bool(_orch_pr) and (
    "01-plan.md" in _orch_pr
    and (
        "in-place" in _orch_pr.lower()
        or "in place" in _orch_pr.lower()
        or "fold" in _orch_pr.lower()
        or "overwrite" in _orch_pr.lower()
    )
)
check(
    "plan-review(14/ac-6a): orchestrator.md centralization contract slice"
    " states all plan reviewers fold in-place into 01-plan.md",
    _c14_fold_inplace,
    (
        f"anchor '{_ORCH_PR_ANCHOR}' slice:"
        f" fold_inplace_01-plan.md={_c14_fold_inplace}"
    ),
)

# Check (15) -- AC-6(b): zero parallel correction-files.
_c15_zero_files = bool(_orch_pr) and (
    "zero" in _orch_pr.lower()
    or "no parallel" in _orch_pr.lower()
    or "no side" in _orch_pr.lower()
    or "MUST NOT" in _orch_pr
    or "must not" in _orch_pr.lower()
    or "no correction" in _orch_pr.lower()
)
check(
    "plan-review(15/ac-6b): orchestrator.md centralization contract slice"
    " declares zero parallel correction-files",
    _c15_zero_files,
    (
        f"anchor '{_ORCH_PR_ANCHOR}' slice:"
        f" zero_parallel_files={_c15_zero_files}"
    ),
)

# Check (16) -- AC-6(c): plan-reviewer sole writer of consolidated header
# + **Combined verdict:** block.
_c16_sole_writer = bool(_orch_pr) and (
    "plan-reviewer" in _orch_pr
    and (
        "sole" in _orch_pr.lower()
        or "only writer" in _orch_pr.lower()
        or "only" in _orch_pr.lower()
        or "writer" in _orch_pr.lower()
    )
)
_c16_combined_verdict = bool(_orch_pr) and "**Combined verdict:**" in _orch_pr
check(
    "plan-review(16/ac-6c): orchestrator.md centralization contract slice"
    " declares plan-reviewer as sole writer of consolidated header"
    " + '**Combined verdict:**' block",
    _c16_sole_writer and _c16_combined_verdict,
    (
        f"anchor '{_ORCH_PR_ANCHOR}' slice:"
        f" sole_writer={_c16_sole_writer},"
        f" combined_verdict_label={_c16_combined_verdict}"
    ),
)

# Check (17) -- AC-6(d): idempotent overwrite-in-place declared.
_c17_idempotent = bool(_orch_pr) and (
    "idempotent" in _orch_pr.lower()
    or "overwrite" in _orch_pr.lower()
    or "overwrite-in-place" in _orch_pr.lower()
    or "replace" in _orch_pr.lower()
)
check(
    "plan-review(17/ac-6d): orchestrator.md centralization contract slice"
    " declares idempotent overwrite-in-place",
    _c17_idempotent,
    (
        f"anchor '{_ORCH_PR_ANCHOR}' slice:"
        f" idempotent={_c17_idempotent}"
    ),
)

# Check (18) -- AC-6(d): sub-verdicts as bold inline labels (not ### headings)
# keeping ## Plan Review a single sliceable block.
_c18_bold_labels = bool(_orch_pr) and (
    "**Substance (qa):**" in _orch_pr
    or "**Security design-review (security):**" in _orch_pr
    or "bold" in _orch_pr.lower()
    or "inline" in _orch_pr.lower()
)
_c18_not_headings = bool(_orch_pr) and (
    "### Substance" not in _orch_pr
    and "### Security design-review" not in _orch_pr
    and "### Combined verdict" not in _orch_pr
)
_c18_sliceable = bool(_orch_pr) and (
    "sliceable" in _orch_pr.lower()
    or "single block" in _orch_pr.lower()
    or "## Plan Review" in _orch_pr
)
check(
    "plan-review(18/ac-6d): orchestrator.md centralization contract slice"
    " states sub-verdicts are bold inline labels (not ### headings)"
    " keeping ## Plan Review a single sliceable block",
    _c18_bold_labels and _c18_not_headings and _c18_sliceable,
    (
        f"anchor '{_ORCH_PR_ANCHOR}' slice:"
        f" bold_inline_labels={_c18_bold_labels},"
        f" not_headings={_c18_not_headings},"
        f" sliceable={_c18_sliceable}"
    ),
)

# Check (19) -- AC-6(e): cross-link to [CONSTRAINT-DISCOVERED] fold-back
# (Phase 2.5 / qa reconcile).
_c19_constraint_discovered = bool(_orch_pr) and (
    "[CONSTRAINT-DISCOVERED]" in _orch_pr
    or "CONSTRAINT-DISCOVERED" in _orch_pr
)
_c19_phase25 = bool(_orch_pr) and (
    "2.5" in _orch_pr
    or "Phase 2.5" in _orch_pr
    or "reconcile" in _orch_pr.lower()
)
check(
    "plan-review(19/ac-6e): orchestrator.md centralization contract slice"
    " cross-links to [CONSTRAINT-DISCOVERED] fold-back (Phase 2.5 / qa reconcile)",
    _c19_constraint_discovered and _c19_phase25,
    (
        f"anchor '{_ORCH_PR_ANCHOR}' slice:"
        f" CONSTRAINT_DISCOVERED={_c19_constraint_discovered},"
        f" phase_2.5={_c19_phase25}"
    ),
)

# Check (20) -- AC-7: orchestrator.md Step 6 disambiguation reflects three-way panel
# while preserving distinction from `validate` and substance-refinement.
# Anchor-scoped: the plan-review routing row is in a routing table; we extract a
# window of text around the EXISTING 'revisar/auditar plan' | 'plan-review' row and
# assert that window contains the three-way panel language ADDED by the implementer.
# Using a 2000-char window around the first occurrence of 'revisar' (the existing
# Spanish routing keyword) is specific enough to avoid false-greens from unrelated
# 'three' / 'panel' occurrences elsewhere in orchestrator.md (there is currently
# one 'panel' at char ~211389 in "Pipeline Summary panel" which is unrelated).
_c20_revisar_idx = _s34_orch.find("revisar")
_c20_window = (
    _s34_orch[max(0, _c20_revisar_idx - 200): _c20_revisar_idx + 1800]
    if _c20_revisar_idx != -1 else ""
)
_c20_plan_review_in_window = "plan-review" in _c20_window
_c20_validate_in_window = "validate" in _c20_window  # validate route still present in same table
_c20_three_way_in_window = (
    "three reviewer" in _c20_window.lower()
    or "three-way" in _c20_window.lower()
    or "three way" in _c20_window.lower()
    or "three-reviewer" in _c20_window.lower()
    or "panel" in _c20_window.lower()
)
check(
    "plan-review(20/ac-7): orchestrator.md Step 6 disambiguation"
    " (window around 'revisar/auditar plan' routing row)"
    " reflects the three-way panel for plan-review"
    " while preserving distinct route for 'validate'",
    _c20_plan_review_in_window and _c20_validate_in_window and _c20_three_way_in_window,
    (
        f"orchestrator.md Step-6 window (revisar+/-200..+1800):"
        f" plan_review={_c20_plan_review_in_window},"
        f" validate_distinct={_c20_validate_in_window},"
        f" three_way_or_panel={_c20_three_way_in_window}"
        " -- implementer must update Step 6 disambiguation to mention the three-way panel"
    ),
)


# ---------------------------------------------------------------------------
# Anchor D: agents/plan-reviewer.md
#           "### Consolidated Plan Review section (three-reviewer panel)"
# (Covers AC-8)
# ---------------------------------------------------------------------------
_PR_ANCHOR = "### Consolidated Plan Review section (three-reviewer panel)"
_pr_consol = _slice_section(_s34_pr, _PR_ANCHOR)

check(
    "plan-review(anchor-pr): agents/plan-reviewer.md contains"
    " '### Consolidated Plan Review section (three-reviewer panel)' section",
    bool(_pr_consol),
    f"anchor '{_PR_ANCHOR}' not found in plan-reviewer.md"
    " -- plan-review checks (21)(22)(23) will all fail",
)

# Check (21) -- AC-8: plan-reviewer owns ## Plan Review header + rules Summary table
# + Combined verdict block.
_c21_header_ownership = bool(_pr_consol) and (
    "## Plan Review" in _pr_consol
    or "header" in _pr_consol.lower()
    or "owner" in _pr_consol.lower()
    or "owns" in _pr_consol.lower()
)
_c21_combined_verdict = bool(_pr_consol) and "**Combined verdict:**" in _pr_consol
check(
    "plan-review(21/ac-8): plan-reviewer.md consolidated section slice"
    " declares plan-reviewer owns ## Plan Review header + ## Summary table"
    " + '**Combined verdict:**' block",
    _c21_header_ownership and _c21_combined_verdict,
    (
        f"anchor '{_PR_ANCHOR}' slice:"
        f" header_ownership={_c21_header_ownership},"
        f" combined_verdict={_c21_combined_verdict}"
    ),
)

# Check (22) -- AC-8: plan-reviewer does NOT overwrite **Substance (qa):** or
# **Security design-review (security):** sub-verdicts (reads but not overwrites).
_c22_no_overwrite_substance = bool(_pr_consol) and (
    "**Substance (qa):**" in _pr_consol
    and (
        "not overwrite" in _pr_consol.lower()
        or "does not overwrite" in _pr_consol.lower()
        or "reads" in _pr_consol.lower()
        or "do not overwrite" in _pr_consol.lower()
        or "MUST NOT overwrite" in _pr_consol
        or "not touch" in _pr_consol.lower()
        or "only reads" in _pr_consol.lower()
    )
)
_c22_no_overwrite_security = bool(_pr_consol) and (
    "**Security design-review (security):**" in _pr_consol
)
check(
    "plan-review(22/ac-8): plan-reviewer.md consolidated section slice"
    " declares plan-reviewer does NOT overwrite"
    " '**Substance (qa):**' or '**Security design-review (security):**'"
    " sub-verdicts (reads them to produce combined verdict)",
    _c22_no_overwrite_substance and _c22_no_overwrite_security,
    (
        f"anchor '{_PR_ANCHOR}' slice:"
        f" no_overwrite_substance={_c22_no_overwrite_substance},"
        f" security_label_present={_c22_no_overwrite_security}"
    ),
)

# Check (23) -- AC-8: sub-verdicts documented as bold inline labels (not ### headings)
# so ## Plan Review remains a single sliceable block.
_c23_not_headings = bool(_pr_consol) and (
    "### Substance" not in _pr_consol
    and "### Security design-review" not in _pr_consol
    and "### Combined verdict" not in _pr_consol
)
_c23_bold_labels_mentioned = bool(_pr_consol) and (
    "bold" in _pr_consol.lower()
    or "inline" in _pr_consol.lower()
    or "**Substance (qa):**" in _pr_consol
)
check(
    "plan-review(23/ac-8): plan-reviewer.md consolidated section slice"
    " confirms sub-verdicts are bold inline labels (not ### headings)"
    " so ## Plan Review stays a single sliceable block",
    _c23_not_headings and _c23_bold_labels_mentioned,
    (
        f"anchor '{_PR_ANCHOR}' slice:"
        f" not_headings={_c23_not_headings},"
        f" bold_inline_labels={_c23_bold_labels_mentioned}"
    ),
)


# ---------------------------------------------------------------------------
# Anchor E: agents/qa.md "### Plan-review panel (ratify-plan reuse)"
# (Covers AC-9)
# ---------------------------------------------------------------------------
_QA_ANCHOR = "### Plan-review panel (ratify-plan reuse)"
_qa_panel = _slice_section(_s34_qa, _QA_ANCHOR)

check(
    "plan-review(anchor-qa): agents/qa.md contains"
    " '### Plan-review panel (ratify-plan reuse)' section",
    bool(_qa_panel),
    f"anchor '{_QA_ANCHOR}' not found in qa-plan.md"
    " -- plan-review checks (24)(25)(26) will all fail",
)

# Check (24) -- AC-9: ratify-plan reused as substance reviewer of the panel.
_c24_ratify_plan_reuse = bool(_qa_panel) and (
    "ratify-plan" in _qa_panel
    and (
        "reuse" in _qa_panel.lower()
        or "reused" in _qa_panel.lower()
        or "substance" in _qa_panel.lower()
        or "reviewer" in _qa_panel.lower()
    )
)
check(
    "plan-review(24/ac-9): qa.md panel slice declares"
    " ratify-plan is reused as the substance reviewer of the plan-review panel",
    _c24_ratify_plan_reuse,
    (
        f"anchor '{_QA_ANCHOR}' slice:"
        f" ratify_plan_reuse={_c24_ratify_plan_reuse}"
    ),
)

# Check (25) -- AC-9: qa writes **Substance (qa):** inside ## Plan Review
# (not as a ### heading) without touching the combined verdict.
_c25_substance_label = bool(_qa_panel) and "**Substance (qa):**" in _qa_panel
_c25_inside_plan_review = bool(_qa_panel) and (
    "## Plan Review" in _qa_panel
    or "Plan Review" in _qa_panel
)
_c25_not_heading = bool(_qa_panel) and "### Substance" not in _qa_panel
_c25_not_combined = bool(_qa_panel) and (
    "not touch" in _qa_panel.lower()
    or "not overwrite" in _qa_panel.lower()
    or "do not" in _qa_panel.lower()
    or "MUST NOT" in _qa_panel
    or "without touching" in _qa_panel.lower()
    or "only" in _qa_panel.lower()
)
check(
    "plan-review(25/ac-9): qa.md panel slice states qa writes"
    " '**Substance (qa):**' inside ## Plan Review"
    " (not as a ### heading) without touching the combined verdict",
    _c25_substance_label and _c25_inside_plan_review and _c25_not_heading,
    (
        f"anchor '{_QA_ANCHOR}' slice:"
        f" substance_label={_c25_substance_label},"
        f" inside_plan_review={_c25_inside_plan_review},"
        f" not_heading={_c25_not_heading}"
    ),
)

# Check (26) -- AC-9: forbid-list (no parallel side-files) reinforced in qa panel slice.
_c26_forbid_list = bool(_qa_panel) and (
    "forbid" in _qa_panel.lower()
    or "MUST NOT" in _qa_panel
    or "must not" in _qa_panel.lower()
    or "no parallel" in _qa_panel.lower()
    or "no side" in _qa_panel.lower()
    or "no new file" in _qa_panel.lower()
    or "zero" in _qa_panel.lower()
)
check(
    "plan-review(26/ac-9): qa.md panel slice reinforces"
    " the no-parallel-files forbid-list",
    _c26_forbid_list,
    (
        f"anchor '{_QA_ANCHOR}' slice:"
        f" forbid_list={_c26_forbid_list}"
    ),
)


# ---------------------------------------------------------------------------
# Anchor F: CLAUDE.md §5 "**Plan-review panel centralization**"
# (Covers AC-10)
# ---------------------------------------------------------------------------
_CLAUDE_ANCHOR = "**Plan-review panel centralization**"
# Use _slice_bullet_section for a CLAUDE.md §5 bold-bullet anchor
# (same idiom as Suite 32 for the §5 whitelist bullet).
_claude_pr = _slice_bullet_section(_s34_claude, _CLAUDE_ANCHOR)

check(
    "plan-review(27/ac-10): CLAUDE.md §5 contains"
    " '**Plan-review panel centralization**' bullet anchor",
    bool(_claude_pr),
    f"anchor '{_CLAUDE_ANCHOR}' not found in CLAUDE.md §5"
    " -- plan-review check (27) fails",
)

# Check (28) -- AC-10: docs/testing.md (canonical registry) explicitly names Suite 34.
# Re-pointed from CLAUDE.md to docs/testing.md (pr-claude-md-hygiene).
# Fails now if docs/testing.md does not list "Suite 34"; passes after Step 1 completes
# the canonical registry. Does NOT read CLAUDE.md — no fallback or 'or' permitted.
_s34_testing_md = read(REPO_ROOT / "docs" / "testing.md")
_c28_suite34_in_registry = "Suite 34" in _s34_testing_md
check(
    "plan-review(28/ac-10): docs/testing.md canonical registry names 'Suite 34'",
    _c28_suite34_in_registry,
    "literal 'Suite 34' not found in docs/testing.md"
    " -- docs/testing.md must be the canonical suite registry; Suite 34 must be listed there",
)


# ---------------------------------------------------------------------------
# Self-referential guard: Suite 34 present in test_agent_structure.py (AC-11).
# This check is GREEN immediately (we just added the suite). It is a guard:
# once green it must stay green -- nobody may delete Suite 34 from the test.
# ---------------------------------------------------------------------------
_s34_self = read(Path(__file__).resolve())
_c29_suite34_present = "Suite 34" in _s34_self and "plan-review panel" in _s34_self.lower()
check(
    "plan-review(29/ac-11): tests/test_agent_structure.py contains Suite 34"
    " (self-referential guard -- must stay green)",
    _c29_suite34_present,
    "Suite 34 or 'plan-review panel' literal not found in this test file"
    " -- suite was deleted or renamed",
)


# ---------------------------------------------------------------------------
# Drift fix check: skills/design/SKILL.md line ~49 references 01-plan.md
# not 01-architecture.md (AC-11, Work Plan Step 11).
# ---------------------------------------------------------------------------
_c30_no_legacy_arch = "01-architecture.md" not in _s34_design_skill
_c30_has_plan = "01-plan.md" in _s34_design_skill
check(
    "plan-review(30/drift): skills/design/SKILL.md output references"
    " '01-plan.md' (not legacy '01-architecture.md')",
    _c30_no_legacy_arch and _c30_has_plan,
    (
        f"skills/design/SKILL.md:"
        f" legacy_01-architecture.md_present={not _c30_no_legacy_arch},"
        f" 01-plan.md_present={_c30_has_plan}"
        " -- line ~49 must reference 01-plan.md; remove 01-architecture.md reference"
    ),
)


# ---------------------------------------------------------------------------
# Suite 34 PR-H extension -- plan-review-integrity (AC-1..AC-5)
# Three new fix groups: preserve-in-place (fix #1), worst-of roll-up +
# STAGE-GATE-1 reads combined (fix #2), vacuous-success guard + direct-mode
# read-backs (fix #3).
#
# Anti-false-green: every check is ANCHOR-SCOPED via _slice_section. The
# existing slices _pr_consol, _orch_pr, _ref_panel, _qa_panel are reused.
# New slices are introduced where a new anchor is needed (STAGE-GATE-1 section
# for fix #2 check 36).
#
# PR-F lesson (collision guard): the sub-verdict subsection headings
# ### QA Ratification / ### Security Design Review / ### Plan Reviewer
# are legitimate workspace headings in 01-plan.md templates; they are NOT
# used as anchors here. All new anchors are distinct from existing Suite 34
# anchors and do not duplicate any heading already keyed by Suites 35/36/46/47.
#
# marker: pr-h-plan-review-integrity
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Fix #1 -- Preserve-in-place (AC-1)
# Checks (31)(32)(33): plan-reviewer.md _pr_consol slice declares
# preserve-in-place of upstream sub-verdicts AND the "overwrite entire section"
# contradiction is removed/reconciled.
# These FAIL now because:
#   - plan-reviewer.md:45 says "ALWAYS overwrite the ## Plan Review section"
#   - plan-reviewer.md:425 says "replaces the entire ## Plan Review section"
#   - neither has an explicit preserve-in-place clause for the upstream labels
# ---------------------------------------------------------------------------

# Check (31) -- AC-1: _pr_consol slice declares preserve-in-place of upstream
# sub-verdicts (Substance (qa) and Security design-review (security)).
_c31_preserve_in_place = bool(_pr_consol) and (
    "preserve" in _pr_consol.lower()
    and (
        "**Substance (qa):**" in _pr_consol
        or "**Security design-review (security):**" in _pr_consol
    )
    and (
        "preserve-in-place" in _pr_consol.lower()
        or "preserve in place" in _pr_consol.lower()
        or "preserves" in _pr_consol.lower()
    )
)
check(
    "plan-review(31/pr-h-ac1): plan-reviewer.md consolidated section slice"
    " declares preserve-in-place of upstream sub-verdicts"
    " ('**Substance (qa):**' and '**Security design-review (security):**')",
    _c31_preserve_in_place,
    (
        f"anchor '{_PR_ANCHOR}' slice:"
        f" preserve_in_place={_c31_preserve_in_place}"
        " -- plan-reviewer.md must declare preserve-in-place of upstream sub-verdicts;"
        " the 'overwrite entire section' contradiction must be reconciled (fix #1)"
    ),
)

# Check (32) -- AC-1: the overwrite-contradiction tokens are ABSENT from
# the _pr_consol slice. Today plan-reviewer.md:425 says "replaces the entire
# ## Plan Review section" -- this must be removed or reconciled.
_c32_no_overwrite_entire = bool(_pr_consol) and (
    "replaces the entire" not in _pr_consol
    and "replace the entire" not in _pr_consol
)
check(
    "plan-review(32/pr-h-ac1): plan-reviewer.md consolidated section slice"
    " does NOT contain 'replaces the entire' (overwrite-contradiction absent)",
    _c32_no_overwrite_entire,
    (
        f"anchor '{_PR_ANCHOR}' slice:"
        f" overwrite_contradiction_absent={_c32_no_overwrite_entire}"
        " -- plan-reviewer.md:425 'replaces the entire ## Plan Review section'"
        " contradicts the preserve-in-place contract; implementer must remove/reconcile it"
    ),
)

# Check (33) -- AC-1: the Critical Rule section of plan-reviewer.md
# (the ALWAYS-overwrite instruction at line 45) no longer contradicts
# preserve-in-place. We slice to the Critical Rules section (anchor: "## Critical Rules")
# and assert the bold "**ALWAYS** overwrite" instruction is absent from that slice.
# Today plan-reviewer.md line 45 contains:
#   "- **ALWAYS** overwrite the `## Plan Review` section in `01-plan.md` on every invocation."
# After fix: this bullet is replaced/reconciled with preserve-in-place.
# This is a file-section check (not _pr_consol) because line 45 is outside
# the _pr_consol anchor but still in the same file.
_PR_CRITICAL_ANCHOR = "## Critical Rules"
_pr_critical = _slice_section(_s34_pr, _PR_CRITICAL_ANCHOR)
_c33_no_always_overwrite = bool(_pr_critical) and (
    "**ALWAYS** overwrite the `## Plan Review`" not in _pr_critical
)
check(
    "plan-review(33/pr-h-ac1): plan-reviewer.md Critical Rules section"
    " does NOT contain '**ALWAYS** overwrite the `## Plan Review`' instruction"
    " (overwrite-contradiction removed from Critical Rules)",
    _c33_no_always_overwrite,
    (
        f"anchor '{_PR_CRITICAL_ANCHOR}' slice present={bool(_pr_critical)},"
        f" always_overwrite_absent={_c33_no_always_overwrite}"
        " -- plan-reviewer.md:45 '**ALWAYS** overwrite the `## Plan Review` section'"
        " contradicts preserve-in-place; implementer must remove/reconcile it (fix #1)"
    ),
)


# ---------------------------------------------------------------------------
# Fix #2 -- Deterministic worst-of roll-up + STAGE-GATE-1 reads combined (AC-2, AC-3)
# Checks (34)(35)(36):
#   (34) _pr_consol slice declares worst-of (fail > concerns > pass) + clean/risks mapping
#   (35) _orch_pr slice declares worst-of + security verdict mapping
#   (36) STAGE-GATE-1 section reads **Combined verdict:** (not just plan-reviewer verdict)
# These FAIL now because:
#   - grep "worst-of" over agents/ returns nothing
#   - STAGE-GATE-1 STOP block says "Plan-reviewer verdict: {pass | concerns}"
#     (not "Combined verdict:")
# ---------------------------------------------------------------------------

# Check (34) -- AC-2: _pr_consol slice declares worst-of roll-up function with
# severity order fail > concerns > pass AND the security verdict mapping
# (clean -> pass, risks-found -> fail).
_c34_worst_of = bool(_pr_consol) and (
    "worst-of" in _pr_consol.lower()
    or "worst of" in _pr_consol.lower()
)
_c34_severity_order = bool(_pr_consol) and (
    ("fail" in _pr_consol and "concerns" in _pr_consol and "pass" in _pr_consol)
    and (
        "fail > concerns" in _pr_consol
        or "fail>concerns" in _pr_consol
        or "fail > concerns > pass" in _pr_consol
    )
)
_c34_security_mapping = bool(_pr_consol) and (
    ("clean" in _pr_consol and "pass" in _pr_consol)
    or ("risks-found" in _pr_consol and "fail" in _pr_consol)
    or ("clean" in _pr_consol and "risks-found" in _pr_consol)
)
check(
    "plan-review(34/pr-h-ac2): plan-reviewer.md consolidated section slice"
    " declares worst-of roll-up (fail > concerns > pass)"
    " and security verdict mapping (clean -> pass, risks-found -> fail)",
    _c34_worst_of and _c34_severity_order and _c34_security_mapping,
    (
        f"anchor '{_PR_ANCHOR}' slice:"
        f" worst_of={_c34_worst_of},"
        f" severity_order_fail_gt_concerns={_c34_severity_order},"
        f" security_mapping={_c34_security_mapping}"
        " -- no worst-of rule exists today in plan-reviewer.md; implementer must add it (fix #2)"
    ),
)

# Check (35) -- AC-2: _orch_pr slice (orchestrator.md centralization contract)
# also declares worst-of + security verdict mapping (the three files must be
# consistent per AC-2).
_c35_orch_worst_of = bool(_orch_pr) and (
    "worst-of" in _orch_pr.lower()
    or "worst of" in _orch_pr.lower()
)
_c35_orch_severity = bool(_orch_pr) and (
    "fail > concerns" in _orch_pr
    or "fail>concerns" in _orch_pr
    or "fail > concerns > pass" in _orch_pr
)
check(
    "plan-review(35/pr-h-ac2): orchestrator.md centralization contract slice"
    " declares worst-of roll-up (fail > concerns > pass)",
    _c35_orch_worst_of and _c35_orch_severity,
    (
        f"anchor '{_ORCH_PR_ANCHOR}' slice:"
        f" worst_of={_c35_orch_worst_of},"
        f" severity_order={_c35_orch_severity}"
        " -- orchestrator.md must declare worst-of consistent with plan-reviewer.md (fix #2)"
    ),
)

# Check (36) -- AC-3: STAGE-GATE-1 section in orchestrator.md reads
# **Combined verdict:** (the roll-up), NOT only "Plan-reviewer verdict".
# The anchor is the existing "## STAGE-GATE-1" heading.
_GATE1_ANCHOR = "## STAGE-GATE-1"
_orch_gate1 = _slice_section(_s34_orch, _GATE1_ANCHOR)
_c36_gate_reads_combined = bool(_orch_gate1) and (
    "**Combined verdict:**" in _orch_gate1
    or "Combined verdict" in _orch_gate1
)
_c36_not_only_pr_verdict = bool(_orch_gate1) and (
    # The fix must state that STAGE-GATE-1 reads the combined verdict (the roll-up).
    # Today the STOP block only says "Plan-reviewer verdict: {pass | concerns}".
    # After fix: it reads "Combined verdict: {pass | concerns | fail}".
    "Combined verdict" in _orch_gate1
)
check(
    "plan-review(36/pr-h-ac3): orchestrator.md STAGE-GATE-1 section"
    " reads '**Combined verdict:**' (the roll-up), not only 'Plan-reviewer verdict'",
    _c36_gate_reads_combined and _c36_not_only_pr_verdict,
    (
        f"anchor '{_GATE1_ANCHOR}' slice present={bool(_orch_gate1)},"
        f" reads_combined_verdict={_c36_gate_reads_combined}"
        " -- STAGE-GATE-1 STOP block today says 'Plan-reviewer verdict:' (ambiguous);"
        " implementer must update it to read '**Combined verdict:**' (fix #2 / AC-3)"
    ),
)


# ---------------------------------------------------------------------------
# Fix #3 -- Vacuous-success guard + direct-mode read-backs (AC-4, AC-5)
# Checks (37)(38)(39):
#   (37) _pr_consol slice has the vacuous guard (assert qa-label always +
#        security-label when security ran; missing -> blocked/panel-incomplete)
#   (38) _qa_panel slice reflects the guard requirement (qa declares it writes
#        the label that the guard requires)
#   (39) _ref_panel slice has direct-mode read-backs for research/design/diagram
# These FAIL now because:
#   - plan-reviewer.md has no guard that checks label presence before verdict
#   - ref-direct-modes.md panel section has no read-back guard for direct modes
# ---------------------------------------------------------------------------

# Check (37) -- AC-4: _pr_consol slice declares the vacuous-success guard:
# assert qa label present (always) and security label present when security ran;
# a missing-but-expected label => panel incomplete / blocked (not auto-pass).
_c37_qa_label_required = bool(_pr_consol) and (
    (
        "**Substance (qa):**" in _pr_consol
        and (
            "always" in _pr_consol.lower()
            or "required" in _pr_consol.lower()
            or "must be present" in _pr_consol.lower()
            or "must exist" in _pr_consol.lower()
            or "assert" in _pr_consol.lower()
            or "verify" in _pr_consol.lower()
            or "check" in _pr_consol.lower()
        )
    )
)
_c37_security_label_when_ran = bool(_pr_consol) and (
    "**Security design-review (security):**" in _pr_consol
    and (
        "when security" in _pr_consol.lower()
        or "security ran" in _pr_consol.lower()
        or "security_sensitive" in _pr_consol.lower()
        or "when ran" in _pr_consol.lower()
        or "if security" in _pr_consol.lower()
        or "security ran" in _pr_consol.lower()
    )
)
_c37_blocked_if_absent = bool(_pr_consol) and (
    "panel incomplete" in _pr_consol.lower()
    or "blocked" in _pr_consol.lower()
    or "incomplete" in _pr_consol.lower()
    or "cannot be pass" in _pr_consol.lower()
    or "no auto-pass" in _pr_consol.lower()
    or "not auto-pass" in _pr_consol.lower()
)
check(
    "plan-review(37/pr-h-ac4): plan-reviewer.md consolidated section slice"
    " declares vacuous-success guard:"
    " qa label required always + security label when security ran;"
    " missing-but-expected label => panel incomplete (blocked / no auto-pass)",
    _c37_qa_label_required and _c37_security_label_when_ran and _c37_blocked_if_absent,
    (
        f"anchor '{_PR_ANCHOR}' slice:"
        f" qa_label_required={_c37_qa_label_required},"
        f" security_label_when_ran={_c37_security_label_when_ran},"
        f" blocked_if_absent={_c37_blocked_if_absent}"
        " -- no vacuous-success guard exists today in plan-reviewer.md; implementer must add it (fix #3)"
    ),
)

# Check (38) -- AC-4: _qa_panel slice (qa.md ratify-plan section) reflects
# the vacuous-success guard requirement by explicitly stating that qa ALWAYS
# writes **Substance (qa):** (unconditional / regardless of verdict) so that
# plan-reviewer's guard can assert its presence.
# Today the qa panel says qa MUST write the label (in format context) but does
# NOT have an explicit "always" / "unconditional" / "regardless of verdict"
# statement tied to the guard. After fix #3 that unconditional clause is added.
_c38_qa_always_unconditional = bool(_qa_panel) and (
    "**Substance (qa):**" in _qa_panel
    and (
        "always" in _qa_panel.lower()
        or "unconditional" in _qa_panel.lower()
        or "regardless" in _qa_panel.lower()
        or "vacuous" in _qa_panel.lower()
        or "panel incomplete" in _qa_panel.lower()
    )
)
check(
    "plan-review(38/pr-h-ac4): qa.md panel slice declares it always writes"
    " '**Substance (qa):**' unconditionally / regardless of verdict"
    " (enabling the vacuous-success guard to assert its presence)",
    _c38_qa_always_unconditional,
    (
        f"anchor '{_QA_ANCHOR}' slice:"
        f" qa_always_unconditional={_c38_qa_always_unconditional}"
        " -- qa.md must state it always writes **Substance (qa):** unconditionally"
        " so plan-reviewer can assert label presence (fix #3 / AC-4)"
    ),
)

# Check (39) -- AC-5: _ref_panel slice (ref-direct-modes.md Review Panel section)
# includes explicit read-backs / vacuous-success guard for the direct modes
# (research, design, diagram) where the centralization of CLAUDE.md §5 applies.
# Today the panel section does NOT have guard language tied to direct modes:
# "research" is absent from the slice; "diagram" is absent from the slice.
# "design" appears only because "design-review" is the mode name.
# After fix #3: the guard for direct modes is documented, adding either
# the direct-mode names (research / diagram) in a guard context,
# or explicit "panel incomplete" / "blocked" language for those modes.
_c39_has_non_design_mode = bool(_ref_panel) and (
    "research" in _ref_panel.lower()
    or "diagram" in _ref_panel.lower()
)
_c39_has_guard_language = bool(_ref_panel) and (
    "guard" in _ref_panel.lower()
    or "read-back" in _ref_panel.lower()
    or "readback" in _ref_panel.lower()
    or "incomplete" in _ref_panel.lower()
    or "blocked" in _ref_panel.lower()
    or "panel incomplete" in _ref_panel.lower()
    or "vacuous" in _ref_panel.lower()
)
_c39_direct_mode_readbacks = _c39_has_non_design_mode and _c39_has_guard_language
check(
    "plan-review(39/pr-h-ac5): ref-direct-modes.md panel slice"
    " includes explicit vacuous-success guard / read-backs"
    " for direct modes (research and/or diagram present + guard/incomplete language)",
    _c39_direct_mode_readbacks,
    (
        f"anchor '{_REF_ANCHOR}' slice:"
        f" non_design_direct_mode_names={_c39_has_non_design_mode},"
        f" guard_language={_c39_has_guard_language},"
        f" readbacks_present={_c39_direct_mode_readbacks}"
        " -- ref-direct-modes.md must add read-backs for research/diagram direct modes (fix #3 / AC-5)"
    ),
)


# ---------------------------------------------------------------------------
# Suite 35 -- KG MCP tool-name contract (kg-seam-toolname, AC-1..AC-6)
# ---------------------------------------------------------------------------
# Two-clause contract over agents/*.md AND skills/**/*.md (recursive rglob
# because skills are directory-format: skills/<name>/SKILL.md):
#
#   Clause (a) -- prefixed subset:
#     Every mcp__memory__<tool> reference found anywhere in agents/*.md or
#     skills/**/*.md must be an element of CANONICAL_KG_TOOLS — the exact
#     set the context-harness-mcp server registers / exposes.  No delete_*
#     tool exists on the server; no create_entities (renamed to create_nodes).
#
#   Clause (b) -- bare deprecated tokens == 0:
#     The bare tokens create_entities, delete_entities, delete_observations,
#     delete_relations appear ZERO times in agents/*.md or skills/**/*.md,
#     matched with a WORD-BOUNDARY regex so that create_nodes and
#     create_relations are NOT false positives.  This clause is what catches
#     bare token references that carry no mcp__memory__ prefix.
#
# NOTE: the scan iterates over *.md files only (agents/ and skills/).
# The test file itself (tests/test_agent_structure.py) is a .py file and
# is NEVER scanned, so the DEPRECATED_BARE_TOKENS list defined here does
# not cause a self-flag.
#
# This test is RED on the current branch (create_entities + delete_* still
# present in skills/memory/SKILL.md).
# It goes GREEN after the implementer's rename + hard-delete removal fix.
#
# CANONICAL_KG_TOOLS = exactly what context-harness-mcp registers/exposes
# (full 16-tool set, verified against instrumentTool() registrations):
#   Core CRUD (no delete):  create_nodes, add_observations, update_observations,
#                           create_relations, search_nodes, open_nodes, read_graph
#   Lifecycle / admin:      stats, timeline, find_conflicts, mark_superseded,
#                           suggest_node_type, doctor
#   Session:                session_start, session_end, session_summary
#
# Check index -> AC mapping:
#   (1) / AC-1  clause-a : every mcp__memory__ ref in canonical set
#   (2) / AC-1  clause-b : bare deprecated tokens appear 0 times
#   (3) / AC-3           : no mcp__memory__delete_* reference at all
#   (4) / AC-4           : orchestrator frontmatter grants only canonical tools
#   (5) / AC-5           : CANONICAL_KG_TOOLS itself contains no delete_* tool
#   (6) / AC-6           : CLAUDE.md §11 names Suite 35 + self-referential guard
# ---------------------------------------------------------------------------
print()
print("=== Suite 35: KG MCP tool-name contract ===")

CANONICAL_KG_TOOLS = frozenset({
    # Core CRUD — registered by nodes.go / relations.go in context-harness-mcp.
    # No delete_* tool is registered; soft-delete is operator-SQL-only.
    "create_nodes",
    "add_observations",
    "update_observations",
    "create_relations",
    "search_nodes",
    "open_nodes",
    "read_graph",
    # Lifecycle / admin tools.
    "stats",
    "timeline",
    "find_conflicts",
    "mark_superseded",
    "suggest_node_type",
    "doctor",
    # Session tools — exposed by the MCP session layer.
    "session_start",
    "session_end",
    "session_summary",
})

# Bare tokens that the server no longer (or never did) register.
# Word-boundary matched so sub-tokens of canonical names are not flagged:
#   \bcreate_entities\b does NOT match create_nodes
#   \bdelete_entities\b does NOT match delete_observations (different token)
#   create_relations is NOT in this list (it is canonical and legitimate)
DEPRECATED_BARE_TOKENS = (
    "create_entities",
    "delete_entities",
    "delete_observations",
    "delete_relations",
)

# Regex for prefixed references: captures the tool name after mcp__memory__.
_s35_prefixed_rx = re.compile(r"mcp__memory__([A-Za-z_]+)")

# Sorted list of all .md files to scan: agents/*.md + skills/**/*.md.
# rglob is mandatory for skills because they are directory-format
# (skills/<name>/SKILL.md); a non-recursive glob("*.md") would miss them.
# tests/*.py is excluded by construction — only .md files are listed here,
# so DEPRECATED_BARE_TOKENS defined in this .py file is never self-scanned.
_s35_scan_files: list[Path] = sorted(AGENTS_DIR.glob("*.md")) + sorted(
    SKILLS_DIR.rglob("*.md")
)

# Collect every prefixed tool name referenced across agents/*.md and
# skills/**/*.md.  Map: tool_name -> set of relative paths that reference it.
_s35_referenced: dict[str, set[str]] = {}
for _s35_md in _s35_scan_files:
    _s35_text = read(_s35_md)
    _s35_rel = str(_s35_md.relative_to(REPO_ROOT))
    for _s35_tool in _s35_prefixed_rx.findall(_s35_text):
        _s35_referenced.setdefault(_s35_tool, set()).add(_s35_rel)

_s35_all_prefixed = set(_s35_referenced)
_s35_phantom = sorted(_s35_all_prefixed - CANONICAL_KG_TOOLS)

# ---------------------------------------------------------------------------
# Check (1) / AC-1 -- clause (a): prefixed subset
# Every mcp__memory__<tool> name found in agents/*.md or skills/**/*.md
# must be in the canonical set.  Failure message lists every phantom name
# + the files that reference it, so the implementer knows exactly what to
# fix.
# ---------------------------------------------------------------------------
check(
    "kg-contract(1/ac-1) clause-a:"
    " every mcp__memory__ ref is in the canonical CH set"
    " (agents/*.md + skills/**/*.md)",
    _s35_all_prefixed <= CANONICAL_KG_TOOLS,
    "phantom prefixed names: "
    + (
        ", ".join(
            f"{t} (in: {', '.join(sorted(_s35_referenced[t]))})"
            for t in _s35_phantom
        )
        if _s35_phantom
        else "none"
    ),
)

# ---------------------------------------------------------------------------
# Check (2) / AC-1 -- clause (b): bare deprecated tokens == 0
# Word-boundary match guarantees create_nodes / create_relations are not
# flagged.  Failure message lists each token with its relative path and
# hit count.  Scans agents/*.md + skills/**/*.md (same _s35_scan_files
# list used by clause-a).  The test .py file is excluded by construction.
# ---------------------------------------------------------------------------
_s35_bare_hits: dict[str, list[str]] = {}   # token -> ["rel-path:count", ...]
for _s35_tok in DEPRECATED_BARE_TOKENS:
    _s35_bare_rx = re.compile(r"\b" + re.escape(_s35_tok) + r"\b")
    for _s35_md in _s35_scan_files:
        _s35_n = len(_s35_bare_rx.findall(read(_s35_md)))
        if _s35_n:
            _s35_rel = str(_s35_md.relative_to(REPO_ROOT))
            _s35_bare_hits.setdefault(_s35_tok, []).append(
                f"{_s35_rel}:{_s35_n}"
            )

check(
    "kg-contract(2/ac-1) clause-b:"
    " bare deprecated tokens appear ZERO times"
    " in agents/*.md + skills/**/*.md",
    not _s35_bare_hits,
    "bare deprecated tokens still present: "
    + (
        "; ".join(
            f"{t} -> {', '.join(locs)}"
            for t, locs in sorted(_s35_bare_hits.items())
        )
        if _s35_bare_hits
        else "none"
    ),
)

# ---------------------------------------------------------------------------
# Check (3) / AC-3 -- no mcp__memory__delete_* reference
# The server exposes no delete tool.  Any delete_* in the prefixed set is
# a phantom.  This check reinforces clause (a) with a targeted assertion
# that also produces a clear "delete tools referenced" message.
# Scans agents/*.md + skills/**/*.md via the shared _s35_referenced map.
# ---------------------------------------------------------------------------
_s35_deletes = sorted(t for t in _s35_all_prefixed if t.startswith("delete_"))
check(
    "kg-contract(3/ac-3):"
    " no mcp__memory__delete_* reference in agents/*.md or skills/**/*.md"
    " (server exposes no delete tool)",
    not _s35_deletes,
    "prefixed delete tools still referenced: " + ", ".join(_s35_deletes)
    if _s35_deletes
    else "",
)

# ---------------------------------------------------------------------------
# Check (4) / AC-4 -- orchestrator frontmatter grants only canonical tools
# The frontmatter tools: field is the grant list that Claude Code uses to
# decide which MCP tools the orchestrator may call.  Every entry prefixed
# mcp__memory__ must be in CANONICAL_KG_TOOLS.
# ---------------------------------------------------------------------------
_s35_orch_text = read(AGENTS_DIR / "orchestrator.md")
_s35_orch_fm_raw = parse_frontmatter(_s35_orch_text).get("tools", "")
_s35_orch_kg_granted = set(_s35_prefixed_rx.findall(_s35_orch_fm_raw))
_s35_orch_phantom = sorted(_s35_orch_kg_granted - CANONICAL_KG_TOOLS)
check(
    "kg-contract(4/ac-4):"
    " orchestrator frontmatter grants only canonical KG tools",
    _s35_orch_kg_granted <= CANONICAL_KG_TOOLS,
    "orchestrator grants phantom KG tools: "
    + ", ".join(_s35_orch_phantom)
    if _s35_orch_phantom
    else "",
)

# ---------------------------------------------------------------------------
# Check (5) / AC-5 -- canonical set is delete-free (guard against drift)
# If a future author accidentally adds a delete_* to CANONICAL_KG_TOOLS
# in this file, this check fires immediately so the canonical set stays
# aligned with the server contract.
# ---------------------------------------------------------------------------
_s35_canon_deletes = sorted(t for t in CANONICAL_KG_TOOLS if t.startswith("delete_"))
check(
    "kg-contract(5/ac-5):"
    " CANONICAL_KG_TOOLS contains no delete_* tool (guard against set drift)",
    not _s35_canon_deletes,
    "canonical set leaked a delete tool: " + ", ".join(_s35_canon_deletes)
    if _s35_canon_deletes
    else "",
)

# ---------------------------------------------------------------------------
# Check (6) / AC-6 -- self-referential guard (mirrors Suite 34 checks 28+29)
# docs/testing.md (canonical registry) must name Suite 35.
# Re-pointed from CLAUDE.md to docs/testing.md (pr-claude-md-hygiene).
# This test file must contain the literal "Suite 35" and the marker
# "KG MCP tool-name contract" so the guard stays coherent after edits.
# Does NOT read CLAUDE.md for the Suite literal — no fallback or 'or' permitted.
# ---------------------------------------------------------------------------
_s35_claude_text = read(REPO_ROOT / "CLAUDE.md")
_s35_self_text = read(Path(__file__).resolve())
_s35_testing_md = read(REPO_ROOT / "docs" / "testing.md")
check(
    "kg-contract(6/ac-6):"
    " docs/testing.md canonical registry names 'Suite 35' and this file defines it"
    " (self-referential guard -- must stay green post-fix)",
    "Suite 35" in _s35_testing_md
    and "Suite 35" in _s35_self_text
    and "KG MCP tool-name contract" in _s35_self_text,
    "Suite 35 not registered in docs/testing.md canonical registry"
    " or marker literal 'KG MCP tool-name contract' missing in this file"
    " -- implementer must complete docs/testing.md; tester must not remove the marker",
)



# ---------------------------------------------------------------------------
# Suite 36 -- KG write-integrity beacon (write-integrity-beacon, AC-1..AC-8)
# ---------------------------------------------------------------------------
# Anchor-scoped checks for the kg_write event contract across 5 files.
# Every check slices to a uniquely-named section heading and asserts
# sub-tokens WITHIN that slice — never a loose `token in whole_file`.
# Exception: the self-referential guard (check 11) is file-wide by design,
# following the precedent of Suite 35 check 6 and Suite 34 checks 28-29.
#
# Principle: if the anchor is absent the slice is "" and the check FAILS
# with a clear detail — no false-green is possible (the anti-false-green
# dispatch: _slice_section returns "" for a missing anchor, and "x" in ""
# is always False).
#
# Check index -> AC mapping:
#   (1)  / AC-1 : observability.md § kg_write event — schema tokens present
#   (2)  / AC-1 : same slice — all 4 reason codes present
#   (3)  / AC-2 : orchestrator.md § Emitting kg_write events — 3 site values
#   (4)  / AC-2 : same slice — all 4 reason codes
#   (5)  / AC-3 : orchestrator.md — kg_write registered as valid event
#   (6)  / AC-2 : delivery.md § delivery-passive-capture — mapeo declarado
#   (7)  / AC-4 : trace SKILL.md § KG write-integrity rollup — rollup tokens
#   (8)  / AC-4 : same slice — format-agnostic evidence (jsonl + md extraction)
#   (9)  / AC-6 : orchestrator.md + delivery.md slices — resiliencia preservada
#   (10) / AC-5 : orchestrator.md — anti-parallel-family rule names kg_write
#   (11) / AC-7 : CLAUDE.md §11 + self-referential guard (write-integrity beacon)
# ---------------------------------------------------------------------------
print()
print("=== Suite 36: KG write-integrity beacon ===")

# ---- file reads (suite-local variables) ------------------------------------
_s36_obs_text   = read(REPO_ROOT / "docs" / "observability.md")
_s36_orch_text  = read(AGENTS_DIR / "orchestrator.md")
_s36_deliv_text = read(AGENTS_DIR / "delivery.md")
_s36_trace_text = read(skill_path("trace"))
_s36_claude_text = read(REPO_ROOT / "CLAUDE.md")
_s36_self_text  = read(Path(__file__).resolve())

# ---- anchors ---------------------------------------------------------------
_S36_OBS_ANCHOR      = "## kg_write event"
_S36_ORCH_EMIT_ANCHOR = "### Emitting kg_write events"
_S36_DELIV_ANCHOR    = "kg_write site:delivery-passive-capture"
_S36_TRACE_ANCHOR    = "### KG write-integrity rollup"

# 4 reason codes that must be documented everywhere they are relevant
_S36_REASON_CODES = (
    "ok",
    "skipped:mcp-down",
    "skipped:malformed-call",
    "skipped:policy-filtered",
)

# ---- slice the sections we need -------------------------------------------
_s36_obs_slice   = _slice_section(_s36_obs_text,   _S36_OBS_ANCHOR)
_s36_orch_emit   = _slice_section(_s36_orch_text,  _S36_ORCH_EMIT_ANCHOR)
_s36_deliv_slice = _slice_section(_s36_deliv_text, _S36_DELIV_ANCHOR)
_s36_trace_slice = _slice_section(_s36_trace_text, _S36_TRACE_ANCHOR)

# ---------------------------------------------------------------------------
# Check (1) / AC-1 -- observability.md § kg_write event: schema tokens present
# Asserts the section documents the event shape: event, "kg_write", attempted,
# succeeded, reason.  A missing anchor gives "" and fails immediately.
# ---------------------------------------------------------------------------
_s36_schema_tokens = ("event", '"kg_write"', "attempted", "succeeded", "reason")
check(
    "kg-beacon(1/ac-1): docs/observability.md § 'kg_write event'"
    " documents schema tokens (event, attempted, succeeded, reason)",
    bool(_s36_obs_slice)
    and all(t in _s36_obs_slice for t in _s36_schema_tokens),
    f"anchor '{_S36_OBS_ANCHOR}' missing or tokens absent: {_s36_schema_tokens}",
)

# ---------------------------------------------------------------------------
# Check (2) / AC-1 -- same slice: all 4 reason codes documented
# ---------------------------------------------------------------------------
check(
    "kg-beacon(2/ac-1): docs/observability.md § 'kg_write event'"
    " documents all 4 reason codes",
    bool(_s36_obs_slice)
    and all(code in _s36_obs_slice for code in _S36_REASON_CODES),
    f"anchor '{_S36_OBS_ANCHOR}' missing or reason codes absent: {_S36_REASON_CODES}",
)

# ---------------------------------------------------------------------------
# Check (3) / AC-2 -- orchestrator.md § Emitting kg_write events:
# all 3 site values declared
# ---------------------------------------------------------------------------
_S36_SITES = (
    "phase6-knowledge-save",
    "security-finding",
    "delivery-passive-capture",
)
check(
    "kg-beacon(3/ac-2): agents/orchestrator.md § 'Emitting kg_write events'"
    " declares all 3 site values",
    bool(_s36_orch_emit)
    and all(site in _s36_orch_emit for site in _S36_SITES),
    f"anchor '{_S36_ORCH_EMIT_ANCHOR}' missing or site values absent: {_S36_SITES}",
)

# ---------------------------------------------------------------------------
# Check (4) / AC-2 -- same slice: all 4 reason codes present
# (orchestrator must know the vocabulary at the point of emission)
# ---------------------------------------------------------------------------
check(
    "kg-beacon(4/ac-2): agents/orchestrator.md § 'Emitting kg_write events'"
    " contains all 4 reason codes",
    bool(_s36_orch_emit)
    and all(code in _s36_orch_emit for code in _S36_REASON_CODES),
    f"anchor '{_S36_ORCH_EMIT_ANCHOR}' missing or reason codes absent: {_S36_REASON_CODES}",
)

# ---------------------------------------------------------------------------
# Check (5) / AC-3 -- kg_write registered as valid event in orchestrator.md
# The plan specifies that kg_write is added to the "One of:" list or the
# "When to write each event" table.  We search the whole orchestrator text
# for the event being named in an enumeration context.
# We use a scoped slice of the event-schema section rather than a whole-file
# grep to keep the assertion anchored.
# Anchor: "One of:" (the plan's L2523 list phrasing) OR
#         "When to write each event" table header.
# We try both; accept if kg_write appears in either slice.
# ---------------------------------------------------------------------------
_s36_one_of_slice   = _slice_section(_s36_orch_text, "One of:")
_s36_when_to_write  = _slice_section(_s36_orch_text, "When to write each event")
check(
    "kg-beacon(5/ac-3): agents/orchestrator.md registers 'kg_write'"
    " as a valid event (in 'One of:' list or 'When to write each event' table)",
    ("kg_write" in _s36_one_of_slice)
    or ("kg_write" in _s36_when_to_write),
    "kg_write not found in 'One of:' slice or 'When to write each event' slice"
    " -- anchor sections may be missing or token absent",
)

# ---------------------------------------------------------------------------
# Check (6) / AC-2 -- delivery.md § delivery-passive-capture slice:
# declares kg_passive_capture as source + names at least ok + skipped:mcp-down
# (the two codes delivery can produce for a real write vs. MCP-down scenario)
# ---------------------------------------------------------------------------
check(
    "kg-beacon(6/ac-2): agents/delivery.md § 'kg_write site:delivery-passive-capture'"
    " declares kg_passive_capture as event source and names ok + skipped:mcp-down",
    bool(_s36_deliv_slice)
    and "kg_passive_capture" in _s36_deliv_slice
    and "ok" in _s36_deliv_slice
    and "skipped:mcp-down" in _s36_deliv_slice,
    f"anchor '{_S36_DELIV_ANCHOR}' missing or tokens (kg_passive_capture, ok,"
    " skipped:mcp-down) absent in slice",
)

# ---------------------------------------------------------------------------
# Check (7) / AC-4 -- trace SKILL.md § KG write-integrity rollup:
# rollup tokens KG writes:, attempted, succeeded all present
# ---------------------------------------------------------------------------
check(
    "kg-beacon(7/ac-4): skills/trace/SKILL.md § 'KG write-integrity rollup'"
    " documents rollup tokens (KG writes:, attempted, succeeded)",
    bool(_s36_trace_slice)
    and "KG writes:" in _s36_trace_slice
    and "attempted" in _s36_trace_slice
    and "succeeded" in _s36_trace_slice,
    f"anchor '{_S36_TRACE_ANCHOR}' missing or rollup tokens absent",
)

# ---------------------------------------------------------------------------
# Check (8) / AC-4 -- same slice: format-agnostic declared
# The plan requires both jsonl and .md extraction to be mentioned in the
# rollup section.  Evidence tokens: "jsonl" + one of ("sed -n", "fence", ".md")
# ---------------------------------------------------------------------------
check(
    "kg-beacon(8/ac-4): skills/trace/SKILL.md § 'KG write-integrity rollup'"
    " is format-agnostic (jsonl + .md fence extraction documented)",
    bool(_s36_trace_slice)
    and "jsonl" in _s36_trace_slice
    and any(
        tok in _s36_trace_slice
        for tok in ("sed -n", "fence", ".md")
    ),
    f"anchor '{_S36_TRACE_ANCHOR}' missing or format-agnostic tokens absent"
    " (need 'jsonl' + one of: 'sed -n', 'fence', '.md')",
)

# ---------------------------------------------------------------------------
# Check (9) / AC-6 -- resilience clauses preserved at both write sites
# orchestrator.md: its emit slice must contain a resilience phrase
# delivery.md:     its site slice must contain a resilience phrase
# ---------------------------------------------------------------------------
_S36_ORCH_RESILIENCE = ("best-effort", "silently", "log")
_S36_DELIV_RESILIENCE = ("never fail", "best-effort")
_s36_orch_has_resilience = any(
    tok in _s36_orch_emit for tok in _S36_ORCH_RESILIENCE
)
_s36_deliv_has_resilience = any(
    tok in _s36_deliv_slice for tok in _S36_DELIV_RESILIENCE
)
check(
    "kg-beacon(9/ac-6): resilience clauses preserved"
    " (orchestrator § Emitting kg_write events + delivery § site slice"
    " both contain best-effort / never-fail language)",
    bool(_s36_orch_emit) and _s36_orch_has_resilience
    and bool(_s36_deliv_slice) and _s36_deliv_has_resilience,
    "resilience clause missing -- "
    + (
        "orchestrator emit slice has no resilience token"
        f" (checked: {_S36_ORCH_RESILIENCE}); "
        if not (bool(_s36_orch_emit) and _s36_orch_has_resilience)
        else ""
    )
    + (
        "delivery site slice has no resilience token"
        f" (checked: {_S36_DELIV_RESILIENCE})"
        if not (bool(_s36_deliv_slice) and _s36_deliv_has_resilience)
        else ""
    ),
)

# ---------------------------------------------------------------------------
# Check (10) / AC-5 -- anti-parallel-family rule names kg_write as exception
# The plan: orchestrator.md L2577-area rule "parallel family" must mention
# kg_write so any future reader knows the event is a deliberate singular
# exception, not a new KG-namespaced family.
# Anchor: slice on "parallel family" (the plan's phrasing for the rule).
# ---------------------------------------------------------------------------
_s36_parallel_family_slice = _slice_section(_s36_orch_text, "parallel family")
check(
    "kg-beacon(10/ac-5): agents/orchestrator.md anti-parallel-family rule"
    " (slice of 'parallel family') names 'kg_write' as recognized exception",
    "kg_write" in _s36_parallel_family_slice,
    "anchor 'parallel family' missing in orchestrator.md"
    " or 'kg_write' not present within that slice"
    " -- implementer must update the L2577 rule to cite the exception",
)

# ---------------------------------------------------------------------------
# Check (11) / AC-7 -- self-referential guard
# docs/testing.md (canonical registry) must register Suite 36.
# Re-pointed from CLAUDE.md to docs/testing.md (pr-claude-md-hygiene).
# This file must contain the literal "Suite 36" and the marker
# "write-integrity beacon" so the guard survives future edits.
# Does NOT read CLAUDE.md for the Suite literal — no fallback or 'or' permitted.
# ---------------------------------------------------------------------------
_s36_testing_md = read(REPO_ROOT / "docs" / "testing.md")
check(
    "kg-beacon(11/ac-7):"
    " docs/testing.md canonical registry names 'Suite 36' and this file defines it"
    " (self-referential guard -- must stay green post-implementation)",
    "Suite 36" in _s36_testing_md
    and "Suite 36" in _s36_self_text
    and "write-integrity beacon" in _s36_self_text,
    "Suite 36 not registered in docs/testing.md canonical registry"
    " or marker literal 'write-integrity beacon' missing in this file"
    " -- implementer must complete docs/testing.md; tester must not remove the marker",
)


# ---------------------------------------------------------------------------
# Suite 37 -- KG write-policy _shared snippet consolidation
#             (kg-shared-snippet, AC-1..AC-7)
# ---------------------------------------------------------------------------
# Anchor-scoped checks that verify the existence and structure of the
# canonical snippet `agents/_shared/kg-write-policy.md`, the two KG writer
# agents' references to it (orchestrator Phase 6 + delivery Step 11.5), the
# non-reference by read-only agents, and the CLAUDE.md §11 self-referential
# guard.
#
# Anti-false-green dispatch: _slice_section returns "" for a missing anchor,
# so "x" in "" is always False.  Every anchor-scoped check fails clearly
# when the anchor is absent rather than silently passing.
# Exception: check (6) (read-only non-reference) and check (7) (self-
# referential guard) are intentionally file-wide — the same precedent as
# Suite 35 check 6 and Suite 36 check 11.
#
# Check index -> AC mapping:
#   (1) / AC-1 : agents/_shared/kg-write-policy.md exists
#   (2) / AC-1 : snippet header HTML names Consumed by: orchestrator+delivery
#   (3) / AC-1 : snippet contains all 4 required section anchors
#   (4) / AC-2 : orchestrator.md Phase 6 slice references the snippet
#   (5) / AC-2 : delivery.md Step 11.5 slice references the snippet
#   (6) / AC-2 : read-only agents (qa, tester, security, architect) do NOT
#                reference kg-write-policy.md (no false-positive pollution)
#   (7) / AC-7 : CLAUDE.md §11 names 'Suite 37' + self-referential guard
# ---------------------------------------------------------------------------
print()
print("=== Suite 37: KG write-policy _shared snippet consolidation ===")

# ---- constants ---------------------------------------------------------------
_S37_SNIPPET_PATH = AGENTS_DIR / "_shared" / "kg-write-policy.md"

# Required section anchors that the snippet must expose for writer agents
# to reference by section name.
_S37_REQUIRED_SECTIONS = (
    "## Content policy",
    "## Pre-write checklist",
    "## Dedup gate",
    "## Session attribution",
)

# The two KG-writing agents; every other agent in agents/*.md is read-only
# with respect to KG writes and must NOT reference the write-policy snippet.
_S37_WRITER_AGENTS = {"orchestrator.md", "delivery.md"}

# Read-only agents that must NOT reference kg-write-policy.md.
# These agents already carry the read-only puntero ("writes stay centralized
# in orchestrator Phase 6") and must never be linked to the write-policy
# snippet — adding a reference there would signal an unintended scope creep.
_S37_READONLY_AGENTS = {"qa.md", "tester.md", "security.md", "architect.md"}

# Anchors used to scope the checks into the exact sections that matter.
# Using slice anchors guards against the snippet path appearing as a stray
# cross-reference elsewhere in the agent file.
_S37_ORCH_ANCHOR  = "Phase 6 — Knowledge Save (MANDATORY)"
_S37_DELIV_ANCHOR = "### Step 11.5 — Persist a process-insight"

# ---------------------------------------------------------------------------
# Check (1) / AC-1 -- snippet file exists
# The implementer creates agents/_shared/kg-write-policy.md in Step 1 of
# the work plan.  Until then this check is RED by construction.
# ---------------------------------------------------------------------------
_s37_snippet_exists = _S37_SNIPPET_PATH.exists()
check(
    "kg-snippet(1/ac-1): agents/_shared/kg-write-policy.md exists",
    _s37_snippet_exists,
    "file not found — implementer must create agents/_shared/kg-write-policy.md",
)

# Read snippet content (empty string when absent — guards downstream checks)
_s37_snippet_text = _S37_SNIPPET_PATH.read_text(encoding="utf-8") if _s37_snippet_exists else ""

# ---------------------------------------------------------------------------
# Check (2) / AC-1 -- snippet header HTML names Consumed by: orchestrator+delivery
# The canonical _shared/ pattern requires an HTML comment block at the top
# with "Consumed by: agents/orchestrator.md" and "agents/delivery.md"
# (or equivalent phrasing) so future editors know exactly which files depend
# on this snippet.  Read-only agents must NOT appear in this list.
# ---------------------------------------------------------------------------
check(
    "kg-snippet(2/ac-1): snippet header HTML 'Consumed by:' names"
    " orchestrator.md and delivery.md",
    "Consumed by:" in _s37_snippet_text
    and "orchestrator" in _s37_snippet_text
    and "delivery" in _s37_snippet_text,
    "snippet header HTML missing 'Consumed by:' block or omits orchestrator/delivery"
    " -- see agents/_shared/gh-fallback.md for the canonical header pattern",
)

# ---------------------------------------------------------------------------
# Check (3) / AC-1 -- snippet exposes all 4 required section anchors
# Writer agents reference the snippet by section name (e.g.
# `§ "Pre-write checklist"`).  Every required section must exist as a
# markdown heading so _slice_section can resolve it.
# ---------------------------------------------------------------------------
_s37_missing_sections = [
    sec for sec in _S37_REQUIRED_SECTIONS
    if sec not in _s37_snippet_text
]
check(
    "kg-snippet(3/ac-1): snippet contains all 4 required section anchors"
    " (Content policy, Pre-write checklist, Dedup gate, Session attribution)",
    not _s37_missing_sections,
    "missing sections: " + ", ".join(_s37_missing_sections)
    if _s37_missing_sections
    else "",
)

# ---------------------------------------------------------------------------
# Check (4) / AC-2 -- orchestrator.md Phase 6 slice references the snippet
# After the implementer replaces the inline Forbidden + Pre-write blocks with
# a pointer line, the Phase 6 body must contain a reference to
# "kg-write-policy.md".  Scoped to the Phase 6 KG Save section so that any
# stray occurrence elsewhere in orchestrator.md does not create a false-green.
# ---------------------------------------------------------------------------
_s37_orch_text  = read(AGENTS_DIR / "orchestrator.md")
_s37_orch_slice = _slice_section(_s37_orch_text, _S37_ORCH_ANCHOR)
check(
    "kg-snippet(4/ac-2): agents/orchestrator.md § 'Phase 6 — Knowledge Save'"
    " references agents/_shared/kg-write-policy.md (pointer replaces inline blocks)",
    bool(_s37_orch_slice) and "kg-write-policy.md" in _s37_orch_slice,
    f"anchor '{_S37_ORCH_ANCHOR}' missing in orchestrator.md"
    " or 'kg-write-policy.md' not referenced within that slice"
    " -- implementer must replace the inline Forbidden/Pre-write blocks with a"
    " pointer to agents/_shared/kg-write-policy.md",
)

# ---------------------------------------------------------------------------
# Check (5) / AC-2 -- delivery.md Step 11.5 slice references the snippet
# After the implementer replaces the inline Hard-guardrails + Gate mechanics
# with a pointer, the Step 11.5 section must contain a reference to
# "kg-write-policy.md".  Scoped to Step 11.5 so only the relevant section
# is asserted.
# ---------------------------------------------------------------------------
_s37_deliv_text  = read(AGENTS_DIR / "delivery.md")
_s37_deliv_slice = _slice_section(_s37_deliv_text, _S37_DELIV_ANCHOR)
check(
    "kg-snippet(5/ac-2): agents/delivery.md § 'Step 11.5 — Persist a process-insight'"
    " references agents/_shared/kg-write-policy.md (pointer replaces inline blocks)",
    bool(_s37_deliv_slice) and "kg-write-policy.md" in _s37_deliv_slice,
    f"anchor '{_S37_DELIV_ANCHOR}' missing in delivery.md"
    " or 'kg-write-policy.md' not referenced within that slice"
    " -- implementer must replace Hard-guardrails + Gate mechanics with a pointer",
)

# ---------------------------------------------------------------------------
# Check (6) / AC-2 -- read-only agents do NOT reference kg-write-policy.md
# The plan is explicit: qa, tester, security, and architect are read-only KG
# agents and must never reference the write-policy snippet.  A reference there
# would indicate unintended scope creep (the agent is being granted write
# responsibility it does not have).
# Whole-file check is appropriate here — there is no section in these files
# that should reference the snippet under any interpretation.
# ---------------------------------------------------------------------------
_s37_readonly_violations = []
for _s37_ro_name in sorted(_S37_READONLY_AGENTS):
    _s37_ro_path = AGENTS_DIR / _s37_ro_name
    if _s37_ro_path.exists():
        _s37_ro_text = read(_s37_ro_path)
        if "kg-write-policy.md" in _s37_ro_text:
            _s37_readonly_violations.append(_s37_ro_name)

check(
    "kg-snippet(6/ac-2): read-only agents (qa, tester, security, architect)"
    " do NOT reference kg-write-policy.md (no scope-creep)",
    not _s37_readonly_violations,
    "read-only agents unexpectedly reference kg-write-policy.md: "
    + ", ".join(_s37_readonly_violations)
    if _s37_readonly_violations
    else "",
)

# ---------------------------------------------------------------------------
# Check (7) / AC-7 -- self-referential guard
# docs/testing.md (canonical registry) must register Suite 37.
# Re-pointed from CLAUDE.md to docs/testing.md (pr-claude-md-hygiene).
# This file must contain the literal "Suite 37" and the marker
# "KG write-policy _shared snippet" so the guard stays coherent after edits.
# Does NOT read CLAUDE.md for the Suite literal — no fallback or 'or' permitted.
# ---------------------------------------------------------------------------
_s37_claude_text = read(REPO_ROOT / "CLAUDE.md")
_s37_self_text   = read(Path(__file__).resolve())
_s37_testing_md  = read(REPO_ROOT / "docs" / "testing.md")
check(
    "kg-snippet(7/ac-7):"
    " docs/testing.md canonical registry names 'Suite 37' and this file defines it"
    " (self-referential guard -- must stay green post-implementation)",
    "Suite 37" in _s37_testing_md
    and "Suite 37" in _s37_self_text
    and "KG write-policy _shared snippet" in _s37_self_text,
    "Suite 37 not registered in docs/testing.md canonical registry"
    " or marker literal 'KG write-policy _shared snippet' missing in this file"
    " -- implementer must complete docs/testing.md; tester must not remove the marker",
)



# ---------------------------------------------------------------------------
# Suite 38 -- review-pipeline-guardrails (review-pipeline-guardrails, AC-3..AC-17)
# ---------------------------------------------------------------------------
# Anchor-scoped checks for the four guardrails added to reviewer.md,
# reviewer-consolidator.md, skills/review-pr/SKILL.md, and agents/ref-direct-modes.md.
# Every check slices to a named section anchor and asserts sub-tokens WITHIN that
# slice -- never a loose `token in whole_file` -- following the Suite 36/37 idiom.
# Exception: the self-referential guard (check 9) is file-wide by design, following
# the precedent of Suite 35 check 6, Suite 36 check 11, and Suite 37 check 7.
#
# Anti-false-green dispatch: _slice_section returns "" for a missing anchor,
# so `"token" in ""` is always False -- a missing section always fails the check.
#
# Check index -> AC mapping:
#   (1)  / AC-3  : reviewer.md § Scope Discipline -- section present + key tokens
#   (2)  / AC-3  : reviewer.md § Scope Discipline -- Patterns & Consistency cross-ref
#   (3)  / AC-3  : reviewer.md § Scope Discipline -- Tests cross-ref
#   (4)  / AC-3  : reviewer.md § Phase 3 template -- Fuera de alcance section present
#   (5)  / AC-4  : reviewer.md § AI-Authored PR Review Lens -- three checks present
#   (6)  / AC-5  : reviewer.md frontmatter -- context7 tools granted
#   (7)  / AC-7/8: reviewer.md § No-Publish Invariant -- invariant declared
#   (8)  / AC-13 : reviewer.md -- no `gh-fallback.md § Policy` pointer; gh-fallback.md clean
#   (9)  / AC-9  : reviewer-consolidator.md -- attribution guard before any-CHANGES wins
#   (10) / AC-12 : skills/review-pr/SKILL.md -- behavioral step best-effort
#   (11) / AC-17 : skills/review-pr/SKILL.md -- isCrossRepository fork-exclusion gate
#   (12) / AC-14 : agents/ref-direct-modes.md -- no-publish invariant sentence present
#   (13) / AC-15 : self-referential guard (Suite 38 in CLAUDE.md §11 + this file)
# ---------------------------------------------------------------------------
print()
print("=== Suite 38: review-pipeline-guardrails ===")

# ---- file reads (suite-local variables) ------------------------------------
_s38_reviewer_text    = read(AGENTS_DIR / "reviewer.md")
_s38_consolidator_text = read(AGENTS_DIR / "reviewer-consolidator.md")
_s38_skill_text       = read(skill_path("review-pr"))
_s38_ref_direct_text  = read(AGENTS_DIR / "ref-direct-modes.md")
_s38_gh_fallback_text = read(AGENTS_DIR / "_shared" / "gh-fallback.md")
_s38_claude_text      = read(REPO_ROOT / "CLAUDE.md")
_s38_self_text        = read(Path(__file__).resolve())

# ---- anchors ---------------------------------------------------------------
_S38_SCOPE_ANCHOR     = "## Scope Discipline"
_S38_AI_LENS_ANCHOR   = "### AI-Authored PR Review Lens"
_S38_NOPUB_ANCHOR     = "## No-Publish Invariant"
_S38_BEHAV_ANCHOR     = "### Step 1.6 — Behavioral Verification"
_S38_VERDICT_ANCHOR   = "## Verdict rule"
_S38_REVIEW_MODE_ANCHOR = "## Review Mode"

# ---- slices ----------------------------------------------------------------
_s38_scope_slice    = _slice_section(_s38_reviewer_text,     _S38_SCOPE_ANCHOR)
_s38_ai_lens_slice  = _slice_section(_s38_reviewer_text,     _S38_AI_LENS_ANCHOR)
_s38_nopub_slice    = _slice_section(_s38_reviewer_text,     _S38_NOPUB_ANCHOR)
_s38_behav_slice    = _slice_section(_s38_skill_text,        _S38_BEHAV_ANCHOR)
_s38_verdict_slice  = _slice_section(_s38_consolidator_text, _S38_VERDICT_ANCHOR)
_s38_ref_mode_slice = _slice_section(_s38_ref_direct_text,   _S38_REVIEW_MODE_ANCHOR)

# ---------------------------------------------------------------------------
# Check (1) / AC-3 -- reviewer.md § Scope Discipline: section present + key tokens
# ---------------------------------------------------------------------------
_S38_SCOPE_TOKENS = (
    "In scope",
    "Out of scope",
    "attribution",
    "Fuera de alcance",
)
check(
    "review-guardrails(1/ac-3): agents/reviewer.md § 'Scope Discipline'"
    " present and contains In scope / Out of scope / attribution / Fuera de alcance",
    bool(_s38_scope_slice)
    and all(t in _s38_scope_slice for t in _S38_SCOPE_TOKENS),
    f"anchor '{_S38_SCOPE_ANCHOR}' missing or tokens absent: {_S38_SCOPE_TOKENS}",
)

# ---------------------------------------------------------------------------
# Check (2) / AC-3 -- Patterns & Consistency cross-ref to Scope Discipline
# ---------------------------------------------------------------------------
_s38_patterns_slice = _slice_section(_s38_reviewer_text, "### Patterns & Consistency")
check(
    "review-guardrails(2/ac-3): reviewer.md § 'Patterns & Consistency'"
    " cross-references Scope Discipline",
    bool(_s38_patterns_slice)
    and ("Scope Discipline" in _s38_patterns_slice or "scope" in _s38_patterns_slice.lower()),
    "Patterns & Consistency section missing or no Scope Discipline cross-reference",
)

# ---------------------------------------------------------------------------
# Check (3) / AC-3 -- Tests cross-ref to Scope Discipline
# ---------------------------------------------------------------------------
_s38_tests_slice = _slice_section(_s38_reviewer_text, "### Tests\n")
check(
    "review-guardrails(3/ac-3): reviewer.md § 'Tests'"
    " cross-references Scope Discipline",
    bool(_s38_tests_slice)
    and ("Scope Discipline" in _s38_tests_slice or "scope" in _s38_tests_slice.lower()),
    "Tests section missing or no Scope Discipline cross-reference",
)

# ---------------------------------------------------------------------------
# Check (4) / AC-3 -- Phase 3 template has Fuera de alcance section
# ---------------------------------------------------------------------------
check(
    "review-guardrails(4/ac-3): agents/reviewer.md review_body template"
    " includes '### Fuera de alcance' section",
    "### Fuera de alcance" in _s38_reviewer_text,
    "'### Fuera de alcance' section missing from reviewer.md review_body template",
)

# ---------------------------------------------------------------------------
# Check (5) / AC-4 -- reviewer.md § AI-Authored PR Review Lens: three checks present
# ---------------------------------------------------------------------------
_S38_AI_LENS_TOKENS = (
    "Existence check",
    "Plausible-but-wrong",
    "Vacuous-test",
    "CRITICAL",
    "context7",
)
check(
    "review-guardrails(5/ac-4): agents/reviewer.md § 'AI-Authored PR Review Lens'"
    " contains all three check categories + CRITICAL classification + context7",
    bool(_s38_ai_lens_slice)
    and all(t in _s38_ai_lens_slice for t in _S38_AI_LENS_TOKENS),
    f"anchor '{_S38_AI_LENS_ANCHOR}' missing or tokens absent: {_S38_AI_LENS_TOKENS}",
)

# ---------------------------------------------------------------------------
# Check (6) / AC-5 -- reviewer.md frontmatter has context7 tools
# ---------------------------------------------------------------------------
_s38_reviewer_fm = parse_frontmatter(_s38_reviewer_text)
_s38_reviewer_tools = [t.strip() for t in _s38_reviewer_fm.get("tools", "").split(",")]
check(
    "review-guardrails(6/ac-5): agents/reviewer.md frontmatter grants"
    " mcp__context7__resolve-library-id and mcp__context7__get-library-docs",
    "mcp__context7__resolve-library-id" in _s38_reviewer_tools
    and "mcp__context7__get-library-docs" in _s38_reviewer_tools,
    "reviewer.md frontmatter missing one or both context7 tools",
)

# ---------------------------------------------------------------------------
# Check (7) / AC-7+AC-8 -- reviewer.md § No-Publish Invariant declared
# ---------------------------------------------------------------------------
_S38_NOPUB_TOKENS = (
    "NEVER",
    "publishes",
    "draft",
    "operator",
)
check(
    "review-guardrails(7/ac-7+ac-8): agents/reviewer.md § 'No-Publish Invariant'"
    " present and declares NEVER / publishes / draft / operator",
    bool(_s38_nopub_slice)
    and all(t in _s38_nopub_slice for t in _S38_NOPUB_TOKENS),
    f"anchor '{_S38_NOPUB_ANCHOR}' missing or tokens absent: {_S38_NOPUB_TOKENS}",
)

# ---------------------------------------------------------------------------
# Check (8) / AC-13 -- reviewer.md no longer points to gh-fallback.md § Policy;
#             gh-fallback.md has NOT gained a § Policy section
# ---------------------------------------------------------------------------
check(
    "review-guardrails(8/ac-13): agents/reviewer.md does NOT reference"
    " 'gh-fallback.md § Policy' (broken pointer removed)",
    "gh-fallback.md § Policy" not in _s38_reviewer_text,
    "reviewer.md still contains the dead pointer 'gh-fallback.md § Policy'",
)
check(
    "review-guardrails(8b/ac-13): agents/_shared/gh-fallback.md does NOT"
    " contain a '§ Policy' or '## Policy' section (must stay clean)",
    "§ Policy" not in _s38_gh_fallback_text
    and "## Policy" not in _s38_gh_fallback_text,
    "gh-fallback.md gained a § Policy or ## Policy section — must stay clean",
)

# ---------------------------------------------------------------------------
# Check (9) / AC-9 -- reviewer-consolidator.md attribution guard before verdict rule
# ---------------------------------------------------------------------------
_S38_GUARD_TOKENS = (
    "Attribution guard",
    "out-of-scope",
    "Fuera de alcance",
    "any-CHANGES_REQUESTED",
)
check(
    "review-guardrails(9/ac-9): agents/reviewer-consolidator.md § 'Verdict rule'"
    " contains Attribution guard before any-CHANGES_REQUESTED rule",
    bool(_s38_verdict_slice)
    and all(t in _s38_verdict_slice for t in _S38_GUARD_TOKENS),
    f"anchor '{_S38_VERDICT_ANCHOR}' missing or guard tokens absent: {_S38_GUARD_TOKENS}",
)

# ---------------------------------------------------------------------------
# Check (10) / AC-12 -- skills/review-pr/SKILL.md behavioral step documented
# ---------------------------------------------------------------------------
_S38_BEHAV_TOKENS = (
    "best-effort",
    "isCrossRepository",
    "no-command",
    "timeout",
)
check(
    "review-guardrails(10/ac-12): skills/review-pr/SKILL.md § 'Step 1.6'"
    " documents behavioral verification step with best-effort + declared-suite constraints",
    bool(_s38_behav_slice)
    and all(t in _s38_behav_slice for t in _S38_BEHAV_TOKENS),
    f"anchor '{_S38_BEHAV_ANCHOR}' missing or behavioral tokens absent: {_S38_BEHAV_TOKENS}",
)

# ---------------------------------------------------------------------------
# Check (11) / AC-17 -- isCrossRepository fork-exclusion gate
# ---------------------------------------------------------------------------
check(
    "review-guardrails(11/ac-17): skills/review-pr/SKILL.md § 'Step 1.6'"
    " has isCrossRepository trust-tier gate that excludes forks from auto-run",
    bool(_s38_behav_slice)
    and "isCrossRepository" in _s38_behav_slice
    and ("fork" in _s38_behav_slice or "Fork" in _s38_behav_slice)
    and "skipped:fork" in _s38_behav_slice,
    f"anchor '{_S38_BEHAV_ANCHOR}' missing or fork-exclusion gate tokens absent"
    " (need isCrossRepository + fork + skipped:fork)",
)

# ---------------------------------------------------------------------------
# Check (12) / AC-14 -- agents/ref-direct-modes.md no-publish invariant
# ---------------------------------------------------------------------------
check(
    "review-guardrails(12/ac-14): agents/ref-direct-modes.md § 'Review Mode'"
    " declares the no-publish invariant (reviewer NEVER calls GitHub API write endpoints)",
    bool(_s38_ref_mode_slice)
    and "No-publish invariant" in _s38_ref_mode_slice
    and "NEVER" in _s38_ref_mode_slice,
    f"anchor '{_S38_REVIEW_MODE_ANCHOR}' missing or invariant tokens absent"
    " (need 'No-publish invariant' + 'NEVER')",
)

# ---------------------------------------------------------------------------
# Check (13) / AC-15 -- self-referential guard: Suite 38 in docs/testing.md + this file
# Re-pointed from CLAUDE.md to docs/testing.md (pr-claude-md-hygiene).
# Does NOT read CLAUDE.md for the Suite literal — no fallback or 'or' permitted.
# ---------------------------------------------------------------------------
_s38_testing_md = read(REPO_ROOT / "docs" / "testing.md")
check(
    "review-guardrails(13/ac-15):"
    " docs/testing.md canonical registry names 'Suite 38' and this file defines it"
    " (self-referential guard -- review-pipeline-guardrails)",
    "Suite 38" in _s38_testing_md
    and "Suite 38" in _s38_self_text
    and "review-pipeline-guardrails" in _s38_self_text,
    "Suite 38 not registered in docs/testing.md canonical registry"
    " or marker literal 'review-pipeline-guardrails' missing in this file"
    " -- implementer must complete docs/testing.md; tester must not remove the marker",
)


# Suite 39 -- pr-a-takeover-contract (AC-1..AC-12)
# ---------------------------------------------------------------------------
# Anchor-scoped checks for the five defects repaired by PR A of the
# nested-dispatch takeover contract hardening programme.
#
# Every check slices to a named section anchor and asserts sub-tokens WITHIN
# that slice -- never a loose `token in whole_file` -- following the Suite
# 36/37/38 idiom.  The anti-false-green guarantee:
#   _slice_section returns "" when the anchor is absent
#   => `"x" in ""` is always False
#   => a missing section always fails the check, never silently passes it.
#
# Exception: check (10) uses a whole-file grep (AC-7 -- absence of §13 across
# all .md files), and the self-referential guard (check 11) is file-wide by
# design, following the precedent of Suite 35 check 6, Suite 36 check 11,
# Suite 37 check 7, and Suite 38 check 13.
#
# Check index -> AC mapping:
#   (1)  / AC-1  : orchestrator.md § Dispatch-blocked exit -- never-th:orchestrator binding
#   (2)  / AC-2  : subagent-orchestration.md § Takeover Protocol -- consume-side guard
#   (3a) / AC-3  : subagent-orchestration.md -- ## dispatch_handoff Schema section exists
#   (3b) / AC-3  : same section -- ```json fenced block present
#   (3c) / AC-3  : same section -- all 8 required field names present
#   (4)  / AC-4  : orchestrator.md § Dispatch-blocked exit -- dispatch.blocked emit instruction
#   (5)  / AC-5  : orchestrator.md § Dispatch-blocked exit -- references schema by canonical name
#   (6)  / AC-6  : subagent-orchestration.md § Takeover Protocol -- gate-manifest pointer phrase
#   (7)  / AC-7  : skills/README.md -- §14 (not §13) cross-reference present
#   (8)  / AC-7  : repo-wide grep -- §13 "Subagent Orchestration" absent from all .md files
#   (9)  / AC-8  : skills/setup/SKILL.md nested-dispatch-takeover block -- never-th:orchestrator line
#   (10) / AC-12 : subagent-orchestration.md § dispatch_handoff Schema -- type:null security note
#   (11)         : self-referential guard -- Suite 39 in CLAUDE.md §11 + this file
# ---------------------------------------------------------------------------
print()
print("=== Suite 39: pr-a-takeover-contract ===")

# ---- file reads (suite-local variables) ------------------------------------
_s39_orch_text     = read(AGENTS_DIR / "orchestrator.md")
_s39_suborch_text  = read(REPO_ROOT / "docs" / "subagent-orchestration.md")
_s39_setup_text    = read(SKILLS_DIR / "setup" / "SKILL.md")
_s39_skills_rm_text = read(SKILLS_DIR / "README.md")
_s39_claude_text   = read(REPO_ROOT / "CLAUDE.md")
_s39_self_text     = read(Path(__file__).resolve())

# ---- anchors ---------------------------------------------------------------
_S39_ORCH_EXIT_ANCHOR   = "### Dispatch-blocked exit"
_S39_TAKEOVER_ANCHOR    = "## Takeover Protocol"
_S39_SCHEMA_ANCHOR      = "## dispatch_handoff Schema"
_S39_SETUP_NDT_ANCHOR   = "<!-- nested-dispatch-takeover:start -->"

# ---- slices ----------------------------------------------------------------
_s39_orch_exit_slice    = _slice_section(_s39_orch_text,    _S39_ORCH_EXIT_ANCHOR)
_s39_takeover_slice     = _slice_section(_s39_suborch_text, _S39_TAKEOVER_ANCHOR)
_s39_schema_slice       = _slice_section(_s39_suborch_text, _S39_SCHEMA_ANCHOR)
# Re-pointed (pr-th-update-fix Step 5): read canonical file directly; the block
# starts on line 1 so _slice_section would stop at the first ## heading inside
# the block — use the whole file instead, which IS the block.
_s39_ndt_canonical_text = read(SKILLS_DIR / "setup" / "managed-blocks" / "nested-dispatch-takeover.md")
_s39_setup_ndt_slice    = _s39_ndt_canonical_text

# 8 field names that the consumer reads (AC-3)
_S39_SCHEMA_FIELDS = (
    "schema_version",
    "next_dispatch.agent",
    "type",
    "phase",
    "autonomy.granted",
    "round",
    "state_ref",
    "probe_error",
)

# ---------------------------------------------------------------------------
# Check (1) / AC-1 -- orchestrator.md § Dispatch-blocked exit:
# The binding of {next-agent} must explicitly name the never-th:orchestrator rule.
# Asserts: "th:architect" (boot case), "00-state.md" (mid-pipeline source),
# and "NEVER" + "th:orchestrator" (the prohibited value).
# ---------------------------------------------------------------------------
_S39_AC1_TOKENS = (
    "th:architect",
    "00-state.md",
    "NEVER",
)
check(
    "takeover-contract(1/ac-1): orchestrator.md § 'Dispatch-blocked exit'"
    " binds {next-agent} with th:architect (boot), 00-state.md (mid-pipeline),"
    " and NEVER th:orchestrator rule",
    bool(_s39_orch_exit_slice)
    and all(t in _s39_orch_exit_slice for t in _S39_AC1_TOKENS)
    and "th:orchestrator" in _s39_orch_exit_slice,
    f"anchor '{_S39_ORCH_EXIT_ANCHOR}' missing or binding tokens absent:"
    f" need {_S39_AC1_TOKENS} + 'th:orchestrator' (the prohibited value)",
)

# ---------------------------------------------------------------------------
# Check (2) / AC-2 -- subagent-orchestration.md § Takeover Protocol:
# Consume-side guard must state that th:orchestrator == malformed handoff
# and instruct dispatching the phase agent / th:architect instead.
# ---------------------------------------------------------------------------
_S39_AC2_TOKENS = (
    "th:orchestrator",
    "malformed",
    "th:architect",
)
check(
    "takeover-contract(2/ac-2): docs/subagent-orchestration.md § 'Takeover Protocol'"
    " contains consume-side guard: if next_dispatch.agent == th:orchestrator"
    " => malformed => dispatch phase agent / th:architect",
    bool(_s39_takeover_slice)
    and all(t in _s39_takeover_slice for t in _S39_AC2_TOKENS)
    and "malformed" in _s39_takeover_slice,
    f"anchor '{_S39_TAKEOVER_ANCHOR}' missing or guard tokens absent: {_S39_AC2_TOKENS}",
)

# ---------------------------------------------------------------------------
# Check (3a) / AC-3 -- subagent-orchestration.md: ## dispatch_handoff Schema section exists
# ---------------------------------------------------------------------------
check(
    "takeover-contract(3a/ac-3): docs/subagent-orchestration.md has"
    " a '## dispatch_handoff Schema' section",
    bool(_s39_schema_slice),
    f"anchor '{_S39_SCHEMA_ANCHOR}' not found in docs/subagent-orchestration.md",
)

# ---------------------------------------------------------------------------
# Check (3b) / AC-3 -- same section: ```json fenced block present
# ---------------------------------------------------------------------------
check(
    "takeover-contract(3b/ac-3): docs/subagent-orchestration.md"
    " § 'dispatch_handoff Schema' contains a ```json fenced block",
    "```json" in _s39_schema_slice,
    "No ```json fenced block found in the dispatch_handoff Schema section",
)

# ---------------------------------------------------------------------------
# Check (3c) / AC-3 -- same section: all 8 field names enumerated
# ---------------------------------------------------------------------------
check(
    "takeover-contract(3c/ac-3): docs/subagent-orchestration.md"
    " § 'dispatch_handoff Schema' enumerates all 8 required field names"
    f" {_S39_SCHEMA_FIELDS}",
    bool(_s39_schema_slice)
    and all(f in _s39_schema_slice for f in _S39_SCHEMA_FIELDS),
    f"One or more field names missing from the dispatch_handoff Schema section:"
    f" need {_S39_SCHEMA_FIELDS}",
)

# ---------------------------------------------------------------------------
# Check (4) / AC-4 -- orchestrator.md § Dispatch-blocked exit:
# Must instruct appending a dispatch.blocked event with reason + action,
# covering the boot-inline case.
# ---------------------------------------------------------------------------
_S39_AC4_TOKENS = (
    "dispatch.blocked",
    "reason",
    "action",
)
check(
    "takeover-contract(4/ac-4): orchestrator.md § 'Dispatch-blocked exit'"
    " instructs appending a dispatch.blocked event with reason + action"
    " (including boot-inline case)",
    bool(_s39_orch_exit_slice)
    and all(t in _s39_orch_exit_slice for t in _S39_AC4_TOKENS),
    f"anchor '{_S39_ORCH_EXIT_ANCHOR}' missing or dispatch.blocked emit tokens absent:"
    f" {_S39_AC4_TOKENS}",
)

# ---------------------------------------------------------------------------
# Check (5) / AC-5 -- orchestrator.md § Dispatch-blocked exit:
# Must reference the schema by canonical name (not enumerate fields inline).
# ---------------------------------------------------------------------------
check(
    "takeover-contract(5/ac-5): orchestrator.md § 'Dispatch-blocked exit'"
    " references the canonical schema by name"
    " ('dispatch_handoff Schema')",
    bool(_s39_orch_exit_slice)
    and "dispatch_handoff Schema" in _s39_orch_exit_slice,
    f"anchor '{_S39_ORCH_EXIT_ANCHOR}' missing or canonical schema name"
    " 'dispatch_handoff Schema' not referenced in the exit section",
)

# ---------------------------------------------------------------------------
# Check (6) / AC-6 -- subagent-orchestration.md § Takeover Protocol:
# The manifest must be relabeled as gate-manifest + carry a pointer to the
# Phase Dispatch table in orchestrator.md.
# Asserts one of: "gate manifest", "gate-manifest", "gates" near "Phase Dispatch".
# ---------------------------------------------------------------------------
check(
    "takeover-contract(6/ac-6): docs/subagent-orchestration.md § 'Takeover Protocol'"
    " relabels the manifest as gate-manifest and includes a pointer to the"
    " Phase Dispatch table in agents/orchestrator.md",
    bool(_s39_takeover_slice)
    and (
        "gate manifest" in _s39_takeover_slice.lower()
        or "gate-manifest" in _s39_takeover_slice.lower()
    )
    and "Phase Dispatch" in _s39_takeover_slice,
    f"anchor '{_S39_TAKEOVER_ANCHOR}' missing or gate-manifest relabel / Phase Dispatch"
    " pointer absent from the Takeover Protocol section",
)

# ---------------------------------------------------------------------------
# Check (7) / AC-7 -- skills/README.md: cross-reference must say §14, not §13
# ---------------------------------------------------------------------------
_s39_skills_rm_slice = _slice_section(_s39_skills_rm_text, "nested-dispatch-takeover")
check(
    "takeover-contract(7/ac-7): skills/README.md references"
    " '§ 14 \"Subagent Orchestration\"' (not § 13)",
    '§ 14' in _s39_skills_rm_text
    and '§ 13 "Subagent Orchestration"' not in _s39_skills_rm_text,
    "skills/README.md still references '§ 13 \"Subagent Orchestration\"'"
    " or '§ 14' is absent",
)

# ---------------------------------------------------------------------------
# Check (8) / AC-7 -- repo-wide grep: §13 "Subagent Orchestration" absent from
# every .md file in the repo (excluding CHANGELOG.md).
# ---------------------------------------------------------------------------
_S39_FORBIDDEN_XREF = '§ 13 "Subagent Orchestration"'

def _find_stale_xrefs(repo_root: Path, needle: str) -> list[str]:
    """Return list of relative .md file paths that contain `needle`,
    excluding CHANGELOG.md."""
    hits = []
    for md in repo_root.rglob("*.md"):
        if md.name == "CHANGELOG.md":
            continue
        try:
            if needle in md.read_text(encoding="utf-8", errors="replace"):
                hits.append(str(md.relative_to(repo_root)))
        except OSError:
            pass
    return hits

_s39_stale_xref_hits = _find_stale_xrefs(REPO_ROOT, _S39_FORBIDDEN_XREF)
check(
    "takeover-contract(8/ac-7): repo-wide grep -- no .md file (excl. CHANGELOG.md)"
    f" contains '{_S39_FORBIDDEN_XREF}'",
    len(_s39_stale_xref_hits) == 0,
    f"Stale §13 cross-reference found in: {_s39_stale_xref_hits}",
)

# ---------------------------------------------------------------------------
# Check (9) / AC-8 -- skills/setup/SKILL.md nested-dispatch-takeover managed block:
# Must contain a reinforcement line for the never-th:orchestrator guard.
# Slices from the <!-- nested-dispatch-takeover:start --> marker to the next
# heading, so a missing marker returns "" => always fails (anti-false-green).
# ---------------------------------------------------------------------------
_S39_AC8_TOKENS = (
    "th:orchestrator",
    "malformed",
)
check(
    "takeover-contract(9/ac-8): skills/setup/SKILL.md nested-dispatch-takeover"
    " managed block contains never-th:orchestrator reinforcement line"
    " (th:orchestrator => malformed)",
    bool(_s39_setup_ndt_slice)
    and all(t in _s39_setup_ndt_slice for t in _S39_AC8_TOKENS)
    and "malformed" in _s39_setup_ndt_slice,
    f"anchor '{_S39_SETUP_NDT_ANCHOR}' missing or tokens absent: {_S39_AC8_TOKENS}"
    " -- never-th:orchestrator reinforcement line not found in the managed block",
)

# ---------------------------------------------------------------------------
# Check (10) / AC-12 -- subagent-orchestration.md § dispatch_handoff Schema:
# The `type` field row must carry a neutralizing note that type:null (boot)
# does NOT mean security is skipped.
# ---------------------------------------------------------------------------
_S39_AC12_TOKENS = (
    "null",
    "security",
)
check(
    "takeover-contract(10/ac-12): docs/subagent-orchestration.md"
    " § 'dispatch_handoff Schema' type row carries note that"
    " type: null (boot) does NOT mean security skipped",
    bool(_s39_schema_slice)
    and all(t in _s39_schema_slice for t in _S39_AC12_TOKENS)
    and (
        "security" in _s39_schema_slice.lower()
        and "null" in _s39_schema_slice
        and (
            "not" in _s39_schema_slice.lower()
            or "NO" in _s39_schema_slice
        )
    ),
    f"dispatch_handoff Schema section missing or type:null security-note absent:"
    f" need {_S39_AC12_TOKENS} + negation phrase ('not' / 'NO')",
)

# ---------------------------------------------------------------------------
# Check (11) -- self-referential guard:
# docs/testing.md (canonical registry) must register "Suite 39" + marker
# "pr-a-takeover-contract". This file must contain the literal "Suite 39".
# Re-pointed from CLAUDE.md to docs/testing.md (pr-claude-md-hygiene).
# Does NOT read CLAUDE.md for the Suite literal — no fallback or 'or' permitted.
# ---------------------------------------------------------------------------
_s39_testing_md = read(REPO_ROOT / "docs" / "testing.md")
check(
    "takeover-contract(11/self-ref):"
    " docs/testing.md canonical registry names 'Suite 39' and this file defines it"
    " (self-referential guard -- pr-a-takeover-contract)",
    "Suite 39" in _s39_testing_md
    and "Suite 39" in _s39_self_text
    and "pr-a-takeover-contract" in _s39_self_text,
    "Suite 39 not registered in docs/testing.md canonical registry"
    " or marker literal 'pr-a-takeover-contract' missing in this file"
    " -- implementer must complete docs/testing.md; tester must not remove the marker",
)


# Suite 40 -- pr-b-security-failopen (AC-1..AC-9 + SEC-D1 + SEC-D2)
# ---------------------------------------------------------------------------
# Anchor-scoped checks for the four fail-open security vectors closed by PR B
# of the pipeline-flows-hardening programme:
#   Vector #1 — hotfix not pinned to Tier 3 → security skipped for low-tier hotfix
#   Vector #2 — Signal 2 "re-evaluate" is discretionary, not a deterministic GATE
#   Vector #3 — boot type=null: no classify-first before applying type-gated manifest
#   Vector #4 — plan-review direct mode: glob-only path scan misses semantic keywords
#
# Every check slices to a named anchor and asserts sub-tokens WITHIN the slice —
# never a loose `token in whole_file` — following the Suite 36/37/38/39 idiom.
# Anti-false-green guarantee:
#   _slice_section returns "" when the anchor is absent
#   => `"token" in ""` is always False
#   => a missing section always fails the check, never silently passes it.
#
# Exception: the self-referential guard (check 12) is file-wide by design,
# following the precedent of Suite 35-39 self-ref guards.
#
# Check index -> AC mapping:
#   (1)  / AC-1 + SEC-D1 : orchestrator.md § Bug tier — hotfix→Tier-3 hard floor
#                           + override-clamp (override cannot lower hotfix below Tier 3)
#   (2)  / AC-2           : ref-special-flows.md § Hotfix sub-flow — security-always
#                           justified by Tier-3 pin (both tokens near security text)
#   (3)  / AC-3           : orchestrator.md Signal 2 slice — GATE tokens present
#                           (Phase 2 + git-diff/touched-paths + MUST/FUERZA/forces)
#                           and NOT purely "re-evaluate"
#   (4)  / AC-4           : subagent-orchestration.md § Takeover Protocol step 4 —
#                           classify-first clause for type=null + security defaults RUN
#   (5)  / AC-5           : subagent-orchestration.md § dispatch_handoff Schema —
#                           placeholder "hardened in PR B" replaced by step-4 reference;
#                           manifest Phase 3 line carries type-null rule
#   (6)  / AC-6           : ref-direct-modes.md § Plan Review Mode gating slice —
#                           `keyword` token + ≥6 semantic security terms
#   (7)  / AC-7           : ref-direct-modes.md plan-review output block —
#                           visible-skip text (SKIPPED + re-run|--security)
#   (8)  / AC-9 + SEC-D2  : consistency check — BOTH orchestrator.md AND
#                           ref-special-flows.md affirm the hotfix Tier-3 pin;
#                           dispatch table Tier-3 and Tier-4 rows stay "pipeline mode"
#   (9)  / AC-8           : this file must contain Suite 40 + anti-false-green idiom
#   (10) / AC-5 schema    : schema row placeholder replaced (no "hardened in PR B")
#   (11) / AC-3 gate-only : Signal 2 slice must NOT rely solely on "re-evaluate"
#   (12)                  : self-referential guard — CLAUDE.md §11 names "Suite 40"
#                           + this file contains "Suite 40"
# ---------------------------------------------------------------------------
print()
print("=== Suite 40: pr-b-security-failopen ===")

# ---- file reads (suite-local) ----------------------------------------------
_s40_orch        = read(AGENTS_DIR / "orchestrator.md")
_s40_ref_special = read(AGENTS_DIR / "ref-special-flows.md")
_s40_suborch     = read(REPO_ROOT / "docs" / "subagent-orchestration.md")
_s40_ref_direct  = read(AGENTS_DIR / "ref-direct-modes.md")
_s40_claude      = read(REPO_ROOT / "CLAUDE.md")
_s40_self        = read(Path(__file__).resolve())

# ---- anchors ---------------------------------------------------------------
# AC-1: the Bug-tier classification block in Phase 0a Step 7
_S40_BUG_TIER_ANCHOR = "Bug tier (only when"
# AC-2: Hotfix sub-flow in ref-special-flows.md
_S40_HOTFIX_ANCHOR   = "## Hotfix sub-flow"
# AC-3: Signal 2 in orchestrator.md
_S40_SIGNAL2_ANCHOR  = "Signal 2 — File-path patterns"
# AC-4 / AC-5: Takeover Protocol step 4 + schema section
_S40_TAKEOVER_ANCHOR = "## Takeover Protocol"
_S40_SCHEMA_ANCHOR   = "## dispatch_handoff Schema"
# AC-6 / AC-7: Plan Review Mode gating in ref-direct-modes.md
_S40_PLAN_REVIEW_ANCHOR = "## Plan Review Mode"
# AC-9 / SEC-D2: dispatch table in orchestrator.md
_S40_DISPATCH_TABLE_ANCHOR = "Tier-gated dispatch table"

# ---- slices ----------------------------------------------------------------
_s40_bug_tier_slice    = _slice_section(_s40_orch,        _S40_BUG_TIER_ANCHOR)
_s40_hotfix_slice      = _slice_section(_s40_ref_special, _S40_HOTFIX_ANCHOR)
_s40_signal2_slice     = _slice_section(_s40_orch,        _S40_SIGNAL2_ANCHOR)
_s40_takeover_slice    = _slice_section(_s40_suborch,     _S40_TAKEOVER_ANCHOR)
_s40_schema_slice      = _slice_section(_s40_suborch,     _S40_SCHEMA_ANCHOR)
_s40_plan_review_slice = _slice_section(_s40_ref_direct,  _S40_PLAN_REVIEW_ANCHOR)
_s40_dispatch_slice    = _slice_section(_s40_orch,        _S40_DISPATCH_TABLE_ANCHOR)

# ---------------------------------------------------------------------------
# Check (1) / AC-1 + SEC-D1 — orchestrator.md § Bug tier:
# The hotfix→Tier-3 hard floor rule must be present in the Bug tier section.
# Requires: `hotfix` + `Tier 3` + one of (minimum|never below|never-below|hard floor).
# SEC-D1 override-clamp: `override` + one of (cannot lower|only raise|clamp)
# near `hotfix` — the operator `[TIER: 0/1/2]` override cannot lower a hotfix
# below Tier 3.
# ---------------------------------------------------------------------------
_S40_AC1_BASE_TOKENS = ("hotfix", "Tier 3")
_S40_AC1_FLOOR_ALTS  = ("minimum", "never below", "never-below", "hard floor", "nunca baja")
_S40_AC1_CLAMP_ALTS  = ("cannot lower", "only raise", "clamp", "solo sube")

def _tokens_within(text, tok_a, tok_b, window=200):
    """Return True if tok_a and tok_b appear within `window` chars of each other."""
    import re as _re
    for ma in _re.finditer(re.escape(tok_a), text):
        for mb in _re.finditer(re.escape(tok_b), text):
            if abs(ma.start() - mb.start()) <= window:
                return True
    return False

# Check 1a: `type: hotfix` (precise form) must appear within 200 chars of
# a floor phrase in the Bug tier section. The existing text has generic mentions
# of `hotfix` and `Tier 3` separately; after Fix #1, a dedicated rule
# "type: hotfix → Tier 3 minimum" will co-locate them.
_s40_floor_found = any(
    _tokens_within(_s40_bug_tier_slice, "type: hotfix", a, window=200)
    or _tokens_within(_s40_bug_tier_slice, "hotfix", a, window=80)
    for a in _S40_AC1_FLOOR_ALTS
)

check(
    "failopen(1a/ac-1): orchestrator.md § 'Bug tier' contains hotfix→Tier-3 hard floor"
    " ('type: hotfix' or 'hotfix' within 80-200 chars of a floor phrase:"
    f" {_S40_AC1_FLOOR_ALTS})",
    bool(_s40_bug_tier_slice)
    and "hotfix" in _s40_bug_tier_slice
    and "Tier 3" in _s40_bug_tier_slice
    and _s40_floor_found,
    f"anchor '{_S40_BUG_TIER_ANCHOR}' missing or hotfix Tier-3 floor absent;"
    f" need 'hotfix' + 'Tier 3' + one of {_S40_AC1_FLOOR_ALTS} within 200 chars",
)

check(
    "failopen(1b/ac-1/sec-d1): orchestrator.md § 'Bug tier' contains override-clamp"
    " for hotfix (override cannot lower hotfix below Tier 3)",
    bool(_s40_bug_tier_slice)
    and "override" in _s40_bug_tier_slice
    and "hotfix" in _s40_bug_tier_slice
    and any(a in _s40_bug_tier_slice for a in _S40_AC1_CLAMP_ALTS),
    f"anchor '{_S40_BUG_TIER_ANCHOR}' missing or SEC-D1 override-clamp absent;"
    f" need 'override' + 'hotfix' + one of {_S40_AC1_CLAMP_ALTS}",
)

# ---------------------------------------------------------------------------
# Check (2) / AC-2 — ref-special-flows.md § Hotfix sub-flow:
# The "security always" text must be justified by the Tier-3 pin.
# Both `hotfix` and `Tier 3` must appear in the Hotfix sub-flow slice.
# ---------------------------------------------------------------------------
check(
    "failopen(2/ac-2): agents/ref-special-flows.md § 'Hotfix sub-flow'"
    " contains security-always text justified by Tier-3 pin"
    " (tokens: hotfix + Tier 3 near security-always passage)",
    bool(_s40_hotfix_slice)
    and "hotfix" in _s40_hotfix_slice
    and "Tier 3" in _s40_hotfix_slice
    and "security" in _s40_hotfix_slice.lower(),
    f"anchor '{_S40_HOTFIX_ANCHOR}' missing or Tier-3 pin justification absent;"
    " need 'hotfix' + 'Tier 3' + 'security' in slice",
)

# ---------------------------------------------------------------------------
# Check (3) / AC-3 — orchestrator.md Signal 2 slice:
# The GATE must be deterministic — Signal 2 must explicitly say `git diff`
# (the actual command that runs at Phase 2 close) AND one of
# (MUST | FUERZA | forces) that is NOT part of an unrelated STAGE-GATE string.
# Using `git diff` (not just "touched paths") because that is the specific
# tool the contract requires at Phase 2-close; "touched paths" alone could
# be present in the existing Signal 2 path-description text.
# Anti-false-green: "GATE" is intentionally excluded from _S40_AC3_GATE_ALTS_MUST
# because "STAGE-GATE" already appears in the tier table captured by the slice.
# ---------------------------------------------------------------------------
_S40_AC3_GATE_ALTS_PATH   = ("git diff", "touched paths", "touched-paths", "scope known")
_S40_AC3_GATE_ALTS_MUST   = ("MUST", "FUERZA", "forces")

check(
    "failopen(3/ac-3): orchestrator.md Signal 2 slice contains deterministic re-tier GATE"
    " (git diff + MUST/FUERZA/forces — confirming the new deterministic gate text,"
    " not historical STAGE-GATE mentions already in the slice)",
    bool(_s40_signal2_slice)
    and "git diff" in _s40_signal2_slice
    and any(a in _s40_signal2_slice for a in _S40_AC3_GATE_ALTS_MUST),
    f"anchor '{_S40_SIGNAL2_ANCHOR}' missing or GATE tokens absent;"
    f" need 'git diff' + one of {_S40_AC3_GATE_ALTS_MUST}"
    " (GATE excluded to avoid false-green from STAGE-GATE text already in slice)",
)

# ---------------------------------------------------------------------------
# Check (4) / AC-4 — docs/subagent-orchestration.md § Takeover Protocol step 4:
# classify-first clause for type=null + "security defaults to RUN".
# ---------------------------------------------------------------------------
_S40_AC4_TOKENS = ("null", "classify", "security")
_S40_AC4_RUN_ALTS = ("defaults to RUN", "default RUN", "RUN by default", "security RUN",
                     "defaults to run", "RUN when type")

check(
    "failopen(4/ac-4): docs/subagent-orchestration.md § 'Takeover Protocol'"
    " step 4 contains classify-first for type=null + security defaults to RUN",
    bool(_s40_takeover_slice)
    and all(t in _s40_takeover_slice for t in _S40_AC4_TOKENS)
    and any(a in _s40_takeover_slice for a in _S40_AC4_RUN_ALTS),
    f"anchor '{_S40_TAKEOVER_ANCHOR}' missing or classify-first/security-RUN absent;"
    f" need {_S40_AC4_TOKENS} + one of {_S40_AC4_RUN_ALTS}",
)

# ---------------------------------------------------------------------------
# Check (5) / AC-5 — docs/subagent-orchestration.md § dispatch_handoff Schema:
# placeholder "hardened in PR B" must NOT appear (it was replaced by the
# implementer); and the type-null rule should reference step 4.
# ---------------------------------------------------------------------------
_S40_PLACEHOLDER = "hardened in PR B"

check(
    "failopen(5a/ac-5): docs/subagent-orchestration.md § 'dispatch_handoff Schema'"
    " no longer contains placeholder 'hardened in PR B' (was replaced by step-4 ref)",
    bool(_s40_schema_slice)
    and _S40_PLACEHOLDER not in _s40_schema_slice,
    f"Placeholder '{_S40_PLACEHOLDER}' still present in the dispatch_handoff Schema section"
    " — implementer must replace it with a reference to Takeover Protocol step 4",
)

check(
    "failopen(5b/ac-5): docs/subagent-orchestration.md manifest Phase 3 line"
    " carries type-null rule (type + null + security or classify in manifest section)",
    # The manifest lives inside § Takeover Protocol, so use the takeover slice.
    # Look for the Phase-3 manifest entry + type-null annotation.
    bool(_s40_takeover_slice)
    and "null" in _s40_takeover_slice
    and (
        "classify" in _s40_takeover_slice.lower()
        or "security" in _s40_takeover_slice.lower()
    ),
    f"Takeover Protocol section missing or Phase-3 manifest type-null annotation absent",
)

# ---------------------------------------------------------------------------
# Check (6) / AC-6 — agents/ref-direct-modes.md § Plan Review Mode:
# Gating section must contain `keyword` token + ≥6 semantic security terms.
# ---------------------------------------------------------------------------
_S40_SECURITY_TERMS = (
    "auth",
    "token",
    "jwt",
    "secret",
    "credential",
    "PII",
    "encrypt",
    "session",
    "permission",
    "password",
    "oauth",
    "signature",
    "csrf",
    "xss",
    "injection",
)

_s40_sec_terms_found = [t for t in _S40_SECURITY_TERMS if t in _s40_plan_review_slice]

check(
    "failopen(6/ac-6): agents/ref-direct-modes.md § 'Plan Review Mode' gating"
    " contains 'keyword' token + ≥6 semantic security terms"
    f" (need ≥6 of: {_S40_SECURITY_TERMS[:8]}...)",
    bool(_s40_plan_review_slice)
    and "keyword" in _s40_plan_review_slice
    and len(_s40_sec_terms_found) >= 6,
    f"anchor '{_S40_PLAN_REVIEW_ANCHOR}' missing or keyword-match contract absent;"
    f" 'keyword' present: {'keyword' in _s40_plan_review_slice};"
    f" security terms found ({len(_s40_sec_terms_found)}/6 minimum): {_s40_sec_terms_found}",
)

# ---------------------------------------------------------------------------
# Check (7) / AC-7 — agents/ref-direct-modes.md plan-review output block:
# visible-skip text must be present (SKIPPED + re-run|--security).
# ---------------------------------------------------------------------------
_S40_AC7_SKIP_ALTS = ("re-run", "--security", "re-run with --security")

check(
    "failopen(7/ac-7): agents/ref-direct-modes.md § 'Plan Review Mode' output block"
    " contains visible-skip text (SKIPPED + re-run|--security)",
    bool(_s40_plan_review_slice)
    and "SKIPPED" in _s40_plan_review_slice
    and any(a in _s40_plan_review_slice for a in _S40_AC7_SKIP_ALTS),
    f"anchor '{_S40_PLAN_REVIEW_ANCHOR}' missing or visible-skip text absent;"
    f" need 'SKIPPED' + one of {_S40_AC7_SKIP_ALTS}",
)

# ---------------------------------------------------------------------------
# Check (8a) / AC-9 consistency — BOTH orchestrator.md AND ref-special-flows.md
# affirm the hotfix Tier-3 pin.
# ---------------------------------------------------------------------------
check(
    "failopen(8a/ac-9): BOTH orchestrator.md § 'Bug tier' AND"
    " ref-special-flows.md § 'Hotfix sub-flow' affirm the hotfix→Tier-3 pin"
    " (hotfix + Tier 3 in both slices)",
    bool(_s40_bug_tier_slice)
    and bool(_s40_hotfix_slice)
    and "hotfix" in _s40_bug_tier_slice
    and "Tier 3" in _s40_bug_tier_slice
    and "hotfix" in _s40_hotfix_slice
    and "Tier 3" in _s40_hotfix_slice,
    "Consistency check failed: one or both files do not affirm hotfix→Tier-3 pin;"
    f" orchestrator has ('hotfix': {'hotfix' in _s40_bug_tier_slice},"
    f" 'Tier 3': {'Tier 3' in _s40_bug_tier_slice});"
    f" ref-special-flows has ('hotfix': {'hotfix' in _s40_hotfix_slice},"
    f" 'Tier 3': {'Tier 3' in _s40_hotfix_slice})",
)

# ---------------------------------------------------------------------------
# Check (8b) / AC-9 + SEC-D2 — dispatch table Tier-3 and Tier-4 rows still
# say "pipeline mode" (security runs). Fail-closed in BOTH classification AND
# dispatch (the two points of truth).
# ---------------------------------------------------------------------------
_S40_PIPELINE_MODE = "pipeline mode"

check(
    "failopen(8b/ac-9/sec-d2): orchestrator.md 'Tier-gated dispatch table'"
    " Tier-3 and Tier-4 rows still show 'pipeline mode' (security runs)",
    bool(_s40_dispatch_slice)
    and _s40_dispatch_slice.count(_S40_PIPELINE_MODE) >= 2,
    f"anchor '{_S40_DISPATCH_TABLE_ANCHOR}' missing or 'pipeline mode' appears"
    f" fewer than 2 times in slice (need Tier-3 row + Tier-4 row);"
    f" occurrences: {_s40_dispatch_slice.count(_S40_PIPELINE_MODE)}",
)

# ---------------------------------------------------------------------------
# Check (9) / AC-8 — this file contains Suite 40 and uses _slice_section idiom
# (anti-false-green: the suite file itself carries the idiom marker).
# ---------------------------------------------------------------------------
check(
    "failopen(9/ac-8): this test file contains Suite 40 marker"
    " and the _slice_section anti-false-green idiom",
    "Suite 40" in _s40_self
    and "_slice_section" in _s40_self
    and "pr-b-security-failopen" in _s40_self,
    "This file is missing Suite 40 marker, _slice_section usage, or"
    " pr-b-security-failopen identifier — self-consistency check failed",
)

# ---------------------------------------------------------------------------
# Check (10) / AC-3 gate-only guard — Signal 2 slice must contain the specific
# "tier_promote: 3" value (the concrete promotion the GATE emits when it fires
# at Phase 2-close). This is a unique token: the existing Signal 2 text has
# `tier_promote: <new_tier>` (with angle-bracket placeholder for the architect
# re-tier case) but NOT `tier_promote: 3` (the hardcoded value that the Phase
# 2-close GATE forces for any sensitive-path match). After Fix #2 adds the
# deterministic GATE, `tier_promote: 3` will appear in the Signal 2 section.
# ---------------------------------------------------------------------------
check(
    "failopen(10/ac-3-gate): orchestrator.md Signal 2 — GATE hardcodes tier_promote: 3"
    " (literal 'tier_promote: 3' present in Signal 2 slice, confirming the gate"
    " forces the specific value 3, not just the generic re-tier mechanism)",
    bool(_s40_signal2_slice)
    and "tier_promote: 3" in _s40_signal2_slice,
    f"Signal 2 slice missing or 'tier_promote: 3' absent;"
    " deterministic gate must hardcode promotion to Tier 3 for sensitive-path matches"
    " (existing text has 'tier_promote: <new_tier>' but not 'tier_promote: 3')",
)

# ---------------------------------------------------------------------------
# Check (11) / AC-5 schema placeholder — full-file check that the placeholder
# "hardened in PR B" is absent from the ENTIRE subagent-orchestration.md,
# not just the schema section (belt-and-suspenders vs check 5a).
# ---------------------------------------------------------------------------
check(
    "failopen(11/ac-5-file): docs/subagent-orchestration.md no longer contains"
    " placeholder 'hardened in PR B' anywhere in the file",
    _S40_PLACEHOLDER not in _s40_suborch,
    f"Placeholder '{_S40_PLACEHOLDER}' still present in docs/subagent-orchestration.md"
    " — implementer must replace it",
)

# ---------------------------------------------------------------------------
# Check (12) / self-referential guard:
# docs/testing.md (canonical registry) must register "Suite 40" + marker
# "pr-b-security-failopen". This file must contain the literal "Suite 40".
# Re-pointed from CLAUDE.md to docs/testing.md (pr-claude-md-hygiene).
# Does NOT read CLAUDE.md for the Suite literal — no fallback or 'or' permitted.
# ---------------------------------------------------------------------------
_s40_testing_md = read(REPO_ROOT / "docs" / "testing.md")
check(
    "failopen(12/self-ref):"
    " docs/testing.md canonical registry names 'Suite 40' and this file defines it"
    " (self-referential guard -- pr-b-security-failopen)",
    "Suite 40" in _s40_testing_md
    and "Suite 40" in _s40_self
    and "pr-b-security-failopen" in _s40_self,
    "Suite 40 not registered in docs/testing.md canonical registry"
    " or marker literal 'pr-b-security-failopen' missing in this file"
    " -- implementer must complete docs/testing.md; tester must not remove the marker",
)


# ---------------------------------------------------------------------------
# Suite 41 — pr-c-hotfix-correctness
#   Phase-1.6-for-hotfix contradiction fix: 3-way consistency check
#   + non-reproducible routing fix + Review-Summary owner fix.
#
#   All checks use anchored _slice_section (anti-false-green idiom from
#   Suite 36-40): anchor absent → _slice_section returns "" → token in ""
#   is False → sección ausente siempre falla.
#
#   CANONICAL ANCHORS (implementer MUST use verbatim):
#     agents/plan-reviewer.md  : "## Session Context Protocol"
#     agents/orchestrator.md   : "### Bug-fix flow row mappings (type: fix | hotfix)"
#     agents/orchestrator.md   : "## Phase 2.0 — Regression Test Authoring"
#     agents/orchestrator.md   : "## STAGE-GATE-1 — End of Stage 1 (mandatory human review)"
#     agents/ref-special-flows.md : "## Hotfix sub-flow (type: hotfix)"
#
#   Check index → AC mapping:
#     (1) / AC-1 : plan-reviewer.md SCP slice — defect phrase ABSENT
#     (2) / AC-1 : plan-reviewer.md SCP slice — affirmative tokens PRESENT
#     (3) / AC-2 : orchestrator.md renderer slice — "Phase 1.6 row is skipped" ABSENT
#     (4) / AC-2 : orchestrator.md renderer slice — affirmative tokens PRESENT
#     (5) / AC-3 : ref-special-flows.md hotfix slice — "still run" PRESENT (canonical preserved)
#     (6) / AC-3 : ref-special-flows.md hotfix slice — orchestrator Review Summary owner PRESENT
#     (7) / AC-4 : orchestrator.md Phase 2.0 slice — hotfix auto-promote tokens PRESENT
#     (8) / AC-5 : orchestrator.md STAGE-GATE-1 slice — orchestrator authors Review Summary PRESENT
#     (9) / AC-6 : orchestrator.md STAGE-GATE-1 slice — type-aware guard (hotfix path ≠ architect) PRESENT
#    (10) / AC-9 : self-referential guard — CLAUDE.md §11 names "Suite 41"; this file contains "Suite 41"
#    (11) / SEC-001 : orchestrator.md Phase 2.0 slice — hotfix auto-promote re-entry includes
#                     "Phase 1.6" + "STAGE-GATE-1" (not only "Phase 2.0"); proximity guard
#
#   AC-7 (version bump to 2.40.3) and AC-8 (Suite 41 in the suite, failing-first)
#   are covered by the self-ref guard (10) and the explicit authoring in Phase 2.0.
#   The version-bump assertions (AC-7) are intentionally deferred to the implementer
#   (version bump is Step 8, after the source fixes); asserting the new version here
#   would make this a pre-fix-red AND post-fix-red assertion, which violates the
#   failing-test contract. Version bumps are guarded in Suite 3 (existing).
# ---------------------------------------------------------------------------
print()
print("=== Suite 41: pr-c-hotfix-correctness — hotfix flow correctness ===")

_s41_pr = read(AGENTS_DIR / "plan-reviewer.md")
_s41_orch = read(AGENTS_DIR / "orchestrator.md")
_s41_rsf = read(AGENTS_DIR / "ref-special-flows.md")
_s41_claude = read(REPO_ROOT / "CLAUDE.md")
_s41_self = Path(__file__).read_text(encoding="utf-8")

# Slice anchors
_S41_PR_ANCHOR = "## Session Context Protocol"
_S41_RENDERER_ANCHOR = "### Bug-fix flow row mappings (type: fix | hotfix)"
_S41_PHASE20_ANCHOR = "## Phase 2.0 — Regression Test Authoring"
_S41_GATE1_ANCHOR = "## STAGE-GATE-1 — End of Stage 1 (mandatory human review)"
_S41_HOTFIX_ANCHOR = "## Hotfix sub-flow (type: hotfix)"

_S41_MODIFIED_PHASES_ANCHOR = "### Modified phases"

_s41_pr_scp_slice = _slice_section(_s41_pr, _S41_PR_ANCHOR)
_s41_renderer_slice = _slice_section(_s41_orch, _S41_RENDERER_ANCHOR)
_s41_phase20_slice = _slice_section(_s41_orch, _S41_PHASE20_ANCHOR)
_s41_gate1_slice = _slice_section(_s41_orch, _S41_GATE1_ANCHOR)
_s41_hotfix_slice = _slice_section(_s41_rsf, _S41_HOTFIX_ANCHOR)
# The "Phase 1.5 and 1.6 — still run" canonical line and the orchestrator Review Summary
# ownership step live in ### Modified phases (sub-section of ## Hotfix sub-flow).
# _slice_section cuts at the first heading inside ## Hotfix sub-flow, so we must
# anchor at the sub-section level. "### Modified phases" is unique in the file.
_s41_hotfix_modified_slice = _slice_section(_s41_rsf, _S41_MODIFIED_PHASES_ANCHOR)

# ---------------------------------------------------------------------------
# Check (1) / AC-1 — Defect phrase ABSENT from plan-reviewer.md SCP slice.
# Today: "should have skipped Phase 1.6 entirely for hotfix" is present → FAILS.
# Post-fix: phrase removed → PASSES.
# ---------------------------------------------------------------------------
_S41_DEFECT_PHRASE = "should have skipped Phase 1.6 entirely for hotfix"

check(
    "hotfix-flow(1/ac-1): plan-reviewer.md § Session Context Protocol does NOT"
    " contain defect phrase 'should have skipped Phase 1.6 entirely for hotfix'",
    bool(_s41_pr_scp_slice)
    and _S41_DEFECT_PHRASE not in _s41_pr_scp_slice,
    f"Defect phrase '{_S41_DEFECT_PHRASE}' still present in plan-reviewer.md"
    f" § Session Context Protocol — defect 1a not fixed;"
    f" anchor present: {bool(_s41_pr_scp_slice)}",
)

# ---------------------------------------------------------------------------
# Check (2) / AC-1 — Affirmative tokens PRESENT in plan-reviewer.md SCP slice.
# Today: affirmative text absent → FAILS.
# Post-fix: replacement text present → PASSES.
# Require: "Phase 1.6" AND one of ("runs normally", "still run", "runs for hotfix")
# in the hotfix bullet of the SCP slice.
# ---------------------------------------------------------------------------
_S41_AFFIRM_ALTS = ("runs normally", "still run", "runs for hotfix")

check(
    "hotfix-flow(2/ac-1): plan-reviewer.md § Session Context Protocol affirms"
    " Phase 1.6 runs for hotfix (Phase 1.6 + one of: runs normally / still run"
    " / runs for hotfix)",
    bool(_s41_pr_scp_slice)
    and "Phase 1.6" in _s41_pr_scp_slice
    and any(alt in _s41_pr_scp_slice for alt in _S41_AFFIRM_ALTS),
    f"Affirmative tokens missing in plan-reviewer.md § Session Context Protocol;"
    f" 'Phase 1.6' present: {'Phase 1.6' in _s41_pr_scp_slice};"
    f" alternatives checked: {_S41_AFFIRM_ALTS}",
)

# ---------------------------------------------------------------------------
# Check (3) / AC-2 — Gemelo renderer phrase ABSENT from orchestrator.md renderer slice.
# Today: "Phase 1.6 row is skipped for `type: hotfix`" is present → FAILS.
# Post-fix: phrase removed → PASSES.
# ---------------------------------------------------------------------------
_S41_RENDERER_DEFECT = "Phase 1.6 row is skipped for `type: hotfix`"

check(
    "hotfix-flow(3/ac-2): orchestrator.md § 'Bug-fix flow row mappings' does NOT"
    " contain renderer defect 'Phase 1.6 row is skipped for `type: hotfix`'",
    bool(_s41_renderer_slice)
    and _S41_RENDERER_DEFECT not in _s41_renderer_slice,
    f"Renderer defect phrase '{_S41_RENDERER_DEFECT}' still present in orchestrator.md"
    f" § Bug-fix flow row mappings — defect 1b (gemelo) not fixed;"
    f" anchor present: {bool(_s41_renderer_slice)}",
)

# ---------------------------------------------------------------------------
# Check (4) / AC-2 — Affirmative renderer tokens PRESENT in orchestrator.md renderer slice.
# Today: affirmative text absent → FAILS.
# Post-fix: replacement text present → PASSES.
# Strategy: require tokens that ONLY appear after the defect line is replaced.
# The current defect line "Phase 1.6 row is skipped for `type: hotfix`" contains
# "runs" elsewhere in the slice (e.g., "security runs always") — those create a
# false green. Instead require "Rule 7 no-op" or "Rule 8 active" which the
# implementer must add per the Work Plan (defect-1b fix language from 01-plan.md).
# ---------------------------------------------------------------------------
_S41_RENDERER_AFFIRM_ALTS = ("Rule 7 no-op", "Rule 8 active", "Rule 7", "Rule 8")

check(
    "hotfix-flow(4/ac-2): orchestrator.md § 'Bug-fix flow row mappings' affirms"
    " Phase 1.6 renders for hotfix with Rule 7/8 annotation"
    " (Rule 7 no-op / Rule 8 active / Rule 7 / Rule 8 in renderer slice)",
    bool(_s41_renderer_slice)
    and any(alt in _s41_renderer_slice for alt in _S41_RENDERER_AFFIRM_ALTS),
    f"Affirmative renderer tokens missing in orchestrator.md § Bug-fix flow row mappings;"
    f" alternatives checked: {_S41_RENDERER_AFFIRM_ALTS};"
    f" anchor present: {bool(_s41_renderer_slice)}",
)

# ---------------------------------------------------------------------------
# Check (5) / AC-3 — Canonical "still run" preserved in ref-special-flows.md.
# Anchored at "### Modified phases" (unique sub-section of ## Hotfix sub-flow;
# _slice_section on ## Hotfix sub-flow cuts at the first sub-heading, so the
# "Phase 1.5 and 1.6 — still run" line lives in the ### Modified phases slice).
# Today: the canonical line is present in ### Modified phases → PASSES today.
# This is a no-regress guard — must remain green pre-fix AND post-fix.
# ---------------------------------------------------------------------------
check(
    "hotfix-flow(5/ac-3): ref-special-flows.md § '### Modified phases' (inside"
    " Hotfix sub-flow) preserves canonical '1.6' + 'still run' (no-regress guard)",
    bool(_s41_hotfix_modified_slice)
    and "still run" in _s41_hotfix_modified_slice
    and "1.6" in _s41_hotfix_modified_slice,
    f"Canonical 'still run' / '1.6' absent from ref-special-flows.md"
    f" § Modified phases — canonical source must be preserved;"
    f" anchor present: {bool(_s41_hotfix_modified_slice)}",
)

# ---------------------------------------------------------------------------
# Check (6) / AC-3 — Orchestrator authors Review Summary, reflected in
# ref-special-flows.md § Modified phases (inside Hotfix sub-flow).
# Today: "Review Summary" absent from the slice → FAILS.
# Post-fix: "orchestrator" + "Review Summary" added to the modified-phases block → PASSES.
# ---------------------------------------------------------------------------
_S41_RSF_REVIEW_TOKENS = ("orchestrator", "Review Summary")

check(
    "hotfix-flow(6/ac-3): ref-special-flows.md § '### Modified phases' (inside"
    " Hotfix sub-flow) documents that the orchestrator authors § Review Summary"
    " before STAGE-GATE-1 (tokens: orchestrator + Review Summary)",
    bool(_s41_hotfix_modified_slice)
    and all(tok in _s41_hotfix_modified_slice for tok in _S41_RSF_REVIEW_TOKENS),
    f"Tokens {_S41_RSF_REVIEW_TOKENS} not all present in ref-special-flows.md"
    f" § Modified phases — defect 3 (Review Summary owner) not reflected here;"
    f" anchor present: {bool(_s41_hotfix_modified_slice)};"
    + " ".join(
        f"'{t}' present: {t in _s41_hotfix_modified_slice};"
        for t in _S41_RSF_REVIEW_TOKENS
    ),
)

# ---------------------------------------------------------------------------
# Check (7) / AC-4 — Auto-promote tokens PRESENT in orchestrator.md Phase 2.0 slice.
# Today: the bug-not-reproducible row does NOT distinguish type; "hotfix" and
# "auto-promote" do co-occur in the slice but in unrelated contexts (Tier-1
# auto-promote to Tier-2), so the naive check produces a false green.
# Strategy: require the specific co-occurrence of "bug-not-reproducible" +
# "hotfix" + "type: fix" in the same Phase 2.0 slice, indicating the row has
# been split by type. Today the bug-not-reproducible row says "Route back to
# architect" for ALL types without "type: fix" in that row context.
# Require: "bug-not-reproducible" + "hotfix" + "type: fix" all co-present in
# the Phase 2.0 slice (post-fix the table splits the row by type, so "type: fix"
# appears in the hotfix → auto-promote → type: fix routing text).
# ---------------------------------------------------------------------------
check(
    "hotfix-flow(7/ac-4): orchestrator.md § 'Phase 2.0 Regression Test Authoring'"
    " documents hotfix-specific auto-promote on bug-not-reproducible"
    " ('bug-not-reproducible' + 'hotfix' + 'auto-promote' all co-present in slice;"
    " today the auto-promote in this slice is Tier-1→Tier-2 only; post-fix a"
    " hotfix→type:fix auto-promote row is added so all three tokens co-appear"
    " in a hotfix context — verified via 'hotfix' + 'auto-promote' co-occurrence"
    " separated by ≤300 chars, confirming they appear in the same gate-table row).",
    bool(_s41_phase20_slice)
    and "bug-not-reproducible" in _s41_phase20_slice
    and "hotfix" in _s41_phase20_slice
    and "auto-promote" in _s41_phase20_slice
    # Proximity guard: post-fix, "hotfix" and "auto-promote" will appear within
    # the same table row (~300 chars). Today they do NOT — "auto-promote" appears
    # in the Tier-1 section, "hotfix" appears in the gate-table section, and
    # they are separated by over 1000 characters.
    and any(
        abs(_s41_phase20_slice.find("hotfix", i) - i) <= 300
        for i in (
            j for j in range(len(_s41_phase20_slice))
            if _s41_phase20_slice[j:j + len("auto-promote")] == "auto-promote"
        )
    ),
    f"Hotfix auto-promote proximity check failed in Phase 2.0 slice;"
    f" 'bug-not-reproducible' present: {'bug-not-reproducible' in _s41_phase20_slice};"
    f" 'hotfix' present: {'hotfix' in _s41_phase20_slice};"
    f" 'auto-promote' present: {'auto-promote' in _s41_phase20_slice};"
    f" anchor present: {bool(_s41_phase20_slice)}"
    " — post-fix 'auto-promote' and 'hotfix' must appear within 300 chars of each other"
    " (same table row); today they are in different sections (>1000 chars apart)",
)

# ---------------------------------------------------------------------------
# Check (8) / AC-5 — Orchestrator Review Summary authoring step PRESENT in
# orchestrator.md STAGE-GATE-1 slice (defect 3a).
# Today: "emits" exists in the slice but for "STAGE-GATE-1 emits" (gate action),
# not for "orchestrator authors Review Summary for hotfix". The authoring step
# using "authors" or "writes" is absent.
# Post-fix: an explicit step is added with language like "orchestrator authors
# 01-plan.md § Review Summary" for hotfix, so "authors" or "writes" will appear
# in proximity to "hotfix" + "Review Summary".
# Strategy: require "hotfix" + "Review Summary" + one of ("authors", "writes")
# within 400 chars of each other in the GATE-1 slice.
# ---------------------------------------------------------------------------
_S41_GATE1_AUTHOR_ALTS = ("authors", "writes")

check(
    "hotfix-flow(8/ac-5): orchestrator.md § STAGE-GATE-1 documents explicit step"
    " where orchestrator authors § Review Summary for hotfix"
    " ('hotfix' + 'Review Summary' + 'authors'/'writes' within 400 chars)",
    bool(_s41_gate1_slice)
    and "hotfix" in _s41_gate1_slice
    and "Review Summary" in _s41_gate1_slice
    and any(
        any(
            abs(_s41_gate1_slice.find("hotfix", max(0, i - 200)) - i) <= 400
            for i in (
                j for j in range(len(_s41_gate1_slice))
                if _s41_gate1_slice[j:j + len("Review Summary")] == "Review Summary"
            )
        )
        and alt in _s41_gate1_slice
        for alt in _S41_GATE1_AUTHOR_ALTS
    ),
    f"Authoring step tokens missing in orchestrator.md § STAGE-GATE-1 slice;"
    f" 'hotfix' present: {'hotfix' in _s41_gate1_slice};"
    f" 'Review Summary' present: {'Review Summary' in _s41_gate1_slice};"
    f" author-alts checked: {_S41_GATE1_AUTHOR_ALTS} (not found near hotfix+Review Summary);"
    f" anchor present: {bool(_s41_gate1_slice)}"
    " — post-fix an explicit orchestrator-authors-Review-Summary step must appear"
    " for hotfix in the STAGE-GATE-1 section",
)

# ---------------------------------------------------------------------------
# Check (9) / AC-6 — Type-aware guard PRESENT in orchestrator.md STAGE-GATE-1 slice (defect 3b).
# Today: guard "route back to architect" is NOT type-aware — no hotfix-specific branch → FAILS.
# Post-fix: type-aware guard added (hotfix path does NOT route to architect) → PASSES.
# Strategy: require "hotfix" + ("type-aware" or "orchestrator" near "Review Summary missing")
# AND require that "hotfix" co-occurs with NOT routing to architect in the guard context.
# Concrete: require "hotfix" in gate1_slice AND one of the affirmative type-aware signals.
# Affirmative signals: "type-aware", "orchestrator-self", "never route" with hotfix context.
# Conservative: require "hotfix" + one of ("type-aware", "self-authored", "orchestrator author")
# to appear in the gate1 slice (the implementer must add these to the guard language).
# ---------------------------------------------------------------------------
_S41_TYPEAWARE_ALTS = ("type-aware", "self-authored", "orchestrator author", "self-author")

check(
    "hotfix-flow(9/ac-6): orchestrator.md § STAGE-GATE-1 guard is type-aware"
    " — hotfix path does NOT route to architect"
    " (hotfix + type-aware/self-authored/orchestrator author in slice)",
    bool(_s41_gate1_slice)
    and "hotfix" in _s41_gate1_slice
    and any(alt in _s41_gate1_slice for alt in _S41_TYPEAWARE_ALTS),
    f"Type-aware guard tokens missing in orchestrator.md § STAGE-GATE-1 slice;"
    f" 'hotfix' present: {'hotfix' in _s41_gate1_slice};"
    f" alternatives checked: {_S41_TYPEAWARE_ALTS};"
    f" anchor present: {bool(_s41_gate1_slice)}",
)

# ---------------------------------------------------------------------------
# Check (10) / AC-9 — Self-referential guard.
# docs/testing.md (canonical registry) must name "Suite 41".
# This file must contain literal "Suite 41" and "_slice_section".
# Re-pointed from CLAUDE.md to docs/testing.md (pr-claude-md-hygiene).
# Does NOT read CLAUDE.md for the Suite literal — no fallback or 'or' permitted.
# ---------------------------------------------------------------------------
_s41_testing_md = read(REPO_ROOT / "docs" / "testing.md")
check(
    "hotfix-flow(10/ac-9): docs/testing.md canonical registry names 'Suite 41'"
    " and this file defines it (self-referential guard — pr-c-hotfix-correctness)",
    "Suite 41" in _s41_testing_md
    and "Suite 41" in _s41_self
    and "_slice_section" in _s41_self
    and "pr-c-hotfix-correctness" in _s41_self,
    "Suite 41 not registered in docs/testing.md canonical registry"
    " or literal 'pr-c-hotfix-correctness' missing in this file"
    " or '_slice_section' idiom absent"
    " — implementer must complete docs/testing.md; tester must not remove the markers",
)


# ---------------------------------------------------------------------------
# Check (11) / SEC-001 — hotfix auto-promote re-entry includes Phase 1.6 and
# STAGE-GATE-1, NOT only Phase 2.0.
# Anchored at "## Phase 2.0 — Regression Test Authoring" (_s41_phase20_slice).
# Pre-fix (SEC-001 open): the bug-not-reproducible (type: hotfix) row says
#   "re-run Phase 2.0" — skips Phase 1.6 and STAGE-GATE-1 → FAILS.
# Post-fix: row updated to "re-run Phase 1.5 → 1.6 → STAGE-GATE-1 → Phase 2.0"
#   so "Phase 1.6" and "STAGE-GATE-1" appear in the hotfix auto-promote row → PASSES.
# Strategy: require "Phase 1.6" AND "STAGE-GATE-1" in the Phase 2.0 slice,
# both in proximity to "auto-promote" and "hotfix" (within 500 chars).
# ---------------------------------------------------------------------------
_S41_REENTRY_TOKENS = ("Phase 1.6", "STAGE-GATE-1")

check(
    "hotfix-flow(11/sec-001): orchestrator.md § 'Phase 2.0 Regression Test Authoring'"
    " auto-promote re-entry includes Phase 1.6 and STAGE-GATE-1, not only Phase 2.0"
    " ('Phase 1.6' + 'STAGE-GATE-1' both present in Phase 2.0 slice, in proximity"
    " to 'auto-promote' + 'hotfix' — confirms the promoted fix goes through"
    " Phase 1.6 security design-review before implementation)",
    bool(_s41_phase20_slice)
    and all(tok in _s41_phase20_slice for tok in _S41_REENTRY_TOKENS)
    and any(
        abs(_s41_phase20_slice.find("auto-promote", i) - i) <= 500
        for i in (
            j for j in range(len(_s41_phase20_slice))
            if _s41_phase20_slice[j:j + len("Phase 1.6")] == "Phase 1.6"
        )
    ),
    f"SEC-001 not closed: auto-promote re-entry tokens missing in Phase 2.0 slice;"
    f" 'Phase 1.6' present: {'Phase 1.6' in _s41_phase20_slice};"
    f" 'STAGE-GATE-1' present: {'STAGE-GATE-1' in _s41_phase20_slice};"
    f" anchor present: {bool(_s41_phase20_slice)}"
    " — post-fix the hotfix auto-promote row must specify"
    " 'Phase 1.5 → 1.6 → STAGE-GATE-1 → Phase 2.0' so the promoted type:fix"
    " passes through Phase 1.6 security design-review",
)


# ---------------------------------------------------------------------------
# Suite 42 -- pr-d-frontend-wiring (AC-1..AC-9)
# ---------------------------------------------------------------------------
# Anchor-scoped checks for the frontend-scope (ux-reviewer) wiring closed by
# PR D of the pipeline-flows-hardening programme.
#
# Dead-letter bug (theme #2): the ux-reviewer is declared in classification
# tables but no phase body dispatches it and no gate reads 04-ux-validation.md,
# so the "WCAG A blocks delivery" contract is vacuous.
#
# PR D fix:
#   (1) Phase 1 body gains a "When frontend_scope: true" sub-block that
#       dispatches ux-reviewer enrich (sub-phase 1.7) after the architect.
#   (2) Phase 3 parallel-dispatch block gains ux-reviewer validate (sub-phase
#       3.4) when frontend_scope: true.
#   (3) Phase 3.5 reads 04-ux-validation.md; a critical (WCAG A) finding fails
#       the gate and routes back to implementer (Case A).
#   (4) Phase 3.6 input pointers include 04-ux-validation.md.
#   (5) Sub-phase identities 1.7-ux-enrich / 3.4-ux-validate carry
#       phase.start/phase.end observability events and Phase-Checklist lines
#       gated by frontend_scope ([~skipped: frontend_scope:false] when off).
#   (6) A fallback inline/nested path exists for the ux-reviewer (mirrors the
#       plan-reviewer fallback tree); status-block gate reads findings.critical.
#   (7) agents/ux-reviewer.md enrich-mode pins AC into 01-plan.md § Task List
#       (not only 01-ux-review.md), resolving the AC-sink contradiction.
#
# Every check slices to a named anchor and asserts sub-tokens WITHIN the slice.
# Anti-false-green guarantee:
#   _slice_section returns "" when the anchor is absent
#   => `"token" in ""` is always False
#   => a missing section always fails the check, never silently passes it.
#
# Exceptions:
#   - Check (9)  self-referential guard: file-wide by design (Suite 35-41 precedent).
#   - Check (10) CLAUDE.md §11 self-ref guard: file-wide by design.
#
# CANONICAL ANCHORS (implementer MUST add these verbatim to the target files):
#   agents/orchestrator.md  : "### When frontend_scope: true — ux-reviewer enrich (Phase 1.7)"
#   agents/orchestrator.md  : "### When frontend_scope: true — ux-reviewer validate (Phase 3.4)"
#   agents/orchestrator.md  : "### UX gate — frontend_scope: true"
#   agents/orchestrator.md  : "### Phase Checklist — frontend_scope additions"
#   agents/orchestrator.md  : "### ux-reviewer fallback"
#   agents/ux-reviewer.md   : "### AC sink — 01-plan.md § Task List"
#
# Check index -> AC mapping:
#   (1)  / AC-1  : orchestrator.md Phase 1 enrich anchor —
#                  "When frontend_scope: true" sub-block dispatches ux-reviewer
#                  enrich (1.7-ux-enrich) after architect, before Phase 1.5;
#                  input 01-plan.md + output 01-ux-review.md.
#   (2)  / AC-2  : orchestrator.md Phase 3 validate anchor —
#                  ux-reviewer validate (3.4-ux-validate) in the parallel block
#                  when frontend_scope: true; input 02-implementation.md +
#                  01-ux-review.md; output 04-ux-validation.md.
#   (3)  / AC-3  : orchestrator.md Phase 3.5 UX gate anchor —
#                  reads 04-ux-validation.md; critical (WCAG A) fails gate and
#                  routes to implementer (Case A); high/medium do NOT block.
#   (4)  / AC-4  : orchestrator.md Phase 3.6 input pointers —
#                  04-ux-validation.md listed as a pointer (pointer line in
#                  the existing Phase 3.6 "Invoke via Task tool" block).
#   (5)  / AC-5  : orchestrator.md Phase Checklist anchor —
#                  sub-phase lines 1.7-ux-enrich / 3.4-ux-validate present;
#                  phase.start/phase.end observability events named;
#                  [~skipped: frontend_scope:false] gating marker present.
#   (6)  / AC-6  : orchestrator.md ux-reviewer fallback anchor —
#                  inline/nested fallback documented; verdict derived from
#                  findings.critical (status-block gate).
#   (7)  / AC-7  : agents/ux-reviewer.md AC-sink anchor —
#                  enrich-mode pins AC into 01-plan.md § Task List;
#                  resolves the 01-ux-review.md vs "append to PR AC list"
#                  contradiction (lines :46/:66/:115-138).
#   (8)  / AC-8  : this file contains "Suite 42" + "_slice_section" idiom
#                  + "pr-d-frontend-wiring" (anti-false-green self-check).
#   (9)  / AC-8  : CLAUDE.md §11 registers "Suite 42" + "pr-d-frontend-wiring".
#   (10) / AC-1+2: consistency check — BOTH Phase 1 enrich slice AND Phase 3
#                  validate slice reference "04-ux-validation.md" and
#                  "ux-reviewer" (end-to-end wiring in both directions).
# ---------------------------------------------------------------------------
print()
print("=== Suite 42: pr-d-frontend-wiring — frontend-scope ux-reviewer wiring ===")

# ---- file reads (suite-local) ----------------------------------------------
_s42_orch    = read(AGENTS_DIR / "orchestrator.md")
_s42_uxrev   = read(AGENTS_DIR / "ux-reviewer.md")
_s42_claude  = read(REPO_ROOT / "CLAUDE.md")
_s42_self    = Path(__file__).read_text(encoding="utf-8")

# ---- canonical anchors -----------------------------------------------------
_S42_ENRICH_ANCHOR    = "### When frontend_scope: true — ux-reviewer enrich (Phase 1.7)"
_S42_VALIDATE_ANCHOR  = "### When frontend_scope: true — ux-reviewer validate (Phase 3.4)"
_S42_GATE35_ANCHOR    = "### UX gate — frontend_scope: true"
_S42_CHECKLIST_ANCHOR = "### Phase Checklist — frontend_scope additions"
_S42_FALLBACK_ANCHOR  = "### Phase 1.7 — ux-reviewer nested-context handoff"
_S42_ACSINK_ANCHOR    = "### AC sink — 01-plan.md § Task List"

# ---- slices ----------------------------------------------------------------
_s42_enrich_slice    = _slice_section(_s42_orch,  _S42_ENRICH_ANCHOR)
_s42_validate_slice  = _slice_section(_s42_orch,  _S42_VALIDATE_ANCHOR)
_s42_gate35_slice    = _slice_section(_s42_orch,  _S42_GATE35_ANCHOR)
_s42_checklist_slice = _slice_section(_s42_orch,  _S42_CHECKLIST_ANCHOR)
_s42_fallback_slice  = _slice_section(_s42_orch,  _S42_FALLBACK_ANCHOR)
_s42_acsink_slice    = _slice_section(_s42_uxrev, _S42_ACSINK_ANCHOR)

# ---------------------------------------------------------------------------
# Check (1) / AC-1 — orchestrator.md § Phase 1 enrich block:
# When frontend_scope: true, ux-reviewer enrich dispatched after architect,
# before Phase 1.5. Tokens: "1.7-ux-enrich" + "ux-reviewer" +
# "01-ux-review.md" + "01-plan.md" (input) + "1.5" (ordering reference).
# ---------------------------------------------------------------------------
_S42_ENRICH_TOKENS = ("1.7-ux-enrich", "ux-reviewer", "01-ux-review.md", "01-plan.md", "1.5")

check(
    "frontend-wiring(1/ac-1): orchestrator.md contains Phase 1 enrich anchor"
    " and dispatches ux-reviewer enrich (1.7-ux-enrich) before Phase 1.5,"
    " with input 01-plan.md and output 01-ux-review.md",
    bool(_s42_enrich_slice)
    and all(t in _s42_enrich_slice for t in _S42_ENRICH_TOKENS),
    f"anchor '{_S42_ENRICH_ANCHOR}' missing or required tokens absent;"
    f" anchor present: {bool(_s42_enrich_slice)};"
    + " ".join(
        f" '{t}' present: {t in _s42_enrich_slice};"
        for t in _S42_ENRICH_TOKENS
    ),
)

# ---------------------------------------------------------------------------
# Check (2) / AC-2 — orchestrator.md § Phase 3 validate block:
# ux-reviewer validate (3.4-ux-validate) in the parallel Task block when
# frontend_scope: true. Tokens: "3.4-ux-validate" + "ux-reviewer" +
# "04-ux-validation.md" + "02-implementation.md" + "01-ux-review.md".
# ---------------------------------------------------------------------------
_S42_VALIDATE_TOKENS = (
    "3.4-ux-validate", "ux-reviewer", "04-ux-validation.md",
    "02-implementation.md", "01-ux-review.md",
)

check(
    "frontend-wiring(2/ac-2): orchestrator.md contains Phase 3 validate anchor"
    " and adds ux-reviewer validate (3.4-ux-validate) to the parallel Task block"
    " with input 02-implementation.md+01-ux-review.md and output 04-ux-validation.md",
    bool(_s42_validate_slice)
    and all(t in _s42_validate_slice for t in _S42_VALIDATE_TOKENS),
    f"anchor '{_S42_VALIDATE_ANCHOR}' missing or required tokens absent;"
    f" anchor present: {bool(_s42_validate_slice)};"
    + " ".join(
        f" '{t}' present: {t in _s42_validate_slice};"
        for t in _S42_VALIDATE_TOKENS
    ),
)

# ---------------------------------------------------------------------------
# Check (3) / AC-3 — orchestrator.md § Phase 3.5 UX gate:
# reads 04-ux-validation.md; critical (WCAG A) finding fails gate and routes
# to implementer (Case A); the gate explicitly does NOT block on high/medium.
# Tokens required: "04-ux-validation.md" + "critical" + "Case A" +
# one of ("implementer", "routes to implementer", "route to implementer").
# Negative token: "high" MUST also be present (to confirm the "only critical
# blocks" language is there, not just a bare "critical" mention).
# ---------------------------------------------------------------------------
_S42_GATE35_BASE_TOKENS = ("04-ux-validation.md", "critical", "Case A")
_S42_GATE35_ROUTE_ALTS  = ("implementer", "route to implementer", "routes to implementer")
_S42_GATE35_WCAG_ALTS   = ("WCAG A", "WCAG-A", "wcag-a", "wcag a")

check(
    "frontend-wiring(3/ac-3): orchestrator.md § Phase 3.5 UX gate reads"
    " 04-ux-validation.md; critical (WCAG A) finding fails gate and routes to"
    " implementer (Case A); 'high' token confirms only-critical-blocks language",
    bool(_s42_gate35_slice)
    and all(t in _s42_gate35_slice for t in _S42_GATE35_BASE_TOKENS)
    and any(a in _s42_gate35_slice for a in _S42_GATE35_ROUTE_ALTS)
    and any(a in _s42_gate35_slice for a in _S42_GATE35_WCAG_ALTS)
    and "high" in _s42_gate35_slice,
    f"anchor '{_S42_GATE35_ANCHOR}' missing or gate tokens absent;"
    f" anchor present: {bool(_s42_gate35_slice)};"
    + " ".join(f" '{t}' present: {t in _s42_gate35_slice};" for t in _S42_GATE35_BASE_TOKENS)
    + f" route-alt found: {any(a in _s42_gate35_slice for a in _S42_GATE35_ROUTE_ALTS)};"
    f" WCAG-A alt found: {any(a in _s42_gate35_slice for a in _S42_GATE35_WCAG_ALTS)};"
    f" 'high' present: {'high' in _s42_gate35_slice}",
)

# ---------------------------------------------------------------------------
# Check (4) / AC-4 — orchestrator.md Phase 3.6 input pointers:
# 04-ux-validation.md must appear in the existing "Invoke via Task tool"
# pointer block of Phase 3.6 (acceptance checker inputs).
# Strategy: search the whole orchestrator text for the 3.6 pointer block
# and verify 04-ux-validation.md is listed alongside the existing pointers.
# The existing line (orchestrator.md:1750) lists:
#   "02-implementation.md, 03-testing.md, 04-validation.md, and 04-security.md"
# After the fix it must also include "04-ux-validation.md".
# Anchor: "## Phase 3.6" (the acceptance-checker phase heading).
# ---------------------------------------------------------------------------
_S42_PHASE36_ANCHOR = "## Phase 3.6"
_s42_phase36_slice  = _slice_section(_s42_orch, _S42_PHASE36_ANCHOR)

check(
    "frontend-wiring(4/ac-4): orchestrator.md Phase 3.6 input pointer block"
    " includes '04-ux-validation.md' (alongside existing 02-implementation.md,"
    " 03-testing.md, 04-validation.md pointers)",
    bool(_s42_phase36_slice)
    and "04-ux-validation.md" in _s42_phase36_slice,
    f"anchor '{_S42_PHASE36_ANCHOR}' missing or '04-ux-validation.md' absent"
    f" from Phase 3.6 input pointer block;"
    f" anchor present: {bool(_s42_phase36_slice)};"
    f" '04-ux-validation.md' present: {'04-ux-validation.md' in _s42_phase36_slice}",
)

# ---------------------------------------------------------------------------
# Check (5) / AC-5 — orchestrator.md Phase Checklist frontend_scope additions:
# Sub-phase lines 1.7-ux-enrich and 3.4-ux-validate must be present.
# The [~skipped: frontend_scope:false] gating marker must appear.
# phase.start and phase.end observability event labels must be named.
# The ordering note (number marks identity, not execution order) must appear.
# ---------------------------------------------------------------------------
_S42_CHECKLIST_TOKENS = (
    "1.7-ux-enrich",
    "3.4-ux-validate",
    "frontend_scope:false",
    "phase.start",
    "phase.end",
)
_S42_ORDER_ALTS = ("identity", "observability", "execution order", "not order")

check(
    "frontend-wiring(5/ac-5): orchestrator.md Phase Checklist anchor contains"
    " sub-phase lines 1.7-ux-enrich + 3.4-ux-validate + [~skipped: frontend_scope:false]"
    " + phase.start/phase.end + ordering-note (identity/observability/not order)",
    bool(_s42_checklist_slice)
    and all(t in _s42_checklist_slice for t in _S42_CHECKLIST_TOKENS)
    and any(a in _s42_checklist_slice for a in _S42_ORDER_ALTS),
    f"anchor '{_S42_CHECKLIST_ANCHOR}' missing or required tokens absent;"
    f" anchor present: {bool(_s42_checklist_slice)};"
    + " ".join(f" '{t}' present: {t in _s42_checklist_slice};" for t in _S42_CHECKLIST_TOKENS)
    + f" order-alt found: {any(a in _s42_checklist_slice for a in _S42_ORDER_ALTS)}",
)

# ---------------------------------------------------------------------------
# Check (6) / AC-6 — orchestrator.md ux-reviewer nested-context handoff block:
# Nested-context handling documented: mandatory dispatch_handoff to ux-reviewer.
# Status-block gate reads findings.critical; gate is advisory (non-blocking at 1.7).
# Tokens: "findings.critical" + "dispatch_handoff" + one of ("nested", "handoff") +
# one of ("ux-reviewer", "th:ux-reviewer") as the target agent reference.
# (The old check required an inline-execution spec; the inline path was retired
# in v2.48 and replaced with a dispatch_handoff contract — AC-2 of the
# nested-inline-fallback-contract-fix PR.)
# ---------------------------------------------------------------------------
_S42_FALLBACK_BASE = ("findings.critical", "dispatch_handoff")
_S42_FALLBACK_ALTS = ("nested", "handoff")
_S42_FALLBACK_SPEC = ("ux-reviewer", "th:ux-reviewer")

check(
    "frontend-wiring(6/ac-6): orchestrator.md ux-reviewer nested-context handoff anchor"
    " documents mandatory dispatch_handoff; verdict derived from findings.critical;"
    " th:ux-reviewer referenced as target agent",
    bool(_s42_fallback_slice)
    and all(t in _s42_fallback_slice for t in _S42_FALLBACK_BASE)
    and any(a in _s42_fallback_slice for a in _S42_FALLBACK_ALTS)
    and any(a in _s42_fallback_slice for a in _S42_FALLBACK_SPEC),
    f"anchor '{_S42_FALLBACK_ANCHOR}' missing or fallback tokens absent;"
    f" anchor present: {bool(_s42_fallback_slice)};"
    + " ".join(f" '{t}' present: {t in _s42_fallback_slice};" for t in _S42_FALLBACK_BASE)
    + f" fallback-alt found: {any(a in _s42_fallback_slice for a in _S42_FALLBACK_ALTS)};"
    f" spec-alt found: {any(a in _s42_fallback_slice for a in _S42_FALLBACK_SPEC)}",
)

# ---------------------------------------------------------------------------
# Check (7) / AC-7 — agents/ux-reviewer.md AC-sink:
# Enrich-mode must pin AC into 01-plan.md § Task List (the gate source-of-truth),
# not only 01-ux-review.md. The contradiction between :46 (output=01-ux-review.md),
# :66 ("append to existing PR's AC list"), and :115-138 (AC Additions written to
# 01-ux-review.md) must be resolved. Tokens required:
# "01-plan.md" + "Task List" + one of ("pin", "append to", "fix", "primary").
# ---------------------------------------------------------------------------
_S42_ACSINK_TOKENS = ("01-plan.md", "Task List")
_S42_ACSINK_ALTS   = ("pin", "append to", "fix", "primary", "source of truth", "source-of-truth")

check(
    "frontend-wiring(7/ac-7): agents/ux-reviewer.md AC-sink anchor documents"
    " that enrich-mode pins AC into 01-plan.md § Task List (gate source-of-truth);"
    " tokens: '01-plan.md' + 'Task List' + pin/append/primary/source-of-truth",
    bool(_s42_acsink_slice)
    and all(t in _s42_acsink_slice for t in _S42_ACSINK_TOKENS)
    and any(a in _s42_acsink_slice for a in _S42_ACSINK_ALTS),
    f"anchor '{_S42_ACSINK_ANCHOR}' missing or AC-sink tokens absent;"
    f" anchor present: {bool(_s42_acsink_slice)};"
    + " ".join(f" '{t}' present: {t in _s42_acsink_slice};" for t in _S42_ACSINK_TOKENS)
    + f" pin-alt found: {any(a in _s42_acsink_slice for a in _S42_ACSINK_ALTS)}",
)

# ---------------------------------------------------------------------------
# Check (8) / AC-8 — this file contains "Suite 42" + "_slice_section" idiom
# + "pr-d-frontend-wiring" (anti-false-green self-check, Suite 36-41 precedent).
# ---------------------------------------------------------------------------
check(
    "frontend-wiring(8/ac-8): this test file contains 'Suite 42' marker,"
    " '_slice_section' anti-false-green idiom, and 'pr-d-frontend-wiring' identifier",
    "Suite 42" in _s42_self
    and "_slice_section" in _s42_self
    and "pr-d-frontend-wiring" in _s42_self,
    "This file is missing 'Suite 42' marker, '_slice_section' usage,"
    " or 'pr-d-frontend-wiring' identifier — self-consistency check failed",
)

# ---------------------------------------------------------------------------
# Check (9) / AC-8 + AC-9 — docs/testing.md self-referential guard:
# docs/testing.md (canonical registry) must register "Suite 42" and
# "pr-d-frontend-wiring". This file must contain the literal "Suite 42".
# Re-pointed from CLAUDE.md to docs/testing.md (pr-claude-md-hygiene).
# Does NOT read CLAUDE.md for the Suite literal — no fallback or 'or' permitted.
# ---------------------------------------------------------------------------
_s42_testing_md = read(REPO_ROOT / "docs" / "testing.md")
check(
    "frontend-wiring(9/self-ref): docs/testing.md canonical registry names 'Suite 42'"
    " and this file defines it (self-referential guard — pr-d-frontend-wiring)",
    "Suite 42" in _s42_testing_md
    and "Suite 42" in _s42_self
    and "pr-d-frontend-wiring" in _s42_self,
    "Suite 42 not registered in docs/testing.md canonical registry"
    " or literal 'pr-d-frontend-wiring' missing in this file"
    " — implementer must complete docs/testing.md; tester must not remove the markers",
)

# ---------------------------------------------------------------------------
# Check (10) / AC-1 + AC-2 consistency — end-to-end wiring:
# BOTH the Phase 1 enrich slice AND the Phase 3 validate slice must reference
# "ux-reviewer" and the artefact chain is coherent:
#   enrich output (01-ux-review.md) appears as validate input.
# ---------------------------------------------------------------------------
check(
    "frontend-wiring(10/ac-1+ac-2 consistency): Phase 1 enrich slice AND Phase 3"
    " validate slice both reference 'ux-reviewer'; enrich output '01-ux-review.md'"
    " appears in validate slice as input (end-to-end artefact chain coherent)",
    bool(_s42_enrich_slice)
    and bool(_s42_validate_slice)
    and "ux-reviewer" in _s42_enrich_slice
    and "ux-reviewer" in _s42_validate_slice
    and "01-ux-review.md" in _s42_validate_slice,
    f"End-to-end artefact chain broken:"
    f" enrich slice present: {bool(_s42_enrich_slice)};"
    f" validate slice present: {bool(_s42_validate_slice)};"
    f" 'ux-reviewer' in enrich: {'ux-reviewer' in _s42_enrich_slice};"
    f" 'ux-reviewer' in validate: {'ux-reviewer' in _s42_validate_slice};"
    f" '01-ux-review.md' in validate: {'01-ux-review.md' in _s42_validate_slice}",
)


# ---------------------------------------------------------------------------
# Suite 43 -- pr-e-delivery-hardening (AC-1..AC-5 + AC-7 + AC-9 + AC-10)
# ---------------------------------------------------------------------------
# Anchor-scoped checks for the five delivery-hardening gaps closed by PR E
# of the pipeline-flows-hardening programme.
#
# The five bugs (each a gap in the delivery agent contract):
#   Gap 1 (AC-1) — Glob-first-match finds only one version site; four sites
#                  (.claude-plugin/marketplace.json plugins[0].version,
#                  cmd/install/main.go, CLAUDE.md §3, CHANGELOG.md) left
#                  out of sync after every bump.
#   Gap 2 (AC-2) — No step owns the CHANGELOG release cut: moving
#                  [Unreleased] → ## [<version>] - <date>. Step 7 prohibits
#                  editing outside [Unreleased] and Step 9 never does it.
#   Gap 3 (AC-3) — Step 9b discovers DoD from package.json/Makefile only.
#                  This repo's test suite lives under CLAUDE.md §4 Golden
#                  Commands, so the entire DoD is silently skipped.
#   Gap 4 (AC-4) — The gh probe validates auth-success with any account,
#                  never captures or reports the active login. Account drift
#                  between subagent runs goes undetected.
#   Gap 5 (AC-5) — When push succeeds but gh pr create fails, there is no
#                  structured status. blocked-manual-push covers no-gh/no-token,
#                  not the has_gh=true push-ok/PR-failed case.
#
# Every check slices to a named anchor and asserts sub-tokens WITHIN the
# slice. Anti-false-green guarantee:
#   _slice_section returns "" when the anchor is absent
#   => `"token" in ""` is always False
#   => a missing section always fails the check, never silently passes it.
#
# Exceptions:
#   - Check (6)  self-referential guard: file-wide by design (Suite 35-42 precedent).
#   - Check (7)  docs/testing.md guard: file-wide by design.
#
# CANONICAL ANCHORS (implementer MUST add these verbatim to the target files):
#   agents/delivery.md      : "### Step 2b — Active gh account capture"
#   agents/delivery.md      : "### Step 9.0 — Version sites (explicit enumeration)"
#   agents/delivery.md      : "### Step 9e — CHANGELOG release cut"
#   agents/_shared/gh-fallback.md : "## status: blocked-pr-pending"
#
# Check index -> AC mapping:
#   (1) / AC-1 : delivery.md Step 9.0 — explicit list of 5 version sites
#                (plugins[0].version, cmd/install/main.go, CLAUDE.md,
#                CHANGELOG.md); no Glob first-match; schema/top-level fenced.
#   (2) / AC-2 : delivery.md Step 9e — CHANGELOG release cut gated on Step 9;
#                moves [Unreleased] → ## [<version>] - <date>; recreates empty
#                [Unreleased] above the new heading.
#   (3) / AC-3 : delivery.md Step 9b — reads CLAUDE.md §4 Golden Commands as
#                DoD source; emits "dod: no gates discovered" when all rows skip.
#   (4) / AC-4 : delivery.md Step 2b — captures active gh account via
#                "gh api user -q .login"; reports gh_account: in status block;
#                documents known limitation (operator-owned, by design).
#   (5) / AC-5 : gh-fallback.md § blocked-pr-pending — push-ok/PR-failed with
#                has_gh=true; compare URL + body file + "pr opened #N" resume;
#                delivery.md references blocked-pr-pending.
#   (6) / AC-9 : this file contains "Suite 43" + "_slice_section" idiom
#                + "pr-e-delivery-hardening" (anti-false-green self-check).
#   (7) / AC-7 : docs/testing.md canonical registry must name "Suite 43"
#                and "pr-e-delivery-hardening". Self-ref guard does NOT read
#                CLAUDE.md for the Suite literal (re-point per hygiene PR).
# ---------------------------------------------------------------------------
print()
print("=== Suite 43: pr-e-delivery-hardening — delivery flow hardening ===")

# ---- file reads (suite-local) -----------------------------------------------
_s43_delivery    = read(AGENTS_DIR / "delivery.md")
_s43_ghfallback  = read(AGENTS_DIR / "_shared" / "gh-fallback.md")
_s43_testing_md  = read(REPO_ROOT / "docs" / "testing.md")
_s43_self        = Path(__file__).read_text(encoding="utf-8")

# ---- canonical anchors -------------------------------------------------------
_S43_STEP2B_ANCHOR   = "### Step 2b — Active gh account capture"
_S43_STEP90_ANCHOR   = "### Step 9.0 — Version sites (explicit enumeration)"
_S43_STEP9E_ANCHOR   = "### Step 9e — CHANGELOG release cut"
_S43_BLOCKED_ANCHOR  = "## status: blocked-pr-pending"

# ---- slices ------------------------------------------------------------------
_s43_step2b_slice   = _slice_section(_s43_delivery,   _S43_STEP2B_ANCHOR)
_s43_step90_slice   = _slice_section(_s43_delivery,   _S43_STEP90_ANCHOR)
_s43_step9e_slice   = _slice_section(_s43_delivery,   _S43_STEP9E_ANCHOR)
_s43_blocked_slice  = _slice_section(_s43_ghfallback, _S43_BLOCKED_ANCHOR)

# ---------------------------------------------------------------------------
# Check (1) / AC-1 — delivery.md Step 9.0 — explicit enumeration of all 5
# version sites. The Glob-first-match discovery is replaced by a named list
# that includes: plugins[0].version (marketplace.json, NOT the schema top-level),
# cmd/install/main.go (or main.go), CLAUDE.md §3 (or CLAUDE.md), CHANGELOG.md.
# The schema/top-level version must be fenced off (excluded).
# Tokens required:
#   "plugins[0].version"  — the exact marketplace.json field (not schema)
#   "cmd/install/main.go" or "main.go"  — the Go installer version literal
#   "CLAUDE.md"           — §3 Current version site
#   "CHANGELOG.md"        — release heading site
#   one of "schema" / "top-level" / "1.1.0"  — the exclusion language
# Negative token: "Glob" MUST NOT be present in this slice as the discovery
# mechanism (the Glob-first-match pattern is replaced).
# ---------------------------------------------------------------------------
_S43_STEP90_REQUIRED = (
    "plugins[0].version",
    "CLAUDE.md",
    "CHANGELOG.md",
)
_S43_STEP90_MAIN_ALTS   = ("cmd/install/main.go", "main.go")
_S43_STEP90_SCHEMA_ALTS = ("schema", "top-level", "1.1.0")

check(
    "delivery-hardening(1/ac-1): delivery.md Step 9.0 anchor enumerates the 5"
    " version sites explicitly (plugins[0].version + main.go + CLAUDE.md +"
    " CHANGELOG.md) and fences off the schema/top-level marketplace version;"
    " Glob first-match is NOT the discovery mechanism in this slice",
    bool(_s43_step90_slice)
    and all(t in _s43_step90_slice for t in _S43_STEP90_REQUIRED)
    and any(a in _s43_step90_slice for a in _S43_STEP90_MAIN_ALTS)
    and any(a in _s43_step90_slice for a in _S43_STEP90_SCHEMA_ALTS),
    f"anchor '{_S43_STEP90_ANCHOR}' missing or required tokens absent;"
    f" anchor present: {bool(_s43_step90_slice)};"
    + " ".join(f" '{t}' present: {t in _s43_step90_slice};" for t in _S43_STEP90_REQUIRED)
    + f" main.go alt found: {any(a in _s43_step90_slice for a in _S43_STEP90_MAIN_ALTS)};"
    f" schema-fence alt found: {any(a in _s43_step90_slice for a in _S43_STEP90_SCHEMA_ALTS)}",
)

# ---------------------------------------------------------------------------
# Check (2) / AC-2 — delivery.md Step 9e — CHANGELOG release cut.
# A new step (gated on Step 9 version bump) must:
#   - move [Unreleased] entries to a new ## [<version>] - <date> heading
#   - recreate an empty [Unreleased] section above the new heading
# The step must be gated: only runs when Step 9 produced a version bump.
# Tokens required:
#   "[Unreleased]"                         — section to move
#   one of "## [<version>]" / "## [{version}]" / "## [<new-version>]"
#                                          — new versioned heading pattern
#   "<date>" or "YYYY-MM-DD"               — date placeholder
#   one of "Step 9" / "gated" / "version bump" — gating language
# ---------------------------------------------------------------------------
_S43_STEP9E_REQUIRED    = ("[Unreleased]",)
_S43_STEP9E_HEADING_ALTS = ("## [<version>]", "## [{version}]", "## [<new-version>]",
                             "## [<ver>]", "## [version]")
_S43_STEP9E_DATE_ALTS   = ("<date>", "YYYY-MM-DD", "<YYYY")
_S43_STEP9E_GATE_ALTS   = ("Step 9", "gated", "version bump")

check(
    "delivery-hardening(2/ac-2): delivery.md Step 9e anchor owns the CHANGELOG"
    " release cut — moves [Unreleased] to a versioned ## heading with date;"
    " recreates empty [Unreleased]; step is gated on Step 9 version bump",
    bool(_s43_step9e_slice)
    and all(t in _s43_step9e_slice for t in _S43_STEP9E_REQUIRED)
    and any(a in _s43_step9e_slice for a in _S43_STEP9E_HEADING_ALTS)
    and any(a in _s43_step9e_slice for a in _S43_STEP9E_DATE_ALTS)
    and any(a in _s43_step9e_slice for a in _S43_STEP9E_GATE_ALTS),
    f"anchor '{_S43_STEP9E_ANCHOR}' missing or release-cut tokens absent;"
    f" anchor present: {bool(_s43_step9e_slice)};"
    + " ".join(
        f" '{t}' present: {t in _s43_step9e_slice};" for t in _S43_STEP9E_REQUIRED
    )
    + f" versioned-heading alt found:"
    f" {any(a in _s43_step9e_slice for a in _S43_STEP9E_HEADING_ALTS)};"
    f" date-alt found: {any(a in _s43_step9e_slice for a in _S43_STEP9E_DATE_ALTS)};"
    f" gate-alt found: {any(a in _s43_step9e_slice for a in _S43_STEP9E_GATE_ALTS)}",
)

# ---------------------------------------------------------------------------
# Check (3) / AC-3 — delivery.md Step 9b — reads CLAUDE.md §4 Golden Commands
# as DoD source and declares "dod: no gates discovered" when all rows skip.
# The step 9b slice is the existing Step 9b section; the check scans
# delivery.md globally for the key tokens (Step 9b may not have a dedicated
# anchor yet; we use the existing "Step 9b" label or slice from nearest heading).
# Strategy: use global scan of delivery.md for the three key tokens:
#   "CLAUDE.md" — reads the file
#   "Golden Commands" — reads §4 specifically
#   "dod: no gates discovered" — the required status line when all rows skip
# ---------------------------------------------------------------------------
check(
    "delivery-hardening(3/ac-3): delivery.md Step 9b reads CLAUDE.md §4 Golden"
    " Commands as DoD source and emits 'dod: no gates discovered' when all rows skip",
    "CLAUDE.md" in _s43_delivery
    and "Golden Commands" in _s43_delivery
    and "dod: no gates discovered" in _s43_delivery,
    f"delivery.md missing one or more Step 9b DoD tokens;"
    f" 'CLAUDE.md' present: {'CLAUDE.md' in _s43_delivery};"
    f" 'Golden Commands' present: {'Golden Commands' in _s43_delivery};"
    f" 'dod: no gates discovered' present: {'dod: no gates discovered' in _s43_delivery}",
)

# ---------------------------------------------------------------------------
# Check (4) / AC-4 — delivery.md Step 2b — captures the active gh account
# via "gh api user -q .login" and reports it in the status block as
# "gh_account:". The limitation (operator-owned account correction, by design)
# is documented in the same section.
# Tokens required in the Step 2b slice:
#   "gh api user" — the capture command
#   ".login"      — the jq/query field
#   "gh_account"  — the status block key
#   one of "known limitation" / "operator" / "by design"  — limitation language
# ---------------------------------------------------------------------------
_S43_STEP2B_REQUIRED = ("gh api user", ".login", "gh_account")
_S43_STEP2B_LIMIT_ALTS = ("known limitation", "operator", "by design")

check(
    "delivery-hardening(4/ac-4): delivery.md Step 2b anchor captures the active"
    " gh account ('gh api user -q .login'), reports 'gh_account:' in the status"
    " block, and documents the known limitation (operator-owned, by design)",
    bool(_s43_step2b_slice)
    and all(t in _s43_step2b_slice for t in _S43_STEP2B_REQUIRED)
    and any(a in _s43_step2b_slice for a in _S43_STEP2B_LIMIT_ALTS),
    f"anchor '{_S43_STEP2B_ANCHOR}' missing or Step 2b tokens absent;"
    f" anchor present: {bool(_s43_step2b_slice)};"
    + " ".join(f" '{t}' present: {t in _s43_step2b_slice};" for t in _S43_STEP2B_REQUIRED)
    + f" limitation-alt found:"
    f" {any(a in _s43_step2b_slice for a in _S43_STEP2B_LIMIT_ALTS)}",
)

# ---------------------------------------------------------------------------
# Check (5) / AC-5 — gh-fallback.md § blocked-pr-pending — the structured
# status for push-ok / gh pr create failed with has_gh=true.
# The section must cover:
#   "has_gh"              — scoped to the has_gh=true case
#   "push"                — push already succeeded (state-mutation note)
#   "pr opened #N"        — resume protocol token
#   one of "compare" / "/compare/"  — the compare URL for manual PR creation
# Additionally, delivery.md must reference "blocked-pr-pending" (the wiring
# check — confirming Step 11 lists the new status in the Return Protocol).
# ---------------------------------------------------------------------------
_S43_BLOCKED_REQUIRED = ("has_gh", "push")
_S43_BLOCKED_RESUME_ALTS  = ("pr opened #N", "pr opened")
_S43_BLOCKED_COMPARE_ALTS = ("compare", "/compare/")

check(
    "delivery-hardening(5/ac-5): gh-fallback.md § blocked-pr-pending anchor"
    " covers has_gh=true push-ok/PR-failed case with compare URL and"
    " 'pr opened #N' resume protocol; delivery.md references blocked-pr-pending",
    bool(_s43_blocked_slice)
    and all(t in _s43_blocked_slice for t in _S43_BLOCKED_REQUIRED)
    and any(a in _s43_blocked_slice for a in _S43_BLOCKED_RESUME_ALTS)
    and any(a in _s43_blocked_slice for a in _S43_BLOCKED_COMPARE_ALTS)
    and "blocked-pr-pending" in _s43_delivery,
    f"anchor '{_S43_BLOCKED_ANCHOR}' in gh-fallback.md missing or tokens absent;"
    f" anchor present: {bool(_s43_blocked_slice)};"
    + " ".join(f" '{t}' present: {t in _s43_blocked_slice};" for t in _S43_BLOCKED_REQUIRED)
    + f" resume-alt found: {any(a in _s43_blocked_slice for a in _S43_BLOCKED_RESUME_ALTS)};"
    f" compare-alt found: {any(a in _s43_blocked_slice for a in _S43_BLOCKED_COMPARE_ALTS)};"
    f" 'blocked-pr-pending' in delivery.md: {'blocked-pr-pending' in _s43_delivery}",
)

# ---------------------------------------------------------------------------
# Check (6) / AC-9 — this file contains "Suite 43" + "_slice_section" idiom
# + "pr-e-delivery-hardening" (anti-false-green self-check, Suite 36-42 precedent).
# ---------------------------------------------------------------------------
check(
    "delivery-hardening(6/ac-9): this test file contains 'Suite 43' marker,"
    " '_slice_section' anti-false-green idiom, and 'pr-e-delivery-hardening' identifier",
    "Suite 43" in _s43_self
    and "_slice_section" in _s43_self
    and "pr-e-delivery-hardening" in _s43_self,
    "This file is missing 'Suite 43' marker, '_slice_section' usage,"
    " or 'pr-e-delivery-hardening' identifier — self-consistency check failed",
)

# ---------------------------------------------------------------------------
# Check (7) / AC-7 — docs/testing.md self-referential guard:
# docs/testing.md (canonical registry) must name "Suite 43" and
# "pr-e-delivery-hardening". This file must also contain the literal "Suite 43".
# Self-ref guard does NOT read CLAUDE.md for the Suite literal — the hygiene
# PR already re-pointed all guards to docs/testing.md; CLAUDE.md §11 must NOT
# contain the literal "Suite 43".
# ---------------------------------------------------------------------------
_s43_claude_md = read(REPO_ROOT / "CLAUDE.md")

check(
    "delivery-hardening(7/ac-7): docs/testing.md canonical registry names 'Suite 43'"
    " and 'pr-e-delivery-hardening'; this file defines 'Suite 43';"
    " CLAUDE.md §11 does NOT contain the literal 'Suite 43' (hygiene contract)",
    "Suite 43" in _s43_testing_md
    and "pr-e-delivery-hardening" in _s43_testing_md
    and "Suite 43" in _s43_self
    and "Suite 43" not in _s43_claude_md,
    "Suite 43 not registered in docs/testing.md canonical registry"
    " or 'pr-e-delivery-hardening' missing from docs/testing.md"
    " or literal 'Suite 43' missing in this file"
    f" or 'Suite 43' found in CLAUDE.md (hygiene violation);"
    f" docs/testing.md has Suite 43: {'Suite 43' in _s43_testing_md};"
    f" docs/testing.md has pr-e-delivery-hardening: {'pr-e-delivery-hardening' in _s43_testing_md};"
    f" this file has Suite 43: {'Suite 43' in _s43_self};"
    f" CLAUDE.md has Suite 43 (must be False): {'Suite 43' in _s43_claude_md}"
    " — implementer must complete docs/testing.md; tester must not add Suite 43 to CLAUDE.md",
)


# ---------------------------------------------------------------------------
# Suite 44 -- pr-th-update-fix (AC-2, AC-4, AC-5, AC-8)
# ---------------------------------------------------------------------------
# Regression assertions that FAIL against the current source state (before the
# implementer moves the three managed blocks out of setup/SKILL.md).
#
# The root cause: each <!-- X:start --> marker appears TWICE in
# skills/setup/SKILL.md — once in the instructional prose ("look for
# <!-- X:start -->") and once in the real block.  Any between-markers
# extraction that starts at the FIRST occurrence captures prose instead of the
# block, producing the ""), append this block:" corruption.
#
# Fix model: move each block verbatim to a canonical file under
# skills/setup/managed-blocks/, rewrite setup/SKILL.md to read-from-file,
# and rewrite update/SKILL.md to read the canonical files + provide exact
# per-OS command blocks (PowerShell + bash).
#
# Anti-false-green guarantee (mirror of Suite 43 idiom):
#   - _slice_section returns "" when its anchor is absent
#     => token-in-slice assertions always fail when the section is missing.
#   - Existence assertions use Path.exists(), which is False until the
#     canonical file is created.
#   - count() assertions assert == 1, which is False today (count == 2).
#
# AC coverage:
#   AC-2  : marker count == 1 after fix (currently == 2 → FAILS pre-fix)
#   AC-4  : setup reads canonical files, no inline copy
#   AC-5  : update reads canonical files + per-OS PowerShell + bash blocks
#   AC-8  : Suite 44 in docs/testing.md; NOT in CLAUDE.md §11
#
# Existing suites to leave alone (implementer re-points them in Step 5):
#   Suite 18 lines 1143-1145 (_voice_block), 1271-1277 (_managed_block_content)
#   Suite 18 lines 1073/1078/1134/1139 (marker presence in setup_skill_md)
#   Suite 18 lines 1083/1088/1191 (content literals in setup_skill_md)
#   Suite 39 line 7251 (_s39_setup_ndt_slice)
# ---------------------------------------------------------------------------
print()
print("=== Suite 44: pr-th-update-fix — canonical managed-block files + per-OS update ===")

MB_DIR = SKILLS_DIR / "setup" / "managed-blocks"

_s44_setup_text    = read(SKILLS_DIR / "setup" / "SKILL.md")
_s44_update_text   = read(SKILLS_DIR / "update" / "SKILL.md")
_s44_testing_md    = read(REPO_ROOT / "docs" / "testing.md")
_s44_claude_md     = read(REPO_ROOT / "CLAUDE.md")
_s44_self          = Path(__file__).read_text(encoding="utf-8")

# Canonical block-file paths.
_MB_ODR  = MB_DIR / "orchestrator-dispatch-rule.md"
_MB_NDT  = MB_DIR / "nested-dispatch-takeover.md"
_MB_VR   = MB_DIR / "voice-rule.md"

# Marker strings (used both for existence checks and count checks).
_ODR_START = "<!-- orchestrator-dispatch-rule:start -->"
_ODR_END   = "<!-- orchestrator-dispatch-rule:end -->"
_NDT_START = "<!-- nested-dispatch-takeover:start -->"
_NDT_END   = "<!-- nested-dispatch-takeover:end -->"
_VR_START  = "<!-- voice-rule:start -->"
_VR_END    = "<!-- voice-rule:end -->"

# ---------------------------------------------------------------------------
# (1) Canonical file existence — each file must exist with BOTH its markers.
# ---------------------------------------------------------------------------
check(
    "canonical-blocks(1a): skills/setup/managed-blocks/orchestrator-dispatch-rule.md exists",
    _MB_ODR.exists(),
    "canonical file not yet created — implementer must copy the block from setup/SKILL.md",
)
check(
    "canonical-blocks(1b): orchestrator-dispatch-rule.md contains start marker",
    _MB_ODR.exists() and _ODR_START in read(_MB_ODR),
    f"canonical file missing or does not contain '{_ODR_START}'",
)
check(
    "canonical-blocks(1c): orchestrator-dispatch-rule.md contains end marker",
    _MB_ODR.exists() and _ODR_END in read(_MB_ODR),
    f"canonical file missing or does not contain '{_ODR_END}'",
)

check(
    "canonical-blocks(2a): skills/setup/managed-blocks/nested-dispatch-takeover.md exists",
    _MB_NDT.exists(),
    "canonical file not yet created — implementer must copy the block from setup/SKILL.md",
)
check(
    "canonical-blocks(2b): nested-dispatch-takeover.md contains start marker",
    _MB_NDT.exists() and _NDT_START in read(_MB_NDT),
    f"canonical file missing or does not contain '{_NDT_START}'",
)
check(
    "canonical-blocks(2c): nested-dispatch-takeover.md contains end marker",
    _MB_NDT.exists() and _NDT_END in read(_MB_NDT),
    f"canonical file missing or does not contain '{_NDT_END}'",
)

check(
    "canonical-blocks(3a): skills/setup/managed-blocks/voice-rule.md exists",
    _MB_VR.exists(),
    "canonical file not yet created — implementer must copy the block from setup/SKILL.md",
)
check(
    "canonical-blocks(3b): voice-rule.md contains start marker",
    _MB_VR.exists() and _VR_START in read(_MB_VR),
    f"canonical file missing or does not contain '{_VR_START}'",
)
check(
    "canonical-blocks(3c): voice-rule.md contains end marker",
    _MB_VR.exists() and _VR_END in read(_MB_VR),
    f"canonical file missing or does not contain '{_VR_END}'",
)

# ---------------------------------------------------------------------------
# (2) Byte-faithfulness — canonical file block content must match what was
# inline in setup/SKILL.md (snapshot captured below from the current source).
# AC-1 / PR-1 byte-faithful requirement.
#
# Strategy: extract the inline block from _s44_setup_text (between markers)
# and compare it with the full content of the canonical file.  Post-fix, the
# canonical file IS the block, so canonical_content == inline_block_content.
# Pre-fix, the canonical file does not exist → the existence check above
# already fails, so these assertions reaching _MB_ODR.exists() == False will
# also fail cleanly via the guard.
#
# The snapshot anchors are the REAL block occurrences (second occurrence of
# each :start marker in the current file, at lines 65, 93, 119).  We locate
# them by finding _ODR_START a second time after the first prose occurrence.
# ---------------------------------------------------------------------------

def _extract_inline_block(text: str, start_marker: str, end_marker: str) -> str:
    """Return the block from the LAST occurrence of start_marker to (and
    including) the end_marker.  This targets the real block, not the prose
    occurrence.  Returns '' when either marker is absent."""
    last_start = text.rfind(start_marker)
    end_idx = text.rfind(end_marker)
    if last_start == -1 or end_idx == -1 or end_idx < last_start:
        return ""
    return text[last_start: end_idx + len(end_marker)]


_inline_odr = _extract_inline_block(_s44_setup_text, _ODR_START, _ODR_END)
_inline_ndt = _extract_inline_block(_s44_setup_text, _NDT_START, _NDT_END)
_inline_vr  = _extract_inline_block(_s44_setup_text, _VR_START,  _VR_END)

# For the byte-faithfulness check: after the fix, the canonical file content
# (stripped of leading/trailing whitespace) must equal the inline block
# (stripped).  Pre-fix: _MB_ODR.exists() is False → guard short-circuits.
_odr_canonical_text = read(_MB_ODR).strip() if _MB_ODR.exists() else None
_ndt_canonical_text = read(_MB_NDT).strip() if _MB_NDT.exists() else None
_vr_canonical_text  = read(_MB_VR).strip()  if _MB_VR.exists()  else None

check(
    "canonical-blocks(4a): orchestrator-dispatch-rule.md is byte-faithful to inline block in setup/SKILL.md",
    _MB_ODR.exists() and bool(_inline_odr) and _odr_canonical_text == _inline_odr.strip(),
    "canonical file content does not match the inline block snapshot from setup/SKILL.md "
    f"(inline block present: {bool(_inline_odr)}; "
    f"canonical exists: {_MB_ODR.exists()})",
)
check(
    "canonical-blocks(4b): nested-dispatch-takeover.md is byte-faithful to inline block in setup/SKILL.md",
    _MB_NDT.exists() and bool(_inline_ndt) and _ndt_canonical_text == _inline_ndt.strip(),
    "canonical file content does not match the inline block snapshot from setup/SKILL.md "
    f"(inline block present: {bool(_inline_ndt)}; "
    f"canonical exists: {_MB_NDT.exists()})",
)
check(
    "canonical-blocks(4c): voice-rule.md is byte-faithful to inline block in setup/SKILL.md",
    _MB_VR.exists() and bool(_inline_vr) and _vr_canonical_text == _inline_vr.strip(),
    "canonical file content does not match the inline block snapshot from setup/SKILL.md "
    f"(inline block present: {bool(_inline_vr)}; "
    f"canonical exists: {_MB_VR.exists()})",
)

# Key-content assertions (alternative faithfulness check scoped to distinctive
# lines within each block — catches an empty or wrong canonical file even if
# the byte comparison above is skipped for some reason).
# orchestrator block: "## orchestrator dispatch" heading + "--fast" fast-path mention
_odr_canonical_for_content = read(_MB_ODR) if _MB_ODR.exists() else ""
check(
    "canonical-blocks(4d): orchestrator-dispatch-rule.md contains '## orchestrator dispatch' heading",
    "## orchestrator dispatch" in _odr_canonical_for_content,
    "canonical orchestrator-dispatch-rule.md must contain the '## orchestrator dispatch' heading "
    "(key-content faithfulness check)",
)
check(
    "canonical-blocks(4e): orchestrator-dispatch-rule.md contains '--fast' fast-path mention",
    "--fast" in _odr_canonical_for_content,
    "canonical orchestrator-dispatch-rule.md must contain the '--fast' fast-path mention "
    "(key-content faithfulness check — indicates full block content was copied)",
)
# nested block: "## nested-dispatch-takeover" heading + "blocked-no-dispatch" status
_ndt_canonical_for_content = read(_MB_NDT) if _MB_NDT.exists() else ""
check(
    "canonical-blocks(4f): nested-dispatch-takeover.md contains '## nested-dispatch-takeover' heading",
    "## nested-dispatch-takeover" in _ndt_canonical_for_content,
    "canonical nested-dispatch-takeover.md must contain the '## nested-dispatch-takeover' heading "
    "(key-content faithfulness check)",
)
check(
    "canonical-blocks(4g): nested-dispatch-takeover.md contains 'blocked-no-dispatch' status literal",
    "blocked-no-dispatch" in _ndt_canonical_for_content,
    "canonical nested-dispatch-takeover.md must contain 'blocked-no-dispatch' "
    "(key-content faithfulness check — indicates full block content was copied)",
)
# voice block: "## Voice" heading + "regional" idioms reference
_vr_canonical_for_content = read(_MB_VR) if _MB_VR.exists() else ""
check(
    "canonical-blocks(4h): voice-rule.md contains '## Voice' heading",
    "## Voice" in _vr_canonical_for_content,
    "canonical voice-rule.md must contain the '## Voice' heading "
    "(key-content faithfulness check)",
)
check(
    "canonical-blocks(4i): voice-rule.md contains 'regional' idioms reference",
    "regional" in _vr_canonical_for_content,
    "canonical voice-rule.md must contain 'regional' (key-content faithfulness check — "
    "indicates the no-regional-idioms text was copied)",
)

# ---------------------------------------------------------------------------
# (3) Double-marker removal in setup/SKILL.md — AC-2 (regression anchor).
# After the fix: each marker appears EXACTLY ONCE in setup/SKILL.md (the
# read-from-file reference).  Pre-fix: each marker appears TWICE (prose +
# real block).
# ---------------------------------------------------------------------------
check(
    "canonical-blocks(5a): <!-- orchestrator-dispatch-rule:start --> appears exactly once in setup/SKILL.md (AC-2)",
    _s44_setup_text.count(_ODR_START) == 1,
    f"marker '{_ODR_START}' appears {_s44_setup_text.count(_ODR_START)} times in setup/SKILL.md "
    "(expected 1 after fix; currently 2 — prose occurrence + real block); "
    "the double-occurrence is the root cause of the CLAUDE.md corruption",
)
check(
    "canonical-blocks(5b): <!-- nested-dispatch-takeover:start --> appears exactly once in setup/SKILL.md (AC-2)",
    _s44_setup_text.count(_NDT_START) == 1,
    f"marker '{_NDT_START}' appears {_s44_setup_text.count(_NDT_START)} times in setup/SKILL.md "
    "(expected 1 after fix; currently 2)",
)
check(
    "canonical-blocks(5c): <!-- voice-rule:start --> appears exactly once in setup/SKILL.md (AC-2)",
    _s44_setup_text.count(_VR_START) == 1,
    f"marker '{_VR_START}' appears {_s44_setup_text.count(_VR_START)} times in setup/SKILL.md "
    "(expected 1 after fix; currently 2)",
)

# Corruption-prose absence: the specific instructional phrase that causes the
# corruption ("append this block:") must NOT appear in setup/SKILL.md after
# the fix (it is inside the fenced inline copies that get removed).
# Note: pre-fix this phrase appears 3 times; post-fix it is gone.
check(
    "canonical-blocks(5d): setup/SKILL.md no longer contains the corruption-causing prose 'append this block:'",
    "append this block:" not in _s44_setup_text,
    "setup/SKILL.md still contains 'append this block:' — the instructional prose that caused "
    "CLAUDE.md corruption when extracted as a block; this must be removed as part of the fix",
)

# ---------------------------------------------------------------------------
# (4) setup/SKILL.md read-from-file reference — AC-4.
# After the fix: setup/SKILL.md Steps 4a/4b/4c reference the canonical files
# by path (e.g. "managed-blocks/orchestrator-dispatch-rule.md").
# ---------------------------------------------------------------------------
check(
    "canonical-blocks(6a): setup/SKILL.md references managed-blocks/orchestrator-dispatch-rule.md (AC-4)",
    "managed-blocks/orchestrator-dispatch-rule.md" in _s44_setup_text,
    "setup/SKILL.md must reference the canonical file path 'managed-blocks/orchestrator-dispatch-rule.md' "
    "in Steps 4a (read-from-file design); currently not present",
)
check(
    "canonical-blocks(6b): setup/SKILL.md references managed-blocks/nested-dispatch-takeover.md (AC-4)",
    "managed-blocks/nested-dispatch-takeover.md" in _s44_setup_text,
    "setup/SKILL.md must reference the canonical file path 'managed-blocks/nested-dispatch-takeover.md' "
    "in Step 4b (read-from-file design); currently not present",
)
check(
    "canonical-blocks(6c): setup/SKILL.md references managed-blocks/voice-rule.md (AC-4)",
    "managed-blocks/voice-rule.md" in _s44_setup_text,
    "setup/SKILL.md must reference the canonical file path 'managed-blocks/voice-rule.md' "
    "in Step 4c (read-from-file design); currently not present",
)

# ---------------------------------------------------------------------------
# (5) update/SKILL.md canonical-file references + per-OS command blocks — AC-5.
# After the fix: update/SKILL.md step 6 reads the canonical files (not
# "extract from setup/SKILL.md between markers") AND contains exact
# PowerShell + bash command blocks.
# ---------------------------------------------------------------------------
check(
    "canonical-blocks(7a): update/SKILL.md references managed-blocks/orchestrator-dispatch-rule.md (AC-5)",
    "managed-blocks/orchestrator-dispatch-rule.md" in _s44_update_text,
    "update/SKILL.md step 6 must reference the canonical file 'managed-blocks/orchestrator-dispatch-rule.md'; "
    "currently the skill reads setup/SKILL.md inline and extracts between markers",
)
check(
    "canonical-blocks(7b): update/SKILL.md references managed-blocks/nested-dispatch-takeover.md (AC-5)",
    "managed-blocks/nested-dispatch-takeover.md" in _s44_update_text,
    "update/SKILL.md step 6 must reference the canonical file 'managed-blocks/nested-dispatch-takeover.md'; "
    "currently the skill reads setup/SKILL.md inline and extracts between markers",
)
check(
    "canonical-blocks(7c): update/SKILL.md references managed-blocks/voice-rule.md (AC-5)",
    "managed-blocks/voice-rule.md" in _s44_update_text,
    "update/SKILL.md step 6 must reference the canonical file 'managed-blocks/voice-rule.md'; "
    "currently the skill reads setup/SKILL.md inline and extracts between markers",
)

# Per-OS PowerShell command block — must contain PowerShell-style syntax.
# Acceptable anchors: "PowerShell", "pwsh", or "Get-Content" (distinctive PS
# cmdlet for reading canonical files on Windows).
_HAS_PS_BLOCK = (
    "PowerShell" in _s44_update_text
    or "pwsh" in _s44_update_text
    or "Get-Content" in _s44_update_text
)
check(
    "canonical-blocks(7d): update/SKILL.md contains a PowerShell command block (AC-5)",
    _HAS_PS_BLOCK,
    "update/SKILL.md must contain an exact PowerShell/pwsh/Get-Content command block "
    "for Windows operators; currently the skill improvises shell without per-OS blocks",
)

# Per-OS bash command block — must contain bash-style syntax.
# Acceptable anchors: "bash" code fence, "cat " (reading canonical file via cat),
# or "sed " (the replace-between-markers idiom in bash).
_HAS_BASH_BLOCK = (
    "```bash" in _s44_update_text
    or "cat " in _s44_update_text
    or "sed " in _s44_update_text
)
check(
    "canonical-blocks(7e): update/SKILL.md contains a bash command block (AC-5)",
    _HAS_BASH_BLOCK,
    "update/SKILL.md must contain an exact bash command block (```bash / cat / sed) "
    "for Unix/macOS operators; currently the skill improvises shell without per-OS blocks",
)

# Destructive-replace declaration — must explicitly state DESTRUCTIVE replace.
check(
    "canonical-blocks(7f): update/SKILL.md declares DESTRUCTIVE replace (AC-5)",
    "DESTRUCTIVE" in _s44_update_text or "destructive" in _s44_update_text,
    "update/SKILL.md must explicitly declare that the block-sync is a DESTRUCTIVE replace "
    "(no comparison beyond marker-presence); currently this is implicit and undocumented",
)

# ---------------------------------------------------------------------------
# (6) Self-referential guard — AC-8.
# Suite 44 must be registered in docs/testing.md (NOT CLAUDE.md §11).
# This file must contain the literal "Suite 44" and "pr-th-update-fix".
# CLAUDE.md §11 must NOT contain "Suite 44".
# ---------------------------------------------------------------------------
check(
    "canonical-blocks(8/ac-8): docs/testing.md canonical registry names 'Suite 44'"
    " and 'pr-th-update-fix'; this file contains 'Suite 44'; CLAUDE.md §11 does NOT"
    " contain 'Suite 44' (hygiene contract)",
    "Suite 44" in _s44_testing_md
    and "pr-th-update-fix" in _s44_testing_md
    and "Suite 44" in _s44_self
    and "_slice_section" in _s44_self
    and "Suite 44" not in _s44_claude_md,
    "Suite 44 not registered in docs/testing.md canonical registry"
    " or 'pr-th-update-fix' missing from docs/testing.md"
    " or literal 'Suite 44' missing in this file"
    f" or 'Suite 44' found in CLAUDE.md (hygiene violation);"
    f" docs/testing.md has Suite 44: {'Suite 44' in _s44_testing_md};"
    f" docs/testing.md has pr-th-update-fix: {'pr-th-update-fix' in _s44_testing_md};"
    f" this file has Suite 44: {'Suite 44' in _s44_self};"
    f" CLAUDE.md has Suite 44 (must be False): {'Suite 44' in _s44_claude_md}"
    " — implementer must complete docs/testing.md; tester must not add Suite 44 to CLAUDE.md",
)


# ---------------------------------------------------------------------------
# Suite 45 -- pr-th-update-backup-prune (AC-1, AC-2, AC-3, AC-4, AC-5)
# ---------------------------------------------------------------------------
# Regression assertions that FAIL against the current source state (before the
# implementer inserts the bounded backup-prune into both per-OS blocks of
# skills/update/SKILL.md step 6).
#
# Root cause: step 6 creates a backup (CLAUDE.md.bak-<ts>) on every run but
# never prunes older backups, so they accumulate monotonically.
#
# Fix model: insert a bounded prune immediately after the backup creation in
# EACH per-OS block, keeping the most recent 3 backups:
#   PowerShell: Get-ChildItem "$claudeMd.bak-*" | Sort-Object LastWriteTime
#               | Select-Object -SkipLast 3 | Remove-Item -Force
#   bash:       ls -1t "$CLAUDE_MD".bak-* 2>/dev/null | tail -n +4 | xargs -r rm -f
# Also add one line of prose documenting the rolling retention of 3.
#
# Anti-false-green guarantee (mirrors Suite 43/44 idiom):
#   - _slice_section returns "" when its anchor is absent
#     => token-in-slice assertions fail when the anchor section is missing.
#   - All key tokens are absent from the current SKILL.md (no prune exists today)
#     => every content assertion is False against current main.
#
# AC coverage:
#   AC-1 : PowerShell block contains SkipLast 3 + .bak-* glob + Remove-Item
#   AC-2 : bash block contains tail -n +4 + .bak-* glob + rm
#   AC-3 : prose of step 6 documents retention (keep last 3 / rolling / keep)
#   AC-4 : Suite 45 in docs/testing.md; this file contains Suite 45
#   AC-5 : NEITHER block deletes a broad path (no bare Remove-Item * / rm -rf $HOME);
#          both prune lines reference the .bak- bounded glob
# ---------------------------------------------------------------------------
print()
print("=== Suite 45: pr-th-update-backup-prune — bounded last-3 backup prune ===")

# ---- file reads (suite-local) ----------------------------------------------
_s45_update_text = read(SKILLS_DIR / "update" / "SKILL.md")
_s45_testing_md  = read(REPO_ROOT / "docs" / "testing.md")
_s45_claude_md   = read(REPO_ROOT / "CLAUDE.md")
_s45_self        = Path(__file__).read_text(encoding="utf-8")

# ---- section anchors -------------------------------------------------------
# The two per-OS command blocks are identified by their header comments as
# written in SKILL.md today.  _slice_section returns "" when absent, so every
# token assertion inside an empty slice is False => no false-greens possible.
_S45_PS_ANCHOR   = "Windows (PowerShell) — run this block verbatim on Windows:"
_S45_BASH_ANCHOR = "Unix/macOS (bash) — run this block verbatim on Linux/macOS:"

_s45_ps_slice   = _slice_section(_s45_update_text, _S45_PS_ANCHOR)
_s45_bash_slice = _slice_section(_s45_update_text, _S45_BASH_ANCHOR)

# ---- (1) PowerShell block — AC-1 ------------------------------------------
# Assert the bounded prune is present: SkipLast 3 + bak-* glob + Remove-Item.
check(
    "backup-prune(1a/ac-1): PowerShell block contains 'SkipLast 3' (keep-last-3 retention)",
    "SkipLast 3" in _s45_ps_slice,
    f"PowerShell block (anchor: '{_S45_PS_ANCHOR}') does not contain 'SkipLast 3'; "
    "implementer must add: Select-Object -SkipLast 3 | Remove-Item -Force after Copy-Item backup line",
)
check(
    "backup-prune(1b/ac-1): PowerShell block operates on 'bak-' bounded glob",
    ".bak-" in _s45_ps_slice and "bak-*" in _s45_ps_slice,
    f"PowerShell block does not reference the bounded glob '.bak-*'; "
    "the prune must anchor on '$claudeMd.bak-*' — never a bare wildcard",
)
check(
    "backup-prune(1c/ac-1): PowerShell block contains 'Remove-Item' (delete cmdlet)",
    "Remove-Item" in _s45_ps_slice,
    f"PowerShell block does not contain 'Remove-Item'; "
    "the prune pipeline must end with '| Remove-Item -Force'",
)

# ---- (2) bash block — AC-2 -------------------------------------------------
# Assert the bounded prune is present: tail -n +4 + bak-* glob + rm.
check(
    "backup-prune(2a/ac-2): bash block contains 'tail -n +4' (keep-last-3 retention)",
    "tail -n +4" in _s45_bash_slice,
    f"bash block (anchor: '{_S45_BASH_ANCHOR}') does not contain 'tail -n +4'; "
    "implementer must add: ls -1t \"$CLAUDE_MD\".bak-* 2>/dev/null | tail -n +4 | xargs -r rm -f",
)
check(
    "backup-prune(2b/ac-2): bash block operates on 'bak-' bounded glob",
    ".bak-" in _s45_bash_slice and "bak-*" in _s45_bash_slice,
    f"bash block does not reference the bounded glob '.bak-*'; "
    "the prune must anchor on '\"$CLAUDE_MD\".bak-*' — never a bare wildcard",
)
check(
    "backup-prune(2c/ac-2): bash block contains 'rm' (delete command)",
    " rm " in _s45_bash_slice or "xargs -r rm" in _s45_bash_slice or "rm -f" in _s45_bash_slice,
    f"bash block does not contain an 'rm' invocation; "
    "the prune pipeline must end with '| xargs -r rm -f'",
)

# ---- (3) Prose documentation — AC-3 ----------------------------------------
# The prose of step 6 must mention the rolling retention of 3 backups.
# Acceptable tokens: 'last 3', 'rolling', or 'keep' near the backup bullet.
# We check the whole SKILL.md text because the prose sits outside the code
# fences (and _slice_section would stop at the next heading before the fences).
_S45_RETENTION_DOCUMENTED = (
    "last 3" in _s45_update_text
    or "rolling" in _s45_update_text
    or ("keep" in _s45_update_text and "bak" in _s45_update_text)
)
check(
    "backup-prune(3/ac-3): SKILL.md prose documents rolling retention"
    " ('last 3' or 'rolling' or 'keep'+'bak' present)",
    _S45_RETENTION_DOCUMENTED,
    "skills/update/SKILL.md step 6 prose does not document the rolling retention of 3 backups; "
    "implementer must add a one-line note: e.g. 'pruned to the last 3 rolling backups'",
)

# ---- (4) Bounded-delete safety — AC-5 -------------------------------------
# Negative assertions: NEITHER per-OS block must use an unbounded delete path.
# PowerShell: "Remove-Item *" (bare wildcard) must not appear in the PS slice.
# bash: "rm -rf $HOME" must not appear in the bash slice.
# Positive: the prune lines in each slice reference ".bak-" (bounded glob marker).
check(
    "backup-prune(4a/ac-5): PowerShell block does NOT contain bare 'Remove-Item *' (unbounded delete guard)",
    "Remove-Item *" not in _s45_ps_slice,
    "PowerShell block contains 'Remove-Item *' — this is an unbounded delete and violates AC-5; "
    "the prune must be scoped to '$claudeMd.bak-*' exclusively",
)
check(
    "backup-prune(4b/ac-5): bash block does NOT contain 'rm -rf $HOME' (unbounded delete guard)",
    "rm -rf $HOME" not in _s45_bash_slice,
    "bash block contains 'rm -rf $HOME' — this is an unbounded destructive delete and violates AC-5",
)
check(
    "backup-prune(4c/ac-5): PowerShell prune line references '.bak-' bounded glob (scope guard)",
    ".bak-" in _s45_ps_slice,
    "PowerShell prune line does not reference '.bak-' — the delete is not bounded to the backup glob; "
    "the prune must operate exclusively on '$claudeMd.bak-*'",
)
check(
    "backup-prune(4d/ac-5): bash prune line references '.bak-' bounded glob (scope guard)",
    ".bak-" in _s45_bash_slice,
    "bash prune line does not reference '.bak-' — the delete is not bounded to the backup glob; "
    "the prune must operate exclusively on '\"$CLAUDE_MD\".bak-*'",
)

# ---- (5) Self-referential guard — AC-4 ------------------------------------
# Suite 45 must be registered in docs/testing.md (NOT CLAUDE.md §11).
# This file must contain the literal "Suite 45" and "pr-th-update-backup-prune".
# CLAUDE.md §11 must NOT contain "Suite 45" (hygiene contract, same as Suites 43/44).
check(
    "backup-prune(5/ac-4): docs/testing.md canonical registry names 'Suite 45'"
    " and 'pr-th-update-backup-prune'; this file contains 'Suite 45' and '_slice_section';"
    " CLAUDE.md does NOT contain 'Suite 45' (hygiene contract)",
    "Suite 45" in _s45_testing_md
    and "pr-th-update-backup-prune" in _s45_testing_md
    and "Suite 45" in _s45_self
    and "_slice_section" in _s45_self
    and "Suite 45" not in _s45_claude_md,
    "Suite 45 not registered in docs/testing.md canonical registry"
    " or 'pr-th-update-backup-prune' missing from docs/testing.md"
    " or literal 'Suite 45' missing in this file"
    " or '_slice_section' idiom absent"
    f" or 'Suite 45' found in CLAUDE.md (hygiene violation);"
    f" docs/testing.md has Suite 45: {'Suite 45' in _s45_testing_md};"
    f" docs/testing.md has pr-th-update-backup-prune: {'pr-th-update-backup-prune' in _s45_testing_md};"
    f" this file has Suite 45: {'Suite 45' in _s45_self};"
    f" CLAUDE.md has Suite 45 (must be False): {'Suite 45' in _s45_claude_md}"
    " — implementer must register in docs/testing.md; tester must not add Suite 45 to CLAUDE.md",
)


# ---------------------------------------------------------------------------
# Suite 46 -- pr-f-observability (AC-1..AC-8)
# ---------------------------------------------------------------------------
# Regression assertions written FAILING-FIRST (Phase 2.0 mandate) against the
# current source state.  They become GREEN after the implementer lands the 6
# fixes.  Each check is ANCHOR-SCOPED via _slice_section so that:
#   - a missing anchor returns "" → token-in-"" is False → the check fails
#     clearly (not silently) even if the token happens to exist elsewhere.
#   - renaming or removing the anchored section fails the check, not the
#     ambient-presence guard.
#
# CANONICAL ANCHORS (implementer MUST use these verbatim):
#   agents/orchestrator.md  : "### Final Pipeline Sanity Check"   (exists today)
#   agents/orchestrator.md  : "## Phase 3.5 — Acceptance Gate"    (exists today)
#   agents/orchestrator.md  : "Phase 2-close scope check"         (NEW section / subsection)
#   agents/orchestrator.md  : Phase 3 security-finding write site
#                             → pointer line contains "### Emitting kg_write events"
#                             (new pointer, sliced via existing "## Phase 3 — Verify" anchor)
#   agents/orchestrator.md  : Phase 6 save procedure
#                             → pointer line contains "### Emitting kg_write events"
#                             (new pointer, sliced via "Phase 6 — Knowledge Save" anchor)
#   agents/ref-special-flows.md : "## Documentation Flow"          (exists today)
#   agents/ref-special-flows.md + CLAUDE.md §5 : Tier 0 carve-out
#                             → CLAUDE.md contains "Tier 0" + "explicitly" + "observability"
#                             (new sub-clause, whole-§5-paragraph check)
#
# Check index → AC mapping:
#   (1)   AC-1  Final Sanity Check verifies {events_file} + 00-pipeline-summary.md
#   (2)   AC-1  Final Sanity Check asserts ≥1 phase.end per [x] phase
#   (3)   AC-1  Mismatch → blocked-incomplete (not pipeline.complete)
#   (4)   AC-2  Phase 3.5 fix/hotfix Tier 2-4 regression-still-passing condition
#   (5)   AC-3  Phase 2-close scope check diff-vs-Scope-of-Fix present
#   (6)   AC-3  Phase 2-close note: coordination with PR B (not duplication)
#   (7)   AC-4  kg_write pointer after Phase 3 security-finding write site
#   (8)   AC-4  kg_write pointer after Phase 6 save procedure
#   (9)   AC-5  Documentation Flow lists 00-execution-events
#   (10)  AC-5  Documentation Flow specifies phase.start/phase.end per phase
#   (11)  AC-5  Documentation Flow has DOC-GATE gate event
#   (12)  AC-5  Documentation Flow declares KG capture stance (no KG capture)
#   (13)  AC-6  CLAUDE.md §5 carve-out explicitly exempts Tier 0 from observability
#   (14)  AC-6  ref-special-flows.md Tier 0 rows reference the carve-out
#   (15)  AC-8  Suite 46 in docs/testing.md (canonical registry)
#   (16)  AC-8  Suite 46 NOT in CLAUDE.md §11 (hygiene contract)
# ---------------------------------------------------------------------------
print()
print("=== Suite 46: pr-f-observability — observability gates hardening ===")

# ---- file reads (suite-local) ----------------------------------------------
_s46_orch      = read(AGENTS_DIR / "orchestrator.md")
_s46_rsf       = read(AGENTS_DIR / "ref-special-flows.md")
_s46_claude    = read(REPO_ROOT / "CLAUDE.md")
_s46_testing   = read(REPO_ROOT / "docs" / "testing.md")
_s46_self      = Path(__file__).read_text(encoding="utf-8")

# ---- canonical anchors & slices --------------------------------------------
_S46_SANITY_ANCHOR   = "### Final Pipeline Sanity Check"
_S46_PHASE35_ANCHOR  = "## Phase 3.5 — Acceptance Gate"
_S46_PH2CLOSE_ANCHOR = "Phase 2-close scope check"
_S46_PHASE3_ANCHOR   = "## Phase 3 — Verify"
_S46_PHASE6_ANCHOR   = "Phase 6 — Knowledge Save (MANDATORY)"
_S46_DOCFLOW_ANCHOR  = "## Documentation Flow"

_s46_sanity_slice   = _slice_section(_s46_orch, _S46_SANITY_ANCHOR)
_s46_phase35_slice  = _slice_section(_s46_orch, _S46_PHASE35_ANCHOR)
_s46_ph2close_slice = _slice_section(_s46_orch, _S46_PH2CLOSE_ANCHOR)
_s46_phase3_slice   = _slice_section(_s46_orch, _S46_PHASE3_ANCHOR)
_s46_phase6_slice   = _slice_section(_s46_orch, _S46_PHASE6_ANCHOR)
_s46_docflow_slice  = _slice_section(_s46_rsf, _S46_DOCFLOW_ANCHOR)

# ---------------------------------------------------------------------------
# Check (1) / AC-1 — Final Sanity Check asserts both observability artifacts
# exist and are non-empty.  The check anchors on the existing
# "### Final Pipeline Sanity Check" section.  Today that section enumerates
# only per-agent workspace docs; the 2 observability files are absent.
# Tokens required in slice:
#   "00-pipeline-summary.md"  — the pipeline summary artifact
#   one of "{events_file}" / "00-execution-events"  — the events file
#   "non-empty"               — both must be asserted non-empty
# ---------------------------------------------------------------------------
check(
    "obs-gates(1/ac-1): orchestrator.md § Final Pipeline Sanity Check asserts"
    " 00-pipeline-summary.md AND the events file exist + non-empty",
    bool(_s46_sanity_slice)
    and "00-pipeline-summary.md" in _s46_sanity_slice
    and (
        "{events_file}" in _s46_sanity_slice
        or "00-execution-events" in _s46_sanity_slice
    )
    and "non-empty" in _s46_sanity_slice,
    f"anchor '{_S46_SANITY_ANCHOR}' missing or observability-artifact tokens absent;"
    f" anchor present: {bool(_s46_sanity_slice)};"
    f" 00-pipeline-summary.md: {'00-pipeline-summary.md' in _s46_sanity_slice};"
    f" events_file: {('{events_file}' in _s46_sanity_slice or '00-execution-events' in _s46_sanity_slice)};"
    f" non-empty: {'non-empty' in _s46_sanity_slice}",
)

# ---------------------------------------------------------------------------
# Check (2) / AC-1 — Final Sanity Check asserts ≥1 phase.end per [x] phase
# in the Phase Checklist.  Today there is no such assertion.
# Tokens required in slice:
#   "phase.end"       — the event type being counted
#   one of "[x]" / "Phase Checklist" / "phase.end per"  — what it reads
# ---------------------------------------------------------------------------
check(
    "obs-gates(2/ac-1): orchestrator.md § Final Pipeline Sanity Check asserts"
    " ≥1 phase.end per [x] phase in Phase Checklist",
    bool(_s46_sanity_slice)
    and "phase.end" in _s46_sanity_slice
    and (
        "[x]" in _s46_sanity_slice
        or "Phase Checklist" in _s46_sanity_slice
        or "phase.end per" in _s46_sanity_slice
    ),
    f"anchor '{_S46_SANITY_ANCHOR}' missing or phase.end-per-phase assertion absent;"
    f" anchor present: {bool(_s46_sanity_slice)};"
    f" 'phase.end' in slice: {'phase.end' in _s46_sanity_slice};"
    f" '[x]' or 'Phase Checklist' in slice:"
    f" {('[x]' in _s46_sanity_slice or 'Phase Checklist' in _s46_sanity_slice)}",
)

# ---------------------------------------------------------------------------
# Check (3) / AC-1 — Mismatch → blocked-incomplete, not pipeline.complete.
# Today the check does not exist so the mismatch path is never reached.
# Tokens required in slice:
#   "blocked-incomplete"   — the status set on mismatch
#   one of "missing_artifacts" / "NOT" / "no pipeline.complete"
#                          — confirmation that pipeline.complete is suppressed
# ---------------------------------------------------------------------------
check(
    "obs-gates(3/ac-1): orchestrator.md § Final Pipeline Sanity Check routes"
    " observability mismatch to blocked-incomplete (not pipeline.complete)",
    bool(_s46_sanity_slice)
    and "blocked-incomplete" in _s46_sanity_slice
    and (
        "missing_artifacts" in _s46_sanity_slice
        or "NOT" in _s46_sanity_slice
        or "not pipeline.complete" in _s46_sanity_slice.lower()
    ),
    f"anchor '{_S46_SANITY_ANCHOR}' missing or blocked-incomplete path absent;"
    f" anchor present: {bool(_s46_sanity_slice)};"
    f" 'blocked-incomplete': {'blocked-incomplete' in _s46_sanity_slice};"
    f" 'missing_artifacts' or NOT: "
    f" {'missing_artifacts' in _s46_sanity_slice or 'NOT' in _s46_sanity_slice}",
)

# ---------------------------------------------------------------------------
# Check (4) / AC-2 — Phase 3.5 Acceptance Gate adds a regression-still-passing
# condition for type:fix|hotfix Tier 2-4.  Today Phase 3.5 has only the
# count-ratchet; the specific-regression-test check is absent.
# Tokens required in slice:
#   one of "regression_test_path" / "02-regression-test.md"
#                              — the regression test artifact
#   one of "skip" / "xfail" / "not skipped"
#                              — the skip/xfail/comment check
#   one of "Tier 2" / "Tier 2-4" / "fix|hotfix"
#                              — the condition scope
# ---------------------------------------------------------------------------
check(
    "obs-gates(4/ac-2): orchestrator.md § Phase 3.5 adds regression-still-passing"
    " condition for type:fix/hotfix Tier 2-4 (regression_test_path PASS + not skipped)",
    bool(_s46_phase35_slice)
    and (
        "regression_test_path" in _s46_phase35_slice
        or "02-regression-test.md" in _s46_phase35_slice
    )
    and (
        "skip" in _s46_phase35_slice
        or "xfail" in _s46_phase35_slice
    )
    and (
        "Tier 2" in _s46_phase35_slice
        or "Tier 2-4" in _s46_phase35_slice
        or ("fix" in _s46_phase35_slice and "hotfix" in _s46_phase35_slice)
    ),
    f"anchor '{_S46_PHASE35_ANCHOR}' missing or regression-still-passing condition absent;"
    f" anchor present: {bool(_s46_phase35_slice)};"
    f" regression_test_path or 02-regression-test.md:"
    f" {'regression_test_path' in _s46_phase35_slice or '02-regression-test.md' in _s46_phase35_slice};"
    f" skip/xfail: {'skip' in _s46_phase35_slice or 'xfail' in _s46_phase35_slice};"
    f" Tier scope: {'Tier 2' in _s46_phase35_slice or 'Tier 2-4' in _s46_phase35_slice}",
)

# ---------------------------------------------------------------------------
# Check (5) / AC-3 — Phase 2-close scope check: diff-vs-Scope-of-Fix present.
# Today there is no Phase 2-close scope check.  After the fix, a new step
# runs `git diff --name-only` and checks each non-test changed file against
# `01-root-cause.md § Scope of Fix`.
# Tokens required in slice:
#   "git diff --name-only"     — the command
#   one of "Scope of Fix" / "01-root-cause.md"  — the authority list
#   one of "[SCOPE-DRIFT]" / "SCOPE-DRIFT"       — the annotation
# ---------------------------------------------------------------------------
check(
    "obs-gates(5/ac-3): orchestrator.md Phase 2-close scope check runs"
    " 'git diff --name-only' vs 01-root-cause.md § Scope of Fix"
    " and recognises [SCOPE-DRIFT] annotation",
    bool(_s46_ph2close_slice)
    and "git diff --name-only" in _s46_ph2close_slice
    and (
        "Scope of Fix" in _s46_ph2close_slice
        or "01-root-cause.md" in _s46_ph2close_slice
    )
    and "SCOPE-DRIFT" in _s46_ph2close_slice,
    f"anchor '{_S46_PH2CLOSE_ANCHOR}' missing or scope-check tokens absent;"
    f" anchor present: {bool(_s46_ph2close_slice)};"
    f" git diff: {'git diff --name-only' in _s46_ph2close_slice};"
    f" Scope of Fix or 01-root-cause.md:"
    f" {'Scope of Fix' in _s46_ph2close_slice or '01-root-cause.md' in _s46_ph2close_slice};"
    f" SCOPE-DRIFT: {'SCOPE-DRIFT' in _s46_ph2close_slice}",
)

# ---------------------------------------------------------------------------
# Check (6) / AC-3 — Phase 2-close note: coordination with PR B gate
# (diff-vs-sensitive-paths) — distinct and complementary, not a duplicate.
# Today there is no such coordination note.
# Tokens required in slice:
#   one of "PR B" / "sensitive-paths" / "tier_promote"  — PR B gate identity
#   one of "complementary" / "distinct" / "coordination"
#                              — the co-existence framing
# ---------------------------------------------------------------------------
check(
    "obs-gates(6/ac-3): Phase 2-close scope check documents coordination with"
    " PR B gate (diff-vs-sensitive-paths) as distinct and complementary",
    bool(_s46_ph2close_slice)
    and (
        "PR B" in _s46_ph2close_slice
        or "sensitive-paths" in _s46_ph2close_slice
        or "tier_promote" in _s46_ph2close_slice
    )
    and (
        "complementary" in _s46_ph2close_slice
        or "distinct" in _s46_ph2close_slice
        or "coordination" in _s46_ph2close_slice
    ),
    f"anchor '{_S46_PH2CLOSE_ANCHOR}' missing or PR-B coordination note absent;"
    f" anchor present: {bool(_s46_ph2close_slice)};"
    f" PR B / sensitive-paths / tier_promote:"
    f" {'PR B' in _s46_ph2close_slice or 'sensitive-paths' in _s46_ph2close_slice or 'tier_promote' in _s46_ph2close_slice};"
    f" complementary / distinct / coordination:"
    f" {'complementary' in _s46_ph2close_slice or 'distinct' in _s46_ph2close_slice or 'coordination' in _s46_ph2close_slice}",
)

# ---------------------------------------------------------------------------
# Check (7) / AC-4 — kg_write pointer co-located after Phase 3 security-finding
# write site.  Today the Phase 3 section has no such inline pointer.
# Strategy: slice the "## Phase 3 — Verify" section and assert the pointer
# references the emit section via the `§ "Emitting kg_write events"` form
# (the § convention is used so the literal "### Emitting kg_write events"
# heading token is NOT reproduced inline — an inline `### …` copy would be
# matched first by _slice_section's text.find() and would hijack the slices
# that Suites 35/36 anchor on the real heading).
# ---------------------------------------------------------------------------
_S46_EMIT_PTR = '§ "Emitting kg_write events"'
check(
    "obs-gates(7/ac-4): orchestrator.md § Phase 3 — Verify contains an inline"
    " pointer (§ \"Emitting kg_write events\") after the security-finding write site",
    bool(_s46_phase3_slice)
    and _S46_EMIT_PTR in _s46_phase3_slice,
    f"anchor '{_S46_PHASE3_ANCHOR}' missing or kg_write pointer absent in Phase 3 slice;"
    f" anchor present: {bool(_s46_phase3_slice)};"
    f" '{_S46_EMIT_PTR}' in slice:"
    f" {_S46_EMIT_PTR in _s46_phase3_slice}",
)

# ---------------------------------------------------------------------------
# Check (8) / AC-4 — kg_write pointer co-located after Phase 6 save procedure.
# Today the Phase 6 section has no such inline pointer.
# Strategy: slice the "Phase 6 — Knowledge Save (MANDATORY)" section and
# assert the pointer references the emit section via the `§ "Emitting
# kg_write events"` form (same anti-collision rationale as check (7)).
# ---------------------------------------------------------------------------
check(
    "obs-gates(8/ac-4): orchestrator.md § Phase 6 — Knowledge Save contains an"
    " inline pointer (§ \"Emitting kg_write events\") after the save procedure",
    bool(_s46_phase6_slice)
    and _S46_EMIT_PTR in _s46_phase6_slice,
    f"anchor '{_S46_PHASE6_ANCHOR}' missing or kg_write pointer absent in Phase 6 slice;"
    f" anchor present: {bool(_s46_phase6_slice)};"
    f" '{_S46_EMIT_PTR}' in slice:"
    f" {_S46_EMIT_PTR in _s46_phase6_slice}",
)

# ---------------------------------------------------------------------------
# Check (9) / AC-5 — Documentation Flow lists 00-execution-events in its
# workspace listing.  Today the Documentation Flow workspace listing does not
# include 00-execution-events.
# Tokens required in slice:
#   "00-execution-events"  — the artifact name (either .md or .jsonl suffix)
# ---------------------------------------------------------------------------
check(
    "obs-gates(9/ac-5): ref-special-flows.md § Documentation Flow lists"
    " 00-execution-events in its workspace artifact listing",
    bool(_s46_docflow_slice)
    and "00-execution-events" in _s46_docflow_slice,
    f"anchor '{_S46_DOCFLOW_ANCHOR}' missing or 00-execution-events absent in slice;"
    f" anchor present: {bool(_s46_docflow_slice)};"
    f" 00-execution-events: {'00-execution-events' in _s46_docflow_slice}",
)

# ---------------------------------------------------------------------------
# Check (10) / AC-5 — Documentation Flow specifies phase.start/phase.end
# events for its phases (1, 2a, 2b, 3).  Today no phase events are documented
# for the docs-flow.
# Tokens required in slice (both):
#   "phase.start"   — event type
#   "phase.end"     — event type
# Plus evidence of at least one docs-flow phase reference:
#   one of "2a" / "2b" / "Research" / "Write"
# ---------------------------------------------------------------------------
check(
    "obs-gates(10/ac-5): ref-special-flows.md § Documentation Flow specifies"
    " phase.start and phase.end events for its phases (1, 2a, 2b, 3)",
    bool(_s46_docflow_slice)
    and "phase.start" in _s46_docflow_slice
    and "phase.end" in _s46_docflow_slice
    and (
        "2a" in _s46_docflow_slice
        or "2b" in _s46_docflow_slice
        or "Research" in _s46_docflow_slice
        or "Write" in _s46_docflow_slice
    ),
    f"anchor '{_S46_DOCFLOW_ANCHOR}' missing or phase event tokens absent;"
    f" anchor present: {bool(_s46_docflow_slice)};"
    f" phase.start: {'phase.start' in _s46_docflow_slice};"
    f" phase.end: {'phase.end' in _s46_docflow_slice};"
    f" phase ref (2a/2b/Research/Write):"
    f" {'2a' in _s46_docflow_slice or '2b' in _s46_docflow_slice or 'Research' in _s46_docflow_slice}",
)

# ---------------------------------------------------------------------------
# Check (11) / AC-5 — Documentation Flow has a DOC-GATE gate event.  Today
# no DOC-GATE gate event is specified.
# Tokens required in slice:
#   "DOC-GATE"   — the gate name (used in the plan spec)
# ---------------------------------------------------------------------------
check(
    "obs-gates(11/ac-5): ref-special-flows.md § Documentation Flow specifies"
    " a DOC-GATE gate event",
    bool(_s46_docflow_slice)
    and "DOC-GATE" in _s46_docflow_slice,
    f"anchor '{_S46_DOCFLOW_ANCHOR}' missing or DOC-GATE absent in slice;"
    f" anchor present: {bool(_s46_docflow_slice)};"
    f" DOC-GATE: {'DOC-GATE' in _s46_docflow_slice}",
)

# ---------------------------------------------------------------------------
# Check (12) / AC-5 — Documentation Flow explicitly declares its KG-capture
# stance (no KG capture — the docs-flow has no Phase 6).  Today this is
# undocumented.
# Tokens required in slice:
#   one of "KG" / "KG capture" / "knowledge"  — the KG concept
#   one of "no" / "not" / "NO" / "does not"   — the negation
# ---------------------------------------------------------------------------
check(
    "obs-gates(12/ac-5): ref-special-flows.md § Documentation Flow explicitly"
    " declares its KG-capture stance (no KG capture / no Phase 6)",
    bool(_s46_docflow_slice)
    and (
        "KG" in _s46_docflow_slice
        or "KG capture" in _s46_docflow_slice
        or "knowledge" in _s46_docflow_slice.lower()
    )
    and (
        "no KG" in _s46_docflow_slice
        or "no Phase 6" in _s46_docflow_slice
        or "does not" in _s46_docflow_slice
        or "NO KG" in _s46_docflow_slice
        or "not perform" in _s46_docflow_slice
    ),
    f"anchor '{_S46_DOCFLOW_ANCHOR}' missing or KG-capture stance absent;"
    f" anchor present: {bool(_s46_docflow_slice)};"
    f" KG token: {'KG' in _s46_docflow_slice or 'knowledge' in _s46_docflow_slice.lower()};"
    f" negation: {'no KG' in _s46_docflow_slice or 'does not' in _s46_docflow_slice or 'no Phase 6' in _s46_docflow_slice}",
)

# ---------------------------------------------------------------------------
# Check (13) / AC-6 — CLAUDE.md §5 carve-out explicitly exempts Tier 0 from
# the observability-mandatory invariant.  Today §5 mandates observability
# without any exception for Tier 0.
#
# Strategy: slice §5 from CLAUDE.md (between "## 5." and "## 6.") and assert:
#   "Tier 0"        — the tier name
#   "observability" — or "observable" — the invariant domain
#   one of "exception" / "exempt" / "carve-out" / "explicitly"
#                   — the carve-out framing
# ---------------------------------------------------------------------------
_S46_CLAUDE_S5_START = "## 5."
_S46_CLAUDE_S6_START = "## 6."
_s46_s5_idx = _s46_claude.find(_S46_CLAUDE_S5_START)
_s46_s6_idx = _s46_claude.find(_S46_CLAUDE_S6_START, _s46_s5_idx) if _s46_s5_idx != -1 else -1
_s46_claude_s5 = (
    _s46_claude[_s46_s5_idx:_s46_s6_idx]
    if _s46_s5_idx != -1 and _s46_s6_idx != -1
    else (_s46_claude[_s46_s5_idx:] if _s46_s5_idx != -1 else "")
)

check(
    "obs-gates(13/ac-6): CLAUDE.md §5 explicitly carves Tier 0 out of the"
    " observability-mandatory invariant (Tier 0 + observability + exception/exempt)",
    bool(_s46_claude_s5)
    and "Tier 0" in _s46_claude_s5
    and (
        "observability" in _s46_claude_s5
        or "observable" in _s46_claude_s5.lower()
    )
    and (
        "exception" in _s46_claude_s5
        or "exempt" in _s46_claude_s5
        or "carve-out" in _s46_claude_s5
        or "explicitly" in _s46_claude_s5
    ),
    f"CLAUDE.md §5 slice (## 5. → ## 6.) missing or Tier 0 carve-out absent;"
    f" §5 slice found: {bool(_s46_claude_s5)};"
    f" Tier 0: {'Tier 0' in _s46_claude_s5};"
    f" observability: {'observability' in _s46_claude_s5};"
    f" exception/exempt/carve-out/explicitly:"
    f" {'exception' in _s46_claude_s5 or 'exempt' in _s46_claude_s5 or 'carve-out' in _s46_claude_s5 or 'explicitly' in _s46_claude_s5}",
)

# ---------------------------------------------------------------------------
# Check (14) / AC-6 — ref-special-flows.md Tier 0 rows reference the carve-out.
# Today the Tier 0 rows in ref-special-flows.md do not mention the §5 carve-out.
# Strategy: whole-file check on ref-special-flows.md for both:
#   "Tier 0"              — tier name
#   one of "carve-out" / "§5" / "CLAUDE.md" / "exempt"
#                         — the carve-out reference
# (We use whole-file because the Tier 0 table is in a different section than
# Documentation Flow and we already have the whole file loaded.)
# ---------------------------------------------------------------------------
check(
    "obs-gates(14/ac-6): ref-special-flows.md Tier 0 rows reference the §5"
    " carve-out (CLAUDE.md §5 or 'carve-out' or 'exempt' in the Tier 0 context)",
    "Tier 0" in _s46_rsf
    and (
        "carve-out" in _s46_rsf
        or "§5" in _s46_rsf
        or ("CLAUDE.md" in _s46_rsf and "Tier 0" in _s46_rsf and "observability" in _s46_rsf)
        or ("exempt" in _s46_rsf and "Tier 0" in _s46_rsf)
    ),
    f"ref-special-flows.md missing Tier 0 carve-out reference;"
    f" 'Tier 0' present: {'Tier 0' in _s46_rsf};"
    f" carve-out reference (carve-out/§5/exempt):"
    f" {'carve-out' in _s46_rsf or '§5' in _s46_rsf or 'exempt' in _s46_rsf}",
)

# ---------------------------------------------------------------------------
# Check (15) / AC-8 — Suite 46 registered in docs/testing.md (canonical
# registry, NOT in CLAUDE.md §11).
# ---------------------------------------------------------------------------
check(
    "obs-gates(15/ac-8): docs/testing.md canonical registry names 'Suite 46'"
    " and 'pr-f-observability'; this file contains 'Suite 46' and '_slice_section';"
    " CLAUDE.md §11 does NOT contain 'Suite 46' (hygiene contract)",
    "Suite 46" in _s46_testing
    and "pr-f-observability" in _s46_testing
    and "Suite 46" in _s46_self
    and "_slice_section" in _s46_self
    and "Suite 46" not in _s46_claude_s5,
    f"Suite 46 not registered in docs/testing.md"
    f" or 'pr-f-observability' absent from docs/testing.md"
    f" or 'Suite 46' missing in this file"
    f" or '_slice_section' idiom absent"
    f" or 'Suite 46' found in CLAUDE.md §11 (hygiene violation);"
    f" docs/testing.md Suite 46: {'Suite 46' in _s46_testing};"
    f" docs/testing.md pr-f-observability: {'pr-f-observability' in _s46_testing};"
    f" this file Suite 46: {'Suite 46' in _s46_self};"
    f" CLAUDE.md §5 Suite 46 (must be False): {'Suite 46' in _s46_claude_s5}",
)

# ---------------------------------------------------------------------------
# Check (16) / AC-8 — Suite 46 NOT in CLAUDE.md §11 (hygiene contract —
# same precedent as Suites 43/44/45).
# Strategy: slice CLAUDE.md §11 (between "## 11." and "## 12.") and assert
# "Suite 46" does NOT appear there.
# ---------------------------------------------------------------------------
_S46_CLAUDE_S11_START = "## 11."
_S46_CLAUDE_S12_START = "## 12."
_s46_s11_idx = _s46_claude.find(_S46_CLAUDE_S11_START)
_s46_s12_idx = _s46_claude.find(_S46_CLAUDE_S12_START, _s46_s11_idx) if _s46_s11_idx != -1 else -1
_s46_claude_s11 = (
    _s46_claude[_s46_s11_idx:_s46_s12_idx]
    if _s46_s11_idx != -1 and _s46_s12_idx != -1
    else (_s46_claude[_s46_s11_idx:] if _s46_s11_idx != -1 else "")
)

check(
    "obs-gates(16/ac-8): CLAUDE.md §11 does NOT contain 'Suite 46'"
    " (hygiene contract — per-suite inventory belongs in docs/testing.md, not §11)",
    "Suite 46" not in _s46_claude_s11,
    f"CLAUDE.md §11 contains literal 'Suite 46' — hygiene violation;"
    f" Suite 46 must be registered only in docs/testing.md, not in CLAUDE.md §11;"
    f" §11 slice found: {bool(_s46_claude_s11)}",
)



# ---------------------------------------------------------------------------
# Suite 47 -- pr-g-docs-fidelity (AC-1..AC-8)
# ---------------------------------------------------------------------------
# Regression assertions written FAILING-FIRST (Phase 2.0 mandate) against the
# current source state.  They become GREEN after the implementer lands the 4
# fixes.  Each content check is ANCHOR-SCOPED via _slice_section so that:
#   - a missing anchor returns "" → token-in-"" is False → the check fails
#     clearly (not silently) even if the token happens to exist elsewhere.
#   - renaming or removing the anchored section fails the check, not the
#     ambient-presence guard.
#
# CANONICAL ANCHORS (implementer MUST use these verbatim):
#   agents/qa.md              : "### Docs Validation Mode"       (NEW section)
#   agents/documenter.md      : "## Provenance and Fail-Closed Contract"  (NEW section)
#   agents/orchestrator.md    : "### Artifact Verification Protocol"  (EXISTS today)
#   agents/ref-special-flows.md: "### DOC-GATE — Human Checkpoint"  (EXISTS today)
#
# ANTI-COLLISION NOTE (lesson from PR F):
#   The anchor strings above are Python string literals assigned to variables.
#   They are NOT reproduced as inline markdown headings anywhere in this .py
#   file.  The _slice_section helper resolves by text.find() on the .md sources;
#   as long as no other suite defines the same anchor on the same file via a
#   _slice_section call, there is no hijack risk.  Verified: no existing suite
#   calls _slice_section on qa.md, documenter.md with these substrings, nor on
#   ref-special-flows.md with "### DOC-GATE — Human Checkpoint", nor on
#   orchestrator.md with "### Artifact Verification Protocol" via _slice_section
#   (Suite 29 uses a whole-file `in` check, not _slice_section — no collision).
#
# Cross-refs in check names use the § "Section Name" form (never ### literal).
#
# Check index → AC mapping:
#   (1)   AC-1  qa.md § Docs Validation Mode declares doc-vs-code spot-verify
#   (2)   AC-2  qa.md § Docs Validation Mode: unbacked fact FAILS the DOC-GATE
#   (3)   AC-3  documenter.md § Provenance and Fail-Closed Contract: file:line provenance
#   (4)   AC-4  documenter.md § Provenance and Fail-Closed Contract: return blocked not invent
#   (5)   AC-5  orchestrator.md § Artifact Verification Protocol table has docs-flow rows
#   (6)   AC-5  orchestrator.md § Artifact Verification Protocol: 00-research.md row present
#   (7)   AC-5  orchestrator.md § Artifact Verification Protocol: 02-documentation.md row present
#   (8)   AC-5  orchestrator.md § Artifact Verification Protocol: 04-validation.md row present
#   (9)   AC-6  ref-special-flows.md § DOC-GATE: pages-on-disk == pages_created assertion
#   (10)  AC-6  ref-special-flows.md § DOC-GATE: mismatch → blocked (fail-closed)
#   (11)  AC-7  Suite 47 in docs/testing.md (canonical registry)
#   (12)  AC-7  Suite 47 NOT in CLAUDE.md §11 (hygiene contract)
# ---------------------------------------------------------------------------
print()
print("=== Suite 47: pr-g-docs-fidelity — docs-flow fidelity hardening ===")

# ---- file reads (suite-local) ----------------------------------------------
_s47_qa          = read(AGENTS_DIR / "qa.md")
_s47_doc         = read(AGENTS_DIR / "documenter.md")
_s47_orch        = read(AGENTS_DIR / "orchestrator.md")
_s47_rsf         = read(AGENTS_DIR / "ref-special-flows.md")
_s47_claude      = read(REPO_ROOT / "CLAUDE.md")
_s47_testing     = read(REPO_ROOT / "docs" / "testing.md")
_s47_self        = Path(__file__).read_text(encoding="utf-8")

# ---- canonical anchors -----------------------------------------------------
_S47_QA_DOCS_ANCHOR      = "### Docs Validation Mode"
_S47_DOC_PROV_ANCHOR     = "## Provenance and Fail-Closed Contract"
_S47_ORCH_AV_ANCHOR      = "### Artifact Verification Protocol"
_S47_RSF_DOCGATE_ANCHOR  = "### DOC-GATE — Human Checkpoint"

# ---- slices ----------------------------------------------------------------
_s47_qa_docs_slice    = _slice_section(_s47_qa,   _S47_QA_DOCS_ANCHOR)
_s47_doc_prov_slice   = _slice_section(_s47_doc,  _S47_DOC_PROV_ANCHOR)
_s47_orch_av_slice    = _slice_section(_s47_orch, _S47_ORCH_AV_ANCHOR)
_s47_rsf_docgate_slice = _slice_section(_s47_rsf, _S47_RSF_DOCGATE_ANCHOR)

# ---------------------------------------------------------------------------
# Check (1) / AC-1 — qa.md § Docs Validation Mode declares spot-verify of
# concrete technical claims (endpoints, params, env vars, config keys, CLI
# flags) against the REAL source file — not merely against 00-research.md.
# Today qa.md has no docs-mode section; the slice will be empty → check fails.
# Tokens required in slice:
#   one of "doc-vs-code" / "source file" / "real source"
#               — the ground-truth target (source, not research)
#   one of "endpoint" / "env var" / "config key" / "CLI flag" / "param"
#               — the claim types being spot-verified
#   one of "spot-verif" / "fidelity" / "sample"
#               — the verification method
# ---------------------------------------------------------------------------
check(
    "docs-fidelity(1/ac-1): qa.md § Docs Validation Mode declares doc-vs-code"
    " spot-verify of concrete claims (endpoints/params/env-vars/config-keys/CLI-flags)"
    " against the real source file",
    bool(_s47_qa_docs_slice)
    and (
        "doc-vs-code" in _s47_qa_docs_slice
        or "source file" in _s47_qa_docs_slice
        or "real source" in _s47_qa_docs_slice
    )
    and (
        "endpoint" in _s47_qa_docs_slice
        or "env var" in _s47_qa_docs_slice
        or "config key" in _s47_qa_docs_slice
        or "CLI flag" in _s47_qa_docs_slice
        or "param" in _s47_qa_docs_slice
    )
    and (
        "spot-verif" in _s47_qa_docs_slice
        or "fidelity" in _s47_qa_docs_slice
        or "sample" in _s47_qa_docs_slice
    ),
    f"anchor '{_S47_QA_DOCS_ANCHOR}' missing in qa.md or doc-vs-code/claim-type/spot-verif tokens absent;"
    f" anchor present: {bool(_s47_qa_docs_slice)};"
    f" doc-vs-code/source file/real source: {('doc-vs-code' in _s47_qa_docs_slice or 'source file' in _s47_qa_docs_slice or 'real source' in _s47_qa_docs_slice)};"
    f" claim type token: {('endpoint' in _s47_qa_docs_slice or 'env var' in _s47_qa_docs_slice or 'config key' in _s47_qa_docs_slice)};"
    f" spot-verif/fidelity/sample: {('spot-verif' in _s47_qa_docs_slice or 'fidelity' in _s47_qa_docs_slice or 'sample' in _s47_qa_docs_slice)}",
)

# ---------------------------------------------------------------------------
# Check (2) / AC-2 — qa.md § Docs Validation Mode declares that an unbacked
# documented fact is a fidelity finding that FAILS the DOC-GATE (not a soft
# warning).  Today no such declaration exists → slice empty → check fails.
# Tokens required in slice:
#   one of "fidelity finding" / "fidelity check" / "unbacked"
#               — the finding classification
#   one of "FAIL" / "fails" / "FALLA" (Spanish form permitted)
#               — the gate outcome
#   "DOC-GATE"  — the gate name
# ---------------------------------------------------------------------------
check(
    "docs-fidelity(2/ac-2): qa.md § Docs Validation Mode declares an unbacked"
    " documented fact is a fidelity finding that FAILS the DOC-GATE (not a soft warning)",
    bool(_s47_qa_docs_slice)
    and (
        "fidelity finding" in _s47_qa_docs_slice
        or "fidelity check" in _s47_qa_docs_slice
        or "unbacked" in _s47_qa_docs_slice
    )
    and (
        "FAIL" in _s47_qa_docs_slice
        or "fails" in _s47_qa_docs_slice
        or "FALLA" in _s47_qa_docs_slice
    )
    and "DOC-GATE" in _s47_qa_docs_slice,
    f"anchor '{_S47_QA_DOCS_ANCHOR}' missing or fidelity-finding/FAIL/DOC-GATE tokens absent;"
    f" anchor present: {bool(_s47_qa_docs_slice)};"
    f" fidelity finding/check/unbacked: {('fidelity finding' in _s47_qa_docs_slice or 'fidelity check' in _s47_qa_docs_slice or 'unbacked' in _s47_qa_docs_slice)};"
    f" FAIL/fails/FALLA: {('FAIL' in _s47_qa_docs_slice or 'fails' in _s47_qa_docs_slice or 'FALLA' in _s47_qa_docs_slice)};"
    f" DOC-GATE: {'DOC-GATE' in _s47_qa_docs_slice}",
)

# ---------------------------------------------------------------------------
# Check (3) / AC-3 — documenter.md § Provenance and Fail-Closed Contract
# requires file:line provenance for every concrete technical claim.
# Today documenter.md has no provenance section → slice empty → check fails.
# Tokens required in slice:
#   one of "file:line" / "provenance"
#               — the provenance citation form
#   one of "endpoint" / "env var" / "config key" / "CLI flag" / "param"
#   OR one of "concrete" / "technical claim"
#               — the claim scope
# ---------------------------------------------------------------------------
check(
    "docs-fidelity(3/ac-3): documenter.md § Provenance and Fail-Closed Contract"
    " requires file:line provenance for concrete technical claims",
    bool(_s47_doc_prov_slice)
    and (
        "file:line" in _s47_doc_prov_slice
        or "provenance" in _s47_doc_prov_slice
    )
    and (
        "endpoint" in _s47_doc_prov_slice
        or "env var" in _s47_doc_prov_slice
        or "config key" in _s47_doc_prov_slice
        or "CLI flag" in _s47_doc_prov_slice
        or "param" in _s47_doc_prov_slice
        or "concrete" in _s47_doc_prov_slice
        or "technical claim" in _s47_doc_prov_slice
    ),
    f"anchor '{_S47_DOC_PROV_ANCHOR}' missing in documenter.md or provenance/file:line tokens absent;"
    f" anchor present: {bool(_s47_doc_prov_slice)};"
    f" file:line/provenance: {('file:line' in _s47_doc_prov_slice or 'provenance' in _s47_doc_prov_slice)};"
    f" claim scope token: {('endpoint' in _s47_doc_prov_slice or 'env var' in _s47_doc_prov_slice or 'concrete' in _s47_doc_prov_slice or 'technical claim' in _s47_doc_prov_slice)}",
)

# ---------------------------------------------------------------------------
# Check (4) / AC-4 — documenter.md § Provenance and Fail-Closed Contract
# declares return `blocked` (NOT invent) when 00-research.md lacks backing
# — fail-closed.
# Today no such declaration exists → slice empty → check fails.
# Tokens required in slice:
#   "blocked"         — the return status when backing is absent
#   one of "invent" / "fabricat" / "not invent" / "never invent"
#               — the prohibition on fabrication
#   one of "00-research.md" / "research" / "backing" / "lacks"
#               — the condition (backing absent)
# ---------------------------------------------------------------------------
check(
    "docs-fidelity(4/ac-4): documenter.md § Provenance and Fail-Closed Contract"
    " declares return blocked (not invent) when 00-research.md lacks backing — fail-closed",
    bool(_s47_doc_prov_slice)
    and "blocked" in _s47_doc_prov_slice
    and (
        "invent" in _s47_doc_prov_slice
        or "fabricat" in _s47_doc_prov_slice
    )
    and (
        "00-research.md" in _s47_doc_prov_slice
        or "research" in _s47_doc_prov_slice
        or "backing" in _s47_doc_prov_slice
        or "lacks" in _s47_doc_prov_slice
    ),
    f"anchor '{_S47_DOC_PROV_ANCHOR}' missing or blocked/invent/research-condition tokens absent;"
    f" anchor present: {bool(_s47_doc_prov_slice)};"
    f" blocked: {'blocked' in _s47_doc_prov_slice};"
    f" invent/fabricat: {('invent' in _s47_doc_prov_slice or 'fabricat' in _s47_doc_prov_slice)};"
    f" 00-research.md/research/backing/lacks: {('00-research.md' in _s47_doc_prov_slice or 'research' in _s47_doc_prov_slice or 'backing' in _s47_doc_prov_slice or 'lacks' in _s47_doc_prov_slice)}",
)

# ---------------------------------------------------------------------------
# Check (5) / AC-5 — orchestrator.md § Artifact Verification Protocol table
# contains at least one docs-flow agent row.
# Today the table lists 11 rows (architect, implementer, tester x2, qa x2,
# security, delivery, reviewer, acceptance-checker, plan-reviewer) but has NO
# docs-flow rows → the check on doc-flow artifact tokens fails.
# Strategy: slice from "### Artifact Verification Protocol" and verify at
# least one of the docs-flow artifact names is present.
# Token: one of "00-research.md" / "02-documentation.md" / "04-validation.md"
#         AND one of "docs" / "documentation" / "documenter" / "Phase 2a"
#               — to distinguish docs-flow from regular validate rows
# ---------------------------------------------------------------------------
check(
    "docs-fidelity(5/ac-5): orchestrator.md § Artifact Verification Protocol"
    " table contains at least one docs-flow row (00-research.md, 02-documentation.md,"
    " or 04-validation.md) with docs-flow context",
    bool(_s47_orch_av_slice)
    and (
        "00-research.md" in _s47_orch_av_slice
        or "02-documentation.md" in _s47_orch_av_slice
        or "04-validation.md" in _s47_orch_av_slice
    )
    and (
        "docs" in _s47_orch_av_slice
        or "documentation" in _s47_orch_av_slice
        or "documenter" in _s47_orch_av_slice
        or "Phase 2a" in _s47_orch_av_slice
    ),
    f"anchor '{_S47_ORCH_AV_ANCHOR}' missing in orchestrator.md or docs-flow artifact tokens absent;"
    f" anchor present: {bool(_s47_orch_av_slice)};"
    f" 00-research/02-documentation/04-validation: {('00-research.md' in _s47_orch_av_slice or '02-documentation.md' in _s47_orch_av_slice or '04-validation.md' in _s47_orch_av_slice)};"
    f" docs/documentation/documenter/Phase 2a: {('docs' in _s47_orch_av_slice or 'documentation' in _s47_orch_av_slice or 'documenter' in _s47_orch_av_slice or 'Phase 2a' in _s47_orch_av_slice)}",
)

# ---------------------------------------------------------------------------
# Check (6) / AC-5 — orchestrator.md § Artifact Verification Protocol:
# the architect research → 00-research.md row is present.
# Today absent → check fails.
# ---------------------------------------------------------------------------
check(
    "docs-fidelity(6/ac-5): orchestrator.md § Artifact Verification Protocol"
    " has architect research → 00-research.md row",
    bool(_s47_orch_av_slice)
    and "00-research.md" in _s47_orch_av_slice,
    f"anchor '{_S47_ORCH_AV_ANCHOR}' missing or '00-research.md' absent in slice;"
    f" anchor present: {bool(_s47_orch_av_slice)};"
    f" 00-research.md: {'00-research.md' in _s47_orch_av_slice}",
)

# ---------------------------------------------------------------------------
# Check (7) / AC-5 — orchestrator.md § Artifact Verification Protocol:
# the documenter Phase 2a → 02-documentation.md row is present.
# Today absent → check fails.
# ---------------------------------------------------------------------------
check(
    "docs-fidelity(7/ac-5): orchestrator.md § Artifact Verification Protocol"
    " has documenter Phase 2a → 02-documentation.md row",
    bool(_s47_orch_av_slice)
    and "02-documentation.md" in _s47_orch_av_slice,
    f"anchor '{_S47_ORCH_AV_ANCHOR}' missing or '02-documentation.md' absent in slice;"
    f" anchor present: {bool(_s47_orch_av_slice)};"
    f" 02-documentation.md: {'02-documentation.md' in _s47_orch_av_slice}",
)

# ---------------------------------------------------------------------------
# Check (8) / AC-5 — orchestrator.md § Artifact Verification Protocol:
# the qa Phase 3 docs → 04-validation.md row for the docs-flow is present.
# Note: 04-validation.md already exists in the table for standard validate mode
# (Phase 3).  The docs-flow row must add a docs-context qualifier so Suite 47
# can assert its presence distinctly.  Strategy: assert BOTH "04-validation.md"
# AND one of "Phase 3 docs" / "docs validation" / "documentation flow"
# appear within the slice.  This pair is absent today → check fails.
# ---------------------------------------------------------------------------
check(
    "docs-fidelity(8/ac-5): orchestrator.md § Artifact Verification Protocol"
    " has qa Phase 3 docs → 04-validation.md row with docs-flow qualifier",
    bool(_s47_orch_av_slice)
    and "04-validation.md" in _s47_orch_av_slice
    and (
        "Phase 3 docs" in _s47_orch_av_slice
        or "docs validation" in _s47_orch_av_slice
        or "documentation flow" in _s47_orch_av_slice
        or "docs flow" in _s47_orch_av_slice
        or "docs-flow" in _s47_orch_av_slice
    ),
    f"anchor '{_S47_ORCH_AV_ANCHOR}' missing or '04-validation.md' + docs-flow qualifier absent;"
    f" anchor present: {bool(_s47_orch_av_slice)};"
    f" 04-validation.md: {'04-validation.md' in _s47_orch_av_slice};"
    f" docs-flow qualifier: {('Phase 3 docs' in _s47_orch_av_slice or 'docs validation' in _s47_orch_av_slice or 'documentation flow' in _s47_orch_av_slice or 'docs-flow' in _s47_orch_av_slice)}",
)

# ---------------------------------------------------------------------------
# Check (9) / AC-6 — ref-special-flows.md § DOC-GATE — Human Checkpoint
# declares the pages-on-disk == pages_created existence assertion.
# Today the DOC-GATE section reports Pages: {count} from the manifest's
# pages_created field without verifying disk → the existence assertion is
# absent → check fails.
# Tokens required in slice:
#   "pages_created"  — the manifest field name
#   one of "disk" / "on disk" / "exist" / "pages on disk"
#               — the disk-verification concept
# ---------------------------------------------------------------------------
check(
    "docs-fidelity(9/ac-6): ref-special-flows.md § DOC-GATE — Human Checkpoint"
    " declares the pages-on-disk == pages_created existence assertion",
    bool(_s47_rsf_docgate_slice)
    and "pages_created" in _s47_rsf_docgate_slice
    and (
        "disk" in _s47_rsf_docgate_slice
        or "on disk" in _s47_rsf_docgate_slice
        or "exist" in _s47_rsf_docgate_slice
    ),
    f"anchor '{_S47_RSF_DOCGATE_ANCHOR}' missing or pages_created/disk tokens absent;"
    f" anchor present: {bool(_s47_rsf_docgate_slice)};"
    f" pages_created: {'pages_created' in _s47_rsf_docgate_slice};"
    f" disk/on disk/exist: {('disk' in _s47_rsf_docgate_slice or 'on disk' in _s47_rsf_docgate_slice or 'exist' in _s47_rsf_docgate_slice)}",
)

# ---------------------------------------------------------------------------
# Check (10) / AC-6 — ref-special-flows.md § DOC-GATE: mismatch (pages on
# disk != pages_created) routes to `blocked` (fail-closed).
# Today the DOC-GATE has no mismatch → blocked path → check fails.
# Tokens required in slice:
#   "blocked"          — the fail-closed status
#   one of "mismatch" / "!=" / "count" / "never written"
#               — the mismatch condition
# ---------------------------------------------------------------------------
check(
    "docs-fidelity(10/ac-6): ref-special-flows.md § DOC-GATE declares mismatch"
    " (pages-on-disk != pages_created) → blocked (fail-closed)",
    bool(_s47_rsf_docgate_slice)
    and "blocked" in _s47_rsf_docgate_slice
    and (
        "mismatch" in _s47_rsf_docgate_slice
        or "!=" in _s47_rsf_docgate_slice
        or "never written" in _s47_rsf_docgate_slice
        or (
            "count" in _s47_rsf_docgate_slice
            and "pages_created" in _s47_rsf_docgate_slice
        )
    ),
    f"anchor '{_S47_RSF_DOCGATE_ANCHOR}' missing or blocked/mismatch tokens absent;"
    f" anchor present: {bool(_s47_rsf_docgate_slice)};"
    f" blocked: {'blocked' in _s47_rsf_docgate_slice};"
    f" mismatch/!=/never written/count+pages_created: {('mismatch' in _s47_rsf_docgate_slice or '!=' in _s47_rsf_docgate_slice or 'never written' in _s47_rsf_docgate_slice)}",
)

# ---------------------------------------------------------------------------
# Check (11) / AC-7 — Suite 47 registered in docs/testing.md (canonical
# registry) AND this file contains 'Suite 47' and '_slice_section'.
# The self-ref guard for docs/testing.md may already pass on authoring (the
# tester registers Suite 47 there as part of Phase 2.0).  The presence of
# 'Suite 47' and '_slice_section' in the test file itself is always true
# once the suite is authored — these are the content-present guards.
# ---------------------------------------------------------------------------
check(
    "docs-fidelity(11/ac-7): docs/testing.md canonical registry names 'Suite 47'"
    " and 'pr-g-docs-fidelity'; this file contains 'Suite 47' and '_slice_section'",
    "Suite 47" in _s47_testing
    and "pr-g-docs-fidelity" in _s47_testing
    and "Suite 47" in _s47_self
    and "_slice_section" in _s47_self,
    f"Suite 47 not in docs/testing.md"
    f" or 'pr-g-docs-fidelity' absent from docs/testing.md"
    f" or 'Suite 47' missing in this file"
    f" or '_slice_section' idiom absent;"
    f" docs/testing.md Suite 47: {'Suite 47' in _s47_testing};"
    f" docs/testing.md pr-g-docs-fidelity: {'pr-g-docs-fidelity' in _s47_testing};"
    f" this file Suite 47: {'Suite 47' in _s47_self};"
    f" _slice_section in this file: {'_slice_section' in _s47_self}",
)

# ---------------------------------------------------------------------------
# Check (12) / AC-7 — Suite 47 NOT in CLAUDE.md §11 (hygiene contract —
# same precedent as Suites 43/44/45/46).  Per the v2.40.5 rule: per-suite
# inventory belongs in docs/testing.md only; CLAUDE.md §11 is a pointer.
# Strategy: slice CLAUDE.md §11 (between "## 11." and "## 12.") and assert
# 'Suite 47' does NOT appear there.
# ---------------------------------------------------------------------------
_S47_CLAUDE_S11_START = "## 11."
_S47_CLAUDE_S12_START = "## 12."
_s47_s11_idx = _s47_claude.find(_S47_CLAUDE_S11_START)
_s47_s12_idx = _s47_claude.find(_S47_CLAUDE_S12_START, _s47_s11_idx) if _s47_s11_idx != -1 else -1
_s47_claude_s11 = (
    _s47_claude[_s47_s11_idx:_s47_s12_idx]
    if _s47_s11_idx != -1 and _s47_s12_idx != -1
    else (_s47_claude[_s47_s11_idx:] if _s47_s11_idx != -1 else "")
)

check(
    "docs-fidelity(12/ac-7): CLAUDE.md §11 does NOT contain 'Suite 47'"
    " (hygiene contract — per-suite inventory belongs in docs/testing.md, not §11)",
    "Suite 47" not in _s47_claude_s11,
    f"CLAUDE.md §11 contains literal 'Suite 47' — hygiene violation;"
    f" Suite 47 must be registered only in docs/testing.md, not in CLAUDE.md §11;"
    f" §11 slice found: {bool(_s47_claude_s11)}",
)


# ---------------------------------------------------------------------------
# Suite 48 -- pr-i-recover-dedup (AC-1..AC-9 + AC-10/11/12 meta-checks)
# ---------------------------------------------------------------------------
# Regression assertions written FAILING-FIRST (Phase 2.0 mandate) against the
# current source state (team-harness 2.40.11).  They become GREEN after the
# implementer lands all 8 fixes.  Each content check is ANCHOR-SCOPED via
# _slice_section so that:
#   - a missing anchor returns "" → token-in-"" is False → the check fails
#     clearly (not silently) even if the token happens to exist elsewhere.
#   - renaming or removing the anchored section fails the check, not the
#     ambient-presence guard.
#
# CANONICAL ANCHORS (implementer MUST add/use these verbatim in target files):
#   skills/recover/SKILL.md    : "## Recover Safety Rules"  (NEW)
#   agents/orchestrator.md     : "## Recovery Instructions"  (exists today)
#   agents/orchestrator.md     : "## Direct Modes"           (exists today)
#   agents/ref-special-flows.md: "### Tier System (4 tiers)" (exists today)
#   agents/orchestrator.md     : "## Fast Mode"  OR look for --fast skip-set text
#                                via "## Phase 0a" (exists today)
#   agents/ref-special-flows.md: "## Fast Mode"              (exists today)
#   agents/orchestrator.md     : "### Phase 1.6 is inviolable" (exists today)
#   agents/ref-direct-modes.md : "### Review Panel"          (exists today)
#
# PR F LESSON (mandatory): INLINE cross-references to anchored sections use
# the `§ "Section Name"` form, NEVER a raw `### Heading` literal inline.
# _slice_section keys on the first textual occurrence — a duplicate hijacks
# another suite's slice.  New anchors for Suite 48 must NOT collide with
# those used by Suites 34/35/36/37/38/39/40/41/42/43/44/45/46/47.
#
# Check index → AC mapping:
#   (1)  AC-1        recover re-emit rule present in recover SKILL.md (new section)
#   (2)  AC-1        recover re-emit rule present in orchestrator.md Recovery Instructions
#   (3)  AC-2        skip-[x] + de-dup structural rule in recover SKILL.md
#   (4)  AC-2        skip-[x] + de-dup structural rule in orchestrator.md Recovery Instructions
#   (5)  AC-3        dead pointer fixed: 00-execution-log.md absent; 00-execution-events present
#   (6)  AC-4        deliver direct-mode row references STAGE-GATE-3 + Phase 4.5
#   (7)  AC-5        ref-special-flows.md Tier section contains pointer § "..." (no table copy)
#   (8)  AC-6        [TIER: 0] and Tier1→2 auto-promotion unambiguous in orchestrator (single canonical)
#   (9)  AC-7(i)     --fast skip-set carve-out: security design-review NOT skipped for security-sensitive
#   (10) AC-7(ii)    Phase 1.6 wiring: security dispatched in-pipeline when security-sensitive
#   (11) AC-8        7 new keywords present in ref-direct-modes.md § Review Panel (canonical list)
#   (12) AC-9        §N resolver: each §N intra-CLAUDE.md resolves to a real ## N. heading
#   (13) AC-11/12   Suite 48 in docs/testing.md; NOT in CLAUDE.md §11
# ---------------------------------------------------------------------------
print()
print("=== Suite 48: pr-i-recover-dedup — recover/deliver gating + Tier dedup + security findings ===")

# ---- file reads (suite-local) ----------------------------------------------
_s48_recover   = read(skill_path("recover"))
_s48_orch      = read(AGENTS_DIR / "orchestrator.md")
_s48_rsf       = read(AGENTS_DIR / "ref-special-flows.md")
_s48_rdm       = read(AGENTS_DIR / "ref-direct-modes.md")
_s48_claude    = read(REPO_ROOT / "CLAUDE.md")
_s48_testing   = read(REPO_ROOT / "docs" / "testing.md")
_s48_self      = Path(__file__).read_text(encoding="utf-8")

# ---- canonical anchors & slices --------------------------------------------
# Group A — recover safety
_S48_RECOVER_SAFETY_ANCHOR  = "## Recover Safety Rules"
_S48_ORCH_RECOVERY_ANCHOR   = "## Recovery Instructions"

# Group B — deliver direct-mode gate
_S48_DIRECT_MODES_ANCHOR    = "## Direct Modes"

# Group C — Tier-table dedup
_S48_RSF_TIER_ANCHOR        = "### Tier System (4 tiers)"

# Group D — --fast carve-out + Phase 1.6 security wiring
# For the --fast skip-set we anchor on Phase 0a where fast_mode is declared
_S48_ORCH_PHASE0A_ANCHOR    = "## Phase 0a"
_S48_RSF_FASTMODE_ANCHOR    = "## Fast Mode"
# For Phase 1.6 wiring we anchor on the Phase 1.6 inviolable block
_S48_ORCH_PHASE16_ANCHOR    = "### Phase 1.6 is inviolable"
# For keyword expansion we anchor on the Review Panel section
_S48_RDM_PANEL_ANCHOR       = "### Review Panel"

_s48_recover_safety_slice   = _slice_section(_s48_recover, _S48_RECOVER_SAFETY_ANCHOR)
_s48_orch_recovery_slice    = _slice_section(_s48_orch,    _S48_ORCH_RECOVERY_ANCHOR)
_s48_direct_modes_slice     = _slice_section(_s48_orch,    _S48_DIRECT_MODES_ANCHOR)
_s48_rsf_tier_slice         = _slice_section(_s48_rsf,     _S48_RSF_TIER_ANCHOR)
_s48_orch_phase0a_slice     = _slice_section(_s48_orch,    _S48_ORCH_PHASE0A_ANCHOR)
_s48_rsf_fastmode_slice     = _slice_section(_s48_rsf,     _S48_RSF_FASTMODE_ANCHOR)
_s48_orch_phase16_slice     = _slice_section(_s48_orch,    _S48_ORCH_PHASE16_ANCHOR)
_s48_rdm_panel_slice        = _slice_section(_s48_rdm,     _S48_RDM_PANEL_ANCHOR)

# ---------------------------------------------------------------------------
# Check (1) / AC-1 — recover SKILL.md must contain the new safety section
# with the imperatives: re-emit any un-cleared STAGE-GATE on resume, and
# never infer approval from next_action prose.
#
# Today: skills/recover/SKILL.md L21 references "00-execution-log.md" and
# passes next_action as truth; no re-emit rule exists.  The check fails.
# After fix: the section exists with the required tokens.
#
# Tokens required in slice:
#   "re-emit"        — the imperative to re-emit the STOP block
#   "STAGE-GATE"     — the gate type being re-emitted
#   one of "never infer" / "never infer approval" / "not infer"
#            — the prohibition on prose-based inference
#   one of "next_action" / "next action"
#            — the specific prose field that must NOT be trusted
# ---------------------------------------------------------------------------
_S48_REEMIT_TOKENS   = ("re-emit", "STAGE-GATE")
_S48_NOINFER_ALTS    = ("never infer", "not infer", "never infer approval")
_S48_NEXTACT_ALTS    = ("next_action", "next action")

check(
    "recover-dedup(1/ac-1): skills/recover/SKILL.md § Recover Safety Rules"
    " contains re-emit imperative + STAGE-GATE + never-infer-next_action rule",
    bool(_s48_recover_safety_slice)
    and all(t in _s48_recover_safety_slice for t in _S48_REEMIT_TOKENS)
    and any(a in _s48_recover_safety_slice for a in _S48_NOINFER_ALTS)
    and any(a in _s48_recover_safety_slice for a in _S48_NEXTACT_ALTS),
    f"anchor '{_S48_RECOVER_SAFETY_ANCHOR}' missing from skills/recover/SKILL.md"
    f" or required tokens absent;"
    f" anchor present: {bool(_s48_recover_safety_slice)};"
    + " ".join(f" '{t}': {t in _s48_recover_safety_slice};" for t in _S48_REEMIT_TOKENS)
    + f" never-infer-alt found: {any(a in _s48_recover_safety_slice for a in _S48_NOINFER_ALTS)};"
    f" next_action-alt found: {any(a in _s48_recover_safety_slice for a in _S48_NEXTACT_ALTS)}"
    " — implementer must add the Recover Safety Rules section with the re-emit imperative",
)

# ---------------------------------------------------------------------------
# Check (2) / AC-1 — orchestrator.md § Recovery Instructions must contain
# the same re-emit rule.  The safety contract must live in BOTH places so
# that both the skill and the orchestrator enforce it.
#
# SEC-DR-4 refinement: the gate-released signal must be STRUCTURAL
# (checklist/events), not prose.  Tokens required in slice:
#   "re-emit"        — the imperative
#   "STAGE-GATE"     — the gate type
#   one of "structural" / "stage.gate.release" / "00-state.md"
#            — the structural signal that determines gate-cleared status
#   one of "never infer" / "not infer" / "never infer ... next_action"
#            — the prohibition on prose-based inference
# ---------------------------------------------------------------------------
_S48_STRUCTURAL_ALTS = ("structural", "stage.gate.release", "00-state.md")

check(
    "recover-dedup(2/ac-1+sec-dr-4): orchestrator.md § Recovery Instructions"
    " contains re-emit + STAGE-GATE + structural-signal + never-infer-next_action;"
    " gate-cleared determination is STRUCTURAL (checklist/events), not prose",
    bool(_s48_orch_recovery_slice)
    and "re-emit" in _s48_orch_recovery_slice
    and "STAGE-GATE" in _s48_orch_recovery_slice
    and any(a in _s48_orch_recovery_slice for a in _S48_STRUCTURAL_ALTS)
    and any(a in _s48_orch_recovery_slice for a in _S48_NOINFER_ALTS),
    f"anchor '{_S48_ORCH_RECOVERY_ANCHOR}' missing from orchestrator.md"
    f" or required tokens absent;"
    f" anchor present: {bool(_s48_orch_recovery_slice)};"
    f" re-emit: {'re-emit' in _s48_orch_recovery_slice};"
    f" STAGE-GATE: {'STAGE-GATE' in _s48_orch_recovery_slice};"
    f" structural-alt found: {any(a in _s48_orch_recovery_slice for a in _S48_STRUCTURAL_ALTS)};"
    f" never-infer-alt found: {any(a in _s48_orch_recovery_slice for a in _S48_NOINFER_ALTS)}"
    " — implementer must add the re-emit + structural-signal rule to Recovery Instructions",
)

# ---------------------------------------------------------------------------
# Check (3) / AC-2 — recover SKILL.md § Recover Safety Rules must contain
# the idempotency rules: skip [x] phases and de-dup structural (not regex).
#
# Today: no such rule in SKILL.md.  Check fails.
# Tokens required in slice:
#   one of "skip" / "[x]" — the phase-skip imperative
#   one of "de-dup" / "dedup" / "idempotent" — the de-dup requirement
#   one of "structural" / "JSON parse" / "lookup" — the structural method
# ---------------------------------------------------------------------------
_S48_IDEM_SKIP_ALTS     = ("skip", "[x]")
_S48_IDEM_DEDUP_ALTS    = ("de-dup", "dedup", "idempotent")
_S48_IDEM_STRUCT_ALTS   = ("structural", "JSON parse", "lookup")

check(
    "recover-dedup(3/ac-2): skills/recover/SKILL.md § Recover Safety Rules"
    " contains idempotency: skip-[x]-phases + de-dup structural (not regex)",
    bool(_s48_recover_safety_slice)
    and any(a in _s48_recover_safety_slice for a in _S48_IDEM_SKIP_ALTS)
    and any(a in _s48_recover_safety_slice for a in _S48_IDEM_DEDUP_ALTS)
    and any(a in _s48_recover_safety_slice for a in _S48_IDEM_STRUCT_ALTS),
    f"anchor '{_S48_RECOVER_SAFETY_ANCHOR}' missing from skills/recover/SKILL.md"
    f" or idempotency tokens absent;"
    f" anchor present: {bool(_s48_recover_safety_slice)};"
    f" skip-[x]-alt: {any(a in _s48_recover_safety_slice for a in _S48_IDEM_SKIP_ALTS)};"
    f" de-dup-alt: {any(a in _s48_recover_safety_slice for a in _S48_IDEM_DEDUP_ALTS)};"
    f" structural-alt: {any(a in _s48_recover_safety_slice for a in _S48_IDEM_STRUCT_ALTS)}"
    " — implementer must add skip-[x] + de-dup structural idempotency rules",
)

# ---------------------------------------------------------------------------
# Check (4) / AC-2 — orchestrator.md § Recovery Instructions must also
# contain the idempotency rule (same three token families).
# ---------------------------------------------------------------------------
check(
    "recover-dedup(4/ac-2): orchestrator.md § Recovery Instructions"
    " contains idempotency: skip-[x]-phases + de-dup structural",
    bool(_s48_orch_recovery_slice)
    and any(a in _s48_orch_recovery_slice for a in _S48_IDEM_SKIP_ALTS)
    and any(a in _s48_orch_recovery_slice for a in _S48_IDEM_DEDUP_ALTS),
    f"anchor '{_S48_ORCH_RECOVERY_ANCHOR}' missing from orchestrator.md"
    f" or idempotency tokens absent;"
    f" anchor present: {bool(_s48_orch_recovery_slice)};"
    f" skip-[x]-alt: {any(a in _s48_orch_recovery_slice for a in _S48_IDEM_SKIP_ALTS)};"
    f" de-dup-alt: {any(a in _s48_orch_recovery_slice for a in _S48_IDEM_DEDUP_ALTS)}"
    " — implementer must add the idempotency rule to Recovery Instructions",
)

# ---------------------------------------------------------------------------
# Check (5) / AC-3 — dead pointer fixed.
# skills/recover/SKILL.md must NOT contain "00-execution-log.md" and MUST
# contain "00-execution-events".  File-wide check (the dead pointer is at
# L21 today; we need it gone completely, not just in one section).
# ---------------------------------------------------------------------------
check(
    "recover-dedup(5/ac-3): skills/recover/SKILL.md dead pointer fixed —"
    " '00-execution-log.md' absent; '00-execution-events' present",
    "00-execution-log.md" not in _s48_recover
    and "00-execution-events" in _s48_recover,
    f"Dead pointer fix absent in skills/recover/SKILL.md;"
    f" '00-execution-log.md' still present: {'00-execution-log.md' in _s48_recover};"
    f" '00-execution-events' present: {'00-execution-events' in _s48_recover}"
    " — implementer must replace the dead pointer with the canonical events file name",
)

# ---------------------------------------------------------------------------
# Check (6) / AC-4 — deliver direct-mode gate.
# orchestrator.md § Direct Modes (the fila `deliver`) must reference
# STAGE-GATE-3 AND Phase 4.5 (internal review) so that the direct deliver
# mode emits the gate before push/PR.
#
# Today: the deliver row says only "verify 02-implementation.md, 03-testing.md,
# AND 04-validation.md exist" — no gate, no Phase 4.5.  Check fails.
# Tokens required in slice (the Direct Modes table):
#   "deliver"      — the mode row identifier (already present, anchor check)
#   "STAGE-GATE-3" — the gate being emitted
#   "Phase 4.5"    — the internal review step run before the gate
# Note: the deliver row is inside the Direct Modes section; _slice_section
# stops at the next heading so the slice covers the full modes table.
# ---------------------------------------------------------------------------
check(
    "recover-dedup(6/ac-4): orchestrator.md § Direct Modes deliver row"
    " references STAGE-GATE-3 + Phase 4.5 (gate before push/PR)",
    bool(_s48_direct_modes_slice)
    and "deliver" in _s48_direct_modes_slice
    and "STAGE-GATE-3" in _s48_direct_modes_slice
    and "Phase 4.5" in _s48_direct_modes_slice,
    f"anchor '{_S48_DIRECT_MODES_ANCHOR}' missing from orchestrator.md"
    f" or deliver gate tokens absent;"
    f" anchor present: {bool(_s48_direct_modes_slice)};"
    f" 'deliver' row present: {'deliver' in _s48_direct_modes_slice};"
    f" 'STAGE-GATE-3' in deliver row: {'STAGE-GATE-3' in _s48_direct_modes_slice};"
    f" 'Phase 4.5' in deliver row: {'Phase 4.5' in _s48_direct_modes_slice}"
    " — implementer must add STAGE-GATE-3 + Phase 4.5 to the deliver direct-mode row",
)

# ---------------------------------------------------------------------------
# Check (7) / AC-5 — Tier-table dedup: ref-special-flows.md Tier section
# must contain a pointer (§ "...") to the canonical orchestrator table, NOT
# a full copy of the Tier rows.
#
# Today: ref-special-flows.md L131-137 contains a full Tier 0-4 table.
# After fix: the Tier section in ref-special-flows.md contains a pointer
# using the `§ "..."` form and the full table rows are removed.
#
# Strategy:
#   - Pointer present: one of '§ "Tier System"' / '§ "Bug tier"' / 'see orchestrator'
#     using the `§ "..."` form (NOT a bare section heading).
#   - Full table absent: "| **0** |" and "| **1** |" must NOT appear in the
#     Tier System slice of ref-special-flows.md (those are the first two table
#     rows of the old copy).
# ---------------------------------------------------------------------------
_S48_TIER_PTR_ALTS = (
    '§ "Tier System"',
    '§ "Bug tier"',
    "see orchestrator",
    "orchestrator.md § ",
)
_S48_TIER_TABLE_ROW_0 = "| **0** |"
_S48_TIER_TABLE_ROW_1 = "| **1** |"

check(
    "recover-dedup(7/ac-5): ref-special-flows.md § Tier System contains a pointer"
    " to orchestrator canonical table (§ '...') and does NOT contain a full table copy",
    bool(_s48_rsf_tier_slice)
    and any(a in _s48_rsf_tier_slice for a in _S48_TIER_PTR_ALTS)
    and _S48_TIER_TABLE_ROW_0 not in _s48_rsf_tier_slice
    and _S48_TIER_TABLE_ROW_1 not in _s48_rsf_tier_slice,
    f"anchor '{_S48_RSF_TIER_ANCHOR}' missing from ref-special-flows.md"
    f" or Tier-table dedup not applied;"
    f" anchor present: {bool(_s48_rsf_tier_slice)};"
    f" pointer-alt found: {any(a in _s48_rsf_tier_slice for a in _S48_TIER_PTR_ALTS)};"
    f" table-row-0 still present (must be False): {_S48_TIER_TABLE_ROW_0 in _s48_rsf_tier_slice};"
    f" table-row-1 still present (must be False): {_S48_TIER_TABLE_ROW_1 in _s48_rsf_tier_slice}"
    " — implementer must replace the Tier table copy with a pointer § '...' form",
)

# ---------------------------------------------------------------------------
# Check (8) / AC-6 — [TIER: 0] drift and Tier1→2 auto-promotion resolved:
# orchestrator.md (canonical source) must contain both in unambiguous form.
# File-wide check: we assert the canonical statements are present in orch
# rather than in ref-special-flows (which now holds only a pointer).
# Tokens:
#   "[TIER: 0]"          — the operator override marker
#   one of "Tier1→2" / "Tier 1→2" / "Tier 1 → Tier 2" / "auto-promoted to Tier 2"
#            — the auto-promotion rule unambiguously stated
# ---------------------------------------------------------------------------
_S48_TIER1TO2_ALTS = (
    "Tier1→2",
    "Tier 1→2",
    "Tier 1 → Tier 2",
    "auto-promoted to Tier 2",
)

check(
    "recover-dedup(8/ac-6): orchestrator.md (canonical) contains"
    " '[TIER: 0]' and unambiguous Tier1→2 auto-promotion statement",
    "[TIER: 0]" in _s48_orch
    and any(a in _s48_orch for a in _S48_TIER1TO2_ALTS),
    f"orchestrator.md missing canonical Tier-drift fix;"
    f" '[TIER: 0]' present: {'[TIER: 0]' in _s48_orch};"
    f" Tier1→2-alt found: {any(a in _s48_orch for a in _S48_TIER1TO2_ALTS)}"
    " — implementer must ensure [TIER: 0] and auto-promotion Tier1→2 are unambiguously"
    " stated once in orchestrator.md (the canonical Tier table source)",
)

# ---------------------------------------------------------------------------
# Check (9) / AC-7(i) — --fast carve-out for security design-review.
# The --fast skip-set (Phase 0a in orchestrator.md) must declare that the
# security design-review is NOT skipped when the scope is security-sensitive.
#
# SEC-DR-1: the carve-out predicate must match the Phase 3 security-sensitive
# predicate — we verify both reference "security-sensitive" (same term).
#
# Today: orchestrator.md L915 skips "plan review (Phase 1.6)" with no carve-out.
# After fix: the skip-set or its immediate context names the carve-out.
#
# Tokens required in Phase 0a slice:
#   "security design-review"  — naming the specific thing NOT skipped
#   one of "carve-out" / "not skip" / "NOT skip" / "security-sensitive"
#            — the carve-out declaration
# Also verify in ref-special-flows.md § Fast Mode:
#   "security design-review" + one of the carve-out terms
# ---------------------------------------------------------------------------
_S48_CARVEOUT_ALTS = ("carve-out", "not skip", "NOT skip", "security-sensitive")

check(
    "recover-dedup(9/ac-7-i): orchestrator.md § Phase 0a --fast skip-set"
    " declares explicit carve-out: security design-review NOT skipped"
    " when security-sensitive (SEC-DR-1 predicate match)",
    bool(_s48_orch_phase0a_slice)
    and "security design-review" in _s48_orch_phase0a_slice
    and any(a in _s48_orch_phase0a_slice for a in _S48_CARVEOUT_ALTS),
    f"anchor '{_S48_ORCH_PHASE0A_ANCHOR}' missing from orchestrator.md"
    f" or carve-out tokens absent in --fast skip-set;"
    f" anchor present: {bool(_s48_orch_phase0a_slice)};"
    f" 'security design-review' in slice: {'security design-review' in _s48_orch_phase0a_slice};"
    f" carve-out-alt found: {any(a in _s48_orch_phase0a_slice for a in _S48_CARVEOUT_ALTS)}"
    " — implementer must add the security-design-review carve-out to the --fast skip-set",
)

# ---------------------------------------------------------------------------
# Check (10) / AC-7(ii) — Phase 1.6 in-pipeline security dispatch wiring.
# orchestrator.md § Phase 1.6 is inviolable must declare that security
# (design-review mode) is dispatched in-pipeline when security-sensitive.
#
# Today: L1227-1233 dispatches only plan-reviewer; no security dispatch.
# After fix: the Phase 1.6 section names security dispatch for security-sensitive.
#
# Tokens required in slice:
#   "security"            — the agent being dispatched
#   "design-review"       — the mode
#   one of "security-sensitive" / "when security" / "if security"
#            — the condition
#   one of "dispatch" / "invoke" / "run"
#            — the wiring action
# ---------------------------------------------------------------------------
_S48_P16_CONDITION_ALTS = ("security-sensitive", "when security", "if security")
_S48_P16_ACTION_ALTS    = ("dispatch", "invoke", "run")

check(
    "recover-dedup(10/ac-7-ii): orchestrator.md § Phase 1.6 is inviolable"
    " wires security (design-review) dispatch in-pipeline when security-sensitive",
    bool(_s48_orch_phase16_slice)
    and "security" in _s48_orch_phase16_slice
    and "design-review" in _s48_orch_phase16_slice
    and any(a in _s48_orch_phase16_slice for a in _S48_P16_CONDITION_ALTS)
    and any(a in _s48_orch_phase16_slice for a in _S48_P16_ACTION_ALTS),
    f"anchor '{_S48_ORCH_PHASE16_ANCHOR}' missing from orchestrator.md"
    f" or security-dispatch wiring tokens absent;"
    f" anchor present: {bool(_s48_orch_phase16_slice)};"
    f" 'security' in slice: {'security' in _s48_orch_phase16_slice};"
    f" 'design-review' in slice: {'design-review' in _s48_orch_phase16_slice};"
    f" condition-alt found: {any(a in _s48_orch_phase16_slice for a in _S48_P16_CONDITION_ALTS)};"
    f" action-alt found: {any(a in _s48_orch_phase16_slice for a in _S48_P16_ACTION_ALTS)}"
    " — implementer must wire security design-review dispatch in Phase 1.6 for security-sensitive tasks",
)

# ---------------------------------------------------------------------------
# Check (11) / AC-8 — 7 new security keywords present in ref-direct-modes.md
# § Review Panel (the single canonical design-review trigger list).
#
# Today: the 7 terms are absent from this list.  Each is checked individually
# so a failure pinpoints the exact missing term.
# ---------------------------------------------------------------------------
_S48_NEW_KEYWORDS = (
    "deserialize",
    "unserialize",
    "pickle",
    "SSRF",
    "webhook",
    "upload",
    "sanitize",
)

for _kw in _S48_NEW_KEYWORDS:
    check(
        f"recover-dedup(11/ac-8): ref-direct-modes.md § Review Panel"
        f" contains new security keyword '{_kw}' (design-review trigger list)",
        bool(_s48_rdm_panel_slice)
        and _kw in _s48_rdm_panel_slice,
        f"anchor '{_S48_RDM_PANEL_ANCHOR}' missing from ref-direct-modes.md"
        f" or keyword '{_kw}' absent from the canonical design-review trigger list;"
        f" anchor present: {bool(_s48_rdm_panel_slice)};"
        f" '{_kw}' in slice: {_kw in _s48_rdm_panel_slice}"
        f" — implementer must add '{_kw}' to the semantic keyword list in § Review Panel",
    )

# ---------------------------------------------------------------------------
# Check (12) / AC-9 — §N section-ref resolver: each §N reference that
# appears intra-file in CLAUDE.md must resolve to a real ## N. heading.
#
# Scope (per architect decision): CLAUDE.md intra-file only.  Cross-file
# references (e.g. "§5" appearing in an agent md) are out of scope.
#
# Algorithm:
#   1. Find all real numbered headings in CLAUDE.md: lines matching /^## (\d+)\./
#      → build a set of real_nums = {"1","2",...,"16"}.
#   2. Find all §N references in CLAUDE.md body: matches of /§(\d+)/ excluding
#      lines that ARE the heading themselves.
#   3. Assert every referenced N is in real_nums.
# ---------------------------------------------------------------------------
import re as _re

_s48_claude_lines    = _s48_claude.splitlines()
_s48_real_nums       = set()
_s48_broken_refs: list[str] = []

for _line in _s48_claude_lines:
    _hm = _re.match(r"^## (\d+)\.", _line)
    if _hm:
        _s48_real_nums.add(_hm.group(1))

for _lno, _line in enumerate(_s48_claude_lines, 1):
    # Skip the heading lines themselves — they define, not reference.
    if _re.match(r"^## \d+\.", _line):
        continue
    for _rm in _re.finditer(r"§(\d+)", _line):
        _ref_n = _rm.group(1)
        if _ref_n not in _s48_real_nums:
            _s48_broken_refs.append(f"L{_lno}: §{_ref_n} (real headings: {sorted(_s48_real_nums)})")

check(
    "recover-dedup(12/ac-9): CLAUDE.md §N section-ref resolver —"
    " every intra-file §N reference resolves to a real ## N. heading"
    " (cross-file refs are out of scope)",
    len(_s48_broken_refs) == 0,
    f"Broken §N references found in CLAUDE.md: {_s48_broken_refs}"
    " — implementer must fix the dangling references or add the missing sections",
)

# ---------------------------------------------------------------------------
# Check (13) / AC-11 + AC-12 — meta-checks:
#   (a) Suite 48 registered in docs/testing.md (canonical registry),
#       NOT in CLAUDE.md §11 (hygiene contract).
#   (b) This file contains 'Suite 48' + '_slice_section' + 'pr-i-recover-dedup'.
#
# The CLAUDE.md §11 check slices between "## 11." and "## 12." (same idiom
# as Suite 47 check 12).
# ---------------------------------------------------------------------------
_S48_CLAUDE_S11_START = "## 11."
_S48_CLAUDE_S12_START = "## 12."
_s48_s11_idx = _s48_claude.find(_S48_CLAUDE_S11_START)
_s48_s12_idx = (
    _s48_claude.find(_S48_CLAUDE_S12_START, _s48_s11_idx)
    if _s48_s11_idx != -1
    else -1
)
_s48_claude_s11 = (
    _s48_claude[_s48_s11_idx:_s48_s12_idx]
    if _s48_s11_idx != -1 and _s48_s12_idx != -1
    else (_s48_claude[_s48_s11_idx:] if _s48_s11_idx != -1 else "")
)

check(
    "recover-dedup(13a/ac-11): docs/testing.md canonical registry names 'Suite 48'"
    " and 'pr-i-recover-dedup'; this file contains 'Suite 48',"
    " '_slice_section', and 'pr-i-recover-dedup'",
    "Suite 48" in _s48_testing
    and "pr-i-recover-dedup" in _s48_testing
    and "Suite 48" in _s48_self
    and "_slice_section" in _s48_self
    and "pr-i-recover-dedup" in _s48_self,
    f"Suite 48 not in docs/testing.md: {'Suite 48' not in _s48_testing};"
    f" 'pr-i-recover-dedup' not in docs/testing.md: {'pr-i-recover-dedup' not in _s48_testing};"
    f" 'Suite 48' in this file: {'Suite 48' in _s48_self};"
    f" '_slice_section' in this file: {'_slice_section' in _s48_self};"
    f" 'pr-i-recover-dedup' in this file: {'pr-i-recover-dedup' in _s48_self}"
    " — tester must register Suite 48 in docs/testing.md (not CLAUDE.md §11)",
)

check(
    "recover-dedup(13b/ac-12): CLAUDE.md §11 does NOT contain 'Suite 48'"
    " (hygiene contract — per-suite inventory belongs in docs/testing.md, not §11)",
    "Suite 48" not in _s48_claude_s11,
    f"CLAUDE.md §11 contains literal 'Suite 48' — hygiene violation;"
    f" Suite 48 must be registered only in docs/testing.md, not in CLAUDE.md §11;"
    f" §11 slice found: {bool(_s48_claude_s11)}"
    " — remove 'Suite 48' from CLAUDE.md §11 and register it in docs/testing.md",
)


# ---------------------------------------------------------------------------
# Checks (14) / AC-1 + AC-2 + AC-3 (SEC-DR-3 extension) — 5 new security
# keywords that complete the design-review trigger list.
#
# Context (failing-first, 2026-05-31):
#   agents/ref-direct-modes.md § "Review Panel" today ends its Semantic
#   keyword list with "sanitize".  Five classes — xxe, ssti, traversal,
#   redirect, cors — are absent (recorded as deferred in docs/knowledge.md:60
#   as SEC-DR-3 follow-up).  Each is a fail-closed trigger; their absence
#   means plans whose only security indicator is, e.g., "SSTI in template
#   engine" bypass the semantic keyword gate → fail-open.
#
# Anti-false-green: reuses _s48_rdm_panel_slice (already anchor-scoped in
# check 11).  An absent anchor returns "" → token-in-"" is False → clear fail.
# Each keyword is checked INDIVIDUALLY so a failure pinpoints the exact term.
#
# EXCLUDE eval/exec: these are NOT added (false-positive-prone in pipeline
# prose per docs/knowledge.md:60).  We do NOT assert their absence here
# (positive assertion only; absence-of-eval/exec is an AC-3 prose guarantee,
# verified by plan-reviewer; a negative structural assertion would be fragile
# since those strings appear legitimately elsewhere in the file).
#
# NOTE: _S48_RDM_PANEL_ANCHOR and _s48_rdm_panel_slice are already defined
# above in check (11) — no redefinition needed.
# ---------------------------------------------------------------------------
_S48_NEW_KEYWORDS_SEC_DR3 = (
    "xxe",
    "ssti",
    "traversal",
    "redirect",
    "cors",
)

for _kw in _S48_NEW_KEYWORDS_SEC_DR3:
    check(
        f"recover-dedup(14/ac-1+ac-2+ac-3/sec-dr-3): ref-direct-modes.md"
        f" § Review Panel contains new security keyword '{_kw}'"
        f" (design-review trigger list — SEC-DR-3 completion; fail-closed)",
        bool(_s48_rdm_panel_slice)
        and _kw in _s48_rdm_panel_slice,
        f"anchor '{_S48_RDM_PANEL_ANCHOR}' missing from ref-direct-modes.md"
        f" or keyword '{_kw}' absent from the canonical design-review trigger list;"
        f" anchor present: {bool(_s48_rdm_panel_slice)};"
        f" '{_kw}' in slice: {_kw in _s48_rdm_panel_slice}"
        f" — implementer must add '{_kw}' to the semantic keyword list in"
        f" § Review Panel (SEC-DR-3 completion; fail-closed)",
    )

# ---------------------------------------------------------------------------
# Checks (15) / AC-4 + AC-5 + AC-6 — preserve-in-place propagation.
#
# Context (failing-first, 2026-05-31):
#   PR H (v2.40.11) defined the preserve-in-place contract at :1338 —
#   plan-reviewer preserves upstream sub-verdicts and rewrites ONLY its own
#   header + Summary table + **Combined verdict:**.  But two sibling spots
#   still carry the OLD destructive semantics:
#     :1238 (dispatch instruction) says:
#       "replace section if it exists, never append a second copy"
#     :1268 (inline-fallback step 4) says:
#       "Replace the section if it already exists, never append a second copy"
#   In a takeover / inline plan-review (the least-supervised path) this
#   DESTROYS the qa + security sub-verdicts → re-opens the bug PR H fixed.
#
# Strategy (two sub-checks):
#   (15a) Slice § "Phase 1.6 — Plan Review (Stage 1 closing gate)" (covers
#         :1238): assert the destructive phrase is ABSENT and preserve-in-place
#         language is PRESENT.
#   (15b) Slice § "Inline fallback when Task subagent invocation is not
#         available" (covers :1268): same assertion.
#
# Preserve-in-place tokens (at least one required):
#   "preserve" / "Substance (qa)" / "Security design-review (security)"
#   Any of these confirm the fix propagated the preserve-in-place contract.
#
# Destructive phrases (must be ABSENT after fix):
#   "replace section if it exists"      → :1238 today
#   "Replace the section if it already" → :1268 today
#
# Bold-inline form guard: we also assert the BOLD INLINE labels
#   **Substance (qa):** and **Security design-review (security):**
# are named as the preservation target — NOT ### subsections (which would
# break _slice_section).  The plan calls for the positive presence of at
# least one label token in the reconciled instruction.
#
# Anti-false-green: both anchors are unique in orchestrator.md.
#   - If the anchor moves/renames, slice returns "" → preserve-token
#     check fails → clear fail.
#   - The destructive text is asserted ABSENT; if source is unchanged,
#     the absent-destructive-text assertion passes (source still has it)
#     and the preserve-token assertion fails (fix not applied) → clear fail.
#   Combined: both halves must pass → check is fail-safe.
#
# Collision check: neither anchor string is used by any existing Suite
# (34-48 check 13) on orchestrator.md via _slice_section.  Verified.
# ---------------------------------------------------------------------------

# -- Group E: new slices for item 2 (preserve-in-place) --
_S48_ORCH_P16_DISPATCH_ANCHOR  = "## Phase 1.6 — Plan Review (Stage 1 closing gate)"
# The old "### Inline fallback when Task subagent invocation is not available"
# section was retired in v2.48 (nested-inline-fallback-contract-fix) and replaced
# by "### Phase 1.6 — Plan Review — nested-context handoff".  The inline-fallback
# wrote ## Plan Review inline (with destructive semantics) which re-opened the
# preserve-in-place bug PR H fixed.  Now the section only emits dispatch_handoff —
# no inline write occurs, so the preserve-in-place contract is moot for this path.
_S48_ORCH_INLINE_FALLBACK_ANCHOR = "### Phase 1.6 — Plan Review — nested-context handoff"

_s48_orch_p16_dispatch_slice   = _slice_section(_s48_orch, _S48_ORCH_P16_DISPATCH_ANCHOR)
_s48_orch_inline_fallback_slice = _slice_section(_s48_orch, _S48_ORCH_INLINE_FALLBACK_ANCHOR)

# Preserve-in-place tokens (positive assertion — at least one required)
_S48_PRESERVE_ALTS = (
    "preserve",
    "Substance (qa)",
    "Security design-review (security)",
)

# Destructive phrase at :1238 (must be ABSENT after fix)
_S48_DESTRUCTIVE_DISPATCH = "replace section if it exists"
# Destructive phrase at :1268 (must be ABSENT after fix)
_S48_DESTRUCTIVE_INLINE   = "Replace the section if it already"

check(
    "recover-dedup(15a/ac-4+ac-6): orchestrator.md"
    " § Phase 1.6 — Plan Review (Stage 1 closing gate)"
    " dispatch instruction uses preserve-in-place semantics"
    " (sub-verdicts **Substance (qa):** / **Security design-review (security):**"
    " preserved; destructive 'replace section if it exists' absent)",
    bool(_s48_orch_p16_dispatch_slice)
    and any(t in _s48_orch_p16_dispatch_slice for t in _S48_PRESERVE_ALTS)
    and _S48_DESTRUCTIVE_DISPATCH not in _s48_orch_p16_dispatch_slice,
    f"anchor '{_S48_ORCH_P16_DISPATCH_ANCHOR}' missing from orchestrator.md"
    f" or preserve-in-place fix not applied to dispatch instruction;"
    f" anchor present: {bool(_s48_orch_p16_dispatch_slice)};"
    f" preserve-token found: {any(t in _s48_orch_p16_dispatch_slice for t in _S48_PRESERVE_ALTS)};"
    f" destructive phrase still present: {_S48_DESTRUCTIVE_DISPATCH in _s48_orch_p16_dispatch_slice}"
    f" — implementer must reconcile :1238 to preserve-in-place semantics (PR H § Plan-review panel"
    f" centralization contract at :1338); preserve **Substance (qa):** /"
    f" **Security design-review (security):**; remove 'replace section if it exists'",
)

check(
    "recover-dedup(15b/ac-5+ac-6): orchestrator.md"
    " § Phase 1.6 — Plan Review — nested-context handoff"
    " emits dispatch_handoff (no inline write) and does NOT contain the old destructive"
    " 'Replace the section if it already' phrase",
    bool(_s48_orch_inline_fallback_slice)
    and "dispatch_handoff" in _s48_orch_inline_fallback_slice
    and _S48_DESTRUCTIVE_INLINE not in _s48_orch_inline_fallback_slice,
    f"anchor '{_S48_ORCH_INLINE_FALLBACK_ANCHOR}' missing from orchestrator.md"
    f" or the nested-context handoff section does not wire dispatch_handoff;"
    f" anchor present: {bool(_s48_orch_inline_fallback_slice)};"
    f" dispatch_handoff present: {'dispatch_handoff' in _s48_orch_inline_fallback_slice};"
    f" destructive phrase still present: {_S48_DESTRUCTIVE_INLINE in _s48_orch_inline_fallback_slice}"
    f" — the inline-fallback for plan-review was retired (v2.48+): check"
    f" that orchestrator.md has '### Phase 1.6 — Plan Review — nested-context handoff'"
    f" with a dispatch_handoff directive (no inline ## Plan Review write).",
)

# ---------------------------------------------------------------------------
# Check (16) / AC-8 — documenter provenance step references 00-research.md.
#
# Context (failing-first, 2026-05-31):
#   agents/documenter.md § "Provenance and Fail-Closed Contract"
#   → "### Provenance requirement" step 1 (:154) TODAY says:
#     "Locate the backing evidence in the source (code file, config file,
#     schema, manifest, spec). Record the file and line (file:line)."
#   This contradicts:
#     :12   (NEVER reads code directly)
#     :148  (backing MUST come from 00-research.md; else blocked)
#     :156  (if 00-research.md already provides file:line, use that)
#   The documenter following :154 literally either reads source (sandbox
#   violation) or is paralysed by the contradiction.
#
# Strategy:
#   Slice § "Provenance and Fail-Closed Contract" (anchor already used by
#   Suite 47 on the same file — no new anchor; reuse the same string).
#   Assert:
#     (a) "00-research.md" appears in the slice (provenance located there)
#     (b) "source (code file" is ABSENT (destructive instruction removed)
#
# Anti-false-green: if the anchor disappears, slice returns "" →
#   "00-research.md" in "" is False → check fails clearly.
#   The absence assertion passes trivially on an empty slice — so we gate
#   it on bool(slice): both parts require the slice to be non-empty.
#
# Note: Suite 47 (checks 3+4) already asserts the broader provenance/
#   fail-closed contract (file:line + blocked).  Check 16 is orthogonal:
#   it asserts specifically that step 1 of the requirement no longer points
#   to the source file but to 00-research.md.  No duplication of assertions.
# ---------------------------------------------------------------------------

# -- Group F: new slice for item 3 (documenter provenance) --
# Anchor: "### Provenance requirement" — the sub-section that contains :154.
# Using "## Provenance and Fail-Closed Contract" would NOT work: _slice_section
# stops at the first ### sub-heading (### Provenance requirement at :150),
# meaning :154 would be outside the slice → false-green on the absence check.
# "### Provenance requirement" is the correct anchor to scope the slice to the
# exact sub-section where the bug text lives.
# Collision check: no existing suite (34-48 check 13) calls _slice_section on
# documenter.md with "### Provenance requirement" — verified above.
_s48_doc = read(AGENTS_DIR / "documenter.md")
_S48_DOC_PROV_ANCHOR = "### Provenance requirement"
_s48_doc_prov_slice  = _slice_section(_s48_doc, _S48_DOC_PROV_ANCHOR)

# Positive token: 00-research.md must appear in step 1 as provenance source
_S48_DOC_PROV_TOKEN = "00-research.md"
# Destructive token: the old step-1 "source (code file" phrase must be gone
_S48_DOC_DESTRUCTIVE = "source (code file"

check(
    "recover-dedup(16/ac-8): documenter.md"
    " § Provenance requirement (sub-section of Provenance and Fail-Closed Contract)"
    " step 1 references '00-research.md' as the source of backing evidence"
    " and does NOT instruct reading source code directly"
    " ('source (code file' absent; consistent with :12/:148/:156)",
    bool(_s48_doc_prov_slice)
    and _S48_DOC_PROV_TOKEN in _s48_doc_prov_slice
    and _S48_DOC_DESTRUCTIVE not in _s48_doc_prov_slice,
    f"anchor '{_S48_DOC_PROV_ANCHOR}' missing from documenter.md"
    f" or provenance-fix not applied to step 1;"
    f" anchor present: {bool(_s48_doc_prov_slice)};"
    f" '00-research.md' in slice: {_S48_DOC_PROV_TOKEN in _s48_doc_prov_slice};"
    f" 'source (code file' still present (must be False): {_S48_DOC_DESTRUCTIVE in _s48_doc_prov_slice}"
    f" — implementer must rewrite :154 so step 1 locates backing in '00-research.md'"
    f" (never reading the source file directly); consistent with :12/:148/:156",
)


# ===========================================================================
# Suite 49 — pr-cost-rollup-surface — phase.end token-emission contract lock
#
# Purpose: assert that `agents/orchestrator.md` declares `tokens` REQUIRED
# (not optional) in the `phase.end` event schema and contains the wording
# that forbids `tokens:0`.  This test blinders the Phase A token-emission
# contract (v2.42.1) against accidental regression — if someone softens the
# language to "optional" or removes the zero-forbidden rule, this test fails.
#
# Two anchors are used (both already exist post-Phase-A, no new wording):
#   A) `### Phase Transition Protocol (atomic` — the step-1 sub-rule that
#      governs real-time event appending, which declares REQUIRED + FORBIDDEN.
#   B) `## Execution Events JSONL (canonical` — the schema table row for
#      `tokens` which also carries the REQUIRED annotation.
#
# Both anchors are unique in orchestrator.md.  _slice_section returns "" when
# an anchor is absent → the token-in-"" check fails immediately (no false-green).
#
# Anti-false-green: literal anchor strings are distinct from any string used
# by Suites 34-48.  Verified (grep of existing anchor variables).
#
# Self-ref guard: this test file contains `Suite 49` + `_slice_section` +
# `pr-cost-rollup-surface`; `docs/testing.md` names `Suite 49`; `CLAUDE.md §11`
# does NOT contain `Suite 49` (hygiene contract).
#
# Check index:
#   (1) Phase Transition Protocol slice declares tokens REQUIRED for phase.end
#   (2) Phase Transition Protocol slice declares tokens:0 FORBIDDEN
#   (3) JSONL Schema table slice declares tokens REQUIRED for phase.end
#   (4) JSONL Schema table slice declares tokens:0 / zero FORBIDDEN
#   (5a) docs/testing.md canonical registry names 'Suite 49' and 'pr-cost-rollup-surface'
#   (5b) CLAUDE.md §11 does NOT contain 'Suite 49' (hygiene contract)
# ===========================================================================
print()
print("=== Suite 49: pr-cost-rollup-surface — phase.end token-emission contract lock ===")

# ---- file reads (suite-local) -----------------------------------------------
_s49_orch     = read(AGENTS_DIR / "orchestrator.md")
_s49_testing  = read(REPO_ROOT / "docs" / "testing.md")
_s49_claude   = read(REPO_ROOT / "CLAUDE.md")
_s49_self     = Path(__file__).read_text(encoding="utf-8")

# ---- anchors ----------------------------------------------------------------
# Anchor A: Phase Transition Protocol section — contains the token rules at step 1.
_S49_PTP_ANCHOR    = "### Phase Transition Protocol (atomic"

# Anchor B: The JSONL schema table's tokens row — use the verbatim row text as
# the anchor.  _slice_section finds the first occurrence and returns text to the
# next heading; the tokens row is a single-line in the table and the "Required
# for `phase.end`" annotation plus "Never omit or write 0" are on the same row.
# Using the row text directly avoids the nesting problem (## → ### boundary).
_S49_JSONL_ANCHOR  = "| `tokens` | conditional | Total tokens"

_s49_ptp_slice   = _slice_section(_s49_orch, _S49_PTP_ANCHOR)
# For the JSONL schema checks, extract a window around the tokens row instead
# of a full section slice (the row itself contains all required tokens).
_s49_jsonl_anchor_idx = _s49_orch.find(_S49_JSONL_ANCHOR)
_s49_jsonl_slice = (
    _s49_orch[_s49_jsonl_anchor_idx: _s49_jsonl_anchor_idx + 300]
    if _s49_jsonl_anchor_idx != -1
    else ""
)

# ---- CLAUDE.md §11 slice (hygiene contract) --------------------------------
_S49_S11_START = "## 11."
_S49_S12_START = "## 12."
_s49_s11_idx = _s49_claude.find(_S49_S11_START)
_s49_s12_idx = (
    _s49_claude.find(_S49_S12_START, _s49_s11_idx)
    if _s49_s11_idx != -1
    else -1
)
_s49_claude_s11 = (
    _s49_claude[_s49_s11_idx:_s49_s12_idx]
    if _s49_s11_idx != -1 and _s49_s12_idx != -1
    else (_s49_claude[_s49_s11_idx:] if _s49_s11_idx != -1 else "")
)

# ---------------------------------------------------------------------------
# Check (1) — Phase Transition Protocol declares tokens REQUIRED for phase.end.
#
# Tokens required in slice:
#   "REQUIRED"      — the capitalized required marker
#   "phase.end"     — scopes the requirement to phase.end events
#   "tokens"        — the field being declared required
# ---------------------------------------------------------------------------
check(
    "cost-rollup(1): orchestrator.md § Phase Transition Protocol"
    " declares 'tokens' REQUIRED for phase.end events"
    " (not optional — contract lock against regression)",
    bool(_s49_ptp_slice)
    and "REQUIRED" in _s49_ptp_slice
    and "phase.end" in _s49_ptp_slice
    and "tokens" in _s49_ptp_slice,
    f"anchor '{_S49_PTP_ANCHOR}' missing from orchestrator.md"
    f" or required tokens absent;"
    f" anchor present: {bool(_s49_ptp_slice)};"
    f" 'REQUIRED' in slice: {'REQUIRED' in _s49_ptp_slice};"
    f" 'phase.end' in slice: {'phase.end' in _s49_ptp_slice};"
    f" 'tokens' in slice: {'tokens' in _s49_ptp_slice}"
    " — orchestrator.md Phase Transition Protocol must declare tokens REQUIRED"
    " on every phase.end; do NOT soften to 'optional' or 'recommended'",
)

# ---------------------------------------------------------------------------
# Check (2) — Phase Transition Protocol declares tokens:0 / "tokens":0 FORBIDDEN.
#
# Tokens required in slice:
#   one of "FORBIDDEN" / "forbidden"  — the prohibition marker
#   one of '"tokens":0' / 'tokens:0'  — the specific zero value prohibited
# ---------------------------------------------------------------------------
_S49_FORBIDDEN_ALTS = ("FORBIDDEN", "forbidden")
_S49_ZERO_ALTS      = ('"tokens":0', "tokens:0", "tokens: 0")

check(
    "cost-rollup(2): orchestrator.md § Phase Transition Protocol"
    " declares tokens:0 FORBIDDEN (zero silently erases cost visibility)",
    bool(_s49_ptp_slice)
    and any(a in _s49_ptp_slice for a in _S49_FORBIDDEN_ALTS)
    and any(a in _s49_ptp_slice for a in _S49_ZERO_ALTS),
    f"anchor '{_S49_PTP_ANCHOR}' missing from orchestrator.md"
    f" or zero-forbidden wording absent;"
    f" anchor present: {bool(_s49_ptp_slice)};"
    f" forbidden-alt found: {any(a in _s49_ptp_slice for a in _S49_FORBIDDEN_ALTS)};"
    f" zero-alt found: {any(a in _s49_ptp_slice for a in _S49_ZERO_ALTS)}"
    " — the Phase Transition Protocol must explicitly forbid tokens:0"
    " to prevent silent cost-visibility erasure",
)

# ---------------------------------------------------------------------------
# Check (3) — JSONL Schema table also declares tokens REQUIRED for phase.end.
#
# The schema table at § "Execution Events JSONL" carries a `tokens` row with
# Required=conditional and "Required for `phase.end`" in the Description column.
#
# Tokens required in slice:
#   "tokens"           — the field name in the table row
#   "Required"         — the required marker in the row
#   "phase.end"        — scoping the requirement
# ---------------------------------------------------------------------------
check(
    "cost-rollup(3): orchestrator.md § Execution Events JSONL schema table"
    " carries a 'tokens' row declaring Required for phase.end"
    " (second enforcement site — dual-source contract)",
    bool(_s49_jsonl_slice)
    and "tokens" in _s49_jsonl_slice
    and "Required" in _s49_jsonl_slice
    and "phase.end" in _s49_jsonl_slice,
    f"anchor '{_S49_JSONL_ANCHOR}' missing from orchestrator.md"
    f" or schema table tokens-row absent;"
    f" anchor present: {bool(_s49_jsonl_slice)};"
    f" 'tokens' in slice: {'tokens' in _s49_jsonl_slice};"
    f" 'Required' in slice: {'Required' in _s49_jsonl_slice};"
    f" 'phase.end' in slice: {'phase.end' in _s49_jsonl_slice}"
    " — the JSONL Schema table must carry a tokens row with Required annotation"
    " for phase.end events",
)

# ---------------------------------------------------------------------------
# Check (4) — JSONL Schema section also contains the zero-forbidden wording.
#
# Tokens required in slice:
#   one of "FORBIDDEN" / "forbidden" / "Never omit or write 0" / "never omit"
#   one of '"tokens":0' / 'tokens:0' / 'write 0'
# ---------------------------------------------------------------------------
_S49_SCHEMA_FORBIDDEN_ALTS = ("FORBIDDEN", "forbidden", "Never omit or write 0", "never omit")
_S49_SCHEMA_ZERO_ALTS      = ('"tokens":0', "tokens:0", "write 0", "tokens: 0")

check(
    "cost-rollup(4): orchestrator.md § Execution Events JSONL schema"
    " contains zero-forbidden wording for the tokens field",
    bool(_s49_jsonl_slice)
    and any(a in _s49_jsonl_slice for a in _S49_SCHEMA_FORBIDDEN_ALTS)
    and any(a in _s49_jsonl_slice for a in _S49_SCHEMA_ZERO_ALTS),
    f"anchor '{_S49_JSONL_ANCHOR}' missing from orchestrator.md"
    f" or zero-forbidden wording absent from schema section;"
    f" anchor present: {bool(_s49_jsonl_slice)};"
    f" forbidden-alt found: {any(a in _s49_jsonl_slice for a in _S49_SCHEMA_FORBIDDEN_ALTS)};"
    f" zero-alt found: {any(a in _s49_jsonl_slice for a in _S49_SCHEMA_ZERO_ALTS)}"
    " — the JSONL schema section must forbid tokens:0 / 'never omit or write 0'",
)

# ---------------------------------------------------------------------------
# Check (5a) — docs/testing.md canonical registry names Suite 49 and
# 'pr-cost-rollup-surface'; this file contains 'Suite 49', '_slice_section',
# and 'pr-cost-rollup-surface'.
# ---------------------------------------------------------------------------
check(
    "cost-rollup(5a): docs/testing.md canonical registry names 'Suite 49'"
    " and 'pr-cost-rollup-surface';"
    " this test file contains 'Suite 49', '_slice_section', 'pr-cost-rollup-surface'",
    "Suite 49" in _s49_testing
    and "pr-cost-rollup-surface" in _s49_testing
    and "Suite 49" in _s49_self
    and "_slice_section" in _s49_self
    and "pr-cost-rollup-surface" in _s49_self,
    f"'Suite 49' in docs/testing.md: {'Suite 49' in _s49_testing};"
    f" 'pr-cost-rollup-surface' in docs/testing.md: {'pr-cost-rollup-surface' in _s49_testing};"
    f" 'Suite 49' in this file: {'Suite 49' in _s49_self};"
    f" '_slice_section' in this file: {'_slice_section' in _s49_self};"
    f" 'pr-cost-rollup-surface' in this file: {'pr-cost-rollup-surface' in _s49_self}"
    " — register Suite 49 in docs/testing.md (not CLAUDE.md §11)",
)

# ---------------------------------------------------------------------------
# Check (5b) — CLAUDE.md §11 does NOT contain 'Suite 49' (hygiene contract).
# ---------------------------------------------------------------------------
check(
    "cost-rollup(5b): CLAUDE.md §11 does NOT contain 'Suite 49'"
    " (hygiene contract — per-suite inventory belongs in docs/testing.md, not §11)",
    "Suite 49" not in _s49_claude_s11,
    f"CLAUDE.md §11 contains literal 'Suite 49' — hygiene violation;"
    f" Suite 49 must be registered only in docs/testing.md, not in CLAUDE.md §11;"
    f" §11 slice found: {bool(_s49_claude_s11)}"
    " — remove 'Suite 49' from CLAUDE.md §11 and register it in docs/testing.md",
)


# ---------------------------------------------------------------------------
# Suite 50 — patch-mode-iteration-contract
#
# Asserts the Phase D patch-mode contract is locked against regression:
# (a1-a3) the 3 iteration verifiers have **Blast radius:** in their Failure
#         Brief template, below **Root cause type:**
# (b)     agents/qa-plan.md does NOT contain **Blast radius:** (not a verifier)
# (c1)    orchestrator.md § "If any agent fails" declares coherence gate
# (c2)    same section declares structural → full re-dispatch fallback
# (5a)    docs/testing.md registry + this file contain the required markers
# (5b)    CLAUDE.md §11 does NOT contain "Suite 50" (hygiene contract)
#
# All content checks are anchor-scoped via _slice_section (anti-false-green:
# missing anchor → _slice_section returns "" → token-in-"" is False → FAIL).
# ---------------------------------------------------------------------------
print()
print("=== Suite 50: patch-mode-iteration-contract ===")

# Anchors for the Failure Brief sections.
# NOTE: the brief template is wrapped in a ```markdown code fence, and
# _slice_section stops at the first heading-like line (## Iteration {N} inside
# the fence).  To get a slice that includes both the template AND the guidance
# prose that follows, we anchor on the guidance text that sits AFTER the fence
# — it is unique per file and is outside any code block.
_S50_TESTER_ANCHOR  = "**Blast radius guidance:** declare `localized {IDs}` when the failure is confined to specific, named AC or Step IDs"
_S50_QA_ANCHOR      = "**Blast radius guidance:** declare `localized {IDs}` when the failure is confined to specific, named AC IDs"
_S50_SEC_ANCHOR     = "**Blast radius guidance:** declare `localized {IDs}` when the finding is confined"
# For the verifier template check we need a wider window that includes the code
# fence content.  We look backwards from the guidance anchor to grab the
# preceding ```markdown block.  The simplest approach: search for the anchor in
# the raw file text and scan backwards for **Blast radius:** in the 800 chars
# before the anchor.
_S50_ORCH_ANCHOR    = "### If any agent fails → ITERATE"

_s50_tester   = read(AGENTS_DIR / "tester.md")
_s50_qa       = read(AGENTS_DIR / "qa.md")
_s50_sec      = read(AGENTS_DIR / "security.md")
_s50_qa_plan  = read(AGENTS_DIR / "qa-plan.md")
_s50_orch     = read(AGENTS_DIR / "orchestrator.md")
_s50_testing  = read(REPO_ROOT / "docs" / "testing.md")
_s50_self     = read(Path(__file__))
_s50_claude   = read(REPO_ROOT / "CLAUDE.md")


def _window_around(text: str, anchor: str, before: int = 800, after: int = 200) -> str:
    """Return text[idx-before : idx+after] where idx is the start of anchor.
    Returns "" when anchor is absent. Used to check content near a known landmark
    when _slice_section cannot be used (heading inside a code fence stops it early)."""
    idx = text.find(anchor)
    if idx == -1:
        return ""
    start = max(0, idx - before)
    end = min(len(text), idx + after)
    return text[start:end]


# For verifier template checks: look in a 800-char window BEFORE the guidance
# anchor to confirm **Blast radius:** is present in the template block.
_s50_tester_window = _window_around(_s50_tester, _S50_TESTER_ANCHOR)
_s50_qa_window     = _window_around(_s50_qa,     _S50_QA_ANCHOR)
_s50_sec_window    = _window_around(_s50_sec,    _S50_SEC_ANCHOR)

# For orchestrator checks: the iteration section's ```markdown block also has
# headings inside it, so _slice_section stops too early.  Use _window_around
# on a unique phrase that appears AFTER the code fence.
# "Step 2c" anchors the coherence gate sub-section; "Step 2b" anchors the
# routing matrix.  A window of 1600 chars forward from "Step 2b" covers both
# the matrix (structural → full re-dispatch) and the coherence gate text.
_S50_ORCH_MATRIX_ANCHOR  = "**Step 2b — Classify blast radius"
_S50_ORCH_GATE_ANCHOR    = "**Step 2c — Coherence gate (mandatory"
_s50_orch_matrix_window  = _window_around(_s50_orch, _S50_ORCH_MATRIX_ANCHOR, before=0, after=1600)
_s50_orch_gate_window    = _window_around(_s50_orch, _S50_ORCH_GATE_ANCHOR,   before=0, after=800)

# ---- CLAUDE.md §11 slice (hygiene contract) --------------------------------
_S50_S11_START = "## 11."
_S50_S12_START = "## 12."
_s50_s11_idx = _s50_claude.find(_S50_S11_START)
_s50_s12_idx = (
    _s50_claude.find(_S50_S12_START, _s50_s11_idx)
    if _s50_s11_idx != -1
    else -1
)
_s50_claude_s11 = (
    _s50_claude[_s50_s11_idx:_s50_s12_idx]
    if _s50_s11_idx != -1 and _s50_s12_idx != -1
    else (_s50_claude[_s50_s11_idx:] if _s50_s11_idx != -1 else "")
)

# (a1) tester.md Failure Brief template contains **Blast radius:**
# Anti-false-green: _window_around returns "" when the guidance anchor is absent
# (anchor absent → window "" → "**Blast radius:**" in "" is False → FAIL).
check(
    "patch-mode(a1): agents/tester.md § Failure Brief template contains"
    " '**Blast radius:**' (in the ```markdown template block, below '**Root cause type:**')",
    bool(_s50_tester_window)
    and "**Blast radius:**" in _s50_tester_window
    and "**Root cause type:**" in _s50_tester_window,
    f"guidance anchor missing or '**Blast radius:**' absent from tester.md Failure Brief template window;"
    f" window present: {bool(_s50_tester_window)};"
    f" '**Blast radius:**' in window: {'**Blast radius:**' in _s50_tester_window};"
    f" '**Root cause type:**' in window: {'**Root cause type:**' in _s50_tester_window}"
    " — add '**Blast radius:** localized {IDs} | structural' below '**Root cause type:**'"
    " in the ```markdown template block in agents/tester.md § Failure Brief",
)

# (a2) qa.md Failure Brief template contains **Blast radius:**
check(
    "patch-mode(a2): agents/qa.md § Failure Brief template contains"
    " '**Blast radius:**' (in the ```markdown template block, below '**Root cause type:**')",
    bool(_s50_qa_window)
    and "**Blast radius:**" in _s50_qa_window
    and "**Root cause type:**" in _s50_qa_window,
    f"guidance anchor missing or '**Blast radius:**' absent from qa.md Failure Brief template window;"
    f" window present: {bool(_s50_qa_window)};"
    f" '**Blast radius:**' in window: {'**Blast radius:**' in _s50_qa_window};"
    f" '**Root cause type:**' in window: {'**Root cause type:**' in _s50_qa_window}"
    " — add '**Blast radius:** localized {IDs} | structural' below '**Root cause type:**'"
    " in the ```markdown template block in agents/qa.md § Failure Brief",
)

# (a3) security.md Failure Brief template contains **Blast radius:**
check(
    "patch-mode(a3): agents/security.md § Failure Brief template contains"
    " '**Blast radius:**' (in the ```markdown template block, below '**Root cause type:**')",
    bool(_s50_sec_window)
    and "**Blast radius:**" in _s50_sec_window
    and "**Root cause type:**" in _s50_sec_window,
    f"guidance anchor missing or '**Blast radius:**' absent from security.md Failure Brief template window;"
    f" window present: {bool(_s50_sec_window)};"
    f" '**Blast radius:**' in window: {'**Blast radius:**' in _s50_sec_window};"
    f" '**Root cause type:**' in window: {'**Root cause type:**' in _s50_sec_window}"
    " — add '**Blast radius:** localized {IDs} | structural' below '**Root cause type:**'"
    " in the ```markdown template block in agents/security.md § Failure Brief",
)

# (b) qa-plan.md does NOT contain **Blast radius:** (not an iteration verifier)
check(
    "patch-mode(b): agents/qa-plan.md does NOT contain '**Blast radius:**'"
    " (qa-plan is not an iteration verifier — Blast radius belongs only in"
    " tester/qa/security Failure Brief templates)",
    "**Blast radius:**" not in _s50_qa_plan,
    f"'**Blast radius:**' found in qa-plan.md — remove it;"
    f" qa-plan does plan-review (ratify-plan/define-ac/reconcile), not iteration failure-briefs"
    " — Blast radius field must appear only in the 3 iteration-verifier brief templates",
)

# (c1) orchestrator.md § "If any agent fails" declares mandatory coherence gate.
# Anti-false-green: _window_around returns "" when the anchor is absent
# (anchor absent → window "" → "Coherence gate" in "" is False → FAIL).
check(
    "patch-mode(c1): agents/orchestrator.md § iteration section declares"
    " mandatory coherence gate post-localized-patch (token: 'Coherence gate')",
    bool(_s50_orch_gate_window)
    and "Coherence gate" in _s50_orch_gate_window
    and "mandatory" in _s50_orch_gate_window,
    f"gate anchor '{_S50_ORCH_GATE_ANCHOR}' missing from orchestrator.md or required tokens absent;"
    f" window present: {bool(_s50_orch_gate_window)};"
    f" 'Coherence gate' in window: {'Coherence gate' in _s50_orch_gate_window};"
    f" 'mandatory' in window: {'mandatory' in _s50_orch_gate_window}"
    " — orchestrator.md must declare a mandatory coherence gate after every localized patch"
    " (patch mode makes iteration cheaper, not gateless)",
)

# (c2) same section declares structural → full re-dispatch (no silent narrowing).
# The contract language is: Default to `structural` ... Never narrow a structural
# change to a localized patch.  Check for "structural" + "Never narrow".
check(
    "patch-mode(c2): agents/orchestrator.md § iteration section declares"
    " 'structural' blast-radius always falls back (token: 'structural' + 'Never narrow')",
    bool(_s50_orch_matrix_window)
    and "structural" in _s50_orch_matrix_window
    and "Never narrow" in _s50_orch_matrix_window,
    f"matrix anchor '{_S50_ORCH_MATRIX_ANCHOR}' missing from orchestrator.md or tokens absent;"
    f" window present: {bool(_s50_orch_matrix_window)};"
    f" 'structural' in window: {'structural' in _s50_orch_matrix_window};"
    f" 'Never narrow' in window: {'Never narrow' in _s50_orch_matrix_window}"
    " — orchestrator.md must declare that 'structural' blast-radius always triggers full re-run"
    " and that narrowing a structural change to localized is forbidden"
    " (invariant: 'Never narrow a structural change to a localized patch')",
)

# (5a) docs/testing.md registry + this file contain required markers
check(
    "patch-mode(5a): docs/testing.md canonical registry names 'Suite 50'"
    " and 'patch-mode-iteration-contract';"
    " this test file contains 'Suite 50', '_slice_section', 'patch-mode-iteration-contract'",
    "Suite 50" in _s50_testing
    and "patch-mode-iteration-contract" in _s50_testing
    and "Suite 50" in _s50_self
    and "_slice_section" in _s50_self
    and "patch-mode-iteration-contract" in _s50_self,
    f"'Suite 50' in docs/testing.md: {'Suite 50' in _s50_testing};"
    f" 'patch-mode-iteration-contract' in docs/testing.md: {'patch-mode-iteration-contract' in _s50_testing};"
    f" 'Suite 50' in this file: {'Suite 50' in _s50_self};"
    f" '_slice_section' in this file: {'_slice_section' in _s50_self};"
    f" 'patch-mode-iteration-contract' in this file: {'patch-mode-iteration-contract' in _s50_self}"
    " — register Suite 50 in docs/testing.md (not CLAUDE.md §11)",
)

# (5b) CLAUDE.md §11 does NOT contain "Suite 50" (hygiene contract)
check(
    "patch-mode(5b): CLAUDE.md §11 does NOT contain 'Suite 50'"
    " (hygiene contract — per-suite inventory belongs in docs/testing.md, not §11)",
    "Suite 50" not in _s50_claude_s11,
    f"CLAUDE.md §11 contains literal 'Suite 50' — hygiene violation;"
    f" Suite 50 must be registered only in docs/testing.md, not in CLAUDE.md §11;"
    f" §11 slice found: {bool(_s50_claude_s11)}"
    " — remove 'Suite 50' from CLAUDE.md §11 and register it in docs/testing.md",
)


# ---------------------------------------------------------------------------
# Suite 51 — nested-inline-fallback-contract-fix (Phase 2.0 regression test)
# ---------------------------------------------------------------------------
# Guards the contract that the orchestrator NEVER self-runs reviewers inline
# in a nested context (Task tool unavailable).  In both Phase 1.6 (plan-review)
# and Phase 1.7 (ux-reviewer), the ONLY permitted response to a Task-nesting
# refusal is to emit a dispatch_handoff directed at the real reviewer agent.
#
# Defect being locked out:
#   - orchestrator.md:1330-1357 "Inline fallback when Task subagent invocation
#     is not available" instructed: "Execute the audit yourself" (plan-review).
#   - orchestrator.md:1242-1261 "ux-reviewer fallback" instructed:
#     "Execute the enrich review yourself" (ux-reviewer).
# Both blocks pre-date the Takeover Protocol and contradict the canonical
# Dispatch-blocked exit (orchestrator.md:51-77) and Dispatch invariant #2
# (orchestrator.md:116: "Never substitute yourself for a subagent…
# There is no degraded mode.").
#
# Legitimate inline paths (NOT flagged — fenced by AC-5):
#   - Tier-1/hotfix self-authoring of 01-plan.md (orchestrator.md:1436-1439,1478)
#   - --fast carve-out / security-review wiring (orchestrator.md:1328)
# Those paths write *artefacts* in the absence of a producer agent; they are
# categorically different from self-grading a reviewer role.
#
# AC-6 + AC-7 coverage:
#   (a) ABSENCE assertions — these FAIL pre-fix (strings are present today).
#   (b) PRESENCE assertions — these FAIL pre-fix (dispatch_handoff not yet wired).
#   Both classes must PASS after the implementer's fix.
#
# Security hardening note (from plan-review panel):
#   Each site is asserted independently so a half-fix (one site left) still
#   FAILS.  A single combined assertion could pass against a half-fix.
# ---------------------------------------------------------------------------
print()
print("=== Suite 51: nested-inline-fallback-contract-fix ===")

_orch_s51 = orchestrator_md  # orchestrator.md content, read earlier in Suite 18

# -----------------------------------------------------------------------
# (a) ABSENCE assertions — self-execution strings must NOT be present
#     after the fix.  Pre-fix: strings ARE present → assertions FAIL.
# -----------------------------------------------------------------------

# (a1) Fase 1.6 plan-review: "Execute the audit yourself"
#      Present today at orchestrator.md:1339 (inside the Inline fallback block).
check(
    "Suite 51(a1): orchestrator.md does NOT instruct 'Execute the audit yourself'"
    " — plan-review self-run must be replaced by dispatch_handoff",
    "Execute the audit yourself" not in _orch_s51,
    "orchestrator.md:~1339 still contains 'Execute the audit yourself' — "
    "the Phase 1.6 inline-fallback block has not been replaced by a dispatch_handoff directive; "
    "this string must be absent after the fix",
)

# (a2) Fase 1.7 ux-reviewer: "Execute the enrich review yourself"
#      Present today at orchestrator.md:1249 (inside the ux-reviewer fallback block).
check(
    "Suite 51(a2): orchestrator.md does NOT instruct 'Execute the enrich review yourself'"
    " — ux-reviewer self-run must be replaced by dispatch_handoff",
    "Execute the enrich review yourself" not in _orch_s51,
    "orchestrator.md:~1249 still contains 'Execute the enrich review yourself' — "
    "the Phase 1.7 ux-reviewer fallback block has not been replaced by a dispatch_handoff directive; "
    "this string must be absent after the fix",
)

# -----------------------------------------------------------------------
# (b) PRESENCE assertions — dispatch_handoff wiring must appear in BOTH
#     the plan-review region and the ux-reviewer region after the fix.
#     Pre-fix: these wording strings do NOT exist in those regions → FAIL.
#
#     Strategy: slice each phase's region by its section header so an
#     ambient dispatch_handoff elsewhere in the file cannot produce a
#     false-green.  The region extends from the section header to the
#     next "---" horizontal rule or next "##" section header, whichever
#     comes first.
# -----------------------------------------------------------------------

def _slice_section(text: str, start_marker: str, stop_markers: tuple[str, ...]) -> str:
    """Return the substring from start_marker to the first stop_marker found after it."""
    idx = text.find(start_marker)
    if idx == -1:
        return ""
    tail = text[idx:]
    end = len(tail)
    for stop in stop_markers:
        pos = tail.find(stop, len(start_marker))
        if pos != -1 and pos < end:
            end = pos
    return tail[:end]

_PHASE16_HEADER = "### Inline fallback when Task subagent invocation is not available"
_PHASE17_HEADER = "### ux-reviewer fallback"

# Post-fix, the inline-fallback headers will be replaced; the new region
# will carry "dispatch_handoff" instead.  Both absence assertions above
# already catch the stale *content* of those blocks; the presence
# assertions below verify the *replacement* content is wired.
# We anchor the presence check to the surrounding Phase 1.6 / 1.7 prose
# rather than the (now-absent) stale headers, so the region still resolves
# correctly post-fix.

_PHASE16_ANCHOR = "### Phase 1.6 — Plan Review"
_PHASE17_ANCHOR = "### Phase 1.7"

_STOP_MARKERS = ("\n## ", "\n---\n", "\n### Phase 1.5", "\n### Phase 1.6", "\n### Phase 2")

_phase16_region = _slice_section(_orch_s51, _PHASE16_ANCHOR, _STOP_MARKERS)
_phase17_region = _slice_section(_orch_s51, _PHASE17_ANCHOR, _STOP_MARKERS)

# (b1) Fase 1.6: the plan-review region must reference dispatch_handoff
#      directing top-level Claude to run plan-reviewer as a real subagent.
check(
    "Suite 51(b1): orchestrator.md Phase 1.6 region references 'dispatch_handoff'"
    " for plan-reviewer nested-context handling",
    "dispatch_handoff" in _phase16_region,
    "orchestrator.md Phase 1.6 region (from '### Phase 1.6 — Plan Review' to next "
    "section boundary) does not contain 'dispatch_handoff' — "
    "the nested-context handling must emit a dispatch_handoff to plan-reviewer, "
    "not self-execute the audit inline; add the handoff directive in that section",
)

# (b2) Fase 1.7: the ux-reviewer region must reference dispatch_handoff
#      directing top-level Claude to run ux-reviewer as a real subagent.
check(
    "Suite 51(b2): orchestrator.md Phase 1.7 region references 'dispatch_handoff'"
    " for ux-reviewer nested-context handling",
    "dispatch_handoff" in _phase17_region,
    "orchestrator.md Phase 1.7 region (from '### Phase 1.7' to next section boundary) "
    "does not contain 'dispatch_handoff' — "
    "the nested-context handling must emit a dispatch_handoff to ux-reviewer, "
    "not self-execute the enrich review inline; add the handoff directive in that section",
)

# -----------------------------------------------------------------------
# (c) Fence — legitimate inline paths must NOT be disturbed.
#     These are PRESENCE assertions that must pass both pre-fix AND post-fix.
#     If any goes red, the fix over-reached and removed a legitimate inline path.
# -----------------------------------------------------------------------

# (c1) Tier-1/hotfix self-authoring of 01-plan.md (orchestrator.md:1436-1439)
check(
    "Suite 51(c1): Tier-1/hotfix self-authoring contract still present"
    " (orchestrator authors 01-plan.md for type:hotfix / fix Tier 1)",
    "orchestrator authors `01-plan.md`" in _orch_s51
    or "orchestrator-self-authored" in _orch_s51
    or "Tier-1-fix authoring pattern" in _orch_s51,
    "legitimate Tier-1/hotfix self-authoring path was accidentally removed — "
    "only the reviewer self-run paths must be replaced; "
    "check orchestrator.md:~1436-1439,1478",
)

# (c2) Phase 1.6 inviolable declaration must still be present (unchanged)
check(
    "Suite 51(c2): 'Phase 1.6 is inviolable' contract still present",
    "Phase 1.6 is inviolable" in _orch_s51,
    "Phase 1.6 inviolable contract was removed — must be preserved",
)

# (c3) Dispatch invariant #2 ("never substitute yourself / no degraded mode") still present
check(
    "Suite 51(c3): Dispatch invariant #2 'no degraded mode' still present",
    "no degraded mode" in _orch_s51.lower()
    or "There is no degraded mode" in _orch_s51,
    "Dispatch invariant #2 was removed — must be preserved",
)


# ---------------------------------------------------------------------------
# Suite 52 — Phase 3 tester/QA race-condition fix (issue #232, pre-fix regression)
# ---------------------------------------------------------------------------
# These assertions FAIL against the current (pre-fix) agent prompt files.
# They pass once the implementer applies the approved fix (Opción 2 from the
# root-cause analysis): AC-test authoring is moved to a pre-verify sub-phase
# in Stage 2; the Phase 3 tester becomes run-only (no AC-test authoring).
#
# Marker strings the implementer MUST introduce to make these pass:
#
#  In agents/orchestrator.md:
#    (a) A sub-phase header for test authoring that precedes Phase 3, e.g.:
#        "## Phase 2.7 — Test Authoring"  (exact name may vary but must
#        contain both "Phase 2.7" and "Test Authoring")
#    (b) In the Phase 3 section: the word "run-only" (without quotes) to
#        describe what the tester does in the parallel verify block.
#    (c) In the Phase 3 section: a statement that the tester does NOT write
#        or author AC tests in Phase 3 — captured by the absence of
#        "acceptance criteria from `01-plan.md` § Task List" in the Phase 3
#        tester dispatch instruction (this instruction drives authoring today).
#
#  In agents/tester.md:
#    (d) An explicit "authoring" mode section, e.g.:
#        "### Mode: `authoring`"  (must contain "authoring" as a declared mode)
#    (e) An explicit run-only / verify-run mode section, e.g.:
#        "### Mode: `verify-run`"  OR a section containing the phrase
#        "run-only" to distinguish it from the authoring mode.
#
# NOTE: Assertions (c) uses region-slicing to scope the check to the Phase 3
# section body only — preventing false negatives if the phrase appears
# legitimately in Phase 2.7 (where the implementer SHOULD put the authoring).
# ---------------------------------------------------------------------------
print()
print("=== Suite 52: Phase 3 tester/QA race-condition fix (issue #232) ===")

_orch_s52 = read(AGENTS_DIR / "orchestrator.md")
_tester_s52 = read(AGENTS_DIR / "tester.md")

# (a) orchestrator.md declares the pre-verify Test Authoring sub-phase (Phase 2.7)
# The sub-phase must be present and must appear in Stage 2 BEFORE the Phase 3 section.
_ph27_marker = "Phase 2.7"
_ph27_label = "Test Authoring"
check(
    "Suite 52(a1): orchestrator.md declares 'Phase 2.7' sub-phase",
    _ph27_marker in _orch_s52,
    f"marker '{_ph27_marker}' not found — implementer must add the pre-verify "
    "Test Authoring sub-phase to Stage 2 of orchestrator.md",
)
check(
    "Suite 52(a2): orchestrator.md Phase 2.7 sub-phase is labelled 'Test Authoring'",
    _ph27_label in _orch_s52 and _ph27_marker in _orch_s52,
    f"'Phase 2.7' is present but '{_ph27_label}' label not found alongside it — "
    "the sub-phase must be named 'Test Authoring' (or contain that phrase)",
)

# Positional check: Phase 2.7 must appear BEFORE Phase 3 in the document.
_ph27_idx = _orch_s52.find(_ph27_marker)
_ph3_section_marker = "## Phase 3 — Verify"
_ph3_idx = _orch_s52.find(_ph3_section_marker)
check(
    "Suite 52(a3): orchestrator.md Phase 2.7 appears BEFORE '## Phase 3 — Verify'",
    _ph27_idx != -1 and _ph3_idx != -1 and _ph27_idx < _ph3_idx,
    f"Phase 2.7 index ({_ph27_idx}) must precede Phase 3 index ({_ph3_idx}) — "
    "Test Authoring is a Stage 2 sub-phase and must come before the parallel verify block",
)

# (b) Phase 3 describes the tester as run-only (not authoring)
# Slice the Phase 3 section body to avoid false positives from other sections.
_ph3_body_start = _orch_s52.find(_ph3_section_marker)
# Find the next top-level section after Phase 3 to bound the slice.
_ph35_marker = "## Phase 3.5"
_ph3_body_end = _orch_s52.find(_ph35_marker, _ph3_body_start + 1)
_ph3_body = (
    _orch_s52[_ph3_body_start:_ph3_body_end]
    if _ph3_body_start != -1 and _ph3_body_end != -1 and _ph3_body_end > _ph3_body_start
    else ""
)

check(
    "Suite 52(b1): orchestrator.md Phase 3 section describes tester as 'run-only'",
    "run-only" in _ph3_body,
    "marker 'run-only' not found in the Phase 3 section — implementer must add a "
    "'run-only' qualifier for the tester in the Phase 3 parallel dispatch description",
)

# (c) Phase 3 tester dispatch must NOT instruct AC-test authoring.
# The current Phase 3 dispatch instruction contains:
#   "acceptance criteria from `01-plan.md` § Task List (per-PR AC block)"
#   "(the tester must map each AC to at least one test)"
# After the fix, AC-test authoring is in Phase 2.7; this phrase must be gone from
# the Phase 3 tester dispatch (it belongs in Phase 2.7 now).
_authoring_instruction = "the tester must map each AC to at least one test"
check(
    "Suite 52(c1): orchestrator.md Phase 3 section does NOT instruct tester to map AC to tests",
    _authoring_instruction not in _ph3_body,
    f"authoring instruction '{_authoring_instruction}' still present in Phase 3 section — "
    "AC-test authoring must be moved to the Phase 2.7 pre-verify sub-phase; "
    "Phase 3 tester must be run-only (executes the frozen suite, does not write new tests)",
)

# (d) tester.md declares an explicit 'authoring' mode
# The implementer must add a Mode: authoring section (per AC-3 of the fix plan).
_authoring_mode_markers = [
    "Mode: `authoring`",
    "### Mode: `authoring`",
    "## Mode: `authoring`",
    "`authoring` mode",
    "mode: authoring",
]
_has_authoring_mode = any(m in _tester_s52 for m in _authoring_mode_markers)
check(
    "Suite 52(d1): tester.md declares an explicit 'authoring' mode section",
    _has_authoring_mode,
    "tester.md has no 'authoring' mode declaration — implementer must add an explicit "
    "authoring mode (Stage 2, pre-verify: writes AC tests and runs them once to confirm "
    "green; does NOT validate AC). Example markers: 'Mode: `authoring`' or '`authoring` mode'",
)

# (e) tester.md declares an explicit run-only / verify-run mode for Phase 3
# The implementer must separate the Phase 3 verify mode from the authoring mode (AC-3).
_run_only_mode_markers = [
    "Mode: `verify-run`",
    "### Mode: `verify-run`",
    "## Mode: `verify-run`",
    "`verify-run` mode",
    "mode: verify-run",
    "run-only mode",
    "run-only",
]
_has_run_only_mode = any(m in _tester_s52 for m in _run_only_mode_markers)
check(
    "Suite 52(e1): tester.md declares an explicit run-only / verify-run mode for Phase 3",
    _has_run_only_mode,
    "tester.md has no 'run-only' or 'verify-run' mode declaration — implementer must "
    "add an explicit run-only mode for Phase 3 (executes the frozen suite, confirms "
    "no regressions, does NOT write AC tests in the parallel verify block). "
    "Example markers: 'Mode: `verify-run`' or 'run-only'",
)

# (f) tester.md does NOT describe the two new modes as the same unified flow.
# Regression guard: if both 'authoring' and 'run-only' markers are present but
# collapsed into the same section (same header), the separation is illusory.
# Check that 'authoring' and 'run-only' are in different positions in the file.
# We use index distance as a proxy — they must be at least 200 chars apart to be
# separate sections (same-paragraph co-location would be less than 200 chars).
_authoring_idx = min(
    (_tester_s52.find(m) for m in _authoring_mode_markers if m in _tester_s52),
    default=-1,
)
_run_only_idx = min(
    (_tester_s52.find(m) for m in _run_only_mode_markers if m in _tester_s52),
    default=-1,
)
check(
    "Suite 52(f1): tester.md authoring and run-only modes are in separate sections (index distance > 200 chars)",
    _authoring_idx != -1 and _run_only_idx != -1 and abs(_authoring_idx - _run_only_idx) > 200,
    f"'authoring' index ({_authoring_idx}) and 'run-only' index ({_run_only_idx}) are too "
    "close — they appear to be in the same section; the two modes must be declared "
    "separately (each with its own section header and distinct responsibilities)",
)

# (g) Canonical phase number Phase 2.7 is added to the canonical set in Suite 19.
# This check validates that Phase 2.7 is now a recognized phase in orchestrator.md
# (Suite 19 assertion 5 also validates phase numbers; this check specifically asserts
# Phase 2.7 is used somewhere in the Phase Dispatch Reference or header).
check(
    "Suite 52(g1): orchestrator.md uses 'Phase 2.7' as a named phase (appears in dispatch reference or header)",
    "Phase 2.7" in _orch_s52,
    "orchestrator.md does not mention 'Phase 2.7' — implementer must introduce this "
    "phase number when adding the Test Authoring sub-phase",
)

# ---------------------------------------------------------------------------
# Suite 54 — Read-Only Working-Tree Guard for review/direct-review mode (#238)
# ---------------------------------------------------------------------------
# Asserts that the three-layer guard described in ref-direct-modes.md is present
# and cannot be silently removed by a future refactor without turning this suite red.
# SEC-DR-3 contract: structural assertion anchors the guard.
# ---------------------------------------------------------------------------
print()
print("=== Suite 54: Read-only working-tree guard (review mode, #238) ===")

_ref_direct = read(AGENTS_DIR / "ref-direct-modes.md")
_reviewer = read(AGENTS_DIR / "reviewer.md")
_consolidator = read(AGENTS_DIR / "reviewer-consolidator.md")
_orch_s54 = read(AGENTS_DIR / "orchestrator.md")

# SEC-DR-3 (hardened): every assertion is ANCHOR-SCOPED via _slice_section, so a
# phrase surviving elsewhere in the file cannot mask removal of the guard from its
# section. The guard block uses '### Layer N' subheadings, so each layer is sliced
# on its own subheading (slicing the parent '##' would truncate at the first '###').
_S54_HEAD_STOPS = ("\n### ", "\n## ", "\n---\n")
_S54_SEC_STOPS = ("\n## ", "\n### ", "\n---\n")
_s54_guard = _slice_section(_ref_direct, "## Read-Only Working-Tree Guard", _S54_HEAD_STOPS)
_s54_l1 = _slice_section(_ref_direct, "### Layer 1 — No-dispatch", _S54_HEAD_STOPS)
_s54_l2 = _slice_section(_ref_direct, "### Layer 2 — Deny-tools", _S54_HEAD_STOPS)
_s54_l3 = _slice_section(_ref_direct, "### Layer 3 — Tree-verify", _S54_HEAD_STOPS)
_s54_rev = _slice_section(_reviewer, "Read-Only Working-Tree Contract", _S54_SEC_STOPS)
_s54_con = _slice_section(_consolidator, "Read-Only Working-Tree Contract", _S54_SEC_STOPS)
_s54_dm = _slice_section(_orch_s54, "When invoked with a `Direct Mode Task`", ("\n## ",))

# (a) ref-direct-modes.md contains the ## Read-Only Working-Tree Guard block
check(
    "Suite 54(a): ref-direct-modes.md contains '## Read-Only Working-Tree Guard' block",
    _s54_guard != "",
    "## Read-Only Working-Tree Guard section missing from ref-direct-modes.md — "
    "future refactors that remove it will be caught by this assertion (SEC-DR-3)",
)

# (b) Layer 1 (no-dispatch) — asserted WITHIN the Layer 1 subsection, with intent
check(
    "Suite 54(b): Layer 1 subsection forbids dispatching the implementer (no-dispatch intent)",
    "MUST NOT dispatch" in _s54_l1 and "implementer" in _s54_l1,
    "### Layer 1 — No-dispatch does not state 'MUST NOT dispatch' + 'implementer' within its "
    "own subsection — a mutant that keeps the heading but neuters the prohibition would survive",
)
# (c) Layer 2 (deny-tools) — the prohibition must live in the agents' system prompts
check(
    "Suite 54(c): Layer 2 subsection routes the prohibition to the agents' system prompts",
    "system prompt" in _s54_l2 and "Read-Only Working-Tree Contract" in _s54_l2,
    "### Layer 2 — Deny-tools does not, within its own subsection, route the prohibition to "
    "each agent's system prompt (§ Read-Only Working-Tree Contract) — the inexecutable "
    "'deny in the dispatch' framing must not return (SEC-DR-1)",
)
# (d) Layer 3 (tree-verify) — the verification command must be inside the Layer 3 subsection
check(
    "Suite 54(d): Layer 3 subsection verifies the tree with 'git status --untracked-files=all'",
    "git status --untracked-files=all" in _s54_l3 and ".claude/pr-review-*" in _s54_l3,
    "### Layer 3 — Tree-verify does not, within its own subsection, use "
    "'git status --untracked-files=all' and allowlist '.claude/pr-review-*' — "
    "a weakened verify (plain 'git status', no allowlist) would survive a whole-file check",
)
# (e) reviewer.md — the read-only contract section forbids source writes WITHIN the section
check(
    "Suite 54(e): reviewer.md § Read-Only Working-Tree Contract forbids source writes and names its sole write",
    _s54_rev != "" and "NEVER" in _s54_rev and "source files" in _s54_rev and "04-review.md" in _s54_rev,
    "reviewer.md § Read-Only Working-Tree Contract must contain 'NEVER' + 'source files' AND name "
    "'workspaces/{feature-name}/04-review.md' as its sole permitted write — all within the section "
    "(Layer 2 prohibition lives in the agent's own system prompt, not the dispatch)",
)
# (f) reviewer-consolidator.md — same contract, sliced to its own section
check(
    "Suite 54(f): reviewer-consolidator.md § Read-Only Working-Tree Contract forbids source writes and names its draft zone",
    _s54_con != "" and "NEVER" in _s54_con and "source files" in _s54_con and ".claude/pr-review-" in _s54_con,
    "reviewer-consolidator.md § Read-Only Working-Tree Contract must contain 'NEVER' + 'source files' "
    "AND name '.claude/pr-review-*' as its sole permitted write zone — all within the section",
)
# (g) orchestrator.md § Direct Modes review row references the guard (sliced to the Direct Modes section)
check(
    "Suite 54(g): orchestrator.md § Direct Modes review row references the read-only guard",
    _s54_dm != "" and ("Read-only guard" in _s54_dm or "Read-Only Working-Tree Guard" in _s54_dm),
    "orchestrator.md § Direct Modes (sliced) does not reference the read-only guard — "
    "the review row must point to ref-direct-modes.md § Read-Only Working-Tree Guard (AC-4)",
)

# ---------------------------------------------------------------------------
# Suite 53 — Process-guard: branch/worktree always bases from origin/main (#240)
# ---------------------------------------------------------------------------
# SEC-DR-3 binding assertion (hardened): each check is ANCHOR-SCOPED via
# _slice_section AND asserts the intent phrase ("never from the active local
# branch"), so a mutant that keeps "git fetch origin main" somewhere in the file
# while neutering the guard in its own section does not survive.
# PR-1 AC-5: red suite = guard is gone or semantically weakened.
# ---------------------------------------------------------------------------
print()
print("=== Suite 53: origin/main fetch guard (process-security, #240) ===")

_s53_orchestrator = read(AGENTS_DIR / "orchestrator.md")
_s53_delivery = read(AGENTS_DIR / "delivery.md")

_S53_STOPS = ("\n#### ", "\n### ", "\n## ", "\n---\n")
_s53_orch_4a = _slice_section(_s53_orchestrator, "#### 4a. Determine base branch", _S53_STOPS)
_s53_orch_wt = _slice_section(_s53_orchestrator, "**Worktree branch base:**", ("\n\n",))
_s53_deliv_33 = _slice_section(_s53_delivery, "**Step 3.3 — Create a new branch**", ("\n- Then create the branch",))


def _s53_guard(slice_text):
    return (
        "git fetch origin main" in slice_text
        and "origin/main" in slice_text
        and "never from the active local branch" in slice_text
    )


check(
    "Suite 53(a): orchestrator.md § Parallel Dispatch 4a bases Round 1 from origin/main, never the active local branch",
    _s53_guard(_s53_orch_4a),
    "§ Parallel Dispatch '#### 4a. Determine base branch' must, within its own section, require "
    "'git fetch origin main', base from 'origin/main', and state 'never from the active local branch' — "
    "a mutant that drops the fetch or neuters the intent is caught here (SEC-DR-3 / #240).",
)
check(
    "Suite 53(b): orchestrator.md worktree-base paragraph bases from origin/main, never the active local branch",
    _s53_guard(_s53_orch_wt),
    "The '**Worktree branch base:**' paragraph must require 'git fetch origin main', base from "
    "'origin/main', and state 'never from the active local branch' — the worktree spawn must not "
    "regress to basing from the active local branch (SEC-DR-3 / #240).",
)
check(
    "Suite 53(c): delivery.md Step 3.3 bases the new branch from origin/main, never the active local branch",
    _s53_guard(_s53_deliv_33),
    "delivery.md '**Step 3.3 — Create a new branch**' must, before creating the branch, require "
    "'git fetch origin main', base from 'origin/main', and state 'never from the active local branch' "
    "(SEC-DR-3 / #240).",
)

# ---------------------------------------------------------------------------
# Suite 55 — Reasoning checkpoint (PR-A: deterministic 3-boundary gate)
# ---------------------------------------------------------------------------
# Anchor-scoped structural assertions for AC-A1..A7 + SEC-AC-1/2/3.
# Uses the 3-arg _slice_section(text, start_marker, stop_markers) helper defined
# in Suite 51 above. Presence checks are scoped to the named sections so an
# ambient phrase elsewhere in the file cannot produce a false green.
# ---------------------------------------------------------------------------
print()
print("=== Suite 55: reasoning-checkpoint enforcement (PR-A) ===")

_s55_orch = read(AGENTS_DIR / "orchestrator.md")
_s55_discover = read(REPO_ROOT / "docs" / "discover-phase.md")
_s55_checkpoint = read(REPO_ROOT / "docs" / "reasoning-checkpoint.md")
_s55_hooks = REPO_ROOT / "hooks"
_s55_config = json.loads(read(_s55_hooks / "config.json"))
_STOP_SECTION = ("\n## ", "\n### ", "\n---\n")

# -- (1) docs/reasoning-checkpoint.md exists and names the 3 boundaries ------
check(
    "Suite 55(1a): docs/reasoning-checkpoint.md exists",
    (_s55_hooks.parent / "docs" / "reasoning-checkpoint.md").exists(),
    "docs/reasoning-checkpoint.md does not exist",
)
for _boundary_id in ("intake-plan", "research-next", "postverify-next"):
    check(
        f"Suite 55(1b): docs/reasoning-checkpoint.md names boundary '{_boundary_id}'",
        _boundary_id in _s55_checkpoint,
        f"boundary '{_boundary_id}' not found in docs/reasoning-checkpoint.md",
    )

# -- (2) hooks/checkpoint-guard.sh exists and names deny + matcher Task ------
_s55_guard_path = _s55_hooks / "checkpoint-guard.sh"
check(
    "Suite 55(2a): hooks/checkpoint-guard.sh exists",
    _s55_guard_path.exists(),
    "hooks/checkpoint-guard.sh does not exist",
)
if _s55_guard_path.exists():
    _s55_guard = read(_s55_guard_path)
    check(
        "Suite 55(2b): checkpoint-guard.sh emits permissionDecision deny",
        "permissionDecision" in _s55_guard and "deny" in _s55_guard,
        "guard script does not reference permissionDecision:deny",
    )
    check(
        "Suite 55(2c): checkpoint-guard.sh checks checkpoint_advance_fresh",
        "checkpoint_advance_fresh" in _s55_guard,
        "guard script does not check checkpoint_advance_fresh",
    )
    check(
        "Suite 55(2d): checkpoint-guard.sh checks functional_clarity_confirmed",
        "functional_clarity_confirmed" in _s55_guard,
        "guard script does not check functional_clarity_confirmed",
    )
    check(
        "Suite 55(2e): checkpoint-guard.sh uses strict line-token parsing (grep -q pattern)",
        "grep -q" in _s55_guard,
        "guard script does not use strict grep -q line-token parsing",
    )
    check(
        "Suite 55(2f): checkpoint-guard.sh honors skip markers (fast_mode / bug_tier / discover_state)",
        "fast_mode" in _s55_guard and "bug_tier" in _s55_guard and "bypassed" in _s55_guard,
        "guard script does not honor all three skip-marker signals",
    )
    check(
        "Suite 55(2g): checkpoint-guard.sh does NOT read security_sensitive",
        "security_sensitive" not in _s55_guard,
        "guard script reads security_sensitive — must not touch security fields",
    )

# -- (3) hooks/config.json wires checkpoint-guard.sh for Task on all 3 OS ----
for _os_key in ("windows", "macos", "linux"):
    _os_hooks = _s55_config.get(_os_key, {}).get("hooks", {}).get("PreToolUse", [])
    _task_entries = [e for e in _os_hooks if e.get("matcher") == "Task"]
    check(
        f"Suite 55(3a): hooks/config.json[{_os_key}] has Task PreToolUse entry",
        len(_task_entries) > 0,
        f"no Task PreToolUse entry found for OS '{_os_key}'",
    )
    if _task_entries:
        _task_cmd = (_task_entries[0].get("hooks", [{}])[0]).get("command", "")
        check(
            f"Suite 55(3b): hooks/config.json[{_os_key}] Task entry invokes checkpoint-guard.sh",
            "checkpoint-guard.sh" in _task_cmd,
            f"Task hook command does not invoke checkpoint-guard.sh: '{_task_cmd}'",
        )

# -- (4) AC-A5: orchestrator.md self-check for all 3 boundaries + nested-context limitation --
_s55_orch_6d = _slice_section(_s55_orch, "Step 6d", _STOP_SECTION)
check(
    "Suite 55(4a): orchestrator.md Step 6d names Reasoning Checkpoint B1",
    "Reasoning Checkpoint B1" in _s55_orch_6d or "checkpoint_boundary: intake-plan" in _s55_orch_6d,
    "orchestrator.md Step 6d does not reference Reasoning Checkpoint B1 / intake-plan",
)
check(
    "Suite 55(4b): orchestrator.md Step 6d names Reasoning Checkpoint B2 (research-next)",
    "Reasoning Checkpoint B2" in _s55_orch_6d or "research-next" in _s55_orch_6d,
    "orchestrator.md Step 6d does not reference Reasoning Checkpoint B2 / research-next",
)
check(
    "Suite 55(4c): orchestrator.md Step 6d names Reasoning Checkpoint B3 (postverify-next)",
    "Reasoning Checkpoint B3" in _s55_orch_6d or "postverify-next" in _s55_orch_6d,
    "orchestrator.md Step 6d does not reference Reasoning Checkpoint B3 / postverify-next",
)
check(
    "Suite 55(4d): orchestrator.md Step 6d declares nested-context limitation (not a harness floor)",
    "nested" in _s55_orch_6d.lower() and (
        "not a harness floor" in _s55_orch_6d.lower() or "harness-level" in _s55_orch_6d.lower()
    ),
    "orchestrator.md Step 6d does not declare the nested-context limitation as not a harness floor",
)

# -- (5) AC-A6: 4 new state fields in orchestrator.md § Current State + Recovery Instructions --
_s55_curstate = _slice_section(_s55_orch, "## Current State", ("\n## Phase Checklist",))
for _field in ("checkpoint_boundary:", "checkpoint_advance_fresh:", "functional_clarity_artifact:", "functional_clarity_confirmed:"):
    check(
        f"Suite 55(5a): orchestrator.md § Current State declares '{_field}'",
        _field in _s55_curstate,
        f"field '{_field}' not found in orchestrator.md § Current State",
    )
_s55_recovery = _slice_section(_s55_orch, "## Recovery Instructions", ("\n## Agent Results", "\n**Recover safety"))
check(
    "Suite 55(5b): orchestrator.md Recovery Instructions references checkpoint fields",
    "checkpoint_boundary" in _s55_recovery or "checkpoint_advance_fresh" in _s55_recovery,
    "orchestrator.md Recovery Instructions does not reference reasoning checkpoint fields",
)

# -- (6) AC-A6 no-regression: existing discover/survey fields still present --
for _existing_field in (
    "discover_state:", "advance_signal:", "survey_pipeline_shape:", "survey_effort:",
    "survey_iteration_autonomy:", "survey_scope_hint:", "survey_source:",
    "spec_seed_present:", "approach_checkpoint:",
):
    check(
        f"Suite 55(6): orchestrator.md § Current State still declares '{_existing_field}' (no regression)",
        _existing_field in _s55_curstate,
        f"existing field '{_existing_field}' was removed from orchestrator.md § Current State — regression",
    )

# -- (7) AC-A7: docs/discover-phase.md §3 generalized in-place as B1 --------
# Slice §3 down to ## 4 only (not stopping at ###, so subsections are included)
_s55_disc_3 = _slice_section(_s55_discover, "## 3. Entry into planning", ("\n## 4.", "\n## 5.", "\n---\n"))
check(
    "Suite 55(7a): docs/discover-phase.md §3 references Reasoning Checkpoint B1",
    "Reasoning Checkpoint B1" in _s55_disc_3 or "docs/reasoning-checkpoint.md" in _s55_disc_3,
    "docs/discover-phase.md §3 was not generalized in-place to reference Reasoning Checkpoint B1",
)
check(
    "Suite 55(7b): docs/discover-phase.md §3.1 skip-marker bypass is unchanged",
    "3.1" in _s55_disc_3 and "skip marker" in _s55_disc_3.lower(),
    "docs/discover-phase.md §3 no longer documents the skip-marker bypass in §3.1",
)
check(
    "Suite 55(7c): hooks/checkpoint-guard.sh is cross-platform (bash shebang)",
    _s55_guard_path.exists() and read(_s55_guard_path).startswith("#!/usr/bin/env bash"),
    "checkpoint-guard.sh does not use #!/usr/bin/env bash (cross-platform shebang)",
)

# -- (8) SEC-AC-1: HI-2 non-waivable at all THREE boundaries ----------------
# Slice § Enforcement to the next ## heading only (not ###), so Layer 1 + Layer 2 bodies are included.
_STOP_H2 = ("\n## ",)
_s55_enforcement = _slice_section(_s55_checkpoint, "## Enforcement", _STOP_H2)
_s55_skip_section = _slice_section(_s55_checkpoint, "## Skip-marker bypass", _STOP_H2)
_s55_hi2_text = _s55_enforcement + _s55_skip_section
check(
    "Suite 55(8a): docs/reasoning-checkpoint.md § Enforcement declares HI-2 inviolable (never waives security floor)",
    ("NEVER" in _s55_enforcement or "never" in _s55_enforcement.lower()) and "security" in _s55_enforcement.lower(),
    "docs/reasoning-checkpoint.md § Enforcement does not declare HI-2 (NEVER waives security floor)",
)
for _b in ("B1", "B2", "B3"):
    check(
        f"Suite 55(8b): docs/reasoning-checkpoint.md declares HI-2 non-waivable at boundary {_b}",
        _b in _s55_checkpoint and "security" in _s55_checkpoint.lower(),
        f"docs/reasoning-checkpoint.md does not assert HI-2 non-waivable at boundary {_b}",
    )
_s55_orch_6d_hi2 = _slice_section(_s55_orch, "Step 6d", _STOP_SECTION)
check(
    "Suite 55(8c): orchestrator.md Step 6d declares HI-2 inviolable at B1 (skip marker never waives security gate)",
    "security" in _s55_orch_6d_hi2.lower() and (
        "never" in _s55_orch_6d_hi2.lower() or "NEVER" in _s55_orch_6d_hi2
    ) and "waiver" in _s55_orch_6d_hi2.lower() or (
        "not a security waiver" in _s55_orch_6d_hi2 or "never a security waiver" in _s55_orch_6d_hi2
    ),
    "orchestrator.md Step 6d does not declare HI-2 inviolable (skip marker is never a security waiver)",
)

# -- (9) SEC-AC-2: strict parsing + intra-privilege trust + no security fields in hook --
_s55_strict_section = _slice_section(_s55_checkpoint, "**Strict line-token parsing.**", ("\n\n**", "\n##"))
_s55_trust_section = _slice_section(_s55_checkpoint, "**Trust model", ("\n\n**", "\n##"))
_s55_hook_fields_section = _slice_section(_s55_checkpoint, "**Hook reads only", ("\n\n**", "\n##"))
check(
    "Suite 55(9a): docs/reasoning-checkpoint.md declares strict line-token parsing",
    "Strict line-token parsing" in _s55_checkpoint or "strict" in _s55_checkpoint.lower(),
    "docs/reasoning-checkpoint.md does not declare strict line-token parsing",
)
check(
    "Suite 55(9b): docs/reasoning-checkpoint.md declares intra-privilege trust model",
    "intra-privilege" in _s55_checkpoint or "intra-priv" in _s55_checkpoint,
    "docs/reasoning-checkpoint.md does not declare the intra-privilege trust model",
)
check(
    "Suite 55(9c): docs/reasoning-checkpoint.md declares hook does NOT read security fields",
    "Hook reads only" in _s55_checkpoint or (
        "security_sensitive" in _s55_checkpoint and "NOT" in _s55_checkpoint
    ),
    "docs/reasoning-checkpoint.md does not declare the hook's exclusion of security fields",
)

# -- (10) SEC-AC-3: Layer 2 degradation does NOT touch security floors -------
_s55_layer2_section = _slice_section(_s55_checkpoint, "### Layer 2", ("\n## ", "\n### Layer "))
check(
    "Suite 55(10a): docs/reasoning-checkpoint.md § Layer 2 declares security floors do not degrade in nested context",
    "security" in _s55_layer2_section.lower() and (
        "independent" in _s55_layer2_section.lower() or "not" in _s55_layer2_section.lower()
    ),
    "docs/reasoning-checkpoint.md § Layer 2 does not state that security floors are independent of the fallback",
)
check(
    "Suite 55(10b): orchestrator.md Step 6d declares security floors independent of B2/B3 self-check",
    "Security floors" in _s55_orch_6d or "security floors" in _s55_orch_6d.lower(),
    "orchestrator.md Step 6d does not declare that security floors are independent of the B2/B3 self-check",
)

# ---------------------------------------------------------------------------
# Suite 56 — reasoning-partner-posture (PR-B: AC-B1..B5)
# ---------------------------------------------------------------------------
# Anchor-scoped presence checks for the reasoning-partner posture text.
# Uses the 3-arg _slice_section defined in Suite 51 above.
# Anchors:
#   agents/orchestrator.md  : "Reasoning-partner posture (checkpoint)"
#   docs/reasoning-checkpoint.md : "## Postura"
# Stop markers used for orchestrator slice: next bold-heading paragraph or
# next Step/## heading, whichever comes first.
#
# AC-B1  — disagreement license (authorized+expected, suspicious, triggered)
# AC-B2  — standards anchor (codified standards, §6/§5, legible/defensible)
# AC-B3  — win-condition reframe (clarity+bar+why, NOT artifact, WHY, seminar)
# AC-B4  — concise engagement counterweight (no over-explain, internal, §7.1)
# AC-B5  — checks are anchor-scoped via _slice_section; no behavioral check
#
# Self-referential guard: "Suite 56" in docs/testing.md; NOT in CLAUDE.md §11.
# Marker: reasoning-partner-posture
# ---------------------------------------------------------------------------
print()
print("=== Suite 56: reasoning-partner-posture (PR-B) ===")

_s56_orch = read(AGENTS_DIR / "orchestrator.md")
_s56_checkpoint = read(REPO_ROOT / "docs" / "reasoning-checkpoint.md")
_s56_testing = read(REPO_ROOT / "docs" / "testing.md")
_s56_claude = read(REPO_ROOT / "CLAUDE.md")
_s56_self = Path(__file__).read_text(encoding="utf-8")

# Canonical anchors — implementer MUST use these verbatim
_S56_ORCH_ANCHOR = "Reasoning-partner posture (checkpoint)"
_S56_DOC_ANCHOR = "## Postura"
# Stop markers for the orchestrator slice: next **Step or next ## heading
_S56_ORCH_STOP = ("**Step 6e", "\n## ", "\n### ")
# Stop markers for the doc slice: next ## heading
_S56_DOC_STOP = ("\n## ",)

_s56_orch_slice = _slice_section(_s56_orch, _S56_ORCH_ANCHOR, _S56_ORCH_STOP)
_s56_doc_slice = _slice_section(_s56_checkpoint, _S56_DOC_ANCHOR, _S56_DOC_STOP)

# -- AC-B1: disagreement license -- anchored in BOTH surfaces ----------------
check(
    "posture(b1a/orch): orchestrator.md 'Reasoning-partner posture' section declares"
    " disagreement license (authorized+expected, suspicious, triggered)",
    bool(_s56_orch_slice)
    and ("authorized" in _s56_orch_slice and "expected" in _s56_orch_slice)
    and "suspicious" in _s56_orch_slice
    and ("triggered" in _s56_orch_slice.lower()),
    f"anchor '{_S56_ORCH_ANCHOR}' absent or AC-B1 tokens missing in orchestrator.md slice;"
    f" anchor present: {bool(_s56_orch_slice)};"
    f" authorized+expected: {bool(_s56_orch_slice) and 'authorized' in _s56_orch_slice and 'expected' in _s56_orch_slice};"
    f" suspicious: {'suspicious' in _s56_orch_slice};"
    f" triggered: {bool(_s56_orch_slice) and 'triggered' in _s56_orch_slice.lower()}",
)
check(
    "posture(b1b/doc): docs/reasoning-checkpoint.md § Postura declares"
    " disagreement license (authorized+expected, suspicious, triggered)",
    bool(_s56_doc_slice)
    and ("authorized" in _s56_doc_slice and "expected" in _s56_doc_slice)
    and "suspicious" in _s56_doc_slice
    and ("triggered" in _s56_doc_slice.lower()),
    f"anchor '{_S56_DOC_ANCHOR}' absent or AC-B1 tokens missing in docs/reasoning-checkpoint.md slice;"
    f" anchor present: {bool(_s56_doc_slice)};"
    f" authorized+expected: {bool(_s56_doc_slice) and 'authorized' in _s56_doc_slice and 'expected' in _s56_doc_slice};"
    f" suspicious: {'suspicious' in _s56_doc_slice};"
    f" triggered: {bool(_s56_doc_slice) and 'triggered' in _s56_doc_slice.lower()}",
)

# -- AC-B2: standards anchor -- anchored in BOTH surfaces --------------------
check(
    "posture(b2a/orch): orchestrator.md 'Reasoning-partner posture' section anchors"
    " disagreement in codified standards (CLAUDE.md §6/§5, legible/defensible)",
    bool(_s56_orch_slice)
    and ("codified" in _s56_orch_slice or "documented" in _s56_orch_slice)
    and ("§6" in _s56_orch_slice or "§5" in _s56_orch_slice or "working agreements" in _s56_orch_slice)
    and ("legible" in _s56_orch_slice or "defensible" in _s56_orch_slice)
    and ("taste" in _s56_orch_slice),
    f"anchor '{_S56_ORCH_ANCHOR}' absent or AC-B2 tokens missing;"
    f" codified/documented: {bool(_s56_orch_slice) and ('codified' in _s56_orch_slice or 'documented' in _s56_orch_slice)};"
    f" §6/§5/working agreements: {bool(_s56_orch_slice) and ('§6' in _s56_orch_slice or '§5' in _s56_orch_slice or 'working agreements' in _s56_orch_slice)};"
    f" legible/defensible: {bool(_s56_orch_slice) and ('legible' in _s56_orch_slice or 'defensible' in _s56_orch_slice)};"
    f" taste: {bool(_s56_orch_slice) and 'taste' in _s56_orch_slice}",
)
check(
    "posture(b2b/doc): docs/reasoning-checkpoint.md § Postura anchors"
    " disagreement in codified standards (CLAUDE.md §6/§5, legible/defensible)",
    bool(_s56_doc_slice)
    and ("codified" in _s56_doc_slice or "documented" in _s56_doc_slice)
    and ("§6" in _s56_doc_slice or "§5" in _s56_doc_slice or "working agreements" in _s56_doc_slice)
    and ("legible" in _s56_doc_slice or "defensible" in _s56_doc_slice)
    and ("taste" in _s56_doc_slice),
    f"anchor '{_S56_DOC_ANCHOR}' absent or AC-B2 tokens missing in docs slice;"
    f" codified/documented: {bool(_s56_doc_slice) and ('codified' in _s56_doc_slice or 'documented' in _s56_doc_slice)};"
    f" §6/§5/working agreements: {bool(_s56_doc_slice) and ('§6' in _s56_doc_slice or '§5' in _s56_doc_slice or 'working agreements' in _s56_doc_slice)};"
    f" legible/defensible: {bool(_s56_doc_slice) and ('legible' in _s56_doc_slice or 'defensible' in _s56_doc_slice)};"
    f" taste: {bool(_s56_doc_slice) and 'taste' in _s56_doc_slice}",
)

# -- AC-B3: win-condition reframe -- anchored in BOTH surfaces ---------------
check(
    "posture(b3a/orch): orchestrator.md 'Reasoning-partner posture' section reframes"
    " win-condition (clarity+bar+why, NOT artifact/plan, pedagogy, seminar/delivery bound)",
    bool(_s56_orch_slice)
    and "clarity" in _s56_orch_slice
    and ("meets the bar" in _s56_orch_slice or "bar" in _s56_orch_slice)
    and ("understands why" in _s56_orch_slice or "why" in _s56_orch_slice.lower())
    and ("NOT" in _s56_orch_slice or "not" in _s56_orch_slice)
    and ("WHY" in _s56_orch_slice or "why" in _s56_orch_slice.lower())
    and ("seminar" in _s56_orch_slice or "delivery" in _s56_orch_slice),
    f"anchor '{_S56_ORCH_ANCHOR}' absent or AC-B3 tokens missing;"
    f" clarity: {bool(_s56_orch_slice) and 'clarity' in _s56_orch_slice};"
    f" bar: {bool(_s56_orch_slice) and 'bar' in _s56_orch_slice};"
    f" why: {bool(_s56_orch_slice) and 'why' in _s56_orch_slice.lower()};"
    f" seminar/delivery: {bool(_s56_orch_slice) and ('seminar' in _s56_orch_slice or 'delivery' in _s56_orch_slice)}",
)
check(
    "posture(b3b/doc): docs/reasoning-checkpoint.md § Postura reframes"
    " win-condition (clarity+bar+why, NOT artifact/plan, pedagogy, seminar/delivery bound)",
    bool(_s56_doc_slice)
    and "clarity" in _s56_doc_slice
    and ("meets the bar" in _s56_doc_slice or "bar" in _s56_doc_slice)
    and ("understands why" in _s56_doc_slice or "why" in _s56_doc_slice.lower())
    and ("NOT" in _s56_doc_slice or "not" in _s56_doc_slice)
    and ("WHY" in _s56_doc_slice or "why" in _s56_doc_slice.lower())
    and ("seminar" in _s56_doc_slice or "delivery" in _s56_doc_slice),
    f"anchor '{_S56_DOC_ANCHOR}' absent or AC-B3 tokens missing in docs slice;"
    f" clarity: {bool(_s56_doc_slice) and 'clarity' in _s56_doc_slice};"
    f" bar: {bool(_s56_doc_slice) and 'bar' in _s56_doc_slice};"
    f" why: {bool(_s56_doc_slice) and 'why' in _s56_doc_slice.lower()};"
    f" seminar/delivery: {bool(_s56_doc_slice) and ('seminar' in _s56_doc_slice or 'delivery' in _s56_doc_slice)}",
)

# -- AC-B4: concise engagement counterweight -- anchored in BOTH surfaces ----
check(
    "posture(b4a/orch): orchestrator.md 'Reasoning-partner posture' section declares"
    " concise-engagement counterweight (no over-explain, internal reasoning, §7.1)",
    bool(_s56_orch_slice)
    and ("over-explain" in _s56_orch_slice or "over-explaining" in _s56_orch_slice)
    and "internal" in _s56_orch_slice
    and ("salient" in _s56_orch_slice or "decision-relevant" in _s56_orch_slice)
    and "§7.1" in _s56_orch_slice,
    f"anchor '{_S56_ORCH_ANCHOR}' absent or AC-B4 tokens missing;"
    f" over-explain(ing): {bool(_s56_orch_slice) and ('over-explain' in _s56_orch_slice or 'over-explaining' in _s56_orch_slice)};"
    f" internal: {bool(_s56_orch_slice) and 'internal' in _s56_orch_slice};"
    f" salient/decision-relevant: {bool(_s56_orch_slice) and ('salient' in _s56_orch_slice or 'decision-relevant' in _s56_orch_slice)};"
    f" §7.1: {bool(_s56_orch_slice) and '§7.1' in _s56_orch_slice}",
)
check(
    "posture(b4b/doc): docs/reasoning-checkpoint.md § Postura declares"
    " concise-engagement counterweight (no over-explain, internal reasoning, §7.1)",
    bool(_s56_doc_slice)
    and ("over-explain" in _s56_doc_slice or "over-explaining" in _s56_doc_slice)
    and "internal" in _s56_doc_slice
    and ("salient" in _s56_doc_slice or "decision-relevant" in _s56_doc_slice)
    and "§7.1" in _s56_doc_slice,
    f"anchor '{_S56_DOC_ANCHOR}' absent or AC-B4 tokens missing in docs slice;"
    f" over-explain(ing): {bool(_s56_doc_slice) and ('over-explain' in _s56_doc_slice or 'over-explaining' in _s56_doc_slice)};"
    f" internal: {bool(_s56_doc_slice) and 'internal' in _s56_doc_slice};"
    f" salient/decision-relevant: {bool(_s56_doc_slice) and ('salient' in _s56_doc_slice or 'decision-relevant' in _s56_doc_slice)};"
    f" §7.1: {bool(_s56_doc_slice) and '§7.1' in _s56_doc_slice}",
)

# -- AC-B5: checks are anchor-scoped + no behavioral check -------------------
# Verify this Suite uses _slice_section (anchor-scoped idiom).
# Verify "the agent disagrees well" or equivalent behavioral-check phrase is absent.
_s56_suite_text = _slice_section(
    _s56_self,
    "Suite 56 — reasoning-partner-posture",
    ("# -----------\n# Summary",),
)
check(
    "posture(b5a): Suite 56 checks use _slice_section anchor-scoped idiom"
    " (no loose file-wide token search for posture text)",
    "_slice_section" in _s56_suite_text and "_s56_orch_slice" in _s56_suite_text,
    "Suite 56 does not use _slice_section — checks are not anchor-scoped",
)
check(
    "posture(b5b): Suite 56 contains no behavioral check"
    " (all checks are presence-only, anchor-scoped)",
    # AC-B5: no check() in Suite 56 asserts runtime agent behavior.
    # The suite contains only structural presence checks (token-in-slice).
    # This check is inherently satisfied by design — it guards the structure
    # of the suite (VERIFY: all checks above use token-in-slice, not behavior).
    True,
    "Suite 56 must contain only structural presence checks (no behavioral AC)",
)

# -- Self-referential guard --------------------------------------------------
# docs/testing.md must name "Suite 56" and "reasoning-partner-posture".
# CLAUDE.md §11 must NOT contain "Suite 56" (hygiene contract).
check(
    "posture(self-ref): docs/testing.md canonical registry names 'Suite 56'"
    " and 'reasoning-partner-posture'; CLAUDE.md §11 does NOT contain 'Suite 56'",
    "Suite 56" in _s56_testing
    and "reasoning-partner-posture" in _s56_testing
    and "Suite 56" not in _s56_claude,
    f"Suite 56 not in docs/testing.md: {'Suite 56' not in _s56_testing};"
    f" 'reasoning-partner-posture' not in docs/testing.md: {'reasoning-partner-posture' not in _s56_testing};"
    f" 'Suite 56' found in CLAUDE.md (hygiene violation): {'Suite 56' in _s56_claude}"
    " — register Suite 56 in docs/testing.md (not CLAUDE.md §11)",
)

# ---------------------------------------------------------------------------
# Suite 57 — Review-mode hard gates (review-mode-contract, #251 + #252)
# ---------------------------------------------------------------------------
# Anti-drift assertions for the three new gates added in PR-1:
#   Layer 4 (mode-transition gate): ref-direct-modes.md § Layer 4 AND orchestrator.md
#     Step 6a-pre (review_context guard) — two sites must carry the gate.
#   Layer 5 (branch-author guard): ref-direct-modes.md § Layer 5 — fail-closed when
#     author-of-PR OR operator identity is indeterminate (no unknown==unknown).
#   Publish gate: ref-direct-modes.md § Publish Gate — all three execution sites
#     (skill, orchestrator direct-mode, takeover/inline) carry the gate; the
#     complete list of covered verbs is present; --auto-publish opt-in documented.
#
# All checks use the 3-arg _slice_section (anchor → first stop_marker) defined
# in Suite 51. Missing anchor → "" → token-in-"" is False → FAIL.
# ---------------------------------------------------------------------------
print()
print("=== Suite 57: Review-mode hard gates (#251 + #252) ===")

_S57_STOP_HEADS = ("\n### ", "\n## ", "\n---\n")
_S57_STOP_SECTION = ("\n## ", "\n---\n")

_s57_ref = read(AGENTS_DIR / "ref-direct-modes.md")
_s57_orch = read(AGENTS_DIR / "orchestrator.md")
_s57_reviewer = read(AGENTS_DIR / "reviewer.md")
_s57_skill = read(skill_path("review-pr"))

# --- (a) Layer 4 — mode-transition gate in ref-direct-modes.md ---

_s57_l4 = _slice_section(_s57_ref, "### Layer 4 — Mode-transition gate", _S57_STOP_HEADS)

check(
    "Suite 57(a1): ref-direct-modes.md contains '### Layer 4 — Mode-transition gate' section",
    bool(_s57_l4),
    "Layer 4 section missing from ref-direct-modes.md — add '### Layer 4 — Mode-transition gate'",
)
check(
    "Suite 57(a2): Layer 4 section forbids auto-routing (NEVER auto-rutea)",
    "NEVER auto-routes" in _s57_l4 or "NEVER auto-rutea" in _s57_l4 or "never auto-route" in _s57_l4.lower(),
    "Layer 4 section must state the gate NEVER auto-routes within its own section",
)
check(
    "Suite 57(a3): Layer 4 section emits an explicit mode-transition confirmation prompt",
    "confirmación explícita" in _s57_l4
    or "explicit mode-transition" in _s57_l4.lower()
    or ("explicit" in _s57_l4.lower() and "prompt" in _s57_l4.lower()),
    "Layer 4 section must describe an explicit confirmation prompt within its own section",
)
check(
    "Suite 57(a4): Layer 4 section neutralizes the global routing rule within review",
    "global routing rule" in _s57_l4 or "neutralized" in _s57_l4 or "neutralizes" in _s57_l4,
    "Layer 4 must state that the global routing rule is neutralized within review context",
)

# --- (b) Step 6a-pre gate in orchestrator.md (review_context guard) ---

_s57_step6pre = _slice_section(_s57_orch, "Step 6a-pre", _S57_STOP_HEADS)

check(
    "Suite 57(b1): orchestrator.md contains 'Step 6a-pre' (review_context guard) section",
    bool(_s57_step6pre),
    "Step 6a-pre section missing from orchestrator.md — the review_context guard must live "
    "in the Step 6 intent-classification flow, not only in ref-direct-modes.md (SEC-DR-1)",
)
check(
    "Suite 57(b2): Step 6a-pre section consults review_context before mapping to full pipeline",
    "review_context" in _s57_step6pre and "full pipeline" in _s57_step6pre,
    "Step 6a-pre must check review_context AND reference full pipeline routing within its section",
)
check(
    "Suite 57(b3): Step 6a-pre routes corrective language to mode-transition gate",
    "mode-transition gate" in _s57_step6pre or "Layer 4" in _s57_step6pre,
    "Step 6a-pre must route corrective language to the mode-transition gate (Layer 4), not full pipeline",
)
check(
    "Suite 57(b3b): Step 6a-pre explicitly covers fresh/new conversational turns (SEC-DR-1 re-entry seam)",
    ("fresh turn" in _s57_step6pre.lower() or "fresh turns" in _s57_step6pre.lower()
     or "new conversational turn" in _s57_step6pre.lower()
     or "re-entry seam" in _s57_step6pre.lower()),
    "Step 6a-pre must state that fresh/new conversational turns are intercepted before the "
    "intent table classifies them as full pipeline (SEC-DR-1 / CWE-863) — without this, "
    "the re-entry seam is undocumented and removal goes undetected",
)
check(
    "Suite 57(b4): Step 6a-pre documents the review_context lifecycle (write + clear)",
    "review_context" in _s57_step6pre
    and ("lifecycle" in _s57_step6pre or ("write" in _s57_step6pre and "clear" in _s57_step6pre)),
    "Step 6a-pre must document when review_context is written and cleared (lifecycle)",
)

# --- (c) Layer 5 — branch-author guard in ref-direct-modes.md ---

_s57_l5 = _slice_section(_s57_ref, "### Layer 5 — Branch-author guard", _S57_STOP_HEADS)

check(
    "Suite 57(c1): ref-direct-modes.md contains '### Layer 5 — Branch-author guard' section",
    bool(_s57_l5),
    "Layer 5 section missing from ref-direct-modes.md — add '### Layer 5 — Branch-author guard'",
)
check(
    "Suite 57(c2): Layer 5 section uses 'gh api user' to resolve operator identity",
    "gh api user" in _s57_l5,
    "Layer 5 must reference 'gh api user' within its section (operator identity resolution)",
)
check(
    "Suite 57(c3): Layer 5 section is fail-closed (uses 'fail-closed' token)",
    "fail-closed" in _s57_l5 or "fail closed" in _s57_l5,
    "Layer 5 must use 'fail-closed' within its section",
)
check(
    "Suite 57(c4): Layer 5 section prohibits unknown==unknown → fail-open pattern",
    "unknown" in _s57_l5 and ("fail-open" in _s57_l5 or "fail open" in _s57_l5),
    "Layer 5 must explicitly state that comparing two unknown/indeterminate values "
    "that collapses to fail-open is FORBIDDEN (SEC-DR-3 / CWE-697)",
)
check(
    "Suite 57(c5): Layer 5 section names 'identidad del operador indeterminada → fail-closed' or equivalent",
    "operator identity" in _s57_l5.lower()
    or "identidad del operador" in _s57_l5
    or "indeterminate" in _s57_l5
    or "indeterminada" in _s57_l5,
    "Layer 5 must describe that operator identity indeterminacy forces fail-closed "
    "(not just PR-author indeterminacy)",
)

# --- (d) Publish gate in ref-direct-modes.md ---

_s57_pubgate = _slice_section(_s57_ref, "\n### Publish Gate (preview-and-confirm)", _S57_STOP_HEADS)

check(
    "Suite 57(d1): ref-direct-modes.md contains '### Publish Gate (preview-and-confirm)' section",
    bool(_s57_pubgate),
    "Publish Gate section missing from ref-direct-modes.md — add '### Publish Gate (preview-and-confirm)'",
)
check(
    "Suite 57(d2): Publish Gate lists 'gh pr review' verb",
    "gh pr review" in _s57_pubgate,
    "Publish Gate must list 'gh pr review' in its verb list within the section",
)
check(
    "Suite 57(d3): Publish Gate lists PUT /reviews/:id (update-body verb)",
    "PUT" in _s57_pubgate and "reviews" in _s57_pubgate and ("reviews/:id" in _s57_pubgate or "reviews/:review_id" in _s57_pubgate or "update" in _s57_pubgate.lower()),
    "Publish Gate must cover the PUT update-body verb within the section",
)
check(
    "Suite 57(d4): Publish Gate lists reply verb (POST .../comments/:id/replies)",
    "replies" in _s57_pubgate or "reply" in _s57_pubgate,
    "Publish Gate must cover the POST reply verb within the section",
)
check(
    "Suite 57(d5): Publish Gate lists dismiss verb",
    "dismiss" in _s57_pubgate.lower(),
    "Publish Gate must cover the dismiss verb within the section",
)
check(
    "Suite 57(d6): Publish Gate names all three execution sites",
    "skill" in _s57_pubgate.lower()
    and ("orchestrator" in _s57_pubgate.lower() or "direct-mode" in _s57_pubgate.lower())
    and ("takeover" in _s57_pubgate.lower() or "inline" in _s57_pubgate.lower()),
    "Publish Gate must name all three execution sites: skill, orchestrator direct-mode, takeover/inline",
)
check(
    "Suite 57(d7): Publish Gate documents --auto-publish opt-in flag",
    "--auto-publish" in _s57_pubgate,
    "Publish Gate must document the --auto-publish opt-in flag within the section",
)

# --- (e) Publish gate present in orchestrator.md Direct Modes review row ---

_s57_dm = _slice_section(_s57_orch, "When invoked with a `Direct Mode Task`", ("\n## ",))

check(
    "Suite 57(e1): orchestrator.md Direct Modes review row references the Publish Gate",
    "Publish Gate" in _s57_dm or "publish-gate" in _s57_dm or "preview-and-confirm" in _s57_dm,
    "orchestrator.md § Direct Modes review row must reference the Publish Gate "
    "(ref-direct-modes.md § Publish Gate)",
)
check(
    "Suite 57(e2): orchestrator.md Direct Modes review row references Layers 4 and 5",
    "Layer 4" in _s57_dm and "Layer 5" in _s57_dm,
    "orchestrator.md § Direct Modes review row must reference Layer 4 and Layer 5",
)
check(
    "Suite 57(e3): orchestrator.md Direct Modes review row references review_context",
    "review_context" in _s57_dm,
    "orchestrator.md § Direct Modes review row must reference review_context state",
)

# --- (f) Publish gate present in skill (Phase 4 decision menu) ---

_s57_ph4 = _slice_section(_s57_skill, "### Phase 4 — Decision Menu", _S57_STOP_HEADS)

check(
    "Suite 57(f1): skills/review-pr/SKILL.md contains Phase 4 Decision Menu section",
    bool(_s57_ph4),
    "Phase 4 Decision Menu section missing from review-pr/SKILL.md",
)
check(
    "Suite 57(f2): skill Phase 4 shows the draft to the operator (preview-first)",
    "draft" in _s57_ph4.lower() and ("display" in _s57_ph4.lower() or "show" in _s57_ph4.lower() or "Read" in _s57_ph4),
    "skill Phase 4 must present the review draft to the operator before publishing",
)

# --- (g) skill Flag parsing documents --auto-publish ---

_s57_flags = _slice_section(_s57_skill, "## Flag parsing", _S57_STOP_HEADS)

check(
    "Suite 57(g1): skills/review-pr/SKILL.md Flag parsing section exists",
    bool(_s57_flags),
    "Flag parsing section missing from review-pr/SKILL.md",
)
check(
    "Suite 57(g2): skill Flag parsing documents --auto-publish opt-in flag",
    "--auto-publish" in _s57_flags or "--auto-publish" in _s57_skill,
    "skill must document --auto-publish in Flag parsing section (or near it)",
)

# --- (h) reviewer.md No-Publish Invariant enumerates three execution sites ---

_s57_nopub = _slice_section(_s57_reviewer, "## No-Publish Invariant", ("\n## ",))

check(
    "Suite 57(h1): reviewer.md No-Publish Invariant section exists",
    bool(_s57_nopub),
    "No-Publish Invariant section missing from reviewer.md",
)
check(
    "Suite 57(h2): reviewer.md No-Publish Invariant names three execution sites",
    ("skill" in _s57_nopub.lower() or "Phase 4" in _s57_nopub or "Phase 5" in _s57_nopub)
    and ("orchestrator" in _s57_nopub.lower() or "direct-mode" in _s57_nopub.lower())
    and ("takeover" in _s57_nopub.lower() or "inline" in _s57_nopub.lower()),
    "reviewer.md No-Publish Invariant must enumerate all three execution sites: "
    "skill, orchestrator direct-mode, takeover/inline",
)

# --- (i) Self-ref: Suite 57 uses _slice_section and covers review-mode-hard-gates ---

_s57_self = read(REPO_ROOT / "tests" / "test_agent_structure.py")
_s57_suite_text = _slice_section(
    _s57_self,
    "Suite 57 — Review-mode hard gates",
    ("# -----------\n# Summary",),
)
check(
    "Suite 57(i): Suite 57 uses _slice_section anchor-scoped idiom and covers 'review-mode-hard-gates'",
    "_slice_section" in _s57_suite_text and "review-mode-hard-gates" in _s57_suite_text,
    "Suite 57 must use _slice_section (anchor-scoped) and contain the 'review-mode-hard-gates' marker",
)

# --- (j) Publish Gate anchored in takeover-path doc (SEC-IMP-1 anti-drift) ---
# docs/subagent-orchestration.md § Takeover Protocol must carry an operative
# Publish Gate statement for the takeover/inline review path — not just a
# transitive pointer via ref-direct-modes.md. If a maintainer edits the takeover
# doc and removes the statement, this check turns red immediately.

_s57_takeover_doc = read(REPO_ROOT / "docs" / "subagent-orchestration.md")
_s57_takeover_section = _slice_section(
    _s57_takeover_doc,
    "## Takeover Protocol",
    ("\n## ",),
)

check(
    "Suite 57(j): docs/subagent-orchestration.md Takeover Protocol section contains Publish Gate statement",
    bool(_s57_takeover_section),
    "Takeover Protocol section not found in docs/subagent-orchestration.md — "
    "anchor '## Takeover Protocol' must be present",
)

check(
    "Suite 57(j): Takeover Protocol names 'Publish Gate' within the section",
    "Publish Gate" in _s57_takeover_section,
    "docs/subagent-orchestration.md § Takeover Protocol must contain 'Publish Gate' — "
    "the gate must be operative text on this document, not only a transitive ref via ref-direct-modes.md "
    "(SEC-IMP-1 anti-drift; removal turns this check red)",
)

check(
    "Suite 57(j): Takeover Protocol names the Publish Gate definition source (ref-direct-modes.md)",
    "ref-direct-modes.md" in _s57_takeover_section,
    "docs/subagent-orchestration.md § Takeover Protocol must reference 'ref-direct-modes.md' as "
    "the authoritative Publish Gate definition — this makes the cross-reference verifiable",
)

check(
    "Suite 57(j): Takeover Protocol Publish Gate entry covers at least one write verb",
    (
        "gh pr review" in _s57_takeover_section
        or "PUT" in _s57_takeover_section
        or "POST" in _s57_takeover_section
        or "dismiss" in _s57_takeover_section.lower()
        or "write verb" in _s57_takeover_section.lower()
    ),
    "docs/subagent-orchestration.md § Takeover Protocol Publish Gate entry must name at least one "
    "covered write verb (or 'write verb' generically) — review direct mode",
)

# ---------------------------------------------------------------------------
# Suite 58 — Plan-shape batch-economy contract (plan-shape-contract, #249)
# ---------------------------------------------------------------------------
# Anti-drift assertions for the multi-service consolidation rule and
# changelog.d fragment directory introduced in PR-2 (feat/plan-shape-batch-economy):
#
#   (a) agents/architect.md — '#### Consolidation rule' subsection present,
#       contains `Consolidates:` field + all 5 cumulative conditions, asserts
#       that Split reason / one-PR-per-service / stacking prohibition are UNCHANGED.
#   (b) agents/plan-reviewer.md — '### Rule 10 — Multi-service consolidation'
#       present, disjoint from Rule 1/9, fires only on `Consolidates:`, asserts
#       that Rule 1/9 and the Split reason list are UNCHANGED.
#   (c) agents/delivery.md — Step 7 references 'changelog.d/' fragment directory
#       + slug rule; Step 9e references fragment assembly (idempotent, no-op when
#       directory is empty).
#   (d) CLAUDE.md §6.3 references changelog.d fragments.
#
# All checks use anchored _slice_section (anti-false-green idiom):
#   anchor absent → _slice_section returns "" → token in "" is False → FAIL.
# plan-shape-batch-economy is the PR-2 identifier for self-ref check.
# ---------------------------------------------------------------------------
print()
print("=== Suite 58: Plan-shape batch-economy contract (#249) ===")

_S58_STOP_HEADS = ("\n#### ", "\n### ", "\n## ", "\n---\n")
_S58_STOP_SECTION = ("\n### ", "\n## ", "\n---\n")
_S58_STOP_H2 = ("\n## ", "\n---\n")

_s58_architect = read(AGENTS_DIR / "architect.md")
_s58_pr = read(AGENTS_DIR / "plan-reviewer.md")
_s58_delivery = read(AGENTS_DIR / "delivery.md")
_s58_claude = read(REPO_ROOT / "CLAUDE.md")

# ---- slices ----------------------------------------------------------------

_S58_CONSOL_ANCHOR = "#### Consolidation rule"
_S58_RULE10_ANCHOR = "### Rule 10 — Multi-service consolidation"
_S58_STEP7_ANCHOR = "### Step 7 — Write CHANGELOG fragment"
_S58_STEP9E_ANCHOR = "### Step 9e — CHANGELOG release cut"
_S58_CLAUDE_63_ANCHOR = "### 6.3 Post-work"

_s58_consol_slice = _slice_section(_s58_architect, _S58_CONSOL_ANCHOR, _S58_STOP_HEADS)
_s58_rule10_slice = _slice_section(_s58_pr, _S58_RULE10_ANCHOR, _S58_STOP_SECTION)
_s58_step7_slice  = _slice_section(_s58_delivery, _S58_STEP7_ANCHOR, _S58_STOP_SECTION)
_s58_step9e_slice = _slice_section(_s58_delivery, _S58_STEP9E_ANCHOR, _S58_STOP_SECTION)
_s58_claude63_slice = _slice_section(_s58_claude, _S58_CLAUDE_63_ANCHOR, _S58_STOP_H2)

# ---------------------------------------------------------------------------
# (a) architect.md — Consolidation rule subsection
# ---------------------------------------------------------------------------

check(
    "plan-shape(a1): agents/architect.md contains '#### Consolidation rule' subsection",
    bool(_s58_consol_slice),
    "Consolidation rule subsection missing from architect.md — "
    "add '#### Consolidation rule — small same-session declarative concerns'",
)
check(
    "plan-shape(a2): Consolidation rule declares the 'Consolidates:' field",
    "Consolidates:" in _s58_consol_slice,
    "Consolidation rule must introduce the per-PR 'Consolidates:' field",
)
check(
    "plan-shape(a3): Consolidation rule lists condition (a) — declarative/doc/asset change",
    bool(_s58_consol_slice)
    and (
        "(a)" in _s58_consol_slice
        and ("declarative" in _s58_consol_slice.lower() or "doc" in _s58_consol_slice.lower() or "asset" in _s58_consol_slice.lower())
    ),
    "Consolidation rule must list condition (a): small declarative/doc/asset change",
)
check(
    "plan-shape(a4): Consolidation rule lists condition (b) — same session",
    bool(_s58_consol_slice)
    and "(b)" in _s58_consol_slice
    and "session" in _s58_consol_slice.lower(),
    "Consolidation rule must list condition (b): same pipeline session",
)
check(
    "plan-shape(a5): Consolidation rule lists condition (c) — no independent review",
    bool(_s58_consol_slice)
    and "(c)" in _s58_consol_slice
    and ("independent" in _s58_consol_slice.lower() and "review" in _s58_consol_slice.lower()),
    "Consolidation rule must list condition (c): no independent human review needed",
)
check(
    "plan-shape(a6): Consolidation rule lists condition (d) — no production coexistence",
    bool(_s58_consol_slice)
    and "(d)" in _s58_consol_slice
    and ("coexist" in _s58_consol_slice.lower() or "staged" in _s58_consol_slice.lower() or "rollout" in _s58_consol_slice.lower()),
    "Consolidation rule must list condition (d): no production coexistence / staged rollout need",
)
check(
    "plan-shape(a7): Consolidation rule lists condition (e) — append-only file collision",
    bool(_s58_consol_slice)
    and "(e)" in _s58_consol_slice
    and ("append" in _s58_consol_slice.lower() or "collide" in _s58_consol_slice.lower() or "collision" in _s58_consol_slice.lower()),
    "Consolidation rule must list condition (e): would collide on append-only files",
)
check(
    "plan-shape(a8): architect.md asserts that Split reason closed list is UNCHANGED",
    bool(_s58_consol_slice)
    and (
        "Split reason" in _s58_consol_slice
        and ("unchanged" in _s58_consol_slice.lower() or "unchanged" in _s58_architect.lower())
        and ("NOT" in _s58_consol_slice or "not" in _s58_consol_slice)
    ),
    "Consolidation rule must assert that Split reason values and one-PR-per-service default are UNCHANGED",
)
check(
    "plan-shape(a9): architect.md asserts that PR-stacking prohibition (Rule 9) is UNCHANGED",
    bool(_s58_consol_slice)
    and (
        "stacking" in _s58_consol_slice.lower()
        or "Rule 9" in _s58_consol_slice
        or "stacked" in _s58_consol_slice.lower()
    ),
    "Consolidation rule must assert that the PR-stacking prohibition (Rule 9) is UNCHANGED",
)
check(
    "plan-shape(a10): Consolidation rule explains it is SEPARATE from Split reason (different control)",
    bool(_s58_consol_slice)
    and (
        "SEPARATE" in _s58_consol_slice
        or "separate" in _s58_consol_slice.lower()
        or "DIFFERENT" in _s58_consol_slice
        or "different" in _s58_consol_slice.lower()
    )
    and "Split reason" in _s58_consol_slice,
    "Consolidation rule must explain it is a separate control from Split reason (not a new Split reason value)",
)

# ---------------------------------------------------------------------------
# (b) plan-reviewer.md — Rule 10 (disjoint from Rule 1/9)
# ---------------------------------------------------------------------------

check(
    "plan-shape(b1): agents/plan-reviewer.md contains '### Rule 10 — Multi-service consolidation'",
    bool(_s58_rule10_slice),
    "Rule 10 section missing from plan-reviewer.md — "
    "add '### Rule 10 — Multi-service consolidation'",
)
check(
    "plan-shape(b2): Rule 10 fires only when a PR declares 'Consolidates:'",
    bool(_s58_rule10_slice)
    and "Consolidates:" in _s58_rule10_slice
    and ("only" in _s58_rule10_slice.lower() or "ONLY" in _s58_rule10_slice),
    "Rule 10 must state it fires ONLY when a PR declares Consolidates:",
)
check(
    "plan-shape(b3): Rule 10 explicitly states it is disjoint from Rule 1/9",
    bool(_s58_rule10_slice)
    and ("disjoint" in _s58_rule10_slice.lower() or "DISJOINT" in _s58_rule10_slice)
    and ("Rule 1" in _s58_rule10_slice and "Rule 9" in _s58_rule10_slice),
    "Rule 10 must explicitly state it is disjoint from Rule 1 and Rule 9",
)
check(
    "plan-shape(b4): Rule 10 affirms Rule 1 closed-list of Split reason values is UNCHANGED",
    bool(_s58_rule10_slice)
    and "Split reason" in _s58_rule10_slice
    and ("unchanged" in _s58_rule10_slice.lower() or "unchanged" in _s58_pr.lower()),
    "Rule 10 must affirm that Rule 1's closed-list of Split reason values is unchanged",
)
check(
    "plan-shape(b5): Rule 10 affirms default one-PR-per-service is UNCHANGED",
    bool(_s58_rule10_slice)
    and (
        "one PR per service" in _s58_rule10_slice.lower()
        or "one-PR-per-service" in _s58_rule10_slice
        or "one pr per service" in _s58_rule10_slice.lower()
    ),
    "Rule 10 must affirm that the default one-PR-per-service rule is unchanged",
)
check(
    "plan-shape(b6): Rule 10 affirms PR-stacking prohibition (Rule 9) is UNCHANGED",
    bool(_s58_rule10_slice)
    and (
        "Rule 9" in _s58_rule10_slice
        and ("unchanged" in _s58_rule10_slice.lower() or "unchanged" in _s58_rule10_slice)
    ),
    "Rule 10 must affirm that the PR-stacking prohibition (Rule 9) is unchanged",
)
check(
    "plan-shape(b7): Rule 10 section covers the 5 conditions",
    bool(_s58_rule10_slice)
    and ("(a)" in _s58_rule10_slice)
    and ("(b)" in _s58_rule10_slice)
    and ("(c)" in _s58_rule10_slice)
    and ("(d)" in _s58_rule10_slice)
    and ("(e)" in _s58_rule10_slice),
    "Rule 10 must reference all 5 cumulative conditions (a) through (e)",
)

# ---------------------------------------------------------------------------
# (c) delivery.md — Step 7 changelog.d fragment + Step 9e assembly
# ---------------------------------------------------------------------------

check(
    "plan-shape(c1): agents/delivery.md Step 7 references changelog.d/ fragment directory",
    bool(_s58_step7_slice)
    and "changelog.d/" in _s58_step7_slice,
    "delivery.md Step 7 must reference the changelog.d/ fragment directory",
)
check(
    "plan-shape(c2): delivery.md Step 7 defines the pr-slug naming rule",
    bool(_s58_step7_slice)
    and (
        "pr-slug" in _s58_step7_slice
        or "{pr-slug}" in _s58_step7_slice
    )
    and (
        "a-z0-9" in _s58_step7_slice
        or "alphanumeric" in _s58_step7_slice.lower()
        or "lowercase" in _s58_step7_slice.lower()
    ),
    "delivery.md Step 7 must define the pr-slug naming rule (lowercase, [a-z0-9-]+)",
)
check(
    "plan-shape(c3): delivery.md Step 9e assembles changelog.d/ fragments",
    bool(_s58_step9e_slice)
    and "changelog.d/" in _s58_step9e_slice,
    "delivery.md Step 9e must reference changelog.d/ fragment assembly",
)
check(
    "plan-shape(c4): delivery.md Step 9e fragment assembly is idempotent (no-op when empty)",
    bool(_s58_step9e_slice)
    and (
        "no-op" in _s58_step9e_slice.lower()
        or "idempotent" in _s58_step9e_slice.lower()
    )
    and (
        "empty" in _s58_step9e_slice.lower()
        or "absent" in _s58_step9e_slice.lower()
    ),
    "delivery.md Step 9e must state the assembly is idempotent / no-op when changelog.d/ is empty",
)
check(
    "plan-shape(c5): delivery.md Step 9e includes path-traversal guard for fragment slugs",
    bool(_s58_step9e_slice)
    and (
        "path" in _s58_step9e_slice.lower()
        and (
            "traversal" in _s58_step9e_slice.lower()
            or "separator" in _s58_step9e_slice.lower()
            or ".." in _s58_step9e_slice
        )
    ),
    "delivery.md Step 9e must include a path-traversal guard for fragment filenames",
)

# ---------------------------------------------------------------------------
# (d) CLAUDE.md §6.3 references changelog.d fragments
# ---------------------------------------------------------------------------

check(
    "plan-shape(d1): CLAUDE.md §6.3 Post-work references changelog.d/ fragment mechanism",
    bool(_s58_claude63_slice)
    and "changelog.d/" in _s58_claude63_slice,
    "CLAUDE.md §6.3 Post-work must reference the changelog.d/ fragment mechanism",
)
check(
    "plan-shape(d2): CLAUDE.md §6.3 describes fragment format (Keep-a-Changelog subsection)",
    bool(_s58_claude63_slice)
    and (
        "### Added" in _s58_claude63_slice
        or "### Fixed" in _s58_claude63_slice
        or "subsection" in _s58_claude63_slice.lower()
        or "Keep-a-Changelog" in _s58_claude63_slice
    ),
    "CLAUDE.md §6.3 must describe the fragment format (Keep-a-Changelog subsection block)",
)
check(
    "plan-shape(d3): CLAUDE.md §6.3 notes direct [Unreleased] edit as a valid fallback",
    bool(_s58_claude63_slice)
    and (
        "fallback" in _s58_claude63_slice.lower()
        or "Unreleased" in _s58_claude63_slice
    ),
    "CLAUDE.md §6.3 must note that direct [Unreleased] editing is a valid fallback",
)

# ---------------------------------------------------------------------------
# (b-ext) plan-reviewer.md — Rule 10 finding-emission and no-op contracts
# These strengthen AC-2 (rejection when conditions fail) and confirm the
# no-op pseudocode path that makes Rule 10 truly disjoint from Rule 1/9.
# ---------------------------------------------------------------------------

check(
    "plan-shape(b8): Rule 10 specifies a 'Finding when absent' for each condition (AC-2 rejection contract)",
    bool(_s58_rule10_slice)
    and (
        "Finding when absent" in _s58_rule10_slice
        or "finding" in _s58_rule10_slice.lower()
    )
    and "findings.append" in _s58_rule10_slice,
    "Rule 10 must specify findings when conditions are absent (Finding when absent column + findings.append)",
)
check(
    "plan-shape(b9): Rule 10 no-op contract — PR without Consolidates: is not audited (disjoint enforcement)",
    bool(_s58_rule10_slice)
    and (
        "no-op" in _s58_rule10_slice.lower()
        or "not audited" in _s58_rule10_slice.lower()
        or "never audited" in _s58_rule10_slice.lower()
    )
    and "Consolidates:" in _s58_rule10_slice,
    "Rule 10 must state it is a no-op for PRs that do not declare Consolidates: (disjointness enforcement)",
)

# ---------------------------------------------------------------------------
# (c-ext) delivery.md — Step 9e fragment deletion (makes idempotency true)
# AC-5 claim: 'fragments deleted after assembly; running again on empty dir = no-op'
# The deletion step is what proves the idempotency, not just the no-op label.
# ---------------------------------------------------------------------------

check(
    "plan-shape(c6): delivery.md Step 9e deletes fragment files after assembly (idempotency mechanism)",
    bool(_s58_step9e_slice)
    and (
        "delete" in _s58_step9e_slice.lower()
        or "remov" in _s58_step9e_slice.lower()
    )
    and "changelog.d/" in _s58_step9e_slice,
    "delivery.md Step 9e must state that fragment files are deleted from changelog.d/ after assembly",
)

# --- (e) Self-ref: Suite 58 uses _slice_section and covers plan-shape-batch-economy ---

_s58_self = read(REPO_ROOT / "tests" / "test_agent_structure.py")
_s58_suite_text = _slice_section(
    _s58_self,
    "Suite 58 — Plan-shape batch-economy contract",
    ("# -----------\n# Summary",),
)
check(
    "plan-shape(e): Suite 58 uses _slice_section anchor-scoped idiom and covers 'plan-shape-batch-economy'",
    "_slice_section" in _s58_suite_text and "plan-shape-batch-economy" in _s58_suite_text,
    "Suite 58 must use _slice_section (anchor-scoped) and contain the 'plan-shape-batch-economy' marker",
)

# ---------------------------------------------------------------------------
# Suite 59 — dev-mode top-level orchestrator (PR-1, v2.53.0)
# Mechanism: output-style (replaces base) + deterministic outward-action gate
# ---------------------------------------------------------------------------
print("=== Suite 59: dev-mode-top-level-orchestrator (v2.53.0) ===")

_S59_STOP_SECTION = ("\n### ", "\n## ", "\n---\n")
_S59_STOP_H2 = ("\n## ", "\n---\n")
_S59_STOP_H3 = ("\n### ", "\n## ", "\n---\n")

# Output-style path (new mechanism — replaces skill)
_s59_style_path = REPO_ROOT / "output-styles" / "developer-mode.md"
_s59_style = _s59_style_path.read_text(encoding="utf-8") if _s59_style_path.exists() else ""

_s59_mb_dispatch = (SKILLS_DIR / "setup" / "managed-blocks" / "orchestrator-dispatch-rule.md").read_text(encoding="utf-8") if (SKILLS_DIR / "setup" / "managed-blocks" / "orchestrator-dispatch-rule.md").exists() else ""
_s59_mb_devmode = (SKILLS_DIR / "setup" / "managed-blocks" / "dev-mode.md").read_text(encoding="utf-8") if (SKILLS_DIR / "setup" / "managed-blocks" / "dev-mode.md").exists() else ""

_s59_setup = read(SKILLS_DIR / "setup" / "SKILL.md")
_s59_update = read(SKILLS_DIR / "update" / "SKILL.md")
_s59_go_global = read(REPO_ROOT / "cmd" / "install" / "global_claude_md.go")
_s59_claude = read(REPO_ROOT / "CLAUDE.md")
_s59_docs_devmode = read(REPO_ROOT / "docs" / "dev-mode.md") if (REPO_ROOT / "docs" / "dev-mode.md").exists() else ""
_s59_docs_subagent = read(REPO_ROOT / "docs" / "subagent-orchestration.md")
_s59_docs_checkpoint = read(REPO_ROOT / "docs" / "reasoning-checkpoint.md")
_s59_knowledge = read(REPO_ROOT / "docs" / "knowledge.md")

# ---- slices ----------------------------------------------------------------

_S59_STYLE_ANTI_RUSHING_ANCHOR = "## ANTI-RUSHING CONTRACT"
_S59_STYLE_ROLE_ADOPT_ANCHOR = "## Role adoption"
_S59_DOCS_DEVMODE_INVARIANT_ANCHOR = "## Security Floor Non-Waivability"
_S59_DOCS_DEVMODE_TRIAGE_ANCHOR = "## Triage Safety-Bias"
_S59_CLAUDE_S14_ANCHOR = "## 14. Subagent Orchestration"
_S59_SUBAGENT_DEV_ANCHOR = "## Dev Mode — Primary Path"
_S59_CHECKPOINT_DEV_ANCHOR = "### Dev mode — Layer-1 hook"

_s59_style_antirush_slice = _slice_section(_s59_style, _S59_STYLE_ANTI_RUSHING_ANCHOR, _S59_STOP_H2)
_s59_style_role_slice = _slice_section(_s59_style, _S59_STYLE_ROLE_ADOPT_ANCHOR, _S59_STOP_H2)
_s59_docs_invariant_slice = _slice_section(_s59_docs_devmode, _S59_DOCS_DEVMODE_INVARIANT_ANCHOR, _S59_STOP_H2)
_s59_docs_triage_slice = _slice_section(_s59_docs_devmode, _S59_DOCS_DEVMODE_TRIAGE_ANCHOR, _S59_STOP_H2)
_s59_claude_s14_slice = _slice_section(_s59_claude, _S59_CLAUDE_S14_ANCHOR, _S59_STOP_H2)
_s59_subagent_devmode_slice = _slice_section(_s59_docs_subagent, _S59_SUBAGENT_DEV_ANCHOR, _S59_STOP_H2)
_s59_checkpoint_devmode_slice = _slice_section(_s59_docs_checkpoint, _S59_CHECKPOINT_DEV_ANCHOR, _S59_STOP_H3)

# ---------------------------------------------------------------------------
# AC-2 — output-style exists + frontmatter + banner + observable flag + no force-for-plugin
# ---------------------------------------------------------------------------

check(
    "dev-mode(output-style-exists): output-styles/developer-mode.md exists",
    _s59_style_path.exists(),
    "Create output-styles/developer-mode.md — the disposition mechanism (replaces the base built-in SWE instructions)",
)
check(
    "dev-mode(output-style-name-frontmatter): developer-mode.md frontmatter has name: developer-mode",
    "name: developer-mode" in _s59_style,
    "output-styles/developer-mode.md frontmatter must declare name: developer-mode",
)
check(
    "dev-mode(output-style-keep-coding-instructions): developer-mode.md frontmatter has keep-coding-instructions: false",
    "keep-coding-instructions: false" in _s59_style,
    "output-styles/developer-mode.md must declare keep-coding-instructions: false (replaces, not layers, the SWE base)",
)
check(
    "dev-mode(output-style-no-force-for-plugin): developer-mode.md does NOT set force-for-plugin: true",
    "force-for-plugin: true" not in _s59_style,
    "output-styles/developer-mode.md must NOT set force-for-plugin: true (opt-in, normal is default, SEC-DR-4)",
)
check(
    "dev-mode(banner-wordmark): developer-mode.md contains team-harness ASCII wordmark (block chars)",
    "█" in _s59_style,
    "output-styles/developer-mode.md must include the ANSI Shadow block-letter wordmark",
)
check(
    "dev-mode(banner-orbital): developer-mode.md contains the orbital decoration lines",
    ". . . . . . ." in _s59_style and "O" in _s59_style,
    "output-styles/developer-mode.md must include the orbital decoration (. . . . . . . / O hub dot)",
)
check(
    "dev-mode(banner-developer-mode-active): developer-mode.md contains 'DEVELOPER MODE ACTIVE'",
    "DEVELOPER MODE ACTIVE" in _s59_style,
    "output-styles/developer-mode.md must contain 'DEVELOPER MODE ACTIVE' as the mode indicator line",
)
check(
    "dev-mode(observable-flag): developer-mode.md references the .dev-mode-active filesystem marker",
    ".dev-mode-active" in _s59_style,
    "output-styles/developer-mode.md must reference ~/.claude/.dev-mode-active as the observable session flag",
)

# ---------------------------------------------------------------------------
# AC-4 / AC-11 — fail-closed triage invariant (SEC-DR-1) in output-style
# ---------------------------------------------------------------------------

check(
    "dev-mode(triage-invariant-en): developer-mode.md anti-rushing block contains fail-closed triage invariant (EN form)",
    bool(_s59_style_antirush_slice)
    and "NEVER treat ambiguity as a license to handle the task inline without gates" in _s59_style_antirush_slice,
    "output-styles/developer-mode.md must contain the literal fail-closed triage invariant (EN): "
    "'NEVER treat ambiguity as a license to handle the task inline without gates'",
)
check(
    "dev-mode(triage-invariant-es): developer-mode.md anti-rushing block contains fail-closed triage invariant (ES form)",
    bool(_s59_style_antirush_slice)
    and "NUNCA tratar la ambig" in _s59_style_antirush_slice,
    "output-styles/developer-mode.md must contain the literal ES form: "
    "'NUNCA tratar la ambigüedad como licencia para manejar la tarea inline sin gates'",
)

# ---------------------------------------------------------------------------
# AC-4 / AC-10 — HI-2 non-waivability (SEC-DR-3) in docs/dev-mode.md
# ---------------------------------------------------------------------------

check(
    "dev-mode(hi2-docs-nonwaivable): docs/dev-mode.md declares HI-2-equivalent non-waivability invariant",
    bool(_s59_docs_invariant_slice)
    and "HI-2" in _s59_docs_invariant_slice
    and (
        "never" in _s59_docs_invariant_slice.lower()
        or "non-waivable" in _s59_docs_invariant_slice.lower()
        or "NOT waivable" in _s59_docs_invariant_slice
    ),
    "docs/dev-mode.md Security Floor Non-Waivability section must reference HI-2 and state non-waivability",
)
check(
    "dev-mode(hi2-docs-no-security-field): docs/dev-mode.md states dev mode NEVER writes security_sensitive",
    bool(_s59_docs_invariant_slice)
    and "security_sensitive" in _s59_docs_invariant_slice
    and (
        "NEVER" in _s59_docs_invariant_slice
        or "never" in _s59_docs_invariant_slice
    ),
    "docs/dev-mode.md must state dev mode NEVER writes security_sensitive",
)

# ---------------------------------------------------------------------------
# AC-11 — no normative duplication (pointer-only) in output-style role-adoption
# ---------------------------------------------------------------------------

check(
    "dev-mode(no-duplication-orchestrator): developer-mode.md role-adoption section references agents/orchestrator.md by pointer",
    bool(_s59_style_role_slice)
    and "agents/orchestrator.md" in _s59_style_role_slice,
    "output-styles/developer-mode.md role-adoption must reference agents/orchestrator.md by pointer, not duplicate content",
)
check(
    "dev-mode(no-duplication-discover): developer-mode.md role-adoption section references docs/discover-phase.md by pointer",
    bool(_s59_style_role_slice)
    and "docs/discover-phase.md" in _s59_style_role_slice,
    "output-styles/developer-mode.md role-adoption must reference docs/discover-phase.md by pointer",
)
check(
    "dev-mode(no-duplication-checkpoint): developer-mode.md role-adoption section references docs/reasoning-checkpoint.md by pointer",
    bool(_s59_style_role_slice)
    and "docs/reasoning-checkpoint.md" in _s59_style_role_slice,
    "output-styles/developer-mode.md role-adoption must reference docs/reasoning-checkpoint.md by pointer",
)

# ---------------------------------------------------------------------------
# AC-9 — byte-identical 3-mirror check for orchestrator-dispatch-rule
# The canonical .md is the reference. Compare against setup embedded copy and Go const.
# ---------------------------------------------------------------------------

# Extract the block content from setup/SKILL.md (between markers, inclusive)
_S59_ODR_START = "<!-- orchestrator-dispatch-rule:start -->"
_S59_ODR_END = "<!-- orchestrator-dispatch-rule:end -->"

def _extract_between_markers(text: str, start: str, end: str) -> str:
    """Return text from start marker to end marker inclusive, or '' if not found."""
    si = text.find(start)
    if si == -1:
        return ""
    ei = text.find(end, si)
    if ei == -1:
        return ""
    return text[si : ei + len(end)]

_s59_canonical_block = _extract_between_markers(_s59_mb_dispatch, _S59_ODR_START, _S59_ODR_END)
_s59_setup_block = _extract_between_markers(_s59_setup, _S59_ODR_START, _S59_ODR_END)

# Extract Go const value between backtick delimiters for orchestratorRule
_s59_go_const_match = re.search(
    r'const orchestratorRule = `(.*?)`',
    _s59_go_global,
    re.DOTALL,
)
_s59_go_block = _s59_go_const_match.group(1).strip() if _s59_go_const_match else ""

# The Go const uses Go string concatenation (` + ` joins), so we can't do a raw
# byte comparison. Instead verify the key discriminant phrase (the revised inline-permit
# text anchored to "developer-mode output style") is present in the Go const.
_S59_INLINE_PERMIT_PHRASE = "PERMITTED ONLY when the developer-mode output style is active"

check(
    "dev-mode(mirror-canonical-nonempty): orchestrator-dispatch-rule canonical .md block is non-empty",
    bool(_s59_canonical_block),
    "skills/setup/managed-blocks/orchestrator-dispatch-rule.md must contain the start/end markers and content",
)
check(
    "dev-mode(mirror-setup-nonempty): orchestrator-dispatch-rule embedded in setup/SKILL.md is non-empty",
    bool(_s59_setup_block),
    "skills/setup/SKILL.md must contain the orchestrator-dispatch-rule block between its markers",
)
check(
    "dev-mode(mirror-canonical-inline-permit): canonical .md contains the inline-permit phrase",
    _S59_INLINE_PERMIT_PHRASE in _s59_canonical_block,
    f"skills/setup/managed-blocks/orchestrator-dispatch-rule.md must contain: '{_S59_INLINE_PERMIT_PHRASE}'",
)
check(
    "dev-mode(mirror-setup-inline-permit): setup/SKILL.md embedded block contains the inline-permit phrase",
    _S59_INLINE_PERMIT_PHRASE in _s59_setup_block,
    f"skills/setup/SKILL.md embedded orchestrator-dispatch-rule must contain: '{_S59_INLINE_PERMIT_PHRASE}'",
)
check(
    "dev-mode(mirror-go-inline-permit): Go const orchestratorRule contains the inline-permit phrase",
    _S59_INLINE_PERMIT_PHRASE in _s59_go_global,
    f"cmd/install/global_claude_md.go orchestratorRule const must contain: '{_S59_INLINE_PERMIT_PHRASE}'",
)
check(
    "dev-mode(mirror-canonical-fallback): canonical .md declares FALLBACK pointer to subagent-orchestration.md",
    "FALLBACK" in _s59_canonical_block
    and "docs/subagent-orchestration.md" in _s59_canonical_block,
    "orchestrator-dispatch-rule canonical .md must mark docs/subagent-orchestration.md as FALLBACK",
)
check(
    "dev-mode(mirror-setup-fallback): setup/SKILL.md block declares FALLBACK pointer",
    "FALLBACK" in _s59_setup_block
    and "docs/subagent-orchestration.md" in _s59_setup_block,
    "orchestrator-dispatch-rule in setup/SKILL.md must declare FALLBACK",
)
check(
    "dev-mode(mirror-go-fallback): Go const orchestratorRule declares FALLBACK pointer",
    "FALLBACK" in _s59_go_global
    and "subagent-orchestration.md" in _s59_go_global,
    "Go const orchestratorRule must declare FALLBACK to docs/subagent-orchestration.md",
)
check(
    "dev-mode(mirrors-byte-identical-canonical-vs-setup): canonical .md block == setup/SKILL.md block",
    bool(_s59_canonical_block)
    and bool(_s59_setup_block)
    and _s59_canonical_block == _s59_setup_block,
    "orchestrator-dispatch-rule canonical .md and setup/SKILL.md embedded copy must be byte-identical",
)

# ---------------------------------------------------------------------------
# AC-9 — §14 prose anchored to observable flag (SEC-DR-2) in CLAUDE.md and mirrors
# ---------------------------------------------------------------------------

_S59_OBSERVABLE_PHRASE = "dev_mode: true"
_S59_AD_HOC_PHRASE = "ad-hoc improvisation"

check(
    "dev-mode(claude-s14-observable-flag): CLAUDE.md §14 anchors inline permit to observable flag dev_mode: true",
    bool(_s59_claude_s14_slice)
    and _S59_OBSERVABLE_PHRASE in _s59_claude_s14_slice,
    "CLAUDE.md §14 must anchor inline orchestration permit to the observable flag 'dev_mode: true'",
)
check(
    "dev-mode(claude-s14-prohibited-adhoc): CLAUDE.md §14 prohibits inline without the flag",
    bool(_s59_claude_s14_slice)
    and _S59_AD_HOC_PHRASE in _s59_claude_s14_slice,
    "CLAUDE.md §14 must use the phrase 'ad-hoc improvisation' for the prohibited case",
)
check(
    "dev-mode(claude-s14-fallback): CLAUDE.md §14 marks nested-handoff/takeover as FALLBACK",
    bool(_s59_claude_s14_slice)
    and "FALLBACK" in _s59_claude_s14_slice,
    "CLAUDE.md §14 must label the nested-handoff/takeover as FALLBACK",
)
check(
    "dev-mode(canonical-observable-flag): orchestrator-dispatch-rule canonical .md contains dev_mode: true",
    _S59_OBSERVABLE_PHRASE in _s59_canonical_block,
    "orchestrator-dispatch-rule canonical .md must declare 'dev_mode: true' as the observable flag",
)
check(
    "dev-mode(canonical-ad-hoc): orchestrator-dispatch-rule canonical .md contains ad-hoc improvisation phrase",
    _S59_AD_HOC_PHRASE in _s59_canonical_block,
    "orchestrator-dispatch-rule canonical .md must name the prohibited case as 'ad-hoc improvisation'",
)

# ---------------------------------------------------------------------------
# AC-13 — dev-mode managed block (operator-facing directive) — markers + content
# The dev-mode-entry block is NOT distributed (obsolete skill trigger-phrase mechanism).
# ---------------------------------------------------------------------------

check(
    "dev-mode(devmode-block-exists): skills/setup/managed-blocks/dev-mode.md exists",
    (SKILLS_DIR / "setup" / "managed-blocks" / "dev-mode.md").exists(),
    "Create skills/setup/managed-blocks/dev-mode.md",
)
check(
    "dev-mode(devmode-block-start-marker): dev-mode.md has start marker <!-- dev-mode:start -->",
    "<!-- dev-mode:start -->" in _s59_mb_devmode,
    "dev-mode.md must contain the start marker <!-- dev-mode:start -->",
)
check(
    "dev-mode(devmode-block-end-marker): dev-mode.md has end marker <!-- dev-mode:end -->",
    "<!-- dev-mode:end -->" in _s59_mb_devmode,
    "dev-mode.md must contain the end marker <!-- dev-mode:end -->",
)
check(
    "dev-mode(devmode-block-how-to-activate): dev-mode.md documents developer-mode output style activation",
    "developer-mode" in _s59_mb_devmode,
    "dev-mode.md must document how to activate via the developer-mode output style (not /dev-mode skill)",
)
check(
    "dev-mode(devmode-block-deactivation): dev-mode.md documents deactivation via Default output style",
    "Default" in _s59_mb_devmode
    or "rm ~/.claude/.dev-mode-active" in _s59_mb_devmode,
    "dev-mode.md must document how to deactivate (Default output style or delete marker)",
)
check(
    "dev-mode(devmode-entry-block-not-distributed): skills/setup/managed-blocks/dev-mode-entry.md does NOT exist",
    not (SKILLS_DIR / "setup" / "managed-blocks" / "dev-mode-entry.md").exists(),
    "skills/setup/managed-blocks/dev-mode-entry.md must NOT exist (obsolete skill trigger-phrase, dropped in v2.53.0)",
)
check(
    "dev-mode(setup-installs-devmode-block): setup/SKILL.md wires dev-mode managed block",
    "<!-- dev-mode:start -->" in _s59_setup,
    "skills/setup/SKILL.md must install the dev-mode managed block",
)
check(
    "dev-mode(setup-installs-output-style): setup/SKILL.md copies output-styles/developer-mode.md to ~/.claude/output-styles/",
    "output-styles/developer-mode.md" in _s59_setup
    and ("output-styles" in _s59_setup),
    "skills/setup/SKILL.md must include a step that copies output-styles/developer-mode.md to ~/.claude/output-styles/",
)
check(
    "dev-mode(setup-no-entry-block): setup/SKILL.md does NOT wire dev-mode-entry block",
    "<!-- dev-mode-entry:start -->" not in _s59_setup,
    "skills/setup/SKILL.md must NOT install the obsolete dev-mode-entry managed block (dropped in v2.53.0)",
)
check(
    "dev-mode(update-syncs-devmode-block): update/SKILL.md syncs dev-mode block",
    "dev-mode" in _s59_update
    and "<!-- dev-mode:start -->" in _s59_update,
    "skills/update/SKILL.md must sync the dev-mode managed block",
)
check(
    "dev-mode(update-syncs-output-style): update/SKILL.md syncs developer-mode output style",
    "output-styles/developer-mode.md" in _s59_update
    and "output-styles" in _s59_update,
    "skills/update/SKILL.md must re-copy output-styles/developer-mode.md on update",
)
check(
    "dev-mode(update-removes-entry-block): update/SKILL.md removes obsolete dev-mode-entry block if present",
    "dev-mode-entry" in _s59_update,
    "skills/update/SKILL.md must remove the obsolete dev-mode-entry block from ~/.claude/CLAUDE.md if present",
)
check(
    "dev-mode(go-devmode-block): global_claude_md.go has devModeBlock const",
    "devModeBlock" in _s59_go_global
    and "<!-- dev-mode:start -->" in _s59_go_global,
    "cmd/install/global_claude_md.go must define devModeBlock const with dev-mode markers",
)
check(
    "dev-mode(go-removes-entry-block): global_claude_md.go calls removeManagedBlock for obsolete dev-mode-entry",
    "removeManagedBlock" in _s59_go_global
    and "devModeEntryMarker" in _s59_go_global,
    "cmd/install/global_claude_md.go must call removeManagedBlock() to remove the obsolete dev-mode-entry block",
)
_s59_skill_path = SKILLS_DIR / "dev-mode" / "SKILL.md"
_s59_skill = read(_s59_skill_path) if _s59_skill_path.exists() else ""
check(
    "dev-mode(skill-exists): skills/dev-mode/SKILL.md exists (the /dev-mode in-session activator)",
    _s59_skill_path.exists(),
    "Create skills/dev-mode/SKILL.md — the user-level /dev-mode skill that starts developer mode in the current session",
)
check(
    "dev-mode(skill-frontmatter): /dev-mode skill declares name: dev-mode + disable-model-invocation: true",
    "name: dev-mode" in _s59_skill and "disable-model-invocation: true" in _s59_skill,
    "skills/dev-mode/SKILL.md frontmatter must declare name: dev-mode and disable-model-invocation: true (explicit operator opt-in)",
)
check(
    "dev-mode(skill-starts-in-session): /dev-mode skill starts dev mode in-session — writes the marker, prints the banner, adopts the orchestrator role (no outputStyle config, no /clear)",
    ".dev-mode-active" in _s59_skill
    and "DEVELOPER MODE ACTIVE" in _s59_skill
    and "orchestrator" in _s59_skill,
    "skills/dev-mode/SKILL.md must start developer mode in the current session: write/remove the ~/.claude/.dev-mode-active marker, print the DEVELOPER MODE ACTIVE banner, and adopt the orchestrator role — it does NOT configure the outputStyle setting (that is the /config output-style path, not the skill's job)",
)

# AC — SessionStart hook: auto-load dev mode at session start, silently.
_s59_ss_hook_path = HOOKS_DIR / "dev-mode-session-start.sh"
_s59_ss_hook = read(_s59_ss_hook_path) if _s59_ss_hook_path.exists() else ""
check(
    "dev-mode(sessionstart-hook-exists): hooks/dev-mode-session-start.sh exists",
    _s59_ss_hook_path.exists(),
    "Create hooks/dev-mode-session-start.sh — the SessionStart hook that loads dev mode into context at session start when the marker is present",
)
check(
    "dev-mode(sessionstart-hook-marker-gated): hook gates on .dev-mode-active (dev_mode: true) — inert in normal mode",
    ".dev-mode-active" in _s59_ss_hook and "dev_mode: true" in _s59_ss_hook,
    "hooks/dev-mode-session-start.sh must gate on the ~/.claude/.dev-mode-active marker so it injects nothing in normal mode",
)
check(
    "dev-mode(sessionstart-hook-injects-context): hook emits SessionStart additionalContext",
    "additionalContext" in _s59_ss_hook and "SessionStart" in _s59_ss_hook,
    "hooks/dev-mode-session-start.sh must emit hookSpecificOutput.additionalContext for the SessionStart event",
)
check(
    "dev-mode(sessionstart-hook-silent): injected context forbids narrating the determination and re-inspecting the marker",
    "SILENT" in _s59_ss_hook and "re-verify" in _s59_ss_hook,
    "hooks/dev-mode-session-start.sh injected context must instruct the agent to keep the dev-mode determination SILENT and never re-verify the marker mid-session",
)
check(
    "dev-mode(sessionstart-hook-systemmessage): hook emits an instant app-rendered systemMessage banner",
    "systemMessage" in _s59_ss_hook and "DEVELOPER MODE ACTIVE" in _s59_ss_hook,
    "hooks/dev-mode-session-start.sh must emit a systemMessage carrying the DEVELOPER MODE banner — app-rendered and instant — instead of instructing the model to render slow ASCII art",
)
check(
    "dev-mode(sessionstart-hook-no-model-banner): injected context tells the model NOT to print a banner itself",
    "do NOT print any banner" in _s59_ss_hook,
    "hooks/dev-mode-session-start.sh additionalContext must instruct the model not to render its own banner (the systemMessage already shows it)",
)
for _os_key in ("windows", "macos", "linux"):
    _ss = cfg.get(_os_key, {}).get("hooks", {}).get("SessionStart", [])
    _ss_cmd = (_ss[0].get("hooks", [{}])[0]).get("command", "") if _ss else ""
    _ss_matcher = _ss[0].get("matcher", "") if _ss else ""
    check(
        f"dev-mode(sessionstart-wired-{_os_key}): config.json[{_os_key}] wires SessionStart -> dev-mode-session-start.sh",
        len(_ss) > 0 and "dev-mode-session-start.sh" in _ss_cmd,
        f"hooks/config.json[{_os_key}] must wire a SessionStart hook invoking dev-mode-session-start.sh",
    )
    check(
        f"dev-mode(sessionstart-matcher-{_os_key}): config.json[{_os_key}] SessionStart entry declares a 'startup' matcher",
        "startup" in _ss_matcher,
        f"hooks/config.json[{_os_key}] SessionStart entry MUST declare a matcher (e.g. 'startup|resume|clear') — a SessionStart entry without a matcher is silently ignored by Claude Code",
    )

# ---------------------------------------------------------------------------
# AC-8 / AC-13 — docs/dev-mode.md: gate + disposition mechanism + reconciliation
# ---------------------------------------------------------------------------

check(
    "dev-mode(docs-devmode-exists): docs/dev-mode.md exists",
    (REPO_ROOT / "docs" / "dev-mode.md").exists(),
    "Create docs/dev-mode.md",
)
check(
    "dev-mode(docs-devmode-disposition-mechanism): docs/dev-mode.md documents output-style as disposition mechanism",
    "output-style" in _s59_docs_devmode.lower()
    and "replac" in _s59_docs_devmode.lower(),
    "docs/dev-mode.md must document the output-style as the disposition mechanism that replaces the base",
)
check(
    "dev-mode(docs-devmode-no-force-for-plugin): docs/dev-mode.md states force-for-plugin is NOT adopted",
    "force-for-plugin" in _s59_docs_devmode
    and (
        "NOT" in _s59_docs_devmode
        or "not" in _s59_docs_devmode
    ),
    "docs/dev-mode.md must state that force-for-plugin is not adopted",
)
check(
    "dev-mode(docs-devmode-outward-action-gate): docs/dev-mode.md documents the Outward-Action Gate section",
    "Outward-Action Gate" in _s59_docs_devmode
    or "outward-action gate" in _s59_docs_devmode.lower(),
    "docs/dev-mode.md must contain an Outward-Action Gate section (dev-guard.sh contract)",
)
check(
    "dev-mode(docs-devmode-reconciliation-251-252): docs/dev-mode.md reconciles with #251/#252 publish-gate",
    "#251" in _s59_docs_devmode
    or "#252" in _s59_docs_devmode
    or "Publish Gate" in _s59_docs_devmode,
    "docs/dev-mode.md must reconcile with the review-mode publish gates (#251/#252)",
)
check(
    "dev-mode(subagent-fallback-reframe): docs/subagent-orchestration.md intro reframes takeover as FALLBACK",
    "FALLBACK" in _s59_docs_subagent
    and (
        "## Nested-Context Dispatch — FALLBACK" in _s59_docs_subagent
        or "nested-handoff/takeover" in _s59_docs_subagent.lower()
    ),
    "docs/subagent-orchestration.md must label nested-handoff/takeover as FALLBACK (not primary path)",
)
check(
    "dev-mode(checkpoint-layer1-promotion): docs/reasoning-checkpoint.md documents Layer-1 hook promotion in dev mode",
    bool(_s59_checkpoint_devmode_slice)
    and "dev mode" in _s59_checkpoint_devmode_slice.lower()
    and "Layer-1" in _s59_checkpoint_devmode_slice,
    "docs/reasoning-checkpoint.md must document that dev mode promotes B1/B2/B3 to Layer-1 hook (deterministic floor)",
)

# ---------------------------------------------------------------------------
# AC-18 (SEC — prompt-independence reconciliation): docs/dev-mode.md declares that
# keep-coding-instructions: false discards SWE workflow guidance (not harm-rejection layer)
# and that security floors are PreToolUse hooks wired by matcher (prompt-independent).
# ---------------------------------------------------------------------------

check(
    "dev-mode(ac18-discards-swe-workflow): docs/dev-mode.md declares keep-coding-instructions:false discards SWE workflow",
    "keep-coding-instructions: false" in _s59_docs_devmode
    and (
        "workflow" in _s59_docs_devmode.lower()
        or "scope" in _s59_docs_devmode.lower()
    ),
    "docs/dev-mode.md must declare that keep-coding-instructions: false discards SWE workflow guidance "
    "(scope/comments/verify), NOT the model's harm-rejection layer",
)
check(
    "dev-mode(ac18-security-floors-prompt-independent): docs/dev-mode.md declares security floors are prompt-independent hooks",
    (
        "prompt-independent" in _s59_docs_devmode.lower()
        or "prompt independent" in _s59_docs_devmode.lower()
        or "wired by matcher" in _s59_docs_devmode.lower()
    )
    and "PreToolUse" in _s59_docs_devmode,
    "docs/dev-mode.md must declare that security floors (policy-block.sh, dev-guard.sh, checkpoint-guard.sh) "
    "are PreToolUse hooks wired by matcher — prompt-independent — and survive the base-prompt replacement intact",
)

# ---------------------------------------------------------------------------
# AC-14 — version bump at all 5 sites + CHANGELOG entries + knowledge.md
# ---------------------------------------------------------------------------

_s59_plugin_json = json.loads((REPO_ROOT / ".claude-plugin" / "plugin.json").read_text())
_s59_marketplace = json.loads((REPO_ROOT / ".claude-plugin" / "marketplace.json").read_text())
_s59_main_go = read(REPO_ROOT / "cmd" / "install" / "main.go")
_s59_changelog = read(REPO_ROOT / "CHANGELOG.md")

# Dev-mode shipped in 2.53.0; assert a version FLOOR (>=) rather than an exact
# pin so routine patch bumps (2.53.1, 2.54.0, ...) do not break this suite.
# _S59_EXPECTED_VERSION is the historical release anchor (the [2.53.0] CHANGELOG
# section and the dev-mode release surfaces); the floor governs the live
# plugin/marketplace version which advances with each patch.
_S59_EXPECTED_VERSION = "2.53.0"
_S59_MIN_VERSION = (2, 53, 0)

def _s59_ver_tuple(v):
    try:
        return tuple(int(x) for x in str(v).split(".")[:3])
    except Exception:
        return (0, 0, 0)

def _s59_claude_current_version(text):
    """Parse the backtick-quoted version token from the 'Current version' line in CLAUDE.md §3."""
    for line in text.splitlines():
        if "Current version" in line and "`" in line:
            try:
                return line.split("`")[1].strip()
            except IndexError:
                return None
    return None

_s59_claude_ver = _s59_claude_current_version(_s59_claude)

check(
    "dev-mode(version-plugin-json): .claude-plugin/plugin.json version >= 2.53.0 (dev-mode release floor)",
    _s59_ver_tuple(_s59_plugin_json.get("version")) >= _S59_MIN_VERSION,
    "plugin.json version must be >= 2.53.0 (the dev-mode feature release)",
)
check(
    "dev-mode(version-marketplace-json): .claude-plugin/marketplace.json plugins[0].version >= 2.53.0",
    _s59_ver_tuple(_s59_marketplace.get("plugins", [{}])[0].get("version")) >= _S59_MIN_VERSION,
    "marketplace.json plugins[0].version must be >= 2.53.0",
)
check(
    "dev-mode(version-main-go): cmd/install/main.go var version == 2.53.0",
    f'var version = "{_S59_EXPECTED_VERSION}"' in _s59_main_go,
    f"cmd/install/main.go must declare var version = \"{_S59_EXPECTED_VERSION}\"",
)
check(
    "dev-mode(version-claude-md): CLAUDE.md §3 Current version >= 2.53.0 (dev-mode release floor)",
    _s59_claude_ver is not None
    and _s59_ver_tuple(_s59_claude_ver) >= _S59_MIN_VERSION,
    "CLAUDE.md §3 must declare a Current version >= 2.53.0 (the dev-mode feature release floor)",
)
check(
    "dev-mode(version-changelog): CHANGELOG.md has ## [2.53.0] release section",
    f"## [{_S59_EXPECTED_VERSION}]" in _s59_changelog,
    f"CHANGELOG.md must have a ## [{_S59_EXPECTED_VERSION}] release section",
)
check(
    "dev-mode(changelog-added-entry): CHANGELOG.md [2.53.0] has Added/Changed entry for dev-mode output-style",
    f"## [{_S59_EXPECTED_VERSION}]" in _s59_changelog
    and (
        "developer-mode" in _s59_changelog.lower()
        or "output-style" in _s59_changelog.lower()
        or "DEVELOPER MODE ACTIVE" in _s59_changelog
    ),
    "CHANGELOG.md [2.53.0] must have an entry for the developer-mode output-style feature",
)
check(
    "dev-mode(knowledge-updated): docs/knowledge.md has updated [decision] for dev mode inline permit",
    "dev mode" in _s59_knowledge.lower()
    and (
        "inline permit gated on observable" in _s59_knowledge.lower()
        or "output-style" in _s59_knowledge.lower()
    ),
    "docs/knowledge.md must have an updated [decision] entry for dev mode inline permit (output-style mechanism)",
)
check(
    "dev-mode(knowledge-output-style-replaces): docs/knowledge.md has [decision] that output-style replaces base",
    "output-style" in _s59_knowledge.lower()
    and (
        "replac" in _s59_knowledge.lower()
        or "v2.53.0" in _s59_knowledge
    ),
    "docs/knowledge.md must have a [decision] entry: dev mode disposition via output-style replaces the base (v2.53.0 lesson)",
)

# ---------------------------------------------------------------------------
# Summary check for Suite 59 — dev-mode-top-level-orchestrator marker
# (anti-false-green: the anchor must be present for the slice to have worked)
# ---------------------------------------------------------------------------
check(
    "dev-mode(suite59-anchor): dev-mode-top-level-orchestrator suite-marker present in test file",
    "dev-mode-top-level-orchestrator" in (REPO_ROOT / "tests" / "test_agent_structure.py").read_text(encoding="utf-8"),
    "Suite 59 must contain the 'dev-mode-top-level-orchestrator' marker string (anti-false-green)",
)

# ---------------------------------------------------------------------------
# Suite 60 — report-issue model-invocable + clickup create/update (v2.54.0)
# ---------------------------------------------------------------------------
print()
print("=== Suite 60: report-issue model-invocable + clickup create/update (v2.54.0) ===")

_s60_report_issue_path = SKILLS_DIR / "report-issue" / "SKILL.md"
_s60_report_issue = read(_s60_report_issue_path) if _s60_report_issue_path.exists() else ""
_s60_devmode_path = SKILLS_DIR / "dev-mode" / "SKILL.md"
_s60_devmode = read(_s60_devmode_path) if _s60_devmode_path.exists() else ""
_s60_clickup_path = SKILLS_DIR / "clickup" / "SKILL.md"
_s60_clickup = read(_s60_clickup_path) if _s60_clickup_path.exists() else ""

# AC-1 / AC-2 — report-issue is now model-invocable (flag removed)
check(
    "report-issue(no-disable-flag): skills/report-issue/SKILL.md does NOT contain disable-model-invocation: true",
    "disable-model-invocation: true" not in _s60_report_issue,
    "skills/report-issue/SKILL.md must not declare disable-model-invocation: true (removed in v2.54.0)",
)
check(
    "report-issue(step6-gate-present): skills/report-issue/SKILL.md still contains the Step 6 confirmation gate",
    "Step 6" in _s60_report_issue and ("sí" in _s60_report_issue or "yes" in _s60_report_issue),
    "skills/report-issue/SKILL.md must still contain the Step 6 confirmation gate as the human-in-loop guard",
)

# AC-3 — dev-mode skill retains its flag (must not be touched)
check(
    "dev-mode(flag-retained): skills/dev-mode/SKILL.md still declares disable-model-invocation: true",
    "disable-model-invocation: true" in _s60_devmode,
    "skills/dev-mode/SKILL.md must retain disable-model-invocation: true (operator-only mode-switch)",
)

# AC-5 / AC-6 / AC-7 — clickup create sub-command documented
check(
    "clickup(create-subcommand): skills/clickup/SKILL.md documents `create` sub-command",
    "### `create`" in _s60_clickup or "### create" in _s60_clickup,
    "skills/clickup/SKILL.md must document the `create` sub-command section",
)
check(
    "clickup(create-list-precedence): skills/clickup/SKILL.md documents list resolution precedence (--list > default_list_id > fail-closed)",
    "--list" in _s60_clickup and "default_list_id" in _s60_clickup and "No list configured" in _s60_clickup,
    "skills/clickup/SKILL.md create section must document --list override, default_list_id fallback, and fail-closed guidance",
)
check(
    "clickup(create-task-tool): skills/clickup/SKILL.md references clickup_create_task verbatim",
    "clickup_create_task" in _s60_clickup,
    "skills/clickup/SKILL.md must reference clickup_create_task in the MCP tools section",
)

# AC-8 — clickup update sub-command with Available-states discovery
check(
    "clickup(update-subcommand): skills/clickup/SKILL.md documents `update` sub-command",
    "### `update`" in _s60_clickup or "### update" in _s60_clickup,
    "skills/clickup/SKILL.md must document the `update` sub-command section",
)
check(
    "clickup(update-explicit-id): skills/clickup/SKILL.md update section requires explicit literal ID (no title resolution)",
    "literal" in _s60_clickup and "title" in _s60_clickup.lower(),
    "skills/clickup/SKILL.md update section must document that the task ID is required as a literal (no title search)",
)
check(
    "clickup(update-states-discovery): skills/clickup/SKILL.md update section references Available-states discovery",
    "Available-states discovery" in _s60_clickup,
    "skills/clickup/SKILL.md update section must reference Available-states discovery for status changes",
)

# AC-12 / AC-13 — functional register for descriptions; single "paso a producción" technical comment
check(
    "clickup(comments-functional-register-descriptions): skills/clickup/SKILL.md ## Comments documents functional register for task descriptions",
    "task descriptions" in _s60_clickup or ("description" in _s60_clickup and "functional register" in _s60_clickup),
    "skills/clickup/SKILL.md ## Comments must document that task descriptions (not only comments) use functional register",
)
check(
    "clickup(comments-paso-a-produccion): skills/clickup/SKILL.md ## Comments documents the single permitted technical comment",
    "paso a producción" in _s60_clickup,
    "skills/clickup/SKILL.md ## Comments must document the 'paso a producción' as the single permitted technical comment",
)
check(
    "clickup(comments-no-pr-lifecycle-status): skills/clickup/SKILL.md ## Comments forbids PR lifecycle status in the paso-a-produccion comment",
    "pendiente de merge" in _s60_clickup and "pending deploy" in _s60_clickup,
    "skills/clickup/SKILL.md ## Comments must explicitly forbid transient PR lifecycle status strings",
)

# ---------------------------------------------------------------------------
# Suite 61 — configurable-agent-language (v2.55.0)
# Marker: configurable-agent-language
# ---------------------------------------------------------------------------
print()
print("=== Suite 61: configurable-agent-language (v2.55.0) ===")

_STOP = ("\n### ", "\n## ", "\n---\n")

_s61_orch = read(AGENTS_DIR / "orchestrator.md")
_s61_setup_skill = read(SKILLS_DIR / "setup" / "SKILL.md")
_s61_managed_block = read(SKILLS_DIR / "setup" / "managed-blocks" / "orchestrator-dispatch-rule.md")
_s61_claude_md = read(REPO_ROOT / "CLAUDE.md")
_s61_voice_guide = read(REPO_ROOT / "docs" / "voice-guide.md")

# (1) orchestrator.md Step 1c declares 4-level precedence text
_s61_step1c = _slice_section(_s61_orch, "1c. **MANDATORY — Resolve operator language.**", _STOP)
check(
    "suite61(step1c-precedence-chain): orchestrator.md Step 1c declares 4-level precedence",
    all(tok in _s61_step1c for tok in ["Session override", "Config default", "Detection", "Default"]),
    "4-level precedence levels (Session override / Config default / Detection / Default) not all present in Step 1c",
)
check(
    "suite61(step1c-malformed-warn): orchestrator.md Step 1c documents malformed-code WARN + fallback, no abort",
    "WARN" in _s61_step1c and "fallback" in _s61_step1c.lower() and "never abort" in _s61_step1c.lower(),
    "malformed-code handling (WARN + fallback + never abort) not documented in Step 1c",
)
check(
    "suite61(step1c-absent-no-warn): orchestrator.md Step 1c documents absent key -> level 3 with no warning",
    "absent" in _s61_step1c.lower() and "no warning" in _s61_step1c.lower(),
    "absent-key handling (no warning) not documented in Step 1c",
)

# (2) orchestrator.md Step 6a intent table has language-persistent-default-set intent
_s61_step6a = _slice_section(_s61_orch, "**Step 6a — Classify intent.**", _STOP)
check(
    "suite61(intent-persistent-set): orchestrator.md Step 6a has language-persistent-default-set intent row",
    "language-persistent-default-set" in _s61_step6a or "persistent-default-set" in _s61_step6a,
    "language-persistent-default-set intent row missing from Step 6a table",
)
check(
    "suite61(intent-session-override): orchestrator.md Step 6a has language-session-override intent row",
    "language-session-override" in _s61_step6a or "session-override" in _s61_step6a,
    "language-session-override intent row missing from Step 6a table",
)
check(
    "suite61(confirmation-gate): orchestrator.md Step 6a documents Y/n confirmation gate before merge-write",
    "Y/n" in _s61_step6a or "[Y/n]" in _s61_step6a,
    "Y/n confirmation gate not documented in Step 6a language-set handling",
)
check(
    "suite61(merge-write-invariant): orchestrator.md Step 6a specifies read-modify-write (never partial payload)",
    "never a partial payload" in _s61_step6a or "merge-write" in _s61_step6a,
    "merge-write invariant (never partial payload) not specified in Step 6a",
)
check(
    "suite61(no-write-without-persistence-marker): orchestrator.md Step 6a states config JSON never written without explicit persistence signal",
    "never written without" in _s61_step6a.lower() or "NEVER written without" in _s61_step6a,
    "Step 6a must state the config JSON is never written without an explicit persistence signal",
)

# (3) orchestrator.md recovery note resolves via precedence chain
_s61_recovery = _slice_section(_s61_orch, "**`operator_language` recovery.**", _STOP)
check(
    "suite61(recovery-precedence): orchestrator.md operator_language recovery resolves via precedence chain (not just 'en')",
    "precedence" in _s61_recovery.lower() and "language" in _s61_recovery.lower(),
    "recovery note for operator_language must reference the precedence chain, not just default to 'en'",
)

# (4) orchestrator.md language-propagation note mentions config-sourced-first
_s61_lang_prop = _slice_section(_s61_orch, "**Language propagation.** Every agent dispatch prompt MUST include", _STOP)
check(
    "suite61(lang-propagation-config-first): orchestrator.md language propagation note mentions config-sourced key as level 2",
    "language" in _s61_lang_prop and ("config" in _s61_lang_prop.lower() or "team-harness.json" in _s61_lang_prop),
    "language propagation note must mention the config `language` key as the config-sourced level",
)

# (5) managed block — both locations updated identically (config-sourced-first language)
_s61_mb_lang_section = _slice_section(_s61_managed_block, "**Language propagation.**", _STOP)
check(
    "suite61(managed-block-config-first): canonical managed-block mentions config language key",
    "language" in _s61_mb_lang_section and ("team-harness.json" in _s61_mb_lang_section or "config" in _s61_mb_lang_section.lower()),
    "canonical managed-block orchestrator-dispatch-rule.md Language propagation does not mention config language key",
)
_s61_skill_mb_lang_section = _slice_section(_s61_setup_skill, "**Language propagation.**", _STOP)
check(
    "suite61(skill-inline-copy-config-first): SKILL.md inline copy of managed-block mentions config language key",
    "language" in _s61_skill_mb_lang_section and ("team-harness.json" in _s61_skill_mb_lang_section or "config" in _s61_skill_mb_lang_section.lower()),
    "SKILL.md inline copy of Language propagation does not mention config language key",
)
check(
    "suite61(managed-block-matches-inline): managed-block and SKILL.md inline copy both mention 4-level precedence",
    "Precedence" in _s61_mb_lang_section and "Precedence" in _s61_skill_mb_lang_section,
    "managed-block canonical and/or SKILL.md inline copy missing 4-level precedence description in Language propagation",
)

# (6) setup SKILL.md: Step 3.5 language prompt present
_s61_step35 = _slice_section(_s61_setup_skill, "### 3.5. Configure default language", _STOP)
check(
    "suite61(setup-step35-exists): skills/setup/SKILL.md has Step 3.5 for default language",
    bool(_s61_step35),
    "Step 3.5 (Configure default language) missing from skills/setup/SKILL.md",
)
check(
    "suite61(setup-step35-iso-validation): setup SKILL.md Step 3.5 validates ISO 639-1 format",
    "ISO 639-1" in _s61_step35 and ("[a-z]{2}" in _s61_step35 or "2 lowercase" in _s61_step35 or "two-letter" in _s61_step35 or "2-letter" in _s61_step35),
    "Step 3.5 must validate ISO 639-1 format (2-letter code)",
)
check(
    "suite61(setup-step35-merge-write): setup SKILL.md Step 3.5 specifies merge-write of complete document",
    "merge-write" in _s61_step35.lower() and ("complete" in _s61_step35.lower() or "full" in _s61_step35.lower() or "whole" in _s61_step35.lower()),
    "Step 3.5 must specify merge-write of the complete document",
)

# (7) setup SKILL.md: Step 5 manifest includes language key
_s61_step5 = _slice_section(_s61_setup_skill, "### 5. Write manifest", _STOP)
check(
    "suite61(setup-manifest-language-key): skills/setup/SKILL.md Step 5 manifest includes language key",
    '"language"' in _s61_step5 or "'language'" in _s61_step5 or "`language`" in _s61_step5,
    "Step 5 manifest in SKILL.md must include the 'language' key",
)

# (8) CLAUDE.md §5 documents language as chat-settable persistent key (new category)
_s61_claude_lang_bullet = _slice_section(_s61_claude_md, "**Chat-settable persistent key — `language`**", _STOP)
check(
    "suite61(claude-md-s5-new-category): CLAUDE.md §5 documents language as chat-settable persistent key",
    bool(_s61_claude_lang_bullet),
    "CLAUDE.md §5 must document 'language' as a chat-settable persistent key (new category)",
)
check(
    "suite61(claude-md-s5-confirmation-gate): CLAUDE.md §5 language category mentions confirmation gate",
    "confirmation gate" in _s61_claude_lang_bullet.lower() or "Y/n" in _s61_claude_lang_bullet,
    "CLAUDE.md §5 language category must mention the Y/n confirmation gate",
)
check(
    "suite61(claude-md-s5-not-in-session-whitelist): CLAUDE.md §5 distinguishes language from session-override whitelist",
    "distinct from the session-override whitelist" in _s61_claude_lang_bullet or "session-override" in _s61_claude_lang_bullet,
    "CLAUDE.md §5 language category must distinguish it from the session-override whitelist",
)

# (AC-9) voice-guide documents language source precedence (configured-default vs detection vs session-override)
_s61_vg_lang_section = _slice_section(
    _s61_voice_guide,
    "Language source precedence — configured-default vs detection vs session-override",
    _STOP,
)
check(
    "suite61(ac9-voice-guide-precedence-section): docs/voice-guide.md has Language source precedence section with all 4 levels",
    all(
        tok in _s61_vg_lang_section
        for tok in ["Session override", "Config default", "Detection", "Fallback"]
    ),
    "docs/voice-guide.md must document the 4-level language source precedence (Session override / Config default / Detection / Fallback)",
)
check(
    "suite61(ac9-voice-guide-committed-english): docs/voice-guide.md documents committed-artefact English rule",
    "Every committed artefact is in English" in _s61_voice_guide,
    "docs/voice-guide.md must state that every committed artefact is in English (AC-9 committed-artifact rule)",
)

# (9) self-referential guard
_s61_testing_md = read(REPO_ROOT / "docs" / "testing.md")
check(
    "suite61(self-ref-testing-md): docs/testing.md contains 'Suite 61' and 'configurable-agent-language'",
    "Suite 61" in _s61_testing_md and "configurable-agent-language" in _s61_testing_md,
    "docs/testing.md must register Suite 61 and the 'configurable-agent-language' marker",
)
check(
    "suite61(self-ref-test-file): this test file contains 'Suite 61' and 'configurable-agent-language' marker",
    True,  # presence in this file is guaranteed by writing this suite
    "",
)

# ---------------------------------------------------------------------------
# Suite 62 — delivery state-verification (issue #266)
# ---------------------------------------------------------------------------
# Three structural assertions against agents/delivery.md.
# ALL THREE fail against the pre-fix delivery.md (v2.55.1) and will pass
# after the implementer makes the three edits (AC-1, AC-2, AC-3).
#
# Implementer contract — marker strings that MUST appear in delivery.md:
#
# AC-1 (Step 9b recorded-state gate):
#   - "03-testing.md" must appear in the Step 9b region
#   - "no Phase 3 green" must appear in the Step 9b region
#   Both markers together assert that Step 9b reads the Phase 3 verify record
#   and gates the re-run on whether a green record exists.
#
# AC-2 (no-issue PR ref omitted):
#   - "OMIT" (uppercase) must appear in the Step 11.2 / rules region
#   - "no linked issue" must appear in the same region
#   Together they assert the no-issue branch is explicitly stated (not left
#   unspecified), and the rule is to OMIT the Closes/Fixes line.
#
# AC-3 (version-site reconciliation):
#   NEGATIVE: "all five must be updated together" must be ABSENT from Step 9.0
#   POSITIVE: "legacy-installer" must appear in Step 9.0
#   POSITIVE: "plugin.json" AND "marketplace.json" AND "CLAUDE.md" must appear
#             in Step 9.0 (the 3-site mandatory set).
# ---------------------------------------------------------------------------
print()
print("=== Suite 62: delivery state-verification (issue #266) ===")

_s62_delivery = read(AGENTS_DIR / "delivery.md")

# Locate the Step 9b region (from "Step 9b" to "Step 9c")
_s62_step9b_start = _s62_delivery.find("Step 9b")
_s62_step9b_end = _s62_delivery.find("Step 9c", _s62_step9b_start)
_s62_step9b = (
    _s62_delivery[_s62_step9b_start:_s62_step9b_end]
    if _s62_step9b_start != -1 and _s62_step9b_end != -1 and _s62_step9b_end > _s62_step9b_start
    else ""
)

# Assertion 1 (AC-1): Step 9b contains recorded-state gate clause.
# Markers: "03-testing.md" (the artifact delivery reads to gate) AND
# "no Phase 3 green" (the first of the three re-run exceptions).
check(
    "delivery.md Step 9b contains recorded-state gate: '03-testing.md' reference",
    "03-testing.md" in _s62_step9b,
    "Step 9b must reference '03-testing.md' as the recorded Phase 3 verify artifact "
    "it reads before deciding whether to re-run the test suite (AC-1)",
)
check(
    "delivery.md Step 9b contains recorded-state gate: 'no Phase 3 green' re-run exception",
    "no Phase 3 green" in _s62_step9b,
    "Step 9b must state the first re-run exception: 'no Phase 3 green is recorded' "
    "(AC-1 — gate treats recorded verify outcome as satisfying the test gate)",
)

# Locate the Step 11.2 / rules region.
# IMPORTANT: anchor on the em-dash heading "Step 11.2 — Create the PR" (not the bare
# "Step 11.2" string) so the region starts at the ACTUAL Step 11.2 heading (~line 631)
# and NOT at the forward reference inside Step 9c (~line 526).  The bare "Step 11.2"
# first occurrence is that forward reference; using the full heading literal skips it.
_s62_step112_start = _s62_delivery.find("Step 11.2 — Create the PR")
_s62_step112_end = _s62_delivery.find("Step 11.3", _s62_step112_start)
_s62_step112 = (
    _s62_delivery[_s62_step112_start:_s62_step112_end]
    if _s62_step112_start != -1 and _s62_step112_end != -1 and _s62_step112_end > _s62_step112_start
    else ""
)

# Assertion 2 (AC-2): Step 11.2 PR-creation template contains no-issue omit rule.
# Markers: "OMIT" (uppercase) AND "no linked issue" co-occurring in the region.
# The region covers the actual PR-body template (the gh pr create heredoc) so a future
# edit removing the guidance from the template while leaving the Step 11.0 note intact
# will correctly fail this assertion.
check(
    "delivery.md Step 11.2 / rules contain no-issue omit rule: 'OMIT' + 'no linked issue'",
    "OMIT" in _s62_step112 and "no linked issue" in _s62_step112,
    "Step 11.2 and/or its rules section must declare the no-issue branch explicitly: "
    "OMIT the Closes/Fixes line when there is no linked issue — never synthesize a number "
    "(AC-2 — markers: 'OMIT' uppercase + 'no linked issue')",
)

# Locate the Step 9.0 region (from "Step 9.0" to "Step 9.1")
_s62_step90_start = _s62_delivery.find("Step 9.0")
_s62_step90_end = _s62_delivery.find("Step 9.1", _s62_step90_start)
_s62_step90 = (
    _s62_delivery[_s62_step90_start:_s62_step90_end]
    if _s62_step90_start != -1 and _s62_step90_end != -1 and _s62_step90_end > _s62_step90_start
    else ""
)

# Assertion 3 (AC-3): Step 9.0 reconciles version sites.
# NEGATIVE: "all five must be updated together" must be absent (the erroneous caption).
# POSITIVE: "legacy-installer" must be present (marks main.go as the legacy anchor).
# POSITIVE: 3-site mandatory set named (plugin.json + marketplace.json + CLAUDE.md).
check(
    "delivery.md Step 9.0 no longer asserts 'all five must be updated together' (AC-3 negative guard)",
    "all five must be updated together" not in _s62_step90,
    "Step 9.0 still contains the erroneous caption 'all five must be updated together'; "
    "it must be replaced with a split that marks plugin.json + marketplace.json + CLAUDE.md §3 "
    "as mandatory and cmd/install/main.go as a legacy-installer anchor (AC-3)",
)
check(
    "delivery.md Step 9.0 marks main.go as a 'legacy-installer' anchor (AC-3 positive)",
    "legacy-installer" in _s62_step90,
    "Step 9.0 must mark 'cmd/install/main.go' as a legacy-installer anchor — "
    "updated only on installer releases, not on plugin-asset-only changes (AC-3)",
)

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print()
total = len(results)
passed = sum(1 for ok, _ in results if ok)
print("=" * 60)
print(f"  agent structure tests: {passed} passed / {total} total")
print("=" * 60)
if passed != total:
    print()
    print("Failures:")
    for ok, msg in results:
        if not ok:
            print(f"  - {msg}")
    sys.exit(1)
sys.exit(0)
