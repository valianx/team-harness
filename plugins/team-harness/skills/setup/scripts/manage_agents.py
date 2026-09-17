#!/usr/bin/env python3
"""Inspect and reconcile the bundled Team Harness Codex agents."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
import tomllib


ROLES = (
    "architect",
    "implementer",
    "tester",
    "cleaner",
    "qa",
    "security",
    "inline-reviewer",
    "delivery",
    "pipeline-architect",
    "pipeline-implementer",
    "pipeline-tester",
    "pipeline-cleaner",
    "pipeline-qa",
    "pipeline-security",
    "pipeline-delivery",
    "reviewer",
    "pr-review-qa",
    "pr-review-security",
    "pr-review-verifier",
    "reviewer-consolidator",
)
MANAGED_MARKER = "# Code generated from runtime/schema/codex-agents.json; DO NOT EDIT."
PROJECT_DOC_FALLBACK = "CLAUDE.md"


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


def runtime_config_path(scope: str) -> Path:
    return codex_root(scope) / "config.toml"


def read_runtime_config(path: Path) -> tuple[bytes | None, dict[str, object]]:
    """Read project-document discovery without changing native runtime config."""
    if not path.exists() and not path.is_symlink():
        return None, {}
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"unsafe Codex runtime config: {path}")
    raw = path.read_bytes()
    try:
        parsed = tomllib.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, tomllib.TOMLDecodeError) as error:
        raise ValueError(f"invalid Codex runtime config: {path}: {error}") from error
    fallbacks = parsed.get("project_doc_fallback_filenames", [])
    if not isinstance(fallbacks, list) or any(not isinstance(value, str) for value in fallbacks):
        raise ValueError("project_doc_fallback_filenames must be an array of strings")
    return raw, parsed


def inspect_runtime_config(path: Path) -> dict[str, object]:
    raw, parsed = read_runtime_config(path)
    fallbacks = parsed.get("project_doc_fallback_filenames", [])
    return {
        "path": str(path),
        "status": "observed" if raw is not None else "absent",
        "projectDocFallbackFilenames": fallbacks,
        "projectDocFallbackStatus": "present" if PROJECT_DOC_FALLBACK in fallbacks else "absent",
        "exists": raw is not None,
    }


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


def inspect_result(scope: str) -> dict[str, object]:
    agents, rows = inventory(scope)
    return {
        "scope": scope,
        "directory": str(agents),
        "agents": rows,
        "runtimeConfig": inspect_runtime_config(runtime_config_path(scope)),
    }


def inspect(scope: str) -> int:
    print(json.dumps(inspect_result(scope), sort_keys=True))
    return 0


def sync_result(scope: str) -> dict[str, object]:
    agents, before = inventory(scope)
    conflicts = [row["role"] for row in before if row["status"] == "conflict"]
    if conflicts:
        names = ", ".join(conflicts)
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
    return {
        "scope": scope,
        "directory": str(agents),
        "changed": changed,
        "agents": after,
        "modes": modes,
        "runtimeConfig": inspect_runtime_config(runtime_config_path(scope)),
    }


def sync(scope: str) -> int:
    print(json.dumps(sync_result(scope), sort_keys=True))
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
