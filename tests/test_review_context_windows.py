#!/usr/bin/env python3
"""Run the review artifact lifecycle against the native Windows backend."""

import importlib.util
import os
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

    # Reuse the same behavior assertions as POSIX; only the filesystem backend differs.
    names = [
        "test_windows_junctions_cannot_be_used_as_snapshot_or_cleanup_worktree",
        "test_command_output_writes_and_promotes_a_pinned_artifact",
        "test_snapshot_repo_avoids_writes_to_read_only_source_git_dir",
        "test_directory_replacement_before_open_is_rejected",
        "test_review_runs_are_isolated_and_cleanup_is_owner_bound",
        "test_resume_selects_only_complete_isolated_run",
        "test_prepare_run_owns_capture_materialization_and_paths",
        "test_prepare_run_cleans_its_owned_partial_run_on_capture_failure",
        "test_prepare_run_cleans_its_owned_partial_run_on_materialize_failure",
        "test_apply_verification_cli_writes_the_applied_inline_leaf",
        "test_artifact_promotion_rejects_temporary_inode_swap",
        "test_artifact_promotion_links_portably_without_procfs",
        "test_refresh_context_promotes_review_state_without_rebuilding_technical_state",
        "test_refresh_context_keeps_old_artifacts_when_semantic_context_changes",
        "test_refresh_context_rolls_back_pair_when_second_promotion_fails",
        "test_context_round_trip_requires_supported_schema",
    ]
    suite = unittest.TestSuite(cases.ReviewContextTests(name) for name in names)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
