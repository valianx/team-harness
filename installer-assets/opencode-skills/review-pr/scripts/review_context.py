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
import tempfile
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


def promote_artifact_pair(
    artifact_root: Path,
    first_temporary_name: str,
    first_final_name: str,
    second_temporary_name: str,
    second_final_name: str,
) -> None:
    names = [
        _safe_leaf(first_temporary_name),
        _safe_leaf(first_final_name),
        _safe_leaf(second_temporary_name),
        _safe_leaf(second_final_name),
    ]
    if len(set(names)) != len(names):
        raise ContextError("artifact pair names must be distinct")

    previous = [
        safe_read_leaf(artifact_root, first_final_name),
        safe_read_leaf(artifact_root, second_final_name),
    ]
    rollback: list[Path] = []
    try:
        rollback.append(
            _temporary_leaf(artifact_root, "tmp-artifact-pair-rollback-first")
        )
        rollback.append(
            _temporary_leaf(artifact_root, "tmp-artifact-pair-rollback-second")
        )
        _write_existing_leaf(rollback[0], previous[0])
        _write_existing_leaf(rollback[1], previous[1])
        try:
            promote_artifact(artifact_root, first_temporary_name, first_final_name)
            promote_artifact(artifact_root, second_temporary_name, second_final_name)
        except Exception as promotion_error:
            rollback_errors: list[Exception] = []
            for temporary, final in zip(
                rollback, (first_final_name, second_final_name), strict=True
            ):
                try:
                    promote_artifact(artifact_root, temporary.name, final)
                except Exception as rollback_error:
                    rollback_errors.append(rollback_error)
            if rollback_errors:
                raise ContextError("artifact pair promotion and rollback failed") from promotion_error
            raise
    finally:
        for temporary in rollback:
            _discard_artifact_leaf(artifact_root, temporary.name)


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
    conversation_changed = semantic_conversation_changed or review_state_changed
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


VERIFICATION_MODES = ("blocking-only", "all", "off")
DEFAULT_MAX_SUGGESTIONS = 5
POLICY_YAML_BLOCK_RE = re.compile(r"```ya?ml[ \t]*\n(.*?)\n```", re.DOTALL)
POLICY_KEY_RE = re.compile(r"^\s*(verification|max_suggestions)\s*:\s*([^#\n]*?)\s*(?:#.*)?$")
BLOCKING_PREFIX_RE = re.compile(r"^\s*\*\*Blocking:\s*", re.IGNORECASE)
SUGGESTION_PREFIX_RE = re.compile(r"^\s*\*\*Suggestion:\s*", re.IGNORECASE)
MAX_SUGGESTIONS_RE = re.compile(r"^[0-9]+$")
REVIEW_AGENT_NAMES = (
    "reviewer",
    "pr-review-qa",
    "pr-review-security",
    "pr-review-verifier",
    "reviewer-consolidator",
)


def read_review_policy(policy_path: Path | None) -> dict[str, Any]:
    """Read the verification bar and suggestion cap from the optional review policy."""
    policy = {
        "verification": "blocking-only",
        "max_suggestions": DEFAULT_MAX_SUGGESTIONS,
        "source": "default",
    }
    if policy_path is None:
        return policy
    try:
        text = policy_path.read_text(encoding="utf-8")
    except OSError as error:
        raise ContextError(f"review policy could not be read: {policy_path}") from error
    for block in POLICY_YAML_BLOCK_RE.finditer(text):
        for line in block.group(1).splitlines():
            match = POLICY_KEY_RE.match(line)
            if not match:
                continue
            key, value = match.group(1), match.group(2).strip().strip("'\"")
            if key == "verification":
                if value not in VERIFICATION_MODES:
                    raise ContextError(f"review policy verification must be one of {', '.join(VERIFICATION_MODES)}")
                policy["verification"] = value
            else:
                if not MAX_SUGGESTIONS_RE.fullmatch(value):
                    raise ContextError("review policy max_suggestions must be a non-negative integer")
                policy["max_suggestions"] = int(value)
            policy["source"] = "policy"
    return policy


