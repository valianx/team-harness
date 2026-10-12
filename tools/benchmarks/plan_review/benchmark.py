#!/usr/bin/env python3
"""Native CLI A/B text-review benchmark; Python standard library only."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import random
import re
import shlex
import signal
import statistics
import subprocess
import threading
import time


ROOT = Path(__file__).resolve().parent
SOURCE_PATHS = ("agents/plan-reviewer.md", "skills/plan-review/SKILL.md", "skills/spec/references/development-phases.md")
MATERIAL = {"functional", "security", "structural"}
NON_TOOL_ITEMS = {"agent_message", "reasoning", "error"}
DIAGNOSTIC_LIMIT = 8
DIAGNOSTIC_MESSAGE_LIMIT = 1000
CODEX_CONFIG = {
    "project_doc_max_bytes": 0,
    "skills.include_instructions": False,
    "skills.bundled.enabled": False,
    "features.skip_host_skill_discovery": True,
    "features.skill_search": False,
    "features.skill_mcp_dependency_install": False,
    "features.plugins": False,
    "features.recommended_plugins": False,
    "features.apps": False,
    "apps._default.enabled": False,
    "include_apps_instructions": False,
    "include_collaboration_mode_instructions": False,
    "features.hooks": False,
    "features.plugin_hooks": False,
    "features.multi_agent": False,
    "features.multi_agent_v2": False,
    "agents.enabled": False,
    "features.agent_message_board": False,
    "features.memories": False,
    "memories.use_memories": False,
    "memories.generate_memories": False,
    "features.shell_tool": False,
    "features.shell_snapshot": False,
    "features.view_image": False,
    "features.image_generation": False,
    "features.browser_use": False,
    "features.computer_use": False,
    "features.js_repl": False,
    "features.code_mode": False,
    "features.code_mode_host": False,
    "features.code_mode_only": False,
    "features.goals": False,
    "features.sleep_tool": False,
    "features.token_budget": False,
    "features.tool_suggest": False,
    "features.tool_search": False,
    "tools.update_plan.enabled": False,
    "tools.experimental_request_user_input.enabled": False,
    "web_search": "disabled",
    "sandbox_workspace_write.network_access": False,
}


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def runner_sha256():
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def protocol_sha256(workers):
    return digest({"version": 2, "answer_schema": answer_schema(), "codex_config": CODEX_CONFIG,
                   "non_tool_items": sorted(NON_TOOL_ITEMS), "diagnostic_limit": DIAGNOSTIC_LIMIT,
                   "diagnostic_message_limit": DIAGNOSTIC_MESSAGE_LIMIT, "workers": workers,
                   "scheduling": "parallel_pairs_with_sequential_variants"})


def atomic_json(path, value):
    """Immutable, idempotent JSON write; never replace different evidence."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(value, indent=2, ensure_ascii=False) + "\n"
    if path.exists():
        if json.loads(path.read_text()) != value:
            raise ValueError(f"Refusing to overwrite different evidence: {path}")
        return
    tmp = path.with_name(path.name + f".{os.getpid()}.tmp")
    with tmp.open("x", encoding="utf-8") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    try:
        os.link(tmp, path)
    finally:
        tmp.unlink()


def require_output_directory(path):
    """Keep study evidence outside Git or inside a deliberately ignored directory."""
    directory = Path(path).resolve()
    for root in (directory, *directory.parents):
        if (root / ".git").exists():
            repository = subprocess.run(["git", "-C", str(root), "rev-parse", "--show-toplevel"],
                                        capture_output=True, text=True, check=False)
            if repository.returncode != 0:
                continue
            relative = directory.relative_to(root)
            ignored = subprocess.run(["git", "-C", str(root), "check-ignore", "--quiet", "--", str(relative)],
                                     capture_output=True, text=True, check=False)
            if relative == Path(".") or ignored.returncode != 0:
                raise ValueError("Output must be external to Git or in a Git-ignored directory")
            break
    return directory


def load_cases(path):
    cases = json.loads(Path(path).read_text())
    if not isinstance(cases, dict) or not cases:
        raise ValueError("Cases must be a non-empty object")
    for case in cases.values():
        if not isinstance(case.get("input"), dict) or not isinstance(case.get("oracle"), dict):
            raise ValueError("Each case requires separate input and oracle objects")
    return cases


def balanced_pairs(cases, runtimes, flows, repetitions, seed):
    if repetitions < 1:
        raise ValueError("Repetitions must be positive")
    rng = random.Random(seed)
    pairs = []
    for runtime in runtimes:
        for flow in flows:
            group = [{"case_id": case, "runtime": runtime, "flow": flow, "repetition": rep + 1}
                     for case in cases for rep in range(repetitions)]
            orders = [["A", "B"] if i % 2 == 0 else ["B", "A"] for i in range(len(group))]
            rng.shuffle(orders)
            for pair, order in zip(group, orders):
                pairs.append({**pair, "order": order})
    rng.shuffle(pairs)
    return pairs


