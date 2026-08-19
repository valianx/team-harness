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


def conversation_identity(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "pr_metadata": {
            "title": (context.get("pr") or {}).get("title"),
            "body": (context.get("pr") or {}).get("body"),
        },
        "issue_comments": [
            comment
            for comment in context.get("issue_comments", [])
            if not is_noise_issue_comment(comment)
        ],
        "review_comments": context.get("review_comments", []),
        "review_threads": context.get("review_threads", []),
        "reviews": context.get("reviews", []),
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


def classify_security_change(changed_files: str, diff: str) -> str:
    paths = [line.strip() for line in changed_files.splitlines() if line.strip()]
    if not paths or not diff.strip():
        return "indeterminate"
    if any("\x00" in value for value in (changed_files, diff)):
        return "indeterminate"

    for raw_path in paths:
        path = Path(raw_path)
        parts = {part.lower() for part in path.parts}
        if parts & SENSITIVE_PATH_PARTS or path.name.lower() in SENSITIVE_FILENAMES:
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
    context["conversation_hash"] = stable_hash(conversation_identity(context))
    context["context_hash"] = stable_hash(
        {
            "code_hash": context["code_hash"],
            "conversation_hash": context["conversation_hash"],
            "commits": context.get("commits", []),
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
        "mergeability_changed": mergeability_changed,
        "changed_fields": changed_fields,
        "expected_head_oid": expected.get("head_oid"),
        "actual_head_oid": actual.get("head_oid"),
        "expected_context_hash": expected.get("context_hash"),
        "actual_context_hash": actual.get("context_hash"),
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


def command_capture(args: argparse.Namespace) -> int:
    global _capture_deadline
    artifact_root, artifact_fd = _open_directory(args.output.parent)
    os.close(artifact_fd)
    requested_snapshot = args.snapshot_dir or artifact_root / "pr-review-snapshot.git"
    snapshot_dir = resolve_snapshot_dir(artifact_root, requested_snapshot)
    configure_deadline(args.deadline_epoch)
    try:
        context = capture(
            args.repo,
            args.pr,
            args.git_dir.resolve(),
            args.remote,
            snapshot_dir,
        )
    finally:
        _capture_deadline = None
    write_json(args.output, context)
    print(
        json.dumps(
            {
                "status": "captured",
                "head_oid": context["head_oid"],
                "base_oid": context["base_oid"],
                "merge_base_oid": context["merge_base_oid"],
                "context_hash": context["context_hash"],
                "mergeability": context.get("mergeability"),
                "output": str(args.output),
            }
        )
    )
    return 0


def command_materialize(args: argparse.Namespace) -> int:
    global _capture_deadline
    artifact_root, artifact_fd = _open_directory(args.artifact_root)
    os.close(artifact_fd)
    snapshot_dir = resolve_snapshot_dir(artifact_root, args.snapshot_dir)
    context = load_context(args.context)
    git_refs = context.get("git_refs") or {}
    base_ref = git_refs.get("base")
    head_ref = git_refs.get("head")
    head_oid = context.get("head_oid")
    if not all(isinstance(value, str) and value for value in (base_ref, head_ref, head_oid)):
        raise ContextError("context is missing immutable Git refs for materialization")
    if args.worktree.is_symlink() or args.worktree.exists():
        raise ContextError("frozen worktree path already exists; remove it before retrying")

    configure_deadline(args.deadline_epoch)
    try:
        run_to_leaf(
            artifact_root,
            args.diff_name,
            ["git", "--git-dir", str(snapshot_dir), "diff", f"{base_ref}...{head_ref}"],
        )
        run_to_leaf(
            artifact_root,
            args.files_name,
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
            args.checks_name,
            ["gh", "pr", "checks", str(args.pr), "--repo", args.repo],
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
                str(args.worktree),
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
                f"inspect {args.worktree} and {snapshot_dir}"
            )
        if (
            cleanup_timeout is not None
            and args.worktree.exists()
            and not args.worktree.is_symlink()
        ):
            try:
                cleanup = subprocess.run(
                    [
                        "git",
                        "--git-dir",
                        str(snapshot_dir),
                        "worktree",
                        "remove",
                        str(args.worktree),
                    ],
                    check=False,
                    capture_output=True,
                    timeout=cleanup_timeout,
                    env=command_environment(),
                )
                if cleanup.returncode != 0:
                    cleanup_error = (
                        "partial worktree cleanup failed within the shared deadline; "
                        f"inspect {args.worktree} and {snapshot_dir}"
                    )
            except (OSError, subprocess.TimeoutExpired):
                cleanup_error = (
                    "partial worktree cleanup did not complete within the shared "
                    f"deadline; inspect {args.worktree} and {snapshot_dir}"
                )
        if cleanup_error is not None:
            raise ContextError(f"{error}; {cleanup_error}") from error
        raise
    finally:
        _capture_deadline = None
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


REASONS_REQUIRING_SECURITY = {"known-sensitive", "unmatched-executable"}


def resolve_security_required(reason: str, triggers: list[str]) -> bool:
    """Pure function of the resolved reason and trigger list.

    An explicit or tier-4 trigger always forces the lens; otherwise only a
    known-sensitive or unmatched-executable reason does. `indeterminate` no
    longer defaults to required.
    """
    return bool(triggers) or reason in REASONS_REQUIRING_SECURITY


def command_select_security(args: argparse.Namespace) -> int:
    try:
        changed_files = args.changed_files.read_text(encoding="utf-8")
        diff = args.diff.read_text(encoding="utf-8")
        reason = classify_security_change(changed_files, diff)
    except (OSError, UnicodeError):
        reason = "indeterminate"
    triggers = []
    if args.explicit_security:
        triggers.append("explicit")
    if args.tier == 4:
        triggers.append("tier-4")
    print(json.dumps({
        "reason": reason,
        "security_required": resolve_security_required(reason, triggers),
        "triggers": triggers,
    }))
    return 0


def command_ensure_workspaces_ignore(args: argparse.Namespace) -> int:
    ensure_workspaces_ignored(args.repo_root)
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

    ignore_parser = subparsers.add_parser("ensure-workspaces-ignore")
    ignore_parser.add_argument("--repo-root", required=True, type=Path)
    ignore_parser.set_defaults(func=command_ensure_workspaces_ignore)

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
