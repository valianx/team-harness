#!/usr/bin/env python3
"""Hermetic descriptive analysis of synthetic study receipts and adjudications."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1] / "tools/benchmarks/plan_review"
SPEC = importlib.util.spec_from_file_location("plan_review_analysis", ROOT / "analyze.py")
ANALYSIS = None
if SPEC and SPEC.origin and Path(SPEC.origin).exists():
    ANALYSIS = importlib.util.module_from_spec(SPEC)
    SPEC.loader.exec_module(ANALYSIS)

BENCH_SPEC = importlib.util.spec_from_file_location("plan_review_runner", ROOT / "benchmark.py")
BENCH = importlib.util.module_from_spec(BENCH_SPEC)
BENCH_SPEC.loader.exec_module(BENCH)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def canonical_sha(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                    separators=(",", ":")).encode()).hexdigest()


def refresh_receipts(root):
    """Bind synthetic receipts after intentional fixture manifest changes."""
    manifest = json.loads((root / "manifest.json").read_text())
    identity = {key: manifest[key] for key in ("workers", "runner_sha256", "protocol_sha256")}
    for trial in manifest["trials"]:
        directory = root / "trials" / trial["trial_id"]
        result = json.loads((directory / "result.json").read_text())
        result.update(manifest_sha256=canonical_sha(manifest), run_identity=identity)
        write_json(directory / "result.json", result)
        started = json.loads((directory / "started.json").read_text())
        started.update(trial_id=trial["trial_id"], manifest_sha256=canonical_sha(manifest),
                       run_identity=identity, command=trial["command"])
        write_json(directory / "started.json", started)


def adjudication_rows(manifest):
    return [{"trial_id": trial["trial_id"], "material_expected": 1 if trial["case_id"] == "defect" else 0,
             "material_detected": 1 if trial["case_id"] == "defect" else 0, "false_positives": 0,
             "origin_correct": True, "correction_sufficient": True, "task_order_preserved": True,
             "parallel_design_preserved": True, "coverage_sufficient": True, "guarantees_preserved": True}
            for trial in manifest["trials"]]


def write_adjudication(manifest_path, directory, rows):
    write_json(directory / "batch-fixture.json",
               {"method": "blind_semantic_review", "adjudicator": "fixture-reviewer",
                "study_manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(), "rows": rows})


def make_study(root, seed=42):
    """Hand-sized evidence; no model, auth, installed package or pilot data."""
    root.mkdir(parents=True, exist_ok=True)
    cases = {
        "defect": {"oracle": {"material_defects": [{"origin": "unknown"}], "before": [["P", "V"]],
                             "parallel_design_tasks": ["P"], "required_scenarios": ["S"],
                             "guarantees": [{"requirement_id": "R"}]}},
        "control": {"oracle": {"material_defects": [], "before": [], "parallel_design_tasks": [],
                              "required_scenarios": [], "guarantees": []}},
    }
    fixture_hash = hashlib.sha256(json.dumps(cases, sort_keys=True, ensure_ascii=False,
                                            separators=(",", ":")).encode()).hexdigest()
    trials = [{"trial_id": tid, "pair_id": pair, "variant": variant, "runtime": "codex",
               "flow": "spec", "case_id": case, "command": ["never-call-this-client"]}
              for tid, pair, variant, case in [("a1", 1, "A", "defect"), ("b1", 1, "B", "defect"),
                                              ("a2", 2, "A", "control"), ("b2", 2, "B", "control")]]
    manifest = {"benchmark_version": 2, "flows": ["spec"], "case_ids": ["defect", "control"],
                "runtime_configs": {"codex": {"binary": "never-call-this-client", "model": "fixture", "effort": "high"}},
                "workers": 1, "runner_sha256": "a" * 64, "protocol_sha256": "b" * 64,
                "fixture_sha256": fixture_hash, "seed": seed, "repetitions": 1, "trials": trials}
    for trial in trials:
        directory = root / "trials" / trial["trial_id"]
        trial["config"] = dict(manifest["runtime_configs"][trial["runtime"]])
        trial["command"] = BENCH.native_command(trial["runtime"], **trial["config"], cwd=directory / "cwd",
                                               schema=root / "answer.schema.json", answer=directory / "native-answer.json")
    manifest_path = root / "manifest.json"
    write_json(manifest_path, manifest)
    write_json(root / "cases.json", cases)
    adjudication_dir = root / "adjudication"
    adjudication_dir.mkdir()
    for index, trial in enumerate(trials):
        tid = trial["trial_id"]
        usage = {"input_tokens_total": 120, "cached_input_tokens": 80, "cache_write_input_tokens": 0,
                 "output_tokens": 30, "reasoning_output_tokens": 10, "total_tokens": 150}
        if tid == "b1":
            usage = {**usage, "input_tokens_total": 100, "total_tokens": 130}
        if tid == "a2":
            usage = None
        result = {"trial_id": tid, "status": "error" if tid == "b2" else "ok", "usage": usage,
                  "native_invocation_count": 1, "model_request_count": None,
                  "wall_seconds": [10, 15, 1, 2][index], "score": {"false_positives": 999}}
        write_json(root / "trials" / tid / "result.json", result)
        write_json(root / "trials" / tid / "started.json", {"started_at_unix": 100 + index * 10})
    refresh_receipts(root)
    return manifest_path, adjudication_dir


class AnalysisTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(ANALYSIS, "Analyzer is not promoted yet")

    def test_hand_checked_statistics_preserve_unknown_and_sample_variation(self):
        stats = ANALYSIS.summarize_values([10, 20, None])
        self.assertEqual(stats["sum"], 30)
        self.assertEqual(stats["mean"], 15)
        self.assertEqual(stats["median"], 15)
        self.assertAlmostEqual(stats["stdev"], 7.0710678118654755)
        self.assertEqual(stats["range"], 10)
        self.assertEqual(stats["missing"], 1)
        self.assertIsNone(ANALYSIS.summarize_values([None])["sum"])
        self.assertIsNone(ANALYSIS.summarize_values([10])["stdev"])

    def test_cache_and_reasoning_are_subsets_and_duplicate_usage_is_counted_once(self):
        usage = {"input_tokens_total": 120, "cached_input_tokens": 80, "cache_write_input_tokens": 0, "output_tokens": 30, "reasoning_output_tokens": 10, "total_tokens": 150}
        tokens = ANALYSIS.trial_tokens({"usage": usage, "native_turn_usage": [usage]})
        self.assertEqual(tokens["input_tokens_total"], 120)
        self.assertEqual(tokens["uncached_input_tokens"], 40)
        self.assertEqual(tokens["total_tokens"], 150)
        self.assertEqual(tokens["reasoning_output_tokens"], 10)
        self.assertEqual(ANALYSIS.trial_tokens({"status": "error", "usage": usage})["total_tokens"], 150)
        self.assertIsNone(ANALYSIS.trial_tokens({"status": "error", "usage": None})["total_tokens"])

    def test_duplicate_adjudications_are_deduplicated_and_conflicts_excluded(self):
        row = {"trial_id": "t1", "material_expected": 1, "material_detected": 1, "false_positives": 0}
        study_hash = "a" * 64
        identity = {"method": "blind_semantic_review", "adjudicator": "Main", "study_manifest_sha256": study_hash}
        packs = [("batch-a.json", {**identity, "rows": [row]}), ("batch-b.json", {**identity, "rows": [row]})]
        try:
            resolved = ANALYSIS.resolve_adjudications(packs, {"t1"}, study_hash)
        except TypeError:
            self.fail("The required study manifest binding is missing")
        self.assertEqual(len(resolved["rows"]), 1)
        self.assertEqual(resolved["issues"][0]["kind"], "duplicate_adjudication")
        packs.append(("batch-c.json", {**identity, "rows": [{**row, "material_detected": 0}]}))
        resolved = ANALYSIS.resolve_adjudications(packs, {"t1"}, study_hash)
        self.assertNotIn("t1", resolved["rows"])
        self.assertIn("material_detected", resolved["issues"][0]["conflicting_fields"])

    def test_same_trial_ids_cannot_join_missing_or_different_study_manifest(self):
        # Old/new studies reuse IDs; only a matching byte hash authorizes this join.
        current_hash, other_hash = "a" * 64, "b" * 64
        row = {"trial_id": "shared-trial", "material_expected": 1, "material_detected": 1, "false_positives": 0}
        base = {"method": "blind_semantic_review", "adjudicator": "Main", "rows": [row]}
        packages = [("missing-study.json", base), ("other-study.json", {**base, "study_manifest_sha256": other_hash}),
                    ("current-study.json", {**base, "study_manifest_sha256": current_hash})]
        try:
            resolved = ANALYSIS.resolve_adjudications(packages, {row["trial_id"]}, current_hash)
        except TypeError:
            self.fail("Adjudications from another study must be rejected even when trial IDs match")
        self.assertEqual(list(resolved["rows"]), [row["trial_id"]])
        self.assertEqual([p["source"] for p in resolved["provenance"][row["trial_id"]]], ["current-study.json"])
        self.assertEqual([issue["kind"] for issue in resolved["issues"]], ["missing_study_manifest_sha256", "study_manifest_sha256_mismatch"])
        rejected = ANALYSIS.resolve_adjudications(packages[:2], {row["trial_id"]}, current_hash)
        self.assertEqual(rejected["rows"], {})
        self.assertEqual(rejected["provenance"], {})

    def test_pair_differences_and_study_span_match_manual_calculation(self):
        records = []
        for tid, pair, variant, start, latency in [("a1", 1, "A", 100, 10), ("b1", 1, "B", 110, 15), ("a2", 2, "A", 105, 20), ("b2", 2, "B", 130, 10)]:
            records.append({"trial": {"trial_id": tid, "pair_id": pair, "variant": variant, "flow": "spec", "case_id": "example"}, "result": {"status": "ok", "wall_seconds": latency}, "started": {"started_at_unix": start}, "adjudication": None, "tokens": ANALYSIS.trial_tokens({})})
        paired = ANALYSIS.pair_summary(records)
        self.assertEqual(paired["both_complete"], 2)
        self.assertEqual(paired["latency_B_minus_A_seconds"]["mean"], -2.5)
        self.assertEqual(paired["latency_relative_percent"]["mean"], 0)
        self.assertEqual(ANALYSIS.observed_window(records)["span_seconds"], 40)

    def test_explicit_failures_null_origin_and_absent_review_are_preserved(self):
        row = {"material_expected": 1, "material_detected": 1, "false_positives": 3, "origin_correct": None, "correction_sufficient": False,
               "task_order_preserved": True, "parallel_design_preserved": False, "coverage_sufficient": False, "guarantees_preserved": False}
        records = [{"trial": {"trial_id": "reviewed"}, "result": {"status": "ok", "score": {"false_positives": 999}}, "adjudication": row, "adjudication_complete": True, "tokens": ANALYSIS.trial_tokens({}), "fixture_expected": 1, "applicability": {field: True for field in ANALYSIS.QUALITY_FIELDS}},
                   {"trial": {"trial_id": "missing"}, "result": {"status": "ok"}, "adjudication": None, "adjudication_complete": False, "tokens": ANALYSIS.trial_tokens({}), "fixture_expected": 1, "applicability": {field: True for field in ANALYSIS.QUALITY_FIELDS}}]
        group = ANALYSIS.aggregate(records)
        self.assertEqual(group["quality"]["false_positives"]["sum"], 3)
        self.assertEqual(group["quality"]["dimensions"]["origin_correct"]["null"], 1)
        self.assertEqual(group["quality"]["dimensions"]["origin_correct"]["missing"], 1)
        self.assertEqual(group["quality"]["dimensions"]["correction_sufficient"]["false"], 1)
        self.assertEqual(group["quality"]["dimensions"]["parallel_design_preserved"]["false"], 1)

    def test_applicable_denominators_use_minimal_synthetic_defect_and_control(self):
        with tempfile.TemporaryDirectory(prefix="th-plan-review-denominators-") as tmp:
            manifest_path, adjudication_dir = make_study(Path(tmp))
            manifest, records, issues, hashes, overhead = ANALYSIS.collect(manifest_path, adjudication_dir)
            group = ANALYSIS.aggregate(records)
            dimensions = group["quality"]["dimensions"]
            self.assertEqual(group["trials"]["planned"], 4)
            self.assertEqual(group["fixture_expected_material_defects_planned"], 2)
            self.assertEqual(group["controls"]["planned"], 2)
            for field in ("correction_sufficient", "parallel_design_preserved", "origin_correct", "guarantees_preserved"):
                self.assertEqual(dimensions[field]["applicable_planned"], 2)

    def test_quality_pairs_require_complete_adjudication_on_both_sides(self):
        row = {"material_expected": 1, "material_detected": 1, "false_positives": 0}
        records = [{"trial": {"trial_id": variant, "pair_id": 1, "variant": variant}, "result": {"status": "ok", "wall_seconds": 10}, "adjudication": row,
                    "adjudication_complete": False, "tokens": ANALYSIS.trial_tokens({})} for variant in ["A", "B"]]
        paired = ANALYSIS.pair_summary(records)
        self.assertEqual(paired["both_complete"], 1)
        self.assertEqual(paired["both_adjudicated"], 0)
        self.assertIsNone(paired["quality_B_minus_A"]["material_detected"]["mean"])

    def test_cli_analyzes_only_supplied_study_and_never_launches_native_commands(self):
        # Catches hidden reads of the original pilot, missing data as zero, or native launches.
        with tempfile.TemporaryDirectory(prefix="th-plan-review-analysis-") as tmp:
            base = Path(tmp)
            manifest, adjudication = make_study(base / "study")
            output = base / "metrics"
            analyzed = subprocess.run([sys.executable, "-B", str(ROOT / "analyze.py"), "--manifest", str(manifest),
                                       "--adjudication-dir", str(adjudication), "--out", str(output)],
                                      capture_output=True, text=True, timeout=10)
            self.assertEqual(analyzed.returncode, 0, analyzed.stderr)
            data = json.loads((output / "analysis.json").read_text())
            self.assertEqual(data["planned_trials"], 4)
            self.assertEqual(data["completed_trials"], 4)
            self.assertEqual(data["adjudicated_completed_trials"], 0)
            self.assertEqual(data["status"], "parcial")
            self.assertEqual(data["all"]["B"]["trials"]["errors"], 1)
            self.assertEqual(data["all"]["B"]["tokens"]["total_tokens"]["sum"], 280)
            self.assertEqual(data["all"]["A"]["tokens"]["total_tokens"]["missing"], 1)
            self.assertIsNone(data["all"]["A"]["quality"]["false_positives"]["sum"])
            self.assertEqual(data["study_manifest_sha256"], hashlib.sha256(manifest.read_bytes()).hexdigest())
            self.assertTrue((output / "report.md").exists())
            self.assertTrue(all(Path(path).is_relative_to(base) for path in data["source_file_sha256"]))
            self.assertEqual(data["diagnostic_overhead_excluded_from_AB"], [])

    def test_collect_uses_byte_manifest_hash_and_retains_semantic_failures(self):
        with tempfile.TemporaryDirectory(prefix="th-plan-review-adjudication-") as tmp:
            base = Path(tmp)
            manifest_path, adjudication = make_study(base)
            row = {"trial_id": "a1", "material_expected": 1, "material_detected": 1, "false_positives": 2,
                   "origin_correct": None, "correction_sufficient": False, "task_order_preserved": True,
                   "parallel_design_preserved": False, "coverage_sufficient": False, "guarantees_preserved": False}
            package = {"method": "blind_semantic_review", "adjudicator": "fixture-reviewer",
                       "study_manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(), "rows": [row]}
            write_json(adjudication / "batch-fixture.json", package)
            manifest, records, issues, hashes, overhead = ANALYSIS.collect(manifest_path, adjudication)
            data = ANALYSIS.build_analysis(manifest, records, issues, hashes, overhead)
            quality = data["all"]["A"]["quality"]
            self.assertEqual(quality["false_positives"]["sum"], 2)
            self.assertEqual(quality["dimensions"]["correction_sufficient"]["false"], 1)
            self.assertEqual(quality["dimensions"]["origin_correct"]["null"], 1)
            self.assertEqual(data["adjudicated_completed_trials"], 1)
            self.assertEqual(data["all"]["paired"]["both_adjudicated"], 0)
            manifest_path.write_text(manifest_path.read_text() + "\n")
            _, records, issues, _, _ = ANALYSIS.collect(manifest_path, adjudication)
            self.assertTrue(all(record["adjudication"] is None for record in records))
            self.assertIn("study_manifest_sha256_mismatch", [issue["kind"] for issue in issues])

    def test_collect_reports_changed_protocol_receipt(self):
        with tempfile.TemporaryDirectory(prefix="th-plan-review-integrity-") as tmp:
            base = Path(tmp)
            manifest_path, adjudication = make_study(base)
            manifest = json.loads(manifest_path.read_text())
            manifest.update(workers=2, runner_sha256="c" * 64, protocol_sha256="d" * 64)
            write_json(manifest_path, manifest)
            _, _, issues, _, _ = ANALYSIS.collect(manifest_path, adjudication)
            kinds = [issue["kind"] for issue in issues]
            self.assertEqual(kinds.count("result_protocol_identity_mismatch"), 12)

    def test_codex_review_cli_rejects_changed_or_corrupt_fixtures_without_reports(self):
        for mutation in ("changed_oracle", "corrupt_json"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory(prefix="th-frozen-fixture-") as tmp:
                base = Path(tmp)
                manifest_path, adjudication = make_study(base / "study")
                manifest = json.loads(manifest_path.read_text())
                write_adjudication(manifest_path, adjudication, adjudication_rows(manifest))
                fixture = manifest_path.parent / "cases.json"
                if mutation == "changed_oracle":
                    cases = json.loads(fixture.read_text())
                    cases["control"]["oracle"]["material_defects"] = [{"origin": "unknown"}]
                    cases["control"]["oracle"]["parallel_design_tasks"] = ["new-task"]
                    write_json(fixture, cases)
                else:
                    fixture.write_text("{")
                output = base / "metrics"
                analyzed = subprocess.run([sys.executable, "-B", str(ROOT / "analyze.py"),
                                           "--manifest", str(manifest_path), "--adjudication-dir", str(adjudication),
                                           "--out", str(output)], capture_output=True, text=True, timeout=10)
                self.assertNotEqual(analyzed.returncode, 0)
                self.assertIn("Fixture identity changed after preparation", analyzed.stderr)
                self.assertFalse(output.exists())

    def test_codex_review_incomplete_control_is_not_clean_until_adjudication_completes(self):
        with tempfile.TemporaryDirectory(prefix="th-control-coverage-") as tmp:
            manifest_path, adjudication = make_study(Path(tmp))
            manifest = json.loads(manifest_path.read_text())
            row = next(row for row in adjudication_rows(manifest) if row["trial_id"] == "a2")
            incomplete = dict(row)
            del incomplete["origin_correct"]
            write_adjudication(manifest_path, adjudication, [incomplete])
            manifest, records, issues, hashes, overhead = ANALYSIS.collect(manifest_path, adjudication)
            data = ANALYSIS.build_analysis(manifest, records, issues, hashes, overhead)
            controls = data["all"]["A"]["controls"]
            self.assertEqual(controls["valid"], 1)
            self.assertEqual(controls["false_positives"]["sum"], 0)
            self.assertEqual(controls["adjudicated"], 0)
            self.assertEqual(controls["clean_adjudicated_controls"], 0)
            self.assertIn("incomplete_adjudication", [issue["kind"] for issue in issues])
            write_adjudication(manifest_path, adjudication, [row])
            manifest, records, issues, hashes, overhead = ANALYSIS.collect(manifest_path, adjudication)
            data = ANALYSIS.build_analysis(manifest, records, issues, hashes, overhead)
            self.assertEqual(data["all"]["A"]["controls"]["adjudicated"], 1)
            self.assertEqual(data["all"]["A"]["controls"]["clean_adjudicated_controls"], 1)
            self.assertEqual(data["all"]["B"]["controls"]["clean_adjudicated_controls"], 0)

    def test_analysis_output_rejects_unignored_repository_location_without_writes(self):
        with tempfile.TemporaryDirectory(prefix="th-plan-review-report-output-") as tmp:
            base = Path(tmp)
            manifest, adjudication = make_study(base / "study")
            repo = base / "repo"
            repo.mkdir()
            subprocess.run(["git", "-C", str(repo), "init", "-q"], capture_output=True, check=True, timeout=10)
            output = repo / "unignored-results"
            analyzed = subprocess.run([sys.executable, "-B", str(ROOT / "analyze.py"), "--manifest", str(manifest),
                                       "--adjudication-dir", str(adjudication), "--out", str(output)],
                                      capture_output=True, text=True, timeout=10)
            self.assertNotEqual(analyzed.returncode, 0)
            self.assertFalse(output.exists())

    def test_empty_git_marker_is_not_a_report_repository(self):
        with tempfile.TemporaryDirectory(prefix="th-plan-review-report-marker-") as tmp:
            base = Path(tmp)
            (base / ".git").mkdir()
            self.assertEqual(ANALYSIS.require_output_directory(base / "metrics"), base / "metrics")

    def test_two_runtimes_keep_usage_failures_and_missing_data_in_separate_comparisons(self):
        with tempfile.TemporaryDirectory(prefix="th-plan-review-runtime-groups-") as tmp:
            manifest_path, adjudication = make_study(Path(tmp))
            manifest = json.loads(manifest_path.read_text())
            manifest["runtime_configs"]["claude"] = {"binary": "never-call-this-client", "model": "other-fixture", "effort": "high"}
            for trial in manifest["trials"]:
                if trial["case_id"] == "control":
                    trial["runtime"] = "claude"
            write_json(manifest_path, manifest)
            refresh_receipts(manifest_path.parent)
            manifest, records, issues, hashes, overhead = ANALYSIS.collect(manifest_path, adjudication)
            data = ANALYSIS.build_analysis(manifest, records, issues, hashes, overhead)
            self.assertEqual(set(data["by_runtime"]), {"codex", "claude"})
            codex, claude = data["by_runtime"]["codex"], data["by_runtime"]["claude"]
            self.assertEqual(codex["A"]["tokens"]["total_tokens"]["sum"], 150)
            self.assertEqual(codex["B"]["tokens"]["total_tokens"]["sum"], 130)
            self.assertEqual(codex["paired"]["tokens_B_minus_A"]["total_tokens"]["mean"], -20)
            self.assertEqual(codex["B"]["trials"]["errors"], 0)
            self.assertEqual(claude["B"]["tokens"]["total_tokens"]["sum"], 150)
            self.assertEqual(claude["B"]["trials"]["errors"], 1)
            self.assertEqual(claude["A"]["tokens"]["total_tokens"]["missing"], 1)
            self.assertIsNone(claude["A"]["tokens"]["total_tokens"]["sum"])
            self.assertIsNone(claude["paired"]["tokens_B_minus_A"]["total_tokens"]["mean"])
            self.assertIsNone(codex["A"]["quality"]["material_detected"])
            self.assertEqual({row["trial_id"]: row["runtime"] for row in data["trial_rows"]},
                             {"a1": "codex", "b1": "codex", "a2": "claude", "b2": "claude"})

    def test_regression_copied_receipts_from_another_study_do_not_supply_quality_or_resources(self):
        with tempfile.TemporaryDirectory(prefix="th-native-study-binding-") as tmp:
            base = Path(tmp)
            old_manifest, _ = make_study(base / "old", seed=42)
            manifest_path, adjudication = make_study(base / "current", seed=43)
            manifest = json.loads(manifest_path.read_text())
            write_adjudication(manifest_path, adjudication, adjudication_rows(manifest)[:1])
            for name in ("started.json", "result.json"):
                shutil.copyfile(old_manifest.parent / "trials/a1" / name, manifest_path.parent / "trials/a1" / name)
            manifest, records, issues, hashes, overhead = ANALYSIS.collect(manifest_path, adjudication)
            data = ANALYSIS.build_analysis(manifest, records, issues, hashes, overhead)
            group = data["all"]["A"]
            self.assertEqual(group["trials"]["valid"], 1)
            self.assertIsNone(group["tokens"]["total_tokens"]["sum"])
            self.assertEqual(group["latency_seconds"]["sum"], 1)
            self.assertIsNone(group["quality"]["material_detected"])
            self.assertEqual(data["adjudicated_completed_trials"], 0)
            self.assertIn("started_manifest_sha256_mismatch", [issue["kind"] for issue in issues])
            self.assertIn("result_manifest_sha256_mismatch", [issue["kind"] for issue in issues])

    def test_regression_missing_or_wrong_native_receipts_are_excluded_with_integrity_issues(self):
        mutations = {"missing_started": "missing_started_receipt", "started_study": "started_manifest_sha256_mismatch",
                     "missing_study": "missing_started_manifest_sha256", "started_trial": "started_trial_id_mismatch",
                     "result_trial": "result_trial_id_mismatch", "result_protocol": "result_protocol_identity_mismatch",
                     "started_protocol": "started_protocol_identity_mismatch", "result_study": "result_manifest_sha256_mismatch",
                     "started_command": "started_command_mismatch"}
        for mutation, expected_issue in mutations.items():
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory(prefix="th-native-receipt-integrity-") as tmp:
                manifest_path, adjudication = make_study(Path(tmp))
                directory = manifest_path.parent / "trials/a1"
                started = json.loads((directory / "started.json").read_text())
                result = json.loads((directory / "result.json").read_text())
                if mutation == "started_study":
                    started["manifest_sha256"] = "0" * 64
                elif mutation == "missing_study":
                    del started["manifest_sha256"]
                elif mutation == "started_trial":
                    started["trial_id"] = "another-trial"
                elif mutation == "result_trial":
                    result["trial_id"] = "another-trial"
                elif mutation == "result_protocol":
                    result["run_identity"]["runner_sha256"] = "0" * 64
                elif mutation == "started_protocol":
                    del started["run_identity"]
                elif mutation == "result_study":
                    result["manifest_sha256"] = "0" * 64
                elif mutation == "started_command":
                    started["command"] = ["another-command"]
                write_json(directory / "started.json", started)
                write_json(directory / "result.json", result)
                if mutation == "missing_started":
                    (directory / "started.json").unlink()
                manifest, records, issues, hashes, overhead = ANALYSIS.collect(manifest_path, adjudication)
                data = ANALYSIS.build_analysis(manifest, records, issues, hashes, overhead)
                group = data["all"]["A"]
                self.assertEqual(group["trials"]["valid"], 1)
                self.assertIsNone(group["tokens"]["total_tokens"]["sum"])
                self.assertEqual(group["latency_seconds"]["sum"], 1)
                self.assertEqual(group["trials"]["excluded_evidence"], 1)
                self.assertIn(expected_issue, [issue["kind"] for issue in issues])

    def test_regression_null_required_counts_cannot_imply_complete_adjudication(self):
        with tempfile.TemporaryDirectory(prefix="th-adjudication-count-types-") as tmp:
            manifest_path, adjudication = make_study(Path(tmp))
            manifest = json.loads(manifest_path.read_text())
            rows = adjudication_rows(manifest)
            for row in rows:
                for field in ("material_expected", "material_detected", "false_positives"):
                    row[field] = None
            write_adjudication(manifest_path, adjudication, rows)
            manifest, records, issues, hashes, overhead = ANALYSIS.collect(manifest_path, adjudication)
            data = ANALYSIS.build_analysis(manifest, records, issues, hashes, overhead)
            self.assertEqual(data["status"], "parcial")
            self.assertEqual(data["adjudicated_completed_trials"], 0)
            self.assertEqual(data["all"]["paired"]["both_adjudicated"], 0)
            self.assertEqual(set(data["missing_adjudication_trial_ids"]), {"a1", "b1", "a2", "b2"})
            for variant in ("A", "B"):
                self.assertIsNone(data["all"][variant]["quality"]["material_detected"])
                self.assertIsNone(data["all"][variant]["quality"]["false_positives"]["sum"])
            self.assertEqual(sum(issue["kind"] == "invalid_or_contradictory_adjudication" for issue in issues), 4)

    def test_legacy_results_use_valid_started_binding_and_keep_failures_pending_and_unknowns(self):
        with tempfile.TemporaryDirectory(prefix="th-legacy-native-receipts-") as tmp:
            manifest_path, adjudication = make_study(Path(tmp))
            for path in manifest_path.parent.glob("trials/*/result.json"):
                result = json.loads(path.read_text())
                del result["manifest_sha256"]
                write_json(path, result)
            manifest, records, issues, hashes, overhead = ANALYSIS.collect(manifest_path, adjudication)
            data = ANALYSIS.build_analysis(manifest, records, issues, hashes, overhead)
            self.assertEqual(issues, [])
            self.assertEqual(data["completed_trials"], 4)
            self.assertEqual(data["all"]["B"]["trials"]["errors"], 1)
            self.assertEqual(data["all"]["B"]["tokens"]["total_tokens"]["sum"], 280)
            (manifest_path.parent / "trials/a1/result.json").unlink()
            (manifest_path.parent / "trials/b1/result.json").unlink()
            (manifest_path.parent / "trials/b1/started.json").unlink()
            manifest, records, issues, hashes, overhead = ANALYSIS.collect(manifest_path, adjudication)
            data = ANALYSIS.build_analysis(manifest, records, issues, hashes, overhead)
            self.assertEqual(issues, [])
            self.assertEqual(data["all"]["A"]["trials"]["in_progress_or_interrupted"], 1)
            self.assertEqual(data["all"]["B"]["trials"]["pending"], 1)
            self.assertEqual(data["all"]["B"]["tokens"]["total_tokens"]["sum"], 150)


if __name__ == "__main__":
    unittest.main()