def snapshot(repo, ref):
    def git(*args):
        result = subprocess.run(["git", "-C", str(repo), *args], text=True, capture_output=True, check=True)
        return result.stdout.strip()
    commit = git("rev-parse", "--verify", ref + "^{commit}")
    tree = git("rev-parse", commit + "^{tree}")
    files = {path: git("show", f"{commit}:{path}") for path in SOURCE_PATHS}
    return {"repository": str(Path(repo).resolve()), "commit": commit, "tree": tree,
            "source_sha256": digest(files), "file_sha256": {p: hashlib.sha256(t.encode()).hexdigest() for p, t in files.items()}, "files": files}


def body(text):
    if text.startswith("---\n"):
        return text.split("\n---\n", 1)[-1].strip()
    return text.strip()


def build_prompt(source, case, flow):
    instructions = "\n\n".join(f"SOURCE {path}\n{body(text)}" for path, text in source["files"].items())
    return (
        f"You have been assigned the single read-only plan review in the {flow} flow. "
        "The operator explicitly requested this review. The complete supplied source context and planning artifacts follow. "
        "Use the source guidance to assess the current plan. Do not run tools, access files/network, delegate, edit artifacts, or require another review. "
        "This task ends with a structured review; it does not execute product acceptance or deliver software. "
        "Return the requested JSON schema. Reference requirement IDs, task IDs, scenario IDs and artifact locations from the supplied evidence. "
        "Use current_plan, requirements, history.prior_plan or history.prior_findings as location artifact names. "
        "The corrected_task_order is the proposed execution order (retain it when already correct); parallel_design_tasks identifies design work that can begin independently. "
        "validation describes the command and coverage of the proposed validation after any correction. "
        "guarantee_checks describes how the resulting plan verifies any explicit preservation contract. "
        "All fields describe the reviewed/proposed plan, with concrete evidence and limits.\n\n"
        + instructions + "\n\nSUPPLIED PLANNING ARTIFACTS\n" + json.dumps(case["input"], indent=2) + "\n"
    )


def answer_schema():
    string = {"type": "string"}
    strings = {"type": "array", "items": string}
    boolean = {"type": "boolean"}
    def obj(properties):
        return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}
    def enum(values):
        return {"type": "string", "enum": values}
    finding = obj({
        "classification": enum(["functional", "security", "structural", "editorial", "legitimate_choice", "new_scope"]),
        "severity": enum(["blocking", "concern", "note"]), "requirement_ids": strings, "affected_task_ids": strings,
        "locations": {"type": "array", "items": obj({"artifact": string, "locator": string})},
        "evidence": string, "impact": string, "corrective_action": string,
        "origin": enum(["regression", "late_discovery", "unknown", "not_applicable"]),
    })
    check = obj({"requirement_id": string,
                 "kind": enum(["multiset_equality", "full_row_equality", "keyed_row_equality", "set_equality", "aggregate_equality", "event_observation", "other"]),
                 "compared_fields": strings, "multiplicity_preserved": boolean, "nulls_preserved": boolean, "description": string})
    return obj({"verdict": enum(["pass", "concerns", "fail"]), "summary": string,
                "findings": {"type": "array", "items": finding}, "corrected_task_order": strings, "parallel_design_tasks": strings,
                "validation": obj({"command": string, "selected_test_ids": strings, "covered_scenario_ids": strings}),
                "guarantee_checks": {"type": "array", "items": check}})


def validate_answer(answer, schema=None):
    schema = answer_schema() if schema is None else schema
    kind = schema["type"]
    if kind == "object":
        if not isinstance(answer, dict) or set(answer) != set(schema["required"]):
            raise ValueError("Answer does not match required object fields")
        for key, child in schema["properties"].items():
            validate_answer(answer[key], child)
    elif kind == "array":
        if not isinstance(answer, list):
            raise ValueError("Answer requires an array")
        for item in answer:
            validate_answer(item, schema["items"])
    elif kind == "string":
        if not isinstance(answer, str) or ("enum" in schema and answer not in schema["enum"]):
            raise ValueError("Answer requires a valid string")
    elif kind == "boolean" and not isinstance(answer, bool):
        raise ValueError("Answer requires a boolean")


def numeric_usage(raw):
    return {key: numeric_usage(value) if isinstance(value, dict) else value
            for key, value in raw.items() if isinstance(value, dict) or (isinstance(value, (int, float)) and not isinstance(value, bool))}


