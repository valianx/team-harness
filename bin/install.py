#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""claude-dev-team installer.

Installs agents, skills, hooks, and the knowledge-graph MCP server into ~/.claude/,
and registers the `memory` + `context7` MCP servers in ~/.claude.json.

Safe updates:
    - A manifest at ~/.claude/.claude-dev-team-manifest.json tracks which files
      were installed by this tool and their hashes.
    - When re-run, files whose current hash matches the manifest are safely
      overwritten with the new source (this is a clean update).
    - Files that were modified locally after install (hash differs from manifest)
      are reported as conflicts and left untouched.
    - A timestamped backup of ~/.claude.json is taken before each merge.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import stat
import sys
from datetime import datetime, timezone
from pathlib import Path

__version__ = "1.0.0"

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
HOME = Path.home()
CLAUDE_DIR = HOME / ".claude"
CLAUDE_JSON = HOME / ".claude.json"
MANIFEST_PATH = CLAUDE_DIR / ".claude-dev-team-manifest.json"

# Names to skip when recursing (runtime state, caches, venvs, folder docs)
SKIP_NAMES = {".venv", "__pycache__", ".server.pid", "server.log", "README.md"}

_stats: dict[str, list[str]] = {
    "installed": [],
    "updated": [],
    "unchanged": [],
    "conflicts": [],
}

_manifest: dict = {
    "format_version": "1",
    "installed_version": None,
    "files": {},
}


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------
def load_manifest() -> None:
    global _manifest
    if not MANIFEST_PATH.exists():
        return
    try:
        data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict) and "files" in data:
            _manifest = data
    except (json.JSONDecodeError, OSError):
        # Corrupt manifest — fall back to fresh (non-destructive behaviour)
        pass


