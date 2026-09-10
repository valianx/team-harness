#!/usr/bin/env python3
"""Behavioral tests for the single-pass Codex update convergence helper."""

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
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "plugins/team-harness"
CONVERGE_SOURCE = PLUGIN / "skills/update/scripts/converge.py"
PLUGIN_VERSION = json.loads((PLUGIN / ".codex-plugin/plugin.json").read_text(encoding="utf-8"))["version"]


def load_converge():
    spec = importlib.util.spec_from_file_location("test_converge", CONVERGE_SOURCE)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONVERGE = load_converge()
CODEX_BIN = str(Path(sys.executable).resolve())


class FakeCodex:
    def __init__(self, *, features: dict[str, bool] | None = None, mcp: object | None = None) -> None:
        self.features = features or {"multi_agent": True, "multi_agent_v2": True}
        self.mcp = [] if mcp is None else mcp
        self.calls: list[tuple[str, ...]] = []
        self.fail_enable = False
        self.invalid_features = False

    def __call__(self, argv: list[str]) -> str:
        call = tuple(argv)
        self.calls.append(call)
        if call == (CODEX_BIN, "features", "list"):
            if self.invalid_features:
                return "not-a-feature-table\n"
            return "".join(
                f"{name:<40} stable             {'true' if enabled else 'false'}\n"
                for name, enabled in self.features.items()
            )
        if len(call) == 4 and call[:3] == (CODEX_BIN, "features", "enable"):
            if self.fail_enable:
                raise CONVERGE.ConvergenceError("NATIVE_COMMAND_FAILED")
            self.features[call[3]] = True
            return ""
        if call == (CODEX_BIN, "mcp", "list", "--json"):
            return json.dumps(self.mcp)
        raise AssertionError(f"unexpected native call: {call}")