def read_base_review_policy(snapshot_git: Path, base_oid: str) -> dict[str, Any]:
    """Read the policy from the base commit so the reviewed PR cannot set its own bar."""
    if not re.fullmatch(r"[0-9a-f]{40}", base_oid):
        raise ContextError("base oid must be a full commit SHA")
    completed = subprocess.run(
        ["git", "--git-dir", str(snapshot_git), "cat-file", "-e", f"{base_oid}:.team-harness/review-policy.md"],
        capture_output=True, text=True, timeout=COMMAND_TIMEOUT_SECONDS,
    )
    if completed.returncode != 0:
        return read_review_policy(None)
    shown = subprocess.run(
        ["git", "--git-dir", str(snapshot_git), "show", f"{base_oid}:.team-harness/review-policy.md"],
        capture_output=True, text=True, timeout=COMMAND_TIMEOUT_SECONDS,
    )
    if shown.returncode != 0:
        raise ContextError("review policy could not be read from the base commit")
    with tempfile.TemporaryDirectory() as directory:
        policy_path = Path(directory) / "review-policy.md"
        policy_path.write_text(shown.stdout, encoding="utf-8")
        policy = read_review_policy(policy_path)
    policy["source"] = "base-commit" if policy["source"] == "policy" else policy["source"]
    return policy


def command_policy(args: argparse.Namespace) -> int:
    if args.snapshot_git is not None or args.base_oid is not None:
        if args.snapshot_git is None or args.base_oid is None:
            raise ContextError("policy needs both --snapshot-git and --base-oid")
        print(json.dumps(read_base_review_policy(args.snapshot_git, args.base_oid), sort_keys=True))
        return 0
    policy_path = None if args.policy in (None, "none") else Path(args.policy)
    print(json.dumps(read_review_policy(policy_path), sort_keys=True))
    return 0


def _finding_key(finding: dict[str, Any]) -> tuple[str, int, str]:
    try:
        return (str(finding["path"]), int(finding["line"]), str(finding["side"]))
    except (KeyError, TypeError, ValueError) as error:
        raise ContextError("inline finding lacks a complete path/line/side anchor") from error


def _is_blocking(finding: dict[str, Any]) -> bool:
    """Anything not explicitly labelled a Suggestion is verified as blocking."""
    return not SUGGESTION_PREFIX_RE.match(str(finding.get("body", "")))


def _demote_body(body: str) -> str:
    if BLOCKING_PREFIX_RE.match(body):
        return BLOCKING_PREFIX_RE.sub("**Suggestion: (unverified) ", body, count=1)
    if SUGGESTION_PREFIX_RE.match(body):
        return SUGGESTION_PREFIX_RE.sub("**Suggestion: (unverified) ", body, count=1)
    return f"**Suggestion: (unverified)** {body.lstrip()}"