def token_usage(raw, runtime):
    raw = numeric_usage(raw)
    input_tokens = raw.get("input_tokens")
    output_tokens = raw.get("output_tokens")
    cached = raw.get("cached_input_tokens", raw.get("input_tokens_details", {}).get("cached_tokens")) if runtime == "codex" else raw.get("cache_read_input_tokens")
    written = raw.get("cache_write_input_tokens") if runtime == "codex" else raw.get("cache_creation_input_tokens")
    exposed = input_tokens
    if runtime == "claude":
        exposed = sum([input_tokens, cached, written]) if all(v is not None for v in [input_tokens, cached, written]) else None
    total = raw.get("total_tokens")
    if total is None and exposed is not None and output_tokens is not None:
        total = exposed + output_tokens
    return {"native": raw, "input_tokens": input_tokens, "input_tokens_includes_cached": runtime == "codex",
            "cached_input_tokens": cached, "cache_write_input_tokens": written, "input_tokens_total": exposed,
            "output_tokens": output_tokens, "reasoning_output_tokens": raw.get("reasoning_output_tokens", raw.get("output_tokens_details", {}).get("reasoning_tokens")), "total_tokens": total}


def native_metadata(runtime, stdout):
    """Retain numeric usage and redacted native diagnostics; never retain tool outputs."""
    if runtime == "claude":
        try:
            result = json.loads(stdout)
        except (ValueError, TypeError):
            return {"usage": None, "tool_events": None, "event_audit": []}
        return {"usage": token_usage(result.get("usage", {}), "claude"), "tool_events": None,
                "completed_turns": result.get("num_turns"), "event_audit": [{"event_type": result.get("type"), "subtype": result.get("subtype")}],
                "native_model_usage": {model: numeric_usage(usage) for model, usage in result.get("modelUsage", {}).items()}}
    audit, usages, diagnostics = [], [], []
    tools = 0
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if not isinstance(event, dict):
            continue
        item_type = event.get("item", {}).get("type")
        audit.append({"event_type": event.get("type"), "item_type": item_type})
        tools += bool(item_type and item_type not in NON_TOOL_ITEMS)
        diagnostic = codex_diagnostic(event)
        if diagnostic and len(diagnostics) < DIAGNOSTIC_LIMIT:
            diagnostics.append(diagnostic)
        if event.get("type") == "turn.completed" and isinstance(event.get("usage"), dict):
            usages.append(token_usage(event["usage"], "codex"))
    return {"usage": usages[0] if len(usages) == 1 else None, "native_turn_usage": usages,
            "completed_turns": len(usages), "tool_events": tools, "event_audit": audit,
            "native_diagnostics": diagnostics}


def parse_codex(stdout, last_message=None):
    events = [json.loads(line) for line in stdout.splitlines() if line.strip()]
    messages = []
    audit = []
    usage = None
    completed = 0
    for event in events:
        if not isinstance(event, dict):
            raise ValueError("Invalid native JSON event")
        event_type = event.get("type")
        item = event.get("item", {})
        item_type = item.get("type")
        audit.append({"event_type": event_type, "item_type": item_type})
        if event_type in {"error", "turn.failed"}:
            diagnostic = codex_diagnostic(event)
            raise ValueError(f"Native error event: {event_type}: {diagnostic['message']}")
        if item_type and item_type not in NON_TOOL_ITEMS:
            raise ValueError(f"Invalid review-only trial: tool event {item_type}")
        if event_type == "item.completed" and item_type == "agent_message":
            messages.append(item.get("text", ""))
        if event_type == "turn.completed":
            completed += 1
            usage = event.get("usage", {})
    if completed != 1:
        raise ValueError("Expected exactly one completed fresh turn")
    text = last_message if last_message is not None else (messages[-1] if messages else "")
    answer = json.loads(text)
    validate_answer(answer)
    return {"answer": answer, "usage": token_usage(usage, "codex"), "completed_turns": completed,
            "model_request_count": None, "tool_events": 0, "event_audit": audit, "native_model_usage": None,
            "native_diagnostics": native_metadata("codex", stdout)["native_diagnostics"]}


def parse_claude(stdout):
    result = json.loads(stdout)
    if result.get("is_error") or result.get("subtype") not in {None, "success"}:
        raise ValueError("Native Claude result reports an error")
    if result.get("permission_denials"):
        raise ValueError("Invalid review-only trial: denied tool attempt")
    answer = result.get("structured_output")
    if answer is None:
        answer = json.loads(result.get("result", ""))
    validate_answer(answer)
    return {"answer": answer, "usage": token_usage(result.get("usage", {}), "claude"),
            "completed_turns": result.get("num_turns"), "model_request_count": None,
            "tool_events": None, "event_audit": [{"event_type": result.get("type"), "subtype": result.get("subtype")}],
            "native_model_usage": {model: numeric_usage(usage) for model, usage in result.get("modelUsage", {}).items()}}


def command_scenarios(command, inventory):
    """Resolve safe pytest selection against the supplied fixture inventory; never execute it."""
    try:
        tokens = shlex.split(command)
    except ValueError:
        return None
    if tokens[:3] in (["python", "-m", "pytest"], ["python3", "-m", "pytest"]):
        tokens = tokens[3:]
    elif tokens and tokens[0] == "pytest":
        tokens = tokens[1:]
    else:
        return None
    paths = []
    for token in tokens:
        if token in {"-q", "-v", "-vv", "-x", "--disable-warnings"}:
            continue
        if token.startswith("-") or token in {"&&", ";", "|"}:
            return None
        paths.append(token.rstrip("/"))
    selected = [test for test in inventory if not paths or any(test["path"] == p or test["path"].startswith(p + "/") for p in paths)]
    return {s for test in selected for s in test["scenario_ids"]}


