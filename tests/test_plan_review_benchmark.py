import importlib.util
import contextlib
import io
import json
import os
import shutil
import subprocess
from pathlib import Path
import tempfile
import sys
import time
from types import SimpleNamespace
import unittest


ROOT = Path(__file__).resolve().parents[1] / "tools/benchmarks/plan_review"
SPEC = importlib.util.spec_from_file_location("benchmark", ROOT / "benchmark.py")
BENCH = None
if SPEC and SPEC.origin and Path(SPEC.origin).exists():
    BENCH = importlib.util.module_from_spec(SPEC)
    SPEC.loader.exec_module(BENCH)


def answer():
    return {
        "verdict": "concerns", "summary": "Acceptance depends on both producers.",
        "findings": [{
            "classification": "functional", "severity": "blocking",
            "requirement_ids": ["R-recovery"], "affected_task_ids": ["T2", "T3", "T4"],
            "locations": [{"artifact": "current_plan", "locator": "T2"}],
            "evidence": "T2 executes before the HTTP and worker producers T3/T4.",
            "impact": "The required crash-recovery scenario cannot execute.",
            "corrective_action": "Run T2 after T3 and T4.", "origin": "not_applicable",
        }],
        "corrected_task_order": ["T1", "T3", "T4", "T2"],
        "parallel_design_tasks": ["T1"],
        "validation": {"command": "pytest tests/acceptance -q", "selected_test_ids": ["http", "recovery"], "covered_scenario_ids": ["S-http", "S-recovery"]},
        "guarantee_checks": [],
    }



def make_repository(repo):
    """Two tiny committed sources; no installed checkout or historical study."""
    repo.mkdir(parents=True)
    def git(*args):
        return subprocess.run(["git", "-C", str(repo), *args], capture_output=True,
                              text=True, check=True, timeout=10).stdout.strip()
    git("init", "-q")
    (repo / ".gitignore").write_text("/ignored-output/\n", encoding="utf-8")
    for version in ["baseline", "candidate"]:
        for name in ("agents/plan-reviewer.md", "skills/plan-review/SKILL.md",
                     "skills/spec/references/development-phases.md"):
            path = repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("---\nmodel: fixture-hidden\n---\n" + version + " guidance\n",
                            encoding="utf-8")
        git("add", ".")
        git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
            "-c", "commit.gpgsign=false", "commit", "-qm", version)
    return repo


def make_runtime_manifest(out, scripts, workers=1):
    """Legitimate native argv and receipts using an explicitly selected fake client."""
    case = BENCH.load_cases(ROOT / "cases.json")["producer_order"]
    cases = {"producer_order": case}
    BENCH.atomic_json(out / "cases.json", cases)
    BENCH.atomic_json(out / "answer.schema.json", BENCH.answer_schema())
    binary = out / "fake-client"
    binary.write_text(f"#!{sys.executable}\nfrom pathlib import Path\n"
                      + f"scripts = {scripts!r}\nexec(scripts[Path.cwd().parent.name])\n", encoding="utf-8")
    binary.chmod(0o755)
    config = {"binary": str(binary), "model": "fixture-model", "effort": "high"}
    trials = []
    for index, tid in enumerate(scripts):
        directory = out / "trials" / tid
        (directory / "cwd").mkdir(parents=True)
        (directory / "prompt.txt").write_text("Review only", encoding="utf-8")
        trials.append({"trial_id": tid, "pair_id": index // 2 + 1, "runtime": "codex",
                       "case_id": "producer_order", "flow": "spec", "variant": "AB"[index % 2],
                       "prompt_sha256": __import__("hashlib").sha256(b"Review only").hexdigest(),
                       "config": dict(config),
                       "command": BENCH.native_command("codex", **config, cwd=directory / "cwd",
                                                       schema=out / "answer.schema.json",
                                                       answer=directory / "native-answer.json")})
    manifest = {"benchmark_version": 2, "scope": "unit_test_only", "fixture_sha256": BENCH.digest(cases),
                "runtime_configs": {"codex": config}, "timeout_seconds": 2, "workers": workers,
                "runner_sha256": BENCH.runner_sha256(), "protocol_sha256": BENCH.protocol_sha256(workers),
                "trials": trials}
    BENCH.atomic_json(out / "manifest.json", manifest)
    return manifest


class BenchmarkTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(BENCH, "Benchmark behavior is not implemented yet")

    def test_seeded_order_is_balanced_within_each_runtime_and_flow(self):
        # Catches fixed AB order or balance achieved only by mixing runtimes.
        pairs = BENCH.balanced_pairs(["a", "b", "c", "d"], ["codex", "claude"], ["spec", "pipeline"], 2, 691)
        self.assertEqual(pairs, BENCH.balanced_pairs(["a", "b", "c", "d"], ["codex", "claude"], ["spec", "pipeline"], 2, 691))
        self.assertNotEqual(pairs, BENCH.balanced_pairs(["a", "b", "c", "d"], ["codex", "claude"], ["spec", "pipeline"], 2, 692))
        for runtime in ["codex", "claude"]:
            for flow in ["spec", "pipeline"]:
                orders = [p["order"] for p in pairs if p["runtime"] == runtime and p["flow"] == flow]
                self.assertEqual(orders.count(["A", "B"]), 4)
                self.assertEqual(orders.count(["B", "A"]), 4)

    def test_codex_parser_keeps_cached_tokens_inside_input_total_and_missing_reasoning_null(self):
        events = [
            {"type": "thread.started", "thread_id": "example"},
            {"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(answer())}},
            {"type": "turn.completed", "usage": {"input_tokens": 120, "cached_input_tokens": 80, "output_tokens": 15}},
        ]
        parsed = BENCH.parse_codex("\n".join(json.dumps(e) for e in events))
        self.assertEqual(parsed["answer"], answer())
        self.assertEqual(parsed["usage"]["input_tokens_total"], 120)
        self.assertEqual(parsed["usage"]["total_tokens"], 135)
        self.assertIsNone(parsed["usage"]["reasoning_output_tokens"])
        self.assertIsNone(parsed["model_request_count"])

    def test_claude_parser_adds_disjoint_native_cache_categories_once(self):
        output = {"type": "result", "subtype": "success", "is_error": False, "num_turns": 1,
                  "structured_output": answer(), "usage": {"input_tokens": 20, "cache_read_input_tokens": 50, "cache_creation_input_tokens": 30, "output_tokens": 10}}
        parsed = BENCH.parse_claude(json.dumps(output))
        self.assertEqual(parsed["usage"]["input_tokens_total"], 100)
        self.assertEqual(parsed["usage"]["total_tokens"], 110)
        self.assertIsNone(parsed["usage"]["reasoning_output_tokens"])
        del output["usage"]["cache_creation_input_tokens"]
        self.assertIsNone(BENCH.parse_claude(json.dumps(output))["usage"]["input_tokens_total"])

    def test_malformed_json_and_tool_calls_invalidate_the_trial(self):
        with self.assertRaises(ValueError):
            BENCH.parse_codex('{"type":"thread.started"}\nnot-json')
        raw = json.dumps({"type": "item.completed", "item": {"type": "command_execution", "command": "id"}})
        with self.assertRaisesRegex(ValueError, "tool"):
            BENCH.parse_codex(raw)
        with self.assertRaises(ValueError):
            BENCH.parse_claude(json.dumps({"is_error": True, "result": "failure"}))

    def test_scorer_rejects_missing_prerequisite_and_editorial_false_positive(self):
        case = BENCH.load_cases(ROOT / "cases.json")["producer_order"]
        good = BENCH.score_answer(case, answer())
        self.assertEqual(good["missed_material_defects"], 0)
        self.assertEqual(good["false_positives"], 0)
        self.assertTrue(good["task_order_preserved"])
        bad = answer()
        bad["corrected_task_order"] = ["T1", "T3", "T2", "T4"]
        bad["findings"].append({**bad["findings"][0], "classification": "editorial", "requirement_ids": [], "severity": "blocking"})
        score = BENCH.score_answer(case, bad)
        self.assertFalse(score["task_order_preserved"])
        self.assertEqual(score["false_positives"], 1)

    def test_command_coverage_accepts_equivalent_directory_command_and_rejects_http_only(self):
        case = BENCH.load_cases(ROOT / "cases.json")["command_coverage"]
        self.assertEqual(BENCH.command_scenarios("python -m pytest tests/acceptance -q", case["input"]["test_inventory"]), {"S-http", "S-recovery", "S-migration"})
        self.assertEqual(BENCH.command_scenarios("pytest tests/acceptance/test_http.py", case["input"]["test_inventory"]), {"S-http"})
        self.assertIsNone(BENCH.command_scenarios("custom-runner --all", case["input"]["test_inventory"]))

    def test_exact_invariants_fail_on_count_sum_or_lost_nulls_but_accept_equivalent_multiset(self):
        case = BENCH.load_cases(ROOT / "cases.json")["migration_repair"]
        good = answer()
        good["guarantee_checks"] = [{"requirement_id": "R-migration", "kind": "multiset_equality", "compared_fields": ["entry_id", "tenant_id", "currency", "amount", "posted_at", "memo"], "multiplicity_preserved": True, "nulls_preserved": True, "description": "Use EXCEPT ALL in both directions within every tenant/currency partition."}]
        self.assertTrue(BENCH.score_answer(case, good)["guarantees_preserved"])
        good["guarantee_checks"][0]["kind"] = "aggregate_equality"
        self.assertFalse(BENCH.score_answer(case, good)["guarantees_preserved"])
        good["guarantee_checks"][0]["kind"] = "multiset_equality"
        good["guarantee_checks"][0]["nulls_preserved"] = False
        self.assertFalse(BENCH.score_answer(case, good)["guarantees_preserved"])

    def test_missing_history_requires_unknown_origin_without_suppressing_current_defect(self):
        case = BENCH.load_cases(ROOT / "cases.json")["missing_history"]
        review = answer()
        review["findings"][0].update(requirement_ids=["R-migration"], affected_task_ids=["M2"], origin="regression")
        review["findings"][0]["locations"][0]["locator"] = "M2"
        scored = BENCH.score_answer(case, review)
        self.assertEqual(scored["missed_material_defects"], 0)
        self.assertFalse(scored["origin_supported"])
        review["findings"][0]["origin"] = "unknown"
        self.assertTrue(BENCH.score_answer(case, review)["origin_supported"])

    def test_prompt_excludes_oracle_snapshot_labels_and_credentials(self):
        case = BENCH.load_cases(ROOT / "cases.json")["producer_order"]
        prompt = BENCH.build_prompt({"files": {"agents/plan-reviewer.md": "Read-only guidance."}, "commit": "SECRET-BASELINE-LABEL"}, case, "pipeline")
        self.assertNotIn("oracle", prompt)
        self.assertNotIn("SECRET-BASELINE-LABEL", prompt)
        self.assertIn("R-recovery", prompt)
        self.assertIn("pipeline", prompt)
        self.assertNotIn("corrected_task_order", json.dumps(case["input"]))

    def test_commands_use_isolated_cwd_and_config_ignores_global_sources(self):
        cmd = BENCH.native_command("codex", "/native/codex", "gpt-6.1-sol", "high", Path("/tmp/cwd"), Path("/tmp/schema.json"), Path("/tmp/answer.json"))
        self.assertIn("--ignore-user-config", cmd)
        self.assertIn("--ignore-rules", cmd)
        self.assertIn("--ephemeral", cmd)
        self.assertIn("read-only", cmd)
        self.assertIn("skills.include_instructions=false", cmd)
        self.assertIn("features.skip_host_skill_discovery=true", cmd)
        self.assertIn("project_doc_max_bytes=0", cmd)
        self.assertEqual(cmd[cmd.index("--cd") + 1], "/tmp/cwd")
        claude = BENCH.native_command("claude", "/native/claude", "claude-sonnet-4-6", "medium", Path("/tmp/cwd"), Path("/tmp/schema.json"), Path("/tmp/answer.json"))
        self.assertEqual(claude[claude.index("--tools") + 1], "")
        self.assertIn("--safe-mode", claude)
        self.assertIn("--strict-mcp-config", claude)

    def test_resume_skips_completed_and_ambiguous_started_calls_without_rebilling(self):
        with tempfile.TemporaryDirectory(prefix="th-plan-review-") as tmp:
            trial = Path(tmp)
            self.assertEqual(BENCH.trial_state(trial), "pending")
            (trial / "started.json").write_text('{}')
            self.assertEqual(BENCH.trial_state(trial), "interrupted")
            BENCH.atomic_json(trial / "result.json", {"status": "error"})
            self.assertEqual(BENCH.trial_state(trial), "complete")
            BENCH.atomic_json(trial / "result.json", {"status": "error"})
            with self.assertRaisesRegex(ValueError, "overwrite"):
                BENCH.atomic_json(trial / "result.json", {"status": "ok"})

    def test_redaction_removes_bearer_api_key_and_jwt_from_persisted_messages(self):
        message = "Authorization: Bearer secret-token and sk-test_12345678901234567890 and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature"
        cleaned = BENCH.redact(message)
        self.assertNotIn("secret-token", cleaned)
        self.assertNotIn("sk-test_", cleaned)
        self.assertNotIn("eyJhbGci", cleaned)

    def test_native_nested_usage_fields_survive_and_invalid_trial_retains_available_usage(self):
        # Catches loss of billed usage merely because a tool event invalidates quality scoring.
        self.assertTrue(callable(getattr(BENCH, "native_metadata", None)), "Native usage must survive invalid review output")
        events = [{"type": "item.completed", "item": {"type": "web_search", "query": "unused"}},
                  {"type": "turn.completed", "usage": {"input_tokens": 12, "output_tokens": 7, "input_tokens_details": {"cached_tokens": 8}, "output_tokens_details": {"reasoning_tokens": 4}}}]
        metadata = BENCH.native_metadata("codex", "\n".join(json.dumps(e) for e in events))
        self.assertEqual(metadata["usage"]["cached_input_tokens"], 8)
        self.assertEqual(metadata["usage"]["reasoning_output_tokens"], 4)
        self.assertEqual(metadata["usage"]["total_tokens"], 19)
        self.assertEqual(metadata["tool_events"], 1)

    def test_bounded_process_terminates_a_stalled_native_child(self):
        # Catches a timeout recorded without actually stopping the running process.
        with tempfile.TemporaryDirectory(prefix="th-plan-review-") as tmp:
            start = time.monotonic()
            result = BENCH.bounded_process([sys.executable, "-c", "import time; time.sleep(20)"], "", tmp, 0.05)
            self.assertTrue(result["timed_out"])
            self.assertNotEqual(result["returncode"], 0)
            self.assertLess(time.monotonic() - start, 4)

    def test_real_subprocess_runner_resume_does_not_repeat_completed_or_ambiguous_calls(self):
        # Synthetic native envelopes verify runner mechanics only, never model-review efficacy.
        with tempfile.TemporaryDirectory(prefix="th-plan-review-") as tmp:
            out = Path(tmp)
            scripts = {}
            for trial_id in ["finished", "ambiguous"]:
                counter = out / "counter.txt"
                events = [{"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(answer())}}, {"type": "turn.completed", "usage": {"input_tokens": 1, "cached_input_tokens": 0, "output_tokens": 1}}]
                script = "from pathlib import Path; import json; p=Path(" + repr(str(counter)) + "); p.write_text(str(int(p.read_text())+1) if p.exists() else '1'); print(" + repr("\n".join(json.dumps(e) for e in events)) + ")"
                scripts[trial_id] = script
            manifest = make_runtime_manifest(out, scripts)
            trial = manifest["trials"][1]
            BENCH.atomic_json(out / "trials" / "ambiguous" / "started.json",
                              {"trial_id": "ambiguous", "started_at_unix": 100,
                               "manifest_sha256": BENCH.digest(manifest), "command": trial["command"],
                               "run_identity": {key: manifest[key] for key in ("workers", "runner_sha256", "protocol_sha256")}})
            args = SimpleNamespace(manifest=out / "manifest.json", max_trials=2)
            with contextlib.redirect_stdout(io.StringIO()):
                BENCH.run(args)
                BENCH.run(args)
            self.assertEqual(counter.read_text(), "1")
            self.assertEqual(json.loads((out / "trials" / "finished" / "result.json").read_text())["status"], "ok")

    def test_summary_includes_usage_from_invalid_reviews_without_assigning_quality_success(self):
        # Catches token undercounting when a billed review fails parsing or uses tools.
        with tempfile.TemporaryDirectory(prefix="th-plan-review-") as tmp:
            out = Path(tmp)
            manifest = make_runtime_manifest(out, {"invalid": "pass"})
            identity = {key: manifest[key] for key in ("workers", "runner_sha256", "protocol_sha256")}
            BENCH.atomic_json(out / "trials/invalid/started.json",
                              {"trial_id": "invalid", "started_at_unix": 100, "manifest_sha256": BENCH.digest(manifest),
                               "run_identity": identity, "command": manifest["trials"][0]["command"]})
            BENCH.atomic_json(out / "trials/invalid/result.json",
                              {"trial_id": "invalid", "status": "error", "wall_seconds": 1.5,
                               "manifest_sha256": BENCH.digest(manifest), "run_identity": identity,
                               "usage": BENCH.token_usage({"input_tokens": 100, "cached_input_tokens": 80, "output_tokens": 10}, "codex")})
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                BENCH.summarize(SimpleNamespace(manifest=out / "manifest.json"))
            group = json.loads(output.getvalue())["groups"]["codex/spec/A"]
            self.assertEqual(group["valid_reviews"], 0)
            self.assertEqual(group["errors"], 1)
            self.assertEqual(group["tokens"]["total_tokens"]["sum_reported"], 110)

    def test_nonfatal_native_error_items_preserve_a_successful_review_without_tool_flags(self):
        # ErrorItem is a non-fatal native notification, not a command or MCP action.
        events = [{"type": "item.completed", "item": {"type": "error", "message": "Optional capability failed to initialize."}},
                  {"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(answer())}},
                  {"type": "turn.completed", "usage": {"input_tokens": 10, "output_tokens": 5}}]
        raw = "\n".join(json.dumps(e) for e in events)
        try:
            parsed = BENCH.parse_codex(raw)
        except ValueError as error:
            self.fail("Non-fatal native notifications must not invalidate a completed review: " + str(error))
        self.assertEqual(parsed["answer"], answer())
        self.assertEqual(BENCH.native_metadata("codex", raw)["tool_events"], 0)
        self.assertEqual(parsed["native_diagnostics"][0]["severity"], "warning")
        self.assertIn("Optional capability", parsed["native_diagnostics"][0]["message"])

    def test_fatal_error_cause_is_retained_redacted_and_distinguished_from_tools(self):
        # Catches discarded authentication/transport causes and accidental tool-output capture.
        event = {"type": "turn.failed", "error": {"message": 'HTTP 401: authorization="Bearer fake-native-secret" api_key="opaque-fake-key"', "stdout": "PRIVATE TOOL OUTPUT"}}
        raw = json.dumps(event)
        metadata = BENCH.native_metadata("codex", raw)
        self.assertIn("native_diagnostics", metadata)
        self.assertEqual(metadata["tool_events"], 0)
        diagnostic = metadata["native_diagnostics"][0]
        self.assertEqual(diagnostic["source"], "turn.failed")
        self.assertEqual(diagnostic["severity"], "error")
        self.assertIn("HTTP 401", diagnostic["message"])
        persisted = json.dumps(metadata)
        for secret in ["fake-native-secret", "opaque-fake-key", "PRIVATE TOOL OUTPUT"]:
            self.assertNotIn(secret, persisted)
        with self.assertRaisesRegex(ValueError, "Native error.*HTTP 401"):
            BENCH.parse_codex(raw)

    def test_stderr_diagnostics_are_bounded_and_omit_arbitrary_output(self):
        self.assertTrue(callable(getattr(BENCH, "stderr_diagnostics", None)), "Bounded native diagnostics are required")
        stderr = 'raw tool output must not persist\nERROR transport: API_KEY="opaque-fake-secret" ' + "x" * 2000
        stderr += "\n" + "\n".join("warning: capability unavailable " + str(i) for i in range(15))
        diagnostics = BENCH.stderr_diagnostics(stderr)
        self.assertLessEqual(len(diagnostics), 8)
        self.assertLessEqual(len(diagnostics[0]["message"]), 1000)
        self.assertIn("transport", diagnostics[0]["message"])
        persisted = json.dumps(diagnostics)
        self.assertNotIn("opaque-fake-secret", persisted)
        self.assertNotIn("raw tool output", persisted)

    def test_runner_persists_and_emits_redacted_cause_without_repeating_failed_call(self):
        with tempfile.TemporaryDirectory(prefix="th-plan-review-") as tmp:
            out = Path(tmp)
            directory = out / "trials" / "failure"
            event = {"type": "error", "message": "HTTP 503 upstream unavailable; access_token=fake-secret"}
            script = "import json,sys; print(" + repr(json.dumps(event)) + "); sys.exit(1)"
            manifest = make_runtime_manifest(out, {"failure": script})
            output = io.StringIO()
            args = SimpleNamespace(manifest=out / "manifest.json", max_trials=1)
            with contextlib.redirect_stdout(output):
                BENCH.run(args)
            result_path = directory / "result.json"
            result_before = result_path.read_bytes()
            result = json.loads(result_before)
            self.assertIn("native_diagnostics", result)
            self.assertIn("HTTP 503", result["native_diagnostics"][0]["message"])
            self.assertIn("HTTP 503", output.getvalue())
            self.assertNotIn("fake-secret", result_before.decode() + output.getvalue())
            with contextlib.redirect_stdout(io.StringIO()):
                BENCH.run(args)
            self.assertEqual(result_path.read_bytes(), result_before)
            self.assertEqual(json.loads((out / "manifest.json").read_text()), manifest)

    def test_two_workers_cap_launches_keep_each_pair_sequential_and_resume_immutably(self):
        # Real disposable subprocesses expose overlap/order/independent writes without model calls.
        with tempfile.TemporaryDirectory(prefix="th-plan-review-") as tmp:
            out = Path(tmp)
            scripts = {}
            events = [{"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(answer())}}, {"type": "turn.completed", "usage": {"input_tokens": 1, "cached_input_tokens": 0, "output_tokens": 1}}]
            for i in range(6):
                trial_id = "trial" + str(i + 1)
                marks = out / (trial_id + ".json")
                script = "import json,time; from pathlib import Path; start=time.time(); time.sleep(0.3); Path(" + repr(str(marks)) + ").write_text(json.dumps({'start':start,'end':time.time()})); print(" + repr("\n".join(json.dumps(e) for e in events)) + ")"
                scripts[trial_id] = script
            manifest = make_runtime_manifest(out, scripts, workers=2)
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                BENCH.run(SimpleNamespace(manifest=out / "manifest.json", max_trials=5))
            stamps = {i: json.loads((out / ("trial" + str(i) + ".json")).read_text()) for i in range(1, 6)}
            self.assertFalse((out / "trial6.json").exists())
            self.assertLess(stamps[1]["start"], stamps[3]["end"])
            self.assertLess(stamps[3]["start"], stamps[1]["end"], "Different pairs should overlap with workers=2")
            self.assertLessEqual(stamps[1]["end"], stamps[2]["start"])
            self.assertLessEqual(stamps[3]["end"], stamps[4]["start"])
            points = sorted((s[k], change) for s in stamps.values() for k, change in [("start", 1), ("end", -1)])
            active = maximum = 0
            for _, change in points:
                active += change
                maximum = max(maximum, active)
            self.assertEqual(maximum, 2)
            results = [json.loads((out / "trials" / ("trial" + str(i)) / "result.json").read_text()) for i in range(1, 6)]
            self.assertEqual([r["trial_id"] for r in results], ["trial1", "trial2", "trial3", "trial4", "trial5"])
            self.assertTrue(all(r["status"] == "ok" for r in results))
            progress = [json.loads(line) for line in output.getvalue().splitlines()]
            progress = [row for row in progress if row.get("status")]
            self.assertEqual(len(progress), 5)
            self.assertTrue(all(row.get("total_tokens") == 2 for row in progress))
            before = {p: p.read_bytes() for p in (out / "trials").glob("*/result.json")}
            BENCH.atomic_json(out / "trials" / "trial6" / "started.json",
                              {"trial_id": "trial6", "started_at_unix": 100,
                               "manifest_sha256": BENCH.digest(manifest), "command": manifest["trials"][5]["command"],
                               "run_identity": {key: manifest[key] for key in ("workers", "runner_sha256", "protocol_sha256")}})
            with contextlib.redirect_stdout(io.StringIO()):
                BENCH.run(SimpleNamespace(manifest=out / "manifest.json", max_trials=6))
            self.assertEqual({p: p.read_bytes() for p in before}, before)
            self.assertFalse((out / "trial6.json").exists())
            self.assertEqual(json.loads((out / "manifest.json").read_text()), manifest)

    def test_preparation_pins_workers_runner_and_protocol_identity(self):
        # A changed execution protocol must be visible and must stop reuse before a launch.
        with tempfile.TemporaryDirectory(prefix="th-plan-review-") as tmp:
            args = SimpleNamespace(out=Path(tmp), cases_file=ROOT / "cases.json", cases="producer_order", runtimes="codex", flows="spec", repetitions=1, seed=691, timeout=2,
                                   repo=make_repository(Path(tmp) / "repo"), baseline_ref="HEAD~1", candidate_ref="HEAD",
                                   codex_binary=sys.executable, codex_model="gpt-6.1-sol", codex_effort="max", claude_binary="unused", claude_model=None, claude_effort=None, workers=2)
            with contextlib.redirect_stdout(io.StringIO()):
                BENCH.prepare(args)
            manifest = json.loads((args.out / "manifest.json").read_text())
            self.assertEqual(manifest.get("workers"), 2)
            self.assertEqual(manifest.get("runner_sha256"), __import__("hashlib").sha256((ROOT / "benchmark.py").read_bytes()).hexdigest())
            self.assertEqual(len(manifest.get("protocol_sha256", "")), 64)
            manifest["runner_sha256"] = "0" * 64
            other = args.out / "changed-runner.json"
            BENCH.atomic_json(other, manifest)
            with self.assertRaisesRegex(ValueError, "runner identity"):
                BENCH.run(SimpleNamespace(manifest=other, max_trials=1))
            self.assertEqual(list((args.out / "trials").glob("*/started.json")), [])

    def test_portable_cli_prepares_without_launching_and_only_run_calls_fake_clients(self):
        # Catches personal binary defaults or preparation/reporting that contacts a model.
        with tempfile.TemporaryDirectory(prefix="th-plan-review-cli-") as tmp:
            base = Path(tmp)
            repo = make_repository(base / "repo")
            output, binaries, calls = base / "study", base / "bin", base / "calls.jsonl"
            binaries.mkdir()
            fake = f'''#!{sys.executable}
import json, sys
from pathlib import Path
runtime = Path(sys.argv[0]).name
args = sys.argv[1:]
assert args[args.index("--model") + 1] == "fixture-model"
if runtime == "codex":
    assert "model_reasoning_effort=\\\"high\\\"" in args
    assert "--ephemeral" in args and "--ignore-user-config" in args
else:
    assert args[args.index("--effort") + 1] == "high"
    assert args[args.index("--tools") + 1] == ""
prompt = sys.stdin.read()
assert "fixture-hidden" not in prompt and "oracle" not in prompt
assert not list(Path.cwd().iterdir())
with Path({str(calls)!r}).open("a") as stream:
    stream.write(json.dumps({{"runtime": runtime, "cwd": str(Path.cwd())}}) + "\\n")
answer = {answer()!r}
if runtime == "codex":
    Path(args[args.index("--output-last-message") + 1]).write_text(json.dumps(answer))
    print(json.dumps({{"type": "item.completed", "item": {{"type": "agent_message", "text": json.dumps(answer)}}}}))
    print(json.dumps({{"type": "turn.completed", "usage": {{"input_tokens": 120, "cached_input_tokens": 80, "output_tokens": 15}}}}))
else:
    print(json.dumps({{"type": "result", "subtype": "success", "is_error": False, "num_turns": 1, "structured_output": answer,
                       "usage": {{"input_tokens": 20, "cache_read_input_tokens": 50, "cache_creation_input_tokens": 30, "output_tokens": 10}}}}))
'''
            for runtime in ("codex", "claude"):
                path = binaries / runtime
                path.write_text(fake, encoding="utf-8")
                path.chmod(0o755)
            environment = {**os.environ, "PATH": str(binaries) + os.pathsep + os.environ.get("PATH", "")}
            def cli(*args):
                return subprocess.run([sys.executable, "-B", str(ROOT / "benchmark.py"), *map(str, args)],
                                      env=environment, cwd=base, capture_output=True, text=True, timeout=15)
            prepared = cli("prepare", "--repo", repo, "--baseline-ref", "HEAD~1", "--candidate-ref", "HEAD",
                           "--out", output, "--cases", "producer_order", "--runtimes", "codex,claude",
                           "--flows", "spec", "--repetitions", "2", "--codex-model", "fixture-model",
                           "--codex-effort", "high", "--claude-model", "fixture-model", "--claude-effort", "high")
            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            self.assertFalse(calls.exists())
            manifest = json.loads((output / "manifest.json").read_text())
            self.assertEqual(manifest["runtime_configs"]["codex"]["binary"], "codex")
            self.assertEqual(manifest["runtime_configs"]["claude"]["binary"], "claude")
            snapshots = json.loads((output / "snapshots.json").read_text())
            self.assertNotEqual(snapshots["A"]["commit"], snapshots["B"]["commit"])
            self.assertIn("baseline", snapshots["A"]["files"]["agents/plan-reviewer.md"])
            (repo / "agents/plan-reviewer.md").write_text("uncommitted change")
            summary = cli("summarize", "--manifest", output / "manifest.json")
            self.assertEqual(summary.returncode, 0, summary.stderr)
            self.assertFalse(calls.exists())
            self.assertEqual(json.loads(summary.stdout)["pending"], 8)
            missing_bound = cli("run", "--manifest", output / "manifest.json")
            self.assertNotEqual(missing_bound.returncode, 0)
            self.assertFalse(calls.exists())
            for bound, expected in [(3, 3), (10, 8), (10, 8)]:
                executed = cli("run", "--manifest", output / "manifest.json", "--max-trials", bound)
                self.assertEqual(executed.returncode, 0, executed.stderr)
                self.assertEqual(len(calls.read_text().splitlines()), expected)
            results = [json.loads(path.read_text()) for path in (output / "trials").glob("*/result.json")]
            self.assertEqual(len(results), 8)
            self.assertTrue(all(result["status"] == "ok" for result in results), results)
            self.assertEqual({result["usage"]["total_tokens"] for result in results}, {110, 135})
            self.assertTrue(all(result.get("manifest_sha256") == BENCH.digest(manifest) for result in results))
            self.assertEqual(json.loads((output / "manifest.json").read_text()), manifest)

    def test_claude_only_cli_requires_its_selected_model_and_effort(self):
        with tempfile.TemporaryDirectory(prefix="th-plan-review-claude-") as tmp:
            base = Path(tmp)
            repo = make_repository(base / "repo")
            command = [sys.executable, "-B", str(ROOT / "benchmark.py"), "prepare", "--repo", str(repo),
                       "--baseline-ref", "HEAD~1", "--candidate-ref", "HEAD", "--out", str(base / "study"),
                       "--runtimes", "claude", "--claude-model", "fixture-model", "--claude-effort", "high"]
            prepared = subprocess.run(command, capture_output=True, text=True, timeout=15)
            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            manifest = json.loads((base / "study/manifest.json").read_text())
            self.assertEqual(set(manifest["runtime_configs"]), {"claude"})
            missing_effort = subprocess.run(command[:-2], capture_output=True, text=True, timeout=15)
            self.assertNotEqual(missing_effort.returncode, 0)

    def test_output_requires_external_or_git_ignored_directory_before_writing(self):
        with tempfile.TemporaryDirectory(prefix="th-plan-review-output-") as tmp:
            base = Path(tmp)
            repo = make_repository(base / "repo")
            common = dict(cases_file=ROOT / "cases.json", cases="producer_order", runtimes="codex", flows="spec",
                          repetitions=1, seed=42, timeout=2, repo=repo, baseline_ref="HEAD~1", candidate_ref="HEAD",
                          codex_binary="codex", codex_model="fixture-model", codex_effort="high",
                          claude_binary="claude", claude_model=None, claude_effort=None, workers=1)
            unignored = repo / "published-evidence"
            with self.assertRaisesRegex(ValueError, "external|ignored"):
                BENCH.prepare(SimpleNamespace(out=unignored, **common))
            self.assertFalse(unignored.exists())
            for output in [base / "external-study", repo / "ignored-output/study"]:
                with contextlib.redirect_stdout(io.StringIO()):
                    BENCH.prepare(SimpleNamespace(out=output, **common))
                self.assertTrue((output / "manifest.json").exists())

    def test_empty_git_marker_is_not_an_output_repository(self):
        with tempfile.TemporaryDirectory(prefix="th-plan-review-git-marker-") as tmp:
            base = Path(tmp)
            (base / ".git").mkdir()
            self.assertEqual(BENCH.require_output_directory(base / "study"), base / "study")

    def test_regression_command_and_config_drift_rejects_full_selection_before_launch(self):
        for mutation in ("command", "config", "runtime"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory(prefix="th-command-integrity-") as tmp:
                out = Path(tmp)
                marker = out / "native-launched"
                script = f"Path({str(marker)!r}).write_text('launched')"
                manifest = make_runtime_manifest(out, {"first": script, "second": script, "third": script}, workers=2)
                changed = manifest["trials"][2]
                if mutation == "command":
                    changed["command"] = [sys.executable, "-c", script]
                elif mutation == "config":
                    changed["config"]["model"] = "another-model"
                else:
                    changed["runtime"] = "claude"
                (out / "manifest.json").write_text(json.dumps(manifest))
                with self.assertRaisesRegex(ValueError, "command|config|runtime"):
                    with contextlib.redirect_stdout(io.StringIO()):
                        BENCH.run(SimpleNamespace(manifest=out / "manifest.json", max_trials=3))
                self.assertFalse(marker.exists())
                self.assertEqual(list((out / "trials").glob("*/started.json")), [])

    def test_regression_schema_content_or_bytes_rejects_selection_before_launch(self):
        for mutation in ("content", "bytes", "missing"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory(prefix="th-schema-integrity-") as tmp:
                out = Path(tmp)
                marker = out / "native-launched"
                manifest = make_runtime_manifest(out, {"first": f"Path({str(marker)!r}).write_text('launched')"})
                schema = out / "answer.schema.json"
                if mutation == "content":
                    schema.write_text('{"type": "string"}')
                elif mutation == "bytes":
                    schema.write_bytes(schema.read_bytes() + b"\n")
                else:
                    schema.unlink()
                with self.assertRaisesRegex(ValueError, "schema"):
                    with contextlib.redirect_stdout(io.StringIO()):
                        BENCH.run(SimpleNamespace(manifest=out / "manifest.json", max_trials=1))
                self.assertFalse(marker.exists())
                self.assertEqual(list((out / "trials").glob("*/started.json")), [])

    def test_regression_direct_trial_cannot_execute_changed_stored_command(self):
        with tempfile.TemporaryDirectory(prefix="th-direct-trial-integrity-") as tmp:
            out = Path(tmp)
            marker = out / "native-launched"
            script = f"from pathlib import Path; Path({str(marker)!r}).write_text('launched')"
            manifest = make_runtime_manifest(out, {"first": script})
            trial = manifest["trials"][0]
            trial["command"] = [sys.executable, "-c", script]
            case = BENCH.load_cases(out / "cases.json")["producer_order"]
            identity = {key: manifest[key] for key in ("workers", "runner_sha256", "protocol_sha256")}
            with self.assertRaisesRegex(ValueError, "command"):
                BENCH.run_trial(out, manifest, trial, case, identity)
            self.assertFalse(marker.exists())
            self.assertFalse((out / "trials/first/started.json").exists())

    def test_regression_basic_and_multi_cookie_headers_are_redacted_in_diagnostics(self):
        messages = ["HTTP 401 Authorization: Basic opaque-basic-credential",
                    "HTTP 401 Cookie: pref=dark; session=opaque-cookie-credential",
                    'HTTP 401 {"Authorization": "Basic opaque-json-basic", "Cookie": "pref=dark; session=opaque-json-cookie"}',
                    "HTTP 401 Authorization: Token opaque-token-credential",
                    "HTTP 401 Authorization: Digest response=opaque-digest-credential",
                    "HTTP 401 Proxy-Authorization: Token opaque-proxy-credential",
                    'HTTP 401 {"Authorization": "Token opaque-json-token", "Proxy-Authorization": "Digest response=opaque-json-digest"}',
                    'HTTP 401 Authorization: Digest response="opaque-quoted-digest"',
                    'HTTP 401 Cookie: pref="dark"; session="opaque-quoted-cookie"']
        for message in messages:
            with self.subTest(message=message):
                native = BENCH.native_metadata("codex", json.dumps({"type": "error", "message": message}))
                stderr = BENCH.stderr_diagnostics("ERROR transport: " + message)
                persisted = json.dumps({"native": native, "stderr": stderr})
                for secret in ("opaque-basic-credential", "opaque-cookie-credential", "opaque-json-basic", "opaque-json-cookie", "pref=dark",
                               "opaque-token-credential", "opaque-digest-credential", "opaque-proxy-credential", "opaque-json-token", "opaque-json-digest"):
                    self.assertNotIn(secret, persisted)
                self.assertIn("HTTP 401", persisted)
                for secret in ("opaque-quoted-digest", "opaque-quoted-cookie"):
                    self.assertNotIn(secret, persisted)
                envelope = json.loads(BENCH.redact(json.dumps({"summary": message, "other": "preserved"})))
                self.assertEqual(envelope["other"], "preserved")
                for secret in ("opaque-quoted-digest", "opaque-quoted-cookie"):
                    self.assertNotIn(secret, envelope["summary"])

    def test_regression_summary_excludes_a_result_copied_from_another_study(self):
        with tempfile.TemporaryDirectory(prefix="th-summary-study-binding-") as tmp:
            base = Path(tmp)
            events = [{"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(answer())}},
                      {"type": "turn.completed", "usage": {"input_tokens": 100, "cached_input_tokens": 80, "output_tokens": 10}}]
            script = "print(" + repr("\n".join(json.dumps(event) for event in events)) + ")"
            for name in ("old", "current"):
                out = base / name
                make_runtime_manifest(out, {"first": script})
                with contextlib.redirect_stdout(io.StringIO()):
                    BENCH.run(SimpleNamespace(manifest=out / "manifest.json", max_trials=1))
            shutil.copyfile(base / "old/trials/first/result.json", base / "current/trials/first/result.json")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                BENCH.summarize(SimpleNamespace(manifest=base / "current/manifest.json"))
            summary = json.loads(output.getvalue())
            group = summary["groups"]["codex/spec/A"]
            self.assertEqual(group["valid_reviews"], 0)
            self.assertEqual(group["excluded_evidence"], 1)
            self.assertIsNone(group["tokens"]["total_tokens"]["sum_reported"])
            self.assertIn("result_manifest_sha256_mismatch", [issue["kind"] for issue in summary["integrity_issues"]])


if __name__ == "__main__":
    unittest.main()