def apply_verification(
    inline: list[dict[str, Any]],
    verifier: dict[str, Any] | None,
    mode: str,
) -> dict[str, Any]:
    """Apply the verifier's statuses to the inline findings.

    Unconfirmed findings are demoted to `(unverified)` suggestions, refuted findings are
    dropped into the ledger, and confirmed findings pass unchanged. Verification never adds a
    finding. An absent verifier leaves the findings untouched and forces `COMMENT`.
    """
    if mode not in VERIFICATION_MODES:
        raise ContextError("unknown verification mode")
    if not isinstance(inline, list) or not all(isinstance(item, dict) for item in inline):
        raise ContextError("inline findings must be a JSON array of objects")
    if mode == "off":
        return {
            "inline": inline,
            "ledger": [],
            "coverage": "verification off (policy)",
            "forced_event": None,
            "confirmed": 0,
            "selected": 0,
        }
    selected = [finding for finding in inline if mode == "all" or _is_blocking(finding)]
    if verifier is None:
        return {
            "inline": inline,
            "ledger": [],
            "coverage": f"verified 0/{len(selected)} (verifier absent)",
            "forced_event": "COMMENT",
            "confirmed": 0,
            "selected": len(selected),
        }
    statuses: dict[tuple[str, int, str], dict[str, Any]] = {}
    for result in verifier.get("findings") or []:
        if not isinstance(result, dict):
            raise ContextError("verifier finding must be an object")
        if result.get("status") not in {"confirmed", "unconfirmed", "refuted"}:
            raise ContextError("verifier status must be confirmed, unconfirmed, or refuted")
        key = _finding_key(result)
        if key in statuses:
            raise ContextError(f"verifier returned two statuses for {key[0]}:{key[1]} {key[2]}")
        statuses[key] = result
    output: list[dict[str, Any]] = []
    ledger: list[dict[str, Any]] = []
    confirmed = 0
    for finding in inline:
        if finding not in selected:
            output.append(finding)
            continue
        result = statuses.get(_finding_key(finding))
        status = result["status"] if result else "unconfirmed"
        reason = str((result or {}).get("evidence") or (result or {}).get("reason") or "no verifier result")
        claim = str(finding.get("body", "")).splitlines()[0].strip("* ")
        if status == "confirmed":
            confirmed += 1
            output.append(finding)
        elif status == "refuted":
            ledger.append({"source": "verifier", "finding": claim, "disposition": "dropped", "reason": f"verifier — {reason}"})
        else:
            output.append({**finding, "body": _demote_body(str(finding.get("body", "")))})
            ledger.append({"source": "verifier", "finding": claim, "disposition": "demoted", "reason": f"verifier — {reason}"})
    return {
        "inline": output,
        "ledger": ledger,
        "coverage": f"verified {confirmed}/{len(selected)}",
        "forced_event": None,
        "confirmed": confirmed,
        "selected": len(selected),
    }


def write_artifact_leaf(root: Path, name: str, content: bytes) -> None:
    """Write one artifact leaf through an exclusive temporary and atomic promotion."""
    name = _safe_leaf(name)
    temporary = f"tmp-{secrets.token_hex(8)}-{name}"
    _, directory_fd = _open_directory(root)
    try:
        leaf_fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | NOFOLLOW, 0o644, dir_fd=directory_fd)
        try:
            view = memoryview(content)
            while view:
                view = view[os.write(leaf_fd, view):]
            os.fsync(leaf_fd)
        finally:
            os.close(leaf_fd)
    finally:
        os.close(directory_fd)
    promote_artifact(root, temporary, name)


def command_apply_verification(args: argparse.Namespace) -> int:
    inline = json.loads(safe_read_leaf(args.artifact_root, args.inline_name))
    verifier = None
    if args.verifier_name not in (None, "none"):
        verifier = json.loads(safe_read_leaf(args.artifact_root, args.verifier_name))
    result = apply_verification(inline, verifier, args.verification)
    if args.output_name:
        write_artifact_leaf(args.artifact_root, args.output_name, json.dumps(result["inline"], indent=2).encode("utf-8") + b"\n")
    print(json.dumps(result, sort_keys=True))
    return 0


def format_lenses_line(lenses: list[str], verification: str | None) -> str:
    """Compose the coordinator-owned coverage line."""
    entries = [entry.strip() for entry in lenses if entry and entry.strip()]
    if not entries:
        raise ContextError("at least one lens outcome is required")
    if verification:
        entries.append(verification.strip())
    return "Lenses: " + ", ".join(entries)


def command_lenses_line(args: argparse.Namespace) -> int:
    print(format_lenses_line(args.lens, args.verification))
    return 0