def save_manifest() -> None:
    ensure_dir(MANIFEST_PATH.parent)
    _manifest["format_version"] = "1"
    _manifest["installed_version"] = __version__
    _manifest["updated_at"] = datetime.now(timezone.utc).isoformat()
    MANIFEST_PATH.write_text(
        json.dumps(_manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Copy helpers
# ---------------------------------------------------------------------------
def hash_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def should_skip(name: str) -> bool:
    return name in SKIP_NAMES or name.endswith(".pyc")


def _record(dest: Path, src_hash: str) -> None:
    _manifest["files"][str(dest)] = {"hash": src_hash}


def _apply(src: Path, dest: Path, *, executable: bool) -> None:
    shutil.copy2(src, dest)
    if executable and sys.platform != "win32":
        dest.chmod(dest.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def copy_file(src: Path, dest: Path, *, executable: bool = False) -> None:
    ensure_dir(dest.parent)
    src_hash = hash_file(src)
    key = str(dest)
    recorded_hash = _manifest["files"].get(key, {}).get("hash")

    if not dest.exists():
        _apply(src, dest, executable=executable)
        _record(dest, src_hash)
        _stats["installed"].append(key)
        return

    dest_hash = hash_file(dest)

    if dest_hash == src_hash:
        _record(dest, src_hash)  # keep manifest in sync
        _stats["unchanged"].append(key)
        return

    # Destination differs from source.
    if recorded_hash and recorded_hash == dest_hash:
        # We installed this before and the user hasn't modified it — safe update.
        _apply(src, dest, executable=executable)
        _record(dest, src_hash)
        _stats["updated"].append(key)
        return

    # User-modified or never tracked by us — leave it alone.
    _stats["conflicts"].append(key)


def copy_dir_flat(
    src_dir: Path,
    dest_dir: Path,
    *,
    suffix: str | None = None,
    executable: bool = False,
) -> None:
    if not src_dir.exists():
        return
    for entry in sorted(src_dir.iterdir()):
        if not entry.is_file() or should_skip(entry.name):
            continue
        if suffix and not entry.name.endswith(suffix):
            continue
        copy_file(entry, dest_dir / entry.name, executable=executable)


def copy_dir_recursive(
    src_dir: Path,
    dest_dir: Path,
    *,
    executable_ext: str | None = None,
) -> None:
    if not src_dir.exists():
        return
    for entry in sorted(src_dir.iterdir()):
        if should_skip(entry.name):
            continue
        if entry.is_dir():
            copy_dir_recursive(entry, dest_dir / entry.name, executable_ext=executable_ext)
        elif entry.is_file():
            is_exec = bool(executable_ext and entry.name.endswith(executable_ext))
            copy_file(entry, dest_dir / entry.name, executable=is_exec)


# ---------------------------------------------------------------------------
# Dependency detection
# ---------------------------------------------------------------------------
def require_cli(cmd: str, hint: str) -> None:
    if shutil.which(cmd) is None:
        print(f"Error: required CLI '{cmd}' not found in PATH.", file=sys.stderr)
        print(f"  {hint}", file=sys.stderr)
        sys.exit(1)


def check_dependencies() -> None:
    require_cli("uv", "Install: https://docs.astral.sh/uv/getting-started/installation/")
    require_cli("gh", "Install GitHub CLI: https://cli.github.com/")


# ---------------------------------------------------------------------------
# context7 API key
# ---------------------------------------------------------------------------
def get_context7_api_key() -> str:
    env_key = os.environ.get("CONTEXT7_API_KEY", "").strip()
    if env_key:
        print("  context7 API key: loaded from CONTEXT7_API_KEY env var")
        return env_key

    if not sys.stdin.isatty():
        print("Error: CONTEXT7_API_KEY not set and stdin is not interactive.", file=sys.stderr)
        print("  Export CONTEXT7_API_KEY and re-run.", file=sys.stderr)
        sys.exit(1)

    print("  context7 API key required (get one at https://context7.com/).")
    key = input("  Paste your CONTEXT7_API_KEY: ").strip()
    if not key:
        print("Error: empty API key.", file=sys.stderr)
        sys.exit(1)
    return key


# ---------------------------------------------------------------------------
# ~/.claude.json merge (mcpServers only)
# ---------------------------------------------------------------------------
def backup_claude_json() -> Path | None:
    if not CLAUDE_JSON.exists():
        return None
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = CLAUDE_JSON.with_name(f"{CLAUDE_JSON.name}.bak-{timestamp}")
    shutil.copy2(CLAUDE_JSON, backup)
    return backup


def register_mcp_servers(context7_key: str) -> Path | None:
    data: dict = {}
    if CLAUDE_JSON.exists():
        with CLAUDE_JSON.open("r", encoding="utf-8") as f:
            data = json.load(f)

    backup = backup_claude_json()

    mcp_dir_posix = (CLAUDE_DIR / "knowledge-graph").as_posix()

    mcp_servers = data.setdefault("mcpServers", {})
    mcp_servers["memory"] = {
        "type": "stdio",
        "command": "uv",
        "args": ["run", "--directory", mcp_dir_posix, "python", "-m", "server"],
        "env": {},
    }
    mcp_servers["context7"] = {
        "type": "http",
        "url": "https://mcp.context7.com/mcp",
        "headers": {"CONTEXT7_API_KEY": context7_key},
    }

    CLAUDE_JSON.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return backup


# ---------------------------------------------------------------------------
# Install phases
# ---------------------------------------------------------------------------
def install_agents() -> None:
    copy_dir_flat(REPO_ROOT / "agents", CLAUDE_DIR / "agents", suffix=".md")


def install_skills() -> None:
    skills_src = REPO_ROOT / "skills"

    # Flat .md skills → ~/.claude/commands/
    copy_dir_flat(skills_src, CLAUDE_DIR / "commands", suffix=".md")

    # Complex skills (subdirs) → ~/.claude/skills/<name>/
    if not skills_src.exists():
        return
    for entry in sorted(skills_src.iterdir()):
        if entry.is_dir() and not should_skip(entry.name):
            copy_dir_recursive(entry, CLAUDE_DIR / "skills" / entry.name)


def install_hooks() -> None:
    copy_dir_flat(
        REPO_ROOT / "hooks",
        CLAUDE_DIR / "hooks",
        suffix=".sh",
        executable=True,
    )


def install_knowledge_graph() -> None:
    copy_dir_recursive(
        REPO_ROOT / "knowledge-graph",
        CLAUDE_DIR / "knowledge-graph",
        executable_ext=".sh",
    )


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
def print_summary(claude_json_backup: Path | None) -> None:
    os_label = {
        "win32": "windows",
        "darwin": "macos",
        "linux": "linux",
    }.get(sys.platform, sys.platform)

    print()
    print("Summary:")
    print(f"  installed: {len(_stats['installed'])}")
    print(f"  updated:   {len(_stats['updated'])}")
    print(f"  unchanged: {len(_stats['unchanged'])}")
    print(f"  conflicts: {len(_stats['conflicts'])}")

    if _stats["conflicts"]:
        print()
        print("Conflicts (locally modified — left untouched):")
        print("  Delete the file manually and re-run to replace with the repo version.")
        for c in _stats["conflicts"]:
            print(f"  - {c}")

    print()
    print("MCP servers registered in ~/.claude.json:")
    print("  - memory   (knowledge graph)")
    print("  - context7 (library docs)")
    if claude_json_backup:
        print(f"  backup: {claude_json_backup}")

    print()
    print(f"Manifest: {MANIFEST_PATH}")

    print()
    print("Next steps:")
    print("  1. Restart Claude Code so it picks up the new MCP servers.")
    print(f'  2. To enable notification hooks, open hooks/config.json in this repo,')
    print(f'     copy the "{os_label}" section, and merge it into')
    print(f'     ~/.claude/settings.json under the "hooks" key.')


# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------
def main() -> None:
    # Force UTF-8 stdout so characters like em-dash render correctly on Windows.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    print(f"claude-dev-team installer v{__version__}")
    print(f"  source:   {REPO_ROOT}")
    print(f"  target:   {CLAUDE_DIR}")
    print(f"  platform: {sys.platform}")
    print()

    print("Checking dependencies...")
    check_dependencies()
    print("  uv: ok")
    print("  gh: ok")
    print()

    print("context7 setup:")
    context7_key = get_context7_api_key()
    print()

    ensure_dir(CLAUDE_DIR)
    load_manifest()
    prev_version = _manifest.get("installed_version")
    if prev_version:
        print(f"Detected previous install (version {prev_version}). Updating...")
    else:
        print("Fresh install.")
    print()

    print("Installing files...")
    install_agents()
    install_skills()
    install_hooks()
    install_knowledge_graph()

    print("Registering MCP servers in ~/.claude.json...")
    claude_json_backup = register_mcp_servers(context7_key)

    save_manifest()

    print_summary(claude_json_backup)


if __name__ == "__main__":
    main()
