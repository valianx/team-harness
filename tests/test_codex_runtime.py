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


def check_inline_reviewer_native() -> None:
    """The generated inline reviewer is direct-project, read-only, and four-lens."""
    registry = json.loads((ROOT / "runtime/schema/codex-agents.json").read_text())
    role = next((agent for agent in registry["agents"] if agent["name"] == "inline-reviewer"), None)
    if role is None:
        fail("Codex registry is missing inline-reviewer")
    expected = {
        "sandbox_mode": "read-only",
        "capabilities": ["filesystem-read", "command-exec"],
        "capability_profile": "inline-review-read-only",
        "semantic_source": "agents/inline-reviewer.md",
        "instruction_source": "runtime/codex/instructions/inline-reviewer.md",
        "output_path": ".codex/agents/inline-reviewer.toml",
    }
    for key, value in expected.items():
        if role.get(key) != value:
            fail(f"inline-reviewer registry {key} drifted: {role.get(key)!r}")
    adapter = (ROOT / role["instruction_source"]).read_text().lower()
    for marker in (
        "tester", "qa", "security", "adversary", "repository_root", "commit_or_range",
        "sandbox_mode = \"read-only\"", "lens_status", "coverage", "disagreements",
        "review-pr", "target currentness", "output: null", "expected_lens", "dispatch_id",
        "git diff", "filesystem-root confinement",
    ):
        if marker not in adapter:
            fail(f"inline-reviewer adapter missing {marker!r}")
    for retired in ("run_inline_review.mjs", "evidence_manifest", "manifest_digest", "stdin-only", "deny-root"):
        if retired in adapter:
            fail(f"inline-reviewer adapter retains retired protocol {retired!r}")
    if "agents/_shared/inline-review-contract.md" in adapter:
        fail("inline-reviewer adapter depends on target repository contract")
    for marker in (
        "git --no-pager --no-replace-objects --literal-pathspecs -c core.fsmonitor=false -c core.untrackedcache=false -c maintenance.auto=false -c gc.auto=0 -c log.showsignature=false -c <canonical-root> diff --no-ext-diff --no-textconv",
        "git --no-pager --no-replace-objects --literal-pathspecs -c core.fsmonitor=false -c core.untrackedcache=false -c maintenance.auto=false -c gc.auto=0 -c log.showsignature=false -c <canonical-root> show --no-ext-diff --no-textconv",
        "git --no-pager --no-replace-objects --literal-pathspecs -c core.fsmonitor=false -c core.untrackedcache=false -c maintenance.auto=false -c gc.auto=0 -c log.showsignature=false -c <canonical-root> log -p --no-ext-diff --no-textconv",
        "resolved object ids", "never interpolate a project-derived command string",
        "profile_session", "fresh session", "in-memory byte attestation",
    ):
        if marker not in adapter:
            fail(f"inline-reviewer adapter misses hardened dispatch marker {marker!r}")
    semantic = (ROOT / "agents/inline-reviewer.md").read_text()
    if re.search(r"^tools:.*\\bBash\\b", semantic, re.MULTILINE):
        fail("Claude inline-reviewer must not receive unrestricted Bash")
    for marker in ("ephemeral immutable Git view", "cannot reliably impose a", "per-agent command boundary"):
        if marker not in semantic:
            fail(f"Claude inline-reviewer misses safe historical-view marker {marker!r}")
    for relative in (".codex/agents/inline-reviewer.toml", "plugins/team-harness/skills/setup/assets/agents/inline-reviewer.toml"):
        path = ROOT / relative
        if not path.is_file():
            fail(f"missing generated inline-reviewer output: {relative}")
        data = tomllib.loads(path.read_text())
        if data.get("model") != "gpt-5.6-terra" or data.get("model_reasoning_effort") != "high":
            fail(f"{relative}: inline-reviewer projection must be gpt-5.6-terra/high")
        if data.get("sandbox_mode") != "read-only":
            fail(f"{relative}: inline-reviewer must use read-only sandbox")
        if "capabilities" in data:
            fail(f"{relative}: Codex 0.146 role-schema parser rejects capabilities tables")
        if data.get("developer_instructions") != (ROOT / role["instruction_source"]).read_text().strip():
            fail(f"{relative}: generated instructions drift from canonical adapter")
    if (ROOT / "plugins/team-harness/skills/init/scripts/run_inline_review.mjs").exists():
        fail("retired inline runner remains")
    if (ROOT / "plugins/team-harness/skills/init/scripts/test_run_inline_review.mjs").exists():
        fail("retired inline runner behavioral test remains")
    init = re.sub(r"\s+", " ", (ROOT / "plugins/team-harness/skills/init/SKILL.md").read_text().lower())
    for marker in ("inline-reviewer", "project root", "commit/range", "sandbox_mode = \"read-only\"", "adversary", "security floor", "dispatch_id", "expected_lens", "regular non-symlink", "sha-256", "before consolidation", "stale", "fresh codex session", "explicit restart", "in-memory byte attestation"):
        if marker not in init:
            fail(f"Codex init native inline route missing {marker!r}")
    for retired in ("run_inline_review.mjs", "evidence_manifest", "manifest_digest", "stdin-only", "deny-root"):
        if retired in init:
            fail(f"Codex init retains retired inline protocol {retired!r}")
EXPECTED_POST_GATE1 = {
    "mechanical": ("main", "implementation", "prohibited", "none", 0),
    "decision": ("main", "implementation", "explicit-only", "none", 0),
    "architect-request": ("main", "design", "allowed", "new-gate1", 0),
    "implementation": ("main", "validation", "prohibited", "none", 1),
    "evidence": ("main", "validation", "prohibited", "none", 1),
}


def _routing_cells(line: str) -> list[str]:
    if not line.lstrip().startswith("|"):
        return []
    cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
    if len(cells) < 2 or all(re.fullmatch(r":?-+:?", cell) for cell in cells):
        return []
    return cells


def _routing_key(label: str) -> str | None:
    lowered = label.lower()
    if "mechanical" in lowered:
        return "mechanical"
    if "decision-bearing" in lowered or "security-obligation" in lowered:
        return "decision"
    if "explicit" in lowered and "architect" in lowered:
        return "architect-request"
    if "correctable code" in lowered:
        return "implementation"
    if "missing" in lowered or "insufficient evidence" in lowered:
        return "evidence"
    return None


def _routing_section(text: str) -> str:
    begin = text.find("### Authoritative post-Gate-1 routing")
    end = text.find("## Start", begin + 1)
    if begin < 0 or end < 0:
        fail("Codex authoritative post-Gate-1 routing section is missing")
    return text[begin:end]


