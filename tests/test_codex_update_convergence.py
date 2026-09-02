#!/usr/bin/env python3
"""Behavioral tests for the single-pass Codex update convergence helper."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest


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
        if call == ("codex", "features", "list"):
            if self.invalid_features:
                return "not-a-feature-table\n"
            return "".join(
                f"{name:<40} stable             {'true' if enabled else 'false'}\n"
                for name, enabled in self.features.items()
            )
        if len(call) == 4 and call[:3] == ("codex", "features", "enable"):
            if self.fail_enable:
                raise CONVERGE.ConvergenceError("NATIVE_COMMAND_FAILED")
            self.features[call[3]] = True
            return ""
        if call == ("codex", "mcp", "list", "--json"):
            return json.dumps(self.mcp)
        raise AssertionError(f"unexpected native call: {call}")


class ConvergenceFixture(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="th-update-converge-")
        self.base = Path(self.temp.name)
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
        try:
            self.codex_home.chmod(stat.S_IRWXU)
        except FileNotFoundError:
            pass
        self.temp.cleanup()

    def args(self, *, authorize_runtime: bool = False) -> argparse.Namespace:
        return argparse.Namespace(
            old_plugin=str(self.plugin),
            old_version=PLUGIN_VERSION,
            new_plugin=str(self.plugin),
            new_version=PLUGIN_VERSION,
            authorize_runtime=authorize_runtime,
            expected_mcp=[],
        )

    def converge(self, native: FakeCodex, *, authorize_runtime: bool = False) -> dict[str, object]:
        receipt = CONVERGE.run_convergence(self.args(authorize_runtime=authorize_runtime), native_runner=native)
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
            [("codex", "features", "list"), ("codex", "mcp", "list", "--json")],
        )

    def test_declined_runtime_can_remain_pending_without_a_prescribed_command(self) -> None:
        receipt = self.converge(FakeCodex())
        self.assertEqual(receipt["status"], "pending-approval")
        self.assertEqual(receipt["recoveryInvocation"], "$team-harness:update")
        runtime_text = (self.codex_home / "config.toml").read_text(encoding="utf-8")
        self.assertNotIn("sandbox_mode", runtime_text)

    def test_feature_repair_is_conditional_and_verified(self) -> None:
        native = FakeCodex(features={"multi_agent": False, "multi_agent_v2": True})
        receipt = self.converge(native, authorize_runtime=True)
        self.assertEqual(receipt["domains"]["features"]["status"], "changed")
        self.assertEqual(receipt["domains"]["features"]["changed"], ["multi_agent"])
        self.assertEqual(native.calls.count(("codex", "features", "enable", "multi_agent")), 1)
        self.assertEqual(native.calls.count(("codex", "features", "list")), 2)

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
        self.assertEqual(unsafe["failedDomain"], "hooks")
        self.assertEqual(unsafe["domains"]["hooks"]["errorCode"], "HOOK_MANIFEST_NOT_REGULAR")

    def test_protected_config_target_requests_exact_retry_escalation(self) -> None:
        self.codex_home.chmod(stat.S_IRUSR | stat.S_IXUSR)
        receipt = self.converge(FakeCodex())
        self.codex_home.chmod(stat.S_IRWXU)
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
