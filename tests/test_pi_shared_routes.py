#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
IDENTITIES = ROOT / "skills/setup/scripts/manage_github_identities.py"


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


identities = load("pi_shared_identities", IDENTITIES)
review = load("pi_shared_review", ROOT / "skills/review-pr/scripts/review_context.py")


class PiSharedRoutesTests(unittest.TestCase):
    def test_identity_root_uses_pi_override_or_native_home(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory).resolve() / "home"
            selected = home.parent / "selected 資料"
            with patch.dict(os.environ, {"HOME": str(home), "USERPROFILE": str(home),
                                         "PI_CODING_AGENT_DIR": str(selected), "CODEX_HOME": str(home.parent / "codex")}):
                self.assertEqual(identities.config_path("pi"), selected / ".team-harness.json")
                os.environ["PI_CODING_AGENT_DIR"] = ""
                self.assertEqual(identities.config_path("pi"), home / ".pi/agent/.team-harness.json")
                os.environ["PI_CODING_AGENT_DIR"] = str(home)
                self.assertEqual(identities.config_path("pi"), home / ".team-harness.json")
                os.environ["PI_CODING_AGENT_DIR"] = "relative"
                with self.assertRaises(ValueError):
                    identities.config_path("pi")
            self.assertEqual(list(home.parent.iterdir()), [])

    def test_public_identity_commands_preserve_pi_opaque_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            selected = root / "selected"
            selected.mkdir()
            path = selected / ".team-harness.json"
            path.write_text(json.dumps({"opaque": {"keep": True}, "workspace-mode": "gpt-space"}), encoding="utf-8")
            home = root / "home"
            sentinels = [home / ".pi/agent/.team-harness.json", root / "codex/.team-harness.json",
                         root / "opencode/.team-harness.json"]
            for sentinel in sentinels:
                sentinel.parent.mkdir(parents=True, exist_ok=True)
                sentinel.write_text('{"sentinel":true}', encoding="utf-8")
            env = {**os.environ, "HOME": str(home), "USERPROFILE": str(home), "PI_CODING_AGENT_DIR": str(selected),
                   "CODEX_HOME": str(root / "codex"), "OPENCODE_CONFIG_DIR": str(root / "opencode"),
                   "PYTHONDONTWRITEBYTECODE": "1"}

            def run(*args):
                result = subprocess.run([sys.executable, str(IDENTITIES), "--runtime", "pi", *args],
                                        env=env, capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stderr, "")
                return json.loads(result.stdout)

            shown = run("show")
            self.assertEqual(shown["path"], str(path))
            self.assertEqual(shown["runtime"], "pi")
            self.assertEqual(run("configure", "--routes-json", "[]")["routeCount"], 0)
            self.assertEqual(run("resolve", "--repo-root", str(root / "repository"))["status"], "no-match")
            stored = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(stored["opaque"], {"keep": True})
            self.assertEqual(stored["workspace-mode"], "gpt-space")
            self.assertEqual(stored["github"], {"account_routes": []})
            for sentinel in sentinels:
                self.assertEqual(sentinel.read_text(encoding="utf-8"), '{"sentinel":true}')

    def test_pi_preflight_accepts_runtime_without_reading_codex_agents(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            exclude = root / "exclude"
            exclude.write_text("/workspaces\n", encoding="utf-8")
            args = review.build_parser().parse_args([
                "preflight", "--repo-root", str(root), "--runtime", "pi", "--prerequisites-only",
            ])
            self.assertEqual(args.runtime, "pi")
            with patch.object(review.subprocess, "run", return_value=subprocess.CompletedProcess(
                    ["gh", "auth", "status"], 0, b"", b"")), \
                    patch.object(review, "_git_local_exclude_path", return_value=exclude), \
                    patch.object(review, "ensure_workspaces_ignored"), \
                    patch.object(review, "_codex_agents_status", side_effect=AssertionError("Pi must not inspect Codex agents")):
                result = review.preflight(root, args.runtime, None, prerequisites_only=args.prerequisites_only)
            self.assertTrue(result["ok"])
            self.assertEqual(result["agent_check"], "not-run")
            self.assertEqual(result["review_agents"], [])
            self.assertIsNone(result["codex_agents"])
            self.assertEqual(result["blockers"], [])


if __name__ == "__main__":
    unittest.main()