def _routing_owner(owner_text: str) -> str:
    if re.search(r"\btester\b", owner_text):
        return "tester"
    if "implementation executor" in owner_text:
        return "implementation"
    if re.search(r"\bmain\b", owner_text):
        return "main"
    return ""


def _routing_phase(key: str, continuation: str) -> str:
    phase_match = re.search(r"`phase:\s*(design|implementation|validation)`", continuation)
    if phase_match:
        return phase_match.group(1)
    if key == "evidence" and "affected validation" in continuation:
        return "validation"
    if key == "implementation" and "return to implementation" in continuation:
        return "implementation"
    return ""


def _routing_architect(architect_text: str) -> str:
    if "prohibited unless" in architect_text or "unless separately" in architect_text:
        return "explicit-only"
    if "allowed" in architect_text:
        return "allowed"
    if "prohibited" in architect_text:
        return "prohibited"
    return ""


def _routing_gate(continuation: str) -> str:
    if re.search(r"\bno new gate 1\b", continuation):
        return "none"
    if re.search(r"\bnew gate 1\b", continuation):
        return "new-gate1"
    return ""


def _routing_row_values(key: str, cells: list[str]) -> tuple[str, str, str, str, int]:
    owner = _routing_owner(cells[1].lower())
    continuation = cells[2].lower()
    phase = _routing_phase(key, continuation)
    architect = _routing_architect(cells[3].lower())
    gate = _routing_gate(continuation)
    delta_match = re.fullmatch(r"`?([+-]?\d+)`?", cells[4].strip())
    if not delta_match:
        fail(f"Codex routing row has a non-numeric iteration delta: {cells!r}")
    return owner, phase, architect, gate, int(delta_match.group(1))


def _parse_codex_routing_rows(text: str) -> dict[str, tuple[str, str, str, str, int]]:
    rows: dict[str, tuple[str, str, str, str, int]] = {}
    for line in _routing_section(text).splitlines():
        cells = _routing_cells(line)
        if len(cells) != 5:
            continue
        key = _routing_key(cells[0])
        if key is None:
            continue
        if key in rows:
            fail(f"Codex routing table repeats {key!r}")
        rows[key] = _routing_row_values(key, cells)
    return rows


def _assert_markers(text: str, markers: tuple[str, ...], context: str) -> None:
    for marker in markers:
        if marker not in text:
            fail(f"{context} lost required marker {marker!r}")


def _assert_no_automatic_design_route(text: str, context: str) -> None:
    flattened = re.sub(r"\s+", " ", text.lower())
    concern = r"(?:decision-bearing|structural[^.]{0,80}contradiction)"
    design = r"(?:reopen|transition(?:s)?(?:\s+to)?|sets?\s+`?phase:?|`?phase:)\s*`?design"
    gate = r"(?:requires?|releases?)\s+(?:a\s+)?new gate 1"
    explicit = r"explicit(?:\s+\w+){0,3}\s+decision"
    for pattern in (
        rf"{concern}[^.]{{0,240}}{design}",
        rf"{concern}[^.]{{0,240}}{gate}",
        rf"{explicit}[^.]{{0,240}}(?:{design}|{gate}|new gate 1)",
    ):
        if re.search(pattern, flattened):
            fail(f"{context} permits a decision-bearing concern to reopen design")


def _check_agent_adapter_parity() -> None:
    generated = ROOT / ".codex/agents"
    packaged = ROOT / "plugins/team-harness/skills/setup/assets/agents"
    for role in (
        "architect",
        "delivery",
        "implementer",
        "pr-review-qa",
        "pr-review-security",
        "qa",
        "reviewer-consolidator",
        "reviewer",
        "security",
        "tester",
    ):
        project = (generated / f"{role}.toml").read_bytes().replace(b"\r\n", b"\n")
        package = (packaged / f"{role}.toml").read_bytes().replace(b"\r\n", b"\n")
        if project != package:
            fail(f"generated Codex adapter parity drifted for {role}")
        adapter = (ROOT / f"runtime/codex/instructions/{role}.md").read_text().lower()
        if role == "architect" and "only a separate, explicit current live operator request" not in re.sub(r"\s+", " ", adapter):
            fail("Codex architect adapter permits automatic post-Gate-1 dispatch")
        if role in {"tester", "qa", "security"} and "do not dispatch" not in adapter:
            fail(f"Codex {role} adapter can select a post-Gate-1 route")


def _check_qa_post_gate1_route(validation: str) -> None:
    adapter = (ROOT / "runtime/codex/instructions/qa.md").read_text()
    generated = tomllib.loads((ROOT / ".codex/agents/qa.toml").read_text())
    packaged = tomllib.loads(
        (ROOT / "plugins/team-harness/skills/setup/assets/agents/qa.toml").read_text()
    )
    sources = (
        ("Codex validation reference", validation),
        ("QA instruction adapter", adapter),
        ("generated QA adapter", generated["developer_instructions"]),
        ("packaged generated QA adapter", packaged["developer_instructions"]),
    )
    for context, text in sources:
        _assert_no_automatic_design_route(text, context)
        _assert_markers(
            re.sub(r"\s+", " ", text.lower()),
            ("suggested correction",),
            context,
        )
    qa_markers = (
        "return exactly five-coordinate input to main",
        "closure evidence",
        "never select `design` or `architect`",
        "never request or trigger a follow-up round",
        "ac-n: pass",
        "only writer",
        "checkbox mirror",
    )
    for context, text in sources[1:]:
        _assert_markers(re.sub(r"\s+", " ", text.lower()), qa_markers, context)
        if re.search(r"\bqa\s+may\s+update\b", text, re.IGNORECASE):
            fail(f"{context} permits read-only QA to update the checkbox mirror")
    for context, text in sources:
        _assert_markers(
            re.sub(r"\s+", " ", text.lower()),
            ("ac-n: pass", "only writer", "checkbox mirror"),
            context,
        )
    for context, agent in (("generated QA adapter", generated), ("packaged generated QA adapter", packaged)):
        if agent["sandbox_mode"] != "read-only":
            fail(f"{context} must keep QA read-only")


def check_post_gate1_projection() -> None:
    """Parse the Codex routing rows and prove generated adapters preserve them."""
    pipeline = (ROOT / "plugins/team-harness/skills/pipeline/SKILL.md").read_text()
    rows = _parse_codex_routing_rows(pipeline)
    if rows != EXPECTED_POST_GATE1:
        fail(f"Codex post-Gate-1 transition results drifted: {rows!r}")
    _assert_markers(
        re.sub(r"\s+", " ", pipeline.lower()),
        ("security-obligation classification", "bounded live operator decision", "implementation → freeze → validation", "retain the final security floor", "new gate 1"),
        "Codex routing projection",
    )
    _assert_no_automatic_design_route(pipeline, "Codex pipeline skill")
    _check_agent_adapter_parity()
    _check_qa_post_gate1_route(
        (ROOT / "plugins/team-harness/skills/pipeline/references/validation.md").read_text()
    )


