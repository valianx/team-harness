#!/usr/bin/env python3
"""Manage runtime-native GitHub identity routes without handling token bytes."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
from typing import Any


TOKEN_RE = re.compile(r"(?:gh[pousr]_|github_pat_|sk-[A-Za-z0-9_-]{20,})")
ACCOUNT_RE = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9]|[-_](?=[A-Za-z0-9])){0,38}\Z")
HOST_RE = re.compile(
    r"(?=.{1,253}\Z)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*\Z"
)
GLOB_RE = re.compile(r"[*?\[\]]")
CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")
MAX_ROUTES = 64
ROUTE_KEYS = frozenset({"workspace", "account", "host", "config_dir"})


def runtime_root(runtime: str) -> Path:
    home = Path.home().resolve()
    if runtime == "claude":
        root = home / ".claude"
    elif runtime == "codex":
        raw = os.environ.get("CODEX_HOME", "").strip()
        root = Path(raw).expanduser() if raw else home / ".codex"
    elif runtime == "opencode":
        raw = os.environ.get("OPENCODE_CONFIG_DIR", "").strip()
        if raw:
            root = Path(raw).expanduser()
        else:
            xdg = os.environ.get("XDG_CONFIG_HOME", "").strip()
            base = Path(xdg).expanduser() if xdg else home / ".config"
            root = base / "opencode"
    else:
        raise ValueError(f"unsupported runtime: {runtime}")
    if not root.is_absolute():
        raise ValueError(f"{runtime} config root must be absolute")
    resolved = root.resolve(strict=False)
    if resolved in {Path(resolved.anchor), home}:
        raise ValueError(f"unsafe {runtime} config root: {resolved}")
    return resolved


def config_path(runtime: str) -> Path:
    return runtime_root(runtime) / ".team-harness.json"


def read_document(path: Path) -> dict[str, Any]:
    try:
        if path.is_symlink():
            raise ValueError(f"refusing symlink config: {path}")
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def safe_path(raw: Any, field: str, *, reject_home: bool = True) -> Path:
    if not isinstance(raw, str) or not raw or CONTROL_RE.search(raw) or GLOB_RE.search(raw):
        raise ValueError(f"{field} must be a non-empty absolute path without control or glob characters")
    candidate = Path(raw).expanduser()
    if not candidate.is_absolute() or ".." in candidate.parts:
        raise ValueError(f"{field} must be absolute without traversal")
    resolved = candidate.resolve(strict=False)
    forbidden = {Path(resolved.anchor)}
    if reject_home:
        forbidden.add(Path.home().resolve())
    if resolved in forbidden:
        raise ValueError(f"{field} cannot be a filesystem root or the user home")
    return resolved


def contains(parent: Path, child: Path) -> bool:
    return child == parent or parent in child.parents


def inside_worktree(path: Path) -> bool:
    try:
        result = subprocess.run(
            ["git", "-C", str(path), "rev-parse", "--is-inside-work-tree"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=5,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0 and result.stdout.strip() == "true"


def validate_config_dir(config_dir: Path, workspace: Path) -> None:
    if contains(workspace, config_dir):
        raise ValueError("config_dir cannot be inside its mapped workspace")
    if not config_dir.is_dir():
        raise ValueError(f"config_dir does not exist: {config_dir}")
    if inside_worktree(config_dir):
        raise ValueError(f"config_dir cannot be inside a git worktree: {config_dir}")
    hosts = config_dir / "hosts.yml"
    if not hosts.is_file() or hosts.is_symlink():
        raise ValueError(f"config_dir must contain a regular hosts.yml: {config_dir}")
    if stat.S_IMODE(hosts.stat().st_mode) != 0o600:
        raise ValueError(f"hosts.yml must have mode 0600: {hosts}")
    if stat.S_IMODE(config_dir.stat().st_mode) & 0o077:
        raise ValueError(f"config_dir must not grant group/world permissions: {config_dir}")


def normalize_routes(value: Any, *, verify_credentials: bool) -> list[dict[str, Any]]:
    if not isinstance(value, list) or len(value) > MAX_ROUTES:
        raise ValueError(f"github.account_routes must be an array with at most {MAX_ROUTES} entries")
    if TOKEN_RE.search(json.dumps(value, ensure_ascii=False)):
        raise ValueError("github.account_routes looks like it contains a secret")
    normalized: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for index, route in enumerate(value):
        if not isinstance(route, dict) or set(route) - ROUTE_KEYS:
            raise ValueError(f"route {index} must contain only: {', '.join(sorted(ROUTE_KEYS))}")
        workspace = safe_path(route.get("workspace"), f"route {index} workspace")
        account = route.get("account")
        if not isinstance(account, str) or ACCOUNT_RE.fullmatch(account) is None:
            raise ValueError(f"route {index} account is not a valid GitHub login")
        host_value = route.get("host", "github.com")
        if not isinstance(host_value, str) or HOST_RE.fullmatch(host_value) is None:
            raise ValueError(f"route {index} host is not a valid hostname")
        host = host_value.lower()
        identity = (host, str(workspace))
        if identity in seen:
            raise ValueError(f"duplicate route for {host} and {workspace}")
        seen.add(identity)
        item: dict[str, Any] = {
            "workspace": str(workspace),
            "host": host,
            "account": account,
        }
        config_value = route.get("config_dir")
        if config_value is not None:
            config_dir = safe_path(config_value, f"route {index} config_dir")
            if verify_credentials:
                validate_config_dir(config_dir, workspace)
            item["config_dir"] = str(config_dir)
        normalized.append(item)
    normalized.sort(key=lambda item: (item["host"], item["workspace"], item["account"]))
    return normalized


def configured_routes(document: dict[str, Any], *, verify_credentials: bool) -> list[dict[str, Any]]:
    github = document.get("github")
    if github is None:
        return []
    if not isinstance(github, dict):
        raise ValueError("github must be a JSON object")
    routes = github.get("account_routes", [])
    return normalize_routes(routes, verify_credentials=verify_credentials)


def write_atomic(path: Path, before: dict[str, Any], after: dict[str, Any]) -> bool:
    stable_before = {key: value for key, value in before.items() if key != "updated_at"}
    stable_after = {key: value for key, value in after.items() if key != "updated_at"}
    if stable_before == stable_after:
        return False
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.parent.is_symlink() or (path.exists() and path.is_symlink()):
        raise ValueError(f"refusing symlink config path: {path}")
    if path.exists():
        backup = path.with_name(path.name + ".bak")
        fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(path.read_bytes())
            stream.flush()
            os.fsync(stream.fileno())
    fd, temp_name = tempfile.mkstemp(prefix=path.name + ".tmp-", dir=path.parent)
    temp = Path(temp_name)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(after, stream, ensure_ascii=False, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
        os.chmod(path, 0o600)
    finally:
        temp.unlink(missing_ok=True)
    return True


def show(runtime: str) -> int:
    path = config_path(runtime)
    routes = configured_routes(read_document(path), verify_credentials=False)
    print(json.dumps({"runtime": runtime, "path": str(path), "routes": routes}, sort_keys=True))
    return 0


def configure(runtime: str, encoded: str) -> int:
    routes = normalize_routes(json.loads(encoded), verify_credentials=True)
    path = config_path(runtime)
    before = read_document(path)
    after = json.loads(json.dumps(before))
    github = after.get("github")
    if github is None:
        github = {}
        after["github"] = github
    if not isinstance(github, dict):
        raise ValueError("github must be a JSON object")
    github["account_routes"] = routes
    after["updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    changed = write_atomic(path, before, after)
    print(json.dumps({"runtime": runtime, "path": str(path), "changed": changed, "routeCount": len(routes)}, sort_keys=True))
    return 0


def resolve_identity(runtime: str, repo_root: str, host_value: str) -> int:
    host = host_value.lower()
    if HOST_RE.fullmatch(host) is None:
        raise ValueError("host is not a valid hostname")
    repo = safe_path(repo_root, "repo-root", reject_home=False)
    path = config_path(runtime)
    routes = configured_routes(read_document(path), verify_credentials=False)
    matches = [
        route
        for route in routes
        if route["host"] == host and contains(Path(route["workspace"]), repo)
    ]
    if not matches:
        print(json.dumps({"runtime": runtime, "status": "no-match", "host": host, "repoRoot": str(repo)}, sort_keys=True))
        return 0
    matches.sort(key=lambda route: len(Path(route["workspace"]).parts), reverse=True)
    selected = matches[0]
    tied = [route for route in matches if len(Path(route["workspace"]).parts) == len(Path(selected["workspace"]).parts)]
    if len(tied) != 1:
        raise ValueError(f"ambiguous longest-prefix GitHub identity route for {repo}")
    result: dict[str, Any] = {
        "runtime": runtime,
        "status": "matched",
        "host": selected["host"],
        "account": selected["account"],
        "workspace": selected["workspace"],
        "repoRoot": str(repo),
        "strategy": "account-switch",
    }
    if "config_dir" in selected:
        config_dir = Path(selected["config_dir"])
        validate_config_dir(config_dir, Path(selected["workspace"]))
        result["strategy"] = "isolated-config"
        result["configDir"] = str(config_dir)
    print(json.dumps(result, sort_keys=True))
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    root.add_argument("--runtime", choices=("claude", "codex", "opencode"), required=True)
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("show")
    configure_parser = commands.add_parser("configure")
    configure_parser.add_argument("--routes-json", required=True)
    resolve_parser = commands.add_parser("resolve")
    resolve_parser.add_argument("--repo-root", required=True)
    resolve_parser.add_argument("--host", default="github.com")
    return root


def main() -> int:
    args = parser().parse_args()
    if args.command == "show":
        return show(args.runtime)
    if args.command == "configure":
        return configure(args.runtime, args.routes_json)
    if args.command == "resolve":
        return resolve_identity(args.runtime, args.repo_root, args.host)
    raise AssertionError(args.command)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"manage_github_identities: {error}", file=sys.stderr)
        raise SystemExit(1) from None