def score_answer(case, answer):
    """Provisional structured scoring. Main must adjudicate semantic correctness."""
    oracle = case["oracle"]
    findings = answer["findings"]
    found = set()
    matched_findings = set()
    supported_origin = True
    for i, defect in enumerate(oracle["material_defects"]):
        for j, finding in enumerate(findings):
            if (finding["classification"] in MATERIAL and finding["severity"] != "note"
                and defect["requirement_id"] in finding["requirement_ids"]
                and set(defect["task_ids"]) & set(finding["affected_task_ids"])
                and any(loc["artifact"] == "current_plan" and loc["locator"] in defect["task_ids"] for loc in finding["locations"])
                and all(finding[key].strip() for key in ["evidence", "impact", "corrective_action"])):
                found.add(i)
                matched_findings.add(j)
                supported_origin &= finding["origin"] == defect["origin"]
    false_positives = sum(i not in matched_findings and (f["classification"] in MATERIAL or f["severity"] == "blocking") for i, f in enumerate(findings))
    order = answer["corrected_task_order"]
    task_ids = {task["id"] for task in case["input"]["current_plan"]["tasks"]}
    order_ok = len(order) == len(task_ids) and set(order) == task_ids
    order_ok &= all(a in order and b in order and order.index(a) < order.index(b) for a, b in oracle["before"])
    scenarios = command_scenarios(answer["validation"]["command"], case["input"]["test_inventory"])
    uncovered = None if scenarios is None else sorted(set(oracle["required_scenarios"]) - scenarios)
    guarantees_ok = True
    for required in oracle["guarantees"]:
        guarantees_ok &= any(check["requirement_id"] == required["requirement_id"] and check["kind"] in required["kinds"]
                             and set(required["fields"]) <= set(check["compared_fields"])
                             and (not required["multiplicity"] or check["multiplicity_preserved"])
                             and (not required["nulls"] or check["nulls_preserved"])
                             for check in answer["guarantee_checks"])
    return {"scoring_status": "provisional_requires_manual_adjudication", "expected_material_defects": len(oracle["material_defects"]),
            "detected_material_defects": len(found), "missed_material_defects": len(oracle["material_defects"]) - len(found),
            "false_positives": false_positives, "origin_supported": supported_origin if found else None,
            "task_order_preserved": bool(order_ok), "parallel_design_preserved": set(oracle["parallel_design_tasks"]) <= set(answer["parallel_design_tasks"]),
            "validation_command_verified": scenarios is not None, "uncovered_scenarios": uncovered,
            "guarantees_preserved": bool(guarantees_ok)}


def native_command(runtime, binary, model, effort, cwd, schema, answer):
    # env unsets only host/session controls; native auth is inherited, never inspected or copied.
    command = ["/usr/bin/env", "-u", "CLAUDECODE", "-u", "CODEX_THREAD_ID", "-u", "CLAUDE_CODE_EFFORT_LEVEL", "-u", "MAX_THINKING_TOKENS", "-u", "CLAUDE_CODE_DISABLE_THINKING", binary]
    if runtime == "codex":
        command += ["--no-daemon", "--ask-for-approval", "never", "exec", "--strict-config", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check",
                    "--model", model, "--sandbox", "read-only", "--cd", str(cwd), "--json", "--color", "never", "--output-schema", str(schema), "--output-last-message", str(answer)]
        config = {**CODEX_CONFIG, "model_reasoning_effort": effort}
        for key, value in config.items():
            command += ["--config", key + "=" + canonical(value)]
        command += ["-"]
    elif runtime == "claude":
        command += ["--safe-mode", "--restricted", "--setting-sources", "", "--disable-slash-commands", "--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
                    "--permission-mode", "dontAsk", "--permission-prompts", "none", "--no-chrome", "--print", "--output-format", "json", "--no-session-persistence",
                    "--model", model, "--effort", effort, "--json-schema", canonical(answer_schema())]
    else:
        raise ValueError("Unsupported runtime")
    return command


def validate_prepared_schema(out):
    expected = (json.dumps(answer_schema(), indent=2, ensure_ascii=False) + "\n").encode()
    try:
        prepared = (out / "answer.schema.json").read_bytes()
    except OSError as error:
        raise ValueError("Prepared answer schema is missing or unreadable") from error
    if prepared != expected:
        raise ValueError("Prepared answer schema identity changed")


