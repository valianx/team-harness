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
