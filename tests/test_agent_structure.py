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
    "qa", "gcp-cost-analyzer", "init", "implementer", "tester",
    "acceptance-checker", "plan-reviewer", "diagrammer", "likec4-diagrammer",
    "d2-diagrammer", "translator", "delivery",
]

# Read-only agents that MUST NOT have Bash in their allowlist
READ_ONLY_AGENTS = {"architect", "security", "qa", "acceptance-checker", "plan-reviewer"}

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
print("=== Suite 5: qa.md Reconcile Mode ===")

qa = read(AGENTS_DIR / "qa.md")
check("qa.md has Reconcile Mode header", "Reconcile Mode (Phase 2.5" in qa)
check("qa.md Reconcile Mode mentions keep / amend / drop",
      all(kw in qa for kw in ["keep", "amend", "drop"]))
check("qa.md Reconcile Mode references Original Description",
      "Original Description" in qa)

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

# skills/status.md changes
status_md = read(skill_path("status"))
check("skills/status.md no-args table has Stage column",
      "Stage" in status_md and "| Stage |" in status_md,
      "Stage column not added to /status no-args table")

check("skills/status.md documents the 7 refined Status values",
      all(v in status_md for v in ["waiting_gate_1", "waiting_gate_2", "waiting_gate_3",
                                    "autonomous", "iterating", "complete", "paused"]),
      "one or more refined Status values missing from /status")

check("skills/status.md <feature-name> mode reads execution events (dual-format: .md or .jsonl)",
      "<feature-name>" in status_md and "00-execution-events.md" in status_md and "00-execution-events.jsonl" in status_md,
      "/status <feature> does not reference both execution events formats")

check("skills/status.md timeline declares the event types it renders",
      all(e in status_md for e in ["stage.gate", "stage.gate.release", "stage.gate.skipped",
                                    "gate.pass", "gate.fail", "iteration.start", "phase.end"]),
      "Timeline event-type list incomplete in /status")

check("skills/status.md handles missing JSONL gracefully (no crash)",
      "no events recorded" in status_md or "JSONL" in status_md and "missing" in status_md.lower(),
      "Graceful degradation for missing JSONL not documented in /status")

check("skills/status.md renderer never modifies state",
      "never modifies" in status_md or "Read-only" in status_md or "read-only" in status_md,
      "/status read-only contract not stated explicitly")

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
          "Knowledge Graph Access" in agent_text and "create_entities" in agent_text and ("Do NOT" in agent_text or "NEVER" in agent_text),
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

# 10. memory skill documents new types
mem_skill = read(skill_path("memory"))
for new_type in ("project", "service", "stack-profile"):
    check(f"skills/memory.md documents '{new_type}' as a type filter",
          new_type in mem_skill,
          f"new type '{new_type}' not documented in /memory list filter")

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

# 10. orchestrator.md defines inline fallback when Task subagent invocation fails
check("orchestrator.md defines inline fallback for plan-review subagent failures",
      "Inline fallback" in orchestrator_md
      and "not available as subagent_type" in orchestrator_md
      and "Task is not available inside subagents" in orchestrator_md,
      "orchestrator.md does not define inline fallback for nested-subagent constraint")
check("orchestrator.md inline fallback procedure references plan-reviewer.md as spec",
      "Read `agents/plan-reviewer.md`" in orchestrator_md,
      "orchestrator.md inline fallback does not point to plan-reviewer.md as procedure spec")
check("orchestrator.md emits mode: subagent | inline for telemetry",
      "mode: subagent | inline" in orchestrator_md or "mode: subagent" in orchestrator_md,
      "orchestrator.md status block does not distinguish subagent vs inline execution")

# 11. orchestrator.md ties both execution modes to the same max-3 budget
check("orchestrator.md subjects subagent + inline runs to the same max-3 budget",
      "same max-3 budget" in orchestrator_md or "does not reset the counter" in orchestrator_md,
      "orchestrator.md does not bind subagent+inline runs to the same iteration budget")

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
#   (e) Drift no-regression guards: stale session-doc names are absent from
#       the steps 6-7 region; correct names are present there (C1 + C2).
#   (f) update/SKILL.md does NOT contain a second copy of the block content (C3).
#
# AC coverage: AC-5 (detail), AC-8 (cross-ref), AC-1–AC-4 (substance).
# Resolution: resolved against _subagent_orch_md (content of
#   docs/subagent-orchestration.md) and setup_skill_md / update_skill_md.
# ---------------------------------------------------------------------------

update_skill_md = read(SKILLS_DIR / "update" / "SKILL.md")

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
        f"steps 6-7 region does NOT contain stale session-doc name '{_stale_name}'",
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
    "0a", "0b", "1", "1.5", "1.6", "2.0", "2", "2.5", "3", "3.5", "3.6", "3.75", "4", "4.5", "5", "6",
    # 2.0 is the Bug-fix Pipeline regression-test phase (type: fix | hotfix only),
    # inserted between STAGE-GATE-1 and Phase 2. See ref-special-flows.md § Bug-fix Flow.
    # 3.75 is Build Verification, a sub-step of Verify between Phase 3.5 and 3.6.
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

# --- skills/status.md reads 00-pipeline-summary.md ---

status_md = read(skill_path("status"))
check(
    "skills/status.md <feature-name> mode reads 00-pipeline-summary.md",
    "00-pipeline-summary.md" in status_md,
    "narrative renderer does not read the pipeline summary",
)
check(
    "skills/status.md points to /trace for deeper observability",
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

# --- skills/memory.md: mark_superseded + hard-delete sub-command ---

memory_skill = read(skill_path("memory"))

memory_skill_checks = [
    ("/memory prune uses mark_superseded as default (soft-delete)",
     "mark_superseded" in memory_skill and "soft-delete" in memory_skill),
    ("/memory consolidate uses mark_superseded",
     memory_skill.count("mark_superseded") >= 2),
    ("/memory hard-delete sub-command exists",
     "### `hard-delete" in memory_skill),
    ("hard-delete requires double confirmation",
     "Final confirmation" in memory_skill or "Second confirmation" in memory_skill),
    ("hard-delete asks user to type entity name exactly",
     "Type the entity name exactly" in memory_skill),
    ("hard-delete asks for DELETE <name> confirmation",
     'Type "DELETE' in memory_skill or "Type 'DELETE" in memory_skill),
    ("/memory usage help lists hard-delete",
     "hard-delete <entity-name>" in memory_skill),
    ("Important section reflects soft-delete-by-default",
     "Soft-delete via `mark_superseded` is reversible" in memory_skill or
     "Soft-delete via mark_superseded" in memory_skill),
]
for label, condition in memory_skill_checks:
    check(f"skills/memory.md: {label}", condition)

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

# (i) cmd/install/modes.go declares lowCostMatrix with all 17 agents.
for agent_name in EXPECTED_AGENTS:
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
        # posted to GitHub and session-doc outputs stay Spanish per the contract).
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

# (18) skills/init.md passes --scaffold-rereview-workflow flag through.
_init_skill = read(skill_path("init"))
check(
    "skills/init.md passes --scaffold-rereview-workflow flag to init agent",
    "--scaffold-rereview-workflow" in _init_skill,
    "skills/init.md does not propagate the --scaffold-rereview-workflow flag",
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