class ConvergenceFixture(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="th-update-converge-")
        # Windows runners may expose TEMP through an 8.3 alias (RUNNER~1).
        # Supply the canonical snapshot path required by the real updater.
        self.base = Path(self.temp.name).resolve()
        self.codex_home = self.base / "codex"
        self.plugin = self.codex_home / "plugins/cache/team-harness/team-harness" / PLUGIN_VERSION
        (self.plugin / ".codex-plugin").mkdir(parents=True)
        shutil.copy2(PLUGIN / ".codex-plugin/plugin.json", self.plugin / ".codex-plugin/plugin.json")
        shutil.copytree(PLUGIN / "hooks", self.plugin / "hooks")
        shutil.copytree(PLUGIN / "skills/setup", self.plugin / "skills/setup")
        shutil.copytree(PLUGIN / "skills/update/scripts", self.plugin / "skills/update/scripts")
        self.project = self.base / "project"
        self.project.mkdir()
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
        self.temp.cleanup()

    def args(self, *, runtime_approval: str | None = None, escalation_domain: str | None = None) -> argparse.Namespace:
        return argparse.Namespace(
            old_plugin=str(self.plugin),
            old_version=PLUGIN_VERSION,
            new_plugin=str(self.plugin),
            new_version=PLUGIN_VERSION,
            codex_bin=CODEX_BIN,
            runtime_approval=runtime_approval,
            escalation_domain=escalation_domain,
            expected_mcp=[],
        )

    def converge(self, native: FakeCodex, *, authorize_runtime: bool = False) -> dict[str, object]:
        approval = None
        if authorize_runtime:
            helpers = CONVERGE.load_helpers(self.plugin)
            state = helpers["runtime"].classify()
            approval = CONVERGE.runtime_pending_decision(
                state,
                PLUGIN_VERSION,
                old_plugin=self.plugin,
                new_plugin=self.plugin,
                snapshot_digest=CONVERGE.snapshot_identity(self.plugin),
            )["approvalFingerprint"]
        receipt = CONVERGE.run_convergence(self.args(runtime_approval=approval), native_runner=native)
        return CONVERGE.validate_receipt(receipt)

    def test_pending_approval_then_authorized_pass_then_current_fast_path(self) -> None:
        native = FakeCodex()
        pending = self.converge(native)
        self.assertEqual(pending["status"], "pending-approval")
        self.assertEqual(pending["domains"]["runtime"]["status"], "pending")
        self.assertIn("config", pending["changedDomains"])
        self.assertIn("agents", pending["changedDomains"])
        self.assertIsInstance(pending["pendingDecision"], dict)

        authorized = self.converge(native, authorize_runtime=True)
        self.assertEqual(authorized["status"], "converged")
        self.assertEqual(authorized["changedDomains"], ["runtime"])
        self.assertTrue(authorized["restartRequired"])

        native.calls.clear()
        current = self.converge(native)
        self.assertEqual(current["status"], "current")
        self.assertEqual(current["changedDomains"], [])
        self.assertEqual(
            native.calls,
            [(CODEX_BIN, "features", "list"), (CODEX_BIN, "mcp", "list", "--json")],
        )

    def test_declined_runtime_can_remain_pending_without_a_prescribed_command(self) -> None:
        receipt = self.converge(FakeCodex())
        self.assertEqual(receipt["status"], "pending-approval")
        self.assertEqual(receipt["recoveryInvocation"], "$team-harness:update")
        runtime_text = (self.codex_home / "config.toml").read_text(encoding="utf-8")
        self.assertNotIn("sandbox_mode", runtime_text)

    def test_missing_windows_symlink_privilege_preserves_bridge_and_checks_all_domains(self) -> None:
        self.converge(FakeCodex(), authorize_runtime=True)
        args = self.args()
        args.old_plugin = str(self.plugin.with_name("0.0.0"))
        args.old_version = "0.0.0"
        denied = OSError(errno.EINVAL, "controlled symlink privilege failure")
        denied.winerror = 1314
        native = FakeCodex()
        with mock.patch.object(Path, "symlink_to", side_effect=denied):
            receipt = CONVERGE.validate_receipt(CONVERGE.run_convergence(args, native_runner=native))
        self.assertEqual(receipt["status"], "current")
        self.assertIsNone(receipt["failedDomain"])
        self.assertEqual(receipt["domains"]["bridge"], {
            "status": "preserved",
            "bridgeStatus": "skipped-symlink-privilege",
            "restartRequired": False,
        })
        self.assertFalse(receipt["restartRequired"])
        self.assertEqual(receipt["changedDomains"], [])
        for name in CONVERGE.DOMAIN_NAMES[1:]:
            self.assertEqual(receipt["domains"][name]["status"], "current", name)
        self.assertFalse(os.path.lexists(args.old_plugin))
        self.assertEqual(list(self.plugin.parent.glob(".*.team-harness-link-*")), [])
        self.assertIn((CODEX_BIN, "mcp", "list", "--json"), native.calls)

    def test_existing_alias_path_is_preserved_without_claiming_restart(self) -> None:
        self.converge(FakeCodex(), authorize_runtime=True)
        args = self.args()
        old_plugin = self.plugin.with_name("0.0.0")
        old_plugin.write_text("operator-owned alias placeholder", encoding="utf-8")
        args.old_plugin = str(old_plugin)
        args.old_version = "0.0.0"

        receipt = CONVERGE.validate_receipt(
            CONVERGE.run_convergence(args, native_runner=FakeCodex())
        )

        self.assertEqual(receipt["status"], "current")
        self.assertFalse(receipt["restartRequired"])
        self.assertEqual(receipt["domains"]["bridge"], {
            "status": "preserved",
            "bridgeStatus": "skipped-existing-path",
            "restartRequired": False,
        })
        self.assertEqual(
            old_plugin.read_text(encoding="utf-8"),
            "operator-owned alias placeholder",
        )

    def test_real_feature_change_still_propagates_restart_requirement(self) -> None:
        native = FakeCodex(features={"multi_agent": False, "multi_agent_v2": True})
        receipt = self.converge(native, authorize_runtime=True)

        self.assertEqual(receipt["domains"]["features"]["status"], "changed")
        self.assertTrue(receipt["domains"]["features"]["restartRequired"])
        self.assertTrue(receipt["restartRequired"])

    def test_real_agent_change_still_propagates_restart_requirement(self) -> None:
        self.converge(FakeCodex(), authorize_runtime=True)
        agent = self.codex_home / "agents" / "architect.toml"
        agent.unlink()

        receipt = self.converge(FakeCodex())

        self.assertEqual(receipt["domains"]["agents"]["status"], "changed")
        self.assertTrue(receipt["domains"]["agents"]["restartRequired"])
        self.assertTrue(receipt["restartRequired"])

    def test_unmanaged_alias_is_reported_without_claiming_restart(self) -> None:
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
        self.assertFalse(result["restartRequired"])
        self.assertTrue(old_plugin.is_dir())

    def test_bridge_permission_and_unknown_errors_still_fail_closed(self) -> None:
        args = self.args()
        args.old_plugin = str(self.plugin.with_name("0.0.0"))
        args.old_version = "0.0.0"
        for error, code, retry in (
            (PermissionError(errno.EACCES, "protected cache"), "WRITE_PROTECTED", True),
            (OSError(errno.EIO, "unknown filesystem failure"), "DOMAIN_FAILED", False),
        ):
            with self.subTest(code=code), mock.patch.object(Path, "symlink_to", side_effect=error):
                receipt = CONVERGE.validate_receipt(CONVERGE.run_convergence(args, native_runner=FakeCodex()))
                self.assertEqual(receipt["status"], "partial-convergence")
                self.assertEqual(receipt["failedDomain"], "bridge")
                self.assertEqual(receipt["domains"]["bridge"]["errorCode"], code)
                self.assertEqual(receipt["domains"]["bridge"]["retryWithEscalation"], retry)
                self.assertEqual(receipt["domains"]["config"]["status"], "not-run")

    def test_config_retry_preserves_optional_bridge_without_writing_outside_scope(self) -> None:
        self.converge(FakeCodex(), authorize_runtime=True)
        settings = self.codex_home / ".team-harness.json"
        settings.write_text("{}", encoding="utf-8")
        args = self.args(escalation_domain="config")
        args.old_plugin = str(self.plugin.with_name("0.0.0"))
        args.old_version = "0.0.0"
        with mock.patch.object(Path, "symlink_to", side_effect=AssertionError("bridge must remain read-only")):
            receipt = CONVERGE.validate_receipt(CONVERGE.run_convergence(args, native_runner=FakeCodex()))
        self.assertEqual(receipt["status"], "converged")
        self.assertEqual(receipt["changedDomains"], ["config"])
        self.assertEqual(receipt["domains"]["bridge"]["bridgeStatus"], "skipped-read-only")
        self.assertFalse(receipt["restartRequired"])
        self.assertEqual(receipt["domains"]["hooks"]["status"], "current")
        self.assertFalse(os.path.lexists(args.old_plugin))

    def test_native_missing_old_snapshot_bridge_reports_optional_alias_omission(self) -> None:
        self.converge(FakeCodex(), authorize_runtime=True)
        args = self.args()
        args.old_plugin = str(self.plugin.with_name("0.0.0"))
        args.old_version = "0.0.0"
        receipt = CONVERGE.validate_receipt(CONVERGE.run_convergence(args, native_runner=FakeCodex()))
        self.assertIsNone(receipt["failedDomain"])
        bridge = receipt["domains"]["bridge"]
        if bridge["bridgeStatus"] == "skipped-symlink-privilege":
            self.assertEqual(os.name, "nt")
            self.assertFalse(receipt["restartRequired"])
            self.assertFalse(os.path.lexists(args.old_plugin))
        else:
            self.assertEqual(bridge["bridgeStatus"], "linked")
            self.assertEqual(Path(args.old_plugin).resolve(), self.plugin.resolve())
        self.assertEqual(receipt["domains"]["hooks"]["status"], "current")

    def test_feature_repair_is_conditional_and_verified(self) -> None:
        native = FakeCodex(features={"multi_agent": False, "multi_agent_v2": True})
        receipt = self.converge(native, authorize_runtime=True)
        self.assertEqual(receipt["domains"]["features"]["status"], "changed")
        self.assertEqual(receipt["domains"]["features"]["changed"], ["multi_agent"])
        self.assertEqual(native.calls.count((CODEX_BIN, "features", "enable", "multi_agent")), 1)
        self.assertEqual(native.calls.count((CODEX_BIN, "features", "list")), 2)
        parsed = CONVERGE.parse_features(
            "multi_agent                            under development  true\n"
            "multi_agent_v2                         stable             true\n"
        )
        self.assertTrue(parsed["multi_agent"])

    def test_partial_failure_preserves_completed_work_and_rerun_resumes(self) -> None:
        failing = FakeCodex(features={"multi_agent": False, "multi_agent_v2": True})
        failing.fail_enable = True
        partial = self.converge(failing)
        self.assertEqual(partial["status"], "partial-convergence")
        self.assertEqual(partial["failedDomain"], "features")
        self.assertIn("config", partial["changedDomains"])
        self.assertEqual(partial["domains"]["runtime"]["status"], "pending")

        repaired = FakeCodex(features={"multi_agent": False, "multi_agent_v2": True})
        resumed = self.converge(repaired, authorize_runtime=True)
        self.assertEqual(resumed["status"], "converged")
        self.assertNotIn("config", resumed["changedDomains"])
        self.assertIn("features", resumed["changedDomains"])
        self.assertTrue(resumed["restartRequired"])

    def test_malformed_native_output_and_unsafe_hook_are_bounded_failures(self) -> None:
        malformed = FakeCodex()
        malformed.invalid_features = True
        failed = self.converge(malformed)
        self.assertEqual(failed["failedDomain"], "features")
        self.assertEqual(failed["domains"]["features"]["errorCode"], "FEATURE_LIST_INVALID")

        self.converge(FakeCodex(), authorize_runtime=True)
        hooks = self.plugin / "hooks/hooks.json"
        target = self.base / "unsafe-hooks.json"
        target.write_text("{}", encoding="utf-8")
        hooks.unlink()
        hooks.symlink_to(target)
        unsafe = self.converge(FakeCodex())
        self.assertEqual(unsafe["failedDomain"], "preflight")
        self.assertEqual(unsafe["domains"]["bridge"]["errorCode"], "SNAPSHOT_COMPONENT_SYMLINK")

    def test_protected_config_target_requests_exact_retry_escalation(self) -> None:
        load_helpers = CONVERGE.load_helpers

        def helpers_with_protected_config(plugin: Path):
            helpers = load_helpers(plugin)

            def deny_write(*_args, **_kwargs):
                raise PermissionError(errno.EACCES, "controlled write failure")

            helpers["config"].write_atomic = deny_write
            return helpers

        with mock.patch.object(CONVERGE, "load_helpers", side_effect=helpers_with_protected_config):
            receipt = self.converge(FakeCodex())
        self.assertEqual(receipt["failedDomain"], "config")
        self.assertEqual(receipt["domains"]["config"]["errorCode"], "WRITE_PROTECTED")
        self.assertTrue(receipt["domains"]["config"]["retryWithEscalation"])

    def test_operator_owned_opaque_values_are_preserved_and_redacted(self) -> None:
        secret = "github_pat_this-must-never-appear"
        settings = self.codex_home / ".team-harness.json"
        settings.write_text(json.dumps({"opaque": {"token": secret}}), encoding="utf-8")
        receipt = self.converge(FakeCodex())
        self.assertNotIn(secret, json.dumps(receipt))
        persisted = json.loads(settings.read_text(encoding="utf-8"))
        self.assertEqual(persisted["opaque"]["token"], secret)

    def test_receipt_validator_rejects_open_or_incomplete_shapes(self) -> None:
        receipt = self.converge(FakeCodex())
        incomplete = dict(receipt)
        incomplete.pop("domains")
        with self.assertRaisesRegex(CONVERGE.ConvergenceError, "RECEIPT_SCHEMA_INVALID"):
            CONVERGE.validate_receipt(incomplete)
        open_shape = dict(receipt)
        open_shape["unexpected"] = True
        with self.assertRaisesRegex(CONVERGE.ConvergenceError, "RECEIPT_SCHEMA_INVALID"):
            CONVERGE.validate_receipt(open_shape)
        nested_open = json.loads(json.dumps(receipt))
        nested_open["domains"]["hooks"]["unexpected"] = True
        with self.assertRaisesRegex(CONVERGE.ConvergenceError, "RECEIPT_SCHEMA_INVALID"):
            CONVERGE.validate_receipt(nested_open)

    def test_snapshot_components_and_hook_identity_reject_tampering(self) -> None:
        hooks = self.plugin / "hooks"
        real_hooks = self.plugin / "hooks-real"
        hooks.rename(real_hooks)
        hooks.symlink_to(real_hooks, target_is_directory=True)
        linked = self.converge(FakeCodex())
        self.assertEqual(linked["failedDomain"], "preflight")
        self.assertEqual(linked["domains"]["bridge"]["errorCode"], "SNAPSHOT_COMPONENT_SYMLINK")

        hooks.unlink()
        real_hooks.rename(hooks)
        manifest = hooks / "hooks.json"
        manifest.write_text(manifest.read_text(encoding="utf-8") + "\n", encoding="utf-8")
        tampered = self.converge(FakeCodex())
        self.assertEqual(tampered["failedDomain"], "hooks")
        self.assertEqual(tampered["domains"]["hooks"]["errorCode"], "HOOK_ARTIFACT_IDENTITY_MISMATCH")

    def test_runtime_approval_is_bound_to_exact_pending_delta(self) -> None:
        receipt = CONVERGE.run_convergence(
            self.args(runtime_approval="0" * 64),
            native_runner=FakeCodex(),
        )
        receipt = CONVERGE.validate_receipt(receipt)
        self.assertEqual(receipt["failedDomain"], "runtime")
        self.assertEqual(receipt["domains"]["runtime"]["errorCode"], "RUNTIME_APPROVAL_MISMATCH")

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

    def test_escalated_retry_cannot_write_a_second_domain(self) -> None:
        self.converge(FakeCodex(), authorize_runtime=True)
        native = FakeCodex(features={"multi_agent": False, "multi_agent_v2": True})
        receipt = CONVERGE.run_convergence(
            self.args(escalation_domain="config"),
            native_runner=native,
        )
        receipt = CONVERGE.validate_receipt(receipt)
        self.assertEqual(receipt["failedDomain"], "features")
        self.assertEqual(receipt["domains"]["features"]["errorCode"], "ESCALATION_SCOPE_EXCEEDED")
        self.assertNotIn((CODEX_BIN, "features", "enable", "multi_agent"), native.calls)

    def test_mcp_parser_rejects_unknown_native_fields(self) -> None:
        native = FakeCodex(mcp=[{
            "name": "docs",
            "enabled": True,
            "transport": {"type": "stdio", "command": "server", "args": []},
            "unexpected": "opaque",
        }])
        receipt = self.converge(native, authorize_runtime=True)
        self.assertEqual(receipt["failedDomain"], "mcp")
        self.assertEqual(receipt["domains"]["mcp"]["errorCode"], "MCP_LIST_INVALID")

    def test_helper_integrity_is_verified_before_import(self) -> None:
        helper = self.plugin / "skills/setup/scripts/manage_agents.py"
        helper.write_text(helper.read_text(encoding="utf-8") + "\n", encoding="utf-8")
        receipt = self.converge(FakeCodex())
        self.assertEqual(receipt["failedDomain"], "preflight")
        self.assertEqual(receipt["domains"]["bridge"]["errorCode"], "HELPER_IDENTITY_MISMATCH")

    def test_relative_codex_binary_is_rejected_before_execution(self) -> None:
        args = self.args()
        args.codex_bin = "true"
        receipt = CONVERGE.validate_receipt(CONVERGE.run_convergence(args, native_runner=FakeCodex()))
        self.assertEqual(receipt["failedDomain"], "preflight")
        self.assertEqual(receipt["domains"]["bridge"]["errorCode"], "CODEX_BINARY_INVALID")

    def test_runtime_approval_is_bound_to_snapshot_content(self) -> None:
        pending = self.converge(FakeCodex())
        approval = pending["pendingDecision"]["approvalFingerprint"]
        converger = self.plugin / "skills/update/scripts/converge.py"
        converger.write_text(converger.read_text(encoding="utf-8") + "\n", encoding="utf-8")
        receipt = CONVERGE.validate_receipt(CONVERGE.run_convergence(
            self.args(runtime_approval=approval),
            native_runner=FakeCodex(),
        ))
        self.assertEqual(receipt["failedDomain"], "runtime")
        self.assertEqual(receipt["domains"]["runtime"]["errorCode"], "RUNTIME_APPROVAL_MISMATCH")

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

    def test_agent_cli_installs_every_bundled_role_and_repairs_missing_verifier(self) -> None:
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
                self.assertTrue(installed["restartRequired"])
                for row in installed["agents"]:
                    self.assertEqual(row["status"], "current")
                    self.assertEqual(Path(row["path"]).read_bytes(), expected[row["role"]])
                verifier = Path(installed["directory"]) / "pr-review-verifier.toml"
                verifier.unlink()
                repaired = run("sync")
                self.assertEqual(repaired["changed"], ["pr-review-verifier"])
                self.assertTrue(repaired["restartRequired"])
                self.assertEqual(verifier.read_bytes(), expected["pr-review-verifier"])
                current = run("sync")
                self.assertEqual(current["changed"], [])
                self.assertFalse(current["restartRequired"])

    def test_existing_helper_clis_remain_compatible(self) -> None:
        env = os.environ.copy()
        scripts = self.plugin / "skills/setup/scripts"
        commands = [
            [sys.executable, str(scripts / "manage_config.py"), "ensure", "--version", PLUGIN_VERSION],
            [sys.executable, str(scripts / "manage_runtime.py"), "inspect"],
            [sys.executable, str(scripts / "manage_agents.py"), "inspect", "--scope", "global"],
        ]
        for command in commands:
            result = subprocess.run(command, env=env, text=True, capture_output=True, timeout=20, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIsInstance(json.loads(result.stdout), dict)


if __name__ == "__main__":
    unittest.main()
