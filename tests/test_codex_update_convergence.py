#!/usr/bin/env python3
"""Behavioral tests for the Codex update convergence helper.

The updater owns Team Harness configuration and role files.  Codex's native
runtime policy and native feature switches remain outside its write scope.
"""

from __future__ import annotations

import argparse
import errno
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import unittest
import uuid
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "plugins/team-harness"
CONVERGE_SOURCE = PLUGIN / "skills/update/scripts/converge.py"
PLUGIN_VERSION = json.loads(
    (PLUGIN / ".codex-plugin/plugin.json").read_text(encoding="utf-8")
)["version"]


def load_converge():
    spec = importlib.util.spec_from_file_location("test_converge", CONVERGE_SOURCE)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONVERGE = load_converge()
CODEX_BIN = str(Path(sys.executable).resolve())


class FakeCodex:
    """Expose only the native read used by the current updater."""

    def __init__(self, *, mcp: object | None = None) -> None:
        self.mcp = [] if mcp is None else mcp
        self.calls: list[tuple[str, ...]] = []

    def __call__(self, argv: list[str]) -> str:
        call = tuple(argv)
        self.calls.append(call)
        if len(call) >= 2 and call[1] == "features":
            raise AssertionError("update must not inspect or mutate native features")
        if call == (CODEX_BIN, "mcp", "list", "--json"):
            return json.dumps(self.mcp)
        raise AssertionError(f"unexpected native call: {call}")