def _codex_agent_set_status(agents_dir: Path) -> dict[str, Any]:
    missing: list[str] = []
    invalid: list[str] = []
    for name in REVIEW_AGENT_NAMES:
        toml_path = agents_dir / f"{name}.toml"
        if toml_path.is_symlink() or not toml_path.is_file():
            missing.append(name)
            continue
        text = toml_path.read_text(encoding="utf-8", errors="replace")
        markers = (
            f'name = "{name}"',
            'sandbox_mode = "read-only"',
            f"# Semantic source: agents/{name}.md",
            f"# Instruction source: runtime/codex/instructions/{name}.md",
            "# Projection tier:",
        )
        if not all(marker in text for marker in markers):
            invalid.append(name)
    if not missing and not invalid:
        status = "complete"
    elif len(missing) == len(REVIEW_AGENT_NAMES):
        status = "missing"
    else:
        status = "mixed"
    return {"status": status, "missing": missing, "invalid": invalid, "agents_dir": str(agents_dir)}


def preflight(repo_root: Path, runtime: str, agents_dir: Path | None) -> dict[str, Any]:
    """Check the review prerequisites once and report every blocker."""
    blockers: list[str] = []
    try:
        completed = subprocess.run(["gh", "auth", "status"], capture_output=True, text=True, timeout=COMMAND_TIMEOUT_SECONDS)
        gh_status = "authenticated" if completed.returncode == 0 else "unauthenticated"
    except (OSError, subprocess.TimeoutExpired):
        gh_status = "unavailable"
    if gh_status != "authenticated":
        blockers.append(f"gh {gh_status}")
    gitignore = repo_root / ".gitignore"
    ignored_before = gitignore.is_file() and any(
        line.strip() in {"/workspaces", "/workspaces/"} for line in gitignore.read_text(encoding="utf-8", errors="replace").splitlines()
    )
    ensure_workspaces_ignored(repo_root)
    codex_agents: dict[str, Any] | None = None
    if runtime == "codex":
        codex_agents = _codex_agent_set_status(agents_dir or repo_root / ".codex" / "agents")
        if codex_agents["status"] != "complete":
            blockers.append(f"codex review agents {codex_agents['status']}")
    return {
        "ok": not blockers,
        "gh": gh_status,
        "workspaces_ignore": "present" if ignored_before else "added",
        "codex_agents": codex_agents,
        "review_agents": list(REVIEW_AGENT_NAMES),
        "blockers": blockers,
    }


def command_preflight(args: argparse.Namespace) -> int:
    result = preflight(args.repo_root, args.runtime, args.agents_dir)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["ok"] else 30


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
            promote_artifact_pair(
                run,
                conversation_tmp.name,
                conversation_path.name,
                context_tmp.name,
                context_path.name,
            )
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

    policy_parser = subparsers.add_parser("policy")
    policy_parser.add_argument("--policy", default="none")
    policy_parser.add_argument("--snapshot-git", type=Path)
    policy_parser.add_argument("--base-oid")
    policy_parser.set_defaults(func=command_policy)

    verification_parser = subparsers.add_parser("apply-verification")
    verification_parser.add_argument("--artifact-root", required=True, type=Path)
    verification_parser.add_argument("--inline-name", required=True)
    verification_parser.add_argument("--verifier-name", default="none")
    verification_parser.add_argument("--verification", choices=list(VERIFICATION_MODES), required=True)
    verification_parser.add_argument("--output-name")
    verification_parser.set_defaults(func=command_apply_verification)

    lenses_parser = subparsers.add_parser("lenses-line")
    lenses_parser.add_argument("--lens", action="append", required=True)
    lenses_parser.add_argument("--verification")
    lenses_parser.set_defaults(func=command_lenses_line)

    preflight_parser = subparsers.add_parser("preflight")
    preflight_parser.add_argument("--repo-root", required=True, type=Path)
    preflight_parser.add_argument("--runtime", choices=["claude", "codex", "opencode"], required=True)
    preflight_parser.add_argument("--agents-dir", type=Path)
    preflight_parser.set_defaults(func=command_preflight)

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
