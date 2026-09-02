#!/usr/bin/env python3
"""Converge and verify the Codex Team Harness installation in one bounded pass."""

from __future__ import annotations

import argparse
import errno
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from types import ModuleType
from typing import Callable


SCHEMA_VERSION = 1
PLUGIN_NAME = "team-harness"
REQUIRED_FEATURES = ("multi_agent", "multi_agent_v2")
EXPECTED_HOOKS = ("policy-block", "gcp-guard", "gate-guard")
FORBIDDEN_HOOKS = ("dev-guard", "prepublish-guard", "worktree-guard")
DOMAIN_NAMES = ("bridge", "config", "runtime", "features", "agents", "mcp", "hooks")
OVERALL_STATUSES = {"current", "converged", "pending-approval", "partial-convergence"}
DOMAIN_STATUSES = {"not-run", "current", "changed", "pending", "preserved", "failed"}
RECOVERY_INVOCATION = "$team-harness:update"
MAX_NATIVE_OUTPUT = 256 * 1024
MAX_HOOK_MANIFEST = 64 * 1024
SEMVER_RE = re.compile(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?")
NON_FATAL_ALIAS_WARNING = (
    "WARNING: proceeding, even though we could not create PATH aliases: "
    "Read-only file system (os error 30)"
)


class ConvergenceError(RuntimeError):
    def __init__(self, code: str, *, retry_with_escalation: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.retry_with_escalation = retry_with_escalation


NativeRunner = Callable[[list[str]], str]


def lexical_path(value: str) -> Path:
    return Path(os.path.abspath(os.path.expanduser(value)))


def safe_native_env() -> dict[str, str]:
    allowed = {
        "PATH", "HOME", "USERPROFILE", "CODEX_HOME", "XDG_CONFIG_HOME",
        "TMPDIR", "TMP", "TEMP", "SYSTEMROOT", "COMSPEC", "PATHEXT",
    }
    return {key: value for key, value in os.environ.items() if key in allowed}


def run_native(argv: list[str]) -> str:
    try:
        result = subprocess.run(
            argv,
            text=True,
            capture_output=True,
            check=False,
            timeout=30,
            env=safe_native_env(),
        )
    except subprocess.TimeoutExpired as exc:
        raise ConvergenceError("NATIVE_COMMAND_TIMEOUT") from exc
    except OSError as exc:
        retry = exc.errno in {errno.EACCES, errno.EPERM, errno.EROFS}
        raise ConvergenceError(
            "NATIVE_COMMAND_WRITE_PROTECTED" if retry else "NATIVE_COMMAND_UNAVAILABLE",
            retry_with_escalation=retry,
        ) from exc
    if len(result.stdout.encode()) > MAX_NATIVE_OUTPUT or len(result.stderr.encode()) > MAX_NATIVE_OUTPUT:
        raise ConvergenceError("NATIVE_COMMAND_OUTPUT_TOO_LARGE")
    stderr = result.stderr.strip()
    if result.returncode != 0:
        raise ConvergenceError("NATIVE_COMMAND_FAILED")
    if stderr and stderr != NON_FATAL_ALIAS_WARNING:
        raise ConvergenceError("NATIVE_COMMAND_UNEXPECTED_STDERR")
    return result.stdout


def load_module(name: str, path: Path) -> ModuleType:
    if path.is_symlink() or not path.is_file():
        raise ConvergenceError("HELPER_NOT_REGULAR")
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


def validate_manifest(plugin: Path, expected_version: str) -> dict[str, str]:
    if not plugin.is_absolute() or ".." in plugin.parts:
        raise ConvergenceError("UNSAFE_PLUGIN_PATH")
    try:
        resolved = plugin.resolve(strict=True)
        lexical_parent = plugin.parent.resolve(strict=True)
    except OSError as exc:
        raise ConvergenceError("UNSAFE_PLUGIN_PATH") from exc
    if not resolved.is_dir() or resolved.is_symlink():
        raise ConvergenceError("UNSAFE_PLUGIN_PATH")
    cache_parent = resolved.parent
    if tuple(cache_parent.parts[-4:]) != ("plugins", "cache", PLUGIN_NAME, PLUGIN_NAME):
        raise ConvergenceError("UNSAFE_PLUGIN_PATH")
    if plugin.is_symlink() and lexical_parent != cache_parent:
        raise ConvergenceError("UNSAFE_PLUGIN_PATH")
    manifest_path = resolved / ".codex-plugin/plugin.json"
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise ConvergenceError("MANIFEST_NOT_REGULAR")
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
        try:
            prefix, enabled_raw = line.rsplit(None, 1)
            name = prefix.split(None, 1)[0]
        except ValueError as exc:
            raise ConvergenceError("FEATURE_LIST_INVALID") from exc
        if not re.fullmatch(r"[a-z][a-z0-9_]*", name) or enabled_raw not in {"true", "false"}:
            raise ConvergenceError("FEATURE_LIST_INVALID")
        features[name] = enabled_raw == "true"
    if any(name not in features for name in REQUIRED_FEATURES):
        raise ConvergenceError("REQUIRED_FEATURE_MISSING")
    return features


def converge_features(native_runner: NativeRunner) -> dict[str, object]:
    before = parse_features(native_runner(["codex", "features", "list"]))
    missing = [name for name in REQUIRED_FEATURES if not before[name]]
    for name in missing:
        native_runner(["codex", "features", "enable", name])
    if missing:
        after = parse_features(native_runner(["codex", "features", "list"]))
        if any(not after[name] for name in REQUIRED_FEATURES):
            raise ConvergenceError("FEATURE_RECONCILIATION_INCOMPLETE")
    return {
        "status": "changed" if missing else "current",
        "changed": missing,
        "required": list(REQUIRED_FEATURES),
        "restartRequired": bool(missing),
    }


def inspect_mcp(native_runner: NativeRunner, expected: tuple[str, ...]) -> dict[str, object]:
    try:
        payload = json.loads(native_runner(["codex", "mcp", "list", "--json"]))
    except json.JSONDecodeError as exc:
        raise ConvergenceError("MCP_LIST_INVALID") from exc
    if not isinstance(payload, list):
        raise ConvergenceError("MCP_LIST_INVALID")
    registered: list[str] = []
    for item in payload:
        if not isinstance(item, dict) or not isinstance(item.get("name"), str):
            raise ConvergenceError("MCP_LIST_INVALID")
        enabled = item.get("enabled")
        if enabled is not None and not isinstance(enabled, bool):
            raise ConvergenceError("MCP_LIST_INVALID")
        if enabled is not False:
            registered.append(item["name"])
    missing = [name for name in expected if name not in registered]
    return {
        "status": "preserved" if missing else "current",
        "registered": sorted(registered),
        "missingExpected": missing,
        "restartRequired": False,
    }


def validate_hooks(plugin: Path) -> dict[str, object]:
    path = plugin / "hooks/hooks.json"
    if path.is_symlink() or not path.is_file():
        raise ConvergenceError("HOOK_MANIFEST_NOT_REGULAR")
    size = path.stat().st_size
    if size > MAX_HOOK_MANIFEST:
        raise ConvergenceError("HOOK_MANIFEST_TOO_LARGE")
    try:
        manifest = json.loads(path.read_bytes())
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ConvergenceError("HOOK_MANIFEST_INVALID") from exc
    if not isinstance(manifest, dict) or set(manifest) - {"description", "hooks"}:
        raise ConvergenceError("HOOK_MANIFEST_INVALID")
    hooks = manifest.get("hooks")
    if not isinstance(hooks, dict) or set(hooks) != {"PreToolUse"}:
        raise ConvergenceError("HOOK_MANIFEST_INVALID")
    groups = hooks["PreToolUse"]
    if not isinstance(groups, list):
        raise ConvergenceError("HOOK_MANIFEST_INVALID")
    commands: list[str] = []
    for group in groups:
        if not isinstance(group, dict) or not isinstance(group.get("hooks"), list):
            raise ConvergenceError("HOOK_MANIFEST_INVALID")
        for hook in group["hooks"]:
            if not isinstance(hook, dict) or hook.get("type") != "command":
                raise ConvergenceError("HOOK_MANIFEST_INVALID")
            command = hook.get("command")
            if not isinstance(command, str):
                raise ConvergenceError("HOOK_MANIFEST_INVALID")
            commands.append(command)
    if len(commands) != 2:
        raise ConvergenceError("HOOK_ADAPTER_COUNT_INVALID")
    joined = "\n".join(commands)
    if any(name not in joined for name in EXPECTED_HOOKS):
        raise ConvergenceError("HOOK_FLOOR_MISSING")
    if any(name in joined for name in FORBIDDEN_HOOKS) or "PermissionRequest" in joined:
        raise ConvergenceError("HOOK_SURFACE_UNSUPPORTED")
    if any(
        token not in command
        for command in commands
        for token in ("PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT", "plugin runtime missing")
    ):
        raise ConvergenceError("HOOK_RECOVERY_INVALID")
    return {"status": "current", "adapterCount": len(commands), "restartRequired": False}


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
    for result in domains.values():
        if not isinstance(result, dict) or result.get("status") not in DOMAIN_STATUSES:
            raise ConvergenceError("RECEIPT_SCHEMA_INVALID")
        if not isinstance(result.get("restartRequired"), bool):
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
        if not isinstance(pending, dict) or pending.get("kind") != "runtime-profile":
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
    return receipt


def run_convergence(
    args: argparse.Namespace,
    *,
    native_runner: NativeRunner = run_native,
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
        validate_manifest(new_plugin, args.new_version)
        helpers = load_helpers(new_plugin)
    except Exception as exc:
        receipt["domains"]["bridge"] = domain_error(exc)
        return receipt

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
        result = helpers["config"].ensure_defaults_result(args.new_version)
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
        elif args.authorize_runtime:
            ensured = helpers["runtime"].ensure_result()
            runtime_result = {
                "status": "changed" if ensured["changed"] or ensured["createdDirectories"] else "current",
                "restartRequired": bool(ensured["restartRequired"]),
            }
        else:
            runtime_pending = True
            pending = {
                "kind": "runtime-profile",
                "mismatchedSettings": runtime_state.get("mismatchedSettings", []),
                "missingWritableRoots": runtime_state.get("missingWritableRoots", []),
                "missingDirectories": runtime_state.get("missingDirectories", []),
                "projectConfigShadowing": bool(runtime_state.get("projectConfigShadowing")),
                "projectConfigPath": (runtime_state.get("projectConfig") or {}).get("path")
                if isinstance(runtime_state.get("projectConfig"), dict) else None,
            }
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

    if not apply_domain("features", lambda: converge_features(native_runner)):
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
    if not apply_domain("mcp", lambda: inspect_mcp(native_runner, expected_mcp)):
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
    root.add_argument("--authorize-runtime", action="store_true")
    root.add_argument("--expected-mcp", action="append", default=[])
    return root


def main() -> int:
    args = parser().parse_args()
    receipt = validate_receipt(run_convergence(args))
    print(json.dumps(receipt, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
