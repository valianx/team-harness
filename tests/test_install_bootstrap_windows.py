#!/usr/bin/env python3
"""Exercise native CMD bootstrap routing without allowing a download."""

import base64
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import uuid


@unittest.skipUnless(os.name == "nt", "native Windows CMD bootstrap")
class BootstrapRoutingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.powershell51 = shutil.which("powershell.exe")
        cls.powershell7 = cls._resolve_powershell7(cls.powershell51)
        if not cls.powershell51:
            raise unittest.SkipTest("Windows PowerShell 5.1 is unavailable")

    @staticmethod
    def _resolve_powershell7(powershell51):
        """Find pwsh even when WindowsApps aliases are absent from PATH."""
        candidates = []
        found = shutil.which("pwsh.exe")
        if found:
            candidates.append(found)
        program_files = os.environ.get("ProgramFiles")
        if program_files:
            candidates.append(str(Path(program_files) / "PowerShell" / "7" / "pwsh.exe"))
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            candidates.append(str(Path(local_app_data) / "Microsoft" / "WindowsApps" / "pwsh.exe"))
        if powershell51:
            result = subprocess.run(
                [powershell51, "-NoProfile", "-Command",
                 "(Get-Command pwsh.exe -ErrorAction SilentlyContinue).Source"],
                capture_output=True, text=True, timeout=10,
            )
            candidates.extend(line.strip() for line in result.stdout.splitlines() if line.strip())
        for candidate in candidates:
            path = Path(candidate)
            if path.is_file():
                return str(path)
        return None

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

    def _compile_child_fixture(self, directory):
        """Build a local native child that records argv and returns 37."""
        compiler = directory / "compile-probe.ps1"
        compiler.write_text(
            r'''param([string]$Output)
$source = @'
using System;
using System.IO;
using System.Text;
public static class ArgvProbe {
    public static int Main(string[] args) {
        var encoded = new StringBuilder();
        for (var i = 0; i < args.Length; i++) {
            if (i > 0) encoded.Append('\n');
            encoded.Append(Convert.ToBase64String(Encoding.UTF8.GetBytes(args[i] ?? "")));
        }
        File.WriteAllText(Environment.GetEnvironmentVariable("TH_ARGV_OUT"), encoded.ToString());
        return 37;
    }
}
'@
Add-Type -TypeDefinition $source -OutputAssembly $Output -OutputType ConsoleApplication
if (-not (Test-Path -LiteralPath $Output)) { exit 1 }
''',
            encoding="utf-8",
        )
        child = directory / "argv-probe.exe"
        result = subprocess.run(
            [self.powershell51, "-NoProfile", "-File", str(compiler), str(child)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0 or not child.exists():
            self.skipTest(
                "could not compile native argv fixture: "
                f"{result.stdout}\n{result.stderr}"
            )
        return child

    @staticmethod
    def _write_launcher_wrapper(launcher, wrapper):
        """Mock release downloads while retaining the launcher source verbatim."""
        preamble = r'''function Invoke-WebRequest {
    [CmdletBinding()]
    param([string]$Uri, [string]$OutFile, [switch]$UseBasicParsing, [int]$TimeoutSec)
    if ($OutFile) {
        if ($Uri -like "*/SHA256SUMS") {
            $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $env:TH_BOOTSTRAP_PROBE).Hash.ToLowerInvariant()
            $asset = $env:TH_BOOTSTRAP_ASSET
            Set-Content -LiteralPath $OutFile -Value "$hash  $asset" -NoNewline
        } else {
            Copy-Item -LiteralPath $env:TH_BOOTSTRAP_PROBE -Destination $OutFile -Force
        }
        return
    }
    [pscustomobject]@{ Content = "3.41.2" }
}
function Unblock-File { param([string]$Path) }
'''
        wrapper.write_text(preamble + "\n" + launcher.read_text(encoding="utf-8"), encoding="utf-8")

    @staticmethod
    def _read_argv(path):
        encoded = path.read_text(encoding="utf-8")
        if not encoded:
            return []
        return [base64.b64decode(line).decode("utf-8") for line in encoded.split("\n")]

    def test_real_powershell_forwarding_and_exit_status(self):
        """Run every PS bootstrap through a local child on PS5.1 and PS7."""
        shells = [("powershell-5.1", self.powershell51)]
        if self.powershell7:
            shells.append(("powershell-7", self.powershell7))

        repo_root = Path(__file__).resolve().parents[1]
        path_with_spaces = "C:\\fixture space\\"
        quote_value = 'quote"inside'
        trailing_value = "C:\\trailing\\"
        memory_url = "https://memory.example/mcp?value=with space"

        # The managed Windows runner may deny writes below the profile's
        # system TEMP. Keep the disposable fixture beside this checkout unless
        # the caller supplies an explicit writable test root.
        temp_root = Path(os.environ.get("TH_BOOTSTRAP_TEST_TMPDIR") or tempfile.gettempdir())
        directory = temp_root / f"th-bootstrap-{uuid.uuid4().hex}"
        # tempfile.TemporaryDirectory applies a restrictive chmod on Windows
        # in this managed runner, leaving the fixture unreadable to PowerShell.
        # Path.mkdir inherits the checkout ACL while remaining disposable.
        directory.mkdir()
        try:
            child = self._compile_child_fixture(directory)
            launchers = (
                (
                    "install-opencode.ps1",
                    ["apply", "--opencode-dir", path_with_spaces, "", quote_value, trailing_value],
                    ["apply", "--runtime", "opencode", "--scope", "global", "--memory-url", memory_url,
                     "apply", "--opencode-dir", path_with_spaces, "", quote_value, trailing_value],
                    memory_url,
                ),
                (
                    "update-opencode.ps1",
                    ["--opencode-dir", path_with_spaces, "", quote_value, trailing_value],
                    ["update", "--runtime", "opencode", "--scope", "global", "--opencode-dir",
                     path_with_spaces, "", quote_value, trailing_value],
                    "",
                ),
                (
                    "install.ps1",
                    ["--runtime", "codex", "apply", "--codex-dir", path_with_spaces, "", quote_value,
                     trailing_value],
                    ["--runtime", "codex", "apply", "--codex-dir", path_with_spaces, "", quote_value,
                     trailing_value],
                    "",
                ),
            )
            for shell_name, shell in shells:
                for launcher_name, args, expected, memory in launchers:
                    with self.subTest(shell=shell_name, launcher=launcher_name):
                        output = directory / f"{shell_name}-{launcher_name}.argv"
                        wrapper = directory / f"{shell_name}-{launcher_name}.ps1"
                        self._write_launcher_wrapper(repo_root / "bin" / launcher_name, wrapper)
                        env = os.environ.copy()
                        env.update({
                            "PROCESSOR_ARCHITECTURE": "AMD64",
                            "TEMP": str(directory),
                            "TMP": str(directory),
                            "TH_BOOTSTRAP_PROBE": str(child),
                            "TH_BOOTSTRAP_ASSET": "install-windows-amd64.exe",
                            "TH_ARGV_OUT": str(output),
                            "MEMORY_MCP_URL": memory,
                        })
                        result = subprocess.run(
                            [shell, "-NoProfile", "-File", str(wrapper), *args],
                            env=env, capture_output=True, text=True, timeout=45,
                        )
                        self.assertEqual(
                            result.returncode, 37,
                            f"{shell_name}/{launcher_name} did not preserve child exit:\n"
                            f"stdout={result.stdout}\nstderr={result.stderr}",
                        )
                        self.assertTrue(output.exists(), f"{shell_name}/{launcher_name} child did not run")
                        self.assertEqual(self._read_argv(output), expected)
        finally:
            shutil.rmtree(directory, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
