#!/usr/bin/env python3
# tests/harness_scorecard.py
# Suite 13 (run-all.sh, informational) — deterministic harness health scorecard.
#
# Computes a 0–100 health score across 12 mechanically-checkable categories
# by reading the shipped repo artifacts. REPORT-only: the only file this script
# ever writes is tests/harness_scorecard_baseline.json, and only under
# the explicit --write-baseline flag.
#
# Properties:
#   - stdlib-only (no clock, no randomness, no network)
#   - sorted file iteration
#   - integer-only arithmetic throughout
#   - .as_posix() path normalization
#   - fixed category order (deterministic JSON output)
#
# Usage:
#   python3 tests/harness_scorecard.py               # table + JSON, exit 0
#   python3 tests/harness_scorecard.py --json        # JSON only, exit 0
#   python3 tests/harness_scorecard.py --gate        # exit 1 if score < baseline
#   python3 tests/harness_scorecard.py --write-baseline  # overwrite baseline JSON
#   python3 tests/harness_scorecard.py --help        # print legend, no compute

from __future__ import annotations

import io
import json
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Stdout encoding guard (mirrors test_security_scan.py)
# ---------------------------------------------------------------------------
if sys.stdout.encoding and sys.stdout.encoding.lower().startswith("cp"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = REPO_ROOT / "agents"
SKILLS_DIR = REPO_ROOT / "skills"
HOOKS_DIR = REPO_ROOT / "hooks"
PLUGIN_DIR = REPO_ROOT / ".claude-plugin"
TESTS_DIR = REPO_ROOT / "tests"
BASELINE_PATH = TESTS_DIR / "harness_scorecard_baseline.json"

# ---------------------------------------------------------------------------
# Constants mirrored from test_agent_structure.py (single source of truth)
# ---------------------------------------------------------------------------
EXPECTED_AGENTS = [
    "orchestrator", "architect", "agent-builder", "security", "reviewer",
    "reviewer-consolidator",
    "qa", "qa-plan", "gcp-cost-analyzer", "gcp-infra", "init", "implementer", "tester",
    "acceptance-checker", "plan-reviewer", "diagrammer", "likec4-diagrammer",
    "d2-diagrammer", "translator", "delivery", "mentor",
    "researcher", "research-consolidator",
]

READ_ONLY_AGENTS = {
    "architect", "security", "qa", "qa-plan",
    "acceptance-checker", "plan-reviewer", "mentor",
}

# Worker agents: non-orchestrator, non-ref files that should carry the 5 mandatory sections
WORKER_AGENTS = [
    a for a in EXPECTED_AGENTS
    if a not in {"orchestrator"}
]

# Mandatory sections that every worker agent must carry
MANDATORY_SECTIONS = [
    "## Core Philosophy",
    "## Session Context Protocol",
    "## Session Documentation",
    "## Execution Log Protocol",
    "## Return Protocol",
]

# The 12 categories in fixed order
CATEGORIES = [
    "agent_frontmatter_completeness",
    "skill_structural_validity",
    "hook_manifest_canonical_form",
    "hook_script_resolution",
    "test_suite_coverage_presence",
    "docs_testing_registry_sync",
    "version_sync_plugin_marketplace",
    "injection_preamble_coverage",
    "readonly_tier_tool_discipline",
    "agent_required_sections_presence",
    "model_effort_field_presence",
    "return_protocol_status_block_presence",
]

# Max points per category (in CATEGORIES order)
MAX_PER_CATEGORY = {
    "agent_frontmatter_completeness": 10,
    "skill_structural_validity": 10,
    "hook_manifest_canonical_form": 8,
    "hook_script_resolution": 8,
    "test_suite_coverage_presence": 8,
    "docs_testing_registry_sync": 8,
    "version_sync_plugin_marketplace": 10,
    "injection_preamble_coverage": 10,
    "readonly_tier_tool_discipline": 8,
    "agent_required_sections_presence": 8,
    "model_effort_field_presence": 8,
    "return_protocol_status_block_presence": 6,
}

MAX_TOTAL = sum(MAX_PER_CATEGORY.values())  # 102

# Canonical hook command pattern (mirrors test_security_scan.py)
CANONICAL_CMD_PATTERN = re.compile(
    r"^bash\s+(?:\$\{?[A-Z_]+\}?|~)(?:/\.claude)?/hooks/[A-Za-z0-9_\-\.]+\.sh$"
)

# Prompt-injection preamble heading (mirrors test_security_scan.py / §6.6)
INJECTION_FLOOR_HEADING = "## Untrusted content & prompt-injection floor"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def read(path: Path) -> str:
    """Read a file as UTF-8, replacing undecodable bytes."""
    return path.read_text(encoding="utf-8", errors="replace")


def parse_frontmatter(text: str) -> dict[str, str]:
    """Extract the YAML frontmatter block as a flat key→value dict."""
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


def tools_list(fm: dict[str, str]) -> list[str]:
    """Parse the tools: field into a list of stripped tool names."""
    raw = fm.get("tools", "")
    if not raw:
        return []
    return [t.strip() for t in raw.split(",")]


def skill_files() -> list[Path]:
    """Return all SKILL.md paths (both subdirectory and flat legacy layout)."""
    paths: list[Path] = []
    if not SKILLS_DIR.exists():
        return paths
    for entry in sorted(SKILLS_DIR.iterdir()):
        if entry.is_dir():
            skill_md = entry / "SKILL.md"
            if skill_md.exists():
                paths.append(skill_md)
        elif entry.is_file() and entry.suffix == ".md":
            paths.append(entry)
    return paths


def load_hooks_json() -> dict:
    """Load .claude-plugin/hooks.json; return {} on failure."""
    path = PLUGIN_DIR / "hooks.json"
    if not path.exists():
        return {}
    try:
        return json.loads(read(path))
    except (json.JSONDecodeError, OSError):
        return {}


def collect_hook_entries(data: dict) -> list[str]:
    """Return all command strings from the hooks.json hooks block."""
    cmds: list[str] = []
    hooks_block = data.get("hooks", {})
    for _event, entries in hooks_block.items():
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            for hook in entry.get("hooks", []):
                if isinstance(hook, dict):
                    cmd = hook.get("command", "")
                    if cmd:
                        cmds.append(cmd)
    return cmds


# ---------------------------------------------------------------------------
# Category scorers — integer arithmetic throughout
# ---------------------------------------------------------------------------

def score_agent_frontmatter_completeness() -> tuple[int, int]:
    """Cat 1: every expected agent has all 5 frontmatter keys non-empty."""
    max_val = MAX_PER_CATEGORY["agent_frontmatter_completeness"]
    required_keys = {"name", "description", "model", "color", "tools"}
    complete = 0
    total = len(EXPECTED_AGENTS)
    for agent_name in EXPECTED_AGENTS:
        path = AGENTS_DIR / f"{agent_name}.md"
        if not path.exists():
            continue
        fm = parse_frontmatter(read(path))
        if all(fm.get(k, "") for k in required_keys):
            complete += 1
    if total == 0:
        return 0, max_val
    return (max_val * complete) // total, max_val


def score_skill_structural_validity() -> tuple[int, int]:
    """Cat 2: every skills/*/SKILL.md opens with frontmatter carrying name: and description:."""
    max_val = MAX_PER_CATEGORY["skill_structural_validity"]
    files = skill_files()
    total = len(files)
    valid = 0
    for path in files:
        fm = parse_frontmatter(read(path))
        if fm.get("name", "") and fm.get("description", ""):
            valid += 1
    if total == 0:
        return max_val, max_val
    return (max_val * valid) // total, max_val


def score_hook_manifest_canonical_form() -> tuple[int, int]:
    """Cat 3: every command in hooks.json matches the canonical bash <root>/hooks/<script>.sh form."""
    max_val = MAX_PER_CATEGORY["hook_manifest_canonical_form"]
    data = load_hooks_json()
    cmds = collect_hook_entries(data)
    total = len(cmds)
    if total == 0:
        return max_val, max_val
    canonical = sum(1 for c in cmds if CANONICAL_CMD_PATTERN.match(c.strip()))
    return (max_val * canonical) // total, max_val


def score_hook_script_resolution() -> tuple[int, int]:
    """Cat 4: every hook script referenced in hooks.json resolves to an existing file under hooks/."""
    max_val = MAX_PER_CATEGORY["hook_script_resolution"]
    data = load_hooks_json()
    cmds = collect_hook_entries(data)
    if not cmds:
        return max_val, max_val
    # Extract script name from canonical commands; skip non-canonical
    script_pattern = re.compile(r"/hooks/([A-Za-z0-9_\-\.]+\.sh)$")
    scripts: list[str] = []
    for cmd in cmds:
        m = script_pattern.search(cmd.strip())
        if m:
            scripts.append(m.group(1))
    total = len(scripts)
    if total == 0:
        return max_val, max_val
    resolved = sum(1 for s in scripts if (HOOKS_DIR / s).exists())
    return (max_val * resolved) // total, max_val


def score_test_suite_coverage_presence() -> tuple[int, int]:
    """Cat 5: run-all.sh referenced suites have backing test files; test_*.py/sh are wired."""
    max_val = MAX_PER_CATEGORY["test_suite_coverage_presence"]
    run_all = TESTS_DIR / "run-all.sh"
    if not run_all.exists():
        return 0, max_val

    content = read(run_all)

    # Collect test files referenced in run-all.sh
    referenced_files: set[str] = set()
    for m in re.finditer(r'"\$TESTS_DIR/([^"]+)"', content):
        referenced_files.add(m.group(1))

    # Collect test files on disk
    present_files: set[str] = set()
    for p in sorted(TESTS_DIR.glob("test_*.py")):
        present_files.add(p.name)
    for p in sorted(TESTS_DIR.glob("test_*.sh")):
        present_files.add(p.name)

    # Two-way coverage: referenced-and-present vs max(referenced, present)
    wired_and_present = len(referenced_files & present_files)
    universe = max(len(referenced_files), len(present_files))
    if universe == 0:
        return max_val, max_val
    return (max_val * wired_and_present) // universe, max_val


def score_docs_testing_registry_sync() -> tuple[int, int]:
    """Cat 6: every Suite N in run-all.sh is documented in docs/testing.md."""
    max_val = MAX_PER_CATEGORY["docs_testing_registry_sync"]
    run_all = TESTS_DIR / "run-all.sh"
    testing_md = REPO_ROOT / "docs" / "testing.md"
    if not run_all.exists() or not testing_md.exists():
        return 0, max_val

    run_all_content = read(run_all)
    testing_content = read(testing_md)

    # Find all "Suite N:" references in run-all.sh comments
    wired_suites: set[str] = set(re.findall(r"Suite\s+(\d+)", run_all_content))
    if not wired_suites:
        return max_val, max_val

    documented = sum(1 for n in wired_suites if f"Suite {n}" in testing_content)
    return (max_val * documented) // len(wired_suites), max_val


def score_version_sync_plugin_marketplace() -> tuple[int, int]:
    """Cat 7: plugin.json version == marketplace.json plugins[0].version."""
    max_val = MAX_PER_CATEGORY["version_sync_plugin_marketplace"]
    plugin_json = PLUGIN_DIR / "plugin.json"
    marketplace_json = PLUGIN_DIR / "marketplace.json"
    if not plugin_json.exists() or not marketplace_json.exists():
        return 0, max_val
    try:
        pj = json.loads(read(plugin_json))
        mj = json.loads(read(marketplace_json))
    except (json.JSONDecodeError, OSError):
        return 0, max_val

    plugin_ver = pj.get("version", "")
    plugins = mj.get("plugins", [])
    market_ver = plugins[0].get("version", "") if plugins else ""

    if plugin_ver and market_ver and plugin_ver == market_ver:
        return max_val, max_val
    return 0, max_val


def score_injection_preamble_coverage() -> tuple[int, int]:
    """Cat 8: every web-facing agent (WebFetch/WebSearch in tools:) carries the §6.6 preamble."""
    max_val = MAX_PER_CATEGORY["injection_preamble_coverage"]
    web_facing_total = 0
    web_facing_with_preamble = 0
    for agent_name in EXPECTED_AGENTS:
        path = AGENTS_DIR / f"{agent_name}.md"
        if not path.exists():
            continue
        content = read(path)
        fm = parse_frontmatter(content)
        agent_tools = tools_list(fm)
        if "WebFetch" not in agent_tools and "WebSearch" not in agent_tools:
            continue
        web_facing_total += 1
        if INJECTION_FLOOR_HEADING in content:
            web_facing_with_preamble += 1
    if web_facing_total == 0:
        return max_val, max_val
    return (max_val * web_facing_with_preamble) // web_facing_total, max_val


def score_readonly_tier_tool_discipline() -> tuple[int, int]:
    """Cat 9: no read-only-tier agent carries Bash in tools:."""
    max_val = MAX_PER_CATEGORY["readonly_tier_tool_discipline"]
    readonly_total = len(READ_ONLY_AGENTS)
    if readonly_total == 0:
        return max_val, max_val
    clean = 0
    for agent_name in sorted(READ_ONLY_AGENTS):
        path = AGENTS_DIR / f"{agent_name}.md"
        if not path.exists():
            clean += 1  # missing file is not a Bash grant
            continue
        fm = parse_frontmatter(read(path))
        if "Bash" not in tools_list(fm):
            clean += 1
    return (max_val * clean) // readonly_total, max_val


def score_agent_required_sections_presence() -> tuple[int, int]:
    """Cat 10: every worker agent contains the 5 mandatory ## sections."""
    max_val = MAX_PER_CATEGORY["agent_required_sections_presence"]
    n_agents = len(WORKER_AGENTS)
    if n_agents == 0:
        return max_val, max_val
    n_sections = len(MANDATORY_SECTIONS)
    total_slots = n_agents * n_sections
    if total_slots == 0:
        return max_val, max_val
    sections_present = 0
    for agent_name in WORKER_AGENTS:
        path = AGENTS_DIR / f"{agent_name}.md"
        if not path.exists():
            continue
        content = read(path)
        for section in MANDATORY_SECTIONS:
            if section in content:
                sections_present += 1
    return (max_val * sections_present) // total_slots, max_val


def score_model_effort_field_presence() -> tuple[int, int]:
    """Cat 11: every non-ref agent declares model: and effort:, and effort is not 'low'."""
    max_val = MAX_PER_CATEGORY["model_effort_field_presence"]
    non_ref_agents = [a for a in EXPECTED_AGENTS if not a.startswith("ref-")]
    total = len(non_ref_agents)
    if total == 0:
        return max_val, max_val
    ok = 0
    for agent_name in non_ref_agents:
        path = AGENTS_DIR / f"{agent_name}.md"
        if not path.exists():
            continue
        fm = parse_frontmatter(read(path))
        model_val = fm.get("model", "")
        effort_val = fm.get("effort", "")
        if model_val and effort_val and effort_val.strip() != "low":
            ok += 1
    return (max_val * ok) // total, max_val


def score_return_protocol_status_block_presence() -> tuple[int, int]:
    """Cat 12: every worker agent has ## Return Protocol AND a status-block marker."""
    max_val = MAX_PER_CATEGORY["return_protocol_status_block_presence"]
    total = len(WORKER_AGENTS)
    if total == 0:
        return max_val, max_val
    ok = 0
    for agent_name in WORKER_AGENTS:
        path = AGENTS_DIR / f"{agent_name}.md"
        if not path.exists():
            continue
        content = read(path)
        has_section = "## Return Protocol" in content
        # Status-block convention: "agent:" line or "status:" field inside a fenced block
        has_status_block = "agent:" in content or "status:" in content
        if has_section and has_status_block:
            ok += 1
    return (max_val * ok) // total, max_val


# ---------------------------------------------------------------------------
# Score computation
# ---------------------------------------------------------------------------

SCORERS = [
    score_agent_frontmatter_completeness,
    score_skill_structural_validity,
    score_hook_manifest_canonical_form,
    score_hook_script_resolution,
    score_test_suite_coverage_presence,
    score_docs_testing_registry_sync,
    score_version_sync_plugin_marketplace,
    score_injection_preamble_coverage,
    score_readonly_tier_tool_discipline,
    score_agent_required_sections_presence,
    score_model_effort_field_presence,
    score_return_protocol_status_block_presence,
]


def compute_scores() -> dict:
    """Compute all category scores and the normalized total. Returns the score object."""
    categories: dict[str, dict[str, int]] = {}
    earned_total = 0
    for key, scorer in zip(CATEGORIES, SCORERS):
        earned, max_val = scorer()
        categories[key] = {"earned": earned, "max": max_val}
        earned_total += earned

    # Normalized score — integer floor division (deterministic across platforms)
    score = (100 * earned_total) // MAX_TOTAL

    return {
        "schema_version": 1,
        "score": score,
        "earned_total": earned_total,
        "max_total": MAX_TOTAL,
        "categories": categories,
    }


def build_json(score_obj: dict) -> str:
    """Serialize the score object to a stable, deterministic JSON string."""
    # Build the output dict in the fixed category order (not sort_keys)
    output: dict = {
        "schema_version": score_obj["schema_version"],
        "score": score_obj["score"],
        "earned_total": score_obj["earned_total"],
        "max_total": score_obj["max_total"],
        "categories": {
            key: score_obj["categories"][key]
            for key in CATEGORIES
        },
    }
    return json.dumps(output, sort_keys=False, indent=2)


def load_baseline() -> dict | None:
    """Load the committed baseline JSON. Returns None if missing or invalid."""
    if not BASELINE_PATH.exists():
        return None
    try:
        data = json.loads(read(BASELINE_PATH))
        if isinstance(data.get("score"), int) and isinstance(data.get("categories"), dict):
            return data
    except (json.JSONDecodeError, OSError):
        pass
    return None


def print_table(score_obj: dict, baseline: dict | None) -> None:
    """Print the human-readable scorecard table to stdout."""
    categories = score_obj["categories"]
    print("=== team-harness scorecard ===")
    print()
    col_w = 42
    print(f"{'Category':<{col_w}} {'Earned / Max':>12}")
    for key in CATEGORIES:
        cat = categories[key]
        print(f"{key:<{col_w}} {cat['earned']:>6} / {cat['max']:<4}")
    print("-" * (col_w + 14))

    earned_total = score_obj["earned_total"]
    max_total = score_obj["max_total"]
    score = score_obj["score"]
    print(f"{'TOTAL':<{col_w}} {earned_total:>6} / {max_total:<4}")

    if baseline is not None:
        base_score = baseline.get("score", score)
        delta = score - base_score
        delta_str = f"{delta:+d}" if delta != 0 else "0"
        print(f"{'SCORE':<{col_w}} {score:>6} / 100    (baseline {base_score}, delta {delta_str})")
    else:
        print(f"{'SCORE':<{col_w}} {score:>6} / 100    (no baseline)")
    print()


# ---------------------------------------------------------------------------
# Help text
# ---------------------------------------------------------------------------

HELP_TEXT = """\
/th:harness-audit — deterministic harness health scorecard

Same-commit-same-score: given the same repo tree, every invocation produces
the same JSON (stdlib-only, no clock, no randomness, no network).

Categories (12):
  1  agent_frontmatter_completeness      max 10
  2  skill_structural_validity           max 10
  3  hook_manifest_canonical_form        max  8
  4  hook_script_resolution              max  8
  5  test_suite_coverage_presence        max  8
  6  docs_testing_registry_sync          max  8
  7  version_sync_plugin_marketplace     max 10
  8  injection_preamble_coverage         max 10
  9  readonly_tier_tool_discipline        max  8
  10 agent_required_sections_presence    max  8
  11 model_effort_field_presence         max  8
  12 return_protocol_status_block_presence max 6
  ---
     Total max                               102

Flags:
  (none)            Compute and print table + JSON. Exit 0.
  --json            Print ONLY the canonical JSON. Exit 0.
  --gate            Exit 1 if score < baseline score (opt-in hard gate).
  --write-baseline  Overwrite tests/harness_scorecard_baseline.json.
  --help            Print this message. Do not compute.

REPORT-only: no --fix, no write to any audited file.
The only write is --write-baseline to tests/harness_scorecard_baseline.json.
"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    args = sys.argv[1:]
    if "--help" in args:
        print(HELP_TEXT)
        sys.exit(0)

    json_only = "--json" in args
    gate_mode = "--gate" in args
    write_baseline = "--write-baseline" in args

    score_obj = compute_scores()
    json_str = build_json(score_obj)
    baseline = load_baseline()

    if write_baseline:
        # Write-baseline: the ONLY sanctioned write operation in this scorer.
        # Targets only tests/harness_scorecard_baseline.json.
        BASELINE_PATH.write_text(json_str + "\n", encoding="utf-8")
        print(f"Baseline written to {BASELINE_PATH.relative_to(REPO_ROOT).as_posix()}")
        print(f"Score: {score_obj['score']}/100")
        sys.exit(0)

    if json_only:
        print(json_str)
        sys.exit(0)

    print_table(score_obj, baseline)
    print("--- scorecard.json ---")
    print(json_str)

    if gate_mode and baseline is not None:
        base_score = baseline.get("score", score_obj["score"])
        if score_obj["score"] < base_score:
            print()
            print(f"GATE FAIL: score {score_obj['score']} < baseline {base_score}")
            sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
