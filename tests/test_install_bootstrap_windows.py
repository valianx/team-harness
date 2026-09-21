#!/usr/bin/env python3
"""Exercise native CMD bootstrap routing without allowing a download."""

import os
from pathlib import Path
import subprocess
import unittest


@unittest.skipUnless(os.name == "nt", "native Windows CMD bootstrap")
class BootstrapRoutingTests(unittest.TestCase):
    def run_bootstrap(self, *args):
        env = {key: value for key, value in os.environ.items() if key.upper() != "ARCH"}
        env["PROCESSOR_ARCHITECTURE"] = "TH_TEST_UNSUPPORTED"
        script = Path(__file__).resolve().parents[1] / "bin" / "install.cmd"
        return subprocess.run(
            ["cmd.exe", "/d", "/c", str(script), *args],
            env=env, capture_output=True, text=True, timeout=10,
        )

    def test_no_arguments_returns_native_installation_without_download(self):
        result = self.run_bootstrap()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("/plugin install th", result.stdout)

    def test_supported_flags_before_subcommand_reach_native_engine(self):
        for args in (
            ("--runtime", "codex", "apply"),
            ("--runtime=codex", "apply"),
            ("--codex-dir=C:\\fixture space", "apply"),
            ("--opencode-dir=C:\\fixture space", "update"),
            ("--opencode-dir", "C:\\fixture space", "plan"),
            ("--opencode-tier=anthropic", "apply"),
        ):
            with self.subTest(args=args):
                result = self.run_bootstrap(*args)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn("TH_TEST_UNSUPPORTED", result.stderr)


if __name__ == "__main__":
    unittest.main()
