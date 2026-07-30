#!/usr/bin/env python3
"""Capture and compare an immutable GitHub pull-request review context."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterable


SCHEMA_VERSION = 1
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


def run_json(command: list[str], *, cwd: Path | None = None) -> Any:
    result = subprocess.run(
        command,
        cwd=cwd,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown error"
        raise ContextError(f"{' '.join(command[:3])} failed: {detail}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise ContextError(f"{' '.join(command[:3])} returned invalid JSON") from error


def run_text(command: list[str], *, cwd: Path | None = None) -> str:
    result = subprocess.run(
        command,
        cwd=cwd,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown error"
        raise ContextError(f"{' '.join(command[:3])} failed: {detail}")
    return result.stdout.strip()


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
    git_dir: Path,
    remote: str,
    number: int,
    base_oid: str,
    head_oid: str,
) -> dict[str, str]:
    prefix = f"refs/team-harness/review-pr/{number}"
    base_ref = f"{prefix}/base"
    head_ref = f"{prefix}/head"
    run_text(
        [
            "git",
            "fetch",
            "--no-tags",
            "--force",
            remote,
            f"+{base_oid}:{base_ref}",
            f"+refs/pull/{number}/head:{head_ref}",
        ],
        cwd=git_dir,
    )
    fetched_base = run_text(["git", "rev-parse", base_ref], cwd=git_dir)
    fetched_head = run_text(["git", "rev-parse", head_ref], cwd=git_dir)
    if fetched_base != base_oid or fetched_head != head_oid:
        raise ContextError(
            "PR changed while context was captured; retry before reviewing "
            f"(expected {base_oid[:12]}..{head_oid[:12]}, "
            f"fetched {fetched_base[:12]}..{fetched_head[:12]})"
        )
    merge_base = run_text(["git", "merge-base", base_ref, head_ref], cwd=git_dir)
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
                "headRefOid,isCrossRepository,additions,deletions,changedFiles,url,files"
            ),
        ]
    )


def capture(repo: str, number: int, git_dir: Path, remote: str) -> dict[str, Any]:
    metadata = capture_metadata(repo, number)
    base_oid = metadata.get("baseRefOid")
    head_oid = metadata.get("headRefOid")
    if not base_oid or not head_oid:
        raise ContextError("GitHub did not return baseRefOid and headRefOid")

    refs = git_snapshot(git_dir, remote, number, base_oid, head_oid)
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
        "commits": capture_commits(repo, number),
        "issue_comments": capture_issue_comments(repo, number),
        "review_comments": capture_review_comments(repo, number),
        "review_threads": capture_threads(repo, number),
        "reviews": capture_reviews(repo, number),
    }
    final_metadata = capture_metadata(repo, number)
    for field in ("baseRefOid", "headRefOid", "title", "body"):
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
    code_changed = expected.get("code_hash") != actual.get("code_hash")
    conversation_changed = (
        expected.get("conversation_hash") != actual.get("conversation_hash")
    )
    commits_changed = expected.get("commits") != actual.get("commits")
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
    lines = [
        f"Reviewed snapshot: `{context['head_oid']}`",
        f"Base snapshot: `{context['base_oid']}`",
        f"Merge base: `{context['merge_base_oid']}`",
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


def command_capture(args: argparse.Namespace) -> int:
    context = capture(args.repo, args.pr, args.git_dir.resolve(), args.remote)
    write_json(args.output, context)
    print(
        json.dumps(
            {
                "status": "captured",
                "head_oid": context["head_oid"],
                "base_oid": context["base_oid"],
                "merge_base_oid": context["merge_base_oid"],
                "context_hash": context["context_hash"],
                "output": str(args.output),
            }
        )
    )
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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    capture_parser = subparsers.add_parser("capture")
    capture_parser.add_argument("--repo", required=True)
    capture_parser.add_argument("--pr", required=True, type=int)
    capture_parser.add_argument("--output", required=True, type=Path)
    capture_parser.add_argument("--git-dir", default=Path("."), type=Path)
    capture_parser.add_argument("--remote", default="origin")
    capture_parser.set_defaults(func=command_capture)

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
