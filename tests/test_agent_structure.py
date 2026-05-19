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

import json
import re
import sys
from pathlib import Path

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
    ("02-task-list.md artifact", "02-task-list.md"),
    ("01-plan-review.md artifact", "01-plan-review.md"),
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
    ("STAGE-GATE-1 surfaces Decisions for human review inline", "Decisions for human review"),
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

bg_path = SKILLS_DIR / "background.md"
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
# Suite 11 — README and skills/README mention /background and PreToolUse
# ---------------------------------------------------------------------------
print()
print("=== Suite 11: README cross-references ===")

top_readme = read(REPO_ROOT / "README.md")
check("README.md mentions /background",
      "/background" in top_readme)
check("README.md surfaces PreToolUse policy gate",
      "PreToolUse" in top_readme or "policy gate" in top_readme.lower())
check("README.md skill count is 28",
      "28 skills" in top_readme,
      "skill count not updated to 28")
check("README.md pipeline diagram mentions Constraint Reconciliation",
      "Constraint Reconciliation" in top_readme)
check("README.md pipeline diagram mentions Internal Review",
      "Internal Review" in top_readme)

skills_readme = read(SKILLS_DIR / "README.md")
check("skills/README.md lists /background as standalone",
      "/background" in skills_readme)

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
        ("Summary table requirement on 02-task-list.md", "## Summary"),
        ("TL;DR hard cap of 10 lines", "10 lines"),
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
        ("output file path", "01-plan-review.md"),
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
check("architect.md declares dual-output (01-architecture.md + 02-task-list.md)",
      "02-task-list.md" in architect and "Dual output" in architect,
      "dual-output contract not documented in architect.md")
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
check("architect.md requires ## TL;DR section in 01-architecture.md",
      "## TL;DR" in architect and "MANDATORY" in architect,
      "TL;DR section not declared mandatory in architect.md")
check("architect.md requires ## Decisions for human review section",
      "## Decisions for human review" in architect,
      "Decisions for human review section not documented")
check("architect.md requires ## Summary table in 02-task-list.md",
      "## Summary" in architect and "Summary table" in architect,
      "Summary table not required in 02-task-list.md schema")
check("architect.md spells out TL;DR is 3-6 lines (hard cap 10)",
      "3-6 lines" in architect and ("hard cap 10" in architect or "cap 10" in architect),
      "TL;DR size guidance missing")
check("architect.md spells out Decisions is 3-5 bullets (hard cap 7)",
      "3-5 bullets" in architect and ("hard cap 7" in architect or "cap 7" in architect),
      "Decisions for human review size guidance missing")
check("architect.md explains what does NOT belong in Decisions",
      "NOT belong" in architect and "Mechanical pattern" in architect,
      "guidance on what does NOT belong in Decisions missing")
check("architect.md allows 'No human-judgement decisions' as valid value",
      "No human-judgement decisions" in architect,
      "fallback bullet for zero decisions not documented")

# qa.md must declare per-PR scoping when 02-task-list.md is present
qa_md = read(AGENTS_DIR / "qa.md")
check("qa.md validate-mode reads 02-task-list.md per PR",
      "02-task-list.md" in qa_md,
      "02-task-list.md per-PR scoping not documented in qa.md")
check("qa.md distinguishes Phase 1.5 (ratify) from Phase 1.6 (plan-review)",
      "Phase 1.5" in qa_md and "Phase 1.6" in qa_md and "plan-reviewer" in qa_md,
      "qa.md does not document the distinction with plan-reviewer")

