#!/usr/bin/env python3
"""Behavioral coverage for native workspace preferences and safe config writes."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "plugins/team-harness/skills/setup/scripts/manage_config.py"
PREFERENCES = ROOT / "tests/fixtures/workspace-preferences.json"
WORKSPACE_KEYS = {
    "workspace-mode", "logs-mode", "logs-path", "logs-subfolder",
    "workspace-space-id", "workspace-container-page-id",
}


def load_config():
    spec = importlib.util.spec_from_file_location("workspace_config", HELPER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONFIG = load_config()


class WorkspaceConfigTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="th-workspace-config-")
        self.base = Path(self.temp.name).resolve()
        self.codex_home = self.base / "codex"
        self.codex_home.mkdir()
        self.settings = self.codex_home / ".team-harness.json"
        self.env = mock.patch.dict(os.environ, {"CODEX_HOME": str(self.codex_home)})
        self.env.start()

    def tearDown(self) -> None:
        self.env.stop()
        self.temp.cleanup()

    def write(self, value: dict) -> bytes:
        raw = (json.dumps(value, indent=2) + "\n").encode()
        self.settings.write_bytes(raw)
        return raw

    def read(self) -> dict:
        return json.loads(self.settings.read_text(encoding="utf-8"))

    def run_helper(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(HELPER), *args],
            text=True, capture_output=True, check=False, timeout=20,
        )

    def set_values(self, values: dict) -> dict:
        args = [item for key, value in values.items() for item in ("--set", f"{key}={json.dumps(value)}")]
        result = self.run_helper("set", *args)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_selector_contract_matches_shared_fixture_without_mutating_input(self) -> None:
        fixture = json.loads(PREFERENCES.read_text(encoding="utf-8"))
        for case in fixture["cases"]:
            with self.subTest(case=case["name"]):
                document = case["config"]
                before = json.dumps(document, sort_keys=True)
                self.assertEqual(CONFIG.resolve_workspace_preference(document), case["expected"])
                self.assertEqual(json.dumps(document, sort_keys=True), before)

    def test_remote_destination_requires_both_opaque_ids(self) -> None:
        cases = [
            ({"workspace-mode": "gpt-space"}, "incomplete_space_destination"),
            ({"workspace-mode": "gpt-space", "workspace-space-id": "space_one"}, "incomplete_space_destination"),
            ({"workspace-mode": "gpt-space", "workspace-space-id": "space_one", "workspace-container-page-id": None}, "invalid_space_destination"),
            ({"workspace-mode": "gpt-space", "workspace-space-id": "https://example.test/space", "workspace-container-page-id": "page_one"}, "invalid_space_destination"),
            ({"workspace-mode": "gpt-space", "workspace-space-id": "space_one", "workspace-container-page-id": "/tmp/page"}, "invalid_space_destination"),
            ({"workspace-mode": "gpt-space", "workspace-space-id": "space_one", "workspace-container-page-id": "page one"}, "invalid_space_destination"),
        ]
        for document, reason in cases:
            with self.subTest(document=document):
                self.assertEqual(CONFIG.validate_workspace_destination(document), {
                    "status": "invalid", "mode": "gpt-space", "reason_code": reason,
                })
        document = {"workspace-mode": "gpt-space", "workspace-space-id": "space_one", "workspace-container-page-id": "page_one"}
        self.assertEqual(CONFIG.validate_workspace_destination(document), {
            "status": "valid", "mode": "gpt-space", "reason_code": None,
        })

    def test_destination_validation_does_not_probe_filesystem_access(self) -> None:
        document = {"workspace-mode": "obsidian", "logs-path": str(self.base / "unavailable-vault"), "logs-subfolder": "TH-notes"}
        with mock.patch.object(Path, "resolve", side_effect=AssertionError("filesystem probe")):
            self.assertEqual(CONFIG.validate_workspace_destination(document), {
                "status": "valid", "mode": "obsidian", "reason_code": None,
            })

    def test_explicit_file_selection_writes_both_selectors(self) -> None:
        vault = self.base / "vault"
        vault.mkdir()
        for selector in ("workspace-mode", "logs-mode"):
            for mode in ("local", "obsidian"):
                with self.subTest(selector=selector, mode=mode):
                    self.write({"workspace-mode": "gpt-space", "workspace-space-id": "space_old", "workspace-container-page-id": "page_old", "custom": {"keep": 7}})
                    selected = {selector: mode}
                    if mode == "obsidian":
                        selected.update({"logs-path": str(vault), "logs-subfolder": "TH-notes"})
                    self.set_values(selected)
                    persisted = self.read()
                    self.assertEqual(persisted["workspace-mode"], mode)
                    self.assertEqual(persisted["logs-mode"], mode)
                    self.assertEqual(persisted["custom"], {"keep": 7})

    def test_explicit_remote_selection_removes_alias_and_preserves_unrelated_keys(self) -> None:
        self.write({"logs-mode": "obsidian", "logs-path": "/old/vault", "logs-subfolder": "notes", "custom": {"keep": [1, 2]}})
        result = self.set_values({"workspace-mode": "gpt-space", "workspace-space-id": "space_one", "workspace-container-page-id": "page_one"})
        persisted = self.read()
        self.assertEqual(persisted["workspace-mode"], "gpt-space")
        self.assertEqual(persisted["workspace-space-id"], "space_one")
        self.assertEqual(persisted["workspace-container-page-id"], "page_one")
        self.assertNotIn("logs-mode", persisted)
        self.assertEqual(persisted["custom"], {"keep": [1, 2]})
        self.assertTrue(result["changed"])

    def test_fresh_setting_seeds_matching_local_selectors(self) -> None:
        self.set_values({"language": "es"})
        persisted = self.read()
        self.assertEqual(persisted["workspace-mode"], "local")
        self.assertEqual(persisted["logs-mode"], "local")

    def test_incomplete_or_invalid_remote_set_leaves_exact_bytes_unchanged(self) -> None:
        for destination in (
            {}, {"workspace-space-id": "space_one"},
            {"workspace-space-id": "space_one", "workspace-container-page-id": "https://example.test/page"},
        ):
            with self.subTest(destination=destination):
                before = self.write({"logs-mode": "local", "custom": {"keep": True}})
                assignments = {"workspace-mode": "gpt-space", **destination}
                args = [item for key, value in assignments.items() for item in ("--set", f"{key}={json.dumps(value)}")]
                result = self.run_helper("set", *args)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertIn("manage_config:", result.stderr)
                self.assertEqual(self.settings.read_bytes(), before)
                self.assertFalse(self.settings.with_suffix(".json.bak").exists())

    def test_invalid_selector_values_fail_cleanly_without_writes(self) -> None:
        for selector in ("workspace-mode", "logs-mode"):
            for value in (None, [], {}, True, "unknown"):
                with self.subTest(selector=selector, value=value):
                    before = self.write({"logs-mode": "local", "custom": [1]})
                    result = self.run_helper("set", "--set", f"{selector}={json.dumps(value)}")
                    self.assertEqual(result.returncode, 1)
                    self.assertIn("manage_config:", result.stderr)
                    self.assertNotIn("Traceback", result.stderr)
                    self.assertEqual(self.settings.read_bytes(), before)

    def test_conflicting_explicit_selectors_are_rejected_atomically(self) -> None:
        before = self.write({"logs-mode": "local"})
        result = self.run_helper("set", "--set", 'workspace-mode="local"', "--set", 'logs-mode="obsidian"')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.settings.read_bytes(), before)

    def test_set_validates_existing_remote_destination_as_a_whole(self) -> None:
        before = self.write({"workspace-mode": "gpt-space", "workspace-space-id": "space_one"})
        result = self.run_helper("set", "--set", 'language="es"')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.settings.read_bytes(), before)

    def test_show_preserves_null_selector_and_redacts_secrets_without_migration(self) -> None:
        secret = "github_pat_must-stay-private"
        before = self.write({"workspace-mode": None, "logs-mode": "obsidian", "workspace-space-id": "space_one", "workspace-container-page-id": "page_one", "opaque": {"token": secret}})
        result = self.run_helper("show")
        self.assertEqual(result.returncode, 0, result.stderr)
        shown = json.loads(result.stdout)
        self.assertIsNone(shown["config"]["workspace-mode"])
        self.assertEqual(shown["config"]["workspace-space-id"], "space_one")
        self.assertEqual(shown["config"]["workspace-container-page-id"], "page_one")
        self.assertNotIn(secret, result.stdout)
        self.assertEqual(shown["workspaceDiagnostics"].count("selector_conflict"), 1)
        self.assertIn("invalid_workspace_mode", shown["workspaceDiagnostics"])
        self.assertEqual(self.settings.read_bytes(), before)

    def test_semantic_import_preserves_any_native_workspace_group(self) -> None:
        source = {"workspace-mode": "gpt-space", "workspace-space-id": "space_source", "workspace-container-page-id": "page_source", "language": "es", "custom": {"source": True}}
        native_groups = [
            {"logs-mode": "obsidian", "logs-path": "/native/vault", "logs-subfolder": "TH"},
            {"workspace-mode": "local"},
            {"workspace-mode": None, "logs-mode": "local"},
            {"workspace-space-id": "space_native"},
            {"logs-path": "/native/vault"},
        ]
        for native in native_groups:
            with self.subTest(native=native):
                target = {**native, "custom": {"native": 1}}
                importable, conflicts = CONFIG.classify_import(target, source)
                self.assertFalse(WORKSPACE_KEYS.intersection(importable))
                self.assertTrue({"workspace-mode", "workspace-space-id", "workspace-container-page-id"}.issubset(conflicts))
                imported = CONFIG.import_missing(target, source)
                self.assertFalse(WORKSPACE_KEYS.intersection(imported))
                self.assertEqual({key: value for key, value in target.items() if key in WORKSPACE_KEYS}, native)
                self.assertEqual(target["language"], "es")
                self.assertEqual(target["custom"], {"native": 1, "source": True})

    def test_equivalent_workspace_import_is_preserved_without_false_conflicts(self) -> None:
        cases = [
            ({"workspace-mode": "local", "logs-mode": "local"}, {"workspace-mode": "local"}),
            ({"logs-mode": "obsidian", "logs-path": "/example/vault", "logs-subfolder": "TH"}, {"workspace-mode": "obsidian", "logs-path": "/example/vault", "logs-subfolder": "TH"}),
            ({"workspace-mode": "gpt-space", "workspace-space-id": "space_one", "workspace-container-page-id": "page_one"}, {"workspace-mode": "gpt-space", "workspace-space-id": "space_one", "workspace-container-page-id": "page_one"}),
        ]
        for native, source in cases:
            with self.subTest(native=native):
                target = json.loads(json.dumps(native))
                self.assertEqual(CONFIG.classify_import(target, source), ([], []))
                self.assertEqual(CONFIG.import_missing(target, source), [])
                self.assertEqual(target, native)

    def test_import_into_empty_workspace_group_preserves_source_representation(self) -> None:
        sources = [
            {"logs-mode": "obsidian", "logs-path": "/source/vault", "logs-subfolder": "TH"},
            {"workspace-mode": "gpt-space", "workspace-space-id": "space_source", "workspace-container-page-id": "page_source"},
            {"workspace-mode": "gpt-space", "workspace-space-id": "space_source"},
            {"workspace-mode": "local", "logs-mode": "obsidian"},
        ]
        for source in sources:
            with self.subTest(source=source):
                target = {"custom": {"native": True}}
                importable, conflicts = CONFIG.classify_import(target, source)
                self.assertEqual(set(importable), set(source))
                self.assertEqual(conflicts, [])
                self.assertEqual(set(CONFIG.import_missing(target, source)), set(source))
                self.assertEqual({key: target[key] for key in source}, source)
                self.assertEqual(target["custom"], {"native": True})

    def test_import_cli_reports_cross_name_conflicts_without_exposing_values(self) -> None:
        self.write({"logs-mode": "obsidian", "logs-path": "/native/vault", "logs-subfolder": "TH"})
        source = self.base / "source.json"
        source.write_text(json.dumps({"workspace-mode": "gpt-space", "workspace-space-id": "space_source", "workspace-container-page-id": "page_source", "custom": {"source": 9}}), encoding="utf-8")
        output = io.StringIO()
        with mock.patch.object(CONFIG, "import_sources", return_value={"claude": source}), contextlib.redirect_stdout(output):
            self.assertEqual(CONFIG.inspect_import("claude"), 0)
        inspected = json.loads(output.getvalue())
        self.assertEqual(set(inspected["preservedNativeKeys"]), {"workspace-mode", "workspace-space-id", "workspace-container-page-id"})
        self.assertNotIn("space_source", output.getvalue())
        output = io.StringIO()
        with mock.patch.object(CONFIG, "import_sources", return_value={"claude": source}), contextlib.redirect_stdout(output):
            self.assertEqual(CONFIG.import_config("claude", None), 0)
        imported = json.loads(output.getvalue())
        self.assertEqual(set(imported["preservedNativeKeys"]), {"workspace-mode", "workspace-space-id", "workspace-container-page-id"})
        self.assertNotIn("space_source", output.getvalue())
        persisted = self.read()
        self.assertNotIn("workspace-mode", persisted)
        self.assertNotIn("workspace-space-id", persisted)
        self.assertNotIn("workspace-container-page-id", persisted)
        self.assertEqual(persisted["logs-mode"], "obsidian")
        self.assertEqual(persisted["custom"], {"source": 9})

    def test_ensure_preserves_existing_workspace_representations_and_is_idempotent(self) -> None:
        cases = [
            ({"logs-mode": "obsidian", "logs-path": str(self.base / "old-vault"), "logs-subfolder": "notes"}, []),
            ({"workspace-mode": "gpt-space", "workspace-space-id": "space_one", "workspace-container-page-id": "page_one"}, []),
            ({"workspace-mode": "gpt-space", "workspace-space-id": "space_one"}, ["incomplete_space_destination"]),
            ({"workspace-mode": "local", "logs-mode": "obsidian"}, ["selector_conflict"]),
            ({"workspace-mode": None, "logs-mode": "local"}, ["invalid_workspace_mode", "selector_conflict"]),
            ({"logs-mode": None}, ["invalid_logs_mode"]),
            ({"workspace-mode": "obsidian", "logs-path": "~__th_no_such_user__/vault", "logs-subfolder": "notes"}, ["invalid_obsidian_destination"]),
        ]
        for preference, diagnostics in cases:
            with self.subTest(preference=preference):
                self.write({**preference, "custom": {"keep": [1, {"nested": True}]}})
                first = CONFIG.ensure_defaults_result("3.48.0")
                persisted = self.read()
                self.assertEqual({key: value for key, value in persisted.items() if key in WORKSPACE_KEYS}, preference)
                self.assertEqual(first["workspaceDiagnostics"], diagnostics)
                self.assertEqual(persisted["custom"], {"keep": [1, {"nested": True}]})
                first_bytes = self.settings.read_bytes()
                second = CONFIG.ensure_defaults_result("3.48.0")
                self.assertFalse(second["changed"])
                self.assertEqual(second["workspaceDiagnostics"], diagnostics)
                self.assertEqual(self.settings.read_bytes(), first_bytes)

    def test_ensure_seeds_both_selectors_only_when_both_are_absent(self) -> None:
        result = CONFIG.ensure_defaults_result("3.48.0")
        self.assertEqual(self.read()["workspace-mode"], "local")
        self.assertEqual(self.read()["logs-mode"], "local")
        self.assertIn("workspace-mode", result["added"])
        self.assertIn("logs-mode", result["added"])
        self.assertFalse(CONFIG.ensure_defaults_result("3.48.0")["changed"])


if __name__ == "__main__":
    unittest.main()
