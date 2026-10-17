#!/usr/bin/env python3
"""Exercise native Windows bootstraps with local release-download fixtures."""

import base64
import binascii
import hashlib
import json
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

    @staticmethod
    def _powershell51_module_path():
        """Keep PS5.1 from importing incompatible PS7 bundled modules."""
        user_profile = os.environ.get("USERPROFILE") or os.environ.get("HOME", "")
        program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
        windir = os.environ.get("WINDIR", r"C:\Windows")
        return ";".join((
            str(Path(user_profile) / "Documents" / "WindowsPowerShell" / "Modules"),
            str(Path(program_files) / "WindowsPowerShell" / "Modules"),
            str(Path(windir) / "System32" / "WindowsPowerShell" / "v1.0" / "Modules"),
        ))

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
            ("--runtime", "opencode", "setup", "models", "--dry-run"),
            ("--worker-models-file=C:\\fixture space\\draft.json", "--opencode-cli=C:\\native CLI.exe", "setup", "models"),
            ("--worker-models-file", "C:\\fixture space\\draft.json", "--opencode-cli", "C:\\native CLI.exe", "--dry-run", "setup", "models"),
        ):
            with self.subTest(args=args):
                result = self.run_bootstrap(*args)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn("TH_TEST_UNSUPPORTED", result.stderr)

    def test_update_precheck_with_windows1252_fallback(self):
        """Exercise both no-download exits with PS5.1's legacy decoding."""
        command = r'''
function Invoke-WebRequest {
    param($Uri, [switch]$UseBasicParsing, $TimeoutSec, $ErrorAction)
    if ($Uri -notlike '*/VERSION') { throw 'Unexpected download' }
    [pscustomobject]@{ Content = '3.41.2' }
}
$bytes = [System.IO.File]::ReadAllBytes($env:TH_BOOTSTRAP_SCRIPT)
$encoding = [System.Text.Encoding]::GetEncoding(1252)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {
    $encoding = [System.Text.Encoding]::UTF8
}
& ([scriptblock]::Create($encoding.GetString($bytes)))
'''
        repo_root = Path(__file__).resolve().parents[1]
        temp_root = Path(os.environ.get("TH_BOOTSTRAP_TEST_TMPDIR") or tempfile.gettempdir())
        directory = temp_root / f"th-precheck-{uuid.uuid4().hex}"
        (directory / "opencode").mkdir(parents=True)
        try:
            for version, status in (("3.41.2", "already current"), ("9.0.0", "installed ahead")):
                with self.subTest(version=version):
                    (directory / "opencode" / ".team-harness.json").write_text(
                        json.dumps({"installed_version": version}), encoding="utf-8",
                    )
                    env = os.environ.copy()
                    env.update({"APPDATA": str(directory), "OPENCODE_CONFIG_DIR": "",
                                "PROCESSOR_ARCHITECTURE": "AMD64",
                                "TH_BOOTSTRAP_SCRIPT": str(repo_root / "bin" / "update-opencode.ps1"),
                                "PSModulePath": self._powershell51_module_path()})
                    result = subprocess.run(
                        [self.powershell51, "-NoProfile", "-Command", command],
                        env=env, capture_output=True, text=True, timeout=10,
                    )
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertIn(status, result.stdout)
                    self.assertIn(f"installed version   {version}", result.stdout)
                    self.assertNotIn("Write-Host", result.stdout)
        finally:
            shutil.rmtree(directory)

    def _compile_child_fixture(self, directory):
        """Build a native argv recorder that also replaces curl at the download boundary."""
        compiler = directory / "compile-probe.ps1"
        compiler.write_text(
            r'''param([string]$Output)
$source = @'
using System;
using System.IO;
using System.Text;
public static class ArgvProbe {
    private static int Download(string[] args) {
        string output = null;
        string url = null;
        for (var i = 0; i < args.Length; i++) {
            if (args[i] == "-o" && i + 1 < args.Length) output = args[++i];
            else if (args[i].StartsWith("https://", StringComparison.Ordinal)) url = args[i];
        }
        const string release = "https://github.com/valianx/team-harness/releases/latest/download/";
        string kind;
        if (url == release + "SHA256SUMS") kind = "sums";
        else if (url == release + "install-windows-amd64.exe") kind = "binary";
        else return 22;
        if (output == null) return 2;
        File.AppendAllText(Environment.GetEnvironmentVariable("TH_BOOTSTRAP_REQUESTS"), kind + "\n");
        var scenario = Environment.GetEnvironmentVariable("TH_BOOTSTRAP_CASE");
        if (scenario == kind + "-failure") {
            if (kind == "binary") File.WriteAllText(output, "truncated release");
            return 22;
        }
        if (kind == "sums") {
            File.WriteAllText(output, Environment.GetEnvironmentVariable("TH_BOOTSTRAP_SUMS"));
        } else {
            File.Copy(Environment.GetEnvironmentVariable("TH_BOOTSTRAP_PROBE"), output, true);
        }
        return 0;
    }

    public static int Main(string[] args) {
        var executable = System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName;
        if (String.Equals(Path.GetFileName(executable), "curl.exe",
                          StringComparison.OrdinalIgnoreCase)) return Download(args);
        var encoded = new StringBuilder();
        for (var i = 0; i < args.Length; i++) {
            if (i > 0) encoded.Append('\n');
            encoded.Append(Convert.ToBase64String(Encoding.UTF8.GetBytes(args[i] ?? "")));
        }
        File.WriteAllText(Environment.GetEnvironmentVariable("TH_ARGV_OUT"), encoded.ToString());
        var rootOutput = Environment.GetEnvironmentVariable("TH_CONFIG_ROOT_OUT");
        if (!String.IsNullOrEmpty(rootOutput)) {
            File.WriteAllText(rootOutput, Environment.GetEnvironmentVariable("OPENCODE_CONFIG_DIR") ?? "");
        }
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
        self.assertEqual(result.returncode, 0,
                         f"could not compile native argv fixture: {result.stdout}\n{result.stderr}")
        self.assertTrue(child.is_file(), "native fixture compiler did not produce an executable")
        return child

    @staticmethod
    def _write_launcher_wrapper(launcher, wrapper):
        """Mock release downloads while retaining the launcher source verbatim."""
        preamble = r'''function Invoke-WebRequest {
    [CmdletBinding()]
    param([string]$Uri, [string]$OutFile, [switch]$UseBasicParsing, [int]$TimeoutSec)
    $release = 'https://github.com/valianx/team-harness/releases/latest/download/'
    if ($Uri -eq ($release + 'SHA256SUMS')) { $kind = 'sums' }
    elseif ($Uri -eq ($release + 'install-windows-amd64.exe')) { $kind = 'binary' }
    elseif ($Uri -eq ($release + 'VERSION')) { $kind = 'version' }
    else { throw 'Unexpected release URL' }
    if ($env:TH_BOOTSTRAP_REQUESTS) {
        [System.IO.File]::AppendAllText($env:TH_BOOTSTRAP_REQUESTS, "$kind`n")
    }
    if ($env:TH_BOOTSTRAP_CASE -eq "${kind}-failure") {
        if ($kind -eq 'binary') { [System.IO.File]::WriteAllText($OutFile, 'truncated release') }
        throw 'Synthetic release download failure'
    }
    if ($OutFile) {
        if ($kind -eq 'sums') {
            $sums = $env:TH_BOOTSTRAP_SUMS
            if (-not $sums) { $sums = "$($env:TH_BOOTSTRAP_HASH)  $($env:TH_BOOTSTRAP_ASSET)" }
            [System.IO.File]::WriteAllText($OutFile, $sums)
        } elseif ($kind -eq 'binary') {
            [System.IO.File]::Copy($env:TH_BOOTSTRAP_PROBE, $OutFile, $true)
        } else {
            throw 'Unexpected VERSION output file'
        }
        return
    }
    [pscustomobject]@{ Content = "3.41.2" }
}
function Unblock-File {
    [CmdletBinding()]
    param([string]$Path)
    if ($env:TH_BOOTSTRAP_UNBLOCK) {
        [System.IO.File]::AppendAllText($env:TH_BOOTSTRAP_UNBLOCK, "unblock`n")
    }
}
'''
        wrapper.write_text(preamble + "\n" + launcher.read_text(encoding="utf-8"), encoding="utf-8")

    @staticmethod
    def _read_argv(path):
        encoded = path.read_text(encoding="utf-8")
        if not encoded:
            return []
        lines = encoded.split("\n")
        try:
            return [base64.b64decode(line, validate=True).decode("utf-8") for line in lines]
        except (ValueError, binascii.Error):
            # Allow a precompiled local probe supplied by a constrained runner;
            # the maintained fixture above uses base64 so empty arguments stay
            # unambiguous, while older probes record one raw value per line.
            return lines

    def test_release_checksums_gate_native_children_and_cleanup(self):
        """Exercise the real hash and child-launch paths, including failed downloads."""
        repo_root = Path(__file__).resolve().parents[1]
        temp_root = Path(os.environ.get("TH_BOOTSTRAP_TEST_TMPDIR") or tempfile.gettempdir())
        directory = temp_root / f"th-checksums-{uuid.uuid4().hex}"
        directory.mkdir()
        try:
            child = self._compile_child_fixture(directory)
            probe_hash = hashlib.sha256(child.read_bytes()).hexdigest()
            asset = "install-windows-amd64.exe"
            mock_bin = directory / "mock-bin"
            mock_bin.mkdir()
            shutil.copyfile(child, mock_bin / "curl.exe")
            shells = [("powershell-5.1", self.powershell51)]
            if self.powershell7:
                shells.append(("powershell-7", self.powershell7))
            generic_args = ["apply", "--runtime", "opencode", "--non-interactive"]
            runners = []
            for shell_name, shell in shells:
                for launcher_name, args, expected_argv in (
                    ("install.ps1", generic_args, generic_args),
                    ("install-opencode.ps1", ["--non-interactive"],
                     ["apply", "--runtime", "opencode", "--scope", "global", "--non-interactive"]),
                    ("update-opencode.ps1", ["--non-interactive"],
                     ["update", "--runtime", "opencode", "--scope", "global", "--non-interactive"]),
                ):
                    wrapper = directory / f"{shell_name}-{launcher_name}"
                    self._write_launcher_wrapper(repo_root / "bin" / launcher_name, wrapper)
                    runners.append((f"{shell_name}/{launcher_name}",
                                    [shell, "-NoProfile", "-File", str(wrapper), *args],
                                    expected_argv, True))
            runners.append(("cmd/install.cmd",
                            ["cmd.exe", "/d", "/c", str(repo_root / "bin" / "install.cmd"), *generic_args],
                            generic_args, False))
            cases = (
                ("valid-lowercase", f"{probe_hash}  {asset}\n", "success", 37, True, ["sums", "binary"]),
                ("uppercase-exact-name", f"{probe_hash.upper()}  {asset}\n{'0' * 64}  {asset}.extra\n",
                 "success", 37, True, ["sums", "binary"]),
                ("missing-exact-entry", f"{probe_hash}  {asset}.extra\n", "success", 1, False,
                 ["sums", "binary"]),
                ("mismatched-digest", f"{'0' * 64}  {asset}\n", "success", 1, False, ["sums", "binary"]),
                ("checksum-download-failure", f"{probe_hash}  {asset}\n", "sums-failure", 1, False, ["sums"]),
                ("binary-download-failure", f"{probe_hash}  {asset}\n", "binary-failure", 1, False,
                 ["sums", "binary"]),
            )
            for runner_index, (name, command, argv, unblocks) in enumerate(runners):
                for case_name, sums, scenario, code, executes, requests in cases:
                    with self.subTest(runner=name, case=case_name):
                        case_dir = directory / f"{runner_index}-{case_name}"
                        case_dir.mkdir()
                        scratch = case_dir / "temp"
                        scratch.mkdir()
                        output = case_dir / "argv"
                        request_log = case_dir / "requests"
                        unblock_log = case_dir / "unblock"
                        expected = {"exit": code, "argv": argv if executes else None,
                                    "requests": requests, "unblocked": unblocks and executes,
                                    "temporary_entries": []}
                        env = {key: value for key, value in os.environ.items() if key.upper() != "ARCH"}
                        env.update({
                            "PROCESSOR_ARCHITECTURE": "AMD64", "TEMP": str(scratch), "TMP": str(scratch),
                            "PATH": str(mock_bin) + os.pathsep + env.get("PATH", ""),
                            "PSModulePath": self._powershell51_module_path(), "MEMORY_MCP_URL": "",
                            "TH_BOOTSTRAP_PROBE": str(child), "TH_BOOTSTRAP_HASH": probe_hash,
                            "TH_BOOTSTRAP_ASSET": asset, "TH_BOOTSTRAP_SUMS": sums,
                            "TH_BOOTSTRAP_CASE": scenario, "TH_BOOTSTRAP_REQUESTS": str(request_log),
                            "TH_BOOTSTRAP_UNBLOCK": str(unblock_log), "TH_ARGV_OUT": str(output),
                            "TH_CONFIG_ROOT_OUT": "",
                        })
                        result = subprocess.run(command, cwd=case_dir, env=env, capture_output=True,
                                                text=True, timeout=45)
                        observed = {"exit": result.returncode,
                                    "argv": self._read_argv(output) if output.exists() else None,
                                    "requests": request_log.read_text(encoding="utf-8").splitlines()
                                    if request_log.exists() else [], "unblocked": unblock_log.exists(),
                                    "temporary_entries": sorted(path.name for path in scratch.iterdir())}
                        self.assertEqual(observed, expected,
                                         f"{name}/{case_name}: stdout={result.stdout}\nstderr={result.stderr}")
        finally:
            shutil.rmtree(directory, ignore_errors=True)

    def test_update_custom_root_reaches_native_engine_without_arguments(self):
        """A current default installation must not hide a stale explicit native root."""
        repo_root = Path(__file__).resolve().parents[1]
        temp_root = Path(os.environ.get("TH_BOOTSTRAP_TEST_TMPDIR") or tempfile.gettempdir())
        directory = temp_root / f"th-custom-update-{uuid.uuid4().hex}"
        directory.mkdir()
        try:
            child = self._compile_child_fixture(directory)
            probe_hash = hashlib.sha256(child.read_bytes()).hexdigest()
            appdata = directory / "appdata"
            global_root = appdata / "opencode"
            custom_root = directory / "custom native root"
            global_root.mkdir(parents=True)
            custom_root.mkdir()
            global_settings = global_root / ".team-harness.json"
            custom_settings = custom_root / ".team-harness.json"
            global_bytes = b'{"installed_version":"3.41.2","sentinel":"global"}\n'
            custom_bytes = b'{"installed_version":"3.40.0","sentinel":"custom"}\n'
            global_settings.write_bytes(global_bytes)
            custom_settings.write_bytes(custom_bytes)
            shells = [("powershell-5.1", self.powershell51)]
            if self.powershell7:
                shells.append(("powershell-7", self.powershell7))
            for shell_name, shell in shells:
                with self.subTest(shell=shell_name):
                    scratch = directory / f"{shell_name}-temp"
                    scratch.mkdir()
                    output = directory / f"{shell_name}.argv"
                    root_output = directory / f"{shell_name}.root"
                    wrapper = directory / f"{shell_name}.ps1"
                    self._write_launcher_wrapper(repo_root / "bin" / "update-opencode.ps1", wrapper)
                    env = os.environ.copy()
                    env.update({
                        "APPDATA": str(appdata), "OPENCODE_CONFIG_DIR": str(custom_root),
                        "PROCESSOR_ARCHITECTURE": "AMD64", "TEMP": str(scratch), "TMP": str(scratch),
                        "PSModulePath": self._powershell51_module_path(),
                        "TH_BOOTSTRAP_PROBE": str(child), "TH_BOOTSTRAP_HASH": probe_hash,
                        "TH_BOOTSTRAP_ASSET": "install-windows-amd64.exe", "TH_BOOTSTRAP_CASE": "success",
                        "TH_BOOTSTRAP_SUMS": f"{probe_hash}  install-windows-amd64.exe\n",
                        "TH_BOOTSTRAP_REQUESTS": "", "TH_BOOTSTRAP_UNBLOCK": "",
                        "TH_ARGV_OUT": str(output), "TH_CONFIG_ROOT_OUT": str(root_output),
                    })
                    result = subprocess.run([shell, "-NoProfile", "-File", str(wrapper)],
                                            env=env, capture_output=True, text=True, timeout=45)
                    self.assertEqual(
                        {"exit": result.returncode,
                         "argv": self._read_argv(output) if output.exists() else None,
                         "root": root_output.read_text(encoding="utf-8") if root_output.exists() else None,
                         "global": global_settings.read_bytes(), "custom": custom_settings.read_bytes(),
                         "temporary_entries": sorted(path.name for path in scratch.iterdir())},
                        {"exit": 37, "argv": ["update", "--runtime", "opencode", "--scope", "global"],
                         "root": str(custom_root), "global": global_bytes, "custom": custom_bytes,
                         "temporary_entries": []},
                        f"{shell_name}: stdout={result.stdout}\nstderr={result.stderr}",
                    )
        finally:
            shutil.rmtree(directory, ignore_errors=True)

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
        # system TEMP. Allow an explicit writable test root without placing
        # disposable fixtures in the product checkout.
        temp_root = Path(os.environ.get("TH_BOOTSTRAP_TEST_TMPDIR") or tempfile.gettempdir())
        directory = temp_root / f"th-bootstrap-{uuid.uuid4().hex}"
        # tempfile.TemporaryDirectory applies a restrictive chmod on Windows
        # in this managed runner, leaving the fixture unreadable to PowerShell.
        # Path.mkdir inherits the selected temporary root's ACL.
        directory.mkdir()
        try:
            probe_override = os.environ.get("TH_BOOTSTRAP_TEST_PROBE")
            if probe_override:
                child = Path(probe_override)
                self.assertTrue(child.is_file(), f"TH_BOOTSTRAP_TEST_PROBE is not a file: {child}")
            else:
                child = self._compile_child_fixture(directory)
            probe_hash = hashlib.sha256(child.read_bytes()).hexdigest()
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
                (
                    "install.ps1",
                    ["--runtime", "opencode", "--worker-models-file", path_with_spaces + "draft.json",
                     "--opencode-cli", path_with_spaces + "native CLI.exe", "setup", "models", "--dry-run"],
                    ["--runtime", "opencode", "--worker-models-file", path_with_spaces + "draft.json",
                     "--opencode-cli", path_with_spaces + "native CLI.exe", "setup", "models", "--dry-run"],
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
                            "TH_BOOTSTRAP_HASH": probe_hash,
                            "TH_BOOTSTRAP_ASSET": "install-windows-amd64.exe",
                            "TH_ARGV_OUT": str(output),
                            "MEMORY_MCP_URL": memory,
                        })
                        if shell_name == "powershell-5.1":
                            env["PSModulePath"] = self._powershell51_module_path()
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