# implementer.md must declare per-PR scoping + SCOPE-DRIFT annotation
impl_md = read(AGENTS_DIR / "implementer.md")
check("implementer.md reads 02-task-list.md for per-PR ACs",
      "02-task-list.md" in impl_md,
      "implementer.md does not read 02-task-list.md")
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
check("ref-special-flows.md distinguishes 01-planning.md vs 02-task-list.md",
      "01-planning.md" in ref_flows and "02-task-list.md" in ref_flows,
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

# Top-level README must mention the 3-stage gates
check("README.md mentions STAGE-GATE-1", "STAGE-GATE-1" in top_readme,
      "STAGE-GATE-1 not surfaced in top-level README")
check("README.md mentions STAGE-GATE-2", "STAGE-GATE-2" in top_readme,
      "STAGE-GATE-2 not surfaced in top-level README")
check("README.md mentions STAGE-GATE-3", "STAGE-GATE-3" in top_readme,
      "STAGE-GATE-3 not surfaced in top-level README")
check("README.md mentions plan-reviewer", "plan-reviewer" in top_readme,
      "plan-reviewer not surfaced in top-level README")
check("README.md agent count is 17", "17 agents" in top_readme,
      "agent count not updated to 17")

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
status_md = read(SKILLS_DIR / "status.md")
check("skills/status.md no-args table has Stage column",
      "Stage" in status_md and "| Stage |" in status_md,
      "Stage column not added to /status no-args table")

check("skills/status.md documents the 7 refined Status values",
      all(v in status_md for v in ["waiting_gate_1", "waiting_gate_2", "waiting_gate_3",
                                    "autonomous", "iterating", "complete", "paused"]),
      "one or more refined Status values missing from /status")

check("skills/status.md <feature-name> mode reads 00-execution-events.jsonl",
      "<feature-name>" in status_md and "00-execution-events.jsonl" in status_md,
      "/status <feature> does not consume the JSONL trace")

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

# 6. Excluded agents do NOT have KG tools (regression guard)
for agent_name in ("implementer", "delivery", "plan-reviewer", "reviewer"):
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
mem_skill = read(SKILLS_DIR / "memory.md")
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
# Suite 16 — Session-docs hygiene guardrails
#   qa.md: "Files I write (exhaustive)" + "Files I MUST NOT write"
#   architect.md: "Forbidden output patterns" with no-history rule
#   orchestrator.md: explicit plan-review routing + qa-substance ban
# Triggered by a real failure in a downstream pipeline that accumulated
# 01-coverage-review.md, 02-flow-coverage.md and a qa-reports/PR-N.md tree
# alongside 01-architecture.md / 02-task-list.md instead of refining them
# in place. These checks assert the guardrails are in the prompts so the
# same drift cannot recur silently.
# ---------------------------------------------------------------------------
print()
print("=== Suite 16: Session-docs hygiene guardrails ===")

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
for doc in ("01-architecture.md", "02-task-list.md", "00-task-intake.md"):
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
check("orchestrator.md requires 01-plan-review.md present before STAGE-GATE-1",
      "01-plan-review.md` MUST exist" in orchestrator_md
      or "01-plan-review.md MUST exist" in orchestrator_md,
      "orchestrator.md does not require 01-plan-review.md presence before STAGE-GATE-1")

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
check("architect.md restricts post-gate writes on 02-task-list.md",
      "Write scope (hard rule for all agents)" in architect_md
      or "After STAGE-GATE-1 release, the only mutations allowed" in architect_md,
      "architect.md does not pin the post-gate write scope on 02-task-list.md")

# 13. qa.md mirrors AC PASS into 02-task-list.md checkboxes
check("qa.md declares the AC-checkbox mirror in 02-task-list.md",
      "AC checkbox mirror in `02-task-list.md`" in qa_md,
      "qa.md does not declare the AC-checkbox mirror contract")
check("qa.md restricts edits on 02-task-list.md to checkbox flips",
      "only** edit you are allowed to make on `02-task-list.md`" in qa_md
      or "only edit you are allowed to make on 02-task-list.md" in qa_md,
      "qa.md does not pin its edit scope on 02-task-list.md to checkbox flips")

# 14. orchestrator.md mirrors PR transitions to the Status field
check("orchestrator.md declares Mirror PR-level progress into 02-task-list.md",
      "Mirror PR-level progress into `02-task-list.md`" in orchestrator_md,
      "orchestrator.md does not declare the Status mirror contract")
for transition in ("in-progress", "verified", "merged", "blocked"):
    check(f"orchestrator.md Status mirror table names '{transition}'",
          transition in orchestrator_md,
          f"orchestrator.md does not name '{transition}' in the Status mirror table")
check("orchestrator.md hands the 'merged' transition to delivery",
      "`delivery` agent owns the `merged` transition" in orchestrator_md
      or "delivery agent owns the merged transition" in orchestrator_md,
      "orchestrator.md does not assign the merged transition to delivery")

# 15. implementer.md acknowledges it never writes 02-task-list.md
check("implementer.md says it never writes to 02-task-list.md",
      "NEVER write to `02-task-list.md`" in implementer_md
      or "never write to 02-task-list.md" in implementer_md.lower(),
      "implementer.md does not declare that it never writes to 02-task-list.md")

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
# Guards against the recurring "orchestrator nested → Task stripped → user has
# to manually take over" failure mode. The contract has three load-bearing
# touchpoints that must stay coherent:
#   1. agents/orchestrator.md  — the boot probe + Dispatch-blocked exit
#   2. CLAUDE.md § 13          — the universal auto-takeover rule
#   3. skills/README.md        — the canonical Continuity contract
#
# If any of these drifts (e.g. someone renames the status enum, drops the
# imperative phrasing, weakens the anti-patterns), the auto-takeover stops
# working and the user is back to relaying the handoff by hand.
print("=== Suite 18: Dispatch-blocked auto-takeover contract ===")

orchestrator_md = read(AGENTS_DIR / "orchestrator.md")
claude_md = read(REPO_ROOT / "CLAUDE.md")
skills_readme_md = read(SKILLS_DIR / "README.md")

# Universal trigger phrase — top-level Claude scans for this in the subagent
# response and switches into takeover mode. Must be identical across all
# three files so the auto-takeover is unambiguous.
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
    f"orchestrator.md response starts with universal trigger phrase '{TRIGGER_PHRASE}'",
    TRIGGER_PHRASE in orchestrator_md,
    "top-level Claude scans for this exact phrase to switch into takeover mode",
)
check(
    "orchestrator.md response declares itself as a directive (not user report)",
    "directive to top-level Claude" in orchestrator_md,
    "framing must be imperative — drift toward 'status report' breaks auto-takeover",
)
check(
    "orchestrator.md anti-pattern: 'Do NOT ask the user'",
    "Do NOT ask the user" in orchestrator_md or "do NOT ask the user" in orchestrator_md,
    "imperative must forbid asking the user for confirmation",
)
check(
    "orchestrator.md anti-pattern: 'do NOT re-invoke `@orchestrator`'",
    "Do NOT re-invoke `@orchestrator`" in orchestrator_md
    or "do NOT re-invoke `@orchestrator`" in orchestrator_md,
    "must forbid recreating the nested condition",
)
check(
    "orchestrator.md response includes machine-parseable dispatch_handoff JSON block",
    "dispatch_handoff" in orchestrator_md and "next_dispatch" in orchestrator_md,
    "JSON handoff block must be present — top-level Claude parses it to extract next_dispatch.agent + phase + autonomy. The static playbook lives in CLAUDE.md §13 (not duplicated inline).",
)
check(
    "orchestrator.md response delegates takeover protocol to CLAUDE.md §13",
    "CLAUDE.md §13" in orchestrator_md or "CLAUDE.md §13 Universal rule" in orchestrator_md,
    "orchestrator must point at the canonical playbook in CLAUDE.md instead of duplicating it (issue #14 fix).",
)
check(
    "orchestrator.md Handoff template includes 'Next agent to dispatch:'",
    "Next agent to dispatch:" in orchestrator_md,
    "Handoff template must name the next agent for takeover",
)
check(
    "orchestrator.md Handoff template includes 'Probe error:'",
    "Probe error:" in orchestrator_md,
    "Handoff must record the literal probe error for debugging",
)
check(
    "orchestrator.md dispatch invariant #1 is conditional on probe success",
    "After a successful boot probe" in orchestrator_md,
    "invariant #1 must NOT unconditionally claim Task is present — that was the original bug",
)
# The "Tools in this invocation" section must NOT make unconditional Task claims.
# Empirical finding from Test B: when the section said "Task is on the list. You
# have Task." unconditionally, the agent emitted a hardcoded "Task is present"
# line as its opening response even when Task had been stripped — a hallucination
# cascade primed by the contradictory prose.
check(
    "orchestrator.md does NOT contain the unconditional 'Task is on the list' claim",
    "Task is on the list. You have `Task`" not in orchestrator_md
    and "Task is on the list. You have Task" not in orchestrator_md,
    "unconditional 'You have Task' claim primes a hallucination — must stay removed",
)
check(
    "orchestrator.md tools section explicitly warns that Task can be stripped at runtime",
    "strips `Task`" in orchestrator_md or "strips Task" in orchestrator_md,
    "tools section must acknowledge runtime stripping in nested invocations",
)
check(
    "orchestrator.md tools section forbids opening claims about Task before probe",
    "Do NOT emit any opening claim about `Task` availability before the boot probe" in orchestrator_md
    or "do NOT emit any opening claim about" in orchestrator_md.lower(),
    "explicit anti-hallucination instruction must remain",
)
check(
    "orchestrator.md boot ack line references the probe, not a static tools-confirmed claim",
    "dispatch probe OK — subagent dispatch verified by general-purpose probe" in orchestrator_md,
    "boot ack must derive from the probe result, not from a hardcoded tool list",
)
check(
    "orchestrator.md does NOT contain the legacy 'tools confirmed' acknowledgment",
    "[orchestrator boot] tools confirmed:" not in orchestrator_md,
    "legacy ack line was the hallucination vector — must stay removed",
)
check(
    "orchestrator.md 'never write code/tests/docs' contract still present (in invariants section)",
    "you NEVER write code/tests/docs" in orchestrator_md
    or "you are forbidden from writing" in orchestrator_md.lower()
    or "Never substitute yourself for a subagent" in orchestrator_md,
    "the no-inline-work contract for the orchestrator must remain (now in Dispatch invariants, not duplicated in the handoff response).",
)

