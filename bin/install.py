#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""DEPRECATED — pending removal in the next major version after v1.1.0.

This Python installer is replaced by a Go binary published as a GitHub
Release asset. Run `./bin/install.sh` (Linux/macOS) or `.\\bin\\install.ps1`
(Windows) which now downloads the right Go binary and executes it.

This script remains executable for one release as a fallback. Future
versions will remove it entirely.

---

claude-dev-team installer.

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
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import NamedTuple

__version__ = "1.1.0"

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
HOME = Path.home()
CLAUDE_DIR = HOME / ".claude"
CLAUDE_JSON = HOME / ".claude.json"
MANIFEST_PATH = CLAUDE_DIR / ".claude-dev-team-manifest.json"

# ---------------------------------------------------------------------------
# Global flags (set in main() from sys.argv)
# ---------------------------------------------------------------------------
force_flag: bool = False

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
# Existing-config readers
# ---------------------------------------------------------------------------
def _read_existing_mcp_servers() -> dict:
    """Return the current mcpServers block from ~/.claude.json, or {} if absent."""
    if not CLAUDE_JSON.exists():
        return {}
    try:
        data = json.loads(CLAUDE_JSON.read_text(encoding="utf-8"))
        return data.get("mcpServers", {}) if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _looks_like_valid_memory_entry(entry: dict) -> bool:
    """Return True if the entry has the minimum shape of a usable memory mcpServer."""
    if not entry:
        return False
    kind = entry.get("type", "")
    if kind == "stdio":
        return bool(entry.get("command", "").strip())
    if kind == "http":
        url = entry.get("url", "")
        return url.startswith("http://") or url.startswith("https://")
    return False


# Placeholder used in the PR-5 manual test instructions — must not be treated as real.
_FAKE_CONTEXT7_KEY = "ctx7sk-fake-test-key"