def prepared_trial_command(out, manifest, trial):
    """Reconstruct trusted native argv; stored argv is evidence, never executable input."""
    tid = trial.get("trial_id")
    if not isinstance(tid, str) or tid in {".", ".."} or Path(tid).name != tid:
        raise ValueError("Invalid trial directory identity")
    directory = out / "trials" / tid
    if directory.resolve() != directory or (directory / "cwd").resolve() != directory / "cwd":
        raise ValueError("Trial paths must remain inside their prepared study directory")
    runtime = trial.get("runtime")
    configs = manifest.get("runtime_configs") or {}
    config = configs.get(runtime)
    if runtime not in {"codex", "claude"} or not isinstance(config, dict):
        raise ValueError("Trial runtime has no declared configuration")
    if set(config) != {"binary", "model", "effort"} or any(not isinstance(value, str) or not value for value in config.values()):
        raise ValueError("Invalid declared runtime configuration")
    if trial.get("config") != config:
        raise ValueError("Trial configuration differs from its declared runtime")
    command = native_command(runtime, **config, cwd=directory / "cwd",
                             schema=out / "answer.schema.json", answer=directory / "native-answer.json")
    if trial.get("command") != command:
        raise ValueError("Prepared command differs from the declared native protocol")
    validate_prepared_schema(out)
    return command


def redact(text):
    keys = r"authorization|proxy[_-]?authorization|x[_-]?api[_-]?key|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|secret|token|cookie|set-cookie|x-amz-security-token|x-amz-signature"
    # Redact string values, rather than JSON syntax, so full headers cannot swallow closing quotes.
    try:
        structured = json.loads(text)
    except ValueError:
        structured = None
    if isinstance(structured, (dict, list, str)):
        def scrub(value):
            if isinstance(value, dict):
                return {key: "[REDACTED]" if re.fullmatch(keys, key, re.IGNORECASE) else scrub(child)
                        for key, child in value.items()}
            if isinstance(value, list):
                return [scrub(child) for child in value]
            return redact(value) if isinstance(value, str) else value
        return json.dumps(scrub(structured), ensure_ascii=False)
    text = re.sub(r"(?i)((?:bearer|basic)\s+)[^\s\"']+", r"\1[REDACTED]", text)
    text = re.sub(r"\bsk-[A-Za-z0-9_-]{12,}", "[REDACTED]", text)
    text = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED]", text)
    text = re.sub(r"(?i)(https?://)[^\s/@]+:[^\s/@]+@", r"\1[REDACTED]@", text)
    pattern = r'''(?i)(["']?\b(?:''' + keys + r''')["']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;&"']+)'''
    def replace(match):
        value = match.group(2)
        quote = value[0] if value.startswith(('"', "'")) else ""
        return match.group(1) + quote + "[REDACTED]" + quote
    header = r'''(?i)(["']?\b(?:authorization|proxy[_-]?authorization|cookie|set-cookie)["']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\r\n]+)'''
    text = re.sub(header, replace, text)
    return re.sub(pattern, replace, text)


def bounded_diagnostic(source, severity, message):
    message = redact(message) if isinstance(message, str) and message else "Native diagnostic message unavailable"
    return {"source": source, "severity": severity, "message": message[:DIAGNOSTIC_MESSAGE_LIMIT],
            "truncated": len(message) > DIAGNOSTIC_MESSAGE_LIMIT}


def codex_diagnostic(event):
    if event.get("type") == "error":
        return bounded_diagnostic("error", "error", event.get("message"))
    if event.get("type") == "turn.failed":
        return bounded_diagnostic("turn.failed", "error", event.get("error", {}).get("message"))
    if event.get("item", {}).get("type") == "error":
        return bounded_diagnostic("item.error", "warning", event["item"].get("message"))
    return None


def stderr_diagnostics(stderr):
    diagnostics = []
    pattern = re.compile(r"(?i)^\s*(?:\d{4}-\d\d-\d\d[T ][^ ]+\s+)?(?:ERROR|WARN(?:ING)?|FATAL|failed to|panic)(?::|\s)")
    for line in stderr.splitlines():
        line = re.sub(r"\x1b\[[0-9;]*m", "", line)
        if pattern.match(line):
            severity = "warning" if re.search(r"(?i)\bWARN(?:ING)?\b", line) else "error"
            diagnostics.append(bounded_diagnostic("stderr", severity, line))
            if len(diagnostics) >= DIAGNOSTIC_LIMIT:
                break
    return diagnostics


def trial_state(trial_dir):
    trial_dir = Path(trial_dir)
    if (trial_dir / "result.json").exists():
        return "complete"
    if (trial_dir / "started.json").exists():
        return "interrupted"
    return "pending"


