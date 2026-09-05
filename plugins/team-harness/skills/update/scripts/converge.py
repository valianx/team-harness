#!/usr/bin/env python3
"""Converge and verify the Codex Team Harness installation in one bounded pass."""

from __future__ import annotations

import argparse
import errno
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import threading
import time
from types import ModuleType
from typing import BinaryIO, Callable


SCHEMA_VERSION = 1
PLUGIN_NAME = "team-harness"
REQUIRED_FEATURES = ("multi_agent", "multi_agent_v2")
DOMAIN_NAMES = ("bridge", "config", "runtime", "features", "agents", "mcp", "hooks")
OVERALL_STATUSES = {"current", "converged", "pending-approval", "partial-convergence"}
RECOVERY_INVOCATION = "$team-harness:update"
MAX_NATIVE_OUTPUT = 256 * 1024
NATIVE_TIMEOUT_SECONDS = 30
MAX_HOOK_MANIFEST = 64 * 1024
MAX_RECEIPT_BYTES = 128 * 1024
MAX_LIST_ITEMS = 128
WINDOWS_CREATE_NEW_PROCESS_GROUP = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)
WINDOWS_CTRL_BREAK_EVENT = getattr(signal, "CTRL_BREAK_EVENT", 1)
SAFE_NAME_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
SEMVER_RE = re.compile(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?")
NON_FATAL_ALIAS_WARNING = (
    "WARNING: proceeding, even though we could not create PATH aliases: "
    "Read-only file system (os error 30)"
)
HOOK_DIGESTS = {
    "hooks/hooks.json": "a4c33f0da7ea325d1454f638582fdadf2afcc1c1394e96588302dbf14495a207",
    "hooks/dist/codex-launcher.cjs": "ff444bd8ae65a96f62113888b31248f4778b9116823e1af1a5a7212c572fca64",
    "hooks/run-codex-hook.sh": "6e13c288ceed9feba3493d1eb886237971b96818d3819b0279917bc71496ac5b",
    "hooks/dist/policy-block.cjs": "1970f768289b7d6fc375dc882671f4740d0499bdf81feffd756224ba1ddf809d",
    "hooks/dist/gcp-guard.cjs": "1016604dbb885fa5dd58410c33a068f0c1979a3b2bc7a6b7da54b9c7268c8acc",
    "hooks/dist/gate-guard.cjs": "405d76c700ec7f225fd7935d16946fea16064a76b7b06b0951b33ab81006aa52",
}
HELPER_DIGESTS = {
    "skills/update/scripts/bridge_snapshot.py": "bb2a8c751cd5fb5609e701cf2f72f43f553d93f06d5f74b089a0eb45cc983ead",
    "skills/setup/scripts/manage_config.py": "49175207918335c7323deeb0cb38a6253c78b6595cd724c6b15e1c5ae46f4d31",
    "skills/setup/scripts/manage_runtime.py": "b96d3b25a82a039020954869e47b96001b6c957ae6578723f74f386c6a53f774",
    "skills/setup/scripts/manage_agents.py": "a70921b53baeab04c69cc377fbfc019f62ce000596fee3b06e90cc38acf71843",
}


class ConvergenceError(RuntimeError):
    def __init__(self, code: str, *, retry_with_escalation: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.retry_with_escalation = retry_with_escalation


NativeRunner = Callable[[list[str]], str]


def lexical_path(value: str) -> Path:
    return Path(os.path.abspath(os.path.expanduser(value)))


def codex_home_path() -> Path:
    raw = os.environ.get("CODEX_HOME")
    root = lexical_path(raw if raw else str(Path.home() / ".codex"))
    if not root.is_absolute():
        raise ConvergenceError("UNSAFE_CODEX_HOME")
    return root


def assert_regular_chain(path: Path, root: Path, *, directory: bool = False) -> None:
    """Reject links in every snapshot-owned component, not only the final leaf."""
    try:
        relative = path.relative_to(root)
    except ValueError as exc:
        raise ConvergenceError("PATH_OUTSIDE_CODEX_HOME") from exc
    current = root
    for part in relative.parts:
        current = current / part
        try:
            mode = current.lstat().st_mode
        except OSError as exc:
            raise ConvergenceError("SNAPSHOT_COMPONENT_UNAVAILABLE") from exc
        if stat.S_ISLNK(mode):
            raise ConvergenceError("SNAPSHOT_COMPONENT_SYMLINK")
    mode = path.lstat().st_mode
    if directory and not stat.S_ISDIR(mode):
        raise ConvergenceError("SNAPSHOT_COMPONENT_NOT_DIRECTORY")
    if not directory and not stat.S_ISREG(mode):
        raise ConvergenceError("SNAPSHOT_COMPONENT_NOT_REGULAR")


def validate_codex_binary(value: str) -> Path:
    raw = Path(value)
    if not raw.is_absolute() or ".." in raw.parts or any(ord(char) < 32 for char in value):
        raise ConvergenceError("CODEX_BINARY_INVALID")
    binary = Path(os.path.abspath(value))
    try:
        resolved = binary.resolve(strict=True)
        mode = resolved.stat().st_mode
    except OSError as exc:
        raise ConvergenceError("CODEX_BINARY_INVALID") from exc
    if binary != resolved or not stat.S_ISREG(mode) or mode & 0o111 == 0:
        raise ConvergenceError("CODEX_BINARY_INVALID")
    return resolved


def safe_native_env() -> dict[str, str]:
    root = codex_home_path()
    return {
        "CODEX_HOME": str(root),
        "HOME": str(root.parent),
        "PATH": "/usr/bin:/bin",
        "LANG": "C.UTF-8",
    }


def stop_process(process: subprocess.Popen[bytes]) -> None:
    if os.name == "nt":
        try:
            process.send_signal(WINDOWS_CTRL_BREAK_EVENT)
            return
        except OSError:
            pass
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except (AttributeError, OSError):
        try:
            process.kill()
        except OSError:
            pass


def terminate_process(process: subprocess.Popen[bytes]) -> None:
    stop_process(process)
    try:
        process.wait(timeout=1)
    except subprocess.TimeoutExpired:
        try:
            process.kill()
            process.wait(timeout=1)
        except (OSError, subprocess.TimeoutExpired):
            pass


def close_process_streams(process: subprocess.Popen[bytes]) -> None:
    if process.stdout is not None:
        process.stdout.close()
    if process.stderr is not None:
        process.stderr.close()


def process_group_options(platform: str | None = None) -> dict[str, object]:
    if (platform or os.name) == "nt":
        return {"creationflags": WINDOWS_CREATE_NEW_PROCESS_GROUP}
    return {"start_new_session": True}


def run_native(argv: list[str]) -> str:
    process: subprocess.Popen[bytes] | None = None
    try:
        process = subprocess.Popen(
            argv,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=safe_native_env(),
            **process_group_options(),
        )
    except OSError as exc:
        retry = exc.errno in {errno.EACCES, errno.EPERM, errno.EROFS}
        raise ConvergenceError(
            "NATIVE_COMMAND_WRITE_PROTECTED" if retry else "NATIVE_COMMAND_UNAVAILABLE",
            retry_with_escalation=retry,
        ) from exc
    assert process.stdout is not None and process.stderr is not None
    captured = {"stdout": bytearray(), "stderr": bytearray()}
    capture_lock = threading.Lock()
    output_too_large = threading.Event()
    stream_failed = threading.Event()

    def drain(name: str, stream: BinaryIO) -> None:
        try:
            while True:
                chunk = stream.read(64 * 1024)
                if not chunk:
                    return
                with capture_lock:
                    total = sum(len(value) for value in captured.values())
                    if total + len(chunk) > MAX_NATIVE_OUTPUT:
                        output_too_large.set()
                        return
                    captured[name].extend(chunk)
        except OSError:
            stream_failed.set()

    readers = [
        threading.Thread(target=drain, args=("stdout", process.stdout), daemon=True),
        threading.Thread(target=drain, args=("stderr", process.stderr), daemon=True),
    ]
    for reader in readers:
        reader.start()
    deadline = time.monotonic() + NATIVE_TIMEOUT_SECONDS
    while process.poll() is None or any(reader.is_alive() for reader in readers):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            terminate_process(process)
            close_process_streams(process)
            raise ConvergenceError("NATIVE_COMMAND_TIMEOUT")
        if output_too_large.is_set():
            terminate_process(process)
            close_process_streams(process)
            raise ConvergenceError("NATIVE_COMMAND_OUTPUT_TOO_LARGE")
        if stream_failed.is_set():
            terminate_process(process)
            close_process_streams(process)
            raise ConvergenceError("NATIVE_COMMAND_OUTPUT_INVALID")
        time.sleep(min(remaining, 0.01))
    if output_too_large.is_set():
        close_process_streams(process)
        raise ConvergenceError("NATIVE_COMMAND_OUTPUT_TOO_LARGE")
    if stream_failed.is_set():
        close_process_streams(process)
        raise ConvergenceError("NATIVE_COMMAND_OUTPUT_INVALID")
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        terminate_process(process)
        close_process_streams(process)
        raise ConvergenceError("NATIVE_COMMAND_TIMEOUT")
    try:
        return_code = process.wait(timeout=remaining)
    except subprocess.TimeoutExpired as exc:
        terminate_process(process)
        close_process_streams(process)
        raise ConvergenceError("NATIVE_COMMAND_TIMEOUT") from exc
    for reader in readers:
        reader.join(timeout=max(0, deadline - time.monotonic()))
    close_process_streams(process)
    try:
        stdout = captured["stdout"].decode("utf-8")
        stderr = captured["stderr"].decode("utf-8").strip()
    except UnicodeDecodeError as exc:
        raise ConvergenceError("NATIVE_COMMAND_OUTPUT_INVALID") from exc
    if return_code != 0:
        raise ConvergenceError("NATIVE_COMMAND_FAILED")
    if stderr and stderr != NON_FATAL_ALIAS_WARNING:
        raise ConvergenceError("NATIVE_COMMAND_UNEXPECTED_STDERR")
    return stdout


def load_module(name: str, path: Path) -> ModuleType:
    assert_regular_chain(path, codex_home_path())
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ConvergenceError("HELPER_LOAD_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_helpers(plugin: Path) -> dict[str, ModuleType]:
    setup = plugin / "skills/setup/scripts"
    update = plugin / "skills/update/scripts"
    return {
        "bridge": load_module("th_update_bridge", update / "bridge_snapshot.py"),
        "config": load_module("th_update_config", setup / "manage_config.py"),
        "runtime": load_module("th_update_runtime", setup / "manage_runtime.py"),
        "agents": load_module("th_update_agents", setup / "manage_agents.py"),
    }


def verify_helper_integrity(plugin: Path) -> None:
    root = codex_home_path()
    for relative, expected_digest in HELPER_DIGESTS.items():
        helper = plugin / relative
        assert_regular_chain(helper, root)
        try:
            digest = hashlib.sha256(helper.read_bytes()).hexdigest()
        except OSError as exc:
            raise ConvergenceError("HELPER_UNAVAILABLE") from exc
        if digest != expected_digest:
            raise ConvergenceError("HELPER_IDENTITY_MISMATCH")


def snapshot_identity(plugin: Path) -> str:
    root = codex_home_path()
    relative_paths = [
        ".codex-plugin/plugin.json",
        "skills/update/scripts/converge.py",
        *HELPER_DIGESTS,
        *HOOK_DIGESTS,
    ]
    digest = hashlib.sha256()
    for relative in sorted(relative_paths):
        artifact = plugin / relative
        assert_regular_chain(artifact, root)
        try:
            content = artifact.read_bytes()
        except OSError as exc:
            raise ConvergenceError("SNAPSHOT_IDENTITY_UNAVAILABLE") from exc
        digest.update(relative.encode())
        digest.update(b"\0")
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    return digest.hexdigest()


def validate_manifest(plugin: Path, expected_version: str) -> dict[str, str]:
    if not plugin.is_absolute() or ".." in plugin.parts:
        raise ConvergenceError("UNSAFE_PLUGIN_PATH")
    codex_root = codex_home_path()
    expected_parent = codex_root / "plugins/cache" / PLUGIN_NAME / PLUGIN_NAME
    expected_plugin = expected_parent / expected_version
    if plugin != expected_plugin:
        raise ConvergenceError("PLUGIN_CACHE_IDENTITY_MISMATCH")
    try:
        resolved = plugin.resolve(strict=True)
    except OSError as exc:
        raise ConvergenceError("UNSAFE_PLUGIN_PATH") from exc
    if resolved != plugin:
        raise ConvergenceError("UNSAFE_PLUGIN_PATH")
    assert_regular_chain(plugin, codex_root, directory=True)
    manifest_path = resolved / ".codex-plugin/plugin.json"
    assert_regular_chain(manifest_path, codex_root)
    try:
        raw = manifest_path.read_bytes()
        if len(raw) > 64 * 1024:
            raise ConvergenceError("MANIFEST_TOO_LARGE")
        manifest = json.loads(raw)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ConvergenceError("MANIFEST_INVALID") from exc
    if not isinstance(manifest, dict):
        raise ConvergenceError("MANIFEST_INVALID")
    version = manifest.get("version")
    if manifest.get("name") != PLUGIN_NAME or version != expected_version:
        raise ConvergenceError("MANIFEST_IDENTITY_MISMATCH")
    if not isinstance(version, str) or SEMVER_RE.fullmatch(version) is None:
        raise ConvergenceError("MANIFEST_VERSION_INVALID")
    return {"path": str(plugin), "version": version}


def parse_features(output: str) -> dict[str, bool]:
    features: dict[str, bool] = {}
    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = re.fullmatch(
            r"([a-z][a-z0-9_]*)\s{2,}([a-z][a-z0-9 -]*[a-z0-9])\s{2,}(true|false)",
            line,
        )
        if match is None:
            raise ConvergenceError("FEATURE_LIST_INVALID")
        name, stage, enabled_raw = match.groups()
        if (
            not re.fullmatch(r"[a-z][a-z0-9 -]*", stage)
            or name in features
        ):
            raise ConvergenceError("FEATURE_LIST_INVALID")
        features[name] = enabled_raw == "true"
    if any(name not in features for name in REQUIRED_FEATURES):
        raise ConvergenceError("REQUIRED_FEATURE_MISSING")
    return features


def converge_features(native_runner: NativeRunner, codex_bin: str, *, apply: bool = True) -> dict[str, object]:
    before = parse_features(native_runner([codex_bin, "features", "list"]))
    missing = [name for name in REQUIRED_FEATURES if not before[name]]
    if missing and not apply:
        raise ConvergenceError("ESCALATION_SCOPE_EXCEEDED")
    for name in missing:
        native_runner([codex_bin, "features", "enable", name])
    if missing:
        after = parse_features(native_runner([codex_bin, "features", "list"]))
        if any(not after[name] for name in REQUIRED_FEATURES):
            raise ConvergenceError("FEATURE_RECONCILIATION_INCOMPLETE")
    return {
        "status": "changed" if missing else "current",
        "changed": missing,
        "required": list(REQUIRED_FEATURES),
        "restartRequired": bool(missing),
    }


def valid_mcp_transport(value: object) -> bool:
    if not isinstance(value, dict) or not isinstance(value.get("type"), str):
        return False
    transport_type = value["type"]
    if transport_type == "streamable_http":
        allowed = {
            "type", "url", "bearer_token_env_var", "http_headers",
            "env_http_headers", "http_headers_helper",
        }
        return set(value) <= allowed and {"type", "url"} <= set(value) and isinstance(value.get("url"), str)
    if transport_type == "stdio":
        allowed = {"type", "command", "args", "env", "env_vars", "cwd"}
        return (
            set(value) <= allowed
            and {"type", "command", "args"} <= set(value)
            and isinstance(value.get("command"), str)
            and isinstance(value.get("args"), list)
            and all(isinstance(item, str) for item in value["args"])
        )
    return False


def inspect_mcp(native_runner: NativeRunner, codex_bin: str, expected: tuple[str, ...]) -> dict[str, object]:
    try:
        payload = json.loads(native_runner([codex_bin, "mcp", "list", "--json"]))
    except json.JSONDecodeError as exc:
        raise ConvergenceError("MCP_LIST_INVALID") from exc
    if not isinstance(payload, list):
        raise ConvergenceError("MCP_LIST_INVALID")
    if len(payload) > MAX_LIST_ITEMS:
        raise ConvergenceError("MCP_LIST_INVALID")
    allowed_item = {
        "name", "enabled", "disabled_reason", "transport", "startup_timeout_sec",
        "tool_timeout_sec", "auth_status",
    }
    registered: set[str] = set()
    for item in payload:
        if (
            not isinstance(item, dict)
            or not set(item) <= allowed_item
            or not {"name", "enabled", "transport"} <= set(item)
            or not isinstance(item.get("name"), str)
            or SAFE_NAME_RE.fullmatch(item["name"]) is None
            or not isinstance(item.get("enabled"), bool)
            or not valid_mcp_transport(item.get("transport"))
            or item["name"] in registered
        ):
            raise ConvergenceError("MCP_LIST_INVALID")
        if item["enabled"]:
            registered.add(item["name"])
    missing = [name for name in expected if name not in registered]
    return {
        "status": "preserved" if missing else "current",
        "registeredCount": len(registered),
        "missingExpected": missing,
        "restartRequired": False,
    }


def validate_hooks(plugin: Path) -> dict[str, object]:
    root = codex_home_path()
    for relative, expected_digest in HOOK_DIGESTS.items():
        artifact = plugin / relative
        assert_regular_chain(artifact, root)
        try:
            digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
        except OSError as exc:
            raise ConvergenceError("HOOK_ARTIFACT_UNAVAILABLE") from exc
        if digest != expected_digest:
            raise ConvergenceError("HOOK_ARTIFACT_IDENTITY_MISMATCH")
    path = plugin / "hooks/hooks.json"
    size = path.stat().st_size
    if size > MAX_HOOK_MANIFEST:
        raise ConvergenceError("HOOK_MANIFEST_TOO_LARGE")
    try:
        manifest = json.loads(path.read_bytes())
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ConvergenceError("HOOK_MANIFEST_INVALID") from exc
    if not isinstance(manifest, dict) or set(manifest) != {"description", "hooks"}:
        raise ConvergenceError("HOOK_MANIFEST_INVALID")
    hooks = manifest.get("hooks")
    if not isinstance(hooks, dict) or set(hooks) != {"PreToolUse"}:
        raise ConvergenceError("HOOK_MANIFEST_INVALID")
    groups = hooks["PreToolUse"]
    if not isinstance(groups, list):
        raise ConvergenceError("HOOK_MANIFEST_INVALID")
    if len(groups) != 2:
        raise ConvergenceError("HOOK_ADAPTER_COUNT_INVALID")
    for group in groups:
        if set(group) != {"matcher", "hooks"} or not isinstance(group["matcher"], str):
            raise ConvergenceError("HOOK_MANIFEST_INVALID")
        hooks_list = group["hooks"]
        if not isinstance(hooks_list, list) or len(hooks_list) != 1:
            raise ConvergenceError("HOOK_MANIFEST_INVALID")
        hook = hooks_list[0]
        if not isinstance(hook, dict) or set(hook) != {"type", "command", "commandWindows", "timeout", "statusMessage"}:
            raise ConvergenceError("HOOK_MANIFEST_INVALID")
        if hook["type"] != "command" or not isinstance(hook["command"], str) or hook["timeout"] != 10:
            raise ConvergenceError("HOOK_MANIFEST_INVALID")
        if not isinstance(hook["commandWindows"], str) or not hook["commandWindows"].strip():
            raise ConvergenceError("HOOK_MANIFEST_INVALID")
    return {"status": "current", "adapterCount": 2, "restartRequired": False}


def domain_error(exc: Exception) -> dict[str, object]:
    if isinstance(exc, ConvergenceError):
        code = exc.code
        retry = exc.retry_with_escalation
    elif isinstance(exc, OSError) and exc.errno in {errno.EACCES, errno.EPERM, errno.EROFS}:
        code = "WRITE_PROTECTED"
        retry = True
    else:
        code = "DOMAIN_FAILED"
        retry = False
    return {"status": "failed", "errorCode": code, "retryWithEscalation": retry, "restartRequired": False}


def redacted_runtime_path(value: object) -> str:
    if not isinstance(value, str):
        raise ConvergenceError("RUNTIME_CLASSIFICATION_INVALID")
    candidate = lexical_path(value)
    roots = (
        (codex_home_path(), "$CODEX_HOME"),
        (lexical_path(str(Path.cwd())), "$PROJECT"),
    )
    for root, label in roots:
        try:
            relative = candidate.relative_to(root)
            return label if not relative.parts else f"{label}/{'/'.join(relative.parts)}"
        except ValueError:
            continue
    digest = hashlib.sha256(str(candidate).encode()).hexdigest()[:12]
    return f"$EXTERNAL_ROOT/{digest}"


def runtime_pending_decision(
    runtime_state: dict[str, object],
    new_version: str,
    *,
    old_plugin: Path,
    new_plugin: Path,
    snapshot_digest: str,
) -> dict[str, object]:
    mismatched = runtime_state.get("mismatchedSettings", [])
    missing_roots = runtime_state.get("missingWritableRoots", [])
    missing_directories = runtime_state.get("missingDirectories", [])
    if (
        not isinstance(mismatched, list)
        or not isinstance(missing_roots, list)
        or not isinstance(missing_directories, list)
        or any(not isinstance(item, str) for item in [*mismatched, *missing_roots, *missing_directories])
        or any(len(items) > MAX_LIST_ITEMS for items in (mismatched, missing_roots, missing_directories))
    ):
        raise ConvergenceError("RUNTIME_CLASSIFICATION_INVALID")
    project_config = runtime_state.get("projectConfig")
    project_shadowing = bool(runtime_state.get("projectConfigShadowing"))
    project_path = None
    if project_shadowing:
        if not isinstance(project_config, dict):
            raise ConvergenceError("RUNTIME_CLASSIFICATION_INVALID")
        project_path = redacted_runtime_path(project_config.get("path"))
    raw_identity = {
        "version": new_version,
        "oldPlugin": str(old_plugin),
        "newPlugin": str(new_plugin),
        "snapshotDigest": snapshot_digest,
        "mismatchedSettings": sorted(mismatched),
        "missingWritableRoots": sorted(missing_roots),
        "missingDirectories": sorted(missing_directories),
        "projectConfigShadowing": project_shadowing,
        "projectConfigPath": project_config.get("path") if isinstance(project_config, dict) else None,
    }
    fingerprint = hashlib.sha256(
        json.dumps(raw_identity, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return {
        "kind": "runtime-profile",
        "mismatchedSettings": sorted(mismatched),
        "missingWritableRoots": [redacted_runtime_path(item) for item in sorted(missing_roots)],
        "missingDirectories": [redacted_runtime_path(item) for item in sorted(missing_directories)],
        "projectConfigShadowing": project_shadowing,
        "projectConfigPath": project_path,
        "approvalFingerprint": fingerprint,
    }


def empty_receipt(old_plugin: Path, old_version: str, new_plugin: Path, new_version: str) -> dict[str, object]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": "partial-convergence",
        "oldPlugin": {"path": str(old_plugin), "version": old_version},
        "newPlugin": {"path": str(new_plugin), "version": new_version},
        "domains": {name: {"status": "not-run", "restartRequired": False} for name in DOMAIN_NAMES},
        "changedDomains": [],
        "restartRequired": False,
        "pendingDecision": None,
        "failedDomain": "preflight",
        "recoveryInvocation": RECOVERY_INVOCATION,
    }


def validate_receipt(receipt: object) -> dict[str, object]:
    expected_top = {
        "schemaVersion", "status", "oldPlugin", "newPlugin", "domains",
        "changedDomains", "restartRequired", "pendingDecision", "failedDomain",
        "recoveryInvocation",
    }
    if not isinstance(receipt, dict) or set(receipt) != expected_top:
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    if receipt["schemaVersion"] != SCHEMA_VERSION or receipt["status"] not in OVERALL_STATUSES:
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    for identity in (receipt["oldPlugin"], receipt["newPlugin"]):
        if not isinstance(identity, dict) or set(identity) != {"path", "version"}:
            raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
        if not isinstance(identity["path"], str) or not isinstance(identity["version"], str):
            raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    domains = receipt["domains"]
    if not isinstance(domains, dict) or tuple(domains) != DOMAIN_NAMES:
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    domain_keys = {
        "bridge": {"status", "bridgeStatus", "restartRequired"},
        "config": {"status", "added", "removedLegacySelectors", "restartRequired"},
        "runtime": {"status", "restartRequired"},
        "features": {"status", "changed", "required", "restartRequired"},
        "agents": {"status", "scope", "changedCount", "customDefaultsPreserved", "restartRequired"},
        "mcp": {"status", "registeredCount", "missingExpected", "restartRequired"},
        "hooks": {"status", "adapterCount", "restartRequired"},
    }
    domain_statuses = {
        "bridge": {"not-run", "current", "changed", "preserved", "failed"},
        "config": {"not-run", "current", "changed", "failed"},
        "runtime": {"not-run", "current", "changed", "pending", "failed"},
        "features": {"not-run", "current", "changed", "failed"},
        "agents": {"not-run", "current", "changed", "failed"},
        "mcp": {"not-run", "current", "preserved", "failed"},
        "hooks": {"not-run", "current", "failed"},
    }
    for name, result in domains.items():
        if not isinstance(result, dict) or result.get("status") not in domain_statuses[name]:
            raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
        if not isinstance(result.get("restartRequired"), bool):
            raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
        if result["status"] in {"not-run", "pending"}:
            expected_keys = {"status", "restartRequired"}
        elif result["status"] == "failed":
            expected_keys = {"status", "errorCode", "retryWithEscalation", "restartRequired"}
            if SAFE_NAME_RE.fullmatch(str(result.get("errorCode", ""))) is None or not isinstance(result.get("retryWithEscalation"), bool):
                raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
        else:
            expected_keys = domain_keys[name]
        if set(result) != expected_keys:
            raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    for name in ("added", "removedLegacySelectors"):
        value = domains["config"].get(name, [])
        if not isinstance(value, list) or len(value) > MAX_LIST_ITEMS or any(not isinstance(item, str) for item in value):
            raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    for name in ("changed", "required"):
        value = domains["features"].get(name, [])
        if not isinstance(value, list) or len(value) > MAX_LIST_ITEMS or any(item not in REQUIRED_FEATURES for item in value):
            raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    missing_expected = domains["mcp"].get("missingExpected", [])
    if not isinstance(missing_expected, list) or len(missing_expected) > MAX_LIST_ITEMS or any(SAFE_NAME_RE.fullmatch(str(item)) is None for item in missing_expected):
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    bridge_status = domains["bridge"].get("bridgeStatus")
    if bridge_status is not None and bridge_status not in {
        "same-snapshot", "current", "linked", "relinked", "skipped-existing-path",
    }:
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    if domains["agents"].get("scope") is not None and domains["agents"]["scope"] not in {"project", "global"}:
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    for name, key in (("agents", "changedCount"), ("mcp", "registeredCount"), ("hooks", "adapterCount")):
        value = domains[name].get(key)
        if value is not None and (not isinstance(value, int) or isinstance(value, bool) or value < 0 or value > 4096):
            raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    custom_preserved = domains["agents"].get("customDefaultsPreserved")
    if custom_preserved is not None and not isinstance(custom_preserved, bool):
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    changed = receipt["changedDomains"]
    if (
        not isinstance(changed, list)
        or any(name not in DOMAIN_NAMES for name in changed)
        or len(changed) != len(set(changed))
        or not isinstance(receipt["restartRequired"], bool)
        or receipt["recoveryInvocation"] != RECOVERY_INVOCATION
    ):
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    pending = receipt["pendingDecision"]
    if pending is not None:
        pending_keys = {
            "kind", "mismatchedSettings", "missingWritableRoots", "missingDirectories",
            "projectConfigShadowing", "projectConfigPath", "approvalFingerprint",
        }
        if not isinstance(pending, dict) or set(pending) != pending_keys or pending.get("kind") != "runtime-profile":
            raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
        if not isinstance(pending["projectConfigShadowing"], bool):
            raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
        if not re.fullmatch(r"[0-9a-f]{64}", str(pending["approvalFingerprint"])):
            raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
        for key in ("mismatchedSettings", "missingWritableRoots", "missingDirectories"):
            values = pending[key]
            if not isinstance(values, list) or len(values) > MAX_LIST_ITEMS or any(not isinstance(item, str) or len(item) > 256 for item in values):
                raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
        if pending["projectConfigPath"] is not None and not isinstance(pending["projectConfigPath"], str):
            raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    if receipt["status"] == "pending-approval" and pending is None:
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    if receipt["status"] in {"current", "converged"} and pending is not None:
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    if receipt["status"] == "partial-convergence":
        if receipt["failedDomain"] not in {*DOMAIN_NAMES, "preflight"}:
            raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    elif receipt["failedDomain"] is not None:
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    derived_changed = [name for name in DOMAIN_NAMES if domains[name]["status"] == "changed"]
    if changed != derived_changed:
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    if receipt["restartRequired"] != any(result["restartRequired"] for result in domains.values()):
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    failed = [name for name in DOMAIN_NAMES if domains[name]["status"] == "failed"]
    if receipt["status"] == "partial-convergence":
        expected_failure = "bridge" if receipt["failedDomain"] == "preflight" else receipt["failedDomain"]
        if failed != [expected_failure]:
            raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    elif failed:
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    if (domains["runtime"]["status"] == "pending") != (pending is not None):
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    if receipt["status"] == "pending-approval" and domains["runtime"]["status"] != "pending":
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    if receipt["status"] == "current" and (derived_changed or pending is not None):
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    if receipt["status"] == "converged" and (not derived_changed or pending is not None):
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    if len(json.dumps(receipt, ensure_ascii=False).encode()) > MAX_RECEIPT_BYTES:
        raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
    return receipt


def run_convergence(
    args: argparse.Namespace,
    *,
    native_runner: NativeRunner | None = None,
) -> dict[str, object]:
    old_plugin = lexical_path(args.old_plugin)
    new_plugin = lexical_path(args.new_plugin)
    receipt = empty_receipt(old_plugin, args.old_version, new_plugin, args.new_version)
    changed: list[str] = []
    restart_required = False
    runtime_pending = False

    try:
        if SEMVER_RE.fullmatch(args.old_version) is None or SEMVER_RE.fullmatch(args.new_version) is None:
            raise ConvergenceError("VERSION_ARGUMENT_INVALID")
        codex_binary = validate_codex_binary(args.codex_bin)
        validate_manifest(new_plugin, args.new_version)
        verify_helper_integrity(new_plugin)
        new_snapshot_digest = snapshot_identity(new_plugin)
        helpers = load_helpers(new_plugin)
    except Exception as exc:
        receipt["domains"]["bridge"] = domain_error(exc)
        return receipt

    runner = native_runner if native_runner is not None else run_native
    codex_bin = str(codex_binary)

    def may_mutate(name: str) -> bool:
        return args.escalation_domain is None or args.escalation_domain == name

    def apply_domain(name: str, operation: Callable[[], dict[str, object]]) -> bool:
        nonlocal restart_required
        try:
            result = operation()
            if not isinstance(result, dict) or not isinstance(result.get("status"), str):
                raise ConvergenceError("DOMAIN_RESULT_INVALID")
            receipt["domains"][name] = result
            if result["status"] == "changed":
                changed.append(name)
            restart_required = restart_required or bool(result.get("restartRequired"))
            receipt["changedDomains"] = list(changed)
            receipt["restartRequired"] = restart_required
            return True
        except Exception as exc:
            receipt["domains"][name] = domain_error(exc)
            receipt["failedDomain"] = name
            receipt["changedDomains"] = list(changed)
            receipt["restartRequired"] = restart_required
            return False

    def bridge_operation() -> dict[str, object]:
        if not may_mutate("bridge"):
            new_snapshot, _ = helpers["bridge"].validate_new_snapshot(new_plugin)
            if old_plugin == new_snapshot:
                return {"status": "current", "bridgeStatus": "same-snapshot", "restartRequired": False}
            if old_plugin.is_symlink() and helpers["bridge"].link_target(old_plugin) == new_snapshot:
                return {"status": "current", "bridgeStatus": "current", "restartRequired": False}
            raise ConvergenceError("ESCALATION_SCOPE_EXCEEDED")
        result = helpers["bridge"].bridge_result(old_plugin, new_plugin)
        status = result.get("status")
        if status == "skipped-unmanaged-symlink":
            raise ConvergenceError("UNMANAGED_BRIDGE_SYMLINK")
        mapped = "changed" if status in {"linked", "relinked"} else "current"
        if status == "skipped-existing-path":
            mapped = "preserved"
        return {
            "status": mapped,
            "bridgeStatus": status,
            "restartRequired": bool(result.get("restartRequired")),
        }

    if not apply_domain("bridge", bridge_operation):
        return receipt

    def config_operation() -> dict[str, object]:
        result = helpers["config"].ensure_defaults_result(args.new_version, apply=may_mutate("config"))
        if result["changed"] and not may_mutate("config"):
            raise ConvergenceError("ESCALATION_SCOPE_EXCEEDED")
        return {
            "status": "changed" if result["changed"] else "current",
            "added": result["added"],
            "removedLegacySelectors": result["removedLegacySelectors"],
            "restartRequired": False,
        }

    if not apply_domain("config", config_operation):
        return receipt

    runtime_state: dict[str, object]
    try:
        runtime_state = helpers["runtime"].classify()
        if runtime_state.get("status") == "current":
            runtime_result = {"status": "current", "restartRequired": False}
        elif runtime_state.get("status") != "stale":
            raise ConvergenceError("RUNTIME_CLASSIFICATION_INVALID")
        else:
            pending = runtime_pending_decision(
                runtime_state,
                args.new_version,
                old_plugin=old_plugin,
                new_plugin=new_plugin,
                snapshot_digest=new_snapshot_digest,
            )
        if runtime_state.get("status") == "stale" and args.runtime_approval is not None:
            if args.escalation_domain is not None:
                raise ConvergenceError("RUNTIME_APPROVAL_ESCALATION_MIXED")
            if args.runtime_approval != pending["approvalFingerprint"]:
                raise ConvergenceError("RUNTIME_APPROVAL_MISMATCH")
            ensured = helpers["runtime"].ensure_result()
            runtime_result = {
                "status": "changed" if ensured["changed"] or ensured["createdDirectories"] else "current",
                "restartRequired": bool(ensured["restartRequired"]),
            }
        elif runtime_state.get("status") == "stale":
            runtime_pending = True
            receipt["pendingDecision"] = pending
            runtime_result = {"status": "pending", "restartRequired": False}
        receipt["domains"]["runtime"] = runtime_result
        if runtime_result["status"] == "changed":
            changed.append("runtime")
        restart_required = restart_required or bool(runtime_result["restartRequired"])
        receipt["changedDomains"] = list(changed)
        receipt["restartRequired"] = restart_required
    except Exception as exc:
        receipt["domains"]["runtime"] = domain_error(exc)
        receipt["failedDomain"] = "runtime"
        return receipt

    if not apply_domain("features", lambda: converge_features(runner, codex_bin, apply=may_mutate("features"))):
        return receipt

    def agents_operation() -> dict[str, object]:
        config = helpers["config"].read_json(helpers["config"].config_path())
        scope = helpers["config"].get_nested(config, "agent-scope")
        if scope not in {"project", "global"}:
            raise ConvergenceError("AGENT_SCOPE_INVALID")
        before = helpers["agents"].inspect_result(scope)
        conflicts = [row["role"] for row in before["agents"] if row["status"] == "conflict"]
        if conflicts:
            raise ConvergenceError("UNMANAGED_AGENT_CONFLICT")
        needs_sync = any(row["status"] != "current" for row in before["agents"])
        runtime_config = before["runtimeConfig"]
        needs_sync = needs_sync or runtime_config["status"] not in {"current", "custom-preserved"}
        needs_sync = needs_sync or runtime_config["projectDocFallbackStatus"] != "current"
        if not needs_sync:
            return {
                "status": "current",
                "scope": scope,
                "changedCount": 0,
                "customDefaultsPreserved": runtime_config["status"] == "custom-preserved",
                "restartRequired": False,
            }
        if not may_mutate("agents"):
            raise ConvergenceError("ESCALATION_SCOPE_EXCEEDED")
        synced = helpers["agents"].sync_result(scope)
        return {
            "status": "changed",
            "scope": scope,
            "changedCount": len(synced["changed"]),
            "customDefaultsPreserved": synced["runtimeConfig"]["status"] == "custom-preserved",
            "restartRequired": bool(synced["restartRequired"]),
        }

    if not apply_domain("agents", agents_operation):
        return receipt
    expected_mcp = tuple(dict.fromkeys(args.expected_mcp))
    if any(SAFE_NAME_RE.fullmatch(name) is None for name in expected_mcp) or len(expected_mcp) > MAX_LIST_ITEMS:
        receipt["domains"]["mcp"] = domain_error(ConvergenceError("EXPECTED_MCP_INVALID"))
        receipt["failedDomain"] = "mcp"
        return receipt
    if not apply_domain("mcp", lambda: inspect_mcp(runner, codex_bin, expected_mcp)):
        return receipt
    if not apply_domain("hooks", lambda: validate_hooks(new_plugin)):
        return receipt

    receipt["changedDomains"] = changed
    receipt["restartRequired"] = restart_required
    receipt["failedDomain"] = None
    if runtime_pending:
        receipt["status"] = "pending-approval"
    elif changed:
        receipt["status"] = "converged"
    else:
        receipt["status"] = "current"
    return receipt


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    root.add_argument("--old-plugin", required=True)
    root.add_argument("--old-version", required=True)
    root.add_argument("--new-plugin", required=True)
    root.add_argument("--new-version", required=True)
    root.add_argument("--codex-bin", required=True)
    root.add_argument("--runtime-approval")
    root.add_argument("--escalation-domain", choices=tuple(name for name in DOMAIN_NAMES if name != "runtime"))
    root.add_argument("--expected-mcp", action="append", default=[])
    return root


def main() -> int:
    args = parser().parse_args()
    receipt = validate_receipt(run_convergence(args))
    print(json.dumps(receipt, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