# --- CLAUDE.md § 13 ---
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
    "CLAUDE.md rule explicitly says do NOT ask the user",
    "Do NOT ask the user" in claude_md or "do NOT ask the user" in claude_md,
    "rule must be imperative about not waiting for user confirmation",
)
check(
    "CLAUDE.md rule covers STAGE-GATE-2 autonomy semantics",
    "STAGE-GATE-2" in claude_md and ("autonomous" in claude_md or "autonomy" in claude_md),
    "takeover must respect autonomy gating between PRs (either word is acceptable; the new JSON-handoff design uses `autonomy.granted`).",
)
check(
    "CLAUDE.md rule covers STAGE-GATE-3 always-mandatory",
    "STAGE-GATE-3" in claude_md,
    "STAGE-GATE-3 always needs human approval — takeover must not bypass it",
)
check(
    "CLAUDE.md rule applies regardless of invocation mode",
    "regardless of how the orchestrator was invoked" in claude_md
    or "every entry mode" in claude_md,
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
    "0a", "0b", "1", "1.5", "1.6", "2", "2.5", "3", "3.5", "3.6", "4", "4.5", "5", "6",
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

# 6. Every skill file (top-level .md) has a frontmatter name that — if present —
#    matches its filename. Skills can omit frontmatter; only check when present.
SKILL_FILES = sorted(
    p.stem for p in SKILLS_DIR.glob("*.md") if p.stem != "README"
)
for skill_file in SKILL_FILES:
    path = SKILLS_DIR / f"{skill_file}.md"
    text = read(path)
    if not text.startswith("---"):
        continue  # skill without frontmatter — allowed
    fm = parse_frontmatter(text)
    declared = fm.get("name", "").strip()
    if not declared:
        continue
    check(
        f"skills/{skill_file}.md frontmatter name matches filename (if declared)",
        declared == skill_file,
        f"frontmatter name='{declared}' but file is '{skill_file}.md'",
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
    declared_routing_skills = set(re.findall(r"/([a-z][a-z0-9-]+)", routes_line_match.group(1)))
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
