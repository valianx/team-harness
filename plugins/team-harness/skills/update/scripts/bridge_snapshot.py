#!/usr/bin/env python3
"""Keep a running Codex thread's versioned plugin path on the new snapshot."""

from __future__ import annotations

import argparse
import errno
import json
import os
from pathlib import Path
import sys


PLUGIN_NAME = "team-harness"


def emit(status: str, *, restart_required: bool, **details: object) -> None:
    print(json.dumps({
        "status": status,
        "restartRequired": restart_required,
        **details,
    }, indent=2, sort_keys=True))


def lexical_path(value: str) -> Path:
    return Path(os.path.abspath(os.path.expanduser(value)))


def fail(message: str) -> None:
    emit("error", restart_required=True, error=message)
    raise SystemExit(2)


def fail_write_protected() -> None:
    emit(
        "error",
        restart_required=True,
        errorCode="CACHE_WRITE_PROTECTED",
        retryWithEscalation=True,
        error="Codex plugin cache is protected in the current sandbox",
    )
    raise SystemExit(2)


def validate_cache_parent(path: Path) -> None:
    parts = path.parts
    expected_tail = ("plugins", "cache", PLUGIN_NAME, PLUGIN_NAME)
    if len(parts) < len(expected_tail) or tuple(parts[-4:]) != expected_tail:
        fail(f"snapshot parent is not the {PLUGIN_NAME} Codex cache: {path}")


def validate_new_snapshot(path: Path) -> tuple[Path, str]:
    try:
        resolved = path.resolve(strict=True)
    except FileNotFoundError:
        fail(f"new plugin snapshot does not exist: {path}")
    if not resolved.is_dir():
        fail(f"new plugin snapshot is not a directory: {resolved}")

    cache_parent = resolved.parent
    validate_cache_parent(cache_parent)
    manifest_path = resolved / ".codex-plugin/plugin.json"
    runner_path = resolved / "hooks/run-codex-hook.sh"
    try:
        manifest = json.loads(manifest_path.read_text())
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        fail(f"new plugin manifest is unavailable or invalid: {exc}")
    if manifest.get("name") != PLUGIN_NAME:
        fail(f"new snapshot manifest is not {PLUGIN_NAME}")
    if not runner_path.is_file():
        fail(f"new snapshot hook runner is missing: {runner_path}")
    return resolved, str(manifest.get("version", resolved.name))


def link_target(path: Path) -> Path:
    raw_target = Path(os.readlink(path))
    if not raw_target.is_absolute():
        raw_target = path.parent / raw_target
    return raw_target.resolve(strict=False)


def bridge(old_plugin: Path, new_plugin: Path) -> None:
    new_snapshot, version = validate_new_snapshot(new_plugin)
    cache_parent = new_snapshot.parent

    try:
        old_parent = old_plugin.parent.resolve(strict=True)
    except FileNotFoundError:
        fail(f"old snapshot parent does not exist: {old_plugin.parent}")
    if old_parent != cache_parent:
        fail("old and new snapshots are not in the same Team Harness Codex cache")
    if old_plugin == new_snapshot:
        emit(
            "same-snapshot",
            restart_required=False,
            oldPlugin=str(old_plugin),
            newPlugin=str(new_snapshot),
            version=version,
        )
        return

    status = "linked"
    if os.path.lexists(old_plugin):
        if not old_plugin.is_symlink():
            emit(
                "skipped-existing-path",
                restart_required=True,
                oldPlugin=str(old_plugin),
                newPlugin=str(new_snapshot),
                version=version,
            )
            return
        current_target = link_target(old_plugin)
        if current_target.parent != cache_parent:
            emit(
                "skipped-unmanaged-symlink",
                restart_required=True,
                oldPlugin=str(old_plugin),
                currentTarget=str(current_target),
                newPlugin=str(new_snapshot),
                version=version,
            )
            return
        if current_target == new_snapshot:
            emit(
                "current",
                restart_required=False,
                oldPlugin=str(old_plugin),
                newPlugin=str(new_snapshot),
                version=version,
            )
            return
        status = "relinked"

    temporary = old_plugin.with_name(
        f".{old_plugin.name}.team-harness-link-{os.getpid()}"
    )
    try:
        temporary.symlink_to(new_snapshot.name, target_is_directory=True)
        os.replace(temporary, old_plugin)
    finally:
        if os.path.lexists(temporary):
            temporary.unlink()

    emit(
        status,
        restart_required=False,
        oldPlugin=str(old_plugin),
        newPlugin=str(new_snapshot),
        version=version,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--old-plugin", required=True)
    parser.add_argument("--new-plugin", required=True)
    args = parser.parse_args()
    bridge(lexical_path(args.old_plugin), lexical_path(args.new_plugin))


if __name__ == "__main__":
    try:
        main()
    except OSError as exc:
        if exc.errno in {errno.EACCES, errno.EPERM, errno.EROFS}:
            fail_write_protected()
        fail("snapshot bridge filesystem operation failed")