def _is_valid_context7_key(key: str) -> bool:
    """Return True if key looks like a real context7 key (not blank, not the test placeholder)."""
    return (
        bool(key)
        and key.startswith("ctx7sk-")
        and len(key) >= 12
        and key != _FAKE_CONTEXT7_KEY
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
def get_context7_api_key() -> str | None:
    """Return the context7 API key to use, or None if it should be left unchanged.

    Priority (when --force is NOT set):
      1. Existing valid key in ~/.claude.json with no conflicting env var → preserve.
      2. Env var present and matching existing key → preserve.
      3. Env var differs from existing valid key → ask interactively; non-interactive prefers env.
      4. No existing valid key → fall through to env var or interactive prompt.

    With --force: existing key is ignored; env var or interactive prompt decides.
    """
    existing_entry = _read_existing_mcp_servers().get("context7", {})
    existing_key = existing_entry.get("headers", {}).get("CONTEXT7_API_KEY", "").strip()
    env_key = os.environ.get("CONTEXT7_API_KEY", "").strip()

    if not force_flag and _is_valid_context7_key(existing_key):
        # Existing key is real. Decide whether to keep it.
        if not env_key or env_key == existing_key:
            print("  context7 API key: preserving existing key in ~/.claude.json")
            return existing_key

        # Env var present and different from the stored key.
        if sys.stdin.isatty():
            print(f"  context7 API key: existing ({existing_key[:12]}...) differs from env ({env_key[:12]}...).")
            choice = input("  Use [E]xisting / [N]ew env key / [A]bort? [E]: ").strip().lower() or "e"
            if choice == "e":
                return existing_key
            if choice == "n":
                print("  context7 API key: using env var (user chose N)")
                return env_key
            print("Aborted.", file=sys.stderr)
            sys.exit(1)
        else:
            # Non-interactive: env var wins when explicitly set (preserves CI override behavior).
            print(f"  context7 API key: existing key differs from env; using env (non-interactive).")
            return env_key

    # No usable existing key — fall through to env var or interactive prompt.
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
# KG backend selection
# ---------------------------------------------------------------------------
class KGBackendChoice(NamedTuple):
    backend: str        # "memory" or "context-harness"
    url: str | None     # only set when backend == "context-harness" AND not skipped
    skipped: bool       # True if backend == "context-harness" but user chose to skip
    preserved: bool = False  # True when the existing entry was kept without change


def _check_url_reachability(url: str, *, interactive: bool) -> bool:
    """Try GET {base}/healthz where base is url with trailing /mcp stripped.

    Returns True if the URL should be saved, False if the user declined.
    On non-interactive runs always returns True (warn, don't fail install).
    """
    base = url.rstrip("/")
    if base.endswith("/mcp"):
        base = base[:-4]
    health_url = f"{base}/healthz"

    try:
        req = urllib.request.urlopen(  # noqa: S310 — user-supplied URL, not attacker-controlled
            urllib.request.Request(health_url, method="GET"),
            timeout=3,
        )
        if req.status == 200:
            print("  [ok] reachable")
            return True
        print(f"  [warn] not reachable: HTTP {req.status}")
    except Exception as exc:
        print(f"  [warn] not reachable: {exc}")

    if not interactive:
        return True  # non-interactive: warn but continue

    raw = input("  URL not responding. Save the entry anyway? [Y/n]: ").strip().lower()
    return raw not in {"n", "no"}


def _prompt_url_cloud() -> str | None:
    """Prompt for a cloud Render URL. Returns URL string or None if skipped."""
    print()
    print("  Render endpoint URL (e.g. https://context-harness-mcp-xyz.onrender.com/mcp).")
    print("  If you haven't deployed yet, type 'skip' and complete this later by re-running")
    print("  the installer or editing ~/.claude.json under mcpServers.memory manually.")
    raw = input("  URL [skip]: ").strip()
    if not raw or raw.lower() == "skip":
        return None
    return raw


def _prompt_url_local() -> str:
    """Prompt for a local Docker URL with a sensible default."""
    default = "http://localhost:8080/mcp"
    print()
    print(f"  Local endpoint URL [{default}]:")
    print("  (Enter accepts default - assumes you ran 'docker compose up' in context-harness-mcp/)")
    raw = input("  URL: ").strip()
    return raw if raw else default


def _prompt_context_harness_url() -> KGBackendChoice:
    """Prompt for hosting type then URL. Returns the final backend choice."""
    print()
    print("  Hosting:")
    print("    1) Cloud (Render+Supabase Free)  (recommended; see context-harness-mcp docs/deployment.md)")
    print("    2) Local (Docker)                (dev/testing offline; docker compose up in context-harness-mcp/)")

    hosting = _prompt_menu("  Choice [1]: ", choices={"1", "2"}, default="1")

    if hosting == "1":
        url = _prompt_url_cloud()
    else:
        url = _prompt_url_local()

    if url is None:
        return KGBackendChoice(backend="context-harness", url=None, skipped=True)

    save = _check_url_reachability(url, interactive=True)
    if not save:
        return KGBackendChoice(backend="context-harness", url=None, skipped=True)

    return KGBackendChoice(backend="context-harness", url=url, skipped=False)


def _prompt_menu(prompt: str, choices: set[str], default: str) -> str:
    """Re-prompt until the user enters a valid choice or presses Enter for the default."""
    while True:
        raw = input(prompt).strip()
        if not raw:
            return default
        if raw in choices:
            return raw
        print(f"  Invalid choice '{raw}'. Please enter one of: {', '.join(sorted(choices))}.")


def _handle_context_harness_env_url() -> KGBackendChoice:
    """Resolve context-harness choice from env vars (non-interactive path)."""
    url = os.environ.get("CONTEXT_HARNESS_URL", "").strip()
    if not url:
        print(
            "Error: KG_BACKEND=context-harness requires CONTEXT_HARNESS_URL to be set.",
            file=sys.stderr,
        )
        print("  Export CONTEXT_HARNESS_URL=https://<your-url>/mcp and re-run.", file=sys.stderr)
        sys.exit(1)

    print("  KG backend: context-harness (loaded from env vars)")
    _check_url_reachability(url, interactive=False)
    return KGBackendChoice(backend="context-harness", url=url, skipped=False)


def prompt_kg_backend() -> KGBackendChoice:
    """Determine KG backend from existing config, env vars, or interactive prompts.

    Decision priority (when --force is NOT set):
      1. Existing valid mcpServers.memory in ~/.claude.json → preserve.
      2. KG_BACKEND env var (non-interactive / CI / scripted installs).
      3. Non-interactive without env vars — default to "memory".
      4. Interactive TTY — prompt the user.

    With --force: skips step 1 and falls through to env var / interactive.
    """
    existing = _read_existing_mcp_servers().get("memory", {})

    if not force_flag and _looks_like_valid_memory_entry(existing):
        kind = existing.get("type", "")
        url = existing.get("url") if kind == "http" else None
        backend = "context-harness" if kind == "http" else "memory"
        print(f"  KG backend: preserving existing mcpServers.memory (type={kind})")
        return KGBackendChoice(backend=backend, url=url, skipped=False, preserved=True)

    env_backend = os.environ.get("KG_BACKEND", "").strip().lower()
    is_tty = sys.stdin.isatty()

    # --- Env var path ---
    if env_backend == "memory":
        print("  KG backend: memory (loaded from KG_BACKEND env var)")
        return KGBackendChoice(backend="memory", url=None, skipped=False)

    if env_backend == "context-harness":
        return _handle_context_harness_env_url()

    if env_backend and env_backend not in {"memory", "context-harness"}:
        print(
            f"Error: KG_BACKEND='{env_backend}' is not a recognised value.",
            file=sys.stderr,
        )
        print("  Valid values: memory, context-harness", file=sys.stderr)
        sys.exit(1)

    # --- Non-interactive without env var ---
    if not is_tty:
        print(
            "  KG backend: memory (default for non-interactive installs)."
            " Set KG_BACKEND=context-harness + CONTEXT_HARNESS_URL=https://..."
            " to use the remote backend."
        )
        return KGBackendChoice(backend="memory", url=None, skipped=False)

    # --- Interactive TTY ---
    print()
    print("  Knowledge Graph backend:")
    print("    1) context-harness  (Go server + Postgres+pgvector. Cloud or local.)")
    print("    2) memory           (Python ChromaDB. Local single-machine.)")

    backend_choice = _prompt_menu("  Choice [1]: ", choices={"1", "2"}, default="1")

    if backend_choice == "2":
        return KGBackendChoice(backend="memory", url=None, skipped=False)

    return _prompt_context_harness_url()


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


def _build_memory_entry(kg_choice: KGBackendChoice) -> dict | None:
    """Return the desired mcpServers.memory dict, or None when the entry should be removed."""
    if kg_choice.skipped:
        return None

    if kg_choice.backend == "context-harness" and kg_choice.url:
        return {"type": "http", "url": kg_choice.url}

    # Default: memory (stdio ChromaDB)
    mcp_dir_posix = (CLAUDE_DIR / "knowledge-graph").as_posix()
    return {
        "type": "stdio",
        "command": "uv",
        "args": ["run", "--directory", mcp_dir_posix, "python", "-m", "server"],
        "env": {},
    }


def _build_context7_entry(key: str) -> dict:
    """Return the desired mcpServers.context7 dict for the given API key."""
    return {
        "type": "http",
        "url": "https://mcp.context7.com/mcp",
        "headers": {"CONTEXT7_API_KEY": key},
    }


def _warn_memory_skipped() -> None:
    print()
    print("  [warn] No 'memory' MCP entry written. To complete setup later:")
    print("    - Deploy context-harness-mcp (see https://github.com/valianx/context-harness-mcp)")
    print("    - Re-run this installer, OR")
    print('    - Manually add to ~/.claude.json under mcpServers:')
    print('      "memory": { "type": "http", "url": "https://<your-render-url>/mcp" }')


def register_mcp_servers(context7_key: str | None, kg_choice: KGBackendChoice) -> Path | None:
    """Merge mcpServers entries into ~/.claude.json, skipping the write if nothing changed.

    Returns the backup path if a write occurred, None if the file was left untouched.
    """
    data: dict = {}
    if CLAUDE_JSON.exists():
        with CLAUDE_JSON.open("r", encoding="utf-8") as f:
            data = json.load(f)

    mcp_servers = data.setdefault("mcpServers", {})
    new_memory = _build_memory_entry(kg_choice)
    new_context7 = _build_context7_entry(context7_key) if context7_key else None

    # Detect whether anything would actually change.
    memory_changed = new_memory is not None and mcp_servers.get("memory") != new_memory
    memory_removed = kg_choice.skipped and "memory" in mcp_servers
    context7_changed = new_context7 is not None and mcp_servers.get("context7") != new_context7

    if not (memory_changed or memory_removed or context7_changed):
        print("  ~/.claude.json: no changes needed (mcpServers already match desired state)")
        return None  # no backup, no write

    backup = backup_claude_json()

    if memory_changed:
        mcp_servers["memory"] = new_memory
    elif memory_removed:
        mcp_servers.pop("memory", None)
        _warn_memory_skipped()

    if context7_changed:
        mcp_servers["context7"] = new_context7

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


def detect_legacy_chromadb_mcp() -> None:
    """Surface the legacy ~/.claude/chromadb-mcp/ folder if present.

    In 1.0.x the knowledge-graph MCP server was installed at
    ~/.claude/chromadb-mcp/. In 1.1.0 the install destination moved to
    ~/.claude/knowledge-graph/. The MCP server entry in ~/.claude.json
    is rewritten to point at the new path by register_mcp_servers(), so
    nothing breaks if the legacy folder stays — it just becomes unused
    code on disk.

    The installer does NOT auto-delete the legacy folder (the user owns
    ~/.claude/; see the no-overwrite contract). It surfaces the folder
    so the user can clean it up manually if they want a tidy state. The
    persistent KG data at ~/.claude/chromadb/ is owned by the ChromaDB
    backend and is unaffected by the rename — it stays where it is and
    keeps being read by the new install.
    """
    legacy = CLAUDE_DIR / "chromadb-mcp"
    if not legacy.exists():
        return

    print()
    print("Legacy install detected:")
    print(f"  {legacy}")
    print("  This folder was the 1.0.x install location of the knowledge-graph")
    print("  MCP server. As of 1.1.0 the MCP server lives at")
    print(f"  {CLAUDE_DIR / 'knowledge-graph'} and ~/.claude.json has been")
    print("  rewritten to point at the new path. The legacy folder is unused.")
    print("  To clean up (optional, the installer never deletes user files):")
    if sys.platform == "win32":
        print(f'    Remove-Item -Recurse -Force "{legacy}"')
    else:
        print(f"    rm -rf {legacy}")
    print("  Persistent KG data at ~/.claude/chromadb/ is unaffected and")
    print("  continues to be read by the relocated MCP server.")
    print()


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
def print_summary(
    claude_json_backup: Path | None,
    kg_choice: KGBackendChoice,
    context7_preserved: bool,
) -> None:
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
    print("MCP servers in ~/.claude.json:")
    print(f"  {_format_kg_backend_summary(kg_choice)}")
    c7_status = "preserved" if context7_preserved else "updated"
    print(f"  - context7 (library docs): {c7_status}")
    if claude_json_backup:
        print(f"  backup: {claude_json_backup}")
    elif not claude_json_backup:
        print("  (no backup needed — file was not modified)")

    print()
    print(f"Manifest: {MANIFEST_PATH}")

    print()
    print("Next steps:")
    print("  1. Restart Claude Code so it picks up the new MCP servers.")
    print(f'  2. To enable notification hooks, open hooks/config.json in this repo,')
    print(f'     copy the "{os_label}" section, and merge it into')
    print(f'     ~/.claude/settings.json under the "hooks" key.')


def _format_kg_backend_summary(kg_choice: KGBackendChoice) -> str:
    if kg_choice.skipped:
        return "- memory: (skipped - no MCP entry written)"
    preserved_tag = " [preserved]" if kg_choice.preserved else " [updated]"
    if kg_choice.backend == "context-harness" and kg_choice.url:
        return f"- memory: context-harness (http) -> {kg_choice.url}{preserved_tag}"
    kg_path = CLAUDE_DIR / "knowledge-graph"
    return f"- memory: ChromaDB (stdio) -> {kg_path}{preserved_tag}"


# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------
def main() -> None:
    global force_flag

    print("WARNING: bin/install.py is deprecated. Run bin/install.sh or bin/install.ps1 instead.", file=sys.stderr)
    print("This Python installer continues to work for one more release, then will be removed.", file=sys.stderr)
    print("", file=sys.stderr)

    # Parse --force before anything else so helpers can read the flag.
    force_flag = "--force" in sys.argv
    if force_flag:
        sys.argv = [a for a in sys.argv if a != "--force"]
        print("  --force: bypassing preservation; will overwrite existing entries.")

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

    print("Knowledge Graph backend setup:")
    kg_choice = prompt_kg_backend()
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

    if kg_choice.backend == "memory" and not kg_choice.preserved:
        install_knowledge_graph()
    elif kg_choice.preserved and kg_choice.backend == "memory":
        print("  knowledge-graph (ChromaDB): skipped (existing entry preserved)")
    else:
        print("  knowledge-graph (ChromaDB): skipped (using context-harness backend)")

    detect_legacy_chromadb_mcp()

    # Determine whether the context7 key will change so we can report it accurately.
    existing_c7_entry = _read_existing_mcp_servers().get("context7", {})
    existing_c7_key = existing_c7_entry.get("headers", {}).get("CONTEXT7_API_KEY", "").strip()
    context7_preserved = context7_key == existing_c7_key and _is_valid_context7_key(existing_c7_key)

    print("Registering MCP servers in ~/.claude.json...")
    claude_json_backup = register_mcp_servers(context7_key, kg_choice)

    save_manifest()

    print_summary(claude_json_backup, kg_choice, context7_preserved)


if __name__ == "__main__":
    main()
