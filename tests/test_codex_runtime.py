#!/usr/bin/env python3
"""Structural checks for the initial Codex runtime vertical slice."""

import json
import os
import pathlib
import stat
import subprocess
import sys
import tempfile
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
    if config.get("sandbox_mode") != "workspace-write":
        fail("Codex project must use workspace-write sandbox mode")
    if config.get("approval_policy") != "on-request":
        fail("Codex project must preserve scoped approval requests")
    if config.get("sandbox_workspace_write", {}).get("network_access") is not True:
        fail("Codex project sandbox must allow dependency network access")
    expected_caches = {
        "GOCACHE": "/tmp/team-harness-go-cache",
        "UV_CACHE_DIR": "/tmp/team-harness-uv-cache",
        "npm_config_cache": "/tmp/team-harness-npm-cache",
    }
    if config.get("shell_environment_policy", {}).get("set") != expected_caches:
        fail("Codex project must route tool caches to dedicated /tmp paths")

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
        "setup",
        "update",
        "init",
        "pipeline",
        "design",
        "implement",
        "validate",
        "deliver",
        "recover",
    }:
        fail(f"unexpected Codex skills: {sorted(skill_names)}")

    setup = (ROOT / "plugins/team-harness/skills/setup/SKILL.md").read_text()
    update = (ROOT / "plugins/team-harness/skills/update/SKILL.md").read_text()
    for marker in (
        "${CODEX_HOME:-$HOME/.codex}/.team-harness.json",
        "scripts/manage_config.py",
        "codex mcp add memory",
        "install apply --runtime codex",
        "Never create or modify",
    ):
        if marker not in setup:
            fail(f"Codex setup skill is missing {marker!r}")
    for marker in (
        "codex plugin marketplace upgrade team-harness",
        "codex plugin remove team-harness@team-harness",
        "codex plugin add team-harness@team-harness",
        "install update --runtime codex",
        "start a new Codex thread",
    ):
        if marker not in update:
            fail(f"Codex update skill is missing {marker!r}")

    config_script = ROOT / "plugins/team-harness/skills/setup/scripts/manage_config.py"
    with tempfile.TemporaryDirectory() as temp_root:
        env = {**os.environ, "CODEX_HOME": temp_root}
        first = subprocess.run(
            [
                sys.executable,
                str(config_script),
                "set",
                "--set",
                'logs-mode="local"',
                "--set",
                'language="es"',
                "--version",
                manifest["version"],
            ],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if first.returncode != 0:
            fail(f"Codex setup config helper failed: {first.stdout}{first.stderr}")
        settings_path = pathlib.Path(temp_root) / ".team-harness.json"
        settings = json.loads(settings_path.read_text())
        if settings.get("logs-mode") != "local" or settings.get("language") != "es":
            fail("Codex setup config helper did not preserve requested values")
        if settings.get("installed_version") != manifest["version"]:
            fail("Codex setup config helper did not stamp the plugin version")
        if stat.S_IMODE(settings_path.stat().st_mode) != 0o600:
            fail("Codex setup config helper must write settings at mode 0600")
        second = subprocess.run(
            [sys.executable, str(config_script), "set", "--set", 'language="en"'],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if second.returncode != 0 or not settings_path.with_name(".team-harness.json.bak").is_file():
            fail("Codex setup config helper did not create its rolling backup")
        invalid = subprocess.run(
            [sys.executable, str(config_script), "set", "--set", 'logs-path="/"'],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if invalid.returncode == 0:
            fail("Codex setup config helper accepted a filesystem-root logs path")

    with tempfile.TemporaryDirectory() as temp_root:
        temp = pathlib.Path(temp_root)
        home = temp / "home"
        codex_home = home / ".codex"
        claude_home = home / ".claude"
        claude_home.mkdir(parents=True)
        source_secret = "private-import-value-572"
        (claude_home / ".team-harness.json").write_text(json.dumps({
            "logs-mode": "obsidian",
            "language": "es",
            "custom": {"opaque_plain": source_secret, "nested": 7},
            "autogate": {"pr_create": True},
        }))
        env = {**os.environ, "HOME": str(home), "CODEX_HOME": str(codex_home)}
        inspect = subprocess.run(
            [sys.executable, str(config_script), "inspect-import", "--from", "claude"],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if inspect.returncode != 0 or source_secret in inspect.stdout + inspect.stderr:
            fail("Codex import inspection failed or disclosed a source value")
        imported = subprocess.run(
            [sys.executable, str(config_script), "import", "--from", "claude"],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if imported.returncode != 0 or source_secret in imported.stdout + imported.stderr:
            fail("Codex config import failed or disclosed a copied value")
        imported_doc = json.loads((codex_home / ".team-harness.json").read_text())
        if imported_doc.get("custom", {}).get("opaque_plain") != source_secret:
            fail("Codex config import did not copy opaque nested values")
        if imported_doc.get("autogate", {}).get("pr_create") is not True:
            fail("Codex config import did not preserve an opaque authorization-like value")
        shown = subprocess.run(
            [sys.executable, str(config_script), "show"],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if shown.returncode != 0 or source_secret in shown.stdout + shown.stderr:
            fail("Codex config display disclosed a copied sensitive value")
        shown_doc = json.loads(shown.stdout)
        if "custom" in shown_doc.get("config", {}):
            fail("Codex config display exposed an opaque imported object")
        opencode_home = home / ".config" / "opencode"
        opencode_home.mkdir(parents=True)
        opencode_secret = "opaque-opencode-value-572"
        (opencode_home / ".team-harness.json").write_text(json.dumps({
            "opencode_only": {"api_key": opencode_secret},
            "language": "pt",
        }))
        imported_opencode = subprocess.run(
            [sys.executable, str(config_script), "import", "--from", "opencode"],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if imported_opencode.returncode != 0 or opencode_secret in imported_opencode.stdout + imported_opencode.stderr:
            fail("opencode config import failed or disclosed a copied value")
        merged_doc = json.loads((codex_home / ".team-harness.json").read_text())
        if merged_doc.get("opencode_only", {}).get("api_key") != opencode_secret:
            fail("Codex config import did not copy opencode-only values")
        if merged_doc.get("language") != "es":
            fail("opencode import overwrote a value already imported from Claude")

    if (ROOT / "agents/init.md").exists():
        fail("the ambiguous project initializer name must not remain")
    project_init = (ROOT / "agents/init-project.md").read_text()
    if "name: init-project" not in project_init:
        fail("the project initializer role was not renamed to init-project")
    routing = (ROOT / "agents/ref-pipeline.md").read_text()
    if "dispatch `init-project` directly" not in routing:
        fail("bootstrap routing does not target init-project")

    init = (ROOT / "plugins/team-harness/skills/init/SKILL.md").read_text()
    for marker in (
        "@Team-Harness init",
        "references/configuration.md",
        "resolve persistent Team Harness",
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
    config_resolution = (
        ROOT / "plugins/team-harness/skills/init/references/configuration.md"
    ).read_text()
    for marker in (
        "${CODEX_HOME:-$HOME/.codex}/.team-harness.json",
        "~/.claude/.team-harness.json",
        "OPENCODE_CONFIG_DIR",
        "read-only",
        "does not authorize creating a workspace",
    ):
        if marker not in config_resolution:
            fail(f"direct-mode configuration contract is missing {marker!r}")
    for direct_name in ("design", "implement", "validate", "deliver"):
        direct = (ROOT / f"plugins/team-harness/skills/{direct_name}/SKILL.md").read_text()
        if "../init/references/configuration.md" not in direct:
            fail(f"{direct_name} direct fallback does not load persistent configuration")

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
    if "${CODEX_HOME:-$HOME/.codex}/.team-harness.json" not in activation:
        fail("pipeline activation must prefer the Codex-native Team Harness config")

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
