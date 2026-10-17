#!/usr/bin/env python3
"""Read-only, optional installation diagnostics; a running host owns activation."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import threading
import time


RUNTIMES = ("claude", "codex", "opencode", "pi")
ROOT_VARIABLES = {
    "claude": "CLAUDE_CONFIG_DIR", "codex": "CODEX_HOME",
    "opencode": "OPENCODE_CONFIG_DIR", "pi": "PI_CODING_AGENT_DIR",
}
VERSION = re.compile(r"(?<![\w.])v?([0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6})(?![\w.])")
EXACT_VERSION = re.compile(r"[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}\Z")
CONTROL = re.compile(r"[\x00-\x1f\x7f]")
MAX_DOCUMENT_BYTES = 1024 * 1024
RECOVERY = {
    "claude": "Run claude plugin list in the selected host and select its Team Harness package path.",
    "codex": "Run codex plugin list --json in the selected host and select its Team Harness package path.",
    "opencode": "Run Team Harness setup in the selected OpenCode root to verify its installed assets.",
    "pi": "Run pi list in the selected host and select its Team Harness package path.",
}


def _absolute_path(raw, home, code):
    value = str(raw)
    if not value or CONTROL.search(value):
        raise ValueError(code)
    if value == "~":
        value = str(home)
    elif value.startswith(("~/", "~\\")):
        value = str(home / value[2:])
    path = Path(value)
    if not path.is_absolute():
        raise ValueError(code)
    return Path(os.path.abspath(str(path)))


def resolve_root(runtime, root=None, scope="global", env=None, home=None, cwd=None, platform=None):
    """Resolve one host's selected root without borrowing another host's settings."""
    if runtime not in RUNTIMES or scope not in {"global", "project"}:
        raise ValueError("invalid_arguments")
    env = os.environ if env is None else env
    home = Path.home() if home is None else Path(home)
    cwd = Path.cwd() if cwd is None else Path(cwd)
    platform = sys.platform if platform is None else platform
    if root is not None:
        raw = root
    elif env.get(ROOT_VARIABLES[runtime]):
        raw = env[ROOT_VARIABLES[runtime]]
    elif scope == "project":
        raw = cwd / ("." + runtime)
    elif runtime == "opencode":
        if platform == "win32":
            raw = Path(env.get("APPDATA") or home / "AppData/Roaming") / "opencode"
        else:
            xdg = env.get("XDG_CONFIG_HOME", "")
            base = Path(xdg) if xdg and Path(xdg).is_absolute() else home / ".config"
            raw = base / "opencode"
    elif runtime == "pi":
        raw = home / ".pi/agent"
    else:
        raw = home / ("." + runtime)
    return _absolute_path(raw, home, "invalid_config_root")


def probe_version(argv, timeout=2.0, output_limit=8192, env=None, python_only=False):
    """Run literal, noninteractive argv with bounded combined output and no raw diagnostics."""
    deadline = time.monotonic() + timeout
    try:
        process = subprocess.Popen(
            list(argv), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, shell=False, env=env,
        )
    except FileNotFoundError:
        return {"status": "missing", "code": "executable_missing"}
    except OSError:
        return {"status": "unknown", "code": "probe_failed"}

    captured = bytearray()
    overflow = threading.Event()

    def collect():
        try:
            while True:
                chunk = os.read(process.stdout.fileno(), min(1024, output_limit + 1 - len(captured)))
                if not chunk:
                    break
                captured.extend(chunk)
                if len(captured) > output_limit:
                    overflow.set()
                    try:
                        process.kill()
                    except OSError:
                        pass
                    break
        except OSError:
            pass
        finally:
            process.stdout.close()

    # A reader thread also supports Windows anonymous pipes; its buffer never exceeds the limit + 1.
    reader = threading.Thread(target=collect, daemon=True)
    reader.start()
    timed_out = False
    try:
        process.wait(timeout=max(0, deadline - time.monotonic()))
    except subprocess.TimeoutExpired:
        timed_out = True
        process.kill()
        process.wait(timeout=1.0)
    reader.join(max(0, deadline - time.monotonic()))
    if overflow.is_set():
        return {"status": "unknown", "code": "probe_output_limit"}
    if timed_out or reader.is_alive():
        return {"status": "unknown", "code": "probe_timeout"}
    if process.returncode != 0:
        return {"status": "unknown", "code": "probe_failed"}
    output = captured.decode("ascii", errors="replace")
    match = (re.fullmatch(r"\s*Python ([0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6})\s*", output)
             if python_only else VERSION.search(output))
    if match is None:
        return {"status": "unknown", "code": "version_unrecognized"}
    return {"status": "available", "version": match.group(1), "code": "version_observed"}


def _version_at_least(value, minimum):
    return bool(isinstance(value, str) and EXACT_VERSION.fullmatch(value)
                and tuple(int(part) for part in value.split(".")) >= tuple(minimum))


def _lookup(env, which):
    return which if which is not None else lambda name: shutil.which(name, path=env.get("PATH", ""))


def discover_python(minimum=(3, 8, 0), platform=None, env=None, which=None, probe=None):
    """Return a verified interpreter argv, including a Windows launcher's required arguments."""
    platform = sys.platform if platform is None else platform
    env = os.environ if env is None else env
    lookup = _lookup(env, which)
    probe = probe_version if probe is None else probe
    candidates = [("py", ["-3"]), ("python", []), ("python3", [])] if platform == "win32" else [
        ("python3", []), ("python", []),
    ]
    for name, arguments in candidates:
        path = lookup(name)
        if not path:
            continue
        argv = [str(path)] + arguments
        result = probe(argv + ["--version"], env=env, python_only=True)
        if result["status"] == "available" and _version_at_least(result.get("version"), minimum):
            return {"status": "requirements_met", "path": str(path), "argv": argv,
                    "version": result["version"], "code": "python_version_verified"}
    return {"status": "unavailable", "code": "python_missing_or_incompatible",
            "next_step": "Select a Python interpreter meeting this operation's minimum, or use native inspection."}


