#!/usr/bin/env python3
"""Structural checks for the initial Codex runtime vertical slice."""

import json
import os
import pathlib
import stat
import hashlib
import re
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
    architect_contract = next(agent for agent in agents if agent["name"] == "architect")
    if architect_contract["sandbox_mode"] != "workspace-write":
        fail("Codex architect must be able to write its assigned plan artifacts")
    if "filesystem-write" not in architect_contract["capabilities"]:
        fail("Codex architect is missing its bounded filesystem-write capability")

    config = tomllib.loads((ROOT / ".codex/config.toml").read_text())
    if config["agents"]["enabled"] is not True:
        fail("Codex subagents must be enabled")
    if config.get("sandbox_mode") != "workspace-write":
        fail("Codex project must use workspace-write sandbox mode")
    if config.get("approval_policy") != "on-request":
        fail("Codex project must preserve scoped approval requests")
    if config.get("sandbox_workspace_write", {}).get("network_access") is not True:
        fail("Codex project sandbox must allow dependency network access")
    expected_cache_roots = [
        "~/.cache/go-build",
        "~/.cache/uv",
        "~/.npm",
        "~/go/pkg/mod",
    ]
    if config.get("sandbox_workspace_write", {}).get("writable_roots") != expected_cache_roots:
        fail("Codex project must allow only user-scoped tool cache paths")
    if "shell_environment_policy" in config:
        fail("Codex project must not override tool caches with shared paths")

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
        if data["sandbox_mode"] == "read-only" and data["name"] in {"architect", "implementer", "tester", "delivery"}:
            fail(f"{path}: write role is unexpectedly read-only")
    if generated != expected:
        fail(f"generated roles do not match contract: {sorted(generated)}")

    # The generated TOML is the runtime projection of each compact adapter.
    # Compare the parsed instruction value directly instead of relying only on
    # generator freshness, so a stale adapter/TOML pair cannot pass unnoticed.
    for agent in agents:
        role = agent["name"]
        instruction_path = ROOT / agent["instruction_source"]
        output_path = ROOT / agent["output_path"]
        if not instruction_path.is_file():
            fail(f"{role}: instruction source is missing")
        if not output_path.is_file():
            fail(f"{role}: generated TOML is missing")
        projected = tomllib.loads(output_path.read_text())
        expected_instructions = instruction_path.read_text().strip()
        if projected.get("developer_instructions") != expected_instructions:
            fail(f"{role}: TOML developer_instructions drift from runtime adapter")

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
    if "PermissionRequest" in hooks.get("hooks", {}):
        fail("Codex plugin must leave approval requests to native permissions")
    hook_commands = [
        hook["command"]
        for group in hooks["hooks"]["PreToolUse"]
        for hook in group.get("hooks", [])
    ]
    if len(hook_commands) != 2 or not all(
        any(name in command for command in hook_commands)
        for name in ("policy-block", "gcp-guard")
    ):
        fail("Codex plugin must wire exactly the two deterministic-deny hooks")
    if any(
        retired in command
        for command in hook_commands
        for retired in ("dev-guard", "gate-guard", "prepublish-guard", "worktree-guard")
    ):
        fail("Codex plugin still wires an approval-classifying hook")

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
        "scripts/manage_agents.py",
        "manage_config.py ensure --version 3.6.3",
        "codex mcp add memory",
        "@upstash/context7-mcp@3.2.5",
        "manage_agents.py sync --scope SCOPE",
        "never modify their files",
    ):
        if marker not in setup:
            fail(f"Codex setup skill is missing {marker!r}")
    setup_targets_match = re.search(
        r"Supported targets are(?P<targets>.*?)(?:\n\n|\Z)",
        setup,
        re.IGNORECASE | re.DOTALL,
    )
    if setup_targets_match is None:
        fail("Codex setup does not declare its supported targets")
    setup_targets = setup_targets_match.group("targets").lower()
    if "lane-autoselect" in setup_targets:
        fail("Codex setup must not advertise lane-autoselect as a supported target")
    if re.search(r"(?im)^\s*-\s*lane auto-select\s+is\b", setup):
        fail("Codex setup must not advertise an active lane-autoselect value")
    for marker in ("migration-only", "1 — inline", "2 — pipeline"):
        if marker not in setup.lower():
            fail(f"Codex setup lane migration guidance is missing {marker!r}")
    for marker in (
        "codex plugin marketplace upgrade team-harness",
        "codex plugin remove team-harness@team-harness",
        "codex plugin add team-harness@team-harness",
        "manage_config.py ensure --version NEW_VERSION",
        "manage_agents.py sync --scope SCOPE",
        "Even when plugin versions compare equal",
        "start a new Codex thread",
    ):
        if marker not in update:
            fail(f"Codex update skill is missing {marker!r}")

    config_script = ROOT / "plugins/team-harness/skills/setup/scripts/manage_config.py"
    agents_script = ROOT / "plugins/team-harness/skills/setup/scripts/manage_agents.py"
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
        settings_mtime = settings_path.stat().st_mtime_ns
        backup_bytes = settings_path.with_name(".team-harness.json.bak").read_bytes()
        unchanged = subprocess.run(
            [sys.executable, str(config_script), "set", "--set", 'language="en"'],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if unchanged.returncode != 0 or json.loads(unchanged.stdout).get("changed") is not False:
            fail("Codex setup config helper did not report an unchanged set as a no-op")
        if settings_path.stat().st_mtime_ns != settings_mtime:
            fail("Codex setup config helper replaced the config during a no-op")
        if settings_path.with_name(".team-harness.json.bak").read_bytes() != backup_bytes:
            fail("Codex setup config helper replaced its backup during a no-op")
        invalid = subprocess.run(
            [sys.executable, str(config_script), "set", "--set", 'logs-path="/"'],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if invalid.returncode == 0:
            fail("Codex setup config helper accepted a filesystem-root logs path")
        short_sk = subprocess.run(
            [sys.executable, str(config_script), "set", "--set", 'logs-subfolder="sk-a"'],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if short_sk.returncode != 0:
            fail("Codex setup config helper treated a short sk- string as a secret")
        realistic_sk = "sk-" + "A" * 20
        secret_like = subprocess.run(
            [
                sys.executable,
                str(config_script),
                "set",
                "--set",
                f'logs-subfolder="{realistic_sk}"',
            ],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if secret_like.returncode == 0:
            fail("Codex setup config helper accepted a realistic sk- secret")

    with tempfile.TemporaryDirectory() as temp_root:
        temp = pathlib.Path(temp_root)
        env = {**os.environ, "CODEX_HOME": str(temp / "codex-home")}
        ensured = subprocess.run(
            [sys.executable, str(config_script), "ensure", "--version", manifest["version"]],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if ensured.returncode != 0:
            fail(f"Codex config ensure failed: {ensured.stdout}{ensured.stderr}")
        ensured_doc = json.loads((temp / "codex-home/.team-harness.json").read_text())
        if ensured_doc.get("logs-mode") != "local":
            fail("Codex config ensure did not install safe local defaults")
        if ensured_doc.get("agent-scope") != "global":
            fail("Codex config ensure did not persist the global agent default")
        synced = subprocess.run(
            [sys.executable, str(agents_script), "sync", "--scope", "global"],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if synced.returncode != 0:
            fail(f"Codex bundled-agent sync failed: {synced.stdout}{synced.stderr}")
        sync_result = json.loads(synced.stdout)
        if set(sync_result.get("changed", [])) != expected:
            fail("Codex bundled-agent sync did not install all six roles")
        for role in expected:
            installed = temp / "codex-home/agents" / f"{role}.toml"
            packaged = ROOT / "plugins/team-harness/skills/setup/assets/agents" / f"{role}.toml"
            if installed.read_bytes() != packaged.read_bytes():
                fail(f"Codex bundled-agent sync changed {role} bytes")
            if stat.S_IMODE(installed.stat().st_mode) != 0o600:
                fail(f"Codex bundled-agent sync did not protect {role}")
        repeated = subprocess.run(
            [sys.executable, str(agents_script), "sync", "--scope", "global"],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if repeated.returncode != 0 or json.loads(repeated.stdout).get("changed") != []:
            fail("Codex bundled-agent sync is not idempotent")
        conflict = temp / "codex-home/agents/architect.toml"
        conflict.write_text("operator-owned\n")
        refused = subprocess.run(
            [sys.executable, str(agents_script), "sync", "--scope", "global"],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if refused.returncode == 0 or conflict.read_text() != "operator-owned\n":
            fail("Codex bundled-agent sync overwrote an unmanaged conflict")

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
            "routing": {"mode": "fast", "mode_note": "keep-me"},
        }))
        env = {
            **os.environ,
            "HOME": str(home),
            "CODEX_HOME": str(codex_home),
            "XDG_CONFIG_HOME": str(home / ".config"),
        }
        env.pop("OPENCODE_CONFIG_DIR", None)
        inspect = subprocess.run(
            [sys.executable, str(config_script), "inspect-import", "--from", "claude"],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if inspect.returncode != 0:
            fail("Codex import inspection command failed")
        if source_secret in inspect.stdout + inspect.stderr:
            fail("Codex import inspection disclosed a source value")
        imported = subprocess.run(
            [sys.executable, str(config_script), "import", "--from", "claude"],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if imported.returncode != 0:
            fail("Codex config import command failed")
        if source_secret in imported.stdout + imported.stderr:
            fail("Codex config import disclosed a copied value")
        imported_doc = json.loads((codex_home / ".team-harness.json").read_text())
        if imported_doc.get("custom", {}).get("opaque_plain") != source_secret:
            fail("Codex config import did not copy opaque nested values")
        if imported_doc.get("autogate", {}).get("pr_create") is not True:
            fail("Codex config import did not preserve an opaque authorization-like value")
        if "mode" in imported_doc.get("routing", {}):
            fail("Codex config import retained a nested legacy route selector")
        if imported_doc.get("routing", {}).get("mode_note") != "keep-me":
            fail("Codex config import removed opaque data beside a nested legacy selector")
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
        (claude_home / ".team-harness.json").write_text("not-json\n")
        isolated_show = subprocess.run(
            [sys.executable, str(config_script), "show"],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if isolated_show.returncode != 0:
            fail("Codex config show parsed another runtime's malformed document")
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
        if imported_opencode.returncode != 0:
            fail("opencode config import command failed")
        if opencode_secret in imported_opencode.stdout + imported_opencode.stderr:
            fail("opencode config import disclosed a copied value")
        merged_doc = json.loads((codex_home / ".team-harness.json").read_text())
        if merged_doc.get("opencode_only", {}).get("api_key") != opencode_secret:
            fail("Codex config import did not copy opencode-only values")
        if merged_doc.get("language") != "es":
            fail("opencode import overwrote a value already imported from Claude")
        merged_doc["lane_autoselect"] = "always-stop"
        merged_doc["nested_migration"] = {
            "profile": "pipeline",
            "bug_tier": 0,
            "profile_note": "preserve",
        }
        merged_doc["mode"] = "custom-renderer"
        merged_doc["fast"] = "opaque-string"
        (codex_home / ".team-harness.json").write_text(json.dumps(merged_doc))
        ensured_import = subprocess.run(
            [sys.executable, str(config_script), "ensure", "--version", manifest["version"]],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if ensured_import.returncode != 0:
            fail("Codex config ensure failed after explicit imports")
        ensured_import_doc = json.loads((codex_home / ".team-harness.json").read_text())
        if ensured_import_doc.get("custom", {}).get("opaque_plain") != source_secret:
            fail("Codex config ensure changed an opaque Claude import")
        if ensured_import_doc.get("opencode_only", {}).get("api_key") != opencode_secret:
            fail("Codex config ensure changed an opaque opencode import")
        if "lane_autoselect" in ensured_import_doc:
            fail("Codex config ensure retained a known legacy selector")
        if "profile" in ensured_import_doc.get("nested_migration", {}):
            fail("Codex config ensure retained a nested legacy selector")
        if "bug_tier" in ensured_import_doc.get("nested_migration", {}):
            fail("Codex config ensure retained a numeric Tier-0 selector")
        if ensured_import_doc.get("nested_migration", {}).get("profile_note") != "preserve":
            fail("Codex config ensure removed opaque nested migration data")
        if ensured_import_doc.get("mode") != "custom-renderer":
            fail("Codex config ensure removed an unrelated mode value")
        if ensured_import_doc.get("fast") != "opaque-string":
            fail("Codex config ensure removed an unrelated fast value")
        merged_mtime = (codex_home / ".team-harness.json").stat().st_mtime_ns
        repeated_import = subprocess.run(
            [sys.executable, str(config_script), "import", "--from", "opencode"],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        repeated_result = json.loads(repeated_import.stdout) if repeated_import.returncode == 0 else {}
        if repeated_result.get("changed") is not False or repeated_result.get("imported") != []:
            fail("Codex setup config helper did not report a repeated import as a no-op")
        if (codex_home / ".team-harness.json").stat().st_mtime_ns != merged_mtime:
            fail("Codex setup config helper replaced the config during a no-op import")

    configuration_reference = (
        ROOT / "plugins/team-harness/skills/init/references/configuration.md"
    ).read_text()
    activation_reference = (
        ROOT / "plugins/team-harness/skills/pipeline/references/activation.md"
    ).read_text()
    recovery_reference = (
        ROOT / "plugins/team-harness/skills/pipeline/references/recovery.md"
    ).read_text()
    init = (ROOT / "plugins/team-harness/skills/init/SKILL.md").read_text()
    pipeline = (ROOT / "plugins/team-harness/skills/pipeline/SKILL.md").read_text()
    activation = (ROOT / "plugins/team-harness/skills/pipeline/references/activation.md").read_text()

    # AC13-AC20: the Codex projection exposes the same two-posture contract as
    # Claude. Direct inline work is the default and stays outside the canonical
    # machine; only explicit live pipeline activation/recovery enters full v3.
    machine_text = " → ".join(
        ("design", "waiting_gate1", "implementation", "validation", "waiting_gate3", "delivery", "complete")
    )
    posture_sources = {
        "Codex pipeline": pipeline,
        "Codex state": (ROOT / "plugins/team-harness/skills/pipeline/references/state-and-gates.md").read_text(),
        "Claude pipeline": (ROOT / "agents/ref-pipeline.md").read_text(),
    }
    for label, content in posture_sources.items():
        lowered = content.lower()
        if "inline" not in lowered or "pipeline" not in lowered:
            fail(f"{label} does not name both inline and pipeline postures")
        if machine_text not in content:
            fail(f"{label} does not expose canonical full v3 sequence")
    for label, content in {
        "Codex init": init,
        "Codex pipeline": pipeline,
        "Codex activation": activation_reference,
    }.items():
        if not re.search(r"exactly two postures|two postures only|only postures", content, re.IGNORECASE):
            fail(f"{label} does not assert exactly two postures")

    current_state = (ROOT / "plugins/team-harness/skills/pipeline/references/state-and-gates.md").read_text()
    current_machine = current_state.split("## Ownership and snapshot", 1)[0].lower()
    if re.search(r"(?m)^lane:\s*", current_machine) or re.search(r"(?m)^profile:\s*", current_machine):
        fail("Codex active state exposes a retired lane/profile field")
    if "lane_autoselect" in current_machine or "tier-0" in current_machine:
        fail("Codex active state exposes a retired route selector")

    if "1 — inline" not in activation_reference or "2 — pipeline" not in activation_reference:
        fail("Codex activation does not present the exact live 1/2 posture choices")
    if "never infer a posture from configuration" not in activation_reference.lower():
        fail("Codex activation lets configuration choose a posture")
    config_lower = configuration_reference.lower()
    if "legacy route/profile keys" not in config_lower:
        fail("Codex configuration does not identify legacy route keys")
    if "authorize neither posture" not in config_lower or "never chooses a route" not in config_lower:
        fail("Codex configuration treats legacy route keys as authoritative")
    if "1 — inline" not in configuration_reference or "2 — pipeline" not in configuration_reference:
        fail("Codex configuration does not provide live migration guidance")

    # A live tester/QA/security request is an ad-hoc inline report, not a
    # pipeline run and not a source of state, gates, or delivery artifacts.
    for role in ("tester", "qa", "security"):
        adapter = (ROOT / f"runtime/codex/instructions/{role}.md").read_text().lower()
        for marker in ("ad-hoc inline review", "creates no workspace", "coordination state", "events", "gates", "delivery record"):
            if marker not in adapter:
                fail(f"Codex {role} ad-hoc boundary is missing {marker!r}")
    if "no second confirmation" not in activation_reference.lower() and "second confirmation" not in init.lower():
        fail("Codex sensitive inline path does not prohibit a second confirmation")
    if "explicitly selects `inline`" not in activation_reference.lower() and "selects `inline`" not in init.lower():
        fail("Codex sensitive inline path lacks live explicit selection")

    deliver_skill = (ROOT / "plugins/team-harness/skills/deliver/SKILL.md").read_text()
    delivery_reference = (
        ROOT / "plugins/team-harness/skills/pipeline/references/delivery.md"
    ).read_text()
    ship_contract = "\n".join((pipeline, current_state, deliver_skill, delivery_reference)).lower()
    for marker in ("single", "version", "changelog", "commit", "push", "draft pr"):
        if marker not in ship_contract:
            fail(f"Codex Gate 3 ship contract is missing {marker!r}")
    for marker in ("merge", "tag", "release", "publication"):
        if marker not in ship_contract:
            fail(f"Codex Gate 3 ship exclusions are missing {marker!r}")
    if "does not authorize a push" in pipeline.lower():
        fail("Codex pipeline still requires another operator decision after Gate 3 ship")
    if "do not ask" not in ship_contract and "never ask" not in ship_contract:
        fail("Codex delivery can ask again for version, commit, push, or draft PR")
    if "technical runtime boundary" not in ship_contract:
        fail("Codex delivery conflates native tool approval with an operator gate")

    for label, content in {
        "direct configuration": configuration_reference,
        "pipeline activation": activation_reference,
        "pipeline recovery": recovery_reference,
    }.items():
        lowered = content.lower()
        if "canonical" not in lowered or "contain" not in lowered:
            fail(f"{label} does not require canonical external-workspace containment")

    if (ROOT / "agents/init.md").exists():
        fail("the ambiguous project initializer name must not remain")
    project_init = (ROOT / "agents/init-project.md").read_text()
    if "name: init-project" not in project_init:
        fail("the project initializer role was not renamed to init-project")
    routing = (ROOT / "agents/ref-pipeline.md").read_text()
    if "dispatch `init-project` directly" not in routing:
        fail("bootstrap routing does not target init-project")

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
        "read-only",
        "does not authorize creating a workspace",
    ):
        if marker not in config_resolution:
            fail(f"direct-mode configuration contract is missing {marker!r}")
    if "~/.claude/.team-harness.json" in config_resolution or "OPENCODE_CONFIG_DIR" in config_resolution:
        fail("direct-mode configuration still falls back to another runtime")
    for direct_name in ("design", "implement", "validate", "deliver"):
        direct = (ROOT / f"plugins/team-harness/skills/{direct_name}/SKILL.md").read_text()
        if "../init/references/configuration.md" not in direct:
            fail(f"{direct_name} direct fallback does not load persistent configuration")

    for role in ("architect", "implementer", "tester", "qa", "security", "delivery"):
        if f"{role}.toml" not in pipeline:
            fail(f"pipeline preflight does not name {role}.toml")
    for marker in (
        "$CODEX_HOME/agents/",
        "$team-harness:setup agents",
        "$team-harness:update",
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
    for marker in (
        "regular non-symlink file",
        "agents/architect.md (opus/xhigh)",
        "agents/delivery.md (sonnet/medium)",
        "$team-harness:update",
        "generate.mjs --check",
    ):
        if marker not in activation:
            fail(f"pipeline activation preflight is missing {marker!r}")
    if "${CODEX_HOME:-$HOME/.codex}/.team-harness.json" not in activation:
        fail("pipeline activation must prefer the Codex-native Team Harness config")

    output_contract = (ROOT / "docs/output-contract-patterns.md").read_text()
    for marker in (
        "## 6. Workspace artifact budgets",
        "Follow `docs/plan-shards.md`",
        "`02-implementation.md` | 5–30 lines and ≤8 KB",
        "## 7. Read-once, section-first contract",
        "It does not preload every completed phase.",
    ):
        if marker not in output_contract:
            fail(f"workspace I/O contract is missing {marker!r}")

    recovery = (
        ROOT / "plugins/team-harness/skills/pipeline/references/recovery.md"
    ).read_text()
    for marker in (
        "Read the bounded state snapshot first",
        "never load the stream in full",
        "read `01-plan.md` once as a manifest",
        "Do not preload the full plan set",
    ):
        if marker not in recovery:
            fail(f"Codex recovery still lacks section-first routing: {marker!r}")

    instruction_markers = {
        "architect": (
            "plan_format: sharded-v1",
            "Each fact has one canonical home",
            "coordinator-assigned plan artifacts",
            "`status`, `artifact_pointers`",
        ),
        "implementer": ("plan/tasks/Task-N.md", "never preload sibling tasks"),
        "tester": ("plan/tasks/Task-N.md", "fixed testing prose within 40 lines"),
        "qa": ("plan/tasks/Task-N.md", "fixed report prose within 30 lines"),
        "security": ("security-relevant task shards", "fixed prose within 20 lines"),
        "delivery": ("plan/delivery.md", "within 60 lines and 12 KB"),
    }
    for role, markers in instruction_markers.items():
        instructions = (ROOT / f"runtime/codex/instructions/{role}.md").read_text()
        for marker in markers:
            if marker not in instructions:
                fail(f"{role} Codex adapter is missing workspace budget marker {marker!r}")

    plan_consolidation = (ROOT / "agents/_shared/plan-consolidation.md").read_text()
    if "superseded finding bodies are replaced, not retained" not in plan_consolidation:
        fail("plan review contract still permits historical finding-body accumulation")

    plan_shards = (ROOT / "docs/plan-shards.md").read_text()
    for marker in (
        "**Plan format:** sharded-v1",
        "`plan/tasks/Task-N.md`",
        "Each fact has one canonical home",
        "must not preload every shard",
        "at most 12 non-empty lines",
        "monolith-v1",
    ):
        if marker not in plan_shards:
            fail(f"sharded plan contract is missing {marker!r}")

    runtime_plan_shards = (
        ROOT / "plugins/team-harness/skills/pipeline/references/plan-shards.md"
    ).read_text()
    for marker in (
        "plan_format: sharded-v1",
        "plan/tasks/Task-N.md",
        "Only the plan panel may inspect every shard",
        "A workspace without the format marker is legacy",
    ):
        if marker not in runtime_plan_shards:
            fail(f"distributable sharded plan contract is missing {marker!r}")

    observability = (ROOT / "docs/observability.md").read_text()
    for marker in (
        "### Low-cost append contract",
        "neither format is rewritten",
        "successful tool call does not deserve",
        "one minified JSON object on one line",
        "`.jsonl` alone would not",
    ):
        if marker not in observability:
            fail(f"low-cost event contract is missing {marker!r}")

    # Activation and pipeline skills carry the same generated-agent identity
    # digests. Verify both tables against the actual normalized TOML bytes.
    def digest_table(text: str) -> dict[str, str]:
        return dict(
            re.findall(
                r"\|\s+`?(architect|implementer|tester|qa|security|delivery)`?\s+\|\s+`([0-9a-f]{64})`\s+\|",
                text,
            )
        )

    activation_digests = digest_table(activation)
    pipeline_digests = digest_table(pipeline)
    if set(activation_digests) != expected or activation_digests != pipeline_digests:
        fail("pipeline and activation skill digest tables are not synchronized")
    for role, expected_digest in activation_digests.items():
        normalized = (ROOT / f".codex/agents/{role}.toml").read_bytes().replace(
            b"\r\n", b"\n"
        )
        actual_digest = hashlib.sha256(normalized).hexdigest()
        if actual_digest != expected_digest:
            fail(
                f"{role}: activation digest {expected_digest} does not match "
                f"generated TOML {actual_digest}"
            )

    for reference in ("activation", "state-and-gates", "design", "implementation", "validation", "recovery", "delivery"):
        if f"references/{reference}.md" not in pipeline:
            fail(f"pipeline skill does not link references/{reference}.md")

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