def main() -> None:
    check_inline_reviewer_native()
    contract = json.loads((ROOT / "runtime/schema/codex-agents.json").read_text())
    agents = contract["agents"]
    expected = {agent["name"] for agent in agents}
    pipeline_roles = {"architect", "implementer", "tester", "cleaner", "qa", "security", "delivery"}
    session_pipeline_roles = {f"pipeline-{role}" for role in pipeline_roles}
    review_roles = {"reviewer", "pr-review-qa", "pr-review-security", "reviewer-consolidator"}
    inline_roles = {"inline-reviewer"}
    if expected != pipeline_roles | session_pipeline_roles | review_roles | inline_roles:
        fail(f"unexpected Codex installed roles: {sorted(expected)}")
    architect_contract = next(agent for agent in agents if agent["name"] == "architect")
    if architect_contract["sandbox_mode"] != "workspace-write":
        fail("Codex architect must be able to write its assigned plan artifacts")
    if "filesystem-write" not in architect_contract["capabilities"]:
        fail("Codex architect is missing its bounded filesystem-write capability")

    config = tomllib.loads((ROOT / ".codex/config.toml").read_text())
    if config["agents"]["enabled"] is not True:
        fail("Codex subagents must be enabled")
    if "model" in config or "model_reasoning_effort" in config:
        fail("Codex project fallback must not override Main's selected Sol/xhigh model")
    if config.get("features", {}).get("multi_agent") is not True:
        fail("Codex project must explicitly enable multi_agent")
    if config.get("features", {}).get("multi_agent_v2") is not True:
        fail("Codex project must explicitly enable multi_agent_v2")
    if config["agents"].get("default_subagent_model") != "gpt-5.6-terra" or config["agents"].get("default_subagent_reasoning_effort") != "medium":
        fail("Codex project must declare the generic Terra/medium subagent fallback")
    if config.get("project_doc_fallback_filenames") != ["CLAUDE.md"]:
        fail("Codex project must use CLAUDE.md only when AGENTS.md is absent")
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
        "architect": ("architect", "opus/xhigh", "opus", False),
        "implementer": ("implementer", "sonnet/high", "sonnet-high", False),
        "tester": ("tester", "sonnet/high", "sonnet-high", False),
        "cleaner": ("cleaner", "sonnet/medium", "sonnet-medium", False),
        "qa": ("qa", "opus/xhigh", "opus", False),
        "security": ("security", "opus/xhigh", "opus", False),
        "inline-reviewer": ("inline-reviewer", "sonnet/high", "sonnet-high", False),
        "delivery": ("delivery", "sonnet/medium", "sonnet-medium", False),
        "reviewer": ("reviewer", "sonnet/high", "sonnet-high", False),
        "pr-review-qa": ("pr-review-qa", "sonnet/high", "sonnet-high", False),
        "pr-review-security": ("pr-review-security", "sonnet/high", "sonnet-high", False),
        "reviewer-consolidator": ("reviewer-consolidator", "sonnet/medium", "sonnet-medium", False),
    }
    for role in pipeline_roles:
        source_marker, tier = {
            "architect": ("opus/xhigh", "opus"),
            "implementer": ("sonnet/high", "sonnet-high"),
            "tester": ("sonnet/high", "sonnet-high"),
            "cleaner": ("sonnet/medium", "sonnet-medium"),
            "qa": ("opus/xhigh", "opus"),
            "security": ("opus/xhigh", "opus"),
            "delivery": ("sonnet/medium", "sonnet-medium"),
        }[role]
        expected_identity[f"pipeline-{role}"] = (role, source_marker, tier, True)
    expected_projection = {
        "opus": ("gpt-5.6-sol", "xhigh"),
        "sonnet-high": ("gpt-5.6-terra", "high"),
        "sonnet-medium": ("gpt-5.6-terra", "medium"),
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
        role, source_marker, tier, spawn_overridable = expected_identity[data["name"]]
        if spawn_overridable:
            if "model" in data or "model_reasoning_effort" in data:
                fail(f"{path}: spawn-overridable pipeline identity pins a model or effort")
        elif (data.get("model"), data.get("model_reasoning_effort")) != expected_projection[tier]:
            fail(f"{path}: model projection does not match {tier}")
        if "capabilities" in data:
            fail(f"{path}: Codex 0.146 role-schema parser rejects capabilities tables")
        content = path.read_text()
        markers = (
            "# Code generated from runtime/schema/codex-agents.json; DO NOT EDIT.",
            f"# Instruction source: runtime/codex/instructions/{role}.md",
            f"# Semantic source: agents/{role}.md ({source_marker})",
            f"# Projection tier: {tier}; profile: team-harness",
            f'name = "{data["name"]}"',
        )
        for marker in markers:
            if marker not in content.splitlines():
                fail(f"{path}: missing deterministic Team Harness marker {marker!r}")
        if data["sandbox_mode"] == "read-only" and role in {"architect", "implementer", "tester", "cleaner", "delivery"}:
            fail(f"{path}: write role is unexpectedly read-only")
        if data["name"] in review_roles and data["sandbox_mode"] != "read-only":
            fail(f"{path}: PR-review role must be read-only")
    review_contracts = {agent["name"]: agent for agent in agents if agent["name"] in review_roles}
    if review_contracts["reviewer"]["capabilities"] != ["filesystem-read", "external-read"]:
        fail("Codex reviewer capability allowlist drifted")
    for role in review_roles - {"reviewer"}:
        if review_contracts[role]["capabilities"] != ["filesystem-read"]:
            fail(f"Codex {role} capability allowlist drifted")
    read_transport_markers = (
        "Codex filesystem-read transport",
        "bounded non-mutating `exec_command`",
        'sandbox_mode = "read-only"',
        "one read-only executable with literal arguments",
        "Do not use shell control operators",
        "never recommend setup, update, or restart for that condition",
        "If a bounded read actually fails, return the exact read failure to Main.",
    )
    for role in review_roles:
        adapter = (ROOT / review_contracts[role]["instruction_source"]).read_text()
        for marker in read_transport_markers:
            if marker not in adapter:
                fail(f"Codex {role} adapter is missing filesystem-read transport marker {marker!r}")
        semantic = (ROOT / review_contracts[role]["semantic_source"]).read_text()
        tools_line = next((line for line in semantic.splitlines() if line.startswith("tools:")), "")
        semantic_tools = {tool.strip() for tool in tools_line.removeprefix("tools:").split(",")}
        if "Bash" in semantic_tools:
            fail(f"Claude {role} semantic agent unexpectedly gained Bash")
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
        for name in ("policy-block", "gcp-guard", "gate-guard")
    ):
        fail("Codex plugin must wire the deterministic-deny hook floors")
    if not all(
        "PLUGIN_ROOT" in command and "CLAUDE_PLUGIN_ROOT" in command
        for command in hook_commands
    ):
        fail("Codex hook commands must support both plugin-root environment aliases")
    if any(
        retired in command
        for command in hook_commands
        for retired in ("dev-guard", "prepublish-guard", "worktree-guard")
    ):
        fail("Codex plugin still wires an approval-classifying hook")

    shared_skill_names = {
        path.parent.name for path in (ROOT / "skills").glob("*/SKILL.md")
    }
    skill_names = {
        path.parent.name
        for path in (ROOT / "plugins/team-harness/skills").glob("*/SKILL.md")
    }
    if skill_names != shared_skill_names:
        fail(
            "Codex plugin skill set differs from the canonical shared set: "
            f"missing={sorted(shared_skill_names - skill_names)}, "
            f"extra={sorted(skill_names - shared_skill_names)}"
        )
    codex_overrides = {
        "setup",
        "update",
        "modes",
        "init",
        "pipeline",
        "design",
        "implement",
        "validate",
        "deliver",
        "recover",
    }
    generated_marker = (
        "<!-- Code generated by tools/codex-runtime/sync-skills.mjs; "
        "DO NOT EDIT. -->"
    )
    for name in sorted(skill_names - codex_overrides):
        projected = ROOT / f"plugins/team-harness/skills/{name}"
        if generated_marker not in (projected / "SKILL.md").read_text():
            fail(f"Codex skill projection is unmanaged: {name}")
        if not (projected / "canonical.md").is_file():
            fail(f"Codex skill projection lacks canonical workflow: {name}")
        if not (projected / "agents/openai.yaml").is_file():
            fail(f"Codex skill projection lacks UI metadata: {name}")

    for name in ("inline", "issue", "pipeline", "plan", "recover"):
        metadata = (
            ROOT / f"plugins/team-harness/skills/{name}/agents/openai.yaml"
        ).read_text()
        if "allow_implicit_invocation: false" not in metadata:
            fail(f"Codex operator-only skill permits implicit invocation: {name}")

    for required_resource in (
        "plugins/team-harness/skills/excalidraw-diagram/references/json-schema.md",
        "plugins/team-harness/skills/interactive-presentation/references/templates/package.json",
    ):
        if not (ROOT / required_resource).is_file():
            fail(f"Codex projected skill resource is missing: {required_resource}")

    setup = (ROOT / "plugins/team-harness/skills/setup/SKILL.md").read_text()
    update = (ROOT / "plugins/team-harness/skills/update/SKILL.md").read_text()
    for marker in (
        "${CODEX_HOME:-$HOME/.codex}/.team-harness.json",
        "scripts/manage_config.py",
        "scripts/manage_agents.py",
        "manage_config.py ensure --version 3.6.5",
        "codex mcp add memory",
        "@upstash/context7-mcp@3.2.5",
        "manage_agents.py sync --scope SCOPE",
        'project_doc_fallback_filenames = ["CLAUDE.md"]',
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
    if "`features`" not in setup_targets:
        fail("Codex setup must expose an explicit features target")
    if re.search(r"(?im)^\s*-\s*lane auto-select\s+is\b", setup):
        fail("Codex setup must not advertise an active lane-autoselect value")
    for marker in ("migration-only", "1 — inline", "2 — pipeline"):
        if marker not in setup.lower():
            fail(f"Codex setup lane migration guidance is missing {marker!r}")
    for skill_name, skill_text in (("setup", setup), ("update", update)):
        for marker in (
            "codex features enable multi_agent",
            "codex features enable multi_agent_v2",
        ):
            if re.search(rf"(?m)^\s*{re.escape(marker)}\s*$", skill_text) is None:
                fail(f"Codex {skill_name} skill is missing V2 activation command {marker!r}")
    setup_flat = re.sub(r"\s+", " ", setup.lower())
    for marker in (
        "only for a full setup or an explicit `features` target",
        "for every other targeted setup, skip both feature-writer commands",
        "do not change global codex feature state",
        "re-run `codex features list` only when step 4 ran",
        "feature-flag status when checked",
        "does not guarantee detection when a push is assembled from runtime-only shell state",
        "server-side github branch protection remains authoritative",
    ):
        if marker not in setup_flat:
            fail(f"Codex setup scoped-write/force-push contract is missing {marker!r}")
    if "wrapped or reconstructed equivalents even after `ship`" in setup_flat:
        fail("Codex setup still overclaims force-push wrapper coverage")

    modes = (ROOT / "plugins/team-harness/skills/modes/SKILL.md").read_text()
    for marker in (
        "/skills",
        "$team-harness",
        "never activates a pipeline or another skill",
        "Enumerate every sibling",
        "reading only its YAML `name` and `description`",
        "discovery",
        "Do not read a sibling skill body",
    ):
        if marker not in modes:
            fail(f"Team Harness modes catalog is missing {marker!r}")

    shared_modes = (ROOT / "skills/modes/SKILL.md").read_text()
    shared_catalog_names = [
        line.split("`")[1]
        for line in shared_modes.splitlines()
        if line.startswith("| `")
    ]
    if set(shared_catalog_names) != shared_skill_names:
        fail("shared Team Harness modes catalog does not match packaged skills")
    if shared_catalog_names != sorted(shared_catalog_names):
        fail("shared Team Harness modes catalog must be alphabetical")
    opencode_skill_names = {
        path.parent.name
        for path in (ROOT / "installer-assets/opencode-skills").glob("*/SKILL.md")
    }
    if opencode_skill_names != shared_skill_names:
        fail(
            "opencode skill projection differs from the canonical shared set: "
            f"missing={sorted(shared_skill_names - opencode_skill_names)}, "
            f"extra={sorted(opencode_skill_names - shared_skill_names)}"
        )
    opencode_overrides = {
        "background", "cross-repo", "recover", "setup", "tmux", "update"
    }
    for name in sorted(opencode_skill_names - opencode_overrides):
        projected = ROOT / f"installer-assets/opencode-skills/{name}"
        if generated_marker not in (projected / "SKILL.md").read_text():
            fail(f"opencode skill projection is unmanaged: {name}")
        if not (projected / "canonical.md").is_file():
            fail(f"opencode skill projection lacks canonical workflow: {name}")
    for name in ("inline", "issue", "pipeline", "plan", "recover"):
        metadata = (
            ROOT / f"installer-assets/opencode-skills/{name}/SKILL.md"
        ).read_text()
        if 'opencode/autoinvoke: "false"' not in metadata:
            fail(f"opencode operator-only skill permits auto-invocation: {name}")
    opencode_modes = (
        ROOT / "installer-assets/opencode-commands/th-modes.md"
    ).read_text()
    for marker in ("native `modes` skill", "read-only"):
        if marker not in opencode_modes:
            fail(f"opencode th-modes command is missing {marker!r}")
    update_flat = re.sub(r"\s+", " ", update)
    for marker in (
        "codex plugin marketplace upgrade team-harness",
        "codex plugin add team-harness@team-harness --json",
        "AVAILABLE_VERSION",
        "installedPath",
        "NEW_PLUGIN=OLD_PLUGIN",
        "never authorizes a downgrade",
        "Never run `codex plugin remove` during update",
        "prior installation remains the recovery path",
        "partial-convergence",
        "one retryable convergence sequence",
        "skills/update/scripts/bridge_snapshot.py",
        "--old-plugin OLD_PLUGIN --new-plugin NEW_PLUGIN",
        "manage_config.py ensure --version NEW_VERSION",
        "manage_agents.py sync --scope SCOPE",
        "project_doc_fallback_filenames",
        "appends `CLAUDE.md` once",
        "Even when plugin versions compare equal",
        "NEW_PLUGIN` and `NEW_VERSION` are the only",
        "without exiting `127`",
        "do not require a restart merely because the cache version changed",
        "Ask the operator to restart Codex or open a new thread only when",
    ):
        if marker not in update_flat:
            fail(f"Codex update skill is missing {marker!r}")
    update_commands = []
    in_command_fence = False
    pending_command = ""
    for raw_line in update.splitlines():
        line = raw_line.strip()
        if line.startswith("```"):
            if in_command_fence and pending_command:
                update_commands.append(pending_command)
                pending_command = ""
            in_command_fence = not in_command_fence
            continue
        if not in_command_fence or not line:
            continue
        command_part = line[:-1].rstrip() if line.endswith("\\") else line
        if pending_command:
            pending_command = f"{pending_command} {command_part}"
        elif line.startswith(("codex plugin ", "python3 ")):
            pending_command = command_part
        if pending_command and not line.endswith("\\"):
            update_commands.append(pending_command)
            pending_command = ""

    if any(
        re.match(r"^codex plugin remove(?:\s|$)", command)
        for command in update_commands
    ):
        fail("Codex update can remove the live hook runtime before replacement")
    for forbidden_sample in (
        'codex plugin remove "$PLUGIN"',
        "codex plugin remove team-harness@team-harness",
    ):
        if not re.match(r"^codex plugin remove(?:\s|$)", forbidden_sample):
            fail("Codex update remove-command detector does not cover variable selectors")
    ordered_commands = (
        "codex plugin marketplace upgrade team-harness --json",
        "codex plugin add team-harness@team-harness --json",
        "python3 NEW_PLUGIN/skills/update/scripts/bridge_snapshot.py",
    )
    positions = []
    for command_prefix in ordered_commands:
        matches = [
            index
            for index, command in enumerate(update_commands)
            if command.startswith(command_prefix)
        ]
        if len(matches) != 1:
            fail(f"Codex update must contain one executable {command_prefix!r}")
        positions.append(matches[0])
    if positions != sorted(positions) or len(set(positions)) != len(positions):
        fail("Codex update command order must be marketplace upgrade, add, then bridge")

    bridge_script = ROOT / "plugins/team-harness/skills/update/scripts/bridge_snapshot.py"
    with tempfile.TemporaryDirectory() as temp_root:
        cache = (
            pathlib.Path(temp_root)
            / ".codex/plugins/cache/team-harness/team-harness"
        )
        new_snapshot = cache / manifest["version"]
        (new_snapshot / ".codex-plugin").mkdir(parents=True)
        (new_snapshot / "hooks").mkdir()
        (new_snapshot / ".codex-plugin/plugin.json").write_text(json.dumps({
            "name": "team-harness",
            "version": manifest["version"],
        }))
        (new_snapshot / "hooks/run-codex-hook.sh").write_text("#!/bin/sh\n")
        old_snapshot = cache / "3.6.2"

        linked = subprocess.run(
            [
                sys.executable,
                str(bridge_script),
                "--old-plugin",
                str(old_snapshot),
                "--new-plugin",
                str(new_snapshot),
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        if linked.returncode != 0:
            fail(f"Codex snapshot bridge failed: {linked.stdout}{linked.stderr}")
        linked_result = json.loads(linked.stdout)
        if linked_result.get("status") != "linked" or linked_result.get("restartRequired"):
            fail("Codex snapshot bridge did not create a live compatibility link")
        if old_snapshot.resolve() != new_snapshot.resolve():
            fail("Codex snapshot bridge does not resolve to the new plugin")

        repeated = subprocess.run(
            [
                sys.executable,
                str(bridge_script),
                "--old-plugin",
                str(old_snapshot),
                "--new-plugin",
                str(new_snapshot),
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        if repeated.returncode != 0 or json.loads(repeated.stdout).get("status") != "current":
            fail("Codex snapshot bridge is not idempotent")

        real_snapshot = cache / "3.6.1"
        real_snapshot.mkdir()
        refused = subprocess.run(
            [
                sys.executable,
                str(bridge_script),
                "--old-plugin",
                str(real_snapshot),
                "--new-plugin",
                str(new_snapshot),
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        refused_result = json.loads(refused.stdout)
        if (
            refused.returncode != 0
            or refused_result.get("status") != "skipped-existing-path"
            or not refused_result.get("restartRequired")
            or real_snapshot.is_symlink()
        ):
            fail("Codex snapshot bridge replaced a real cached directory")

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
        inspected = subprocess.run(
            [sys.executable, str(agents_script), "inspect", "--scope", "global"],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if inspected.returncode != 0:
            fail(f"Codex bundled-agent inspect failed: {inspected.stdout}{inspected.stderr}")
        inspected_result = json.loads(inspected.stdout)
        if inspected_result.get("runtimeConfig", {}).get("status") != "missing":
            fail("Codex bundled-agent inspect did not report a missing runtime fallback")
        if inspected_result.get("runtimeConfig", {}).get("projectDocFallbackStatus") != "missing":
            fail("Codex bundled-agent inspect did not report a missing CLAUDE.md fallback")
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
            fail("Codex bundled-agent sync did not install the complete role set")
        runtime_config = temp / "codex-home/config.toml"
        runtime_doc = tomllib.loads(runtime_config.read_text())
        if runtime_doc.get("agents", {}).get("default_subagent_model") != "gpt-5.6-terra":
            fail("Codex bundled-agent sync did not install the Terra fallback")
        if runtime_doc.get("agents", {}).get("default_subagent_reasoning_effort") != "medium":
            fail("Codex bundled-agent sync did not install the medium fallback effort")
        if runtime_doc.get("project_doc_fallback_filenames") != ["CLAUDE.md"]:
            fail("Codex bundled-agent sync did not install the CLAUDE.md fallback")
        if sync_result.get("runtimeConfig", {}).get("status") != "current":
            fail("Codex bundled-agent sync did not report the runtime fallback current")
        if sync_result.get("runtimeConfig", {}).get("projectDocFallbackStatus") != "current":
            fail("Codex bundled-agent sync did not report the CLAUDE.md fallback current")
        if sync_result.get("runtimeConfigChanged") is not True or sync_result.get("restartRequired") is not True:
            fail("Codex bundled-agent sync did not require restart after runtime reconciliation")
        if stat.S_IMODE(runtime_config.stat().st_mode) != 0o600:
            fail("Codex bundled-agent sync did not protect the runtime config")
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
        repeated_result = json.loads(repeated.stdout) if repeated.returncode == 0 else {}
        if repeated.returncode != 0 or repeated_result.get("changed") != []:
            fail("Codex bundled-agent sync is not idempotent")
        if repeated_result.get("runtimeConfigChanged") is not False or repeated_result.get("restartRequired") is not False:
            fail("Codex bundled-agent sync rewrote a current runtime fallback")

        legacy_runtime = (
            'model = "operator-main"\n'
            'operator_key = "preserve-me"\n\n'
            '[agents]\n'
            'default_subagent_model = "gpt-5.6-luna" # managed legacy\n'
            'default_subagent_reasoning_effort = "max"\n'
            'max_threads = 9\n\n'
            '[projects."/tmp/example"]\n'
            'trust_level = "trusted"\n'
        )
        runtime_config.write_text(legacy_runtime)
        migrated = subprocess.run(
            [sys.executable, str(agents_script), "sync", "--scope", "global"],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if migrated.returncode != 0:
            fail(f"Codex legacy fallback migration failed: {migrated.stdout}{migrated.stderr}")
        migrated_result = json.loads(migrated.stdout)
        migrated_text = runtime_config.read_text()
        migrated_doc = tomllib.loads(migrated_text)
        if migrated_doc["agents"].get("default_subagent_model") != "gpt-5.6-terra":
            fail("Codex agent sync retained the obsolete Luna fallback")
        if migrated_doc["agents"].get("default_subagent_reasoning_effort") != "medium":
            fail("Codex agent sync retained the obsolete fallback effort")
        for marker in ('model = "operator-main"', 'operator_key = "preserve-me"', 'max_threads = 9', '[projects."/tmp/example"]'):
            if marker not in migrated_text:
                fail(f"Codex fallback migration dropped operator config {marker!r}")
        if not runtime_config.with_name("config.toml.bak").is_file():
            fail("Codex fallback migration did not back up the runtime config")
        if migrated_result.get("runtimeConfigChanged") is not True or migrated_result.get("restartRequired") is not True:
            fail("Codex fallback migration did not report the required session restart")

        custom_runtime = (
            'project_doc_fallback_filenames = ["CLAUDE.md"]\n'
            '[agents]\n'
            'default_subagent_model = "operator/custom-model"\n'
            'default_subagent_reasoning_effort = "high"\n'
        )
        runtime_config.write_text(custom_runtime)
        custom = subprocess.run(
            [sys.executable, str(agents_script), "sync", "--scope", "global"],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if custom.returncode != 0:
            fail(f"Codex custom fallback preservation failed: {custom.stdout}{custom.stderr}")
        custom_result = json.loads(custom.stdout)
        if runtime_config.read_text() != custom_runtime:
            fail("Codex agent sync overwrote an operator-selected fallback")
        if custom_result.get("runtimeConfig", {}).get("status") != "custom-preserved":
            fail("Codex agent sync did not report the preserved custom fallback")
        if custom_result.get("runtimeConfigChanged") is not False or custom_result.get("restartRequired") is not False:
            fail("Codex agent sync required restart for an untouched custom fallback")

        additive_runtime = (
            'model = "operator-main"\n'
            'project_doc_fallback_filenames = [\n'
            "  'TEAM]GUIDE.md', # preserve this literal string and bracket\n"
            '  ".agents.md",\n'
            ']\n\n'
            '[agents]\n'
            'default_subagent_model = "operator/custom-model"\n'
            'max_threads = 7\n'
        )
        runtime_config.write_text(additive_runtime)
        additive = subprocess.run(
            [sys.executable, str(agents_script), "sync", "--scope", "global"],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if additive.returncode != 0:
            fail(f"Codex CLAUDE.md fallback reconciliation failed: {additive.stdout}{additive.stderr}")
        additive_result = json.loads(additive.stdout)
        additive_text = runtime_config.read_text()
        additive_doc = tomllib.loads(additive_text)
        if additive_doc.get("project_doc_fallback_filenames") != ["TEAM]GUIDE.md", ".agents.md", "CLAUDE.md"]:
            fail("Codex fallback reconciliation did not preserve ordered operator fallbacks")
        if additive_doc.get("agents", {}).get("default_subagent_model") != "operator/custom-model":
            fail("Codex CLAUDE.md reconciliation changed the operator-selected model fallback")
        if "default_subagent_reasoning_effort" in additive_doc.get("agents", {}):
            fail("Codex CLAUDE.md reconciliation added an operator-omitted reasoning fallback")
        for marker in ('model = "operator-main"', 'max_threads = 7'):
            if marker not in additive_text:
                fail(f"Codex CLAUDE.md reconciliation dropped operator config {marker!r}")
        if additive_result.get("changed") != [] or additive_result.get("runtimeConfigChanged") is not True:
            fail("Codex CLAUDE.md reconciliation changed agent files or missed the config change")
        if additive_result.get("restartRequired") is not True:
            fail("Codex CLAUDE.md reconciliation did not require a fresh session")
        if additive_result.get("runtimeConfig", {}).get("projectDocFallbackStatus") != "current":
            fail("Codex CLAUDE.md reconciliation did not report the fallback current")
        additive_repeat = subprocess.run(
            [sys.executable, str(agents_script), "sync", "--scope", "global"],
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        if additive_repeat.returncode != 0:
            fail(f"Codex CLAUDE.md idempotency check failed: {additive_repeat.stdout}{additive_repeat.stderr}")
        additive_repeat_result = json.loads(additive_repeat.stdout)
        if runtime_config.read_text() != additive_text:
            fail("Codex CLAUDE.md reconciliation duplicated or rewrote the current fallback")
        if additive_repeat_result.get("runtimeConfigChanged") is not False or additive_repeat_result.get("restartRequired") is not False:
            fail("Codex CLAUDE.md reconciliation is not idempotent")
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
    inline_contract = (ROOT / "agents/_shared/inline-review-contract.md").read_text()
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
    activation_lower = activation_reference.lower()
    for marker in (
        "a live `2` answering",
        "explicit pipeline activation",
        "applies only to that exact legacy presentation",
        "choice `2` in the current three-choice intake",
    ):
        if marker not in activation_lower:
            fail(f"Codex activation does not safely route the legacy numeric choice: {marker!r}")
    config_lower = configuration_reference.lower()
    if "legacy route/profile keys" not in config_lower:
        fail("Codex configuration does not identify legacy route keys")
    if "authorize neither posture" not in config_lower or "never chooses a route" not in config_lower:
        fail("Codex configuration treats legacy route keys as authoritative")
    if "1 — inline" not in configuration_reference or "2 — pipeline" not in configuration_reference:
        fail("Codex configuration does not provide live migration guidance")

    # Inline review is a native read-only project inspection, not a runner or
    # manifest transport, and pipeline roles retain their existing contracts.
    for role in ("tester", "qa", "security"):
        adapter = (ROOT / f"runtime/codex/instructions/{role}.md").read_text().lower()
        for retired in ("inline-review", "run_inline_review", "evidence_manifest", "manifest_digest"):
            if retired in adapter:
                fail(f"Codex pipeline adapter {role} retains retired inline marker {retired!r}")
    native_adapter = (ROOT / "runtime/codex/instructions/inline-reviewer.md").read_text().lower()
    for marker in (
        "tester", "qa", "security", "adversary", "repository_root", "commit_or_range",
        "sandbox_mode = \"read-only\"", "lens_status", "coverage", "disagreements",
        "target currentness", "review-pr", "output: null", "expected_lens", "dispatch_id",
        "git diff", "filesystem-root confinement", "git --no-pager --no-replace-objects --literal-pathspecs -c core.fsmonitor=false -c core.untrackedcache=false -c maintenance.auto=false -c gc.auto=0 -c log.showsignature=false -c <canonical-root>",
        "--no-ext-diff", "--no-textconv", "resolved object ids", "project-derived command string",
        "profile_session", "fresh session", "in-memory byte attestation",
    ):
        if marker not in native_adapter:
            fail(f"Codex inline-reviewer adapter is missing {marker!r}")
    for retired in ("run_inline_review", "evidence_manifest", "manifest_digest", "stdin-only", "deny-root"):
        if retired in native_adapter:
            fail(f"Codex inline-reviewer adapter retains retired marker {retired!r}")
    init_lower = re.sub(r"\s+", " ", init.lower())
    for marker in (
        "inline-reviewer", "requested_lenses",
        "required_lenses", "project root", "commit/range", "sandbox_mode = \"read-only\"",
        "adversary", "security floor", "expected_lens", "dispatch_id", "regular non-symlink",
        "sha-256", "review-pr", "exclusive", "stale", "fresh codex session", "explicit restart",
        "in-memory byte attestation",
    ):
        if marker not in init_lower:
            fail(f"Codex init native inline contract is missing {marker!r}")
    for retired in ("run_inline_review", "evidence_manifest", "manifest_digest", "stdin-only", "deny-root"):
        if retired in init_lower:
            fail(f"Codex init retains retired inline marker {retired!r}")
    for marker in (
        "mode: inline-review", "repository_root", "commit_or_range", "requested_lenses",
        "required_lenses", "lens: tester|qa|security|adversary", "expected_lens",
        "dispatch_id", "security_floor", "read_only: true", "target_id",
        "native read-only sandbox", "security floor", "stale",
        "complete|incomplete|failed|unavailable|untrusted", "never averages verdicts",
        "absent return as PASS", "verdict: pass", "review-pr",
    ):
        if marker not in inline_contract:
            fail(f"shared inline contract is missing {marker!r}")
    for retired in ("evidence_manifest", "manifest_digest", "allowed_roots", "run_inline_review"):
        if retired in inline_contract:
            fail(f"shared inline contract retains retired marker {retired!r}")
    if "no second confirmation" not in activation_reference.lower() and "second confirmation" not in init.lower():
        fail("Codex sensitive inline path does not prohibit a second confirmation")
    if "explicitly selects `inline`" not in activation_reference.lower() and "selects `inline`" not in init.lower():
        fail("Codex sensitive inline path lacks live explicit selection")

    deliver_skill = (ROOT / "plugins/team-harness/skills/deliver/SKILL.md").read_text()
    delivery_reference = (
        ROOT / "plugins/team-harness/skills/pipeline/references/delivery.md"
    ).read_text()
    ship_contract = "\n".join((pipeline, current_state, deliver_skill, delivery_reference)).lower()
    for marker in ("single", "validated commit", "validated_commit_sha", "validated_tree_sha", "push", "draft pr"):
        if marker not in ship_contract:
            fail(f"Codex Gate 3 ship contract is missing {marker!r}")
    delivery_lower = delivery_reference.lower()
    for forbidden in ("run tests", "edit version/changelog", "stage", "commit", "fetch or reconcile"):
        if forbidden not in delivery_lower:
            fail(f"Codex publish-only delivery does not prohibit {forbidden!r}")
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
        "1 — start the full pipeline for the framed task",
        "2 — continue inline with a reduced scope",
        "3 — pause without changes",
        "never make copying or repeating it the only way to continue",
        "workspace setup, commit anchoring",
        "Never narrate that approval was explicit",
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

    for role in ("architect", "implementer", "tester", "cleaner", "qa", "security", "delivery"):
        if f"pipeline-{role}.toml" not in pipeline:
            fail(f"pipeline preflight does not name pipeline-{role}.toml")
    for marker in (
        "$CODEX_HOME/agents/",
        "$team-harness:setup agents",
        "$team-harness:update",
        "plugin-only skills",
        "regular non-symlink file",
        "stale or unrelated shadow",
        "# Code generated from runtime/schema/codex-agents.json; DO NOT EDIT.",
        "# Projection tier: opus; profile: team-harness",
        "# Projection tier: sonnet-high; profile: team-harness",
        "# Projection tier: sonnet-medium; profile: team-harness",
        "@Team-Harness pipeline <task>",
        "`@Team-Harness init` loads only the lightweight intake posture",
        "Do not create or dispatch a separate `orchestrator` agent",
        "cannot itself change `Main`'s selected model",
        "pipeline_spawn_profile",
        "Ejecuta /model",
        "fork_turns: none",
        "model_reasoning_effort",
        "pipeline-architect",
        "pipeline-delivery",
        "intake-bound live numeric choice `1`",
        "keep successful boot mechanics silent",
        "Do not tell the operator that activation was explicit",
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

    review_pr = (ROOT / "plugins/team-harness/skills/review-pr/canonical.md").read_text()
    for role in ("reviewer", "pr-review-qa", "pr-review-security", "reviewer-consolidator"):
        if role not in review_pr:
            fail(f"Codex review-pr preflight does not name {role}")
    for marker in (
        "all four exact agent identities",
        "one complete project or global set only",
        "regular non-symlink",
        'sandbox_mode = "read-only"',
        "filesystem-read plus external-read",
        "$team-harness:setup agents",
        "new Codex thread",
    ):
        if marker not in review_pr:
            fail(f"Codex review-pr preflight is missing {marker!r}")
    review_pr_adapter = (ROOT / "plugins/team-harness/skills/review-pr/SKILL.md").read_text()
    for marker in (
        "bounded non-mutating `exec_command` calls",
        'sandbox_mode = "read-only"',
        "override the canonical no-Bash rule only for those reads",
        "is not a missing or stale agent declaration",
        "must never trigger setup, update, or restart guidance",
        "dispatch one fresh replacement against the same immutable snapshot",
        "do not clean up or rebuild first",
        "same reviewed head SHA and context hash",
        "replacement also blocks solely for missing standalone filesystem tools",
        "fail closed without publishing or approving a review",
        "include the exact read failure when one exists",
    ):
        if marker not in review_pr_adapter:
            fail(f"Codex review-pr adapter is missing native read recovery marker {marker!r}")
    if "Agents run no Bash." not in (ROOT / "skills/review-pr/SKILL.md").read_text():
        fail("Claude review-pr unexpectedly lost its no-Bash boundary")

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
        "implementer": ("assigned role packet", "never preload sibling tasks"),
        "tester": ("assigned task shard", "fixed testing prose within 40 lines"),
        "qa": ("assigned task shard", "fixed report prose within 30 lines"),
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

    native_observability = (
        ROOT / "plugins/team-harness/skills/pipeline/references/observability.md"
    ).read_text()
    trace_canonical = (ROOT / "skills/trace/SKILL.md").read_text()
    trace_projection = (ROOT / "plugins/team-harness/skills/trace/canonical.md").read_text()
    trace_opencode_projection = (
        ROOT / "installer-assets/opencode-skills/trace/canonical.md"
    ).read_text()
    for marker in (
        "codex_usage_checkpoint",
        "codex_usage_delta",
        "CHECKPOINT_UNAVAILABLE",
        "never write either one",
        "Cost: unavailable",
        '"currency": "USD"',
        '"effective_from"',
    ):
        if marker not in native_observability:
            fail(f"native Codex observability contract is missing {marker!r}")
    for marker in (
        "not native Codex lifecycle telemetry",
        "`agent.spawn`",
        "`agent.close`",
        "`agent.correction.spawn`",
        "`context_strategy: fresh|continued`",
        "`follow_up_count`",
        "codex_agent_attempt_metrics",
        "PER_ATTEMPT_METRICS_UNAVAILABLE",
        "cached_input_per_approved_ac",
        "does not create or promise such telemetry",
    ):
        if marker not in native_observability:
            fail(f"native Codex lifecycle contract is missing {marker!r}")
    for label, text in (
        ("canonical trace", trace_canonical),
        ("Codex trace projection", trace_projection),
        ("opencode trace projection", trace_opencode_projection),
    ):
        for marker in (
            "Cost: unavailable",
            "exact, case-sensitive tuple",
            "reasoning_output_tokens",
            "Native Codex branch — selected only by `usage.kind`",
            "Never infer provider/model/rate",
            "~/.claude/.team-harness.json",
            "tokens_estimated",
            "Static opus-agent fallback",
            "price table not configured",
        ):
            if marker not in text:
                fail(f"{label} is missing native/legacy cost marker {marker!r}")
        for marker in (
            "Declared Codex lifecycle efficiency — selected only by `agent.*`",
            "PER_ATTEMPT_METRICS_UNAVAILABLE",
            "Cached-input per approved AC",
            "the legacy output above unchanged",
            "never changes the legacy Claude cost",
        ):
            if marker not in text:
                fail(f"{label} is missing lifecycle observability marker {marker!r}")

    # Activation and pipeline skills carry the same generated-agent identity
    # digests. Verify both tables against the actual normalized TOML bytes.
    def digest_table(text: str) -> dict[str, str]:
        return dict(
            re.findall(
                r"\|\s+`?(pipeline-(?:architect|implementer|tester|cleaner|qa|security|delivery))`?\s+\|\s+`([0-9a-f]{64})`\s+\|",
                text,
            )
        )

    activation_digests = digest_table(activation)
    pipeline_digests = digest_table(pipeline)
    expected_updated_digests = {
        "pipeline-architect": "fd6db2a4ac06a33a904810ddcc50ed78d790c322cc31376d5d0cf2c2fd496544",
        "pipeline-implementer": "50339cdb6ebbf546914634c406740e957cd0b7152adb24f56dafaf5cb3656b17",
        "pipeline-tester": "eaadd9d23fea4bab3cddae0dd3ea76ad33d76e2564866254e06b6fce6aa1be0b",
        "pipeline-cleaner": "ea4260bcb8fc1e17034f0d6f91b9d97efefeb61065c50b88a25e792eaaab88b9",
        "pipeline-qa": "702c3bcbb41f9d2dd162b166a821f2a4f60f4ff3b04fd028113c4aae713d12b6",
        "pipeline-security": "fa5c8ce48def49085705fa083b1c2be2c02c9b9e560043313f3ba70f7004861a",
        "pipeline-delivery": "1173e6d5edb63039cdc7d315f4c170c8f5489f76665b2cd77df682ae4be08246",
    }
    if set(activation_digests) != session_pipeline_roles or activation_digests != pipeline_digests:
        fail("pipeline and activation skill digest tables are not synchronized")
    if activation_digests != expected_updated_digests:
        fail("pipeline identity digest table does not match the approved projection set")
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

    skill_check = subprocess.run(
        ["node", "tools/codex-runtime/sync-skills.mjs", "--check"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if skill_check.returncode != 0:
        fail(
            "Codex skill projections are stale:\n"
            f"{skill_check.stdout}{skill_check.stderr}"
        )

    print("codex runtime structure: PASS")


if __name__ == "__main__":
    try:
        check_post_gate1_projection()
        main()
    except Exception as error:
        print(f"codex runtime structure: FAIL: {error}", file=sys.stderr)
        raise
