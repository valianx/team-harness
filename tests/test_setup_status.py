#!/usr/bin/env python3
"""Hermetic checks for optional, read-only setup diagnostics."""

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import time
import unittest


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "skills/setup/scripts/setup_status.py"
CANARY = "secret-canary-never-export-this"


def load_helper():
    if not HELPER.is_file():
        return None
    spec = importlib.util.spec_from_file_location("setup_status", HELPER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


STATUS = load_helper()


class SetupStatusTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(STATUS, "The read-only setup status helper is not implemented")
        self.temp = tempfile.TemporaryDirectory(prefix="th-setup-status-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.home = self.base / "home"
        self.cwd = self.base / "project"
        self.home.mkdir()
        self.cwd.mkdir()
        self.env = {"PATH": ""}

    def write(self, path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def fixture(self, source):
        path = self.base / "probe fixture.py"
        path.write_text(source, encoding="utf-8")
        return [sys.executable, str(path)]

    def report(self, runtime="codex", **kwargs):
        return STATUS.build_report(
            runtime, env=self.env, home=self.home, cwd=self.cwd,
            platform="linux", which=lambda name: None, **kwargs,
        )

    def snapshot(self):
        return {
            str(path.relative_to(self.base)): (
                stat.S_IMODE(path.stat().st_mode), path.read_bytes() if path.is_file() else None,
            )
            for path in self.base.rglob("*")
        }

    def test_explicit_root_wins_over_environment_and_default(self):
        for runtime, variable in [
            ("claude", "CLAUDE_CONFIG_DIR"), ("codex", "CODEX_HOME"),
            ("opencode", "OPENCODE_CONFIG_DIR"), ("pi", "PI_CODING_AGENT_DIR"),
        ]:
            with self.subTest(runtime=runtime):
                explicit = self.base / (runtime + " selected")
                result = STATUS.resolve_root(
                    runtime, root=explicit, scope="project", env={variable: str(self.base / "other")},
                    home=self.home, cwd=self.cwd,
                )
                self.assertEqual(result, explicit)

    def test_native_environment_roots_are_independent(self):
        names = {"claude": "CLAUDE_CONFIG_DIR", "codex": "CODEX_HOME",
                 "opencode": "OPENCODE_CONFIG_DIR", "pi": "PI_CODING_AGENT_DIR"}
        env = {variable: str(self.base / runtime) for runtime, variable in names.items()}
        for runtime in names:
            self.assertEqual(STATUS.resolve_root(runtime, env=env, home=self.home, cwd=self.cwd),
                             self.base / runtime)

    def test_project_and_global_defaults_do_not_share_configuration(self):
        defaults = {"claude": self.home / ".claude", "codex": self.home / ".codex",
                    "opencode": self.home / ".config/opencode", "pi": self.home / ".pi/agent"}
        for runtime, expected in defaults.items():
            self.assertEqual(STATUS.resolve_root(runtime, env={}, home=self.home, cwd=self.cwd, platform="linux"), expected)
            self.assertEqual(STATUS.resolve_root(runtime, scope="project", env={}, home=self.home, cwd=self.cwd, platform="linux"),
                             self.cwd / ("." + runtime))

    def test_opencode_native_xdg_and_windows_roots(self):
        self.assertEqual(STATUS.resolve_root("opencode", env={"XDG_CONFIG_HOME": str(self.base / "xdg")},
                                             home=self.home, cwd=self.cwd, platform="linux"), self.base / "xdg/opencode")
        self.assertEqual(STATUS.resolve_root("opencode", env={"APPDATA": str(self.base / "appdata")},
                                             platform="win32", home=self.home, cwd=self.cwd),
                         self.base / "appdata/opencode")

    def test_relative_and_control_character_roots_are_rejected_without_echo(self):
        for root in ["relative", "relative/" + CANARY, str(self.base) + "\n" + CANARY]:
            with self.subTest(root=root):
                with self.assertRaises(ValueError) as caught:
                    STATUS.resolve_root("codex", root=root, env={}, home=self.home, cwd=self.cwd)
                self.assertNotIn(CANARY, str(caught.exception))

    def test_all_inventory_keeps_each_root_and_one_broken_host_does_not_stop_others(self):
        selected = self.base / "selected"
        self.write(selected / ".team-harness.json", {"installed_version": "9.0.0"})
        self.write(self.home / ".claude/.team-harness.json", [CANARY])
        self.env["PI_CODING_AGENT_DIR"] = "relative-invalid"
        report = self.report(root=selected, all_runtimes=True)
        self.assertEqual(set(report["runtimes"]), {"claude", "codex", "opencode", "pi"})
        self.assertEqual(report["runtimes"]["codex"]["root"], str(selected))
        self.assertEqual(report["runtimes"]["claude"]["configuration"]["status"], "invalid")
        self.assertEqual(report["runtimes"]["pi"]["configuration"]["code"], "invalid_config_root")
        self.assertEqual(report["runtimes"]["opencode"]["root"], str(self.home / ".config/opencode"))
        self.assertNotIn(CANARY, json.dumps(report))

    def test_custom_root_does_not_borrow_default_configuration_or_package(self):
        self.write(self.home / ".codex/.team-harness.json", {"installed_version": "3.49.0"})
        package = self.home / ".codex/plugins/cache/team-harness/team-harness/3.49.0"
        self.write(package / ".codex-plugin/plugin.json", {
            "name": "team-harness", "version": "3.49.0",
            "repository": "https://github.com/valianx/team-harness",
        })
        runtime = self.report(root=self.base / "custom")["runtimes"]["codex"]
        self.assertEqual(runtime["configuration"]["status"], "missing")
        self.assertEqual(runtime["installation"]["status"], "unknown")
        self.assertNotIn("version", runtime["installation"])

    def test_configuration_and_old_receipts_do_not_prove_installation_or_activation(self):
        root = self.base / "selected"
        self.write(root / ".team-harness.json", {"installed_version": "3.49.0", "token": CANARY})
        self.write(root / "receipt.json", {"status": "converged", "version": "3.49.0"})
        runtime = self.report(root=root)["runtimes"]["codex"]
        self.assertEqual(runtime["configuration"]["status"], "valid_object")
        self.assertEqual(runtime["installation"]["status"], "unknown")
        self.assertEqual(runtime["activation"]["status"], "unknown")
        self.assertIn("plugin list", runtime["installation"]["next_step"])
        self.assertNotIn(CANARY, json.dumps(runtime))

    def test_selected_native_manifests_identify_files_but_never_activation(self):
        cases = [
            ("claude", ".claude-plugin/plugin.json", "th"),
            ("codex", ".codex-plugin/plugin.json", "team-harness"),
            ("pi", "package.json", "@valianx/team-harness-pi"),
        ]
        for runtime, manifest, name in cases:
            with self.subTest(runtime=runtime):
                package = self.base / runtime
                self.write(package / manifest, {"name": name, "version": "3.49.0",
                    "repository": {"url": "https://github.com/valianx/team-harness.git"},
                    "pi": {"extensions": ["./runtime/pi/extension.ts"], "skills": ["./installer-assets/pi-skills"]}})
                result = self.report(runtime, package_root=package)["runtimes"][runtime]
                self.assertEqual(result["installation"]["status"], "files_present")
                self.assertEqual(result["installation"]["version"], "3.49.0")
                self.assertEqual(result["activation"]["status"], "unknown")

    def test_foreign_or_invalid_manifests_do_not_establish_package_identity(self):
        package = self.base / "package"
        for document in [[], {"name": "other", "version": "3.49.0"},
                         {"name": "team-harness", "version": CANARY,
                          "repository": "https://github.com/valianx/team-harness"},
                         {"name": "team-harness", "version": "3.49.0", "repository": "https://example.test/other"}]:
            self.write(package / ".codex-plugin/plugin.json", document)
            result = self.report(package_root=package)["runtimes"]["codex"]["installation"]
            self.assertEqual(result["status"], "unknown")
            self.assertNotIn(CANARY, json.dumps(result))

    def test_opencode_ledger_and_pi_package_do_not_prove_opencode_installation(self):
        root = self.base / "opencode"
        self.write(root / ".team-harness.json", {"installed_version": "3.49.0", "files": {"agent/x.md": {"hash": "abc"}}})
        self.write(root / "ownership-ledger-opencode.jsonl", {"installed_version": "3.49.0"})
        self.write(root / "package.json", {"name": "@valianx/team-harness-pi", "version": "3.49.0"})
        result = self.report("opencode", root=root, package_root=root)["runtimes"]["opencode"]
        self.assertEqual(result["configuration"]["status"], "valid_object")
        self.assertEqual(result["installation"]["status"], "unknown")

    def test_repeated_reads_preserve_bytes_modes_directory_entries_and_remote_preferences(self):
        root = self.base / "selected"
        settings = self.write(root / ".team-harness.json", {"workspace-mode": "gpt-space",
            "workspace-space-id": "space_selected", "workspace-container-page-id": "page_workspace",
            "unknown": {"credential": CANARY}})
        settings.chmod(0o600)
        self.write(root / "plugins/registry.json", {"token": CANARY})
        self.write(root / "receipts/convergence.json", {"status": "converged"})
        before = self.snapshot()
        first = self.report(root=root, all_runtimes=True)
        second = self.report(root=root, all_runtimes=True)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(first, second)
        self.assertNotIn(CANARY, json.dumps(first))
        self.assertNotIn("space_selected", json.dumps(first))

    def test_malformed_and_nonobject_configurations_have_private_diagnostics(self):
        root = self.base / "selected"
        for raw in ['{"secret":"' + CANARY, json.dumps([CANARY]), '"' + CANARY + '"']:
            root.mkdir(exist_ok=True)
            path = root / ".team-harness.json"
            path.write_text(raw, encoding="utf-8")
            before = self.snapshot()
            result = self.report(root=root)
            self.assertEqual(result["runtimes"]["codex"]["configuration"]["status"], "invalid")
            self.assertNotIn(CANARY, json.dumps(result))
            self.assertEqual(self.snapshot(), before)

    def test_nonregular_configuration_is_rejected_without_opening_it(self):
        root = self.base / "selected"
        (root / ".team-harness.json").mkdir(parents=True)
        before = self.snapshot()
        result = self.report(root=root)["runtimes"]["codex"]["configuration"]
        self.assertEqual(result["status"], "invalid")
        self.assertEqual(result["code"], "not_regular_file")
        self.assertEqual(self.snapshot(), before)

    def test_oversized_configuration_and_selected_manifest_are_bounded_and_private(self):
        root = self.base / "selected"
        manifest = root / ".codex-plugin/plugin.json"
        manifest.parent.mkdir(parents=True)
        for path in [root / ".team-harness.json", manifest]:
            path.write_bytes((CANARY * 100000).encode())
        before = self.snapshot()
        runtime = self.report(root=root, package_root=root)["runtimes"]["codex"]
        self.assertEqual(runtime["configuration"]["code"], "document_too_large")
        self.assertEqual(runtime["installation"]["code"], "selected_manifest_document_too_large")
        self.assertNotIn(CANARY, json.dumps(runtime))
        self.assertEqual(self.snapshot(), before)

    def test_unexpected_manifest_identity_types_do_not_stop_other_inventory_entries(self):
        package = self.base / "package"
        self.write(package / ".codex-plugin/plugin.json", {"name": "team-harness", "version": "3.49.0",
                                                          "repository": [CANARY]})
        try:
            report = self.report(package_root=package, all_runtimes=True)
        except Exception as error:
            self.fail("Invalid native manifest identity interrupted independent inventory: " + type(error).__name__)
        self.assertEqual(report["runtimes"]["codex"]["installation"]["status"], "unknown")
        self.assertEqual(report["runtimes"]["claude"]["cli"]["status"], "missing")
        self.assertNotIn(CANARY, json.dumps(report))

    def test_pi_project_file_is_not_attributed_to_native_agent_configuration(self):
        root = self.cwd / ".pi"
        self.write(root / ".team-harness.json", {"language": "es"})
        runtime = self.report("pi", scope="project")["runtimes"]["pi"]
        self.assertEqual(runtime["configuration"]["status"], "unknown")
        self.assertEqual(runtime["configuration"]["code"], "project_settings_not_agent_dir")

    def test_optional_dependencies_do_not_block_minimal_native_requirements(self):
        def version(argv, **unused):
            return {"status": "available", "version": "0.162.1", "code": "version_observed"}
        report = STATUS.build_report("codex", root=self.base / "selected", env=self.env,
            home=self.home, cwd=self.cwd, platform="linux", which=lambda name: "/native/codex" if name == "codex" else None,
            probe=version)
        runtime = report["runtimes"]["codex"]
        self.assertEqual(runtime["capabilities"]["native_package"]["status"], "requirements_met")
        self.assertEqual(runtime["capabilities"]["github"]["status"], "unavailable")
        self.assertEqual(runtime["capabilities"]["gpt_space"]["status"], "unknown")
        self.assertEqual(runtime["installation"]["status"], "unknown")

    def test_catalog_keeps_operation_specific_minimums_out_of_other_native_installs(self):
        catalog = STATUS.load_requirements()
        self.assertEqual(catalog["capabilities"]["status_reader"]["requirements"],
                         [{"tool": "python", "minimum": "3.8.0"}])
        self.assertEqual(catalog["capabilities"]["codex_agents"]["requirements"],
                         [{"tool": "python", "minimum": "3.11.0"}])
        self.assertIn({"tool": "node", "minimum": "22.19.0"}, catalog["runtimes"]["pi"]["native_package"]["requirements"])
        for runtime in ["claude", "codex", "opencode", "pi"]:
            tools = {item["tool"] for item in catalog["runtimes"][runtime]["native_package"]["requirements"]}
            self.assertFalse(tools & {"python", "go", "gh", "context7", "gpt_space", "obsidian"})

    def test_codex_windows_cli_does_not_prove_beta_posix_plugin_support(self):
        report = STATUS.build_report("codex", root=self.base / "selected", env=self.env,
            home=self.home, cwd=self.cwd, platform="win32", which=lambda name: "/native/codex" if name == "codex" else None,
            probe=lambda argv, **kwargs: {"status": "available", "version": "0.162.1", "code": "version_observed"})
        capability = report["runtimes"]["codex"]["capabilities"]["native_package"]
        self.assertEqual(capability["status"], "unknown")

    def test_pi_runtime_requires_supported_node_and_pi_versions(self):
        for node, pi, expected in [("22.18.0", "1.3.0", "unavailable"),
                                   ("22.19.0", "1.2.0", "unavailable"),
                                   ("22.19.0", "1.3.0", "requirements_met")]:
            def version(argv, **unused):
                return {"status": "available", "version": node if argv[0].endswith("node") else pi,
                        "code": "version_observed"}
            report = STATUS.build_report("pi", env=self.env, home=self.home, cwd=self.cwd,
                which=lambda name: "/native/" + name if name in {"pi", "node"} else None, probe=version)
            self.assertEqual(report["runtimes"]["pi"]["capabilities"]["native_package"]["status"], expected)

    def test_pi_node_probe_ambiguity_remains_unknown(self):
        for code in ["probe_timeout", "probe_output_limit", "version_unrecognized"]:
            with self.subTest(code=code):
                def version(argv, **unused):
                    return {"status": "unknown", "code": code} if argv[0].endswith("node") else {
                        "status": "available", "version": "1.3.0", "code": "version_observed"}
                report = STATUS.build_report("pi", env=self.env, home=self.home, cwd=self.cwd,
                    which=lambda name: "/native/" + name if name in {"pi", "node"} else None, probe=version)
                capability = report["runtimes"]["pi"]["capabilities"]["native_package"]
                self.assertEqual(capability["status"], "unknown")
                self.assertEqual(capability["code"], "pi_node_version_unverified")
                self.assertIn("node --version", capability["next_step"])

    def test_missing_executable_is_reported_without_invoking_a_shell(self):
        result = STATUS.probe_version([str(self.base / "missing")], timeout=0.2)
        self.assertEqual(result["code"], "executable_missing")

    def test_probe_uses_literal_arguments_and_closed_stdin(self):
        argument = "$(touch never);&" + CANARY
        argv = self.fixture("import sys\nassert sys.stdin.read() == ''\nassert sys.argv[1] == " + repr(argument) +
                            "\nprint('Tool 1.2.3')\n")
        result = STATUS.probe_version(argv + [argument])
        self.assertEqual(result["version"], "1.2.3")
        self.assertNotIn(CANARY, json.dumps(result))
        self.assertFalse((self.base / "never").exists())

    def test_probe_failure_never_exports_streams_or_exception_details(self):
        argv = self.fixture("import sys\nprint(" + repr(CANARY) + ")\nprint(" + repr(CANARY) +
                            ", file=sys.stderr)\nsys.exit(1)\n")
        result = STATUS.probe_version(argv)
        self.assertEqual(result["code"], "probe_failed")
        self.assertNotIn(CANARY, json.dumps(result))

    def test_probe_rejects_output_without_a_version(self):
        result = STATUS.probe_version(self.fixture("print(" + repr(CANARY) + ")\n"))
        self.assertEqual(result["code"], "version_unrecognized")
        self.assertNotIn(CANARY, json.dumps(result))

    def test_python_probe_requires_python_identity_in_its_version_output(self):
        try:
            result = STATUS.probe_version(self.fixture("print('node 22.19.0')\n"), python_only=True)
        except TypeError:
            self.fail("Python discovery cannot distinguish a non-Python version response")
        self.assertEqual(result["code"], "version_unrecognized")
        result = STATUS.probe_version(self.fixture("print('Python 3.11.9')\n"), python_only=True)
        self.assertEqual(result["version"], "3.11.9")

    def test_probe_timeout_kills_a_term_resistant_child_within_bound(self):
        argv = self.fixture("import signal,time\nsignal.signal(signal.SIGTERM, signal.SIG_IGN)\ntime.sleep(30)\n")
        started = time.monotonic()
        result = STATUS.probe_version(argv, timeout=0.2)
        self.assertEqual(result["code"], "probe_timeout")
        self.assertLess(time.monotonic() - started, 3.0)

    def test_stdout_and_stderr_overflow_stop_capture_and_never_export_bytes(self):
        for stream in ["stdout", "stderr"]:
            argv = self.fixture("import sys,time\nsys." + stream + ".write(" + repr(CANARY) +
                                " * 10000)\nsys." + stream + ".flush()\ntime.sleep(30)\n")
            started = time.monotonic()
            result = STATUS.probe_version(argv, output_limit=128, timeout=1.0)
            self.assertEqual(result["code"], "probe_output_limit")
            self.assertLess(time.monotonic() - started, 3.0)
            self.assertNotIn(CANARY, json.dumps(result))

    def test_python_discovery_uses_verified_alternative_and_rejects_wrong_versions(self):
        versions = {"/native/python3": "2.7.18", "/native/python": "3.11.9"}
        def version(argv, **unused):
            self.assertEqual(argv[1:], ["--version"])
            return {"status": "available", "version": versions[argv[0]], "code": "version_observed"}
        result = STATUS.discover_python((3, 11, 0), platform="linux", env=self.env,
            which=lambda name: "/native/" + name if name in {"python3", "python"} else None, probe=version)
        self.assertEqual(result["argv"], ["/native/python"])
        self.assertEqual(result["version"], "3.11.9")

    def test_windows_launcher_retains_required_minus_three_argument(self):
        def version(argv, **unused):
            self.assertEqual(argv, ["/native/py", "-3", "--version"])
            return {"status": "available", "version": "3.13.2", "code": "version_observed"}
        result = STATUS.discover_python((3, 11, 0), platform="win32", env=self.env,
            which=lambda name: "/native/py" if name == "py" else None, probe=version)
        self.assertEqual(result["argv"], ["/native/py", "-3"])

    def test_python_discovery_continues_after_timeout_and_excessive_output(self):
        for code in ["probe_timeout", "probe_output_limit"]:
            def version(argv, **unused):
                return {"status": "unknown", "code": code} if argv[0].endswith("python3") else {
                    "status": "available", "version": "3.10.1", "code": "version_observed"}
            result = STATUS.discover_python((3, 8, 0), platform="linux", env=self.env,
                which=lambda name: "/native/" + name, probe=version)
            self.assertEqual(result["argv"], ["/native/python"])

    def test_no_suitable_interpreter_remains_an_optional_unavailable_capability(self):
        result = STATUS.discover_python((3, 11, 0), platform="linux", env=self.env,
            which=lambda name: None)
        self.assertEqual(result["status"], "unavailable")
        self.assertIn("next_step", result)

    def test_runtime_probes_use_fixed_version_commands_and_continue_after_failure(self):
        observed = []
        def version(argv, **unused):
            observed.append(argv)
            return {"status": "unknown", "code": "probe_timeout"} if argv[0] == "/native/claude" else {
                "status": "available", "version": "1.3.0", "code": "version_observed"}
        report = STATUS.build_report("codex", all_runtimes=True, env=self.env, home=self.home, cwd=self.cwd,
            which=lambda name: "/native/" + name if name in {"claude", "codex", "opencode", "pi", "node"} else None,
            probe=version)
        self.assertEqual(report["runtimes"]["claude"]["cli"]["code"], "probe_timeout")
        self.assertEqual(report["runtimes"]["codex"]["cli"]["status"], "available")
        self.assertTrue(observed)
        self.assertTrue(all(argv[1:] == ["--version"] for argv in observed))

    def test_cli_emits_json_without_reading_personal_roots_or_changing_files(self):
        root = self.base / "selected"
        self.write(root / ".team-harness.json", {"secret": CANARY})
        before = self.snapshot()
        env = {**os.environ, "PATH": "", "HOME": str(self.home), "USERPROFILE": str(self.home),
               "PYTHONDONTWRITEBYTECODE": "1"}
        result = subprocess.run([sys.executable, str(HELPER), "--runtime", "codex", "--root", str(root)],
                                cwd=self.cwd, env=env, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["schema_version"], 1)
        self.assertEqual(report["runtimes"]["codex"]["configuration"]["status"], "valid_object")
        self.assertEqual(result.stderr, "")
        self.assertNotIn(CANARY, result.stdout)
        self.assertEqual(self.snapshot(), before)

    def test_cli_rejects_invalid_input_without_echoing_it(self):
        result = subprocess.run([sys.executable, str(HELPER), "--runtime", "codex", "--root", CANARY],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 2)
        self.assertNotIn(CANARY, result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout)["code"], "invalid_config_root")


if __name__ == "__main__":
    unittest.main()
