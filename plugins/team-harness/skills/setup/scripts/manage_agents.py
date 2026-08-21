#!/usr/bin/env python3
"""Inspect or reconcile the bundled Team Harness Codex agents."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
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
    "reviewer-consolidator",
)
MANAGED_MARKER = "# Code generated from runtime/schema/codex-agents.json; DO NOT EDIT."
DEFAULT_SUBAGENT_MODEL = "gpt-5.6-luna"
DEFAULT_SUBAGENT_REASONING_EFFORT = "max"
LEGACY_SUBAGENT_PAIRS = frozenset({("gpt-5.6-terra", "medium")})
PROJECT_DOC_FALLBACK = "CLAUDE.md"
RUNTIME_KEYS = (
    "default_subagent_model",
    "default_subagent_reasoning_effort",
)


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
    if not path.exists() and not path.is_symlink():
        return None, {}
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"unsafe Codex runtime config: {path}")
    raw = path.read_bytes()
    try:
        parsed = tomllib.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, tomllib.TOMLDecodeError) as error:
        raise ValueError(f"invalid Codex runtime config: {path}: {error}") from error
    agents = parsed.get("agents", {})
    if not isinstance(agents, dict):
        raise ValueError(f"Codex runtime config [agents] must be a table: {path}")
    fallbacks = parsed.get("project_doc_fallback_filenames", [])
    if not isinstance(fallbacks, list) or any(not isinstance(value, str) for value in fallbacks):
        raise ValueError("project_doc_fallback_filenames must be an array of strings")
    return raw, parsed


def classify_runtime_config(path: Path) -> dict[str, object]:
    raw, parsed = read_runtime_config(path)
    agents = parsed.get("agents", {})
    fallbacks = parsed.get("project_doc_fallback_filenames", [])
    model = agents.get("default_subagent_model")
    effort = agents.get("default_subagent_reasoning_effort")
    if model is not None and not isinstance(model, str):
        raise ValueError("agents.default_subagent_model must be a string")
    if effort is not None and not isinstance(effort, str):
        raise ValueError("agents.default_subagent_reasoning_effort must be a string")
    if model == DEFAULT_SUBAGENT_MODEL and effort == DEFAULT_SUBAGENT_REASONING_EFFORT:
        status = "current"
    elif (model, effort) in LEGACY_SUBAGENT_PAIRS:
        status = "legacy"
    elif model is None or effort is None:
        status = "missing"
    else:
        status = "custom-preserved"
    return {
        "path": str(path),
        "status": status,
        "model": model,
        "reasoningEffort": effort,
        "projectDocFallbackFilenames": fallbacks,
        "projectDocFallbackStatus": "current" if PROJECT_DOC_FALLBACK in fallbacks else "missing",
        "exists": raw is not None,
    }


def render_project_doc_fallback(text: str, fallbacks: list[str], newline: str) -> str:
    desired = fallbacks if PROJECT_DOC_FALLBACK in fallbacks else [*fallbacks, PROJECT_DOC_FALLBACK]
    rendered = json.dumps(desired, ensure_ascii=False)
    lines = text.splitlines(keepends=True)
    first_table = next(
        (index for index, line in enumerate(lines) if line.lstrip().startswith("[")),
        len(lines),
    )
    assignment = re.compile(r"^\s*project_doc_fallback_filenames\s*=")
    start = next(
        (index for index, line in enumerate(lines[:first_table]) if assignment.match(line)),
        None,
    )
    if start is None:
        insertion = f"project_doc_fallback_filenames = {rendered}{newline}"
        lines[first_table:first_table] = [insertion]
        return "".join(lines)

    prefix = "".join(lines[:start])
    candidate = "".join(lines[start:first_table])
    key_end = candidate.find("=")
    open_bracket = candidate.find("[", key_end + 1)
    if open_bracket < 0:
        raise ValueError("unsupported project_doc_fallback_filenames layout")
    quote = None
    triple_quoted = False
    escaped = False
    in_comment = False
    close_bracket = None
    index = open_bracket + 1
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
        elif char == "]":
            close_bracket = index
            break
        index += 1
    if close_bracket is None:
        raise ValueError("unsupported project_doc_fallback_filenames layout")
    replacement = f"project_doc_fallback_filenames = {rendered}"
    suffix = candidate[close_bracket + 1:]
    return prefix + replacement + suffix + "".join(lines[first_table:])


def render_runtime_config(
    raw: bytes | None,
    *,
    fallbacks: list[str],
    replace_existing: bool,
) -> bytes:
    text = raw.decode("utf-8") if raw is not None else ""
    newline = "\r\n" if "\r\n" in text else "\n"
    text = render_project_doc_fallback(text, fallbacks, newline)
    lines = text.splitlines(keepends=True)
    section_start = None
    section_end = len(lines)
    for index, line in enumerate(lines):
        stripped = line.strip()
        if re.fullmatch(r"\[agents\]\s*(?:#.*)?", stripped):
            section_start = index
            continue
        if section_start is not None and index > section_start and stripped.startswith("["):
            section_end = index
            break

    desired = {
        "default_subagent_model": DEFAULT_SUBAGENT_MODEL,
        "default_subagent_reasoning_effort": DEFAULT_SUBAGENT_REASONING_EFFORT,
    }
    if section_start is None:
        if text and not text.endswith(("\n", "\r")):
            text += newline
        if text and not text.endswith(newline * 2):
            text += newline
        return (
            text
            + "[agents]"
            + newline
            + f'default_subagent_model = "{DEFAULT_SUBAGENT_MODEL}"'
            + newline
            + f'default_subagent_reasoning_effort = "{DEFAULT_SUBAGENT_REASONING_EFFORT}"'
            + newline
        ).encode("utf-8")

    found: set[str] = set()
    for index in range(section_start + 1, section_end):
        line = lines[index]
        for key in RUNTIME_KEYS:
            if line.lstrip().startswith(key) and line.lstrip()[len(key):].lstrip().startswith("="):
                found.add(key)
                if replace_existing:
                    match = re.fullmatch(
                        rf'(\s*{re.escape(key)}\s*=\s*)"[^"]*"([^\r\n]*)(?:\r?\n)?',
                        line,
                    )
                    if match is None:
                        raise ValueError(f"unsupported Codex runtime key layout: {key}")
                    lines[index] = f'{match.group(1)}"{desired[key]}"{match.group(2)}{newline}'
                break
    missing = [key for key in RUNTIME_KEYS if key not in found] if replace_existing else []
    if missing:
        insertion = [f'{key} = "{desired[key]}"{newline}' for key in missing]
        lines[section_end:section_end] = insertion
    return "".join(lines).encode("utf-8")


def write_runtime_config(path: Path, content: bytes) -> None:
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


def sync_runtime_config(path: Path) -> tuple[bool, dict[str, object]]:
    before = classify_runtime_config(path)
    status = before["status"]
    fallback_status = before["projectDocFallbackStatus"]
    if status in {"custom-preserved", "current"} and fallback_status == "current":
        return False, before
    raw, parsed_before = read_runtime_config(path)
    fallbacks = parsed_before.get("project_doc_fallback_filenames", [])
    rendered = render_runtime_config(
        raw,
        fallbacks=fallbacks,
        replace_existing=status in {"legacy", "missing"},
    )
    if raw == rendered:
        return False, before
    try:
        parsed = tomllib.loads(rendered.decode("utf-8"))
    except (UnicodeDecodeError, tomllib.TOMLDecodeError) as error:
        raise ValueError(f"unsupported Codex runtime config layout: {path}: {error}") from error
    rendered_agents = parsed.get("agents")
    if not isinstance(rendered_agents, dict):
        raise ValueError(f"Codex runtime fallback reconciliation incomplete: {path}")
    if status in {"legacy", "missing"} and any(
        rendered_agents.get(key) != value
        for key, value in {
            "default_subagent_model": DEFAULT_SUBAGENT_MODEL,
            "default_subagent_reasoning_effort": DEFAULT_SUBAGENT_REASONING_EFFORT,
        }.items()
    ):
        raise ValueError(f"Codex runtime fallback reconciliation incomplete: {path}")
    rendered_fallbacks = parsed.get("project_doc_fallback_filenames")
    expected_fallbacks = fallbacks if PROJECT_DOC_FALLBACK in fallbacks else [*fallbacks, PROJECT_DOC_FALLBACK]
    if rendered_fallbacks != expected_fallbacks:
        raise ValueError(f"Codex project instruction fallback reconciliation incomplete: {path}")
    write_runtime_config(path, rendered)
    after = classify_runtime_config(path)
    if after["status"] not in {"current", "custom-preserved"}:
        raise ValueError(f"Codex runtime fallback reconciliation incomplete: {path}")
    if after["projectDocFallbackStatus"] != "current":
        raise ValueError(f"Codex project instruction fallback reconciliation incomplete: {path}")
    return True, after


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
    runtime_config = classify_runtime_config(runtime_config_path(scope))
    print(json.dumps({
        "scope": scope,
        "directory": str(agents),
        "agents": rows,
        "runtimeConfig": runtime_config,
    }, sort_keys=True))
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
    runtime_config_changed, runtime_config = sync_runtime_config(runtime_config_path(scope))
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
        "runtimeConfig": runtime_config,
        "runtimeConfigChanged": runtime_config_changed,
        "restartRequired": bool(changed or runtime_config_changed),
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
