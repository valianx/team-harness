#!/usr/bin/env python3
"""Capture and compare an immutable GitHub pull-request review context."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import secrets
import stat
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Iterable


SCHEMA_VERSION = 3
COMMAND_TIMEOUT_SECONDS = 60
_capture_deadline: float | None = None
BOT_BODY_LIMIT = 500
HUMAN_BODY_LIMIT = 2_000
DETAILS_RE = re.compile(r"<details\b[^>]*>.*?</details>", re.IGNORECASE | re.DOTALL)
HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
HTML_TAG_RE = re.compile(r"</?(?:summary|sub|sup|kbd|picture|source)\b[^>]*>", re.IGNORECASE)
BOT_STATUS_PATTERNS = (
    ("review limit reached", "Bot status: review limit reached."),
    ("review skipped", "Bot status: review skipped."),
    ("review paused", "Bot status: review paused."),
    ("review in progress", "Bot status: review in progress."),
)


class ContextError(RuntimeError):
    """Raised when a trustworthy context cannot be captured."""


SAFE_LEAF_RE = re.compile(r"^[A-Za-z0-9._-]+$")
REVIEW_PARENT_RE = re.compile(r"^pr-review-([1-9][0-9]*)$")
REVIEW_RUN_RE = re.compile(r"^run-([a-f0-9]{32})$")
REVIEW_OWNER_FILE = ".team-harness-review-owner.json"
NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)
DIRECTORY = getattr(os, "O_DIRECTORY", 0)


def _safe_leaf(name: str) -> str:
    if name in {".", ".."} or not SAFE_LEAF_RE.fullmatch(name):
        raise ContextError("artifact leaf name is not safe")
    return name


def _open_directory(path: Path) -> tuple[Path, int]:
    if path.is_symlink():
        raise ContextError("artifact directory must not be a symlink")
    resolved = path.resolve(strict=True)
    try:
        fd = os.open(resolved, os.O_RDONLY | DIRECTORY | NOFOLLOW)
    except OSError as error:
        raise ContextError("cannot open trusted artifact directory") from error
    if not stat.S_ISDIR(os.fstat(fd).st_mode):
        os.close(fd)
        raise ContextError("trusted artifact root is not a directory")
    return resolved, fd


def _regular_stat_at(directory_fd: int, name: str) -> os.stat_result:
    try:
        value = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    except OSError as error:
        raise ContextError("cannot inspect artifact leaf") from error
    if not stat.S_ISREG(value.st_mode):
        raise ContextError("artifact leaf is not a regular file")
    return value


def safe_read_leaf(root: Path, name: str, *, limit: int = 2_000_000) -> bytes:
    name = _safe_leaf(name)
    _, directory_fd = _open_directory(root)
    try:
        before = _regular_stat_at(directory_fd, name)
        try:
            leaf_fd = os.open(name, os.O_RDONLY | NOFOLLOW, dir_fd=directory_fd)
        except OSError as error:
            raise ContextError("cannot open artifact leaf without following links") from error
        try:
            after = os.fstat(leaf_fd)
            if not stat.S_ISREG(after.st_mode) or (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
                raise ContextError("artifact leaf changed before secure read")
            chunks: list[bytes] = []
            total = 0
            while True:
                chunk = os.read(leaf_fd, min(65_536, limit + 1 - total))
                if not chunk:
                    break
                chunks.append(chunk)
                total += len(chunk)
                if total > limit:
                    raise ContextError("artifact leaf exceeds safe read limit")
            return b"".join(chunks)
        finally:
            os.close(leaf_fd)
    finally:
        os.close(directory_fd)


def promote_artifact(root: Path, temporary_name: str, final_name: str) -> None:
    temporary_name = _safe_leaf(temporary_name)
    final_name = _safe_leaf(final_name)
    _, directory_fd = _open_directory(root)
    try:
        before = _regular_stat_at(directory_fd, temporary_name)
        try:
            temporary_fd = os.open(
                temporary_name,
                os.O_RDONLY | NOFOLLOW,
                dir_fd=directory_fd,
            )
        except OSError as error:
            raise ContextError("cannot pin temporary artifact without following links") from error
        staging: str | None = None
        try:
            pinned = os.fstat(temporary_fd)
            if not stat.S_ISREG(pinned.st_mode) or (before.st_dev, before.st_ino) != (pinned.st_dev, pinned.st_ino):
                raise ContextError("temporary artifact changed before promotion")
            try:
                final = os.stat(final_name, dir_fd=directory_fd, follow_symlinks=False)
            except FileNotFoundError:
                final = None
            except OSError as error:
                raise ContextError("cannot inspect final artifact leaf") from error
            if final is not None and not stat.S_ISREG(final.st_mode):
                raise ContextError("final artifact leaf is not a regular file")
            current = _regular_stat_at(directory_fd, temporary_name)
            if (current.st_dev, current.st_ino) != (pinned.st_dev, pinned.st_ino):
                raise ContextError("temporary artifact changed during promotion")
            staging = f"tmp-pinned-{secrets.token_hex(16)}"
            try:
                os.link(
                    temporary_name,
                    staging,
                    src_dir_fd=directory_fd,
                    dst_dir_fd=directory_fd,
                    follow_symlinks=False,
                )
            except OSError as error:
                raise ContextError("cannot link pinned temporary artifact") from error
            staged = _regular_stat_at(directory_fd, staging)
            if (staged.st_dev, staged.st_ino) != (pinned.st_dev, pinned.st_ino):
                os.unlink(staging, dir_fd=directory_fd)
                raise ContextError("pinned staging artifact identity mismatch")
            os.replace(
                staging,
                final_name,
                src_dir_fd=directory_fd,
                dst_dir_fd=directory_fd,
            )
            promoted = _regular_stat_at(directory_fd, final_name)
            if (promoted.st_dev, promoted.st_ino) != (pinned.st_dev, pinned.st_ino):
                raise ContextError("promoted artifact identity mismatch")
            try:
                leftover = os.stat(temporary_name, dir_fd=directory_fd, follow_symlinks=False)
            except FileNotFoundError:
                leftover = None
            if leftover is not None and (leftover.st_dev, leftover.st_ino) == (pinned.st_dev, pinned.st_ino):
                os.unlink(temporary_name, dir_fd=directory_fd)
        except OSError as error:
            raise ContextError("cannot atomically promote artifact leaf") from error
        finally:
            if staging is not None:
                try:
                    os.unlink(staging, dir_fd=directory_fd)
                except FileNotFoundError:
                    pass
            os.close(temporary_fd)
    finally:
        os.close(directory_fd)


def ensure_workspaces_ignored(repo_root: Path) -> None:
    resolved, directory_fd = _open_directory(repo_root)
    del resolved
    name = ".gitignore"
    try:
        try:
            current = safe_read_leaf(repo_root, name, limit=1_000_000)
            mode = _regular_stat_at(directory_fd, name).st_mode & 0o777
        except ContextError:
            try:
                existing = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            except FileNotFoundError:
                current = b""
                mode = 0o644
            else:
                if not stat.S_ISREG(existing.st_mode):
                    raise ContextError(".gitignore is not a regular non-symlink file")
                raise
        try:
            text = current.decode("utf-8")
        except UnicodeDecodeError as error:
            raise ContextError(".gitignore is not UTF-8 text") from error
        if any(line in {"/workspaces", "/workspaces/"} for line in text.splitlines()):
            return
        updated = current
        if updated and not updated.endswith(b"\n"):
            updated += b"\n"
        updated += b"/workspaces/\n"
        temporary = f".gitignore.team-harness-{secrets.token_hex(8)}"
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW
        temporary_fd = os.open(temporary, flags, mode, dir_fd=directory_fd)
        try:
            view = memoryview(updated)
            while view:
                view = view[os.write(temporary_fd, view):]
            os.fsync(temporary_fd)
        finally:
            os.close(temporary_fd)
        os.replace(temporary, name, src_dir_fd=directory_fd, dst_dir_fd=directory_fd)
    finally:
        os.close(directory_fd)


def _review_owner(pr: int, token: str) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "kind": "team_harness_pr_review_run_owner",
        "pr": pr,
        "owner_token": token,
    }


def _review_parent(repo_root: Path, pr: int, *, create: bool) -> Path:
    if pr <= 0:
        raise ContextError("PR number must be positive")
    root, root_fd = _open_directory(repo_root)
    os.close(root_fd)
    workspaces = root / "workspaces"
    if create:
        workspaces.mkdir(mode=0o700, exist_ok=True)
    workspaces_resolved, workspaces_fd = _open_directory(workspaces)
    os.close(workspaces_fd)
    if workspaces_resolved.parent != root:
        raise ContextError("workspaces must be a direct child of the repository")
    parent = workspaces_resolved / f"pr-review-{pr}"
    if create:
        parent.mkdir(mode=0o700, exist_ok=True)
    parent_resolved, parent_fd = _open_directory(parent)
    os.close(parent_fd)
    if parent_resolved.parent != workspaces_resolved:
        raise ContextError("review parent must be a direct child of workspaces")
    return parent_resolved


def _load_review_owner(artifact_root: Path) -> dict[str, Any]:
    try:
        value = json.loads(safe_read_leaf(artifact_root, REVIEW_OWNER_FILE, limit=4096))
    except (ContextError, json.JSONDecodeError) as error:
        raise ContextError("review run has no valid ownership marker") from error
    expected_keys = {"schema_version", "kind", "pr", "owner_token"}
    if (
        not isinstance(value, dict)
        or set(value) != expected_keys
        or value.get("schema_version") != 1
        or value.get("kind") != "team_harness_pr_review_run_owner"
        or not isinstance(value.get("pr"), int)
        or not re.fullmatch(r"[a-f0-9]{32}", value.get("owner_token", ""))
    ):
        raise ContextError("review run has no valid ownership marker")
    return value


def validate_owned_review_run(
    repo_root: Path,
    artifact_root: Path,
    owner_token: str,
    pr: int,
) -> Path:
    if not re.fullmatch(r"[a-f0-9]{32}", owner_token):
        raise ContextError("invalid review run owner token")
    run, run_fd = _open_directory(artifact_root)
    os.close(run_fd)
    if run.name != f"run-{owner_token}":
        raise ContextError("review run path does not match its owner token")
    expected_parent = _review_parent(repo_root, pr, create=False)
    if run.parent != expected_parent:
        raise ContextError("review run is outside the repository review parent")
    if _load_review_owner(run) != _review_owner(pr, owner_token):
        raise ContextError("review run ownership mismatch")
    return run


def create_review_run(repo_root: Path, pr: int) -> dict[str, Any]:
    parent = _review_parent(repo_root, pr, create=True)
    for _ in range(8):
        token = secrets.token_hex(16)
        artifact_root = parent / f"run-{token}"
        try:
            artifact_root.mkdir(mode=0o700)
        except FileExistsError:
            continue
        marker = json.dumps(_review_owner(pr, token), sort_keys=True).encode("utf-8") + b"\n"
        directory, directory_fd = _open_directory(artifact_root)
        try:
            marker_fd = os.open(
                REVIEW_OWNER_FILE,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW,
                0o600,
                dir_fd=directory_fd,
            )
            try:
                view = memoryview(marker)
                while view:
                    view = view[os.write(marker_fd, view):]
                os.fsync(marker_fd)
            finally:
                os.close(marker_fd)
        except Exception:
            try:
                os.unlink(REVIEW_OWNER_FILE, dir_fd=directory_fd)
            except FileNotFoundError:
                pass
            os.close(directory_fd)
            artifact_root.rmdir()
            raise
        os.close(directory_fd)
        return {"artifact_root": str(directory), "owner_token": token, "pr": pr}
    raise ContextError("cannot allocate an isolated review run")


def _temporary_leaf(artifact_root: Path, prefix: str) -> Path:
    _safe_leaf(prefix)
    _, directory_fd = _open_directory(artifact_root)
    try:
        for _ in range(8):
            name = f"{prefix}.{secrets.token_hex(8)}"
            try:
                leaf_fd = os.open(
                    name,
                    os.O_RDWR | os.O_CREAT | os.O_EXCL | NOFOLLOW,
                    0o600,
                    dir_fd=directory_fd,
                )
            except FileExistsError:
                continue
            os.close(leaf_fd)
            return artifact_root / name
    finally:
        os.close(directory_fd)
    raise ContextError("cannot allocate a temporary review artifact")


def _discard_artifact_leaf(artifact_root: Path, name: str) -> None:
    name = _safe_leaf(name)
    _, directory_fd = _open_directory(artifact_root)
    try:
        try:
            metadata = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        except FileNotFoundError:
            return
        if not stat.S_ISREG(metadata.st_mode):
            raise ContextError("temporary artifact is not a regular file")
        os.unlink(name, dir_fd=directory_fd)
    finally:
        os.close(directory_fd)


def _write_existing_leaf(path: Path, content: bytes) -> None:
    root, directory_fd = _open_directory(path.parent)
    del root
    name = _safe_leaf(path.name)
    try:
        before = _regular_stat_at(directory_fd, name)
        leaf_fd = os.open(name, os.O_WRONLY | os.O_TRUNC | NOFOLLOW, dir_fd=directory_fd)
        try:
            opened = os.fstat(leaf_fd)
            if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
                raise ContextError("temporary artifact changed before write")
            view = memoryview(content)
            while view:
                view = view[os.write(leaf_fd, view):]
            os.fsync(leaf_fd)
        finally:
            os.close(leaf_fd)
    finally:
        os.close(directory_fd)


def find_resumable_review_run(repo_root: Path, pr: int) -> dict[str, Any]:
    parent = _review_parent(repo_root, pr, create=False)
    candidates: list[dict[str, Any]] = []
    for child in parent.iterdir():
        if not REVIEW_RUN_RE.fullmatch(child.name) or child.is_symlink() or not child.is_dir():
            continue
        try:
            resolved, descriptor = _open_directory(child)
            os.close(descriptor)
            owner = _load_review_owner(resolved)
            if owner["pr"] != pr or child.name != f"run-{owner['owner_token']}":
                continue
            context_leaf = safe_read_leaf(resolved, "pr-review-context.json")
            draft_leaf = safe_read_leaf(resolved, "pr-review-final.md")
            inline_leaf = safe_read_leaf(resolved, "pr-review-inline.json")
            if not context_leaf or not draft_leaf or not inline_leaf:
                continue
        except (ContextError, OSError):
            continue
        candidates.append({
            "artifact_root": str(resolved),
            "owner_token": owner["owner_token"],
            "pr": pr,
        })
    if len(candidates) != 1:
        raise ContextError(
            "resume requires exactly one complete isolated review run"
        )
    return candidates[0]


def _remove_tree_contents(directory_fd: int) -> None:
    with os.scandir(directory_fd) as entries:
        for entry in entries:
            metadata = entry.stat(follow_symlinks=False)
            if stat.S_ISDIR(metadata.st_mode):
                child_fd = os.open(entry.name, os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=directory_fd)
                try:
                    _remove_tree_contents(child_fd)
                finally:
                    os.close(child_fd)
                os.rmdir(entry.name, dir_fd=directory_fd)
            elif stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
                os.unlink(entry.name, dir_fd=directory_fd)
            else:
                raise ContextError("review run contains an unexpected special file")


def cleanup_review_run(repo_root: Path, artifact_root: Path, owner_token: str) -> None:
    parent_match = REVIEW_PARENT_RE.fullmatch(artifact_root.parent.name)
    if not parent_match:
        raise ContextError("review run path does not match its owner token")
    pr = int(parent_match.group(1))
    run = validate_owned_review_run(repo_root, artifact_root, owner_token, pr)
    expected_parent = run.parent

    snapshot = run / "pr-review-snapshot.git"
    worktree = run / "pr-review-worktree"
    if worktree.exists() or worktree.is_symlink():
        if worktree.is_symlink() or not snapshot.is_dir() or snapshot.is_symlink():
            raise ContextError("cannot prove ownership of the frozen worktree")
        run_text([
            "git", "--git-dir", str(snapshot), "worktree", "remove", str(worktree),
        ])
        if worktree.exists() or worktree.is_symlink():
            raise ContextError("frozen worktree cleanup did not complete")

    parent_fd = os.open(expected_parent, os.O_RDONLY | DIRECTORY | NOFOLLOW)
    try:
        pinned_fd = os.open(run.name, os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=parent_fd)
        try:
            _remove_tree_contents(pinned_fd)
        finally:
            os.close(pinned_fd)
        os.rmdir(run.name, dir_fd=parent_fd)
    finally:
        os.close(parent_fd)


def command_environment(extra_env: dict[str, str] | None = None) -> dict[str, str]:
    return {
        **os.environ,
        "GH_PROMPT_DISABLED": "1",
        "GIT_TERMINAL_PROMPT": "0",
        **(extra_env or {}),
    }


def run_json(
    command: list[str],
    *,
    cwd: Path | None = None,
    extra_env: dict[str, str] | None = None,
) -> Any:
    timeout = command_timeout()
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=command_environment(extra_env),
        )
    except subprocess.TimeoutExpired as error:
        raise ContextError(
            f"{' '.join(command[:3])} timed out within the {COMMAND_TIMEOUT_SECONDS}s capture limit"
        ) from error
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown error"
        raise ContextError(f"{' '.join(command[:3])} failed: {detail}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise ContextError(f"{' '.join(command[:3])} returned invalid JSON") from error


def run_text(
    command: list[str],
    *,
    cwd: Path | None = None,
    extra_env: dict[str, str] | None = None,
) -> str:
    timeout = command_timeout()
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=command_environment(extra_env),
        )
    except subprocess.TimeoutExpired as error:
        raise ContextError(
            f"{' '.join(command[:3])} timed out within the {COMMAND_TIMEOUT_SECONDS}s capture limit"
        ) from error
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown error"
        raise ContextError(f"{' '.join(command[:3])} failed: {detail}")
    return result.stdout.strip()


def command_timeout() -> float:
    if _capture_deadline is None:
        return float(COMMAND_TIMEOUT_SECONDS)
    remaining = _capture_deadline - time.monotonic()
    if remaining <= 0:
        raise ContextError(
            f"capture timed out within the {COMMAND_TIMEOUT_SECONDS}s capture limit"
        )
    return min(float(COMMAND_TIMEOUT_SECONDS), remaining)


def configure_deadline(deadline_epoch: float | None = None) -> None:
    global _capture_deadline
    if deadline_epoch is None:
        _capture_deadline = time.monotonic() + COMMAND_TIMEOUT_SECONDS
        return
    remaining = deadline_epoch - time.time()
    _capture_deadline = time.monotonic() + max(0.0, remaining)


def run_to_leaf(
    artifact_root: Path,
    name: str,
    command: list[str],
    *,
    combine_stderr: bool = False,
    allow_failure: bool = False,
) -> int:
    name = _safe_leaf(name)
    _, directory_fd = _open_directory(artifact_root)
    try:
        before = _regular_stat_at(directory_fd, name)
        try:
            leaf_fd = os.open(name, os.O_WRONLY | os.O_TRUNC | NOFOLLOW, dir_fd=directory_fd)
        except OSError as error:
            raise ContextError("cannot open temporary artifact without following links") from error
        try:
            opened = os.fstat(leaf_fd)
            if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
                raise ContextError("temporary artifact changed before command write")
            timeout = command_timeout()
            try:
                result = subprocess.run(
                    command,
                    check=False,
                    stdout=leaf_fd,
                    stderr=subprocess.STDOUT if combine_stderr else subprocess.PIPE,
                    timeout=timeout,
                    env=command_environment(),
                )
            except subprocess.TimeoutExpired as error:
                raise ContextError(
                    f"{' '.join(command[:3])} timed out within the "
                    f"{COMMAND_TIMEOUT_SECONDS}s capture limit"
                ) from error
            if result.returncode != 0 and not allow_failure:
                detail = (result.stderr or b"").decode(errors="replace").strip()
                raise ContextError(
                    f"{' '.join(command[:3])} failed: {detail or 'unknown error'}"
                )
            return result.returncode
        finally:
            os.close(leaf_fd)
    finally:
        os.close(directory_fd)


def is_bot(login: str) -> bool:
    lowered = login.lower()
    return lowered.endswith("[bot]") or lowered.endswith("-bot") or lowered in {
        "coderabbitai",
        "github-actions",
    }


def clean_body(body: str | None, login: str = "") -> str:
    """Remove bot chrome and bound prose while retaining actionable content."""
    text = body or ""
    text = DETAILS_RE.sub(" ", text)
    text = HTML_COMMENT_RE.sub(" ", text)
    text = HTML_TAG_RE.sub(" ", text)
    text = re.sub(r"</?details\b[^>]*>", " ", text, flags=re.IGNORECASE)
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if is_bot(login):
        lowered = text.lower()
        for marker, summary in BOT_STATUS_PATTERNS:
            if marker in lowered:
                return summary
        text = re.sub(
            r"\n---\n.*?thanks for using \[?coderabbit.*$",
            "",
            text,
            flags=re.IGNORECASE | re.DOTALL,
        ).strip()
    limit = BOT_BODY_LIMIT if is_bot(login) else HUMAN_BODY_LIMIT
    if len(text) > limit:
        text = text[: limit - 18].rstrip() + "\n[… body trimmed]"
    return text


def is_noise_issue_comment(comment: dict[str, Any]) -> bool:
    body = (comment.get("body") or "").strip()
    if body.startswith("Bot status:"):
        return True
    return bool(
        re.fullmatch(
            r"(?:@[\w-]+(?:\[bot\])?|https://github\.com/[\w-]+)\s+"
            r"(?:review|re-review|full review)",
            body,
            flags=re.IGNORECASE,
        )
    )


def flatten_pages(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    if value and all(isinstance(page, list) for page in value):
        return [item for page in value for item in page if isinstance(item, dict)]
    return [item for item in value if isinstance(item, dict)]


def gh_pages(endpoint: str) -> list[dict[str, Any]]:
    return flatten_pages(run_json(["gh", "api", "--paginate", "--slurp", endpoint]))


def author_login(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("login") or "")
    return ""


def capture_issue_comments(repo: str, number: int) -> list[dict[str, Any]]:
    rows = gh_pages(f"repos/{repo}/issues/{number}/comments?per_page=100")
    return [
        {
            "id": row.get("id"),
            "author": author_login(row.get("user")),
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
            "url": row.get("html_url"),
            "body": clean_body(row.get("body"), author_login(row.get("user"))),
        }
        for row in rows
    ]


def capture_reviews(repo: str, number: int) -> list[dict[str, Any]]:
    rows = gh_pages(f"repos/{repo}/pulls/{number}/reviews?per_page=100")
    return [
        {
            "id": row.get("id"),
            "author": author_login(row.get("user")),
            "state": row.get("state"),
            "submitted_at": row.get("submitted_at"),
            "commit_id": row.get("commit_id"),
            "body": clean_body(row.get("body"), author_login(row.get("user"))),
        }
        for row in rows
    ]


def capture_review_comments(repo: str, number: int) -> list[dict[str, Any]]:
    rows = gh_pages(f"repos/{repo}/pulls/{number}/comments?per_page=100")
    return [
        {
            "id": row.get("id"),
            "review_id": row.get("pull_request_review_id"),
            "reply_to_id": row.get("in_reply_to_id"),
            "author": author_login(row.get("user")),
            "path": row.get("path"),
            "line": row.get("line"),
            "original_line": row.get("original_line"),
            "side": row.get("side"),
            "commit_id": row.get("commit_id"),
            "original_commit_id": row.get("original_commit_id"),
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
            "url": row.get("html_url"),
            "body": clean_body(row.get("body"), author_login(row.get("user"))),
        }
        for row in rows
    ]


THREADS_QUERY = """
query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        nodes {
          id isResolved isOutdated path line originalLine
          comments(first: 100) {
            nodes {
              databaseId body createdAt updatedAt url
              author { login }
              commit { oid }
              replyTo { databaseId }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}
"""

THREAD_COMMENTS_QUERY = """
query($threadId: ID!, $cursor: String!) {
  node(id: $threadId) {
    ... on PullRequestReviewThread {
      comments(first: 100, after: $cursor) {
        nodes {
          databaseId body createdAt updatedAt url
          author { login }
          commit { oid }
          replyTo { databaseId }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}
"""


def normalize_thread_comment(comment: dict[str, Any]) -> dict[str, Any]:
    login = author_login(comment.get("author"))
    return {
        "id": comment.get("databaseId"),
        "reply_to_id": (comment.get("replyTo") or {}).get("databaseId"),
        "author": login,
        "created_at": comment.get("createdAt"),
        "updated_at": comment.get("updatedAt"),
        "commit_id": (comment.get("commit") or {}).get("oid"),
        "url": comment.get("url"),
        "body": clean_body(comment.get("body"), login),
    }


def capture_thread_comments(node: dict[str, Any]) -> list[dict[str, Any]]:
    connection = node.get("comments") or {}
    comments = [
        normalize_thread_comment(comment)
        for comment in connection.get("nodes") or []
    ]
    while (connection.get("pageInfo") or {}).get("hasNextPage"):
        cursor = (connection.get("pageInfo") or {}).get("endCursor")
        if not cursor:
            raise ContextError("GitHub reported another comment page without a cursor")
        data = run_json(
            [
                "gh",
                "api",
                "graphql",
                "-f",
                f"query={THREAD_COMMENTS_QUERY}",
                "-f",
                f"threadId={node.get('id')}",
                "-f",
                f"cursor={cursor}",
            ]
        )
        connection = (data.get("data", {}).get("node") or {}).get("comments") or {}
        comments.extend(
            normalize_thread_comment(comment)
            for comment in connection.get("nodes") or []
        )
    return comments


def capture_threads(repo: str, number: int) -> list[dict[str, Any]]:
    owner, name = repo.split("/", 1)
    cursor: str | None = None
    threads: list[dict[str, Any]] = []
    while True:
        command = [
            "gh",
            "api",
            "graphql",
            "-f",
            f"query={THREADS_QUERY}",
            "-F",
            f"owner={owner}",
            "-F",
            f"name={name}",
            "-F",
            f"number={number}",
        ]
        if cursor:
            command.extend(["-f", f"cursor={cursor}"])
        data = run_json(command)
        connection = (
            data.get("data", {})
            .get("repository", {})
            .get("pullRequest", {})
            .get("reviewThreads", {})
        )
        for node in connection.get("nodes") or []:
            threads.append(
                {
                    "id": node.get("id"),
                    "resolved": bool(node.get("isResolved")),
                    "outdated": bool(node.get("isOutdated")),
                    "path": node.get("path"),
                    "line": node.get("line"),
                    "original_line": node.get("originalLine"),
                    "comments": capture_thread_comments(node),
                }
            )
        page_info = connection.get("pageInfo") or {}
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")
        if not cursor:
            raise ContextError("GitHub reported another thread page without a cursor")
    return threads


def capture_commits(repo: str, number: int) -> list[dict[str, Any]]:
    rows = gh_pages(f"repos/{repo}/pulls/{number}/commits?per_page=100")
    return [
        {
            "oid": row.get("sha"),
            "author": (
                author_login(row.get("author"))
                or ((row.get("commit") or {}).get("author") or {}).get("name")
            ),
            "authored_at": ((row.get("commit") or {}).get("author") or {}).get("date"),
            "subject": (
                ((row.get("commit") or {}).get("message") or "").strip().splitlines()
                or [""]
            )[0],
        }
        for row in rows
    ]


def git_snapshot(
    source_repo: Path,
    snapshot_dir: Path,
    remote: str,
    number: int,
    base_oid: str,
    head_oid: str,
) -> dict[str, str]:
    if snapshot_dir.is_symlink():
        raise ContextError("snapshot repository must not be a symlink")
    if snapshot_dir.exists():
        if not snapshot_dir.is_dir():
            raise ContextError("snapshot repository must be a real directory")
        is_bare = run_text(
            ["git", "--git-dir", str(snapshot_dir), "rev-parse", "--is-bare-repository"]
        )
        if is_bare != "true":
            raise ContextError("snapshot repository is not a bare Git repository")
    else:
        run_text(
            ["git", "init", "--bare", "--quiet", "--template=", str(snapshot_dir)]
        )

    fetch_source = run_text(
        ["git", "remote", "get-url", remote],
        cwd=source_repo,
    )
    source_objects = Path(
        run_text(["git", "rev-parse", "--git-path", "objects"], cwd=source_repo)
    )
    if not source_objects.is_absolute():
        source_objects = source_repo / source_objects
    try:
        source_objects = source_objects.resolve(strict=True)
    except OSError as error:
        raise ContextError("cannot resolve the operator checkout object database") from error
    if not source_objects.is_dir():
        raise ContextError("operator checkout object database is not a directory")
    alternate_env = {
        "GIT_ALTERNATE_OBJECT_DIRECTORIES": str(source_objects),
        "GIT_NO_REPLACE_OBJECTS": "1",
    }
    prefix = f"refs/team-harness/review-pr/{number}"
    base_ref = f"{prefix}/base"
    head_ref = f"{prefix}/head"
    run_text(
        [
            "git",
            "--git-dir",
            str(snapshot_dir),
            "fetch",
            "--no-tags",
            "--force",
            fetch_source,
            f"+{base_oid}:{base_ref}",
            f"+refs/pull/{number}/head:{head_ref}",
        ],
        extra_env=alternate_env,
    )
    run_text(
        ["git", "--git-dir", str(snapshot_dir), "repack", "-a", "-d"],
        extra_env=alternate_env,
    )
    fetched_base = run_text(
        ["git", "--git-dir", str(snapshot_dir), "rev-parse", base_ref]
    )
    fetched_head = run_text(
        ["git", "--git-dir", str(snapshot_dir), "rev-parse", head_ref]
    )
    if fetched_base != base_oid or fetched_head != head_oid:
        raise ContextError(
            "PR changed while context was captured; retry before reviewing "
            f"(expected {base_oid[:12]}..{head_oid[:12]}, "
            f"fetched {fetched_base[:12]}..{fetched_head[:12]})"
        )
    merge_base = run_text(
        ["git", "--git-dir", str(snapshot_dir), "merge-base", base_ref, head_ref]
    )
    return {
        "base_ref": base_ref,
        "head_ref": head_ref,
        "merge_base_oid": merge_base,
    }


def stable_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def semantic_conversation_identity(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "pr_metadata": {
            "title": (context.get("pr") or {}).get("title"),
            "body": (context.get("pr") or {}).get("body"),
        },
    }


def review_state_identity(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "issue_comments": [
            comment
            for comment in context.get("issue_comments", [])
            if not is_noise_issue_comment(comment)
        ],
        "review_comments": context.get("review_comments", []),
        "review_threads": context.get("review_threads", []),
        "reviews": context.get("reviews", []),
    }


def conversation_identity(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "semantic": semantic_conversation_identity(context),
        "review_state": review_state_identity(context),
    }


def classify_mergeability(mergeable: Any, merge_state_status: Any) -> str:
    mergeable_value = str(mergeable or "").upper()
    state_value = str(merge_state_status or "").upper()
    if mergeable_value == "CONFLICTING" or state_value == "DIRTY":
        return "conflicting"
    if mergeable_value == "MERGEABLE" and state_value == "CLEAN":
        return "clean"
    return "indeterminate"


SENSITIVE_PATH_PARTS = {
    "auth", "authorization", "crypto", "middleware", "permission", "security",
    "secret", "session",
}
SENSITIVE_FILENAMES = {
    "cargo.lock", "cargo.toml", "go.mod", "go.sum", "package-lock.json",
    "package.json", "pnpm-lock.yaml", "poetry.lock", "pyproject.toml",
    "requirements.txt", "yarn.lock",
}
NON_EXECUTABLE_SUFFIXES = {
    ".adoc", ".avif", ".bmp", ".cfg", ".gif", ".ico", ".ini", ".jpeg", ".jpg",
    ".json", ".md", ".pdf", ".png", ".properties", ".rst", ".svg", ".toml",
    ".txt", ".webp", ".yaml", ".yml",
}
SENSITIVE_DIFF_TOKENS = re.compile(
    r"\b(auth(?:entication|orization)?|crypt(?:o|ography)|eval|exec|password|"
    r"permission|secret|session|subprocess|token)\b|(?:command|sql)\s*(?:build|construct)",
    re.IGNORECASE,
)


DIFF_FILE_BOUNDARY = re.compile(r"(?=^diff --git )", re.MULTILINE)
DIFF_HUNK_START = re.compile(r"^(?:--- |\+\+\+ |@@)")
DIFF_BINARY_MARKER = re.compile(r"^(?:GIT binary patch|Binary files .+ differ)$")


def _is_binary_section(section: str) -> bool:
    # The marker is only authoritative in Git's own header block, before any hunk line —
    # a hunk's readable content can otherwise contain the literal marker text as data.
    for line in section.splitlines():
        if DIFF_HUNK_START.match(line):
            return False
        if DIFF_BINARY_MARKER.match(line):
            return True
    return False


def _readable_diff_text(diff: str) -> str:
    """Diff text with each binary file's own section dropped, keeping every readable hunk
    scannable even when another file in the same PR is binary."""
    sections = DIFF_FILE_BOUNDARY.split(diff)
    return "".join(section for section in sections if not _is_binary_section(section))


def _is_workflow_path(path: Path) -> bool:
    parts = [part.lower() for part in path.parts]
    return any(left == ".github" and right == "workflows" for left, right in zip(parts, parts[1:]))


def classify_security_change(changed_files: str, diff: str) -> str:
    paths = [line.strip() for line in changed_files.splitlines() if line.strip()]
    if not paths or not diff.strip():
        return "indeterminate"
    if any("\x00" in value for value in (changed_files, diff)):
        return "indeterminate"

    for raw_path in paths:
        path = Path(raw_path)
        parts = {part.lower() for part in path.parts}
        if parts & SENSITIVE_PATH_PARTS or path.name.lower() in SENSITIVE_FILENAMES or _is_workflow_path(path):
            return "known-sensitive"
    if SENSITIVE_DIFF_TOKENS.search(_readable_diff_text(diff)):
        return "known-sensitive"
    if all(Path(path).suffix.lower() in NON_EXECUTABLE_SUFFIXES for path in paths):
        return "known-non-executable"
    return "unmatched-executable"


def finalize_hashes(context: dict[str, Any]) -> None:
    code = {
        "base_oid": context["base_oid"],
        "head_oid": context["head_oid"],
        "merge_base_oid": context["merge_base_oid"],
    }
    context["code_hash"] = stable_hash(code)
    context["technical_hash"] = stable_hash(
        {"code_hash": context["code_hash"], "commits": context.get("commits", [])}
    )
    context["semantic_conversation_hash"] = stable_hash(
        semantic_conversation_identity(context)
    )
    context["review_state_hash"] = stable_hash(review_state_identity(context))
    context["conversation_hash"] = stable_hash(conversation_identity(context))
    context["context_hash"] = stable_hash(
        {
            "technical_hash": context["technical_hash"],
            "conversation_hash": context["conversation_hash"],
        }
    )


def capture_metadata(repo: str, number: int) -> dict[str, Any]:
    return run_json(
        [
            "gh",
            "pr",
            "view",
            str(number),
            "--repo",
            repo,
            "--json",
            (
                "number,title,body,author,baseRefName,headRefName,baseRefOid,"
                "headRefOid,isCrossRepository,additions,deletions,changedFiles,url,files,"
                "mergeable,mergeStateStatus"
            ),
        ]
    )


def capture(
    repo: str,
    number: int,
    source_repo: Path,
    remote: str,
    snapshot_dir: Path,
) -> dict[str, Any]:
    metadata = capture_metadata(repo, number)
    base_oid = metadata.get("baseRefOid")
    head_oid = metadata.get("headRefOid")
    if not base_oid or not head_oid:
        raise ContextError("GitHub did not return baseRefOid and headRefOid")

    refs = git_snapshot(
        source_repo,
        snapshot_dir,
        remote,
        number,
        base_oid,
        head_oid,
    )
    context: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "repository": repo,
        "pr": {
            "number": metadata.get("number"),
            "title": metadata.get("title"),
            "body": metadata.get("body") or "",
            "author": author_login(metadata.get("author")),
            "base_ref": metadata.get("baseRefName"),
            "head_ref": metadata.get("headRefName"),
            "is_cross_repository": bool(metadata.get("isCrossRepository")),
            "additions": metadata.get("additions"),
            "deletions": metadata.get("deletions"),
            "changed_files": metadata.get("changedFiles"),
            "url": metadata.get("url"),
            "files": metadata.get("files") or [],
        },
        "base_oid": base_oid,
        "head_oid": head_oid,
        "merge_base_oid": refs["merge_base_oid"],
        "git_refs": {"base": refs["base_ref"], "head": refs["head_ref"]},
        "mergeability": {
            "status": classify_mergeability(
                metadata.get("mergeable"), metadata.get("mergeStateStatus")
            ),
            "mergeable": metadata.get("mergeable"),
            "merge_state_status": metadata.get("mergeStateStatus"),
        },
        "commits": capture_commits(repo, number),
        "issue_comments": capture_issue_comments(repo, number),
        "review_comments": capture_review_comments(repo, number),
        "review_threads": capture_threads(repo, number),
        "reviews": capture_reviews(repo, number),
    }
    final_metadata = capture_metadata(repo, number)
    for field in (
        "baseRefOid", "headRefOid", "title", "body", "mergeable", "mergeStateStatus"
    ):
        if (metadata.get(field) or "") != (final_metadata.get(field) or ""):
            raise ContextError(
                f"PR {field} changed while context was captured; retry before reviewing"
            )
    finalize_hashes(context)
    return context


def load_context(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ContextError(f"cannot read context {path}: {error}") from error
    if value.get("schema_version") != SCHEMA_VERSION:
        raise ContextError(f"unsupported context schema in {path}")
    return value


def compare_contexts(expected: dict[str, Any], actual: dict[str, Any]) -> dict[str, Any]:
    # Invalidation keys on head_oid/commits/code_hash only; mergeability drift is
    # reported for the operator but never forces a restart.
    code_changed = expected.get("code_hash") != actual.get("code_hash")
    conversation_changed = (
        expected.get("conversation_hash") != actual.get("conversation_hash")
    )
    commits_changed = expected.get("commits") != actual.get("commits")
    expected_semantic_hash = expected.get("semantic_conversation_hash") or stable_hash(
        semantic_conversation_identity(expected)
    )
    actual_semantic_hash = actual.get("semantic_conversation_hash") or stable_hash(
        semantic_conversation_identity(actual)
    )
    expected_review_state_hash = expected.get("review_state_hash") or stable_hash(
        review_state_identity(expected)
    )
    actual_review_state_hash = actual.get("review_state_hash") or stable_hash(
        review_state_identity(actual)
    )
    semantic_conversation_changed = expected_semantic_hash != actual_semantic_hash
    review_state_changed = expected_review_state_hash != actual_review_state_hash
    mergeability_changed = expected.get("mergeability") != actual.get("mergeability")
    changed_fields = [
        key
        for key in ("base_oid", "head_oid", "merge_base_oid")
        if expected.get(key) != actual.get(key)
    ]
    return {
        "status": (
            "code-changed"
            if code_changed or commits_changed
            else "conversation-changed"
            if conversation_changed
            else "current"
        ),
        "code_changed": code_changed or commits_changed,
        "conversation_changed": conversation_changed,
        "conversation_change_kind": (
            "semantic"
            if semantic_conversation_changed
            else "review-state"
            if review_state_changed
            else "none"
        ),
        "next_action": (
            "restart-technical-review"
            if code_changed or commits_changed or semantic_conversation_changed
            else "reconcile-conversation"
            if review_state_changed
            else "continue"
        ),
        "technical_results_reusable": not (
            code_changed or commits_changed or semantic_conversation_changed
        ),
        "mergeability_changed": mergeability_changed,
        "changed_fields": changed_fields,
        "expected_head_oid": expected.get("head_oid"),
        "actual_head_oid": actual.get("head_oid"),
        "expected_context_hash": expected.get("context_hash"),
        "actual_context_hash": actual.get("context_hash"),
        "expected_technical_hash": expected.get("technical_hash") or stable_hash(
            {"code_hash": expected.get("code_hash"), "commits": expected.get("commits", [])}
        ),
        "actual_technical_hash": actual.get("technical_hash") or stable_hash(
            {"code_hash": actual.get("code_hash"), "commits": actual.get("commits", [])}
        ),
    }


def latest_same_author(context: dict[str, Any], login: str) -> dict[str, Any] | None:
    root_comment_review_ids = {
        comment.get("review_id")
        for comment in context.get("review_comments", [])
        if comment.get("author") == login
        and not comment.get("reply_to_id")
        and (comment.get("body") or "").strip()
    }
    candidates = [
        review
        for review in context.get("reviews", [])
        if review.get("author") == login and review.get("state") != "DISMISSED"
        and (
            review.get("state") in {"APPROVED", "CHANGES_REQUESTED"}
            or (review.get("body") or "").strip()
            or review.get("id") in root_comment_review_ids
        )
    ]
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda review: (review.get("submitted_at") or "", int(review.get("id") or 0)),
    )


def body_lines(body: str, indent: str = "  ") -> Iterable[str]:
    for line in body.splitlines() or ["(empty)"]:
        yield f"{indent}{line}"


def render_context(context: dict[str, Any]) -> str:
    mergeability = context.get("mergeability") or {}
    lines = [
        f"Reviewed snapshot: `{context['head_oid']}`",
        f"Base snapshot: `{context['base_oid']}`",
        f"Merge base: `{context['merge_base_oid']}`",
        f"Captured at: `{context.get('fetched_at', 'unknown')}`",
        f"Mergeability: **{mergeability.get('status', 'indeterminate')}**",
        f"Raw mergeable: `{mergeability.get('mergeable')}`",
        f"Raw merge state: `{mergeability.get('merge_state_status')}`",
        "",
        "## Commits",
    ]
    for commit in context.get("commits", []):
        subject = commit.get("subject") or commit.get("message") or ""
        lines.append(f"- `{str(commit.get('oid') or '')[:12]}` {subject}")
    if not context.get("commits"):
        lines.append("- None")

    lines.extend(["", "## Open review threads"])
    open_threads = [
        thread
        for thread in context.get("review_threads", [])
        if not thread.get("resolved") and not thread.get("outdated")
    ]
    for thread in open_threads:
        lines.append(
            f"- Thread `{thread.get('id')}` at "
            f"`{thread.get('path')}:{thread.get('line') or thread.get('original_line') or '?'}`"
        )
        for comment in thread.get("comments", []):
            lines.append(
                f"  - @{comment.get('author')} ({comment.get('updated_at') or comment.get('created_at')}):"
            )
            lines.extend(body_lines(comment.get("body") or "", "    "))
    if not open_threads:
        lines.append("- None")

    recent_threads = sorted(
        [
            thread
            for thread in context.get("review_threads", [])
            if thread.get("resolved") or thread.get("outdated")
        ],
        key=lambda thread: max(
            [
                comment.get("updated_at") or comment.get("created_at") or ""
                for comment in thread.get("comments", [])
            ]
            or [""]
        ),
        reverse=True,
    )[:10]
    lines.extend(["", "## Recently closed or outdated threads"])
    for thread in recent_threads:
        disposition = "resolved" if thread.get("resolved") else "outdated"
        latest = (thread.get("comments") or [{}])[-1]
        lines.append(
            f"- [{disposition}] `{thread.get('path')}:{thread.get('line') or thread.get('original_line') or '?'}` "
            f"latest @{latest.get('author')}: {latest.get('body') or '(empty)'}"
        )
    if not recent_threads:
        lines.append("- None")

    all_issue_comments = sorted(
        [
            comment
            for comment in context.get("issue_comments", [])
            if (comment.get("body") or "").strip() and not is_noise_issue_comment(comment)
        ],
        key=lambda comment: comment.get("updated_at") or comment.get("created_at") or "",
        reverse=True,
    )
    issue_comments = [
        comment for comment in all_issue_comments if not is_bot(comment.get("author") or "")
    ][:20]
    issue_comments.extend(
        [
            comment
            for comment in all_issue_comments
            if is_bot(comment.get("author") or "")
        ][:5]
    )
    issue_comments.sort(
        key=lambda comment: comment.get("updated_at") or comment.get("created_at") or "",
        reverse=True,
    )
    lines.extend(["", "## Recent PR conversation"])
    for comment in issue_comments:
        lines.append(
            f"- ID {comment.get('id')} @{comment.get('author')} "
            f"({comment.get('updated_at') or comment.get('created_at')}):"
        )
        lines.extend(body_lines(comment.get("body") or ""))
    if not issue_comments:
        lines.append("- None")

    reviews = sorted(
        context.get("reviews", []),
        key=lambda review: review.get("submitted_at") or "",
        reverse=True,
    )[:20]
    lines.extend(["", "## Prior formal reviews"])
    for review in reviews:
        lines.append(
            f"- ID {review.get('id')} @{review.get('author')} [{review.get('state')}] "
            f"on `{str(review.get('commit_id') or '')[:12]}` ({review.get('submitted_at')}):"
        )
        lines.extend(body_lines(review.get("body") or ""))
    if not reviews:
        lines.append("- None")
    return "\n".join(lines).rstrip() + "\n"


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def resolve_snapshot_dir(artifact_root: Path, requested_snapshot: Path) -> Path:
    try:
        snapshot_parent = requested_snapshot.parent.resolve(strict=True)
    except OSError as error:
        raise ContextError(
            "snapshot repository parent does not exist; pass --snapshot-dir "
            "inside the artifact root"
        ) from error
    if snapshot_parent != artifact_root:
        raise ContextError("snapshot repository must be a direct child of the artifact root")
    _safe_leaf(requested_snapshot.name)
    return artifact_root / requested_snapshot.name


def command_deadline(args: argparse.Namespace) -> int:
    if args.seconds <= 0 or args.seconds > COMMAND_TIMEOUT_SECONDS:
        raise ContextError(
            f"deadline must be between 1 and {COMMAND_TIMEOUT_SECONDS} seconds"
        )
    print(f"{time.time() + args.seconds:.6f}")
    return 0


def capture_to_path(
    *,
    repo: str,
    pr: int,
    output: Path,
    git_dir: Path,
    snapshot_dir: Path | None,
    deadline_epoch: float | None,
    remote: str = "origin",
) -> dict[str, Any]:
    global _capture_deadline
    artifact_root, artifact_fd = _open_directory(output.parent)
    os.close(artifact_fd)
    requested_snapshot = snapshot_dir or artifact_root / "pr-review-snapshot.git"
    snapshot_dir = resolve_snapshot_dir(artifact_root, requested_snapshot)
    configure_deadline(deadline_epoch)
    try:
        context = capture(
            repo,
            pr,
            git_dir.resolve(),
            remote,
            snapshot_dir,
        )
    finally:
        _capture_deadline = None
    write_json(output, context)
    return context


def command_capture(args: argparse.Namespace) -> int:
    context = capture_to_path(
        repo=args.repo,
        pr=args.pr,
        output=args.output,
        git_dir=args.git_dir,
        snapshot_dir=args.snapshot_dir,
        deadline_epoch=args.deadline_epoch,
        remote=args.remote,
    )
    print(
        json.dumps(
            {
                "status": "captured",
                "head_oid": context["head_oid"],
                "base_oid": context["base_oid"],
                "merge_base_oid": context["merge_base_oid"],
                "technical_hash": context["technical_hash"],
                "conversation_hash": context["conversation_hash"],
                "context_hash": context["context_hash"],
                "mergeability": context.get("mergeability"),
                "output": str(args.output),
            }
        )
    )
    return 0


def materialize_review_artifacts(
    *,
    repo: str,
    pr: int,
    context_path: Path,
    artifact_root_value: Path,
    snapshot_dir_value: Path,
    diff_name: str,
    files_name: str,
    checks_name: str,
    worktree: Path,
    deadline_epoch: float,
) -> None:
    global _capture_deadline
    artifact_root, artifact_fd = _open_directory(artifact_root_value)
    os.close(artifact_fd)
    snapshot_dir = resolve_snapshot_dir(artifact_root, snapshot_dir_value)
    context = load_context(context_path)
    git_refs = context.get("git_refs") or {}
    base_ref = git_refs.get("base")
    head_ref = git_refs.get("head")
    head_oid = context.get("head_oid")
    if not all(isinstance(value, str) and value for value in (base_ref, head_ref, head_oid)):
        raise ContextError("context is missing immutable Git refs for materialization")
    if worktree.is_symlink() or worktree.exists():
        raise ContextError("frozen worktree path already exists; remove it before retrying")

    configure_deadline(deadline_epoch)
    try:
        run_to_leaf(
            artifact_root,
            diff_name,
            ["git", "--git-dir", str(snapshot_dir), "diff", f"{base_ref}...{head_ref}"],
        )
        run_to_leaf(
            artifact_root,
            files_name,
            [
                "git",
                "--git-dir",
                str(snapshot_dir),
                "diff",
                "--name-only",
                f"{base_ref}...{head_ref}",
            ],
        )
        run_to_leaf(
            artifact_root,
            checks_name,
            ["gh", "pr", "checks", str(pr), "--repo", repo],
            combine_stderr=True,
            allow_failure=True,
        )
        run_text(
            [
                "git",
                "--git-dir",
                str(snapshot_dir),
                "worktree",
                "add",
                "--detach",
                str(worktree),
                head_oid,
            ]
        )
    except Exception as error:
        cleanup_error: str | None = None
        try:
            cleanup_timeout = command_timeout()
        except ContextError:
            cleanup_timeout = None
            cleanup_error = (
                "shared deadline exhausted before partial worktree cleanup; "
                f"inspect {worktree} and {snapshot_dir}"
            )
        if (
            cleanup_timeout is not None
            and worktree.exists()
            and not worktree.is_symlink()
        ):
            try:
                cleanup = subprocess.run(
                    [
                        "git",
                        "--git-dir",
                        str(snapshot_dir),
                        "worktree",
                        "remove",
                        str(worktree),
                    ],
                    check=False,
                    capture_output=True,
                    timeout=cleanup_timeout,
                    env=command_environment(),
                )
                if cleanup.returncode != 0:
                    cleanup_error = (
                        "partial worktree cleanup failed within the shared deadline; "
                        f"inspect {worktree} and {snapshot_dir}"
                    )
            except (OSError, subprocess.TimeoutExpired):
                cleanup_error = (
                    "partial worktree cleanup did not complete within the shared "
                    f"deadline; inspect {worktree} and {snapshot_dir}"
                )
        if cleanup_error is not None:
            raise ContextError(f"{error}; {cleanup_error}") from error
        raise
    finally:
        _capture_deadline = None


def command_materialize(args: argparse.Namespace) -> int:
    materialize_review_artifacts(
        repo=args.repo,
        pr=args.pr,
        context_path=args.context,
        artifact_root_value=args.artifact_root,
        snapshot_dir_value=args.snapshot_dir,
        diff_name=args.diff_name,
        files_name=args.files_name,
        checks_name=args.checks_name,
        worktree=args.worktree,
        deadline_epoch=args.deadline_epoch,
    )
    print(json.dumps({"status": "materialized", "worktree": str(args.worktree)}))
    return 0


def command_compare(args: argparse.Namespace) -> int:
    result = compare_contexts(load_context(args.expected), load_context(args.actual))
    print(json.dumps(result))
    return {"current": 0, "conversation-changed": 10, "code-changed": 20}[result["status"]]


def command_render(args: argparse.Namespace) -> int:
    rendered = render_context(load_context(args.context))
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)
    return 0


def command_same_author(args: argparse.Namespace) -> int:
    review = latest_same_author(load_context(args.context), args.login)
    print(json.dumps(review))
    return 0


# The waiver is keyed to the one positive benign classification, never to a list of
# failure modes: a reason that means "could not classify" is not evidence of safety, and
# a later indeterminate producer inherits the floor without being enumerated here.
REASONS_WAIVING_SECURITY = {"known-non-executable"}
AGENT_CONTRACT_SIGNALS = {
    "missing-coordinate",
    "missing-return-field",
    "agent-persistence-path",
    "missing-read-tools",
    "unverified-path-read",
}


def resolve_security_required(reason: str, triggers: list[str]) -> bool:
    """Pure function of the resolved reason and trigger list.

    An explicit or tier-4 trigger always forces the lens. Otherwise the lens is
    waived only by a positive benign classification; every other reason,
    including a classification that could not be reached, requires it.
    """
    return bool(triggers) or reason not in REASONS_WAIVING_SECURITY


def command_select_security(args: argparse.Namespace) -> int:
    # Decode with replacement rather than strict UTF-8 so a non-UTF-8 hunk never
    # skips classification; only a real read failure fails closed below.
    try:
        changed_files = args.changed_files.read_bytes().decode("utf-8", errors="replace")
        diff = args.diff.read_bytes().decode("utf-8", errors="replace")
        reason = classify_security_change(changed_files, diff)
        read_failed = False
    except OSError:
        reason = "indeterminate"
        read_failed = True
    triggers = []
    if args.explicit_security:
        triggers.append("explicit")
    if args.tier == 4:
        triggers.append("tier-4")
    print(json.dumps({
        "reason": reason,
        "security_required": True if read_failed else resolve_security_required(reason, triggers),
        "triggers": triggers,
    }))
    return 0


def _contained_by(path: Path, roots: tuple[Path, ...]) -> bool:
    return any(path == root or root in path.parents for root in roots)


def _classify_contract_result(role: str, attempt: int, reason: str) -> dict[str, Any]:
    if attempt == 1:
        return {
            "decision": "retry-contract",
            "failure_kind": "agent-contract-invalid",
            "reason": reason,
            "preserve_snapshot": True,
            "operator_decision_required": False,
        }
    if role == "specialist":
        return {
            "decision": "continue-comment",
            "failure_kind": "agent-contract-invalid",
            "reason": reason,
            "lens_outcome": "absent after retry (agent contract)",
            "forced_event": "COMMENT",
            "preserve_snapshot": True,
            "operator_decision_required": False,
        }
    return {
        "decision": "fail-closed",
        "failure_kind": "canonical-draft-unavailable",
        "reason": reason,
        "preserve_snapshot": True,
        "operator_decision_required": False,
    }


def classify_agent_failure(
    *,
    artifact_root: Path,
    worktree: Path,
    required_artifacts: list[Path],
    required_directories: list[Path],
    failed_path: Path | None,
    contract_signal: str,
    reviewed_sha_status: str,
    context_hash_status: str,
    snapshot_status: str,
    freshness_status: str,
    role: str,
    attempt: int,
) -> dict[str, Any]:
    """Classify reviewer failures without converting TH contract defects into operator gates."""
    if attempt not in {1, 2} or role not in {"general", "specialist", "consolidator"}:
        raise ContextError("invalid agent-failure recovery coordinates")
    if contract_signal != "none" and contract_signal not in AGENT_CONTRACT_SIGNALS:
        raise ContextError("unknown agent contract signal")

    for status in (reviewed_sha_status, context_hash_status):
        if status not in {"match", "missing", "mismatch"}:
            raise ContextError("invalid agent identity status")
    if snapshot_status not in {"match", "mismatch"} or freshness_status not in {"current", "failed"}:
        raise ContextError("invalid snapshot recovery status")

    if "mismatch" in {reviewed_sha_status, context_hash_status}:
        return {
            "decision": "fail-closed",
            "failure_kind": "snapshot-identity-failed",
            "reason": "agent returned a different immutable snapshot identity",
            "preserve_snapshot": True,
            "operator_decision_required": False,
        }
    if snapshot_status != "match" or freshness_status != "current":
        return {
            "decision": "fail-closed",
            "failure_kind": "snapshot-integrity-failed",
            "reason": "snapshot bytes or freshness no longer match",
            "preserve_snapshot": True,
            "operator_decision_required": False,
        }

    try:
        artifact_root_resolved, artifact_root_fd = _open_directory(artifact_root)
        os.close(artifact_root_fd)
        worktree_resolved, worktree_fd = _open_directory(worktree)
        os.close(worktree_fd)
    except (ContextError, OSError):
        return {
            "decision": "fail-closed",
            "failure_kind": "required-read-failed",
            "reason": "review artifact root or frozen worktree is unreadable",
            "preserve_snapshot": True,
            "operator_decision_required": False,
        }

    roots = (artifact_root_resolved, worktree_resolved)
    required_resolved: set[Path] = set()
    for artifact in required_artifacts:
        candidate = artifact.resolve(strict=False)
        if not _contained_by(candidate, roots):
            return {
                "decision": "fail-closed",
                "failure_kind": "required-read-failed",
                "reason": "required artifact escapes the supplied review roots",
                "preserve_snapshot": True,
                "operator_decision_required": False,
            }
        try:
            metadata = artifact.lstat()
            if artifact.is_symlink() or not stat.S_ISREG(metadata.st_mode):
                raise OSError("not a regular non-symlink file")
            descriptor = os.open(candidate, os.O_RDONLY | NOFOLLOW)
            try:
                os.read(descriptor, 1)
            finally:
                os.close(descriptor)
        except OSError:
            return {
                "decision": "fail-closed",
                "failure_kind": "required-read-failed",
                "reason": "required supplied artifact is unreadable",
                "preserve_snapshot": True,
                "operator_decision_required": False,
            }
        required_resolved.add(candidate)

    for directory in required_directories:
        candidate = directory.resolve(strict=False)
        if not _contained_by(candidate, roots):
            return {
                "decision": "fail-closed",
                "failure_kind": "required-read-failed",
                "reason": "required directory escapes the supplied review roots",
                "preserve_snapshot": True,
                "operator_decision_required": False,
            }
        try:
            resolved, descriptor = _open_directory(directory)
            os.close(descriptor)
        except (ContextError, OSError):
            return {
                "decision": "fail-closed",
                "failure_kind": "required-read-failed",
                "reason": "required supplied directory is unreadable",
                "preserve_snapshot": True,
                "operator_decision_required": False,
            }
        required_resolved.add(resolved)

    path_scope_mistake = False
    if failed_path is not None:
        candidate = failed_path.resolve(strict=False)
        if candidate in required_resolved or candidate == worktree_resolved:
            return {
                "decision": "fail-closed",
                "failure_kind": "required-read-failed",
                "reason": "required supplied coordinate could not be read",
                "preserve_snapshot": True,
                "operator_decision_required": False,
            }
        if not _contained_by(candidate, (worktree_resolved,)):
            return {
                "decision": "fail-closed",
                "failure_kind": "unclassified-agent-failure",
                "reason": "failed path is outside the supplied review coordinates",
                "preserve_snapshot": True,
                "operator_decision_required": False,
            }
        if candidate.exists() or candidate.is_symlink():
            return {
                "decision": "fail-closed",
                "failure_kind": "required-read-failed",
                "reason": "verified existing worktree path could not be read",
                "preserve_snapshot": True,
                "operator_decision_required": False,
            }
        path_scope_mistake = True

    missing_identity = "missing" in {reviewed_sha_status, context_hash_status}
    if missing_identity or contract_signal != "none" or path_scope_mistake:
        if missing_identity:
            reason = "agent omitted a supplied identity echo"
        elif path_scope_mistake:
            reason = "agent attempted a nonexistent unsupplied and unverified worktree path"
        else:
            reason = f"agent violated contract: {contract_signal}"
        return _classify_contract_result(role, attempt, reason)

    return {
        "decision": "fail-closed",
        "failure_kind": "unclassified-agent-failure",
        "reason": "agent failure did not identify an exact path or contract signal",
        "preserve_snapshot": True,
        "operator_decision_required": False,
    }


def command_classify_agent_failure(args: argparse.Namespace) -> int:
    result = classify_agent_failure(
        artifact_root=args.artifact_root,
        worktree=args.worktree,
        required_artifacts=args.required_artifact,
        required_directories=args.required_directory,
        failed_path=args.failed_path,
        contract_signal=args.contract_signal,
        reviewed_sha_status=args.reviewed_sha_status,
        context_hash_status=args.context_hash_status,
        snapshot_status=args.snapshot_status,
        freshness_status=args.freshness_status,
        role=args.role,
        attempt=args.attempt,
    )
    print(json.dumps(result, sort_keys=True))
    return 0 if result["decision"] != "fail-closed" else 30


def command_ensure_workspaces_ignore(args: argparse.Namespace) -> int:
    ensure_workspaces_ignored(args.repo_root)
    return 0


def refresh_review_context(
    repo_root: Path,
    repo: str,
    pr: int,
    artifact_root: Path,
    owner_token: str,
) -> dict[str, Any]:
    run = validate_owned_review_run(repo_root, artifact_root, owner_token, pr)
    context_path = run / "pr-review-context.json"
    conversation_path = run / "pr-review-conversation.md"
    snapshot = run / "pr-review-snapshot.git"
    safe_read_leaf(run, context_path.name)
    safe_read_leaf(run, conversation_path.name)
    previous = load_context(context_path)
    context_tmp = _temporary_leaf(run, "tmp-pr-review-context-refresh")
    conversation_tmp: Path | None = None
    try:
        current = capture_to_path(
            repo=repo,
            pr=pr,
            output=context_tmp,
            git_dir=repo_root,
            snapshot_dir=snapshot,
            deadline_epoch=time.time() + COMMAND_TIMEOUT_SECONDS,
        )
        comparison = compare_contexts(previous, current)
        if comparison["next_action"] != "restart-technical-review":
            conversation_tmp = _temporary_leaf(
                run, "tmp-pr-review-conversation-refresh"
            )
            _write_existing_leaf(
                conversation_tmp, render_context(current).encode("utf-8")
            )
            promote_artifact(run, context_tmp.name, context_path.name)
            promote_artifact(run, conversation_tmp.name, conversation_path.name)
        return {
            **comparison,
            "status": comparison["status"],
            "technical_hash": current["technical_hash"],
            "conversation_hash": current["conversation_hash"],
            "context_hash": current["context_hash"],
            "promoted": comparison["next_action"] != "restart-technical-review",
            "context": str(context_path),
            "conversation": str(conversation_path),
        }
    finally:
        _discard_artifact_leaf(run, context_tmp.name)
        if conversation_tmp is not None:
            _discard_artifact_leaf(run, conversation_tmp.name)


def command_refresh_context(args: argparse.Namespace) -> int:
    result = refresh_review_context(
        args.repo_root,
        args.repo,
        args.pr,
        args.artifact_root,
        args.owner_token,
    )
    print(json.dumps(result, sort_keys=True))
    return {
        "continue": 0,
        "reconcile-conversation": 10,
        "restart-technical-review": 20,
    }[result["next_action"]]


def prepare_review_run(repo_root: Path, repo: str, pr: int) -> dict[str, Any]:
    ensure_workspaces_ignored(repo_root)
    run = create_review_run(repo_root, pr)
    artifact_root = Path(run["artifact_root"])
    owner_token = run["owner_token"]
    try:
        ignored = subprocess.run(
            ["git", "-C", str(repo_root), "check-ignore", "-q", "--", str(artifact_root)],
            check=False,
            capture_output=True,
            timeout=COMMAND_TIMEOUT_SECONDS,
            env=command_environment(),
        )
        if ignored.returncode != 0:
            raise ContextError("created review run is not ignored by Git")

        deadline = time.time() + COMMAND_TIMEOUT_SECONDS
        snapshot = artifact_root / "pr-review-snapshot.git"
        context_path = artifact_root / "pr-review-context.json"
        conversation_path = artifact_root / "pr-review-conversation.md"
        diff_path = artifact_root / "pr-review-diff.patch"
        files_path = artifact_root / "pr-review-files.txt"
        checks_path = artifact_root / "pr-review-checks.txt"
        worktree = artifact_root / "pr-review-worktree"

        context_tmp = _temporary_leaf(artifact_root, "tmp-pr-review-context")
        conversation_tmp = _temporary_leaf(artifact_root, "tmp-pr-review-conversation")
        context = capture_to_path(
            repo=repo,
            pr=pr,
            output=context_tmp,
            git_dir=repo_root,
            snapshot_dir=snapshot,
            deadline_epoch=deadline,
        )
        _write_existing_leaf(conversation_tmp, render_context(context).encode("utf-8"))
        promote_artifact(artifact_root, context_tmp.name, context_path.name)
        promote_artifact(artifact_root, conversation_tmp.name, conversation_path.name)

        diff_tmp = _temporary_leaf(artifact_root, "tmp-pr-review-diff")
        files_tmp = _temporary_leaf(artifact_root, "tmp-pr-review-files")
        checks_tmp = _temporary_leaf(artifact_root, "tmp-pr-review-checks")
        materialize_review_artifacts(
            repo=repo,
            pr=pr,
            context_path=context_path,
            artifact_root_value=artifact_root,
            snapshot_dir_value=snapshot,
            diff_name=diff_tmp.name,
            files_name=files_tmp.name,
            checks_name=checks_tmp.name,
            worktree=worktree,
            deadline_epoch=deadline,
        )
        promote_artifact(artifact_root, diff_tmp.name, diff_path.name)
        promote_artifact(artifact_root, files_tmp.name, files_path.name)
        promote_artifact(artifact_root, checks_tmp.name, checks_path.name)
        return {
            **run,
            "status": "prepared",
            "head_oid": context["head_oid"],
            "base_oid": context["base_oid"],
            "merge_base_oid": context["merge_base_oid"],
            "technical_hash": context["technical_hash"],
            "conversation_hash": context["conversation_hash"],
            "context_hash": context["context_hash"],
            "context": str(context_path),
            "conversation": str(conversation_path),
            "snapshot": str(snapshot),
            "diff": str(diff_path),
            "files": str(files_path),
            "checks": str(checks_path),
            "worktree": str(worktree),
        }
    except Exception as error:
        try:
            cleanup_review_run(repo_root, artifact_root, owner_token)
        except Exception as cleanup_error:
            raise ContextError(
                f"{error}; owned review-run cleanup incomplete: {cleanup_error}"
            ) from error
        if isinstance(error, ContextError):
            raise
        raise ContextError("cannot prepare the isolated review run") from error


def command_prepare_run(args: argparse.Namespace) -> int:
    print(json.dumps(prepare_review_run(args.repo_root, args.repo, args.pr), sort_keys=True))
    return 0


def command_create_run(args: argparse.Namespace) -> int:
    print(json.dumps(create_review_run(args.repo_root, args.pr), sort_keys=True))
    return 0


def command_resume_run(args: argparse.Namespace) -> int:
    print(json.dumps(find_resumable_review_run(args.repo_root, args.pr), sort_keys=True))
    return 0


def command_cleanup_run(args: argparse.Namespace) -> int:
    cleanup_review_run(args.repo_root, args.artifact_root, args.owner_token)
    print(json.dumps({"status": "cleaned", "artifact_root": str(args.artifact_root)}))
    return 0


def command_promote_artifact(args: argparse.Namespace) -> int:
    promote_artifact(args.artifact_root, args.temporary_name, args.final_name)
    return 0


def command_safe_read(args: argparse.Namespace) -> int:
    sys.stdout.buffer.write(safe_read_leaf(args.artifact_root, args.name, limit=args.max_bytes))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    deadline_parser = subparsers.add_parser("deadline")
    deadline_parser.add_argument(
        "--seconds", type=float, default=float(COMMAND_TIMEOUT_SECONDS)
    )
    deadline_parser.set_defaults(func=command_deadline)

    capture_parser = subparsers.add_parser("capture")
    capture_parser.add_argument("--repo", required=True)
    capture_parser.add_argument("--pr", required=True, type=int)
    capture_parser.add_argument("--output", required=True, type=Path)
    capture_parser.add_argument("--git-dir", default=Path("."), type=Path)
    capture_parser.add_argument("--snapshot-dir", type=Path)
    capture_parser.add_argument("--deadline-epoch", type=float)
    capture_parser.add_argument("--remote", default="origin")
    capture_parser.set_defaults(func=command_capture)

    materialize_parser = subparsers.add_parser("materialize")
    materialize_parser.add_argument("--repo", required=True)
    materialize_parser.add_argument("--pr", required=True, type=int)
    materialize_parser.add_argument("--context", required=True, type=Path)
    materialize_parser.add_argument("--artifact-root", required=True, type=Path)
    materialize_parser.add_argument("--snapshot-dir", required=True, type=Path)
    materialize_parser.add_argument("--diff-name", required=True)
    materialize_parser.add_argument("--files-name", required=True)
    materialize_parser.add_argument("--checks-name", required=True)
    materialize_parser.add_argument("--worktree", required=True, type=Path)
    materialize_parser.add_argument("--deadline-epoch", required=True, type=float)
    materialize_parser.set_defaults(func=command_materialize)

    compare_parser = subparsers.add_parser("compare")
    compare_parser.add_argument("--expected", required=True, type=Path)
    compare_parser.add_argument("--actual", required=True, type=Path)
    compare_parser.set_defaults(func=command_compare)

    refresh_parser = subparsers.add_parser("refresh-context")
    refresh_parser.add_argument("--repo-root", required=True, type=Path)
    refresh_parser.add_argument("--repo", required=True)
    refresh_parser.add_argument("--pr", required=True, type=int)
    refresh_parser.add_argument("--artifact-root", required=True, type=Path)
    refresh_parser.add_argument("--owner-token", required=True)
    refresh_parser.set_defaults(func=command_refresh_context)

    render_parser = subparsers.add_parser("render")
    render_parser.add_argument("--context", required=True, type=Path)
    render_parser.add_argument("--output", type=Path)
    render_parser.set_defaults(func=command_render)

    author_parser = subparsers.add_parser("same-author")
    author_parser.add_argument("--context", required=True, type=Path)
    author_parser.add_argument("--login", required=True)
    author_parser.set_defaults(func=command_same_author)

    security_parser = subparsers.add_parser("select-security")
    security_parser.add_argument("--changed-files", required=True, type=Path)
    security_parser.add_argument("--diff", required=True, type=Path)
    security_parser.add_argument("--explicit-security", action="store_true")
    security_parser.add_argument("--tier", type=int)
    security_parser.set_defaults(func=command_select_security)

    recovery_parser = subparsers.add_parser("classify-agent-failure")
    recovery_parser.add_argument("--artifact-root", required=True, type=Path)
    recovery_parser.add_argument("--worktree", required=True, type=Path)
    recovery_parser.add_argument(
        "--required-artifact", action="append", required=True, type=Path
    )
    recovery_parser.add_argument(
        "--required-directory", action="append", default=[], type=Path
    )
    recovery_parser.add_argument("--failed-path", type=Path)
    recovery_parser.add_argument(
        "--contract-signal",
        choices=["none", *sorted(AGENT_CONTRACT_SIGNALS)],
        default="none",
    )
    recovery_parser.add_argument(
        "--reviewed-sha-status", choices=["match", "missing", "mismatch"], required=True
    )
    recovery_parser.add_argument(
        "--context-hash-status", choices=["match", "missing", "mismatch"], required=True
    )
    recovery_parser.add_argument(
        "--snapshot-status", choices=["match", "mismatch"], required=True
    )
    recovery_parser.add_argument(
        "--freshness-status", choices=["current", "failed"], required=True
    )
    recovery_parser.add_argument(
        "--role", choices=["general", "specialist", "consolidator"], required=True
    )
    recovery_parser.add_argument("--attempt", choices=[1, 2], type=int, required=True)
    recovery_parser.set_defaults(func=command_classify_agent_failure)

    ignore_parser = subparsers.add_parser("ensure-workspaces-ignore")
    ignore_parser.add_argument("--repo-root", required=True, type=Path)
    ignore_parser.set_defaults(func=command_ensure_workspaces_ignore)

    prepare_run_parser = subparsers.add_parser("prepare-run")
    prepare_run_parser.add_argument("--repo-root", required=True, type=Path)
    prepare_run_parser.add_argument("--repo", required=True)
    prepare_run_parser.add_argument("--pr", required=True, type=int)
    prepare_run_parser.set_defaults(func=command_prepare_run)

    create_run_parser = subparsers.add_parser("create-run")
    create_run_parser.add_argument("--repo-root", required=True, type=Path)
    create_run_parser.add_argument("--pr", required=True, type=int)
    create_run_parser.set_defaults(func=command_create_run)

    resume_run_parser = subparsers.add_parser("resume-run")
    resume_run_parser.add_argument("--repo-root", required=True, type=Path)
    resume_run_parser.add_argument("--pr", required=True, type=int)
    resume_run_parser.set_defaults(func=command_resume_run)

    cleanup_run_parser = subparsers.add_parser("cleanup-run")
    cleanup_run_parser.add_argument("--repo-root", required=True, type=Path)
    cleanup_run_parser.add_argument("--artifact-root", required=True, type=Path)
    cleanup_run_parser.add_argument("--owner-token", required=True)
    cleanup_run_parser.set_defaults(func=command_cleanup_run)

    promote_parser = subparsers.add_parser("promote-artifact")
    promote_parser.add_argument("--artifact-root", required=True, type=Path)
    promote_parser.add_argument("--temporary-name", required=True)
    promote_parser.add_argument("--final-name", required=True)
    promote_parser.set_defaults(func=command_promote_artifact)

    read_parser = subparsers.add_parser("safe-read")
    read_parser.add_argument("--artifact-root", required=True, type=Path)
    read_parser.add_argument("--name", required=True)
    read_parser.add_argument("--max-bytes", type=int, default=2_000_000)
    read_parser.set_defaults(func=command_safe_read)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        return args.func(args)
    except ContextError as error:
        print(f"review-context: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
