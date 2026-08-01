#!/usr/bin/env python3
"""Safely inspect and update Team Harness' Codex-native settings document."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from typing import Any


ALLOWED_KEYS = {
    "logs-mode",
    "logs-path",
    "logs-subfolder",
    "language",
    "english_learning",
    "flow_telemetry.enabled",
    "clickup.workspace_id",
    "obsidian_tasks",
    "lane_autoselect",
}
IMPORT_EXCLUDED_KEYS = {
    "format_version",
    "installed_version",
    "updated_at",
    "migration",
}
TOKEN_RE = re.compile(r"(?:gh[pousr]_|github_pat_|sk-[A-Za-z0-9])")
GLOB_RE = re.compile(r"[*?\[\]]")
SENSITIVE_KEY_RE = re.compile(r"(?:token|secret|password|api[_-]?key|authorization|bearer)", re.I)


def config_root() -> Path:
    raw = os.environ.get("CODEX_HOME", "").strip()
    root = Path(raw).expanduser() if raw else Path.home() / ".codex"
    resolved = root.resolve(strict=False)
    if resolved == Path(resolved.anchor) or resolved == Path.home().resolve():
        raise ValueError(f"unsafe Codex config root: {resolved}")
    return resolved


def config_path() -> Path:
    return config_root() / ".team-harness.json"


def opencode_config_path() -> Path:
    override = os.environ.get("OPENCODE_CONFIG_DIR", "").strip()
    if override:
        candidate = Path(override).expanduser()
        if not candidate.is_absolute() or ".." in candidate.parts:
            raise ValueError("OPENCODE_CONFIG_DIR must be absolute without traversal")
        return candidate.resolve(strict=False) / ".team-harness.json"
    xdg = os.environ.get("XDG_CONFIG_HOME", "").strip()
    root = Path(xdg).expanduser() if xdg else Path.home() / ".config"
    if not root.is_absolute():
        raise ValueError("XDG_CONFIG_HOME must be absolute")
    return root.resolve(strict=False) / "opencode" / ".team-harness.json"


def import_sources() -> dict[str, Path]:
    return {
        "claude": Path.home() / ".claude" / ".team-harness.json",
        "opencode": opencode_config_path(),
    }


def read_json(path: Path, *, missing_ok: bool = True) -> dict[str, Any]:
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        if missing_ok:
            return {}
        raise
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def get_nested(doc: dict[str, Any], dotted: str) -> Any:
    current: Any = doc
    for part in dotted.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def set_nested(doc: dict[str, Any], dotted: str, value: Any) -> None:
    parts = dotted.split(".")
    current = doc
    for part in parts[:-1]:
        child = current.get(part)
        if not isinstance(child, dict):
            child = {}
            current[part] = child
        current = child
    current[parts[-1]] = value


def remove_nested(doc: dict[str, Any], dotted: str) -> None:
    parts = dotted.split(".")
    current: Any = doc
    parents: list[tuple[dict[str, Any], str]] = []
    for part in parts[:-1]:
        if not isinstance(current, dict) or not isinstance(current.get(part), dict):
            return
        parents.append((current, part))
        current = current[part]
    if isinstance(current, dict):
        current.pop(parts[-1], None)
    for parent, part in reversed(parents):
        if parent.get(part) == {}:
            parent.pop(part)


def redact_for_display(value: Any, key: str = "") -> Any:
    if SENSITIVE_KEY_RE.search(key):
        return "<redacted>"
    if isinstance(value, dict):
        return {name: redact_for_display(child, name) for name, child in value.items()}
    if isinstance(value, list):
        return [redact_for_display(child, key) for child in value]
    if isinstance(value, str) and TOKEN_RE.search(value):
        return "<redacted>"
    return value


def displayable_config(doc: dict[str, Any]) -> dict[str, Any]:
    """Return only the supported settings and helper-owned metadata.

    Imported documents may contain arbitrary runtime-specific values. Those
    values are preserved on disk, but `show` must never become a generic JSON
    dumper for them, even when their key names do not look sensitive.
    """
    shown: dict[str, Any] = {}
    for key in sorted(ALLOWED_KEYS | {"format_version", "installed_version", "updated_at"}):
        value = get_nested(doc, key)
        if value is not None:
            set_nested(shown, key, redact_for_display(value, key))
    if isinstance(doc.get("migration"), dict):
        shown["migration"] = redact_for_display(doc["migration"], "migration")
    return shown


def import_missing(target: dict[str, Any], source: dict[str, Any], prefix: str = "") -> list[str]:
    imported: list[str] = []
    for key, source_value in source.items():
        if not prefix and key in IMPORT_EXCLUDED_KEYS:
            continue
        dotted = f"{prefix}.{key}" if prefix else key
        if key not in target:
            target[key] = json.loads(json.dumps(source_value))
            imported.append(dotted)
            continue
        target_value = target[key]
        if isinstance(target_value, dict) and isinstance(source_value, dict):
            imported.extend(import_missing(target_value, source_value, dotted))
    return imported


def classify_import(target: dict[str, Any], source: dict[str, Any], prefix: str = "") -> tuple[list[str], list[str]]:
    importable: list[str] = []
    conflicts: list[str] = []
    for key, source_value in source.items():
        if not prefix and key in IMPORT_EXCLUDED_KEYS:
            continue
        dotted = f"{prefix}.{key}" if prefix else key
        if key not in target:
            importable.append(dotted)
            continue
        target_value = target[key]
        if isinstance(target_value, dict) and isinstance(source_value, dict):
            nested_importable, nested_conflicts = classify_import(target_value, source_value, dotted)
            importable.extend(nested_importable)
            conflicts.extend(nested_conflicts)
        else:
            conflicts.append(dotted)
    return importable, conflicts


def validate(key: str, value: Any) -> None:
    if key not in ALLOWED_KEYS:
        raise ValueError(f"unsupported setting: {key}")
    encoded = json.dumps(value, ensure_ascii=False)
    if TOKEN_RE.search(encoded):
        raise ValueError(f"{key} looks like it contains a secret")
    if key == "logs-mode" and value not in {"local", "obsidian"}:
        raise ValueError("logs-mode must be local or obsidian")
    if key == "logs-path":
        if not isinstance(value, str) or not value:
            raise ValueError("logs-path must be a non-empty absolute path")
        path = Path(value).expanduser()
        resolved = path.resolve(strict=False)
        if not path.is_absolute() or resolved in {Path(resolved.anchor), Path.home().resolve()}:
            raise ValueError("logs-path must be absolute and cannot be a root or the user home")
        if ".." in path.parts or GLOB_RE.search(value):
            raise ValueError("logs-path cannot contain traversal or glob syntax")
    if key == "logs-subfolder":
        if not isinstance(value, str) or not value or Path(value).is_absolute():
            raise ValueError("logs-subfolder must be a non-empty relative path")
        if ".." in Path(value).parts or GLOB_RE.search(value):
            raise ValueError("logs-subfolder cannot contain traversal or glob syntax")
    if key == "language" and (
        not isinstance(value, str) or re.fullmatch(r"[a-z]{2}", value) is None
    ):
        raise ValueError("language must be a two-letter lowercase code")
    if key in {"english_learning", "flow_telemetry.enabled", "obsidian_tasks"} and not isinstance(value, bool):
        raise ValueError(f"{key} must be a JSON boolean")
    if key == "lane_autoselect" and value not in {
        "announce-and-proceed-on-trivial",
        "always-stop",
    }:
        raise ValueError("invalid lane_autoselect value")
    if key == "clickup.workspace_id" and not isinstance(value, str):
        raise ValueError("clickup.workspace_id must be a string")


def write_atomic(path: Path, before: dict[str, Any], after: dict[str, Any]) -> bool:
    if before == after:
        return False
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
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


def parse_assignment(raw: str) -> tuple[str, Any]:
    key, separator, encoded = raw.partition("=")
    if not separator:
        raise ValueError(f"expected KEY=JSON: {raw}")
    value = json.loads(encoded)
    validate(key, value)
    return key, value


def show() -> int:
    path = config_path()
    doc = read_json(path)
    sources = import_sources()
    result = {
        "path": str(path),
        "exists": path.exists(),
        "legacyAvailable": not path.exists() and sources["claude"].is_file(),
        "importSources": [
            {"source": name, "path": str(source), "available": source.is_file()}
            for name, source in sources.items()
        ],
        "config": displayable_config(doc),
        "preservedOpaqueTopLevelKeys": sum(
            1
            for key in doc
            if key not in {item.split(".", 1)[0] for item in ALLOWED_KEYS}
            | {"format_version", "installed_version", "updated_at", "migration"}
        ),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


def set_values(assignments: list[str], removals: list[str], version: str | None) -> int:
    path = config_path()
    before = read_json(path)
    after = json.loads(json.dumps(before))
    for raw in assignments:
        key, value = parse_assignment(raw)
        set_nested(after, key, value)
    for key in removals:
        if key not in ALLOWED_KEYS:
            raise ValueError(f"unsupported setting: {key}")
        remove_nested(after, key)
    after["format_version"] = "1"
    if version is not None:
        if re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?", version) is None:
            raise ValueError("version must be a semantic version")
        after["installed_version"] = version
    after["updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    changed = write_atomic(path, before, after)
    print(json.dumps({"path": str(path), "changed": changed}, sort_keys=True))
    return 0


def inspect_import(source_name: str) -> int:
    target = read_json(config_path())
    source_path = import_sources()[source_name]
    source = read_json(source_path, missing_ok=False)
    importable, conflicts = classify_import(target, source)
    print(json.dumps({
        "source": source_name,
        "sourcePath": str(source_path),
        "importableKeys": sorted(importable),
        "preservedNativeKeys": sorted(conflicts),
        "excludedKeys": sorted(key for key in source if key in IMPORT_EXCLUDED_KEYS),
    }, sort_keys=True))
    return 0


def import_config(source_name: str, version: str | None) -> int:
    path = config_path()
    before = read_json(path)
    source_path = import_sources()[source_name]
    source = read_json(source_path, missing_ok=False)
    after = json.loads(json.dumps(before))
    imported = import_missing(after, source)
    after["format_version"] = "1"
    if version is not None:
        after["installed_version"] = version
    now = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    after["updated_at"] = now
    if imported:
        migration = after.setdefault("migration", {})
        if not isinstance(migration, dict):
            migration = {}
            after["migration"] = migration
        history = migration.setdefault("imports", [])
        if not isinstance(history, list):
            history = []
            migration["imports"] = history
        history.append({
            "source": source_name,
            "path": str(source_path),
            "keys": imported,
            "at": now,
        })
    changed = write_atomic(path, before, after)
    print(json.dumps({
        "path": str(path),
        "changed": changed,
        "source": source_name,
        "sourcePath": str(source_path),
        "imported": imported,
    }, sort_keys=True))
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("show")
    setter = commands.add_parser("set")
    setter.add_argument("--set", dest="assignments", action="append", default=[])
    setter.add_argument("--remove", action="append", default=[])
    setter.add_argument("--version")
    importer = commands.add_parser("import")
    importer.add_argument("--from", dest="source", choices=("claude", "opencode"), required=True)
    importer.add_argument("--version")
    inspector = commands.add_parser("inspect-import")
    inspector.add_argument("--from", dest="source", choices=("claude", "opencode"), required=True)
    legacy_importer = commands.add_parser("import-legacy")
    legacy_importer.add_argument("--version")
    return root


def main() -> int:
    args = parser().parse_args()
    if args.command == "show":
        return show()
    if args.command == "set":
        return set_values(args.assignments, args.remove, args.version)
    if args.command == "import":
        return import_config(args.source, args.version)
    if args.command == "inspect-import":
        return inspect_import(args.source)
    if args.command == "import-legacy":
        return import_config("claude", args.version)
    raise AssertionError(args.command)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"manage_config: {error}", file=sys.stderr)
        raise SystemExit(1)