class ConvergenceFixture(unittest.TestCase):
    def setUp(self) -> None:
        # The managed Windows test host denies child creation below its system
        # TEMP ACL.  Use Codex's writable scratch root for ephemeral fixtures.
        scratch = Path.home() / ".codex" / "tmp"
        scratch.mkdir(parents=True, exist_ok=True)
        self.base = scratch / f"th-update-converge-{uuid.uuid4().hex}"
        self.base.mkdir()
        self.codex_home = self.base / "codex"
        self.plugin = self.codex_home / "plugins/cache/team-harness/team-harness" / PLUGIN_VERSION
        (self.plugin / ".codex-plugin").mkdir(parents=True)
        shutil.copy2(PLUGIN / ".codex-plugin/plugin.json", self.plugin / ".codex-plugin/plugin.json")
        ignore = shutil.ignore_patterns("__pycache__")
        shutil.copytree(PLUGIN / "skills/setup", self.plugin / "skills/setup", ignore=ignore)
        shutil.copytree(PLUGIN / "skills/update/scripts", self.plugin / "skills/update/scripts", ignore=ignore)
        self.project = self.base / "project"
        self.project.mkdir()
        # Keep the fixture directories writable on the managed Windows host;
        # the helper still refuses symlinks and writes files atomically.
        (self.codex_home / "agents").mkdir(parents=True, exist_ok=True)
        (self.project / ".codex" / "agents").mkdir(parents=True, exist_ok=True)
        self.old_cwd = Path.cwd()
        self.old_codex_home = os.environ.get("CODEX_HOME")
        os.environ["CODEX_HOME"] = str(self.codex_home)
        os.chdir(self.project)

    def tearDown(self) -> None:
        os.chdir(self.old_cwd)
        if self.old_codex_home is None:
            os.environ.pop("CODEX_HOME", None)
        else:
            os.environ["CODEX_HOME"] = self.old_codex_home
        shutil.rmtree(self.base, ignore_errors=True)

    def args(
        self,
        *,
        escalation_domain: str | None = None,
        expected_mcp: tuple[str, ...] = (),
    ) -> argparse.Namespace:
        return argparse.Namespace(
            old_plugin=str(self.plugin),
            old_version=PLUGIN_VERSION,
            new_plugin=str(self.plugin),
            new_version=PLUGIN_VERSION,
            codex_bin=CODEX_BIN,
            escalation_domain=escalation_domain,
            expected_mcp=list(expected_mcp),
        )

    def converge(
        self,
        native: FakeCodex,
        *,
        escalation_domain: str | None = None,
        expected_mcp: tuple[str, ...] = (),
    ) -> dict[str, object]:
        receipt = CONVERGE.run_convergence(
            self.args(escalation_domain=escalation_domain, expected_mcp=expected_mcp),
            native_runner=native,
        )
        return CONVERGE.validate_receipt(receipt)

    def test_first_update_and_current_fast_path_have_only_real_domains(self) -> None:
        native = FakeCodex()
        first = self.converge(native)
        self.assertEqual(first["status"], "converged")
        self.assertEqual(first["changedDomains"], ["config", "agents"])
        self.assertEqual(tuple(first["domains"]), CONVERGE.DOMAIN_NAMES)
        self.assertNotIn("restartRequired", json.dumps(first))
        self.assertNotIn("features", json.dumps(first))
        self.assertNotIn("hooks", json.dumps(first))

        native.calls.clear()
        current = self.converge(native)
        self.assertEqual(current["status"], "current")
        self.assertEqual(current["changedDomains"], [])
        self.assertEqual(native.calls, [(CODEX_BIN, "mcp", "list", "--json")])

    def test_native_codex_config_is_byte_for_byte_preserved(self) -> None:
        native_config = self.codex_home / "config.toml"
        original = (
            "model = \"operator-selected\"\n"
            "model_reasoning_effort = \"xhigh\"\n"
            "sandbox_mode = \"workspace-write\"\n"
            "approval_policy = \"on-request\"\n"
            "network_access = false\n"
            "project_doc_fallback_filenames = [\"AGENTS.md\", \"CLAUDE.md\"]\n"
        )
        original_bytes = original.encode("utf-8")
        native_config.write_bytes(original_bytes)

        receipt = self.converge(FakeCodex())

        self.assertEqual(native_config.read_bytes(), original_bytes)
        self.assertEqual(receipt["domains"]["agents"]["status"], "changed")
        self.assertEqual(receipt["domains"]["agents"]["scope"], "global")
        self.assertNotIn("restartRequired", json.dumps(receipt["domains"]["agents"]))

    def test_disabled_native_features_are_never_queried_or_enabled(self) -> None:
        native = FakeCodex()
        receipt = self.converge(native)

        self.assertEqual(receipt["status"], "converged")
        self.assertFalse(any("features" in call for call in native.calls))

    def test_missing_agent_is_repaired_without_touching_native_config(self) -> None:
        self.converge(FakeCodex())
        native_config = self.codex_home / "config.toml"
        original = "model = \"operator-selected\"\nmodel_reasoning_effort = \"high\"\n"
        native_config.write_text(original, encoding="utf-8")
        agent = self.codex_home / "agents" / "architect.toml"
        agent.unlink()

        receipt = self.converge(FakeCodex())

        self.assertEqual(receipt["domains"]["agents"]["status"], "changed")
        self.assertEqual(receipt["domains"]["agents"]["changedCount"], 1)
        self.assertEqual(native_config.read_text(encoding="utf-8"), original)
        self.assertNotIn("restartRequired", json.dumps(receipt))

    def test_missing_windows_symlink_privilege_preserves_bridge(self) -> None:
        self.converge(FakeCodex())
        args = self.args()
        args.old_plugin = str(self.plugin.with_name("0.0.0"))
        args.old_version = "0.0.0"
        denied = OSError(errno.EINVAL, "controlled symlink privilege failure")
        denied.winerror = 1314
        native = FakeCodex()
        with mock.patch.object(Path, "symlink_to", side_effect=denied):
            receipt = CONVERGE.validate_receipt(
                CONVERGE.run_convergence(args, native_runner=native)
            )
        self.assertEqual(receipt["status"], "current")
        self.assertEqual(receipt["domains"]["bridge"], {
            "status": "preserved",
            "bridgeStatus": "skipped-symlink-privilege",
        })
        self.assertEqual(receipt["changedDomains"], [])
        self.assertNotIn("restartRequired", json.dumps(receipt))
        self.assertIn((CODEX_BIN, "mcp", "list", "--json"), native.calls)

    def test_existing_alias_path_is_preserved_without_restart_claim(self) -> None:
        self.converge(FakeCodex())
        old_plugin = self.plugin.with_name("0.0.0")
        old_plugin.write_text("operator-owned alias placeholder", encoding="utf-8")
        args = self.args()
        args.old_plugin = str(old_plugin)
        args.old_version = "0.0.0"

        receipt = CONVERGE.validate_receipt(
            CONVERGE.run_convergence(args, native_runner=FakeCodex())
        )

        self.assertEqual(receipt["status"], "current")
        self.assertEqual(receipt["domains"]["bridge"], {
            "status": "preserved",
            "bridgeStatus": "skipped-existing-path",
        })
        self.assertEqual(old_plugin.read_text(encoding="utf-8"), "operator-owned alias placeholder")
        self.assertNotIn("restartRequired", json.dumps(receipt))

    def test_unmanaged_alias_fails_closed_without_restart_metadata(self) -> None:
        helpers = CONVERGE.load_helpers(self.plugin)
        old_plugin = self.plugin.with_name("0.0.0")
        old_plugin.mkdir()
        external_target = self.base / "operator-owned-plugin"

        with (
            mock.patch.object(Path, "is_symlink", return_value=True),
            mock.patch.object(helpers["bridge"], "link_target", return_value=external_target),
        ):
            result = helpers["bridge"].bridge_result(old_plugin, self.plugin)

        self.assertEqual(result["status"], "skipped-unmanaged-symlink")
        self.assertNotIn("restartRequired", result)

    def test_bridge_permission_and_unknown_errors_fail_closed(self) -> None:
        args = self.args()
        args.old_plugin = str(self.plugin.with_name("0.0.0"))
        args.old_version = "0.0.0"
        for error, code, retry in (
            (PermissionError(errno.EACCES, "protected cache"), "WRITE_PROTECTED", True),
            (OSError(errno.EIO, "unknown filesystem failure"), "DOMAIN_FAILED", False),
        ):
            with self.subTest(code=code), mock.patch.object(Path, "symlink_to", side_effect=error):
                receipt = CONVERGE.validate_receipt(
                    CONVERGE.run_convergence(args, native_runner=FakeCodex())
                )
                self.assertEqual(receipt["status"], "partial-convergence")
                self.assertEqual(receipt["failedDomain"], "bridge")
                self.assertEqual(receipt["domains"]["bridge"]["errorCode"], code)
                self.assertEqual(receipt["domains"]["bridge"]["retryWithEscalation"], retry)
                self.assertEqual(receipt["domains"]["config"]["status"], "not-run")

    def test_config_retry_preserves_optional_bridge_and_stays_in_scope(self) -> None:
        self.converge(FakeCodex())
        settings = self.codex_home / ".team-harness.json"
        settings.write_text("{}", encoding="utf-8")
        args = self.args(escalation_domain="config")
        args.old_plugin = str(self.plugin.with_name("0.0.0"))
        args.old_version = "0.0.0"

        with mock.patch.object(Path, "symlink_to", side_effect=AssertionError("bridge must remain read-only")):
            receipt = CONVERGE.validate_receipt(
                CONVERGE.run_convergence(args, native_runner=FakeCodex())
            )

        self.assertEqual(receipt["status"], "converged")
        self.assertEqual(receipt["changedDomains"], ["config"])
        self.assertEqual(receipt["domains"]["bridge"]["bridgeStatus"], "skipped-read-only")
        self.assertNotIn("hooks", receipt["domains"])

    def test_native_missing_old_snapshot_reports_optional_alias_omission(self) -> None:
        args = self.args()
        args.old_plugin = str(self.plugin.with_name("0.0.0"))
        args.old_version = "0.0.0"
        receipt = CONVERGE.validate_receipt(
            CONVERGE.run_convergence(args, native_runner=FakeCodex())
        )
        self.assertIsNone(receipt["failedDomain"])
        bridge = receipt["domains"]["bridge"]
        if bridge["bridgeStatus"] == "skipped-symlink-privilege":
            self.assertFalse(os.path.lexists(args.old_plugin))
        else:
            self.assertEqual(bridge["bridgeStatus"], "linked")
            self.assertEqual(Path(args.old_plugin).resolve(), self.plugin.resolve())

    def test_partial_failure_preserves_completed_work_and_escalation_scope(self) -> None:
        # Config is allowed to converge, but a missing role cannot be repaired
        # when the retry is explicitly limited to the config domain.
        receipt = self.converge(FakeCodex(), escalation_domain="config")
        self.assertEqual(receipt["status"], "partial-convergence")
        self.assertEqual(receipt["failedDomain"], "agents")
        self.assertEqual(receipt["domains"]["agents"]["errorCode"], "ESCALATION_SCOPE_EXCEEDED")
        self.assertEqual(receipt["changedDomains"], ["config"])
        self.assertEqual(receipt["domains"]["mcp"]["status"], "not-run")

    def test_mcp_parser_rejects_unknown_native_fields(self) -> None:
        native = FakeCodex(mcp=[{
            "name": "docs",
            "enabled": True,
            "transport": {"type": "stdio", "command": "server", "args": []},
            "unexpected": "opaque",
        }])
        receipt = self.converge(native)
        self.assertEqual(receipt["failedDomain"], "mcp")
        self.assertEqual(receipt["domains"]["mcp"]["errorCode"], "MCP_LIST_INVALID")

    def test_expected_mcp_is_reported_without_mutating_native_mcp(self) -> None:
        native = FakeCodex()
        receipt = self.converge(native, expected_mcp=("docs",))
        self.assertEqual(receipt["domains"]["mcp"], {
            "status": "preserved",
            "registeredCount": 0,
            "missingExpected": ["docs"],
        })
        self.assertEqual(native.calls, [(CODEX_BIN, "mcp", "list", "--json")])

    def test_helper_integrity_is_verified_before_import(self) -> None:
        helper = self.plugin / "skills/setup/scripts/manage_agents.py"
        helper.write_text(helper.read_text(encoding="utf-8") + "\n", encoding="utf-8")
        receipt = self.converge(FakeCodex())
        self.assertEqual(receipt["failedDomain"], "preflight")
        self.assertEqual(receipt["domains"]["bridge"]["errorCode"], "HELPER_IDENTITY_MISMATCH")

    def test_relative_codex_binary_is_rejected_before_execution(self) -> None:
        args = self.args()
        args.codex_bin = "true"
        receipt = CONVERGE.validate_receipt(
            CONVERGE.run_convergence(args, native_runner=FakeCodex())
        )
        self.assertEqual(receipt["failedDomain"], "preflight")
        self.assertEqual(receipt["domains"]["bridge"]["errorCode"], "CODEX_BINARY_INVALID")

    def test_protected_config_target_requests_exact_retry_escalation(self) -> None:
        helpers = CONVERGE.load_helpers(self.plugin)

        def deny_write(*_args, **_kwargs):
            raise PermissionError(errno.EACCES, "controlled write failure")

        with mock.patch.object(helpers["config"], "write_atomic", side_effect=deny_write), \
             mock.patch.object(CONVERGE, "load_helpers", return_value=helpers):
            receipt = self.converge(FakeCodex())
        self.assertEqual(receipt["failedDomain"], "config")
        self.assertEqual(receipt["domains"]["config"]["errorCode"], "WRITE_PROTECTED")
        self.assertTrue(receipt["domains"]["config"]["retryWithEscalation"])

    def test_operator_owned_opaque_values_are_preserved_and_redacted(self) -> None:
        secret = "github_pat_this-must-never-appear"
        settings = self.codex_home / ".team-harness.json"
        settings.write_text(
            json.dumps({
                # A selector at the document root is migration metadata;
                # the same shape inside an opaque namespace belongs to its
                # owner and must survive update.
                "mode": "inline",
                "opaque": {"token": secret, "mode": "inline"},
                "retired": {
                    "lane": "pipeline",
                    "profile": "full",
                    "pipeline": {"mode": "inline", "tier": 0},
                },
            }),
            encoding="utf-8",
        )
        receipt = self.converge(FakeCodex())
        self.assertNotIn(secret, json.dumps(receipt))
        persisted = json.loads(settings.read_text(encoding="utf-8"))
        self.assertNotIn("mode", persisted)
        self.assertEqual(persisted["opaque"]["token"], secret)
        self.assertEqual(persisted["opaque"]["mode"], "inline")
        self.assertEqual(
            persisted["retired"],
            {
                "lane": "pipeline",
                "profile": "full",
                "pipeline": {"mode": "inline", "tier": 0},
            },
        )

    def test_receipt_validator_rejects_open_or_legacy_shapes(self) -> None:
        receipt = self.converge(FakeCodex())
        incomplete = dict(receipt)
        incomplete.pop("domains")
        with self.assertRaisesRegex(CONVERGE.ConvergenceError, "RECEIPT_SCHEMA_INVALID"):
            CONVERGE.validate_receipt(incomplete)
        open_shape = dict(receipt)
        open_shape["restartRequired"] = False
        with self.assertRaisesRegex(CONVERGE.ConvergenceError, "RECEIPT_SCHEMA_INVALID"):
            CONVERGE.validate_receipt(open_shape)
        nested_open = json.loads(json.dumps(receipt))
        nested_open["domains"]["bridge"]["restartRequired"] = False
        with self.assertRaisesRegex(CONVERGE.ConvergenceError, "RECEIPT_SCHEMA_INVALID"):
            CONVERGE.validate_receipt(nested_open)
        legacy_domain = json.loads(json.dumps(receipt))
        legacy_domain["domains"]["hooks"] = {"status": "current"}
        with self.assertRaisesRegex(CONVERGE.ConvergenceError, "RECEIPT_SCHEMA_INVALID"):
            CONVERGE.validate_receipt(legacy_domain)

    def test_native_output_limit_is_enforced_while_streaming(self) -> None:
        with self.assertRaisesRegex(CONVERGE.ConvergenceError, "NATIVE_COMMAND_OUTPUT_TOO_LARGE"):
            CONVERGE.run_native([
                sys.executable,
                "-c",
                f"import sys; sys.stdout.write('x' * {CONVERGE.MAX_NATIVE_OUTPUT + 1})",
            ])

    def test_native_process_group_options_are_platform_specific(self) -> None:
        self.assertEqual(
            CONVERGE.process_group_options("nt"),
            {"creationflags": CONVERGE.WINDOWS_CREATE_NEW_PROCESS_GROUP},
        )
        self.assertEqual(CONVERGE.process_group_options("posix"), {"start_new_session": True})

    def test_native_timeout_survives_early_pipe_close(self) -> None:
        previous = CONVERGE.NATIVE_TIMEOUT_SECONDS
        CONVERGE.NATIVE_TIMEOUT_SECONDS = 0.1
        try:
            with self.assertRaisesRegex(CONVERGE.ConvergenceError, "NATIVE_COMMAND_TIMEOUT"):
                CONVERGE.run_native([
                    sys.executable,
                    "-c",
                    "import os,time; os.close(1); os.close(2); time.sleep(2)",
                ])
        finally:
            CONVERGE.NATIVE_TIMEOUT_SECONDS = previous

    def test_agent_cli_installs_bundled_roles_without_restart_metadata(self) -> None:
        script = self.plugin / "skills/setup/scripts/manage_agents.py"
        bundled = self.plugin / "skills/setup/assets/agents"
        expected = {asset.stem: asset.read_bytes() for asset in bundled.glob("*.toml")}
        self.assertIn("pr-review-verifier", expected)
        for scope in ("global", "project"):
            with self.subTest(scope=scope):
                def run(command: str) -> dict[str, object]:
                    result = subprocess.run(
                        [sys.executable, str(script), command, "--scope", scope],
                        text=True, capture_output=True, timeout=20, check=False,
                    )
                    self.assertEqual(result.returncode, 0, result.stderr)
                    return json.loads(result.stdout)

                inspected = run("inspect")
                self.assertEqual({row["role"] for row in inspected["agents"]}, set(expected))
                installed = run("sync")
                self.assertEqual(set(installed["changed"]), set(expected))
                self.assertNotIn("restartRequired", installed)
                for row in installed["agents"]:
                    self.assertEqual(row["status"], "current")
                    self.assertEqual(Path(row["path"]).read_bytes(), expected[row["role"]])
                verifier = Path(installed["directory"]) / "pr-review-verifier.toml"
                verifier.unlink()
                repaired = run("sync")
                self.assertEqual(repaired["changed"], ["pr-review-verifier"])
                self.assertNotIn("restartRequired", repaired)
                self.assertEqual(verifier.read_bytes(), expected["pr-review-verifier"])
                current = run("sync")
                self.assertEqual(current["changed"], [])
                self.assertNotIn("restartRequired", current)

    def test_existing_helper_clis_remain_compatible_without_runtime_helper(self) -> None:
        scripts = self.plugin / "skills/setup/scripts"
        commands = [
            [sys.executable, str(scripts / "manage_config.py"), "ensure", "--version", PLUGIN_VERSION],
            [sys.executable, str(scripts / "manage_agents.py"), "inspect", "--scope", "global"],
        ]
        self.assertFalse((scripts / "manage_runtime.py").exists())
        for command in commands:
            result = subprocess.run(command, text=True, capture_output=True, timeout=20, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIsInstance(json.loads(result.stdout), dict)


if __name__ == "__main__":
    unittest.main()
