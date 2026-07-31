#!/usr/bin/env python3
"""Structural checks for the initial Codex runtime vertical slice."""

import json
import pathlib
import subprocess
import sys
import tomllib


ROOT = pathlib.Path(__file__).resolve().parents[1]


def fail(message: str) -> None:
    raise AssertionError(message)


def main() -> None:
    contract = json.loads((ROOT / "runtime/schema/codex-agents.json").read_text())
    agents = contract["agents"]
    expected = {agent["name"] for agent in agents}
    if expected != {"architect", "implementer", "tester", "qa", "security", "delivery"}:
        fail(f"unexpected Codex vertical-slice roles: {sorted(expected)}")

    config = tomllib.loads((ROOT / ".codex/config.toml").read_text())
    if config["agents"]["enabled"] is not True:
        fail("Codex subagents must be enabled")

    generated = set()
    expected_identity = {
        "architect": ("opus/xhigh", "opus-xhigh"),
        "implementer": ("sonnet/high", "non-opus"),
        "tester": ("sonnet/high", "non-opus"),
        "qa": ("sonnet/high", "non-opus"),
        "security": ("opus/xhigh", "opus-xhigh"),
        "delivery": ("sonnet/medium", "non-opus"),
    }
    for path in (ROOT / ".codex/agents").glob("*.toml"):
        if path.is_symlink():
            fail(f"{path}: generated agent must not be a symlink")
        data = tomllib.loads(path.read_text())
        generated.add(data["name"])
        for required in ("name", "description", "sandbox_mode", "developer_instructions"):
            if not data.get(required):
                fail(f"{path}: missing {required}")
        if data["name"] not in expected_identity:
            fail(f"{path}: unexpected generated agent identity {data['name']!r}")
        source_marker, tier = expected_identity[data["name"]]
        content = path.read_text()
        markers = (
            "# Code generated from runtime/schema/codex-agents.json; DO NOT EDIT.",
            f"# Instruction source: runtime/codex/instructions/{data['name']}.md",
            f"# Semantic source: agents/{data['name']}.md ({source_marker})",
            f"# Projection tier: {tier}; profile: team-harness",
            f'name = "{data["name"]}"',
        )
        for marker in markers:
            if marker not in content.splitlines():
                fail(f"{path}: missing deterministic Team Harness marker {marker!r}")
        if data["sandbox_mode"] == "read-only" and data["name"] in {"implementer", "tester", "delivery"}:
            fail(f"{path}: write role is unexpectedly read-only")
    if generated != expected:
        fail(f"generated roles do not match contract: {sorted(generated)}")

    if (ROOT / "codex-plugin").exists():
        fail("legacy codex-plugin tree must not remain after the marketplace layout move")

    manifest = json.loads(
        (ROOT / "plugins/team-harness/.codex-plugin/plugin.json").read_text()
    )
    required_manifest = {
        "name", "version", "description", "author", "homepage", "repository",
        "license", "keywords", "skills", "interface",
    }
    if not required_manifest.issubset(manifest):
        fail(f"Codex plugin manifest is missing fields: {sorted(required_manifest - set(manifest))}")
    if manifest["name"] != "team-harness" or manifest["skills"] != "./skills/":
        fail("Codex plugin identity or skill root is invalid")
    if "hooks" in manifest:
        fail("Codex plugin manifest must not declare the unsupported hooks field")
    claude_plugin = json.loads((ROOT / ".claude-plugin/plugin.json").read_text())
    claude_market = json.loads((ROOT / ".claude-plugin/marketplace.json").read_text())
    claude_plugin_name = claude_plugin["name"]
    market_entries = [
        entry for entry in claude_market["plugins"]
        if entry.get("name") == claude_plugin_name
    ]
    if len(market_entries) != 1:
        fail(
            "Claude marketplace must declare exactly one entry for "
            f"{claude_plugin_name!r}"
        )
    versions = {
        claude_plugin["version"],
        market_entries[0]["version"],
        manifest["version"],
    }
    if len(versions) != 1:
        fail(f"Claude and Codex plugin versions must match: {sorted(versions)}")
    skill_root = ROOT / "plugins/team-harness" / manifest["skills"]
    if not skill_root.is_dir():
        fail("Codex plugin skills path does not exist")
    hooks = json.loads(
        (ROOT / "plugins/team-harness/hooks/hooks.json").read_text()
    )
    if "PreToolUse" not in hooks.get("hooks", {}):
        fail("Codex plugin default hooks/hooks.json must define PreToolUse")

    skill_names = {
        path.parent.name
        for path in (ROOT / "plugins/team-harness/skills").glob("*/SKILL.md")
    }
    if skill_names != {
        "init",
        "pipeline",
        "design",
        "implement",
        "validate",
        "deliver",
        "recover",
    }:
        fail(f"unexpected Codex skills: {sorted(skill_names)}")

    init = (ROOT / "plugins/team-harness/skills/init/SKILL.md").read_text()
    for marker in (
        "@Team-Harness init",
        "Do not create a workspace",
        "Do not preload its references before approval",
        "@Team-Harness pipeline <task>",
        "read `../pipeline/SKILL.md`",
        "does not change `Main`'s model",
    ):
        if marker not in init:
            fail(f"lightweight init contract is missing {marker!r}")
    if "references/activation.md" in init:
        fail("lightweight init must not preload the gated pipeline references")

    pipeline = (ROOT / "plugins/team-harness/skills/pipeline/SKILL.md").read_text()
    for role in ("architect", "implementer", "tester", "qa", "security", "delivery"):
        if f"{role}.toml" not in pipeline:
            fail(f"pipeline preflight does not name {role}.toml")
    for marker in (
        "$CODEX_HOME/agents/",
        "install apply --runtime codex",
        "install update --runtime codex",
        "plugin-only skills",
        "regular non-symlink file",
        "stale or unrelated shadow",
        "# Code generated from runtime/schema/codex-agents.json; DO NOT EDIT.",
        "# Projection tier: opus-xhigh; profile: team-harness",
        "# Projection tier: non-opus; profile: team-harness",
        "@Team-Harness pipeline <task>",
        "`@Team-Harness init` loads only the lightweight intake posture",
        "Do not create or dispatch a separate `orchestrator` agent",
        "does not change `Main`'s selected model",
    ):
        if marker not in pipeline:
            fail(f"pipeline preflight is missing {marker!r}")
    activation = (ROOT / "plugins/team-harness/skills/pipeline/references/activation.md").read_text()
    for marker in (
        "regular non-symlink file",
        "agents/architect.md (opus/xhigh)",
        "agents/delivery.md (sonnet/medium)",
        "install update --runtime codex",
        "generate.mjs --check",
    ):
        if marker not in activation:
            fail(f"pipeline activation preflight is missing {marker!r}")

    marketplace_check = subprocess.run(
        ["node", "tools/codex-runtime/validate-marketplace.mjs"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if marketplace_check.returncode != 0:
        fail(
            "Codex marketplace structure is invalid:\n"
            f"{marketplace_check.stdout}{marketplace_check.stderr}"
        )

    marketplace_tests = subprocess.run(
        ["node", "tools/codex-runtime/test_validate_marketplace.mjs"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if marketplace_tests.returncode != 0:
        fail(
            "Codex marketplace containment tests failed:\n"
            f"{marketplace_tests.stdout}{marketplace_tests.stderr}"
        )

    check = subprocess.run(
        ["node", "tools/codex-runtime/generate.mjs", "--check"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if check.returncode != 0:
        fail(f"generated artifacts are stale:\n{check.stdout}{check.stderr}")

    hook_check = subprocess.run(
        ["node", "tools/codex-runtime/sync-hooks.mjs", "--check"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if hook_check.returncode != 0:
        fail(f"Codex hook bundles are stale:\n{hook_check.stdout}{hook_check.stderr}")

    print("codex runtime structure: PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"codex runtime structure: FAIL: {error}", file=sys.stderr)
        raise
