#!/usr/bin/env python3
"""Run the review artifact lifecycle against the native Windows backend."""

import importlib.util
import os
import stat
import subprocess
import tempfile
from pathlib import Path
import sys
import unittest


if __name__ == "__main__":
    if os.name != "nt":
        print("SKIP: native Windows review artifact lifecycle")
        raise SystemExit(0)

    source = Path(__file__).with_name("test_review_context.py")
    spec = importlib.util.spec_from_file_location("review_context_cases", source)
    assert spec and spec.loader
    cases = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cases)

    class WindowsReviewArtifactLifecycleTests(unittest.TestCase):
        def test_cleanup_run_removes_read_only_snapshot_object(self):
            with tempfile.TemporaryDirectory() as directory:
                repo = Path(directory)
                source = repo / "source"
                source.mkdir()
                subprocess.run(
                    ["git", "init", "--quiet", str(source)],
                    check=True,
                    capture_output=True,
                )
                (source / "tracked.txt").write_text("fixture\n", encoding="utf-8")
                subprocess.run(
                    ["git", "-C", str(source), "add", "--", "tracked.txt"],
                    check=True,
                    capture_output=True,
                )
                subprocess.run(
                    [
                        "git",
                        "-C",
                        str(source),
                        "-c",
                        "user.name=Team Harness Test",
                        "-c",
                        "user.email=team-harness-test@example.invalid",
                        "commit",
                        "--quiet",
                        "-m",
                        "fixture",
                    ],
                    check=True,
                    capture_output=True,
                )
                owned = cases.MODULE.create_review_run(repo, 34)
                run = Path(owned["artifact_root"])
                snapshot = run / "pr-review-snapshot.git"
                subprocess.run(
                    ["git", "clone", "--bare", "--quiet", str(source), str(snapshot)],
                    check=True,
                    capture_output=True,
                )
                subprocess.run(
                    ["git", "--git-dir", str(snapshot), "repack", "-a", "-d"],
                    check=True,
                    capture_output=True,
                )
                pack_files = list((snapshot / "objects" / "pack").glob("*.pack"))
                self.assertTrue(pack_files, "fixture must contain a packed Git object")
                object_files = [
                    path
                    for path in (snapshot / "objects").rglob("*")
                    if path.is_file()
                ]
                self.assertTrue(object_files, "fixture must contain Git object files")
                for path in object_files:
                    path.chmod(stat.S_IREAD)
                self.assertTrue(
                    all(not path.stat().st_mode & stat.S_IWRITE for path in object_files)
                )

                cases.MODULE.cleanup_review_run(
                    repo, run, owned["owner_token"]
                )
                self.assertFalse(run.exists())

    # Reuse the same behavior assertions as POSIX; only the filesystem backend differs.
    names = [
        "test_windows_junctions_cannot_be_used_as_snapshot_or_cleanup_worktree",
        "test_preflight_rejects_linked_agent_directories",
        "test_command_output_writes_and_promotes_a_pinned_artifact",
        "test_gh_output_is_utf8_and_invalid_bytes_are_bounded",
        "test_snapshot_repo_avoids_writes_to_read_only_source_git_dir",
        "test_directory_replacement_before_open_is_rejected",
        "test_review_runs_are_isolated_and_cleanup_is_owner_bound",
        "test_resume_selects_only_complete_isolated_run",
        "test_prepare_run_owns_capture_materialization_and_paths",
        "test_prepare_run_cleans_its_owned_partial_run_on_capture_failure",
        "test_prepare_run_cleans_its_owned_partial_run_on_materialize_failure",
        "test_apply_verification_cli_preserves_inline_leaf",
        "test_artifact_promotion_rejects_temporary_inode_swap",
        "test_artifact_promotion_uses_pinned_inode_when_source_name_swaps",
        "test_artifact_promotion_links_portably_without_procfs",
        "test_refresh_context_promotes_review_state_without_rebuilding_technical_state",
        "test_refresh_context_keeps_old_artifacts_when_semantic_context_changes",
        "test_refresh_context_rolls_back_pair_when_second_promotion_fails",
        "test_context_round_trip_requires_supported_schema",
    ]
    suite = unittest.TestSuite(cases.ReviewContextTests(name) for name in names)
    suite.addTest(
        WindowsReviewArtifactLifecycleTests(
            "test_cleanup_run_removes_read_only_snapshot_object"
        )
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
