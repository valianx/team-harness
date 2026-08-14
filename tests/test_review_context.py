#!/usr/bin/env python3
"""Behavioral tests for the executable review-context helper."""

from __future__ import annotations

import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "review-pr" / "scripts" / "review_context.py"
SPEC = importlib.util.spec_from_file_location("review_context", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def context(**overrides):
    value = {
        "schema_version": MODULE.SCHEMA_VERSION,
        "base_oid": "base",
        "head_oid": "head",
        "merge_base_oid": "merge",
        "pr": {"title": "Title", "body": "Body"},
        "commits": [{"oid": "head", "subject": "fix: current"}],
        "issue_comments": [],
        "review_comments": [],
        "review_threads": [],
        "reviews": [],
    }
    value.update(overrides)
    MODULE.finalize_hashes(value)
    return value


class ReviewContextTests(unittest.TestCase):
    def test_snapshot_repo_avoids_writes_to_read_only_source_git_dir(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            remote = root / "remote.git"
            source = root / "source"
            snapshot = root / "artifacts" / "pr-review-snapshot.git"
            worktree = root / "review-worktree"
            snapshot.parent.mkdir()

            def git(*args, cwd=None):
                return subprocess.run(
                    ["git", *args],
                    cwd=cwd,
                    check=True,
                    capture_output=True,
                    text=True,
                ).stdout.strip()

            git("init", "--bare", "--quiet", str(remote))
            git("init", "--quiet", "-b", "main", str(source))
            git("config", "user.name", "Review Test", cwd=source)
            git("config", "user.email", "review@example.test", cwd=source)
            (source / "file.txt").write_text("base\n", encoding="utf-8")
            git("add", "file.txt", cwd=source)
            git("commit", "--quiet", "-m", "base", cwd=source)
            base_oid = git("rev-parse", "HEAD", cwd=source)
            git("remote", "add", "origin", str(remote), cwd=source)
            git("push", "--quiet", "origin", "HEAD:refs/heads/main", cwd=source)

            (source / "file.txt").write_text("head\n", encoding="utf-8")
            git("commit", "--quiet", "-am", "head", cwd=source)
            head_oid = git("rev-parse", "HEAD", cwd=source)
            git("push", "--quiet", "origin", "HEAD:refs/pull/1/head", cwd=source)

            source_git = source / ".git"
            original_mode = source_git.stat().st_mode & 0o777
            os.chmod(source_git, 0o555)
            try:
                refs = MODULE.git_snapshot(
                    source,
                    snapshot,
                    "origin",
                    1,
                    base_oid,
                    head_oid,
                )
                self.assertFalse((source_git / "FETCH_HEAD").exists())
                self.assertFalse(
                    (source_git / "refs" / "team-harness" / "review-pr" / "1").exists()
                )
            finally:
                os.chmod(source_git, original_mode)

            self.assertEqual(refs["merge_base_oid"], base_oid)
            self.assertEqual(
                git("--git-dir", str(snapshot), "rev-parse", refs["head_ref"]),
                head_oid,
            )
            git(
                "--git-dir",
                str(snapshot),
                "worktree",
                "add",
                "--quiet",
                "--detach",
                str(worktree),
                head_oid,
            )
            self.assertEqual(git("rev-parse", "HEAD", cwd=worktree), head_oid)

    def test_external_commands_are_noninteractive_and_bounded(self):
        with patch.object(
            MODULE.subprocess,
            "run",
            side_effect=subprocess.TimeoutExpired(["git", "fetch"], 60),
        ) as mocked:
            with self.assertRaisesRegex(MODULE.ContextError, "60s capture limit"):
                MODULE.run_text(["git", "fetch", "origin"])
        kwargs = mocked.call_args.kwargs
        self.assertEqual(kwargs["timeout"], 60)
        self.assertEqual(kwargs["env"]["GIT_TERMINAL_PROMPT"], "0")
        self.assertEqual(kwargs["env"]["GH_PROMPT_DISABLED"], "1")

        MODULE._capture_deadline = 105.0
        try:
            with patch.object(MODULE.time, "monotonic", return_value=100.0):
                self.assertEqual(MODULE.command_timeout(), 5.0)
            with patch.object(MODULE.time, "monotonic", return_value=106.0):
                with self.assertRaisesRegex(MODULE.ContextError, "60s capture limit"):
                    MODULE.command_timeout()
        finally:
            MODULE._capture_deadline = None

    def test_workspace_ignore_update_is_atomic_and_rejects_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ignore = root / ".gitignore"
            ignore.write_text("/build/\n", encoding="utf-8")
            MODULE.ensure_workspaces_ignored(root)
            self.assertEqual(ignore.read_text(encoding="utf-8"), "/build/\n/workspaces/\n")
            MODULE.ensure_workspaces_ignored(root)
            self.assertEqual(ignore.read_text(encoding="utf-8").count("/workspaces/"), 1)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            outside = root / "outside"
            outside.write_text("keep", encoding="utf-8")
            (root / ".gitignore").symlink_to(outside)
            with self.assertRaises(MODULE.ContextError):
                MODULE.ensure_workspaces_ignored(root)
            self.assertEqual(outside.read_text(encoding="utf-8"), "keep")

    def test_artifact_promotion_and_read_reject_symlink_leaves(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            temporary = root / "tmp-body"
            temporary.write_text("safe", encoding="utf-8")
            MODULE.promote_artifact(root, "tmp-body", "review.md")
            self.assertEqual(MODULE.safe_read_leaf(root, "review.md"), b"safe")

            outside = root / "outside"
            outside.write_text("secret", encoding="utf-8")
            link = root / "inline.json"
            link.symlink_to(outside)
            with self.assertRaises(MODULE.ContextError):
                MODULE.safe_read_leaf(root, "inline.json")

            replacement = root / "tmp-inline"
            replacement.write_text("[]", encoding="utf-8")
            with self.assertRaises(MODULE.ContextError):
                MODULE.promote_artifact(root, "tmp-inline", "inline.json")
            self.assertEqual(outside.read_text(encoding="utf-8"), "secret")

    def test_artifact_promotion_rejects_temporary_inode_swap(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            temporary = root / "tmp-body"
            temporary.write_text("safe", encoding="utf-8")
            actual = temporary.stat()
            calls = 0
            original = MODULE._regular_stat_at

            def swapped(directory_fd, name):
                nonlocal calls
                calls += 1
                if calls == 2:
                    return SimpleNamespace(
                        st_mode=actual.st_mode,
                        st_dev=actual.st_dev,
                        st_ino=actual.st_ino + 1,
                    )
                return original(directory_fd, name)

            with patch.object(MODULE, "_regular_stat_at", side_effect=swapped):
                with self.assertRaisesRegex(MODULE.ContextError, "changed during promotion"):
                    MODULE.promote_artifact(root, "tmp-body", "review.md")
            self.assertFalse((root / "review.md").exists())
            self.assertEqual(temporary.read_text(encoding="utf-8"), "safe")

    def test_artifact_promotion_uses_pinned_inode_when_source_name_swaps(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            temporary = root / "tmp-body"
            temporary.write_text("safe", encoding="utf-8")
            outside = root / "outside"
            outside.write_text("secret", encoding="utf-8")
            real_replace = MODULE.os.replace

            def swap_then_replace(source, destination, **kwargs):
                temporary.unlink()
                temporary.symlink_to(outside)
                return real_replace(source, destination, **kwargs)

            with patch.object(MODULE.os, "replace", side_effect=swap_then_replace):
                MODULE.promote_artifact(root, "tmp-body", "review.md")

            self.assertEqual((root / "review.md").read_text(encoding="utf-8"), "safe")
            self.assertTrue(temporary.is_symlink())
            self.assertEqual(outside.read_text(encoding="utf-8"), "secret")

    def test_artifact_promotion_links_portably_without_procfs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "tmp-body").write_text("safe", encoding="utf-8")
            real_link = MODULE.os.link

            def portable_link(source, destination, **kwargs):
                self.assertEqual(source, "tmp-body")
                self.assertFalse(kwargs["follow_symlinks"])
                self.assertEqual(kwargs["src_dir_fd"], kwargs["dst_dir_fd"])
                return real_link(source, destination, **kwargs)

            with patch.object(MODULE.os, "link", side_effect=portable_link):
                MODULE.promote_artifact(root, "tmp-body", "review.md")

            self.assertEqual((root / "review.md").read_text(encoding="utf-8"), "safe")

    def test_security_selection_is_fail_closed_for_every_reason(self):
        cases = [
            ("agents/security.md\n", "+permission boundary\n", "known-sensitive", True),
            ("docs/guide.md\n", "+clarify review behavior\n", "known-non-executable", False),
            ("src/plugin.future\n", "+run new handler\n", "unmatched-executable", True),
            ("", "", "indeterminate", True),
        ]
        for changed_files, diff, reason, required in cases:
            with self.subTest(reason=reason):
                self.assertEqual(
                    MODULE.classify_security_change(changed_files, diff),
                    reason,
                )
                with tempfile.TemporaryDirectory() as directory:
                    root = Path(directory)
                    changed_path = root / "changed-files.txt"
                    diff_path = root / "review.diff"
                    changed_path.write_text(changed_files, encoding="utf-8")
                    diff_path.write_text(diff, encoding="utf-8")
                    output = io.StringIO()
                    with redirect_stdout(output):
                        MODULE.command_select_security(
                            SimpleNamespace(
                                changed_files=changed_path,
                                diff=diff_path,
                                explicit_security=False,
                                tier=None,
                            )
                        )
                    result = json.loads(output.getvalue())
                self.assertEqual(result["reason"], reason)
                self.assertEqual(result["security_required"], required)

    def test_explicit_and_tier_four_selection_require_security(self):
        for explicit_security, tier, trigger in (
            (True, None, "explicit"),
            (False, 4, "tier-4"),
        ):
            with self.subTest(trigger=trigger), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                changed_path = root / "changed-files.txt"
                diff_path = root / "review.diff"
                changed_path.write_text("docs/guide.md\n", encoding="utf-8")
                diff_path.write_text("+clarify review behavior\n", encoding="utf-8")
                output = io.StringIO()
                with redirect_stdout(output):
                    MODULE.command_select_security(
                        SimpleNamespace(
                            changed_files=changed_path,
                            diff=diff_path,
                            explicit_security=explicit_security,
                            tier=tier,
                        )
                    )
                result = json.loads(output.getvalue())
                self.assertEqual(result["reason"], "known-non-executable")
                self.assertTrue(result["security_required"])
                self.assertEqual(result["triggers"], [trigger])

    def test_capture_binds_mergeability_and_rejects_mid_capture_drift(self):
        metadata = {
            "number": 1,
            "title": "Title",
            "body": "Body",
            "author": {"login": "alice"},
            "baseRefOid": "base",
            "headRefOid": "head",
            "mergeable": "MERGEABLE",
            "mergeStateStatus": "CLEAN",
        }
        refs = {
            "base_ref": "refs/review/base",
            "head_ref": "refs/review/head",
            "merge_base_oid": "merge",
        }

        with (
            patch.object(MODULE, "git_snapshot", return_value=refs),
            patch.object(MODULE, "capture_commits", return_value=[]),
            patch.object(MODULE, "capture_issue_comments", return_value=[]),
            patch.object(MODULE, "capture_review_comments", return_value=[]),
            patch.object(MODULE, "capture_threads", return_value=[]),
            patch.object(MODULE, "capture_reviews", return_value=[]),
        ):
            with patch.object(MODULE, "capture_metadata", side_effect=[metadata, metadata]):
                captured = MODULE.capture(
                    "owner/repo", 1, ROOT, "origin", ROOT / "snapshot.git"
                )

            self.assertEqual(
                captured["mergeability"],
                {
                    "status": "clean",
                    "mergeable": "MERGEABLE",
                    "merge_state_status": "CLEAN",
                },
            )
            self.assertIn("context_hash", captured)

            changed = {**metadata, "mergeStateStatus": "DIRTY"}
            with patch.object(
                MODULE,
                "capture_metadata",
                side_effect=[metadata, changed],
            ):
                with self.assertRaisesRegex(MODULE.ContextError, "mergeStateStatus changed"):
                    MODULE.capture(
                        "owner/repo", 1, ROOT, "origin", ROOT / "snapshot.git"
                    )

    def test_mergeability_classification_is_fail_closed(self):
        self.assertEqual(MODULE.classify_mergeability("CONFLICTING", "CLEAN"), "conflicting")
        self.assertEqual(MODULE.classify_mergeability("MERGEABLE", "DIRTY"), "conflicting")
        self.assertEqual(MODULE.classify_mergeability("MERGEABLE", "CLEAN"), "clean")
        self.assertEqual(MODULE.classify_mergeability("UNKNOWN", "UNKNOWN"), "indeterminate")
        self.assertEqual(MODULE.classify_mergeability(None, None), "indeterminate")

    def test_mergeability_changes_hash_freshness_and_rendering(self):
        clean = context(
            mergeability={
                "status": "clean",
                "mergeable": "MERGEABLE",
                "merge_state_status": "CLEAN",
            }
        )
        conflicting = context(
            mergeability={
                "status": "conflicting",
                "mergeable": "CONFLICTING",
                "merge_state_status": "DIRTY",
            }
        )

        comparison = MODULE.compare_contexts(clean, conflicting)
        self.assertNotEqual(clean["context_hash"], conflicting["context_hash"])
        self.assertEqual(comparison["status"], "code-changed")
        self.assertTrue(comparison["mergeability_changed"])
        rendered = MODULE.render_context(conflicting)
        self.assertIn("Mergeability: **conflicting**", rendered)
        self.assertIn("Raw mergeable: `CONFLICTING`", rendered)
        self.assertIn("Raw merge state: `DIRTY`", rendered)

    def test_compare_distinguishes_code_and_conversation_changes(self):
        original = context()
        conversation = context(
            issue_comments=[
                {
                    "id": 1,
                    "author": "human",
                    "updated_at": "2026-01-01T00:00:00Z",
                    "body": "fixed",
                }
            ]
        )
        moved = context(head_oid="new-head")

        self.assertEqual(
            MODULE.compare_contexts(original, original)["status"],
            "current",
        )
        self.assertEqual(
            MODULE.compare_contexts(original, conversation)["status"],
            "conversation-changed",
        )
        self.assertEqual(
            MODULE.compare_contexts(original, moved)["status"],
            "code-changed",
        )
        edited_body = context(pr={"title": "Title", "body": "New requirements"})
        self.assertEqual(
            MODULE.compare_contexts(original, edited_body)["status"],
            "conversation-changed",
        )

    def test_latest_same_author_ignores_dismissed_reviews(self):
        value = context(
            reviews=[
                {
                    "id": 1,
                    "author": "alice",
                    "state": "APPROVED",
                    "submitted_at": "2026-01-01T00:00:00Z",
                },
                {
                    "id": 2,
                    "author": "alice",
                    "state": "DISMISSED",
                    "submitted_at": "2026-01-02T00:00:00Z",
                },
                {
                    "id": 3,
                    "author": "bob",
                    "state": "CHANGES_REQUESTED",
                    "submitted_at": "2026-01-03T00:00:00Z",
                },
                {
                    "id": 4,
                    "author": "alice",
                    "state": "COMMENTED",
                    "submitted_at": "2026-01-04T00:00:00Z",
                    "body": "",
                },
            ]
        )
        self.assertEqual(MODULE.latest_same_author(value, "alice")["id"], 1)
        self.assertIsNone(MODULE.latest_same_author(value, "carol"))

    def test_same_author_counts_commented_review_with_root_inline_finding(self):
        value = context(
            reviews=[
                {
                    "id": 4,
                    "author": "alice",
                    "state": "COMMENTED",
                    "submitted_at": "2026-01-04T00:00:00Z",
                    "body": "",
                }
            ],
            review_comments=[
                {
                    "id": 10,
                    "review_id": 4,
                    "reply_to_id": None,
                    "author": "alice",
                    "body": "Blocking issue",
                }
            ],
        )
        self.assertEqual(MODULE.latest_same_author(value, "alice")["id"], 4)

    def test_render_prioritizes_open_threads_and_recent_human_context(self):
        value = context(
            issue_comments=[
                {
                    "id": 1,
                    "author": "human",
                    "updated_at": "2026-01-03T00:00:00Z",
                    "body": "Please retain this discussion.",
                }
            ],
            review_threads=[
                {
                    "id": "open",
                    "resolved": False,
                    "outdated": False,
                    "path": "src/a.py",
                    "line": 7,
                    "comments": [
                        {
                            "author": "alice",
                            "updated_at": "2026-01-02T00:00:00Z",
                            "body": "This still fails.",
                        }
                    ],
                },
                {
                    "id": "closed",
                    "resolved": True,
                    "outdated": False,
                    "path": "src/b.py",
                    "line": 9,
                    "comments": [
                        {
                            "author": "bob",
                            "updated_at": "2026-01-01T00:00:00Z",
                            "body": "Resolved.",
                        }
                    ],
                },
            ]
        )
        rendered = MODULE.render_context(value)
        self.assertLess(rendered.index("Thread `open`"), rendered.index("[resolved]"))
        self.assertIn("This still fails.", rendered)
        self.assertIn("Please retain this discussion.", rendered)

    def test_capture_threads_paginates_comments_within_a_thread(self):
        first_page = {
            "data": {
                "repository": {
                    "pullRequest": {
                        "reviewThreads": {
                            "nodes": [
                                {
                                    "id": "thread-1",
                                    "isResolved": False,
                                    "isOutdated": False,
                                    "path": "src/a.py",
                                    "line": 7,
                                    "originalLine": 7,
                                    "comments": {
                                        "nodes": [
                                            {
                                                "databaseId": 1,
                                                "body": "First",
                                                "author": {"login": "alice"},
                                            }
                                        ],
                                        "pageInfo": {
                                            "hasNextPage": True,
                                            "endCursor": "comment-cursor",
                                        },
                                    },
                                }
                            ],
                            "pageInfo": {
                                "hasNextPage": False,
                                "endCursor": None,
                            },
                        }
                    }
                }
            }
        }
        second_page = {
            "data": {
                "node": {
                    "comments": {
                        "nodes": [
                            {
                                "databaseId": 2,
                                "body": "Second",
                                "author": {"login": "bob"},
                            }
                        ],
                        "pageInfo": {
                            "hasNextPage": False,
                            "endCursor": None,
                        },
                    }
                }
            }
        }

        with patch.object(MODULE, "run_json", side_effect=[first_page, second_page]):
            threads = MODULE.capture_threads("owner/repo", 1)

        self.assertEqual(
            [comment["body"] for comment in threads[0]["comments"]],
            ["First", "Second"],
        )

    def test_clean_body_removes_bot_details_and_bounds_output(self):
        body = "<details><summary>Prompt</summary>" + ("x" * 2_000) + "</details>\nActionable"
        self.assertEqual(MODULE.clean_body(body, "coderabbitai"), "Actionable")
        self.assertLessEqual(len(MODULE.clean_body("x" * 3_000, "alice")), 2_000)
        self.assertEqual(
            MODULE.clean_body("## Review limit reached\nbilling boilerplate", "service[bot]"),
            "Bot status: review limit reached.",
        )
        self.assertTrue(
            MODULE.is_noise_issue_comment({"body": "@coderabbitai review"})
        )
        self.assertFalse(
            MODULE.is_noise_issue_comment({"body": "@alice this still fails"})
        )

    def test_context_round_trip_requires_supported_schema(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "context.json"
            path.write_text(json.dumps(context()), encoding="utf-8")
            self.assertEqual(MODULE.load_context(path)["head_oid"], "head")
            path.write_text('{"schema_version": 999}', encoding="utf-8")
            with self.assertRaises(MODULE.ContextError):
                MODULE.load_context(path)


if __name__ == "__main__":
    unittest.main()
