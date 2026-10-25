#!/usr/bin/env python3
"""Exercise binary discovery through real directory aliases and fail-closed inputs."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
RESOLVER = ROOT / "plugins/team-harness/skills/update/scripts/resolve_codex.py"


class BinaryResolutionTests(unittest.TestCase):
    def resolve(self, candidate, *, controlled_python_version=None):
        interpreter = [sys.executable, "-B"]
        if controlled_python_version is not None:
            # This exercises the entrypoint's capability check, not a real older interpreter.
            interpreter.extend([
                "-c",
                "import runpy, sys; "
                "sys.version_info = tuple(map(int, sys.argv.pop(1).split('.'))); "
                "sys.path.insert(0, sys.argv.pop(1)); sys.argv.pop(0); "
                "runpy.run_path(sys.argv[0], run_name='__main__')",
                controlled_python_version, str(RESOLVER.parent),
            ])
        return subprocess.run(
            [*interpreter, str(RESOLVER), "--candidate", str(candidate)],
            capture_output=True, text=True, timeout=30,
        )

    def test_unsupported_python_stops_preflight_before_candidate_selection(self):
        for candidate in (Path(sys.executable).resolve(), "codex"):
            with self.subTest(candidate=candidate):
                result = self.resolve(candidate, controlled_python_version="3.10.14")
                self.assertEqual(result.returncode, 1)
                self.assertEqual(result.stdout, "")
                failure = json.loads(result.stderr)
                self.assertEqual(failure["errorCode"], "PYTHON_VERSION_UNSUPPORTED")
                self.assertEqual(failure["minimumPython"], "3.11")
                self.assertIn("PYTHON_BIN", failure["recovery"])
                self.assertIn("$team-harness:update", failure["recovery"])

    def test_supported_python_preflight_pins_the_selected_interpreter(self):
        binary = Path(sys.executable).resolve(strict=True)
        result = self.resolve(binary, controlled_python_version="3.11.0")
        self.assertEqual(result.returncode, 0, result.stderr)
        selected = json.loads(result.stdout)
        self.assertEqual(selected["codexBin"], str(binary))
        self.assertEqual(selected.get("pythonBin"), str(binary))
        executed = subprocess.run(
            [selected["pythonBin"], "-B", str(RESOLVER), "--candidate", selected["codexBin"]],
            env=dict(os.environ, PATH=""), capture_output=True, text=True, timeout=30,
        )
        self.assertEqual(executed.returncode, 0, executed.stderr)
        self.assertEqual(json.loads(executed.stdout), selected)

    def test_parent_alias_resolves_to_executable_without_changing_path(self):
        binary = Path(sys.executable).resolve(strict=True)
        with tempfile.TemporaryDirectory(prefix="th binary & spaces ") as directory:
            alias = Path(directory).resolve() / "application bin"
            if os.name == "nt":
                env = dict(os.environ, TH_BINARY_ALIAS=str(alias), TH_BINARY_TARGET=str(binary.parent))
                subprocess.run([
                    "powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
                    "$ErrorActionPreference='Stop'; New-Item -ItemType Junction "
                    "-Path $env:TH_BINARY_ALIAS -Target $env:TH_BINARY_TARGET | Out-Null",
                ], env=env, check=True, capture_output=True, timeout=30)
            else:
                alias.symlink_to(binary.parent, target_is_directory=True)
            try:
                candidate = alias / binary.name
                self.assertNotEqual(candidate, binary)
                result = self.resolve(candidate)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stderr, "")
                pinned = json.loads(result.stdout)["codexBin"]
                self.assertEqual(Path(pinned), binary)
                # The resolved argv is independent of PATH and still launches.
                env = dict(os.environ, PATH="")
                executed = subprocess.run([pinned, "-c", "print('pinned binary')"],
                                          env=env, capture_output=True, text=True, timeout=30)
                self.assertEqual(executed.returncode, 0, executed.stderr)
                self.assertEqual(executed.stdout.strip(), "pinned binary")
            finally:
                if os.name == "nt":
                    alias.rmdir()  # Remove only the junction, never its target.
                else:
                    alias.unlink()

    def test_invalid_candidates_fail_without_a_pinned_binary(self):
        with tempfile.TemporaryDirectory(prefix="th binary invalid ") as directory:
            base = Path(directory).resolve()
            non_executable = base / "plain.txt"
            non_executable.write_text("not executable", encoding="utf-8")
            non_executable.chmod(0o644)
            for candidate in ("codex", base, non_executable, base / "missing.exe", base / ".." / "codex.exe",
                              str(base / "bad.exe") + "\n"):
                with self.subTest(candidate=candidate):
                    result = self.resolve(candidate)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(result.stdout, "")
                    self.assertEqual(json.loads(result.stderr), {"errorCode": "CODEX_BINARY_INVALID"})


if __name__ == "__main__":
    unittest.main()
