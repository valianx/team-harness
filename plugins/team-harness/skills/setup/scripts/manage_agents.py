#!/usr/bin/env python3
"""Inspect or reconcile the ten bundled Team Harness Codex agents."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile


ROLES = (
    "architect",
    "implementer",
    "tester",
    "qa",
    "security",
    "delivery",
    "reviewer",
    "pr-review-qa",
    "pr-review-security",
    "reviewer-consolidator",
)
MANAGED_MARKER = "# Code generated from runtime/schema/codex-agents.json; DO NOT EDIT."


def codex_root(scope: str) -> Path:
    if scope == "project":
        root = Path.cwd() / ".codex"
    else:
        raw = os.environ.get("CODEX_HOME", "").strip()
        root = Path(raw).expanduser() if raw else Path.home() / ".codex"
    resolved = root.resolve(strict=False)
    if resolved == Path(resolved.anchor) or resolved == Path.home().resolve():
        raise ValueError(f"unsafe Codex root: {resolved}")
    return resolved


def source_dir() -> Path:
    source = Path(__file__).resolve().parent.parent / "assets" / "agents"
    if not source.is_dir():
        raise ValueError(f"bundled agent directory is missing: {source}")
    return source


def classify(source: Path, target: Path) -> str:
    if not target.exists() and not target.is_symlink():
        return "missing"
    if target.is_symlink() or not target.is_file():
        return "conflict"
    target_bytes = target.read_bytes()
    if target_bytes == source.read_bytes():
        return "current"
    first_line = target.read_text(encoding="utf-8", errors="replace").splitlines()[:1]
    return "stale" if first_line == [MANAGED_MARKER] else "conflict"


def inventory(scope: str) -> tuple[Path, list[dict[str, str]]]:
    root = codex_root(scope)
    source = source_dir()
    agents = root / "agents"
    rows = []
    for role in ROLES:
        src = source / f"{role}.toml"
        if not src.is_file() or src.is_symlink():
            raise ValueError(f"invalid bundled agent: {src}")
        dest = agents / f"{role}.toml"
        rows.append({"role": role, "path": str(dest), "status": classify(src, dest)})
    return agents, rows


def write_atomic(source: Path, target: Path) -> None:
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if target.parent.is_symlink():
        raise ValueError(f"refusing symlink agent directory: {target.parent}")
    if target.exists():
        backup = target.with_name(target.name + ".bak")
        if backup.is_symlink() or (backup.exists() and not backup.is_file()):
            raise ValueError(f"refusing unsafe agent backup: {backup}")
        shutil.copyfile(target, backup)
        os.chmod(backup, 0o600)
    fd, temp_name = tempfile.mkstemp(prefix=target.name + ".tmp-", dir=target.parent)
    temp = Path(temp_name)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(source.read_bytes())
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, target)
        os.chmod(target, 0o600)
    finally:
        temp.unlink(missing_ok=True)


def inspect(scope: str) -> int:
    agents, rows = inventory(scope)
    print(json.dumps({"scope": scope, "directory": str(agents), "agents": rows}, sort_keys=True))
    return 0


def sync(scope: str) -> int:
    agents, before = inventory(scope)
    conflicts = [row for row in before if row["status"] == "conflict"]
    if conflicts:
        names = ", ".join(row["role"] for row in conflicts)
        raise ValueError(f"unmanaged or unsafe agent file conflict: {names}")
    source = source_dir()
    changed = []
    for row in before:
        if row["status"] in {"missing", "stale"}:
            write_atomic(source / f"{row['role']}.toml", Path(row["path"]))
            changed.append(row["role"])
    _, after = inventory(scope)
    modes = {
        row["role"]: oct(stat.S_IMODE(Path(row["path"]).stat().st_mode))
        for row in after
    }
    print(json.dumps({
        "scope": scope,
        "directory": str(agents),
        "changed": changed,
        "agents": after,
        "modes": modes,
    }, sort_keys=True))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("inspect", "sync"))
    parser.add_argument("--scope", choices=("project", "global"), required=True)
    args = parser.parse_args()
    return inspect(args.scope) if args.command == "inspect" else sync(args.scope)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"manage_agents: {error}", file=os.sys.stderr)
        raise SystemExit(1)