def prepare(args):
    out = require_output_directory(args.out)
    out.mkdir(parents=True, exist_ok=True)
    cases = load_cases(args.cases_file)
    chosen = list(cases) if args.cases == "all" else args.cases.split(",")
    if any(case not in cases for case in chosen):
        raise ValueError("Unknown case ID")
    runtimes, flows = args.runtimes.split(","), args.flows.split(",")
    if not set(runtimes) <= {"codex", "claude"} or not set(flows) <= {"spec", "pipeline"}:
        raise ValueError("Unsupported runtime or flow")
    workers = getattr(args, "workers", 1)
    if workers not in {1, 2}:
        raise ValueError("Workers must be 1 or 2")
    configs = {"codex": {"binary": args.codex_binary, "model": args.codex_model, "effort": args.codex_effort},
               "claude": {"binary": args.claude_binary, "model": args.claude_model, "effort": args.claude_effort}}
    for runtime in runtimes:
        if not configs[runtime]["model"] or not configs[runtime]["effort"]:
            raise ValueError("Each selected runtime needs an explicit model and effort")
    sources = {"A": snapshot(args.repo, args.baseline_ref), "B": snapshot(args.repo, args.candidate_ref)}
    atomic_json(out / "snapshots.json", sources)
    atomic_json(out / "cases.json", {name: cases[name] for name in chosen})
    atomic_json(out / "answer.schema.json", answer_schema())
    pairs = balanced_pairs(chosen, runtimes, flows, args.repetitions, args.seed)
    trials = []
    for number, pair in enumerate(pairs, 1):
        for position, variant in enumerate(pair["order"], 1):
            tid = f"t{len(trials) + 1:04d}-{digest([args.seed, number, position])[:8]}"
            trial = {**{k: v for k, v in pair.items() if k != "order"}, "trial_id": tid, "pair_id": number,
                     "pair_order": "".join(pair["order"]), "position": position, "variant": variant,
                     "snapshot_sha256": sources[variant]["source_sha256"], "config": configs[pair["runtime"]]}
            directory = out / "trials" / tid
            directory.mkdir(parents=True, exist_ok=True)
            (directory / "cwd").mkdir(exist_ok=True)
            prompt = build_prompt(sources[variant], cases[pair["case_id"]], pair["flow"])
            prompt_path = directory / "prompt.txt"
            if prompt_path.exists() and prompt_path.read_text() != prompt:
                raise ValueError("Refusing to overwrite a different prompt")
            if not prompt_path.exists():
                prompt_path.write_text(prompt)
            trial["prompt_sha256"] = hashlib.sha256(prompt.encode()).hexdigest()
            trial["command"] = native_command(pair["runtime"], **configs[pair["runtime"]], cwd=directory / "cwd", schema=out / "answer.schema.json", answer=directory / "native-answer.json")
            trials.append(trial)
    manifest = {"benchmark_version": 2, "scope": "bounded_fresh_context_text_review", "seed": args.seed,
                "repetitions": args.repetitions, "case_ids": chosen, "runtime_configs": {r: configs[r] for r in runtimes},
                "workers": workers, "scheduling": "parallel_pairs_with_sequential_variants",
                "runner_sha256": runner_sha256(), "protocol_sha256": protocol_sha256(workers),
                "flows": flows, "timeout_seconds": args.timeout, "fixture_sha256": digest({name: cases[name] for name in chosen}),
                "snapshot_identities": {v: {k: val for k, val in s.items() if k != "files"} for v, s in sources.items()}, "trials": trials}
    atomic_json(out / "manifest.json", manifest)
    print(json.dumps({"manifest": str(out / "manifest.json"), "native_invocations_planned": len(trials), "pairs": len(pairs), "workers": workers, "models_called": 0}))


