#!/usr/bin/env python3
"""Descriptive analysis of frozen A/B text reviews and external adjudication."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import statistics
import subprocess


TOKEN_FIELDS = ("input_tokens_total", "cached_input_tokens", "uncached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens")
COUNT_FIELDS = ("material_expected", "material_detected", "false_positives")
QUALITY_FIELDS = ("origin_correct", "correction_sufficient", "task_order_preserved", "parallel_design_preserved", "coverage_sufficient", "guarantees_preserved")
ADJ_FIELDS = COUNT_FIELDS + QUALITY_FIELDS


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def summarize_values(values):
    known = [value for value in values if number(value)]
    return {"n": len(known), "missing": len(values) - len(known), "sum": sum(known) if known else None,
            "mean": statistics.mean(known) if known else None, "median": statistics.median(known) if known else None,
            "stdev": statistics.stdev(known) if len(known) > 1 else None,
            "min": min(known) if known else None, "max": max(known) if known else None,
            "range": max(known) - min(known) if known else None}


def trial_tokens(result):
    # native_turn_usage already contains the same receipt as usage for a normal one-turn call.
    records = result.get("native_turn_usage") or ([result["usage"]] if isinstance(result.get("usage"), dict) else [])
    tokens = {field: None for field in TOKEN_FIELDS}
    for field in TOKEN_FIELDS:
        if field == "uncached_input_tokens":
            values = [(u.get("input_tokens_total") - u.get("cached_input_tokens"))
                      if number(u.get("input_tokens_total")) and number(u.get("cached_input_tokens")) and u["cached_input_tokens"] <= u["input_tokens_total"] else None for u in records]
        else:
            values = [u.get(field) for u in records]
        if values and all(number(value) for value in values):
            tokens[field] = sum(values)
    tokens["usage_records"] = len(records)
    return tokens


def resolve_adjudications(packages, trial_ids, study_manifest_sha256):
    candidates, issues, provenance = {}, [], {}
    for source, package in packages:
        if not isinstance(package, dict) or not isinstance(package.get("rows"), list):
            issues.append({"kind": "invalid_adjudication_package", "source": source})
            continue
        if not package.get("method") or not package.get("adjudicator"):
            issues.append({"kind": "missing_adjudication_identity", "source": source})
            continue
        declared_study = package.get("study_manifest_sha256")
        if not declared_study:
            issues.append({"kind": "missing_study_manifest_sha256", "source": source})
            continue
        if declared_study != study_manifest_sha256:
            issues.append({"kind": "study_manifest_sha256_mismatch", "source": source,
                           "expected": study_manifest_sha256, "provided": declared_study})
            continue
        for row in package["rows"]:
            tid = row.get("trial_id") if isinstance(row, dict) else None
            if tid not in trial_ids:
                issues.append({"kind": "unknown_adjudication_trial", "source": source, "trial_id": tid})
                continue
            candidates.setdefault(tid, []).append((source, row))
            provenance.setdefault(tid, []).append({"source": source, "method": package["method"], "adjudicator": package["adjudicator"],
                                                   "study_manifest_sha256": study_manifest_sha256})
    resolved = {}
    for tid, entries in candidates.items():
        conflicting = [field for field in ADJ_FIELDS if len({json.dumps(row.get(field), sort_keys=True) for _, row in entries}) > 1]
        if len(entries) > 1:
            issues.append({"kind": "duplicate_adjudication", "trial_id": tid, "sources": [source for source, _ in entries], "conflicting_fields": conflicting})
        if not conflicting:
            # Merge equivalent duplicates' present fields without treating absent fields as false.
            resolved[tid] = {key: value for _, row in entries for key, value in row.items()}
    return {"rows": resolved, "issues": issues, "provenance": provenance}


def observed_window(records):
    starts, ends = [], []
    for record in records:
        start = (record.get("started") or {}).get("started_at_unix")
        elapsed = (record.get("result") or {}).get("wall_seconds")
        if number(start):
            starts.append(start)
            if number(elapsed):
                ends.append(start + elapsed)
    return {"first_start_unix": min(starts) if starts else None, "last_observed_end_unix": max(ends) if ends else None,
            "span_seconds": max(ends) - min(starts) if starts and ends else None,
            "started_timestamps": len(starts), "observed_ends": len(ends), "unfinished_started": len(starts) - len(ends)}


def difference(a, b):
    return {"absolute": b - a if number(a) and number(b) else None,
            "relative_percent": 100 * (b - a) / a if number(a) and number(b) and a != 0 else None}


def case_applicability(case):
    oracle = case.get("oracle", {})
    defects = oracle.get("material_defects", [])
    return {"origin_correct": any(d.get("origin") in {"regression", "late_discovery", "unknown"} for d in defects),
            "correction_sufficient": bool(defects), "task_order_preserved": bool(oracle.get("before")),
            "parallel_design_preserved": bool(oracle.get("parallel_design_tasks")), "coverage_sufficient": bool(oracle.get("required_scenarios")),
            "guarantees_preserved": bool(oracle.get("guarantees"))}


def pair_summary(records):
    pairs = {}
    for record in records:
        pairs.setdefault(record["trial"].get("pair_id"), {}).setdefault(record["trial"].get("variant"), []).append(record)
    rows = []
    for pair_id, variants in pairs.items():
        a = variants.get("A", [])
        b = variants.get("B", [])
        if len(a) != 1 or len(b) != 1:
            rows.append({"pair_id": pair_id, "complete": False, "valid": False, "adjudicated": False, "latency_delta": None, "latency_relative_percent": None, "tokens_delta": {}, "quality_delta": {}})
            continue
        a, b = a[0], b[0]
        complete = bool(a.get("result") and b.get("result"))
        valid = complete and a["result"].get("status") == "ok" and b["result"].get("status") == "ok"
        adj = valid and a.get("adjudication_complete", False) and b.get("adjudication_complete", False)
        latency = difference((a.get("result") or {}).get("wall_seconds"), (b.get("result") or {}).get("wall_seconds")) if complete else difference(None, None)
        quality = {}
        for field in ADJ_FIELDS:
            av = (a.get("adjudication") or {}).get(field)
            bv = (b.get("adjudication") or {}).get(field)
            if field in QUALITY_FIELDS:
                av = int(av) if isinstance(av, bool) and a.get("applicability", {}).get(field) is True else None
                bv = int(bv) if isinstance(bv, bool) and b.get("applicability", {}).get(field) is True else None
            quality[field] = difference(av, bv)["absolute"] if adj else None
        rows.append({"pair_id": pair_id, "A_trial_id": a["trial"]["trial_id"], "B_trial_id": b["trial"]["trial_id"],
                     "complete": complete, "valid": bool(valid), "adjudicated": bool(adj),
                     "latency_delta": latency["absolute"], "latency_relative_percent": latency["relative_percent"],
                     "tokens_delta": {field: difference(a["tokens"].get(field), b["tokens"].get(field))["absolute"] if complete else None for field in TOKEN_FIELDS}, "quality_delta": quality})
    return {"planned_pairs": len(pairs), "both_complete": sum(row["complete"] for row in rows),
            "both_valid": sum(row["valid"] for row in rows), "both_adjudicated": sum(row["adjudicated"] for row in rows),
            "latency_B_minus_A_seconds": summarize_values([row["latency_delta"] for row in rows]),
            "latency_relative_percent": summarize_values([row["latency_relative_percent"] for row in rows]),
            "tokens_B_minus_A": {field: summarize_values([row["tokens_delta"].get(field) for row in rows]) for field in TOKEN_FIELDS},
            "quality_B_minus_A": {field: summarize_values([row["quality_delta"].get(field) for row in rows]) for field in ADJ_FIELDS}, "rows": rows}


def bool_counts(records, field):
    values = [(r.get("adjudication") or {}).get(field) for r in records]
    present = [r.get("adjudication") is not None and field in r["adjudication"] for r in records]
    true = sum(value is True for value in values)
    false = sum(value is False for value in values)
    return {"true": true, "false": false, "null": sum(exists and value is None for exists, value in zip(present, values)),
            "missing": sum(not exists for exists in present), "pass_rate": true / (true + false) if true + false else None}


def aggregate(records):
    completed = [r for r in records if r.get("result")]
    valid = [r for r in completed if r["result"].get("status") == "ok"]
    controls = [r for r in records if r.get("fixture_expected") == 0]
    valid_controls = [r for r in controls if (r.get("result") or {}).get("status") == "ok"]
    material_rows = [r for r in valid if number((r.get("adjudication") or {}).get("material_expected")) and number((r.get("adjudication") or {}).get("material_detected"))]
    expected = sum(r["adjudication"]["material_expected"] for r in material_rows) if material_rows else None
    detected = sum(r["adjudication"]["material_detected"] for r in material_rows) if material_rows else None
    missing_adj = [r["trial"]["trial_id"] for r in completed if not r.get("adjudication_complete")]
    dimensions = {}
    for field in QUALITY_FIELDS:
        applicable = [r for r in records if r.get("applicability", {}).get(field) is True]
        applicable_valid = [r for r in applicable if (r.get("result") or {}).get("status") == "ok"]
        dimensions[field] = {**bool_counts(applicable_valid, field), "applicable_planned": len(applicable), "applicable_valid": len(applicable_valid),
                             "not_applicable_planned": sum(r.get("applicability", {}).get(field) is False for r in records),
                             "applicability_unknown_planned": sum(r.get("applicability", {}).get(field) is None for r in records)}
    return {
        "trials": {"planned": len(records), "complete": len(completed), "valid": len(valid), "errors": sum(r["result"].get("status") != "ok" for r in completed),
                   "pending": sum(not r.get("result") and not r.get("started") and not r.get("excluded_evidence") for r in records),
                   "in_progress_or_interrupted": sum(not r.get("result") and bool(r.get("started")) and not r.get("excluded_evidence") for r in records),
                   "excluded_evidence": sum(bool(r.get("excluded_evidence")) for r in records),
                   "adjudicated_complete": sum(bool(r.get("adjudication_complete")) for r in completed), "missing_adjudication_trial_ids": missing_adj},
        "native_invocations_reported": summarize_values([(r.get("result") or {}).get("native_invocation_count") for r in completed]),
        "fixture_expected_material_defects_planned": sum(r["fixture_expected"] for r in records) if records and all(number(r.get("fixture_expected")) for r in records) else None,
        "model_requests_reported": summarize_values([(r.get("result") or {}).get("model_request_count") for r in completed]),
        "quality": {"valid_reviews": len(valid), "material_count_rows": len(material_rows), "material_expected": expected, "material_detected": detected,
                    "material_missed": expected - detected if expected is not None and detected is not None else None,
                    "material_recall": detected / expected if expected else None,
                    "false_positives": summarize_values([(r.get("adjudication") or {}).get("false_positives") for r in valid]),
                    "dimensions": dimensions, "dimensions_all_valid_reviews": {field: bool_counts(valid, field) for field in QUALITY_FIELDS}},
        "controls": {"planned": len(controls), "valid": len(valid_controls), "adjudicated": sum(bool(r.get("adjudication_complete")) for r in valid_controls),
                     "clean_adjudicated_controls": sum(bool(r.get("adjudication_complete")) and r["adjudication"]["false_positives"] == 0 for r in valid_controls),
                     "controls_with_false_positives": sum(number((r.get("adjudication") or {}).get("false_positives")) and r["adjudication"]["false_positives"] > 0 for r in valid_controls),
                     "false_positives": summarize_values([(r.get("adjudication") or {}).get("false_positives") for r in valid_controls])},
        "tokens": {field: summarize_values([r["tokens"].get(field) for r in completed]) for field in TOKEN_FIELDS},
        "latency_seconds": summarize_values([r["result"].get("wall_seconds") for r in completed]), "observed_study_window": observed_window(records)}


def compare_group(records):
    a = aggregate([r for r in records if r["trial"]["variant"] == "A"])
    b = aggregate([r for r in records if r["trial"]["variant"] == "B"])
    latency = {stat: difference(a["latency_seconds"][stat], b["latency_seconds"][stat]) for stat in ["mean", "median"]}
    tokens = {field: {stat: difference(a["tokens"][field][stat], b["tokens"][field][stat]) for stat in ["sum", "mean", "median"]} for field in TOKEN_FIELDS}
    return {"A": a, "B": b, "B_minus_A": {"latency_seconds": latency, "tokens": tokens}, "paired": pair_summary(records)}


def bind_native_receipts(manifest, trial, result, started, result_present, started_present, issues):
    """Exclude unbound native evidence; legitimate older results bind through started."""
    tid = trial["trial_id"]
    manifest_hash = hashlib.sha256(json.dumps(manifest, sort_keys=True, ensure_ascii=False,
                                            separators=(",", ":")).encode()).hexdigest()
    start_valid, result_valid = started_present, result_present
    if started_present and not isinstance(started, dict):
        issues.append({"kind": "invalid_started_receipt", "trial_id": tid})
        start_valid = False
    elif started_present:
        if started.get("trial_id") != tid:
            issues.append({"kind": "started_trial_id_mismatch", "trial_id": tid})
            start_valid = False
        if not started.get("manifest_sha256"):
            issues.append({"kind": "missing_started_manifest_sha256", "trial_id": tid})
            start_valid = False
        elif started["manifest_sha256"] != manifest_hash:
            issues.append({"kind": "started_manifest_sha256_mismatch", "trial_id": tid})
            start_valid = False
        if started.get("command") != trial.get("command"):
            issues.append({"kind": "started_command_mismatch", "trial_id": tid})
            start_valid = False
    elif result_present:
        issues.append({"kind": "missing_started_receipt", "trial_id": tid})
    if result_present and not isinstance(result, dict):
        issues.append({"kind": "invalid_result_receipt", "trial_id": tid})
        result_valid = False
    elif result_present:
        if result.get("trial_id") != tid:
            issues.append({"kind": "result_trial_id_mismatch", "trial_id": tid})
            result_valid = False
        if "manifest_sha256" in result and result["manifest_sha256"] != manifest_hash:
            issues.append({"kind": "result_manifest_sha256_mismatch", "trial_id": tid})
            result_valid = False
    for name, receipt in [("started", started), ("result", result)]:
        if not isinstance(receipt, dict):
            continue
        identity = receipt.get("run_identity")
        identity = identity if isinstance(identity, dict) else {}
        for field in ["workers", "runner_sha256", "protocol_sha256"]:
            if field in manifest and identity.get(field) != manifest[field]:
                issues.append({"kind": name + "_protocol_identity_mismatch", "trial_id": tid, "field": field})
                if name == "started":
                    start_valid = False
                else:
                    result_valid = False
    result_valid = result_valid and start_valid
    excluded = (started_present and not start_valid) or (result_present and not result_valid)
    return result if result_valid else None, started if start_valid else None, bool(excluded)


def collect(manifest_path, adjudication_dir):
    hashes, issues = {}, []
    def read(path, required=False):
        if not path.exists():
            if required:
                issues.append({"kind": "missing_required_file", "source": str(path)})
            return None
        raw = path.read_bytes()
        hashes[str(path)] = hashlib.sha256(raw).hexdigest()
        try:
            return json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            issues.append({"kind": "unreadable_json", "source": str(path)})
            return None
    manifest = read(manifest_path, True)
    if not isinstance(manifest, dict):
        raise ValueError("Could not read the manifest")
    cases = read(manifest_path.parent / "cases.json", True) or {}
    canonical_cases = json.dumps(cases, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    if hashlib.sha256(canonical_cases.encode()).hexdigest() != manifest.get("fixture_sha256"):
        raise ValueError("Fixture identity changed after preparation; restore the prepared cases or prepare a new study")
    trials = {}
    for trial in manifest["trials"]:
        tid = trial["trial_id"]
        if tid in trials:
            issues.append({"kind": "duplicate_manifest_trial", "trial_id": tid})
        else:
            trials[tid] = trial
    packages = [(str(path), read(path, True)) for path in sorted(adjudication_dir.glob("batch-*.json"))]
    adjudications = resolve_adjudications(packages, set(trials), hashes[str(manifest_path)])
    issues.extend(adjudications["issues"])
    records = []
    for tid, trial in trials.items():
        directory = manifest_path.parent / "trials" / tid
        result, started = read(directory / "result.json"), read(directory / "started.json")
        result_present = (directory / "result.json").exists()
        started_present = (directory / "started.json").exists()
        result, started, excluded = bind_native_receipts(manifest, trial, result, started,
                                                         result_present, started_present, issues)
        expected = len(cases[trial["case_id"]]["oracle"]["material_defects"]) if trial["case_id"] in cases else None
        row = adjudications["rows"].get(tid)
        complete_adj = False
        if row:
            bad = [field for field in COUNT_FIELDS if field in row and (not isinstance(row[field], int) or isinstance(row[field], bool) or row[field] < 0)]
            bad += [field for field in QUALITY_FIELDS if row.get(field) is not None and not isinstance(row[field], bool)]
            if row.get("material_expected") is not None and expected is not None and row["material_expected"] != expected:
                bad.append("material_expected")
            if number(row.get("material_detected")) and number(row.get("material_expected")) and row["material_detected"] > row["material_expected"]:
                bad.append("material_detected")
            if bad:
                issues.append({"kind": "invalid_or_contradictory_adjudication", "trial_id": tid, "fields": sorted(set(bad))})
                row = None
            else:
                complete_adj = all(field in row for field in ADJ_FIELDS)
                missing = [field for field in ADJ_FIELDS if field not in row]
                if missing:
                    issues.append({"kind": "incomplete_adjudication", "trial_id": tid, "missing_fields": missing})
                if not result:
                    issues.append({"kind": "adjudication_without_result", "trial_id": tid})
                    row, complete_adj = None, False
        tokens = trial_tokens(result or {})
        if number(tokens["input_tokens_total"]) and number(tokens["cached_input_tokens"]) and tokens["cached_input_tokens"] > tokens["input_tokens_total"]:
            issues.append({"kind": "cache_exceeds_input", "trial_id": tid})
        if number(tokens["output_tokens"]) and number(tokens["reasoning_output_tokens"]) and tokens["reasoning_output_tokens"] > tokens["output_tokens"]:
            issues.append({"kind": "reasoning_exceeds_output", "trial_id": tid})
        records.append({"trial": trial, "result": result, "started": started, "fixture_expected": expected,
                        "result_present": result_present, "excluded_evidence": excluded,
                        "applicability": case_applicability(cases[trial["case_id"]]) if trial["case_id"] in cases else {},
                        "adjudication": row, "adjudication_complete": complete_adj, "adjudication_provenance": adjudications["provenance"].get(tid, []), "tokens": tokens})
    return manifest, records, issues, hashes, []


def build_analysis(manifest, records, issues, hashes, overhead):
    all_group = compare_group(records)
    completed = all_group["A"]["trials"]["complete"] + all_group["B"]["trials"]["complete"]
    adjudicated = all_group["A"]["trials"]["adjudicated_complete"] + all_group["B"]["trials"]["adjudicated_complete"]
    blocking = [issue for issue in issues if issue["kind"] != "duplicate_adjudication" or issue.get("conflicting_fields")]
    done = completed == len(manifest["trials"]) and adjudicated == completed and not blocking
    return {"status": "completo_con_observaciones" if done and issues else "completo" if done else "parcial",
            "analysis_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "scope": "bounded_text_review_benchmark", "planned_trials": len(manifest["trials"]), "completed_trials": completed, "adjudicated_completed_trials": adjudicated,
            "protocol": {key: manifest.get(key) for key in ["runtime_configs", "workers", "repetitions", "seed", "fixture_sha256", "runner_sha256", "protocol_sha256", "snapshot_identities"]},
            "methods": {"quality": "External adjudication only; provisional scores are not used and no semantic review is performed.",
                        "native_binding": "Started receipts require the canonical manifest digest, trial ID, stored command and declared protocol identity. Result IDs/protocol must match; new results also bind their canonical manifest digest. Unbound evidence is excluded from quality and resource comparisons. Older results without their own manifest digest require a valid started receipt.",
                        "adjudication_binding": "Each package requires study_manifest_sha256 matching the SHA-256 of manifest.json bytes. Missing or mismatched bindings exclude its rows and generate an integrity issue.",
                        "adjudication_counts": "Required counts must be nonnegative integers, excluding booleans and null. Invalid rows are rejected and missing fields remain incomplete; unknown counts are not converted to zero.",
                        "quality_denominators": "Correction: cases with expected material defects. Parallel design: nonempty oracle.parallel_design_tasks. Origin: regression/late_discovery/unknown required. Guarantees: nonempty oracle.guarantees. Dimensions across all valid reviews are also retained separately.",
                        "tokens": "native_turn_usage counted once, falling back to usage. Cached input is included in input total; reasoning is a subset of output. Input without cache reads = input_total - cached_input.",
                        "variation": "Sample standard deviation; null with fewer than two values. No statistical inference or monetary conversion.",
                        "latency": "B-A; percentage relative to A. Paired differences require both results complete. The span uses min(started) and max(started+wall_seconds), including gaps between batches.",
                        "missing": "Explicit null and absent fields/adjudication are counted separately; errors retain available usage."},
            "limits": ["Frozen instruction bodies and cases; measures textual review rather than complete spec/pipeline workflows.",
                       "Quality depends on external adjudication; files retain method and adjudicator.",
                       "Synthetic cases and repetitions fixed by the manifest provide descriptive evidence, without proving general superiority.",
                       "Consumption outside native trial processes is not observable from these receipts."],
            "all": all_group, "by_flow": {flow: compare_group([r for r in records if r["trial"]["flow"] == flow]) for flow in manifest["flows"]},
            "by_runtime": {runtime: compare_group([r for r in records if r["trial"]["runtime"] == runtime]) for runtime in manifest["runtime_configs"]},
            "by_case": {case: compare_group([r for r in records if r["trial"]["case_id"] == case]) for case in manifest["case_ids"]},
            "observed_study_window": observed_window(records), "integrity_issues": issues,
            "missing_adjudication_trial_ids": [r["trial"]["trial_id"] for r in records if not r.get("adjudication_complete")],
            "missing_result_trial_ids": [r["trial"]["trial_id"] for r in records if not r.get("result_present", bool(r.get("result")))],
            "diagnostic_overhead_excluded_from_AB": overhead, "source_file_sha256": hashes,
            "trial_rows": [{"trial_id": r["trial"]["trial_id"], "pair_id": r["trial"].get("pair_id"), "variant": r["trial"]["variant"], "runtime": r["trial"]["runtime"], "flow": r["trial"]["flow"], "case_id": r["trial"]["case_id"],
                            "status": "excluded_evidence" if r.get("excluded_evidence") else (r.get("result") or {}).get("status", "in_progress_or_interrupted" if r.get("started") else "pending"),
                            "wall_seconds": (r.get("result") or {}).get("wall_seconds"), "tokens": r["tokens"], "adjudication": {field: r["adjudication"][field] for field in ADJ_FIELDS if field in r["adjudication"]} if r.get("adjudication") else None,
                            "applicability": r["applicability"], "adjudication_complete": r["adjudication_complete"], "adjudication_provenance": r["adjudication_provenance"]} for r in records]}


def fmt(value):
    if value is None:
        return "—"
    return str(value) if isinstance(value, int) else f"{value:.2f}"


def render_report(data):
    a, b = data["all"]["A"], data["all"]["B"]
    status = {"completo": "complete", "completo_con_observaciones": "complete_with_observations",
              "parcial": "partial"}.get(data["status"], data["status"])
    lines = [f"# A/B benchmark: status {status}", "",
             f"There are {data['completed_trials']}/{data['planned_trials']} complete results and {data['adjudicated_completed_trials']} adjudicated complete results. Textual reviews use {data['protocol'].get('repetitions')} repetition(s) per case/context; results are descriptive.", "",
             "Model/effort: " + ", ".join(f"`{runtime}: {config.get('model')}/{config.get('effort')}`" for runtime, config in (data['protocol'].get('runtime_configs') or {}).items()) + f". Fixed concurrency: {data['protocol'].get('workers')} pairs.", "",
             "| Variant | Complete | Valid | Errors | Pending | In progress/uncertain | Excluded evidence | Adjudicated | Adjudicated detected/expected | False positives |",
             "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for variant, group in [("A", a), ("B", b)]:
        t, q = group["trials"], group["quality"]
        lines.append(f"| {variant} | {t['complete']} | {t['valid']} | {t['errors']} | {t['pending']} | {t['in_progress_or_interrupted']} | {t['excluded_evidence']} | {t['adjudicated_complete']} | {fmt(q['material_detected'])}/{fmt(q['material_expected'])} | {fmt(q['false_positives']['sum'])} |")
    lines += ["", "Quality uses external adjudication only. Unknown values and absent judgments retain their status; invalid controls are not considered correct.", "",
              "Global and per-flow aggregates are descriptive when several runtimes are present. Compare A/B within each runtime with the same model/effort and context; differences between models cannot be attributed to guidance.", "",
              "## Latency and differences", "", "| Variant | n | Mean (s) | Median (s) | Sample stdev (s) | Min–max (s) |", "| --- | ---: | ---: | ---: | ---: | --- |"]
    for variant, group in [("A", a), ("B", b)]:
        s = group["latency_seconds"]
        lines.append(f"| {variant} | {s['n']} | {fmt(s['mean'])} | {fmt(s['median'])} | {fmt(s['stdev'])} | {fmt(s['min'])}–{fmt(s['max'])} |")
    delta = data["all"]["B_minus_A"]["latency_seconds"]["mean"]
    paired = data["all"]["paired"]
    lines += ["", f"Difference of means B−A: {fmt(delta['absolute'])} s ({fmt(delta['relative_percent'])}% relative to A). There are {paired['both_complete']} complete pairs and {paired['both_adjudicated']} valid pairs with both sides adjudicated; the mean paired difference is {fmt(paired['latency_B_minus_A_seconds']['mean'])} s.",
              f"Observed study window: {fmt(data['observed_study_window']['span_seconds'])} s from the first start to the last known end, including pauses between batches. There are {data['observed_study_window']['unfinished_started']} starts without an observed end.", "",
              "## Native tokens", "", "| Field | A: sum / mean / median (n) | B: sum / mean / median (n) |", "| --- | ---: | ---: |"]
    labels = {"input_tokens_total": "Total input", "cached_input_tokens": "Input read from cache", "uncached_input_tokens": "Input without cache reads", "cache_write_input_tokens": "Cache writes", "output_tokens": "Output", "reasoning_output_tokens": "Reasoning within output", "total_tokens": "Total input + output"}
    for field in TOKEN_FIELDS:
        aa, bb = a["tokens"][field], b["tokens"][field]
        lines.append(f"| {labels[field]} | {fmt(aa['sum'])} / {fmt(aa['mean'])} / {fmt(aa['median'])} ({aa['n']}) | {fmt(bb['sum'])} / {fmt(bb['mean'])} / {fmt(bb['median'])} ({bb['n']}) |")
    lines += ["", "Cached input is already included in input and reasoning in output: neither is added again. Error consumption is included when usage exists; missing values are not zero.", "",
              "## Adjudicated dimensions", "", "Correction excludes controls requiring no repair; parallel design requires declared independent work; origin requires applicable history/origin; guarantees require a preservation contract. Null remains visible, and absent judgments do not count as correct.", "",
              "| Dimension | Applicable planned A/B | A: true / false / null / missing | B: true / false / null / missing |", "| --- | ---: | ---: | ---: |"]
    labels_q = {"origin_correct": "Origin", "correction_sufficient": "Sufficient correction", "task_order_preserved": "Order", "parallel_design_preserved": "Parallel design", "coverage_sufficient": "Coverage", "guarantees_preserved": "Guarantees"}
    for field in QUALITY_FIELDS:
        aa, bb = a["quality"]["dimensions"][field], b["quality"]["dimensions"][field]
        lines.append(f"| {labels_q[field]} | {aa['applicable_planned']}/{bb['applicable_planned']} | {aa['true']} / {aa['false']} / {aa['null']} / {aa['missing']} | {bb['true']} / {bb['false']} / {bb['null']} / {bb['missing']} |")
    lines += ["", f"Valid adjudicated controls A/B: {a['controls']['adjudicated']}/{b['controls']['adjudicated']}; adjudicated controls without false positives: {a['controls']['clean_adjudicated_controls']}/{b['controls']['clean_adjudicated_controls']}.", "",
              "## By runtime", "", "| Runtime | Variant | Complete/adjudicated | Detected/expected | FP | Mean latency (s) | Known total tokens |", "| --- | --- | ---: | ---: | ---: | ---: | ---: |"]
    for label, comparison in data["by_runtime"].items():
        for variant in ["A", "B"]:
            group = comparison[variant]
            q = group["quality"]
            lines.append(f"| {label} | {variant} | {group['trials']['complete']}/{group['trials']['adjudicated_complete']} | {fmt(q['material_detected'])}/{fmt(q['material_expected'])} | {fmt(q['false_positives']['sum'])} | {fmt(group['latency_seconds']['mean'])} | {fmt(group['tokens']['total_tokens']['sum'])} |")
    lines += ["", "## By flow", "", "| Flow | Variant | Complete/adjudicated | Detected/expected | FP | Mean latency (s) | Known total tokens |", "| --- | --- | ---: | ---: | ---: | ---: | ---: |"]
    for label, comparison in data["by_flow"].items():
        for variant in ["A", "B"]:
            group = comparison[variant]
            q = group["quality"]
            lines.append(f"| {label} | {variant} | {group['trials']['complete']}/{group['trials']['adjudicated_complete']} | {fmt(q['material_detected'])}/{fmt(q['material_expected'])} | {fmt(q['false_positives']['sum'])} | {fmt(group['latency_seconds']['mean'])} | {fmt(group['tokens']['total_tokens']['sum'])} |")
    lines += ["", "## Integrity", ""]
    if data["integrity_issues"]:
        for issue in data["integrity_issues"]:
            lines.append("- " + json.dumps(issue, ensure_ascii=False))
    else:
        lines.append("No duplicates, contradictions or identity errors were detected in the supplied sources.")
    lines += ["", f"Without a result: {len(data['missing_result_trial_ids'])}; without complete adjudication: {len(data['missing_adjudication_trial_ids'])}. Full IDs, discrepancies, paired statistics and source hashes are in `analysis.json`.", ""]
    for entry in data["diagnostic_overhead_excluded_from_AB"]:
        lines.append(f"- `{entry['run']}`: {fmt(entry['native_invocations'])} invocation(s), {fmt(entry['tokens']['total_tokens'])} reported total tokens, {fmt(entry['wall_seconds'])} s; excluded from A/B.")
    lines += ["", "Errors without usage retain unknown consumption. Cases, pairs, relative differences and all statistics are in `analysis.json`.", "", "## Limits", ""]
    lines += ["- " + limit for limit in data["limits"]]
    lines += ["", "No p-values, confidence intervals or monetary estimates are calculated. Reads during execution are partial; analyzing the same final files reproduces the calculations.", ""]
    return "\n".join(lines)


def require_output_directory(path):
    """Keep derived reports outside Git or in a deliberately ignored directory."""
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--adjudication-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    args.out = require_output_directory(args.out)
    manifest, records, issues, hashes, overhead = collect(args.manifest.resolve(), args.adjudication_dir.resolve())
    data = build_analysis(manifest, records, issues, hashes, overhead)
    data["study_manifest_sha256"] = hashes[str(args.manifest.resolve())]
    args.out.mkdir(parents=True, exist_ok=True)
    for name, content in [("analysis.json", json.dumps(data, ensure_ascii=False, indent=2) + "\n"), ("report.md", render_report(data))]:
        target = args.out / name
        temporary = target.with_name(name + f".{os.getpid()}.tmp")
        temporary.write_text(content, encoding="utf-8")
        os.replace(temporary, target)
    print(json.dumps({"status": data["status"], "complete": data["completed_trials"], "adjudicated": data["adjudicated_completed_trials"],
                      "planned": data["planned_trials"], "integrity_issues": len(data["integrity_issues"]), "json": str(args.out / "analysis.json"), "report": str(args.out / "report.md")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
