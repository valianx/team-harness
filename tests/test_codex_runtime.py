#!/usr/bin/env python3
"""Structural and executable checks for the generated Codex runtime.

This suite intentionally does not assert wording in agent or skill Markdown.
Those files are semantic inputs reviewed as prose; the executable generator is
responsible for projecting them byte-for-byte into machine-readable artifacts.
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tomllib


ROOT = pathlib.Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "runtime/schema/codex-agents.json"
PROJECT_AGENTS = ROOT / ".codex/agents"
PACKAGED_AGENTS = ROOT / "plugins/team-harness/skills/setup/assets/agents"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def regular_file(path: pathlib.Path) -> bool:
    return path.is_file() and not path.is_symlink()


def run_check(argv: list[str]) -> None:
    result = subprocess.run(
        argv,
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
        timeout=120,
    )
    require(
        result.returncode == 0,
        f"{' '.join(argv)} failed:\n{result.stdout}{result.stderr}",
    )


def check_registry_and_projections() -> None:
    contract = json.loads(REGISTRY.read_text(encoding="utf-8"))
    agents = contract.get("agents")
    require(isinstance(agents, list) and agents, "Codex agent registry is empty")
    names = [agent.get("name") for agent in agents]
    require(all(isinstance(name, str) and name for name in names), "agent name is invalid")
    require(len(names) == len(set(names)), "Codex agent registry contains duplicate names")

    declared_outputs: set[str] = set()
    for agent in agents:
        name = agent["name"]
        for key in ("description", "semantic_source", "instruction_source", "output_path", "sandbox_mode"):
            require(isinstance(agent.get(key), str) and agent[key], f"{name}: missing {key}")

        semantic = ROOT / agent["semantic_source"]
        instruction = ROOT / agent["instruction_source"]
        output = ROOT / agent["output_path"]
        packaged = PACKAGED_AGENTS / f"{name}.toml"
        for label, path in (
            ("semantic source", semantic),
            ("instruction source", instruction),
            ("project projection", output),
            ("packaged projection", packaged),
        ):
            require(regular_file(path), f"{name}: {label} is missing or not a regular file: {path}")

        normalized = output.read_bytes().replace(b"\r\n", b"\n")
        packaged_normalized = packaged.read_bytes().replace(b"\r\n", b"\n")
        require(normalized == packaged_normalized, f"{name}: project/package projection drift")
        parsed = tomllib.loads(normalized.decode("utf-8"))
        require(parsed.get("sandbox_mode") == agent["sandbox_mode"], f"{name}: sandbox mode drift")
        generated_instructions = parsed.get("developer_instructions")
        adapter = instruction.read_text(encoding="utf-8").strip()
        logical_role = agent.get("role", name)
        if logical_role in {"implementer", "tester"}:
            require(
                isinstance(generated_instructions, str)
                and generated_instructions.startswith("## Canonical pipeline specialist reference\n")
                and generated_instructions.endswith(adapter),
                f"{name}: generated shared dispatch instructions drift",
            )
        else:
            require(generated_instructions == adapter, f"{name}: generated instructions drift")
        if agent.get("model_policy") == "spawn":
            require("model" not in parsed, f"{name}: spawn-selected role hardcodes a model")
            require("model_reasoning_effort" not in parsed, f"{name}: spawn-selected role hardcodes effort")
        else:
            require(isinstance(parsed.get("model"), str) and parsed["model"], f"{name}: model missing")
            require(
                parsed.get("model_reasoning_effort") in {"low", "medium", "high", "xhigh", "max", "ultra"},
                f"{name}: invalid reasoning effort",
            )
        require("capabilities" not in parsed, f"{name}: unsupported capabilities table emitted")
        declared_outputs.add(pathlib.PurePosixPath(agent["output_path"]).name)

    actual_outputs = {path.name for path in PROJECT_AGENTS.glob("*.toml") if path.is_file()}
    require(actual_outputs == declared_outputs, "generated Codex roster differs from registry outputs")
    packaged_outputs = {path.name for path in PACKAGED_AGENTS.glob("*.toml") if path.is_file()}
    require(packaged_outputs == declared_outputs, "packaged Codex roster differs from registry outputs")


def check_config_and_manifests() -> None:
    config = tomllib.loads((ROOT / ".codex/config.toml").read_text(encoding="utf-8"))
    require(config.get("agents", {}).get("enabled") is True, "Codex subagents are disabled")
    require(config.get("features", {}).get("multi_agent_v2") is True, "Codex V2 is disabled")
    require(config.get("project_doc_fallback_filenames") == ["CLAUDE.md"], "fallback config drift")

    manifests = [
        ROOT / ".claude-plugin/plugin.json",
        ROOT / "plugins/team-harness/.claude-plugin/plugin.json",
        ROOT / "plugins/team-harness/.codex-plugin/plugin.json",
    ]
    versions = set()
    for manifest in manifests:
        value = json.loads(manifest.read_text(encoding="utf-8"))
        require(value.get("name") in {"th", "team-harness"}, f"invalid plugin name in {manifest}")
        require(isinstance(value.get("version"), str), f"missing version in {manifest}")
        versions.add(value["version"])
    require(len(versions) == 1, f"plugin versions disagree: {sorted(versions)}")


def main() -> None:
    check_registry_and_projections()
    check_config_and_manifests()
    for command in (
        ["node", "tools/codex-runtime/generate.mjs", "--check"],
        ["node", "tools/codex-runtime/test_generate.mjs"],
        ["node", "tools/codex-runtime/sync-hooks.mjs", "--check"],
        ["node", "tools/codex-runtime/sync-skills.mjs", "--check"],
        ["node", "tools/codex-runtime/validate-marketplace.mjs"],
        ["node", "tools/codex-runtime/test_validate_marketplace.mjs"],
    ):
        run_check(command)
    print("codex runtime structure: PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"codex runtime structure: FAIL: {error}", file=sys.stderr)
        raise