def _read_object(path):
    try:
        if not stat.S_ISREG(path.stat().st_mode):
            return None, "not_regular_file"
        with path.open("rb") as stream:
            raw = stream.read(MAX_DOCUMENT_BYTES + 1)
        if len(raw) > MAX_DOCUMENT_BYTES:
            return None, "document_too_large"
        value = json.loads(raw.decode("utf-8"))
    except FileNotFoundError:
        return None, "file_missing"
    except (OSError, UnicodeError, ValueError, RecursionError):
        return None, "document_unreadable_or_invalid"
    if not isinstance(value, dict):
        return None, "document_not_object"
    return value, "object_read"


def _configuration(runtime, root, scope, env, home, cwd, platform):
    path = root / ".team-harness.json"
    document, code = _read_object(path)
    status = "valid_object" if document is not None else "missing" if code == "file_missing" else "invalid"
    if runtime == "pi" and scope == "project" and status in {"valid_object", "missing"}:
        agent_dir = resolve_root("pi", env=env, home=home, cwd=cwd, platform=platform)
        if root != agent_dir:
            status, code = "unknown", "project_settings_not_agent_dir"
    return {"status": status, "path": str(path), "code": code}


def _installation(runtime, package_root):
    result = {"status": "unknown", "code": "native_package_unverified", "next_step": RECOVERY[runtime]}
    if package_root is None:
        return result
    manifest = {"claude": ".claude-plugin/plugin.json", "codex": ".codex-plugin/plugin.json",
                "pi": "package.json"}.get(runtime)
    if manifest is None:
        return result
    path = package_root / manifest
    result["path"] = str(path)
    document, code = _read_object(path)
    if document is None:
        result["code"] = "selected_manifest_" + code
        return result
    expected_name = {"claude": "th", "codex": "team-harness", "pi": "@valianx/team-harness-pi"}[runtime]
    repository = document.get("repository")
    if isinstance(repository, dict):
        repository = repository.get("url")
    repositories = {"https://github.com/valianx/team-harness", "https://github.com/valianx/team-harness.git"}
    version = document.get("version")
    if (document.get("name") != expected_name or not isinstance(repository, str) or repository not in repositories
            or not isinstance(version, str) or not EXACT_VERSION.fullmatch(version)
            or (runtime == "pi" and not isinstance(document.get("pi"), dict))):
        result["code"] = "selected_manifest_identity_unverified"
        return result
    return {"status": "files_present", "path": str(path), "version": version,
            "code": "selected_native_manifest_identified", "next_step": RECOVERY[runtime]}


