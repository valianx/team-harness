#!/usr/bin/env python3
"""Inspect or reconcile Team Harness' global Codex execution defaults."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile
import tomllib
from typing import Any


TOP_LEVEL_DEFAULTS = {
    "sandbox_mode": "workspace-write",
    "approval_policy": "on-request",
    "approvals_reviewer": "auto_review",
}
STANDARD_WRITABLE_ROOTS = (
    "~/.cache/go-build",
    "~/.cache/uv",
    "~/.npm",
    "~/go/pkg/mod",
)
SECTION = "sandbox_workspace_write"


def codex_root() -> Path:
    raw = os.environ.get("CODEX_HOME", "").strip()
    root = Path(raw).expanduser() if raw else Path.home() / ".codex"
    resolved = root.resolve(strict=False)
    if resolved == Path(resolved.anchor) or resolved == Path.home().resolve():
        raise ValueError(f"unsafe Codex root: {resolved}")
    return resolved


def runtime_config_path() -> Path:
    return codex_root() / "config.toml"


def settings_path() -> Path:
    return codex_root() / ".team-harness.json"


def read_settings() -> dict[str, Any]:
    path = settings_path()
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def read_runtime_config() -> tuple[bytes | None, dict[str, Any]]:
    path = runtime_config_path()
    if not path.exists() and not path.is_symlink():
        return None, {}
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"unsafe Codex runtime config: {path}")
    raw = path.read_bytes()
    try:
        parsed = tomllib.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, tomllib.TOMLDecodeError) as error:
        raise ValueError(f"invalid Codex runtime config: {path}: {error}") from error
    return raw, parsed


def validate_relative_subfolder(value: object) -> Path:
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        raise ValueError("logs-subfolder must be a non-empty relative path")
    relative = Path(value)
    if ".." in relative.parts or re.search(r"[*?\[\]]", value):
        raise ValueError("logs-subfolder cannot contain traversal or glob syntax")
    return relative


def obsidian_workspace_root(settings: dict[str, Any]) -> Path | None:
    if settings.get("logs-mode") != "obsidian":
        return None
    raw_base = settings.get("logs-path")
    if not isinstance(raw_base, str) or not raw_base or not Path(raw_base).is_absolute():
        raise ValueError("obsidian logs-path must be a non-empty absolute path")
    lexical_base = Path(raw_base).expanduser()
    try:
        base = lexical_base.resolve(strict=True)
    except FileNotFoundError as error:
        raise ValueError(f"obsidian logs-path does not exist: {lexical_base}") from error
    if not base.is_dir() or base in {Path(base.anchor), Path.home().resolve()}:
        raise ValueError("obsidian logs-path must be a directory outside filesystem and home roots")
    relative = validate_relative_subfolder(settings.get("logs-subfolder"))
    workspace = (base / relative).resolve(strict=False)
    try:
        workspace.relative_to(base)
    except ValueError as error:
        raise ValueError("obsidian workspace resolves outside logs-path") from error
    if workspace.exists() and not workspace.is_dir():
        raise ValueError(f"obsidian workspace is not a directory: {workspace}")
    return workspace


def required_writable_roots(settings: dict[str, Any]) -> tuple[list[str], Path | None]:
    runtime_temp = codex_root() / "tmp"
    workspace = obsidian_workspace_root(settings)
    roots = [*STANDARD_WRITABLE_ROOTS, str(runtime_temp)]
    if workspace is not None:
        roots.append(str(workspace))
    return roots, workspace


def current_runtime_state(parsed: dict[str, Any]) -> tuple[dict[str, object], list[str]]:
    values: dict[str, object] = {}
    for key in TOP_LEVEL_DEFAULTS:
        value = parsed.get(key)
        if value is not None and not isinstance(value, str):
            raise ValueError(f"{key} must be a string")
        values[key] = value
    sandbox = parsed.get(SECTION, {})
    if not isinstance(sandbox, dict):
        raise ValueError(f"[{SECTION}] must be a table")
    network_access = sandbox.get("network_access")
    if network_access is not None and not isinstance(network_access, bool):
        raise ValueError(f"{SECTION}.network_access must be a boolean")
    values["network_access"] = network_access
    writable_roots = sandbox.get("writable_roots", [])
    if not isinstance(writable_roots, list) or any(not isinstance(root, str) for root in writable_roots):
        raise ValueError(f"{SECTION}.writable_roots must be an array of strings")
    return values, writable_roots


def project_config_shadowing() -> dict[str, object] | None:
    path = Path.cwd() / ".codex" / "config.toml"
    if path.is_symlink() or not path.is_file():
        return None
    try:
        parsed = tomllib.loads(path.read_bytes().decode("utf-8"))
    except (OSError, UnicodeDecodeError, tomllib.TOMLDecodeError):
        return {"path": str(path), "declaresWritableRoots": None}
    sandbox = parsed.get(SECTION)
    declares = isinstance(sandbox, dict) and "writable_roots" in sandbox
    return {"path": str(path), "declaresWritableRoots": declares}


def classify() -> dict[str, object]:
    raw, parsed = read_runtime_config()
    values, writable_roots = current_runtime_state(parsed)
    required, workspace = required_writable_roots(read_settings())
    missing_roots = [root for root in required if root not in writable_roots]
    mismatched = [
        key for key, desired in TOP_LEVEL_DEFAULTS.items()
        if values[key] != desired
    ]
    if values["network_access"] is not True:
        mismatched.append(f"{SECTION}.network_access")
    managed_directories = [codex_root() / "tmp"]
    if workspace is not None:
        managed_directories.append(workspace)
    missing_directories = [str(path) for path in managed_directories if not path.is_dir()]
    shadowing = project_config_shadowing()
    return {
        "path": str(runtime_config_path()),
        "exists": raw is not None,
        "status": "current" if not mismatched and not missing_roots and not missing_directories else "stale",
        "settings": values,
        "writableRoots": writable_roots,
        "requiredWritableRoots": required,
        "missingWritableRoots": missing_roots,
        "missingDirectories": missing_directories,
        "mismatchedSettings": mismatched,
        "obsidianWorkspaceRoot": str(workspace) if workspace is not None else None,
        "projectConfig": shadowing,
        "projectConfigShadowing": bool(shadowing and shadowing.get("declaresWritableRoots") is not False),
        "restartRequired": bool(mismatched or missing_roots or missing_directories),
    }


def table_bounds(lines: list[str], section: str) -> tuple[int | None, int]:
    start = None
    end = len(lines)
    heading = re.compile(rf"\[{re.escape(section)}\]\s*(?:#.*)?$")
    for index, line in enumerate(lines):
        stripped = line.strip()
        if start is None and heading.fullmatch(stripped):
            start = index
            continue
        if start is not None and index > start and stripped.startswith("["):
            end = index
            break
    return start, end


def scalar_literal(value: object) -> str:
    if isinstance(value, str):
        return json.dumps(value)
    if isinstance(value, bool):
        return "true" if value else "false"
    raise TypeError(f"unsupported scalar: {value!r}")


def replace_scalar_line(line: str, key: str, value: object, newline: str) -> str:
    match = re.fullmatch(
        rf'([ \t]*{re.escape(key)}[ \t]*=[ \t]*)(?:"(?:[^"\\]|\\.)*"|\'[^\']*\'|true|false)([ \t]*(?:#.*)?)(?:\r?\n)?',
        line,
    )
    if match is None:
        raise ValueError(f"unsupported Codex runtime key layout: {key}")
    return f"{match.group(1)}{scalar_literal(value)}{match.group(2)}{newline}"


def render_top_level_scalar(text: str, key: str, value: object, newline: str) -> str:
    lines = text.splitlines(keepends=True)
    first_table = next(
        (index for index, line in enumerate(lines) if line.lstrip().startswith("[")),
        len(lines),
    )
    assignment = re.compile(rf"^\s*{re.escape(key)}\s*=")
    found = next(
        (index for index, line in enumerate(lines[:first_table]) if assignment.match(line)),
        None,
    )
    if found is not None:
        lines[found] = replace_scalar_line(lines[found], key, value, newline)
    else:
        lines[first_table:first_table] = [f"{key} = {scalar_literal(value)}{newline}"]
    return "".join(lines)


def render_section_scalar(
    text: str,
    section: str,
    key: str,
    value: object,
    newline: str,
) -> str:
    lines = text.splitlines(keepends=True)
    start, end = table_bounds(lines, section)
    if start is None:
        if text and not text.endswith(("\n", "\r")):
            text += newline
        if text and not text.endswith(newline * 2):
            text += newline
        return text + f"[{section}]{newline}{key} = {scalar_literal(value)}{newline}"
    assignment = re.compile(rf"^\s*{re.escape(key)}\s*=")
    found = next(
        (index for index in range(start + 1, end) if assignment.match(lines[index])),
        None,
    )
    if found is not None:
        lines[found] = replace_scalar_line(lines[found], key, value, newline)
    else:
        lines[end:end] = [f"{key} = {scalar_literal(value)}{newline}"]
    return "".join(lines)


def find_array_end(candidate: str, open_bracket: int) -> int:
    quote = None
    triple_quoted = False
    escaped = False
    in_comment = False
    depth = 0
    index = open_bracket
    while index < len(candidate):
        char = candidate[index]
        if in_comment:
            if char in "\r\n":
                in_comment = False
            index += 1
            continue
        if quote is not None:
            if triple_quoted and candidate.startswith(quote * 3, index):
                quote = None
                triple_quoted = False
                index += 3
                continue
            if escaped:
                escaped = False
            elif quote == '"' and char == "\\":
                escaped = True
            elif not triple_quoted and char == quote:
                quote = None
            index += 1
            continue
        if char == "#":
            in_comment = True
        elif char in {'"', "'"}:
            quote = char
            triple_quoted = candidate.startswith(char * 3, index)
            if triple_quoted:
                index += 3
                continue
        elif char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return index
        index += 1
    raise ValueError("unsupported writable_roots layout")


def array_tail_state(
    candidate: str,
    open_bracket: int,
    close_bracket: int,
) -> tuple[bool, int | None]:
    """Return whether an array ends in a comma and its last string end."""
    quote = None
    triple_quoted = False
    escaped = False
    in_comment = False
    last_token = None
    last_value_end = None
    index = open_bracket + 1
    while index < close_bracket:
        char = candidate[index]
        if in_comment:
            if char in "\r\n":
                in_comment = False
            index += 1
            continue
        if quote is not None:
            if triple_quoted and candidate.startswith(quote * 3, index):
                quote = None
                triple_quoted = False
                last_token = "value"
                last_value_end = index + 3
                index += 3
                continue
            if escaped:
                escaped = False
            elif quote == '"' and char == "\\":
                escaped = True
            elif not triple_quoted and char == quote:
                quote = None
                last_token = "value"
                last_value_end = index + 1
            index += 1
            continue
        if char == "#":
            in_comment = True
        elif char in {'"', "'"}:
            quote = char
            triple_quoted = candidate.startswith(char * 3, index)
            if triple_quoted:
                index += 3
                continue
        elif char == ",":
            last_token = "comma"
        elif not char.isspace():
            raise ValueError("unsupported writable_roots array value")
        index += 1
    return last_token == "comma", last_value_end


def render_section_array(
    text: str,
    section: str,
    key: str,
    values: list[str],
    existing_values: list[str],
    newline: str,
) -> str:
    rendered = json.dumps(values, ensure_ascii=False)
    lines = text.splitlines(keepends=True)
    start, end = table_bounds(lines, section)
    if start is None:
        if text and not text.endswith(("\n", "\r")):
            text += newline
        if text and not text.endswith(newline * 2):
            text += newline
        return text + f"[{section}]{newline}{key} = {rendered}{newline}"
    assignment = re.compile(rf"^\s*{re.escape(key)}\s*=")
    found = next(
        (index for index in range(start + 1, end) if assignment.match(lines[index])),
        None,
    )
    if found is None:
        lines[end:end] = [f"{key} = {rendered}{newline}"]
        return "".join(lines)
    prefix = "".join(lines[:found])
    candidate = "".join(lines[found:end])
    key_end = candidate.find("=")
    open_bracket = candidate.find("[", key_end + 1)
    if open_bracket < 0:
        raise ValueError("unsupported writable_roots layout")
    close_bracket = find_array_end(candidate, open_bracket)
    missing_values = [value for value in values if value not in existing_values]
    if not missing_values:
        return text
    has_trailing_comma, last_value_end = array_tail_state(
        candidate,
        open_bracket,
        close_bracket,
    )
    if existing_values and not has_trailing_comma:
        if last_value_end is None:
            raise ValueError("unsupported writable_roots array layout")
        candidate = candidate[:last_value_end] + "," + candidate[last_value_end:]
        close_bracket += 1
    rendered_missing = [json.dumps(value, ensure_ascii=False) for value in missing_values]
    array_body = candidate[open_bracket + 1:close_bracket]
    if "\n" not in array_body:
        separator = " " if existing_values else ""
        insertion = separator + ", ".join(rendered_missing)
        candidate = candidate[:close_bracket] + insertion + candidate[close_bracket:]
    else:
        close_line_start = candidate.rfind("\n", open_bracket, close_bracket) + 1
        closing_prefix = candidate[close_line_start:close_bracket]
        if closing_prefix.strip():
            insertion = " " + ", ".join(rendered_missing)
            candidate = candidate[:close_bracket] + insertion + candidate[close_bracket:]
        else:
            indentation = re.match(r"^\s*", candidate).group(0) + "  "
            insertion = "".join(
                f"{indentation}{value},{newline}" for value in rendered_missing
            )
            candidate = candidate[:close_line_start] + insertion + candidate[close_line_start:]
    return prefix + candidate + "".join(lines[end:])


def render_runtime_config(raw: bytes | None, writable_roots: list[str]) -> bytes:
    text = raw.decode("utf-8") if raw is not None else ""
    newline = "\r\n" if "\r\n" in text else "\n"
    parsed = tomllib.loads(text) if text else {}
    _, existing_roots = current_runtime_state(parsed)
    for key, value in TOP_LEVEL_DEFAULTS.items():
        text = render_top_level_scalar(text, key, value, newline)
    text = render_section_scalar(text, SECTION, "network_access", True, newline)
    text = render_section_array(
        text,
        SECTION,
        "writable_roots",
        writable_roots,
        existing_roots,
        newline,
    )
    return text.encode("utf-8")


def write_atomic(path: Path, content: bytes) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.parent.is_symlink():
        raise ValueError(f"refusing symlink Codex config directory: {path.parent}")
    if path.exists():
        backup = path.with_name(path.name + ".bak")
        if backup.is_symlink() or (backup.exists() and not backup.is_file()):
            raise ValueError(f"refusing unsafe runtime config backup: {backup}")
        shutil.copyfile(path, backup)
        os.chmod(backup, 0o600)
    fd, temp_name = tempfile.mkstemp(prefix=path.name + ".tmp-", dir=path.parent)
    temp = Path(temp_name)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
        os.chmod(path, 0o600)
    finally:
        temp.unlink(missing_ok=True)


def ensure_directory(path: Path) -> bool:
    if path.is_symlink() or (path.exists() and not path.is_dir()):
        raise ValueError(f"refusing unsafe writable root: {path}")
    existed = path.is_dir()
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    return not existed


def ensure_result() -> dict[str, object]:
    before = classify()
    raw, parsed = read_runtime_config()
    _, current_roots = current_runtime_state(parsed)
    required, workspace = required_writable_roots(read_settings())
    merged_roots = list(dict.fromkeys([*current_roots, *required]))
    rendered = render_runtime_config(raw, merged_roots)
    try:
        rendered_doc = tomllib.loads(rendered.decode("utf-8"))
    except (UnicodeDecodeError, tomllib.TOMLDecodeError) as error:
        raise ValueError(f"unsupported Codex runtime config layout: {error}") from error
    rendered_values, rendered_roots = current_runtime_state(rendered_doc)
    if any(rendered_values[key] != value for key, value in TOP_LEVEL_DEFAULTS.items()):
        raise ValueError("Codex global execution defaults reconciliation incomplete")
    if rendered_values["network_access"] is not True:
        raise ValueError("Codex sandbox network reconciliation incomplete")
    if any(root not in rendered_roots for root in required):
        raise ValueError("Codex writable-root reconciliation incomplete")
    created_directories = []
    runtime_temp = codex_root() / "tmp"
    if ensure_directory(runtime_temp):
        created_directories.append(str(runtime_temp))
    if workspace is not None:
        if ensure_directory(workspace):
            created_directories.append(str(workspace))
    changed = raw != rendered
    if changed:
        write_atomic(runtime_config_path(), rendered)
    after = classify()
    if after["status"] != "current":
        raise ValueError("Codex runtime reconciliation did not converge")
    return {
        "changed": changed,
        "before": before,
        "runtime": after,
        "mode": oct(stat.S_IMODE(runtime_config_path().stat().st_mode)),
        "createdDirectories": created_directories,
        "restartRequired": bool(changed or created_directories),
    }


def ensure() -> int:
    print(json.dumps(ensure_result(), sort_keys=True))
    return 0


def inspect() -> int:
    print(json.dumps(classify(), sort_keys=True))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("inspect", "ensure"))
    args = parser.parse_args()
    return inspect() if args.command == "inspect" else ensure()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"manage_runtime: {error}", file=sys.stderr)
        raise SystemExit(1) from error