def bounded_process(command, prompt, cwd, timeout):
    start = time.monotonic()
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=cwd, start_new_session=True)
    timed_out = False
    try:
        stdout, stderr = process.communicate(prompt, timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGTERM)
        try:
            stdout, stderr = process.communicate(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate()
    return {"returncode": process.returncode, "timed_out": timed_out, "wall_seconds": time.monotonic() - start,
            "stdout": stdout, "stderr": stderr}


def run(args):
    manifest_path = args.manifest.resolve()
    out = require_output_directory(manifest_path.parent)
    manifest = json.loads(manifest_path.read_text())
    cases = load_cases(out / "cases.json")
    if digest(cases) != manifest["fixture_sha256"]:
        raise ValueError("Fixture identity changed after preparation")
    if args.max_trials < 1:
        raise ValueError("--max-trials must be positive")
    workers = manifest.get("workers", 1)
    if workers not in {1, 2}:
        raise ValueError("Prepared workers must be 1 or 2")
    identity = {"workers": workers, "runner_sha256": runner_sha256(), "protocol_sha256": protocol_sha256(workers)}
    if manifest.get("runner_sha256", identity["runner_sha256"]) != identity["runner_sha256"]:
        raise ValueError("Prepared runner identity changed; prepare a new study")
    if manifest.get("protocol_sha256", identity["protocol_sha256"]) != identity["protocol_sha256"]:
        raise ValueError("Prepared protocol identity changed; prepare a new study")
    lock = out / ".run.lock"
    with lock.open("x") as handle:
        handle.write(str(os.getpid()))
    print_lock = threading.Lock()
    def emit(value):
        with print_lock:
            print(json.dumps(value), flush=True)
    try:
        # Reserve the bounded pending slice before any launch. Each worker owns disjoint pairs.
        pending = []
        for trial in manifest["trials"]:
            directory = out / "trials" / trial["trial_id"]
            state = trial_state(directory)
            if state != "pending":
                emit({"trial_id": trial["trial_id"], "skipped": state})
                continue
            if len(pending) < args.max_trials:
                pending.append(trial)
        pairs = {}
        for trial in pending:
            # Reject the entire bounded selection before any worker can launch a native client.
            prepared_trial_command(out, manifest, trial)
            directory = out / "trials" / trial["trial_id"]
            prompt = (directory / "prompt.txt").read_text()
            if hashlib.sha256(prompt.encode()).hexdigest() != trial["prompt_sha256"]:
                raise ValueError("Prepared prompt identity changed")
            if any((directory / "cwd").iterdir()):
                raise ValueError("Trial working directory is not empty")
            if trial["case_id"] not in cases:
                raise ValueError("Trial case is not in the prepared fixture")
            pairs.setdefault(trial.get("pair_id", trial["trial_id"]), []).append(trial)
        def run_pair(trials):
            for trial in trials:
                result = run_trial(out, manifest, trial, cases[trial["case_id"]], identity)
                emit({"trial_id": trial["trial_id"], "status": result["status"], "wall_seconds": result.get("wall_seconds"),
                      "total_tokens": result["usage"]["total_tokens"] if result.get("usage") else None,
                      "error": result.get("error"), "native_diagnostics": result.get("native_diagnostics", [])})
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [executor.submit(run_pair, trials) for trials in pairs.values()]
            for future in futures:
                future.result()
    finally:
        lock.unlink(missing_ok=True)
    emit({"native_invocations_this_run": len(pending), "workers": workers, "summary_command": f"python3 {ROOT / 'benchmark.py'} summarize --manifest {manifest_path}"})


def run_trial(out, manifest, trial, case, identity):
    command = prepared_trial_command(out, manifest, trial)
    directory = out / "trials" / trial["trial_id"]
    prompt = (directory / "prompt.txt").read_text()
    if hashlib.sha256(prompt.encode()).hexdigest() != trial["prompt_sha256"]:
        raise ValueError("Prepared prompt identity changed")
    if any((directory / "cwd").iterdir()):
        raise ValueError("Trial working directory is not empty")
    atomic_json(directory / "started.json", {"trial_id": trial["trial_id"], "started_at_unix": time.time(), "manifest_sha256": digest(manifest),
                                           "run_identity": identity, "command": command})
    result = {"trial_id": trial["trial_id"], "status": "error", "native_invocation_count": 1, "run_identity": identity,
              "manifest_sha256": digest(manifest),
              "model_request_count": None, "usage": None, "answer": None, "score": None}
    try:
        process = bounded_process(command, prompt, directory / "cwd", manifest["timeout_seconds"])
        result.update({k: process[k] for k in ["returncode", "timed_out", "wall_seconds"]})
        result["stderr_characters"] = len(process["stderr"])
        result["stderr_sha256"] = hashlib.sha256(process["stderr"].encode()).hexdigest()
        result["stdout_sha256"] = hashlib.sha256(process["stdout"].encode()).hexdigest()
        result.update(native_metadata(trial["runtime"], process["stdout"]))
        result["native_diagnostics"] = (result.get("native_diagnostics", []) + stderr_diagnostics(process["stderr"]))[:DIAGNOSTIC_LIMIT]
        if process["timed_out"] or process["returncode"] != 0:
            raise ValueError("Native process timeout" if process["timed_out"] else f"Native process exited {process['returncode']}")
        if trial["runtime"] == "codex":
            final = directory / "native-answer.json"
            parsed = parse_codex(process["stdout"], final.read_text() if final.exists() else None)
        else:
            parsed = parse_claude(process["stdout"])
        parsed["answer"] = json.loads(redact(json.dumps(parsed["answer"])))
        diagnostics = result["native_diagnostics"]
        result.update(parsed)
        result["native_diagnostics"] = diagnostics
        result.update(status="ok", score=score_answer(case, parsed["answer"]))
        atomic_json(out / "blind" / (trial["trial_id"] + ".json"), {"trial_id": trial["trial_id"], "case_id": trial["case_id"], "input": case["input"], "answer": parsed["answer"]})
    except (ValueError, OSError, json.JSONDecodeError) as error:
        result["error"] = redact(str(error))
    finally:
        (directory / "native-answer.json").unlink(missing_ok=True)
        atomic_json(directory / "result.json", result)
    return result


def summarize(args):
    manifest_path = args.manifest.resolve()
    out = manifest_path.parent
    manifest = json.loads(manifest_path.read_text())
    # Both reports use the same pure receipt binding, loaded from this tooling's sibling file.
    spec = importlib.util.spec_from_file_location("plan_review_analysis", ROOT / "analyze.py")
    analysis = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(analysis)
    groups, excluded_groups, issues = {}, {}, []
    pending, interrupted = 0, 0
    for trial in manifest["trials"]:
        directory = out / "trials" / trial["trial_id"]
        state = trial_state(directory)
        receipts = []
        for name in ["result.json", "started.json"]:
            path = directory / name
            try:
                receipts.append(json.loads(path.read_text()) if path.exists() else None)
            except (ValueError, UnicodeDecodeError):
                issues.append({"kind": "unreadable_json", "source": str(path)})
                receipts.append(None)
        result, started, excluded = analysis.bind_native_receipts(manifest, trial, *receipts,
                                                                  (directory / "result.json").exists(),
                                                                  (directory / "started.json").exists(), issues)
        key = f"{trial['runtime']}/{trial['flow']}/{trial['variant']}"
        if excluded:
            groups.setdefault(key, [])
            excluded_groups[key] = excluded_groups.get(key, 0) + 1
            continue
        if state != "complete":
            pending += state == "pending"
            interrupted += state == "interrupted"
            continue
        groups.setdefault(key, []).append(result)
    summary = {"scope": manifest["scope"], "status": "descriptive_provisional", "manual_adjudication_required": True,
               "workers": manifest.get("workers", 1), "runner_sha256": manifest.get("runner_sha256"), "protocol_sha256": manifest.get("protocol_sha256"),
               "planned_invocations": len(manifest["trials"]), "pending": pending, "interrupted_ambiguous_cost": interrupted,
               "excluded_evidence": sum(excluded_groups.values()), "integrity_issues": issues, "groups": {}}
    for key, results in groups.items():
        valid = [r for r in results if r["status"] == "ok"]
        scores = [r["score"] for r in valid]
        group = {"native_invocations": len(results), "valid_reviews": len(valid), "errors": len(results) - len(valid),
                 "excluded_evidence": excluded_groups.get(key, 0),
                 "median_wall_seconds": statistics.median([r["wall_seconds"] for r in results if "wall_seconds" in r]) if any("wall_seconds" in r for r in results) else None,
                 "material_defects_expected": sum(s["expected_material_defects"] for s in scores),
                 "material_defects_missed": sum(s["missed_material_defects"] for s in scores), "false_positives": sum(s["false_positives"] for s in scores),
                 "unsupported_origin_reviews": sum(s["origin_supported"] is False for s in scores),
                 "guarantee_failures": sum(not s["guarantees_preserved"] for s in scores),
                 "order_failures": sum(not s["task_order_preserved"] for s in scores),
                 "coverage_failures": sum(bool(s["uncovered_scenarios"]) for s in scores),
                 "coverage_unverified": sum(not s["validation_command_verified"] for s in scores), "tokens": {}}
        for field in ["input_tokens_total", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"]:
            usage_rows = [u for r in results for u in (r.get("native_turn_usage") or ([r["usage"]] if r.get("usage") else [None]))]
            values = [u[field] if u else None for u in usage_rows]
            group["tokens"][field] = {"sum_reported": sum(v for v in values if v is not None) if any(v is not None for v in values) else None,
                                      "usage_records_reported": sum(v is not None for v in values), "usage_records_unavailable": sum(v is None for v in values)}
        summary["groups"][key] = group
    # Summaries can be refreshed after resume; original trial evidence remains immutable.
    print(json.dumps(summary, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare", help="Freeze prompts/order/source identities; no model calls")
    prep.add_argument("--repo", type=Path, required=True)
    prep.add_argument("--baseline-ref", required=True)
    prep.add_argument("--candidate-ref", required=True)
    prep.add_argument("--out", type=Path, required=True)
    prep.add_argument("--cases-file", type=Path, default=ROOT / "cases.json")
    prep.add_argument("--cases", default="all")
    prep.add_argument("--runtimes", default="codex")
    prep.add_argument("--flows", default="spec,pipeline")
    prep.add_argument("--repetitions", type=int, default=2)
    prep.add_argument("--seed", type=int, default=691)
    prep.add_argument("--timeout", type=int, default=180)
    prep.add_argument("--workers", type=int, choices=[1, 2], default=1, help="Freeze the number of concurrent pairs; variants in each pair run sequentially")
    prep.add_argument("--codex-binary", default="codex")
    prep.add_argument("--codex-model")
    prep.add_argument("--codex-effort")
    prep.add_argument("--claude-binary", default="claude")
    prep.add_argument("--claude-model")
    prep.add_argument("--claude-effort")
    live = sub.add_parser("run", help="Run a bounded number of pending native trials")
    live.add_argument("--manifest", type=Path, required=True)
    live.add_argument("--max-trials", type=int, required=True)
    report = sub.add_parser("summarize", help="Print provisional quality, errors, latency and native token metrics")
    report.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "prepare":
        prepare(args)
    elif args.command == "run":
        run(args)
    else:
        summarize(args)


if __name__ == "__main__":
    main()