def load_requirements():
    """Read the bundled operation-specific requirements, never personal configuration."""
    path = Path(__file__).with_name("setup_requirements.json")
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def _capabilities(runtime, cli, catalog, env, platform, lookup, probe):
    native = {"status": "requirements_met", "code": "native_package_requirements_met"}
    if cli["status"] != "available":
        native = {"status": "unavailable" if cli["status"] == "missing" else "unknown",
                  "code": "native_cli_unavailable", "next_step": "Install or inspect this CLI using its native owner."}
    elif runtime == "codex" and platform == "win32":
        native = {"status": "unknown", "code": "codex_beta_posix_plugin_only",
                  "next_step": "Verify native plugin support for this platform in Codex documentation."}
    elif runtime == "pi":
        node_path = lookup("node")
        node = probe([str(node_path), "--version"], env=env) if node_path else {"status": "missing"}
        versions = {"pi": cli.get("version"), "node": node.get("version")}
        requirements = catalog["runtimes"]["pi"]["native_package"]["requirements"]
        if not all(_version_at_least(versions.get(item["tool"]),
                                    tuple(int(part) for part in item["minimum"].split(".")))
                   for item in requirements):
            native = {"status": "unavailable", "code": "pi_runtime_minimum_unmet",
                      "next_step": "Use the Pi and Node minimums in this report's native_package requirements."}
    result = {
        "native_package": native,
        "status_reader": {"status": "requirements_met", "path": sys.executable,
                          "version": ".".join(str(part) for part in sys.version_info[:3]),
                          "code": "running_python_verified"},
        "github": {"status": "unknown" if lookup("gh") else "unavailable",
                   "code": "github_native_auth_check_required" if lookup("gh") else "optional_gh_missing",
                   "next_step": "Select GitHub integration only if needed, then verify its native authentication."},
    }
    for name in ["context7", "gpt_space", "obsidian", "workflow_providers"]:
        result[name] = {"status": "unknown", "code": "selected_capability_requires_native_check",
                        "next_step": "Select this optional capability and verify access in the active host."}
    if runtime == "codex":
        python = discover_python((3, 11, 0), platform=platform, env=env, which=lookup, probe=probe)
        result["codex_agents"] = {key: value for key, value in python.items() if key != "argv"}
    return result


def build_report(runtime, root=None, scope="global", package_root=None, all_runtimes=False,
                 env=None, home=None, cwd=None, platform=None, which=None, probe=None):
    """Inspect selected and explicitly requested hosts without installing, configuring or activating them."""
    env = os.environ if env is None else env
    home = Path.home() if home is None else Path(home)
    cwd = Path.cwd() if cwd is None else Path(cwd)
    platform = sys.platform if platform is None else platform
    lookup = _lookup(env, which)
    probe = probe_version if probe is None else probe
    catalog = load_requirements()
    package_root = None if package_root is None else _absolute_path(package_root, home, "invalid_package_root")
    report = {"schema_version": 1, "runtimes": {}, "requirements": catalog}
    selected = RUNTIMES if all_runtimes else (runtime,)
    for name in selected:
        host_scope = scope if name == runtime else "global"
        path = lookup(name)
        cli = probe([str(path), "--version"], env=env) if path else {
            "status": "missing", "code": "executable_missing",
        }
        if path:
            cli = dict(cli, path=str(path))
        entry = {"scope": host_scope, "cli": cli,
                 "installation": _installation(name, package_root if name == runtime else None),
                 "activation": {"status": "unknown", "code": "observe_in_active_host",
                                "next_step": "Verify loaded Team Harness skills or agents in the active host."}}
        try:
            host_root = resolve_root(name, root=root if name == runtime else None, scope=host_scope,
                                     env=env, home=home, cwd=cwd, platform=platform)
            entry["root"] = str(host_root)
            entry["configuration"] = _configuration(name, host_root, host_scope, env, home, cwd, platform)
        except ValueError:
            entry["configuration"] = {"status": "invalid", "code": "invalid_config_root",
                                      "next_step": "Select an absolute native configuration root."}
        entry["capabilities"] = _capabilities(name, cli, catalog, env, platform, lookup, probe)
        report["runtimes"][name] = entry
    return report


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError("invalid_arguments")


def main(argv=None):
    """Print the allowlisted report; invalid inputs fail without echoing their values."""
    parser = _Parser(description=__doc__)
    parser.add_argument("--runtime", required=True, choices=RUNTIMES)
    parser.add_argument("--root")
    parser.add_argument("--scope", default="global", choices=("global", "project"))
    parser.add_argument("--package-root")
    parser.add_argument("--all", action="store_true", dest="all_runtimes")
    try:
        arguments = parser.parse_args(argv)
        if arguments.root is not None:
            _absolute_path(arguments.root, Path.home(), "invalid_config_root")
        report = build_report(**vars(arguments))
    except (ValueError, OSError):
        code = sys.exc_info()[1].args[0]
        if code not in {"invalid_arguments", "invalid_config_root", "invalid_package_root"}:
            code = "diagnostic_unavailable"
        print(json.dumps({"schema_version": 1, "status": "invalid", "code": code,
                          "next_step": "Use --help; select absolute roots and the runtime being inspected."}))
        return 2
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
