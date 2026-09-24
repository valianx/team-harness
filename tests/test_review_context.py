#!/usr/bin/env python3
"""Behavioral tests for the executable review-context helper."""

from __future__ import annotations

import importlib.util
import io
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from contextlib import contextmanager, redirect_stdout
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

BASE_OID = "a" * 40
HEAD_OID = "b" * 40
MERGE_BASE_OID = "c" * 40
NEW_HEAD_OID = "d" * 40


def context(**overrides):
    value = {
        "schema_version": MODULE.SCHEMA_VERSION,
        "repository": "owner/repo",
        "base_oid": BASE_OID,
        "head_oid": HEAD_OID,
        "merge_base_oid": MERGE_BASE_OID,
        "pr": {"number": 34, "title": "Title", "body": "Body"},
        "commits": [{"oid": HEAD_OID, "subject": "fix: current"}],
        "issue_comments": [],
        "review_comments": [],
        "review_threads": [],
        "reviews": [],
    }
    overrides = dict(overrides)
    if "pr" in overrides:
        value["pr"].update(overrides.pop("pr"))
    value.update(overrides)
    MODULE.finalize_hashes(value)
    return value


def seed_review_artifacts(root: Path, original: dict, latest: dict | None = None):
    """Seed the immutable context pair plus representative completed review work."""
    MODULE.write_json(root / "pr-review-context.json", original)
    (root / "pr-review-conversation.md").write_bytes(b"original conversation\n")
    if latest is not None:
        MODULE.write_json(root / "pr-review-latest-context.json", latest)
        (root / "pr-review-latest-conversation.md").write_bytes(b"previous latest conversation\n")
    (root / "pr-review-final.md").write_bytes(b"draft body\n")
    (root / "pr-review-inline.json").write_bytes(b"[{\"finding\":\"F-1\"}]\n")
    (root / "pr-review-ledger.json").write_bytes(b"{\"ledger\":[\"F-1\"]}\n")
    return {
        path.name: path.read_bytes()
        for path in root.iterdir()
        if path.name.startswith("pr-review-") and path.is_file()
    }


def write_snapshot_markers(snapshot_dir: Path, marker: str) -> None:
    objects = snapshot_dir / "objects" / "pack"
    refs = snapshot_dir / "refs" / "heads"
    objects.mkdir(parents=True, exist_ok=True)
    refs.mkdir(parents=True, exist_ok=True)
    (objects / f"{marker}.pack").write_bytes(marker.encode("ascii"))
    (refs / "reviewed").write_text(marker, encoding="ascii")


def snapshot_tree_bytes(snapshot_dir: Path) -> dict[str, bytes]:
    return {
        str(path.relative_to(snapshot_dir)): path.read_bytes()
        for path in snapshot_dir.rglob("*")
        if path.is_file()
    }


def windows_directory_acl(path: Path) -> dict[str, object]:
    """Read ACL protection and inherited rules using Windows' native ACL provider."""
    powershell = shutil.which("pwsh.exe") or shutil.which("powershell.exe")
    if powershell is None:
        raise AssertionError("Windows PowerShell is required to inspect native ACLs")
    script = (
        "$ErrorActionPreference = 'Stop'; "
        "$acl = Get-Acl -LiteralPath $env:TH_REVIEW_ACL_PATH; "
        "[pscustomobject]@{ protected = $acl.AreAccessRulesProtected; "
        "inherited = @($acl.Access | Where-Object { $_.IsInherited }).Count; "
        "inheritable = @($acl.Access | Where-Object { "
        "($_.InheritanceFlags -band [System.Security.AccessControl.InheritanceFlags]::ContainerInherit) -ne 0"
        "}).Count; sddl = $acl.Sddl } | ConvertTo-Json -Compress"
    )
    environment = os.environ.copy()
    environment.pop("PSModulePath", None)
    environment["TH_REVIEW_ACL_PATH"] = str(path)
    completed = subprocess.run(
        [powershell, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
        check=False,
        capture_output=True,
        text=True,
        env=environment,
    )
    if completed.returncode:
        raise AssertionError(f"PowerShell ACL inspection failed: {completed.stderr.strip()}")
    return json.loads(completed.stdout)


@contextmanager
def native_acl_temp_directory():
    """Create an OS-default temp directory under the test checkout."""
    path = ROOT / f".tmp-review-acl-{os.urandom(8).hex()}"
    path.mkdir()
    try:
        yield path
    finally:
        shutil.rmtree(path)


class ReviewContextTests(unittest.TestCase):
    @unittest.skipUnless(os.name == "nt", "Windows junction regression")
    def test_windows_junctions_cannot_be_used_as_snapshot_or_cleanup_worktree(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as external:
            repo = Path(directory)
            outside = Path(external)
            sentinel = outside / "keep.txt"
            sentinel.write_bytes(b"outside")
            owned = MODULE.create_review_run(repo, 34)
            run = Path(owned["artifact_root"])
            snapshot = run / "pr-review-snapshot.git"
            worktree = run / "pr-review-worktree"
            for junction, ordinary in ((worktree, snapshot), (snapshot, worktree)):
                with self.subTest(junction=junction.name):
                    ordinary.mkdir()
                    subprocess.run(
                        ["cmd", "/d", "/c", "mklink", "/J", str(junction), str(outside)],
                        check=True, capture_output=True,
                    )
                    try:
                        with patch.object(MODULE, "run_text") as git:
                            with self.assertRaisesRegex(MODULE.ContextError, "ownership"):
                                MODULE.cleanup_review_run(repo, run, owned["owner_token"])
                            if junction == snapshot:
                                with self.assertRaisesRegex(MODULE.ContextError, "symlink"):
                                    MODULE.git_snapshot(repo, snapshot, "origin", 34, "base", "head")
                            git.assert_not_called()
                        self.assertEqual(sentinel.read_bytes(), b"outside")
                    finally:
                        os.rmdir(junction)
                        ordinary.rmdir()
            MODULE.cleanup_review_run(repo, run, owned["owner_token"])

    def test_command_output_writes_and_promotes_a_pinned_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            name = MODULE._temporary_leaf(root, "command").name
            result = MODULE.run_to_leaf(
                root, name,
                [sys.executable, "-c", "import sys; sys.stdout.buffer.write(b'diff\\x00\\r\\n')"],
            )
            self.assertEqual(result, 0)
            MODULE.promote_artifact(root, name, "diff.bin")
            self.assertEqual(MODULE.safe_read_leaf(root, "diff.bin"), b"diff\x00\r\n")
            self.assertFalse((root / name).exists())

    @unittest.skipUnless(os.name == "posix", "POSIX file mode assertion")
    def test_write_artifact_leaf_is_owner_only_under_umask_022(self):
        with native_acl_temp_directory() as root:
            previous_umask = os.umask(0o022)
            try:
                MODULE.write_artifact_leaf(root, "review-artifact.json", b"{}\n")
            finally:
                os.umask(previous_umask)

            self.assertEqual(
                stat.S_IMODE((root / "review-artifact.json").stat().st_mode),
                0o600,
            )

    def test_directory_replacement_before_open_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = base / "artifacts"
            root.mkdir()
            original_open = MODULE.artifact_fs.open

            def swap_then_open(path, flags, **kwargs):
                root.rename(base / "original")
                root.mkdir()
                return original_open(path, flags, **kwargs)

            with patch.object(MODULE.artifact_fs, "open", side_effect=swap_then_open):
                with self.assertRaisesRegex(MODULE.ContextError, "directory changed"):
                    MODULE._open_directory(root)

    def test_review_runs_are_isolated_and_cleanup_is_owner_bound(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            legacy = repo / "workspaces" / "pr-review-34"
            legacy.mkdir(parents=True)
            (legacy / "pr-review-snapshot.git").mkdir()
            (legacy / "tmp-pr-review-context.empty").write_bytes(b"")
            first = MODULE.create_review_run(repo, 34)
            second = MODULE.create_review_run(repo, 34)
            first_root = Path(first["artifact_root"])
            second_root = Path(second["artifact_root"])
            self.assertNotEqual(first_root, second_root)
            (first_root / "tmp-pr-review-context.empty").write_bytes(b"")
            (first_root / "pr-review-snapshot.git").mkdir()

            with self.assertRaisesRegex(MODULE.ContextError, "owner token"):
                MODULE.cleanup_review_run(repo, first_root, second["owner_token"])
            self.assertTrue(first_root.is_dir())
            self.assertTrue(second_root.is_dir())

            MODULE.cleanup_review_run(repo, first_root, first["owner_token"])
            self.assertFalse(first_root.exists())
            self.assertTrue(second_root.is_dir())
            MODULE.cleanup_review_run(repo, second_root, second["owner_token"])

    @unittest.skipUnless(
        os.name == "nt" and sys.version_info >= (3, 13),
        "native Windows Python 3.13 ACL inheritance regression",
    )
    def test_new_review_directories_inherit_native_windows_acl_and_preserve_existing_acl(self):
        with native_acl_temp_directory() as repo:
            baseline = windows_directory_acl(repo)
            if not baseline["inheritable"]:
                self.skipTest("temporary parent ACL has no inheritable directory rules")

            owned = MODULE.create_review_run(repo, 34)
            run = Path(owned["artifact_root"])
            review_directories = (
                repo / "workspaces",
                repo / "workspaces" / "pr-review-34",
                run,
            )
            for path in review_directories:
                with self.subTest(directory=path.name):
                    acl = windows_directory_acl(path)
                    self.assertFalse(acl["protected"], "directory DACL should remain inheritable")
                    self.assertGreater(acl["inherited"], 0, "directory should inherit access rules")
            MODULE.cleanup_review_run(repo, run, owned["owner_token"])

        with native_acl_temp_directory() as repo:
            workspaces = repo / "workspaces"
            parent = workspaces / "pr-review-34"
            parent.mkdir(parents=True)
            before = {path: windows_directory_acl(path)["sddl"] for path in (workspaces, parent)}

            owned = MODULE.create_review_run(repo, 34)

            for path in (workspaces, parent):
                with self.subTest(preexisting_directory=path.name):
                    after_sddl = windows_directory_acl(path)["sddl"]
                    self.assertTrue(
                        after_sddl == before[path],
                        "creating a review run must preserve an existing directory ACL",
                    )
            MODULE.cleanup_review_run(repo, Path(owned["artifact_root"]), owned["owner_token"])

    @unittest.skipIf(os.name == "nt", "POSIX umask regression")
    def test_review_directories_respect_the_process_umask(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            previous_umask = os.umask(0o027)
            try:
                owned = MODULE.create_review_run(repo, 34)
            finally:
                os.umask(previous_umask)

            run = Path(owned["artifact_root"])
            for path in (repo / "workspaces", run.parent, run):
                with self.subTest(directory=path.name):
                    self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o750)
            MODULE.cleanup_review_run(repo, run, owned["owner_token"])

    def test_resume_selects_only_complete_isolated_run(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            incomplete = MODULE.create_review_run(repo, 34)
            complete = MODULE.create_review_run(repo, 34)
            complete_root = Path(complete["artifact_root"])
            (complete_root / "pr-review-context.json").write_text("{}\n", encoding="utf-8")
            (complete_root / "pr-review-final.md").write_text("draft\n", encoding="utf-8")
            (complete_root / "pr-review-inline.json").write_text("[]\n", encoding="utf-8")

            resumed = MODULE.find_resumable_review_run(repo, 34)
            self.assertEqual(resumed, complete)

            MODULE.cleanup_review_run(repo, Path(incomplete["artifact_root"]), incomplete["owner_token"])
            MODULE.cleanup_review_run(repo, complete_root, complete["owner_token"])

    def test_prepare_run_owns_capture_materialization_and_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            repo_root = Path(directory)
            subprocess.run(["git", "init", "-q", str(repo_root)], check=True)
            captured = context()

            def fake_capture(**values):
                values["snapshot_dir"].mkdir()
                MODULE.write_json(values["output"], captured)
                return captured

            def fake_materialize(**values):
                root = values["artifact_root_value"]
                for name in (values["diff_name"], values["files_name"], values["checks_name"]):
                    (root / name).write_text("evidence\n", encoding="utf-8")
                values["worktree"].mkdir()

            with (
                patch.object(MODULE, "capture_to_path", side_effect=fake_capture),
                patch.object(MODULE, "materialize_review_artifacts", side_effect=fake_materialize),
                patch.object(MODULE, "render_context", return_value="conversation\n"),
            ):
                prepared = MODULE.prepare_review_run(repo_root, "owner/repo", 34)

            self.assertEqual(prepared["status"], "prepared")
            self.assertEqual(prepared["context_hash"], captured["context_hash"])
            for key in ("context", "conversation", "snapshot", "diff", "files", "checks", "worktree"):
                self.assertTrue(Path(prepared[key]).exists(), key)
            self.assertNotIn("tmp-pr-review", "\n".join(path.name for path in Path(prepared["artifact_root"]).iterdir()))

    def test_prepare_run_cleans_its_owned_partial_run_on_capture_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            repo_root = Path(directory)
            subprocess.run(["git", "init", "-q", str(repo_root)], check=True)
            with patch.object(
                MODULE,
                "capture_to_path",
                side_effect=MODULE.ContextError("capture failed"),
            ):
                with self.assertRaisesRegex(MODULE.ContextError, "capture failed"):
                    MODULE.prepare_review_run(repo_root, "owner/repo", 34)

            parent = repo_root / "workspaces" / "pr-review-34"
            self.assertEqual(list(parent.glob("run-*")), [])

    def test_prepare_run_cleans_its_owned_partial_run_on_materialize_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            repo_root = Path(directory)
            subprocess.run(["git", "init", "-q", str(repo_root)], check=True)
            captured = context()

            def fake_capture(**values):
                values["snapshot_dir"].mkdir()
                MODULE.write_json(values["output"], captured)
                return captured

            with (
                patch.object(MODULE, "capture_to_path", side_effect=fake_capture),
                patch.object(MODULE, "render_context", return_value="conversation\n"),
                patch.object(
                    MODULE,
                    "materialize_review_artifacts",
                    side_effect=MODULE.ContextError("materialize failed"),
                ),
            ):
                with self.assertRaisesRegex(MODULE.ContextError, "materialize failed"):
                    MODULE.prepare_review_run(repo_root, "owner/repo", 34)

            parent = repo_root / "workspaces" / "pr-review-34"
            self.assertEqual(list(parent.glob("run-*")), [])

    def test_review_policy_defaults_and_parses_the_fenced_yaml_block(self):
        self.assertEqual(
            MODULE.read_review_policy(None),
            {"verification": "blocking-only", "max_suggestions": 5, "source": "default"},
        )
        with tempfile.TemporaryDirectory() as directory:
            policy = Path(directory) / "review-policy.md"
            policy.write_text(
                "# Policy\n\n```yaml\nverification: off  # repo owner call\nmax_suggestions: 3\n```\n"
                "\nExample of an invalid value:\n\n```yaml\nverification: sometimes\n```\n",
                encoding="utf-8",
            )
            self.assertEqual(
                MODULE.read_review_policy(policy),
                {"verification": "off", "max_suggestions": 3, "source": "policy"},
            )
            policy.write_text("```yaml\nverification: sometimes\n```\n", encoding="utf-8")
            with self.assertRaisesRegex(MODULE.ContextError, "verification must be one of"):
                MODULE.read_review_policy(policy)
            policy.write_text("```yaml\nmax_suggestions: \u00b2\n```\n", encoding="utf-8")
            with self.assertRaisesRegex(MODULE.ContextError, "non-negative integer"):
                MODULE.read_review_policy(policy)
            completed = subprocess.run(
                [sys.executable, str(SCRIPT), "policy", "--policy", "none"],
                check=True, capture_output=True, text=True,
            )
            self.assertEqual(json.loads(completed.stdout)["verification"], "blocking-only")

    def test_review_policy_is_read_from_the_base_commit_not_the_pr_head(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory) / "repo"
            repo.mkdir()
            env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
                   "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com"}
            def git(*args):
                return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True, env=env).stdout.strip()
            git("init", "-q")
            (repo / "README.md").write_text("base\n", encoding="utf-8")
            git("add", "README.md")
            git("commit", "-q", "-m", "base without policy")
            no_policy = git("rev-parse", "HEAD")
            (repo / ".team-harness").mkdir()
            (repo / ".team-harness" / "review-policy.md").write_text("```yaml\nverification: all\nmax_suggestions: 2\n```\n", encoding="utf-8")
            git("add", ".team-harness")
            git("commit", "-q", "-m", "owner policy")
            base = git("rev-parse", "HEAD")
            (repo / ".team-harness" / "review-policy.md").write_text("```yaml\nverification: off\n```\n", encoding="utf-8")
            git("add", ".team-harness")
            git("commit", "-q", "-m", "pr turns verification off")
            snapshot = repo / ".git"
            self.assertEqual(MODULE.read_base_review_policy(snapshot, no_policy), {"verification": "blocking-only", "max_suggestions": 5, "source": "default"})
            self.assertEqual(MODULE.read_base_review_policy(snapshot, base), {"verification": "all", "max_suggestions": 2, "source": "base-commit"})
            with self.assertRaisesRegex(MODULE.ContextError, "full commit SHA"):
                MODULE.read_base_review_policy(snapshot, "HEAD")
            with self.assertRaisesRegex(MODULE.ContextError, r"git --git-dir .* failed: "):
                MODULE.read_base_review_policy(snapshot, "0" * 40)
            with self.assertRaisesRegex(MODULE.ContextError, r"git --git-dir .* failed: "):
                MODULE.read_base_review_policy(repo / "not-a-snapshot.git", base)
            completed = subprocess.run(
                [sys.executable, str(SCRIPT), "policy", "--snapshot-git", str(snapshot), "--base-oid", base],
                check=True, capture_output=True, text=True,
            )
            self.assertEqual(json.loads(completed.stdout)["verification"], "all")

    def verification_fixture(self):
        inline = [
            {"path": "src/a.ts", "line": 10, "side": "RIGHT", "body": "**Blocking: null deref**\n\nEvidence.\n\n**Fix:** guard."},
            {"path": "src/b.ts", "line": 20, "side": "RIGHT", "body": "**Blocking: missing auth check**\n\nEvidence."},
            {"path": "src/c.ts", "line": 30, "side": "RIGHT", "body": "**Blocking: phantom race**\n\nEvidence."},
            {"path": "src/d.ts", "line": 40, "side": "LEFT", "body": "**Suggestion: rename**\n\nStyle."},
        ]
        verifier = {"findings": [
            {"path": "src/a.ts", "line": 10, "side": "RIGHT", "status": "confirmed", "evidence": "src/a.ts:10 — value may be null"},
            {"path": "src/b.ts", "line": 20, "side": "RIGHT", "status": "unconfirmed", "reason": "middleware not readable"},
            {"path": "src/c.ts", "line": 30, "side": "RIGHT", "status": "refuted", "evidence": "src/c.ts:28 holds the lock"},
        ]}
        return inline, verifier

    def test_apply_verification_preserves_all_findings_and_advisory_evidence(self):
        inline, verifier = self.verification_fixture()
        result = MODULE.apply_verification(inline, verifier, "blocking-only")
        self.assertEqual(result["coverage"], "verified 1/3")
        self.assertIsNone(result["forced_event"])
        self.assertEqual(result["inline"], inline)
        self.assertEqual(result["assessments"], verifier["findings"])
        self.assertEqual(result["ledger"], [])
        # Return order follows the input claims, not the verifier's serialization order.
        reversed_result = MODULE.apply_verification(inline, {"findings": list(reversed(verifier["findings"]))}, "blocking-only")
        self.assertEqual(reversed_result, result)

    def test_apply_verification_requires_exact_coverage_of_the_selected_findings(self):
        inline, verifier = self.verification_fixture()
        extra_finding = {"path": "src/new.ts", "line": 1, "side": "RIGHT", "status": "confirmed", "evidence": "x"}
        with self.assertRaisesRegex(MODULE.ContextError, r"coverage does not match .*\(0 missing, 1 unexpected\)"):
            MODULE.apply_verification(inline, {"findings": [*verifier["findings"], extra_finding]}, "blocking-only")
        with self.assertRaisesRegex(MODULE.ContextError, r"coverage does not match .*\(1 missing, 0 unexpected\)"):
            MODULE.apply_verification(inline, {"findings": verifier["findings"][1:]}, "blocking-only")
        with self.assertRaisesRegex(MODULE.ContextError, r"coverage does not match .*\(1 missing, 0 unexpected\)"):
            MODULE.apply_verification(inline, verifier, "all")
        with self.assertRaisesRegex(MODULE.ContextError, "share one path:line side anchor"):
            MODULE.apply_verification([*inline, dict(inline[0], body="**Blocking: other claim**")], verifier, "blocking-only")
        with self.assertRaisesRegex(MODULE.ContextError, "share one path:line side anchor"):
            MODULE.apply_verification([*inline, dict(inline[0], body="**Suggestion: other claim**")], verifier, "blocking-only")

    def test_apply_verification_rejects_malformed_or_evidence_free_assessments(self):
        for value in ([], {}, {"findings": {}}, {"findings": None}):
            with self.subTest(value=value), self.assertRaisesRegex(MODULE.ContextError, "JSON array"):
                MODULE.apply_verification([], value, "all")
        inline, verifier = self.verification_fixture()
        verifier["findings"][0].pop("evidence")
        with self.assertRaisesRegex(MODULE.ContextError, "requires non-empty evidence"):
            MODULE.apply_verification(inline, verifier, "blocking-only")

    def test_verifier_status_requires_its_own_evidence_field(self):
        inline, _ = self.verification_fixture()
        for status, required, other in (("confirmed", "evidence", "reason"),
                                        ("refuted", "evidence", "reason"),
                                        ("unconfirmed", "reason", "evidence")):
            for value in (None, "", "  ", 3, [], {}):
                assessment = dict(inline[0], status=status, **{required: value, other: "not the required field"})
                with self.subTest(status=status, value=value), self.assertRaisesRegex(
                    MODULE.ContextError, f"requires non-empty {required}"
                ):
                    MODULE.apply_verification(inline[:1], {"findings": [assessment]}, "all")

    def test_empty_blocking_selection_does_not_expand_to_suggestions(self):
        inline, _ = self.verification_fixture()
        result = MODULE.apply_verification(inline[-1:], {"findings": []}, "blocking-only")
        self.assertEqual(result["coverage"], "verified 0/0")
        self.assertEqual(result["inline"], inline[-1:])
        self.assertIsNone(result["forced_event"])
        suggestion = dict(inline[-1], status="confirmed", evidence="src/d.ts:40")
        with self.assertRaisesRegex(MODULE.ContextError, "0 missing, 1 unexpected"):
            MODULE.apply_verification(inline[-1:], {"findings": [suggestion]}, "blocking-only")

    def test_apply_verification_absent_verifier_and_policy_off(self):
        inline, _ = self.verification_fixture()
        absent = MODULE.apply_verification(inline, None, "blocking-only")
        self.assertEqual(absent["coverage"], "verified 0/3 (verifier absent)")
        self.assertEqual(absent["forced_event"], "COMMENT")
        self.assertEqual(absent["inline"], inline)
        off = MODULE.apply_verification(inline, None, "off")
        self.assertEqual(off["coverage"], "verification off (policy)")
        self.assertIsNone(off["forced_event"])
        _, verifier = self.verification_fixture()
        verifier["findings"].append({"path": "src/d.ts", "line": 40, "side": "LEFT", "status": "unconfirmed", "reason": "style only"})
        every = MODULE.apply_verification(inline, verifier, "all")
        self.assertEqual(every["coverage"], "verified 1/4")
        self.assertEqual(every["assessments"], verifier["findings"])
        self.assertEqual(every["inline"], inline)
        with self.assertRaisesRegex(MODULE.ContextError, "verifier status"):
            MODULE.apply_verification(inline, {"findings": [{"path": "a", "line": 1, "side": "RIGHT", "status": "maybe"}]}, "all")

    def test_apply_verification_rejects_duplicate_anchors_and_preserves_unknown_bodies(self):
        inline, verifier = self.verification_fixture()
        verifier["findings"].append(dict(verifier["findings"][0], status="refuted", evidence="second opinion"))
        with self.assertRaisesRegex(MODULE.ContextError, "two statuses for src/a.ts:10 RIGHT"):
            MODULE.apply_verification(inline, verifier, "blocking-only")
        odd = [
            {"path": "src/e.ts", "line": 5, "side": "RIGHT", "body": "**blocking: lower case**\n\nEvidence."},
            {"path": "src/f.ts", "line": 6, "side": "RIGHT", "body": "Unlabelled claim.\n\nEvidence."},
            {"path": "src/g.ts", "line": 7, "side": "RIGHT", "body": "**suggestion: style**"},
        ]
        statuses = [dict(finding, status="unconfirmed", reason="not readable") for finding in odd[:2]]
        result = MODULE.apply_verification(odd, {"findings": statuses}, "blocking-only")
        self.assertEqual(result["coverage"], "verified 0/2")
        self.assertEqual(result["inline"], odd)
        self.assertEqual(result["assessments"], statuses)
        self.assertEqual(result["ledger"], [])

    def test_apply_verification_cli_preserves_inline_leaf(self):
        inline, verifier = self.verification_fixture()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "pr-review-draft-inline.json").write_text(json.dumps(inline), encoding="utf-8")
            (root / "pr-review-verifier.json").write_text(json.dumps(verifier), encoding="utf-8")
            completed = subprocess.run(
                [
                    sys.executable, str(SCRIPT), "apply-verification",
                    "--artifact-root", str(root), "--inline-name", "pr-review-draft-inline.json",
                    "--verifier-name", "pr-review-verifier.json", "--verification", "blocking-only",
                    "--output-name", "pr-review-inline.json",
                ],
                check=True, capture_output=True, text=True,
            )
            self.assertEqual(json.loads(completed.stdout)["coverage"], "verified 1/3")
            written = json.loads((root / "pr-review-inline.json").read_text(encoding="utf-8"))
            self.assertEqual(written, inline)
            self.assertEqual(json.loads(completed.stdout)["assessments"], verifier["findings"])
            self.assertEqual(sorted(path.name for path in root.iterdir()), ["pr-review-draft-inline.json", "pr-review-inline.json", "pr-review-verifier.json"])

    def test_lenses_line_forms(self):
        self.assertEqual(
            MODULE.format_lenses_line(["reviewer ran", "security ran"], "verified 3/4"),
            "Lenses: reviewer ran, security ran, verified 3/4",
        )
        self.assertEqual(
            MODULE.format_lenses_line(["reviewer ran", "qa absent (missing identity echo)"], "verified 0/2 (verifier absent)"),
            "Lenses: reviewer ran, qa absent (missing identity echo), verified 0/2 (verifier absent)",
        )
        self.assertEqual(MODULE.format_lenses_line(["reviewer ran"], "verification off (policy)"), "Lenses: reviewer ran, verification off (policy)")
        with self.assertRaises(MODULE.ContextError):
            MODULE.format_lenses_line([], None)

    def test_preflight_reports_blockers_without_raising(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            subprocess.run(["git", "init", "-q", str(repo)], check=True)
            tracked_ignore = repo / ".gitignore"
            tracked_ignore.write_text("node_modules\n", encoding="utf-8")
            local_exclude = repo / ".git" / "info" / "exclude"
            local_exclude.write_text("/build/\n", encoding="utf-8")
            agents = repo / ".codex" / "agents"
            agents.mkdir(parents=True)
            for name in MODULE.REVIEW_AGENT_NAMES[:-1]:
                (agents / f"{name}.toml").write_text(
                    f"# Instruction source: runtime/codex/instructions/{name}.md\n"
                    f"# Semantic source: agents/{name}.md (sonnet/high)\n# Projection tier: x\n"
                    f'name = "{name}"\nsandbox_mode = "read-only"\n',
                    encoding="utf-8",
                )
            real_run = subprocess.run

            def fake_run(command, *args, **kwargs):
                if command and command[0] == "gh":
                    raise FileNotFoundError("gh unavailable in fixture")
                return real_run(command, *args, **kwargs)

            with patch.object(MODULE.subprocess, "run", side_effect=fake_run), patch.dict(
                os.environ, {"CODEX_HOME": str(repo / "codex-home")}
            ):
                result = MODULE.preflight(repo, "codex", None)
            self.assertFalse(result["ok"])
            self.assertEqual(result["codex_agents"]["searched"], [str(agents), str(repo / "codex-home" / "agents")])
            self.assertEqual(result["gh"], "unavailable")
            self.assertEqual(result["workspaces_ignore"], "local-exclude-added")
            self.assertEqual(result["codex_agents"]["status"], "complete")
            self.assertEqual(result["codex_agents"]["missing"], [])
            self.assertEqual(result["review_agents"], ["reviewer", "pr-review-verifier"])
            self.assertEqual(tracked_ignore.read_text(encoding="utf-8"), "node_modules\n")
            self.assertIn("/build/\n/workspaces/\n", local_exclude.read_text(encoding="utf-8"))
            (agents / "reviewer-consolidator.toml").write_text('name = "reviewer-consolidator"\n', encoding="utf-8")
            with patch.object(MODULE.subprocess, "run", side_effect=fake_run), patch.dict(
                os.environ, {"CODEX_HOME": str(repo / "codex-home")}
            ):
                again = MODULE.preflight(repo, "codex", None, ["reviewer-consolidator"])
            self.assertEqual(again["workspaces_ignore"], "present")
            self.assertEqual(again["codex_agents"]["invalid"], ["reviewer-consolidator"])
            global_agents = repo / "codex-home" / "agents"
            global_agents.mkdir(parents=True)
            for name in MODULE.REVIEW_AGENT_NAMES:
                (global_agents / f"{name}.toml").write_text(
                    f"# Instruction source: runtime/codex/instructions/{name}.md\n"
                    f"# Semantic source: agents/{name}.md (sonnet/high)\n# Projection tier: x\n"
                    f'name = "{name}"\nsandbox_mode = "read-only"\n',
                    encoding="utf-8",
                )
            with patch.object(MODULE.subprocess, "run", side_effect=fake_run), patch.dict(
                os.environ, {"CODEX_HOME": str(repo / "codex-home")}
            ):
                from_global = MODULE.preflight(repo, "codex", None, ["reviewer-consolidator"])
            # A broken project override cannot be hidden by a valid global role.
            self.assertEqual(from_global["codex_agents"]["invalid"], ["reviewer-consolidator"])
            (agents / "reviewer-consolidator.toml").unlink()
            with patch.object(MODULE.subprocess, "run", side_effect=fake_run), patch.dict(
                os.environ, {"CODEX_HOME": str(repo / "codex-home")}
            ):
                from_global = MODULE.preflight(repo, "codex", None, ["reviewer-consolidator"])
            self.assertEqual(from_global["codex_agents"]["status"], "complete")
            self.assertEqual(from_global["codex_agents"]["agents_dir"], str(global_agents))
            self.assertEqual(from_global["blockers"], ["gh unavailable"])
            with patch.object(MODULE.subprocess, "run", side_effect=fake_run):
                claude = MODULE.preflight(repo, "claude", None)
            self.assertIsNone(claude["codex_agents"])
            self.assertEqual(claude["blockers"], ["gh unavailable"])

    def test_preflight_selected_roles_and_prerequisites_only(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            subprocess.run(["git", "init", "-q", str(repo)], check=True)
            agents = repo / "agents"
            agents.mkdir()
            name = "reviewer"
            (agents / f"{name}.toml").write_text(
                f"# Instruction source: runtime/codex/instructions/{name}.md\n"
                f"# Semantic source: agents/{name}.md\n# Projection tier: x\n"
                f'name = "{name}"\nsandbox_mode = "read-only"\n', encoding="utf-8")
            real_run = subprocess.run

            def fake_run(command, *args, **kwargs):
                if command and command[0] == "gh":
                    return subprocess.CompletedProcess(command, 0, b"", b"")
                return real_run(command, *args, **kwargs)

            with patch.object(MODULE.subprocess, "run", side_effect=fake_run):
                initial = MODULE.preflight(repo, "codex", agents, prerequisites_only=True)
                self.assertTrue(initial["ok"])
                self.assertEqual(initial["review_agents"], [])
                self.assertEqual(initial["agent_check"], "not-run")
                self.assertIsNone(initial["codex_agents"])
                selected = MODULE.preflight(repo, "codex", agents, ["reviewer", "reviewer"])
                self.assertTrue(selected["ok"])
                self.assertEqual(selected["review_agents"], ["reviewer"])
                self.assertEqual(selected["agent_check"], "native-check-required")
                with patch.object(Path, "read_text", side_effect=PermissionError("fixture unreadable")):
                    unreadable = MODULE._codex_agent_set_status(agents, ("reviewer",))
                self.assertEqual(unreadable["status"], "mixed")
                self.assertEqual(unreadable["invalid"], ["reviewer"])
                missing = MODULE.preflight(repo, "codex", agents, ["reviewer", "pr-review-security"])
                self.assertFalse(missing["ok"])
                self.assertEqual(missing["codex_agents"]["missing"], ["pr-review-security"])
                for selection in ([], ["implementer"], ["unknown"]):
                    with self.subTest(selection=selection), self.assertRaises(MODULE.ContextError):
                        MODULE.preflight(repo, "codex", agents, selection)
                with self.assertRaises(MODULE.ContextError):
                    MODULE.preflight(repo, "codex", agents, ["reviewer"], prerequisites_only=True)

    def test_preflight_rejects_linked_agent_directories(self):
        for linked_level in ("agents", ".codex"):
            with self.subTest(level=linked_level), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                target = root / "outside"
                target.mkdir()
                link = root / linked_level
                if os.name == "nt":
                    subprocess.run(["cmd", "/d", "/c", "mklink", "/J", str(link), str(target)],
                                   check=True, capture_output=True)
                else:
                    link.symlink_to(target, target_is_directory=True)
                try:
                    agents = link if linked_level == "agents" else link / "agents"
                    agents.mkdir(exist_ok=True)
                    (agents / "reviewer.toml").write_text(
                        '# Instruction source: runtime/codex/instructions/reviewer.md\n'
                        '# Semantic source: agents/reviewer.md\n# Projection tier: x\n'
                        'name = "reviewer"\nsandbox_mode = "read-only"\n', encoding="utf-8")
                    result = MODULE._codex_agent_set_status(agents, ("reviewer",))
                    self.assertEqual(result["status"], "mixed")
                    self.assertEqual(result["invalid"], ["reviewer"])
                finally:
                    os.rmdir(link) if os.name == "nt" else link.unlink()

    def test_snapshot_repo_avoids_writes_to_read_only_source_git_dir(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            remote = root / "remote.git"
            source = root / "source"
            producer = root / "producer"
            snapshot = root / "artifacts" / "pr-review-snapshot.git"
            worktree = root / "review-worktree" / ("nested-review-" * 8)
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

            git("clone", "--quiet", "--branch", "main", str(remote), str(producer))
            git("config", "user.name", "Review Test", cwd=producer)
            git("config", "user.email", "review@example.test", cwd=producer)
            (producer / "file.txt").write_text("head\n", encoding="utf-8")
            nested_file = Path("specs") / ("long-spec-name-" * 7) / "spec.md"
            (producer / nested_file).parent.mkdir(parents=True)
            (producer / nested_file).write_text("nested evidence\n", encoding="utf-8")
            git("add", str(nested_file), cwd=producer)
            git("commit", "--quiet", "-am", "head", cwd=producer)
            head_oid = git("rev-parse", "HEAD", cwd=producer)
            git("push", "--quiet", "origin", "HEAD:refs/pull/1/head", cwd=producer)

            source_git = source / ".git"
            original_mode = source_git.stat().st_mode & 0o777
            os.chmod(source_git, 0o555)

            def source_git_snapshot():
                return [
                    (
                        str(path.relative_to(source_git)),
                        path.lstat().st_mode,
                        path.lstat().st_size,
                        path.lstat().st_mtime_ns,
                    )
                    for path in sorted(source_git.rglob("*"))
                ]

            before = source_git_snapshot()
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
                self.assertEqual(source_git_snapshot(), before)
            finally:
                os.chmod(source_git, original_mode)

            self.assertEqual(refs["merge_base_oid"], base_oid)
            self.assertEqual(
                git("--git-dir", str(snapshot), "rev-parse", refs["head_ref"]),
                head_oid,
            )
            self.assertFalse((snapshot / "objects" / "info" / "alternates").exists())
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
            try:
                self.assertEqual(git("rev-parse", "HEAD", cwd=worktree), head_oid)
                self.assertGreater(len(str(worktree / nested_file)), 260)
                native_file = worktree / nested_file
                if os.name == "nt":
                    native_file = Path("\\\\?\\" + str(native_file))
                self.assertEqual(native_file.read_text(encoding="utf-8"), "nested evidence\n")
            finally:
                git("--git-dir", str(snapshot), "worktree", "remove", str(worktree))

    def test_invalid_snapshot_parent_is_a_context_error(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifacts = root / "artifacts"
            artifacts.mkdir()
            output = artifacts / "context.json"
            args = SimpleNamespace(
                output=output,
                snapshot_dir=artifacts / "missing" / "snapshot.git",
                deadline_epoch=None,
                repo="owner/repo",
                pr=1,
                git_dir=root,
                remote="origin",
            )
            with self.assertRaisesRegex(
                MODULE.ContextError,
                "snapshot repository parent does not exist",
            ):
                MODULE.command_capture(args)

    def test_materialize_uses_one_deadline_for_diff_checks_and_worktree(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifacts = root / "artifacts"
            artifacts.mkdir()
            snapshot = artifacts / "pr-review-snapshot.git"
            snapshot.mkdir()
            context_path = artifacts / "context.json"
            value = context(
                git_refs={"base": "refs/review/base", "head": "refs/review/head"}
            )
            context_path.write_text(json.dumps(value), encoding="utf-8")
            for name in ("tmp-diff", "tmp-files", "tmp-checks"):
                (artifacts / name).write_text("", encoding="utf-8")
            args = SimpleNamespace(
                artifact_root=artifacts,
                snapshot_dir=snapshot,
                context=context_path,
                worktree=root / "worktree",
                deadline_epoch=MODULE.time.time() + 60,
                diff_name="tmp-diff",
                files_name="tmp-files",
                checks_name="tmp-checks",
                repo="owner/repo",
                pr=1,
            )
            writes = []
            commands = []
            with (
                patch.object(MODULE, "run_to_leaf", side_effect=lambda *a, **k: writes.append((a, k)) or 0),
                patch.object(MODULE, "run_text", side_effect=lambda command, **kwargs: commands.append(command) or ""),
                redirect_stdout(io.StringIO()),
            ):
                MODULE.command_materialize(args)

            self.assertEqual([entry[0][1] for entry in writes], ["tmp-diff", "tmp-files", "tmp-checks"])
            self.assertEqual(writes[-1][1], {"combine_stderr": True, "allow_failure": True})
            self.assertIn("worktree", commands[-1])
            self.assertIsNone(MODULE._capture_deadline)

    def test_materialize_does_not_start_cleanup_after_shared_deadline(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifacts = root / "artifacts"
            artifacts.mkdir()
            snapshot = artifacts / "pr-review-snapshot.git"
            snapshot.mkdir()
            context_path = artifacts / "context.json"
            value = context(
                git_refs={"base": "refs/review/base", "head": "refs/review/head"}
            )
            context_path.write_text(json.dumps(value), encoding="utf-8")
            for name in ("tmp-diff", "tmp-files", "tmp-checks"):
                (artifacts / name).write_text("", encoding="utf-8")
            worktree = root / "worktree"
            args = SimpleNamespace(
                artifact_root=artifacts,
                snapshot_dir=snapshot,
                context=context_path,
                worktree=worktree,
                deadline_epoch=MODULE.time.time() - 1,
                diff_name="tmp-diff",
                files_name="tmp-files",
                checks_name="tmp-checks",
                repo="owner/repo",
                pr=1,
            )

            def fail_worktree(*_args, **_kwargs):
                worktree.mkdir()
                raise MODULE.ContextError("worktree timed out")

            with (
                patch.object(MODULE, "run_to_leaf", return_value=0),
                patch.object(MODULE, "run_text", side_effect=fail_worktree),
                patch.object(MODULE.subprocess, "run") as cleanup,
            ):
                with self.assertRaisesRegex(
                    MODULE.ContextError,
                    "shared deadline exhausted before partial worktree cleanup",
                ):
                    MODULE.command_materialize(args)

            cleanup.assert_not_called()
            self.assertIsNone(MODULE._capture_deadline)

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

    def test_gh_output_is_utf8_and_invalid_bytes_are_bounded(self):
        value = "Español Ï │ 🧪"
        text_bytes = value.encode("utf-8")
        text_command = [
            sys.executable,
            "-c",
            f"import sys; sys.stdout.buffer.write({text_bytes!r})",
        ]
        json_bytes = json.dumps({"body": value}, ensure_ascii=False).encode("utf-8")
        json_command = [
            sys.executable,
            "-c",
            f"import sys; sys.stdout.buffer.write({json_bytes!r})",
        ]
        invalid_command = [
            sys.executable,
            "-c",
            "import sys; sys.stdout.buffer.write(b'\\x8f')",
        ]

        with patch.object(MODULE.subprocess.locale, "getencoding", return_value="cp1252"):
            self.assertEqual(MODULE.run_text(text_command), value)
            self.assertEqual(MODULE.run_json(json_command), {"body": value})
            for runner in (MODULE.run_text, MODULE.run_json):
                with self.subTest(runner=runner.__name__):
                    with self.assertRaisesRegex(MODULE.ContextError, "invalid UTF-8"):
                        runner(invalid_command)

    def test_workspace_ignore_uses_common_metadata_for_linked_worktree(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            linked = root / "linked"
            subprocess.run(["git", "init", "-q", str(source)], check=True)
            subprocess.run([
                "git", "-C", str(source), "-c", "user.name=Test",
                "-c", "user.email=test@example.invalid", "commit", "-q",
                "--allow-empty", "-m", "fixture",
            ], check=True)
            subprocess.run([
                "git", "-C", str(source), "worktree", "add", "--quiet",
                "--detach", str(linked), "HEAD",
            ], check=True)
            MODULE.ensure_workspaces_ignored(linked)
            MODULE.ensure_workspaces_ignored(linked)
            exclude = source / ".git" / "info" / "exclude"
            self.assertEqual(exclude.read_text(encoding="utf-8").count("/workspaces/"), 1)
            self.assertFalse((source / ".gitignore").exists())
            self.assertFalse((linked / ".gitignore").exists())
            ignored = subprocess.run([
                "git", "-C", str(linked), "check-ignore", "workspaces/review/report.md",
            ], capture_output=True)
            self.assertEqual(ignored.returncode, 0)

    def test_workspace_ignore_ignores_inherited_git_metadata_overrides(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "root"
            external = Path(directory) / "external"
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(["git", "init", "-q", str(external)], check=True)
            external_exclude = external / ".git" / "info" / "exclude"
            with patch.dict(
                os.environ,
                {
                    "GIT_DIR": str(external / ".git"),
                    "GIT_COMMON_DIR": str(external / ".git"),
                },
                clear=False,
            ):
                MODULE.ensure_workspaces_ignored(root)

            self.assertIn(
                "/workspaces/\n",
                (root / ".git" / "info" / "exclude").read_text(encoding="utf-8"),
            )
            self.assertNotIn(
                "/workspaces/\n",
                external_exclude.read_text(encoding="utf-8"),
            )

    def test_generic_git_commands_ignore_inherited_repository_overrides(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "root"
            external = Path(directory) / "external"
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(["git", "init", "-q", str(external)], check=True)
            with patch.dict(
                os.environ,
                {
                    "GIT_DIR": str(external / ".git"),
                    "GIT_WORK_TREE": str(external),
                    "GIT_COMMON_DIR": str(external / ".git"),
                    "GIT_INDEX_FILE": str(external / "index"),
                    "GIT_OBJECT_DIRECTORY": str(external / "objects"),
                    "GIT_ALTERNATE_OBJECT_DIRECTORIES": str(external / "alternate"),
                    "GIT_NAMESPACE": "external",
                    "GIT_PREFIX": "external-prefix",
                    "GIT_CEILING_DIRECTORIES": str(external.parent),
                },
                clear=False,
            ):
                git_dir = Path(
                    MODULE.run_text(["git", "-C", str(root), "rev-parse", "--git-dir"])
                )
            self.assertEqual(git_dir, Path(".git"))

    def test_workspace_ignore_update_is_atomic_and_rejects_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            ignore = root / ".git" / "info" / "exclude"
            ignore.write_text("/build/\n", encoding="utf-8")
            MODULE.ensure_workspaces_ignored(root)
            self.assertEqual(ignore.read_text(encoding="utf-8"), "/build/\n/workspaces/\n")
            MODULE.ensure_workspaces_ignored(root)
            self.assertEqual(ignore.read_text(encoding="utf-8").count("/workspaces/"), 1)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            outside = root / "outside"
            outside.write_text("keep", encoding="utf-8")
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            ignore = root / ".git" / "info" / "exclude"
            ignore.unlink()
            try:
                ignore.symlink_to(outside)
            except OSError as error:
                if getattr(error, "winerror", None) == 1314:
                    self.skipTest("Windows symlink privilege is unavailable in this test environment")
                raise
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
            try:
                link.symlink_to(outside)
            except OSError as error:
                if getattr(error, "winerror", None) == 1314:
                    self.skipTest("Windows symlink privilege is unavailable in this test environment")
                raise
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
            real_replace = MODULE.artifact_fs.replace

            def swap_then_replace(source, destination, **kwargs):
                temporary.unlink()
                try:
                    temporary.symlink_to(outside)
                except OSError as error:
                    if getattr(error, "winerror", None) == 1314:
                        self.skipTest("Windows symlink privilege is unavailable in this test environment")
                    raise
                return real_replace(source, destination, **kwargs)

            with patch.object(MODULE.artifact_fs, "replace", side_effect=swap_then_replace):
                MODULE.promote_artifact(root, "tmp-body", "review.md")

            self.assertEqual((root / "review.md").read_text(encoding="utf-8"), "safe")
            self.assertTrue(temporary.is_symlink())
            self.assertEqual(outside.read_text(encoding="utf-8"), "secret")

    def test_artifact_promotion_links_portably_without_procfs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "tmp-body").write_text("safe", encoding="utf-8")
            real_link = MODULE.artifact_fs.link

            def portable_link(source, destination, **kwargs):
                self.assertEqual(source, "tmp-body")
                self.assertFalse(kwargs["follow_symlinks"])
                self.assertEqual(kwargs["src_dir_fd"], kwargs["dst_dir_fd"])
                return real_link(source, destination, **kwargs)

            with patch.object(MODULE.artifact_fs, "link", side_effect=portable_link):
                MODULE.promote_artifact(root, "tmp-body", "review.md")

            self.assertEqual((root / "review.md").read_text(encoding="utf-8"), "safe")

    def test_security_selection_maps_reason_and_advisory_signal(self):
        cases = [
            ("agents/security.md\n", "+permission boundary\n", "known-sensitive", True),
            ("docs/guide.md\n", "+clarify review behavior\n", "known-non-executable", False),
            ("config/app.json\n", '+{"flag": true}\n', "known-non-executable", False),
            ("src/plugin.future\n", "+run new handler\n", "unmatched-executable", True),
            ("", "", "indeterminate", False),
        ]
        for changed_files, diff, reason, recommended in cases:
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
                self.assertEqual(result["security_recommended"], recommended)
                self.assertFalse(result["security_selected"])
                self.assertFalse(result["security_required"])

    def test_explicit_and_tier_four_selection_record_selection_and_recommendation(self):
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
                self.assertEqual(result["security_selected"], trigger == "explicit")
                self.assertEqual(result["security_required"], trigger == "explicit")
                self.assertTrue(result["security_recommended"])
                self.assertEqual(result["triggers"], [trigger])

    def test_extended_suffix_set_does_not_override_filename_sensitivity(self):
        self.assertEqual(
            MODULE.classify_security_change("package.json\n", "+update deps\n"),
            "known-sensitive",
        )
        self.assertEqual(
            MODULE.classify_security_change("go.mod\n", "+require lib v1\n"),
            "known-sensitive",
        )
        self.assertEqual(
            MODULE.classify_security_change("config/app.json\n", "+flag: true\n"),
            "known-non-executable",
        )

    def test_dotenv_files_stay_outside_non_executable_suffix_set(self):
        self.assertEqual(
            MODULE.classify_security_change(".env\n", "+PORT=8080\n"),
            "unmatched-executable",
        )
        self.assertEqual(
            MODULE.classify_security_change(".env.production\n", "+PORT=8080\n"),
            "unmatched-executable",
        )

    def test_github_workflow_path_is_always_security_sensitive(self):
        changed_files = ".github/workflows/ci.yml\n"
        diff = (
            "diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml\n"
            "index 1111111..2222222 100644\n"
            "--- a/.github/workflows/ci.yml\n"
            "+++ b/.github/workflows/ci.yml\n"
            "@@ -1,2 +1,3 @@\n"
            " name: CI\n"
            "+      - run: echo hello\n"
            " jobs:\n"
        )
        reason = MODULE.classify_security_change(changed_files, diff)
        self.assertEqual(reason, "known-sensitive")
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
        self.assertTrue(result["security_recommended"])
        self.assertFalse(result["security_selected"])

    def test_non_utf8_diff_in_a_sensitive_path_still_classifies_security_sensitive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            changed_path = root / "changed-files.txt"
            diff_path = root / "review.diff"
            changed_path.write_text("src/auth/login.py\n", encoding="utf-8")
            diff_path.write_bytes(
                b"diff --git a/src/auth/login.py b/src/auth/login.py\n"
                b"index 1111111..2222222 100644\n"
                b"--- a/src/auth/login.py\n"
                b"+++ b/src/auth/login.py\n"
                b"@@ -1,1 +1,2 @@\n"
                b" existing line\n"
                b"+# caf\xe9 comment\n"
            )
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
        self.assertEqual(result["reason"], "known-sensitive")
        self.assertTrue(result["security_recommended"])
        self.assertFalse(result["security_selected"])

    def test_unreadable_diff_artifact_prevents_security_selection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            changed_path = root / "changed-files.txt"
            changed_path.write_text("docs/guide.md\n", encoding="utf-8")
            missing_diff_path = root / "missing.diff"
            output = io.StringIO()
            with redirect_stdout(output), self.assertRaisesRegex(MODULE.ContextError, "readable captured artifacts"):
                MODULE.command_select_security(
                    SimpleNamespace(
                        changed_files=changed_path,
                        diff=missing_diff_path,
                        explicit_security=False,
                        tier=None,
                    )
                )
            self.assertEqual(output.getvalue(), "")

    def test_malformed_capture_cannot_waive_security(self):
        for files, diff in (("", "+change"), ("src/app.py\n", ""),
                            ("src/\x00app.py\n", "+change"), ("src/app.py\n", "+bad\x00text")):
            with self.subTest(files=files, diff=diff), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / "files").write_text(files, encoding="utf-8")
                (root / "diff").write_text(diff, encoding="utf-8")
                output = io.StringIO()
                with redirect_stdout(output), self.assertRaisesRegex(MODULE.ContextError, "consistent captured text"):
                    MODULE.command_select_security(SimpleNamespace(
                        changed_files=root / "files", diff=root / "diff", explicit_security=False, tier=None
                    ))
                self.assertEqual(output.getvalue(), "")

    def test_binary_file_does_not_blind_the_scan_to_sensitive_changes(self):
        changed_files = "assets/logo.png\nagents/security.md\n"
        diff = (
            "diff --git a/assets/logo.png b/assets/logo.png\n"
            "index 1111111..2222222 100644\n"
            "GIT binary patch\n"
            "literal 10\n"
            "Zc$xd0\n"
            "\n"
            "diff --git a/agents/security.md b/agents/security.md\n"
            "index 3333333..4444444 100644\n"
            "--- a/agents/security.md\n"
            "+++ b/agents/security.md\n"
            "@@ -1,1 +1,2 @@\n"
            " existing line\n"
            "+password = \"changeme\"\n"
        )
        reason = MODULE.classify_security_change(changed_files, diff)
        self.assertEqual(reason, "known-sensitive")
        self.assertFalse(MODULE.resolve_security_required(reason, []))

    def test_risk_reasons_recommend_but_only_explicit_triggers_select_the_lens(self):
        for reason in ("known-sensitive", "unmatched-executable"):
            with self.subTest(reason=reason):
                self.assertFalse(MODULE.resolve_security_required(reason, []))
                self.assertTrue(MODULE.resolve_security_required(reason, ["explicit"]))
        for reason in ("known-non-executable", "indeterminate"):
            with self.subTest(reason=reason):
                self.assertFalse(MODULE.resolve_security_required(reason, []))
                self.assertTrue(MODULE.resolve_security_required(reason, ["explicit"]))
                self.assertFalse(MODULE.resolve_security_required(reason, ["tier-4"]))

    def test_indeterminate_classification_alone_does_not_add_a_security_lens(self):
        producers = {
            "empty changed-file list": ("", "+something\n"),
            "empty diff": ("src/app.py\n", ""),
            "null byte in the changed-file list": ("src/\x00app.py\n", "+something\n"),
            "null byte in the diff": ("src/app.py\n", "+some\x00thing\n"),
        }
        for label, (changed_files, diff) in producers.items():
            with self.subTest(producer=label):
                reason = MODULE.classify_security_change(changed_files, diff)
                self.assertEqual(reason, "indeterminate")
                self.assertFalse(MODULE.resolve_security_required(reason, []))

    def test_an_unknown_future_reason_cannot_silently_waive_security(self):
        with self.assertRaisesRegex(MODULE.ContextError, "unknown security classification"):
            MODULE.resolve_security_required("some-reason-added-later", [])

    def test_binary_marker_in_readable_content_does_not_suppress_the_section(self):
        changed_files = "skills/review-pr/scripts/review_context.py\n"
        diff = (
            "diff --git a/skills/review-pr/scripts/review_context.py "
            "b/skills/review-pr/scripts/review_context.py\n"
            "index 1111111..2222222 100644\n"
            "--- a/skills/review-pr/scripts/review_context.py\n"
            "+++ b/skills/review-pr/scripts/review_context.py\n"
            "@@ -1,1 +1,2 @@\n"
            " existing line\n"
            '+if "GIT binary patch" not in section:\n'
            '+password = "changeme"\n'
        )
        reason = MODULE.classify_security_change(changed_files, diff)
        self.assertEqual(reason, "known-sensitive")
        self.assertFalse(MODULE.resolve_security_required(reason, []))

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

    def test_mergeability_drift_is_informational_and_preserves_identity(self):
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
        self.assertEqual(clean["context_hash"], conflicting["context_hash"])
        self.assertEqual(comparison["status"], "current")
        self.assertFalse(comparison["code_changed"])
        self.assertTrue(comparison["mergeability_changed"])
        rendered = MODULE.render_context(conflicting)
        self.assertIn("Mergeability: **conflicting**", rendered)
        self.assertIn("Raw mergeable: `CONFLICTING`", rendered)
        self.assertIn("Raw merge state: `DIRTY`", rendered)

    def test_repeated_head_drift_is_detected_across_a_capped_restart(self):
        approved = context()
        first_recapture = context(head_oid=NEW_HEAD_OID)
        second_recapture = context(head_oid=NEW_HEAD_OID)

        first = MODULE.compare_contexts(approved, first_recapture)
        second = MODULE.compare_contexts(approved, second_recapture)

        self.assertEqual(first["status"], "code-changed")
        self.assertEqual(second["status"], "code-changed")
        self.assertEqual(first["expected_head_oid"], second["expected_head_oid"])
        self.assertEqual(first["actual_head_oid"], second["actual_head_oid"])

    def test_compare_uses_reviewed_oids_when_saved_hashes_are_stale(self):
        approved = context()
        stale = dict(approved, head_oid=NEW_HEAD_OID)

        comparison = MODULE.compare_contexts(approved, stale)

        self.assertEqual(comparison["status"], "invalid-context")
        self.assertEqual(comparison["next_action"], "recover-context")
        self.assertFalse(comparison["technical_results_reusable"])
        self.assertTrue(comparison["context_integrity_changed"])
        self.assertEqual(comparison["changed_fields"], ["head_oid"])

    def test_compare_rejects_equal_inconsistent_saved_hashes(self):
        approved = context()
        corrupt = dict(approved, code_hash="stale-code-hash", technical_hash="stale-technical-hash")

        comparison = MODULE.compare_contexts(corrupt, corrupt)

        self.assertEqual(comparison["status"], "invalid-context")
        self.assertEqual(comparison["next_action"], "recover-context")
        self.assertTrue(comparison["context_integrity_changed"])
        self.assertFalse(comparison["technical_results_reusable"])

    def test_compare_rejects_equal_malformed_oids_even_with_fresh_hashes(self):
        malformed = context(base_oid="not-a-complete-git-oid")

        comparison = MODULE.compare_contexts(malformed, malformed)

        self.assertEqual(comparison["status"], "invalid-context")
        self.assertEqual(comparison["next_action"], "recover-context")
        self.assertTrue(comparison["context_integrity_changed"])
        self.assertFalse(comparison["technical_results_reusable"])

    def test_compare_distinguishes_code_and_conversation_changes(self):
        original = context()
        discussion = context(
            issue_comments=[
                {
                    "id": 1,
                    "author": "human",
                    "updated_at": "2026-01-01T00:00:00Z",
                    "body": "fixed",
                }
            ]
        )
        semantic_conversation = context(
            pr={"title": "Changed scope", "body": "New requirements"}
        )
        review_state = context(
            reviews=[
                {
                    "id": 2,
                    "author": "other-reviewer",
                    "state": "COMMENTED",
                    "submitted_at": "2026-01-01T00:00:00Z",
                    "commit_id": "head",
                    "body": "new review on the same code",
                }
            ]
        )
        moved = context(head_oid=NEW_HEAD_OID)

        self.assertEqual(
            MODULE.compare_contexts(original, original)["status"],
            "current",
        )
        self.assertEqual(
            MODULE.compare_contexts(original, semantic_conversation)["status"],
            "conversation-changed",
        )
        semantic_comparison = MODULE.compare_contexts(original, semantic_conversation)
        self.assertEqual(semantic_comparison["conversation_change_kind"], "semantic")
        self.assertEqual(semantic_comparison["next_action"], "reconcile-conversation")
        self.assertTrue(semantic_comparison["technical_results_reusable"])

        discussion_comparison = MODULE.compare_contexts(original, discussion)
        self.assertEqual(discussion_comparison["conversation_change_kind"], "review-state")
        self.assertEqual(discussion_comparison["next_action"], "reconcile-conversation")
        self.assertTrue(discussion_comparison["technical_results_reusable"])

        review_comparison = MODULE.compare_contexts(original, review_state)
        self.assertEqual(review_comparison["status"], "conversation-changed")
        self.assertEqual(review_comparison["conversation_change_kind"], "review-state")
        self.assertEqual(review_comparison["next_action"], "reconcile-conversation")
        self.assertTrue(review_comparison["technical_results_reusable"])
        self.assertEqual(original["technical_hash"], review_state["technical_hash"])
        self.assertNotEqual(original["conversation_hash"], review_state["conversation_hash"])
        self.assertEqual(
            MODULE.compare_contexts(original, moved)["status"],
            "code-changed",
        )
        self.assertEqual(
            MODULE.compare_contexts(original, moved)["next_action"],
            "reconcile-review",
        )
        self.assertTrue(MODULE.compare_contexts(original, moved)["technical_results_reusable"])
        edited_body = context(pr={"title": "Title", "body": "New requirements"})
        self.assertEqual(
            MODULE.compare_contexts(original, edited_body)["status"],
            "conversation-changed",
        )

    def test_compare_reuses_snapshot_results_for_version_base_and_commit_movement(self):
        original = context()
        movements = {
            "version bump": context(
                head_oid=NEW_HEAD_OID,
                commits=[{"oid": NEW_HEAD_OID, "subject": "chore: bump version"}],
            ),
            "base movement": context(base_oid="e" * 40),
            "commit movement": context(
                commits=[
                    {"oid": NEW_HEAD_OID, "subject": "fix: follow-up"},
                    {"oid": HEAD_OID, "subject": "fix: current"},
                ]
            ),
        }
        for label, current in movements.items():
            with self.subTest(movement=label):
                comparison = MODULE.compare_contexts(original, current)
                self.assertEqual(comparison["status"], "code-changed")
                self.assertEqual(comparison["next_action"], "reconcile-review")
                self.assertTrue(comparison["technical_results_reusable"])

    def test_compare_rejects_corrupt_hashes_and_changed_target(self):
        approved = context()
        corrupt_hashes = dict(approved, code_hash="bad", technical_hash="bad")
        corrupt_comparison = MODULE.compare_contexts(approved, corrupt_hashes)
        self.assertEqual(corrupt_comparison["status"], "invalid-context")
        self.assertEqual(corrupt_comparison["next_action"], "recover-context")
        self.assertTrue(corrupt_comparison["context_integrity_changed"])
        self.assertFalse(corrupt_comparison["technical_results_reusable"])

        other_target = context(
            repository="elsewhere/repo",
            pr={"number": 35, "title": "Title", "body": "Body"},
        )
        target_comparison = MODULE.compare_contexts(approved, other_target)
        self.assertEqual(target_comparison["status"], "invalid-context")
        self.assertEqual(target_comparison["next_action"], "recover-context")
        self.assertTrue(target_comparison["target_changed"])
        self.assertFalse(target_comparison["technical_results_reusable"])

    def test_compare_cli_returns_zero_for_valid_drift_and_twenty_for_invalid_context(self):
        with native_acl_temp_directory() as root:
            expected = root / "expected.json"
            actual = root / "actual.json"
            MODULE.write_json(expected, context())
            MODULE.write_json(actual, context(head_oid=NEW_HEAD_OID))
            valid = subprocess.run(
                [sys.executable, str(SCRIPT), "compare", "--expected", str(expected), "--actual", str(actual)],
                capture_output=True,
                text=True,
            )
            self.assertEqual(valid.returncode, 0, valid.stderr)
            self.assertEqual(json.loads(valid.stdout)["next_action"], "reconcile-review")

            MODULE.write_json(actual, context(base_oid="malformed"))
            invalid = subprocess.run(
                [sys.executable, str(SCRIPT), "compare", "--expected", str(expected), "--actual", str(actual)],
                capture_output=True,
                text=True,
            )
            self.assertEqual(invalid.returncode, 20, invalid.stderr)
            self.assertEqual(json.loads(invalid.stdout)["status"], "invalid-context")

    def test_compare_normalizes_legacy_combined_conversation_hash(self):
        current = context()
        legacy = dict(current)
        legacy.pop("technical_hash")
        legacy.pop("semantic_conversation_hash")
        legacy.pop("review_state_hash")
        legacy["conversation_hash"] = MODULE.stable_hash(
            {
                "pr_metadata": {
                    "title": legacy["pr"]["title"],
                    "body": legacy["pr"]["body"],
                },
                "issue_comments": legacy["issue_comments"],
                "review_comments": legacy["review_comments"],
                "review_threads": legacy["review_threads"],
                "reviews": legacy["reviews"],
            }
        )
        legacy["context_hash"] = MODULE.stable_hash(
            {
                "code_hash": legacy["code_hash"],
                "conversation_hash": legacy["conversation_hash"],
                "commits": legacy["commits"],
            }
        )

        comparison = MODULE.compare_contexts(legacy, current)

        self.assertEqual(comparison["status"], "current")
        self.assertFalse(comparison["conversation_changed"])
        self.assertEqual(comparison["conversation_change_kind"], "none")
        self.assertEqual(comparison["next_action"], "continue")

    def test_refresh_context_preserves_original_and_writes_latest_pair_for_conversation_change(self):
        with native_acl_temp_directory() as repo:
            run = MODULE.create_review_run(repo, 34)
            root = Path(run["artifact_root"])
            original = context()
            current = context(reviews=[{
                "id": 9,
                "author": "reviewer",
                "state": "COMMENTED",
                "submitted_at": "2026-01-01T00:00:00Z",
                "commit_id": "head",
                "body": "published while specialists were running",
            }])
            MODULE.write_json(root / "pr-review-context.json", original)
            (root / "pr-review-conversation.md").write_text("old\n", encoding="utf-8")
            (root / "pr-review-final.md").write_bytes(b"draft stays byte-identical\n")
            (root / "pr-review-inline.json").write_bytes(b"[{\"id\":1}]\n")
            (root / "pr-review-ledger.json").write_bytes(b"{\"ledger\":[1]}\n")
            canonical_context = (root / "pr-review-context.json").read_bytes()
            canonical_conversation = (root / "pr-review-conversation.md").read_bytes()
            preserved = {
                name: (root / name).read_bytes()
                for name in (
                    "pr-review-final.md",
                    "pr-review-inline.json",
                    "pr-review-ledger.json",
                )
            }

            def capture_current(**kwargs):
                MODULE.write_json(kwargs["output"], current)
                return current

            args = SimpleNamespace(
                repo_root=repo,
                repo="owner/repo",
                pr=34,
                artifact_root=root,
                owner_token=run["owner_token"],
            )
            output = io.StringIO()
            with patch.object(MODULE, "capture_to_path", side_effect=capture_current):
                with redirect_stdout(output):
                    code = MODULE.command_refresh_context(args)
            result = json.loads(output.getvalue())

            self.assertEqual(code, 0)
            self.assertEqual(result["next_action"], "reconcile-conversation")
            self.assertTrue(result["technical_results_reusable"])
            self.assertFalse(result["promoted"])
            self.assertEqual(Path(result["context"]), root / "pr-review-context.json")
            self.assertEqual(Path(result["conversation"]), root / "pr-review-conversation.md")
            self.assertEqual(Path(result["latest_context"]), root / "pr-review-latest-context.json")
            self.assertEqual(Path(result["latest_conversation"]), root / "pr-review-latest-conversation.md")
            self.assertEqual(
                MODULE.load_context(root / "pr-review-context.json")["context_hash"],
                original["context_hash"],
            )
            self.assertEqual((root / "pr-review-context.json").read_bytes(), canonical_context)
            self.assertEqual((root / "pr-review-conversation.md").read_bytes(), canonical_conversation)
            self.assertEqual(
                MODULE.load_context(root / "pr-review-latest-context.json")["context_hash"],
                current["context_hash"],
            )
            for name, expected in preserved.items():
                self.assertEqual((root / name).read_bytes(), expected)
            MODULE.cleanup_review_run(repo, root, run["owner_token"])

    def test_refresh_context_keeps_original_and_reusable_work_on_semantic_change(self):
        with native_acl_temp_directory() as repo:
            run = MODULE.create_review_run(repo, 34)
            root = Path(run["artifact_root"])
            original = context()
            current = context(pr={"title": "Changed scope", "body": "New requirements"})
            saved = seed_review_artifacts(root, original, original)
            preserved = {
                name: data for name, data in saved.items()
                if name not in {"pr-review-latest-context.json", "pr-review-latest-conversation.md"}
            }

            def capture_current(**kwargs):
                MODULE.write_json(kwargs["output"], current)
                return current

            with patch.object(MODULE, "capture_to_path", side_effect=capture_current):
                result = MODULE.refresh_review_context(
                    repo, "owner/repo", 34, root, run["owner_token"]
                )

            self.assertEqual(result["next_action"], "reconcile-conversation")
            self.assertTrue(result["technical_results_reusable"])
            self.assertFalse(result["promoted"])
            self.assertEqual(
                MODULE.load_context(root / "pr-review-context.json")["context_hash"],
                original["context_hash"],
            )
            self.assertEqual(
                MODULE.load_context(root / "pr-review-latest-context.json")["context_hash"],
                current["context_hash"],
            )
            for name, expected in preserved.items():
                self.assertEqual((root / name).read_bytes(), expected)
            MODULE.cleanup_review_run(repo, root, run["owner_token"])

    def test_refresh_legacy_context_derives_expected_technical_hash_and_preserves_original_files(self):
        with native_acl_temp_directory() as repo:
            run = MODULE.create_review_run(repo, 34)
            root = Path(run["artifact_root"])
            legacy = context()
            legacy.pop("technical_hash")
            current = context(head_oid=NEW_HEAD_OID)
            saved = seed_review_artifacts(root, legacy, legacy)
            preserved = {
                name: data for name, data in saved.items()
                if name not in {"pr-review-latest-context.json", "pr-review-latest-conversation.md"}
            }

            def capture_current(**kwargs):
                MODULE.write_json(kwargs["output"], current)
                return current

            with patch.object(MODULE, "capture_to_path", side_effect=capture_current):
                result = MODULE.refresh_review_context(
                    repo, "owner/repo", 34, root, run["owner_token"]
                )

            expected_technical_hash = MODULE.derived_technical_hash(
                legacy, MODULE.derived_code_hash(legacy)
            )
            self.assertEqual(result["expected_technical_hash"], expected_technical_hash)
            self.assertEqual(result["expected_context_hash"], legacy["context_hash"])
            self.assertEqual(result["technical_hash"], expected_technical_hash)
            self.assertEqual(result["actual_technical_hash"], current["technical_hash"])
            for name, expected in preserved.items():
                self.assertEqual((root / name).read_bytes(), expected)
            self.assertNotIn("technical_hash", MODULE.load_context(root / "pr-review-context.json"))
            MODULE.cleanup_review_run(repo, root, run["owner_token"])

    def test_refresh_context_repeats_code_drift_without_replacing_original_or_review_work(self):
        with native_acl_temp_directory() as repo:
            run = MODULE.create_review_run(repo, 34)
            root = Path(run["artifact_root"])
            original = context()
            first = context(
                head_oid=NEW_HEAD_OID,
                commits=[{"oid": NEW_HEAD_OID, "subject": "chore: bump version"}],
            )
            second = context(
                head_oid="f" * 40,
                commits=[{"oid": "f" * 40, "subject": "fix: follow-up"}],
            )
            saved = seed_review_artifacts(root, original, original)
            preserved = {
                name: data for name, data in saved.items()
                if name not in {"pr-review-latest-context.json", "pr-review-latest-conversation.md"}
            }
            for current in (first, second):
                def capture_current(**kwargs):
                    MODULE.write_json(kwargs["output"], current)
                    return current

                with patch.object(MODULE, "capture_to_path", side_effect=capture_current):
                    result = MODULE.refresh_review_context(
                        repo, "owner/repo", 34, root, run["owner_token"]
                    )
                self.assertEqual(result["status"], "code-changed")
                self.assertEqual(result["next_action"], "reconcile-review")
                self.assertTrue(result["technical_results_reusable"])
                self.assertFalse(result["promoted"])
                self.assertEqual(result["context_hash"], original["context_hash"])
                self.assertEqual(result["technical_hash"], original["technical_hash"])
                self.assertEqual(result["conversation_hash"], original["conversation_hash"])
                self.assertEqual(result["actual_context_hash"], current["context_hash"])
                self.assertEqual(result["actual_technical_hash"], current["technical_hash"])
                self.assertEqual(
                    MODULE.load_context(root / "pr-review-context.json")["context_hash"],
                    original["context_hash"],
                )
                self.assertEqual(
                    MODULE.load_context(root / "pr-review-latest-context.json")["context_hash"],
                    current["context_hash"],
                )
                for name, expected in preserved.items():
                    self.assertEqual((root / name).read_bytes(), expected)
            MODULE.cleanup_review_run(repo, root, run["owner_token"])

    def test_refresh_invalid_capture_does_not_promote_or_replace_any_review_artifact(self):
        with native_acl_temp_directory() as repo:
            original = context()
            invalid_contexts = {
                "changed target": context(
                    repository="elsewhere/repo",
                    pr={"number": 35, "title": "Title", "body": "Body"},
                ),
                "corrupt hash": dict(original, code_hash="corrupt", technical_hash="corrupt"),
                "malformed oid": context(base_oid="not-a-git-oid"),
            }
            for label, invalid in invalid_contexts.items():
                with self.subTest(invalidity=label):
                    run = MODULE.create_review_run(repo, 34)
                    root = Path(run["artifact_root"])
                    saved = seed_review_artifacts(root, original, context(head_oid=NEW_HEAD_OID))

                    def capture_invalid(**kwargs):
                        MODULE.write_json(kwargs["output"], invalid)
                        return invalid

                    args = SimpleNamespace(
                        repo_root=repo,
                        repo="owner/repo",
                        pr=34,
                        artifact_root=root,
                        owner_token=run["owner_token"],
                    )
                    output = io.StringIO()
                    with patch.object(MODULE, "capture_to_path", side_effect=capture_invalid):
                        with redirect_stdout(output):
                            code = MODULE.command_refresh_context(args)

                    self.assertEqual(code, 20)
                    result = json.loads(output.getvalue())
                    self.assertEqual(result["status"], "invalid-context")
                    self.assertEqual(result["next_action"], "recover-context")
                    self.assertFalse(result["technical_results_reusable"])
                    self.assertIsNone(result["latest_context"])
                    self.assertIsNone(result["latest_conversation"])
                    for name, expected in saved.items():
                        self.assertEqual((root / name).read_bytes(), expected)
                    MODULE.cleanup_review_run(repo, root, run["owner_token"])

    def test_refresh_captures_into_separate_snapshot_and_preserves_original_git_objects(self):
        with native_acl_temp_directory() as repo:
            run = MODULE.create_review_run(repo, 34)
            root = Path(run["artifact_root"])
            original = context()
            current = context(head_oid=NEW_HEAD_OID)
            seed_review_artifacts(root, original, original)
            snapshot = root / "pr-review-snapshot.git"
            old_object = snapshot / "objects" / "pack" / "base-before-force-push.pack"
            old_object.parent.mkdir(parents=True)
            old_object.write_bytes(b"captured base object")
            capture_targets = []

            def capture_current(**kwargs):
                target = Path(kwargs["snapshot_dir"])
                capture_targets.append(target)
                target.mkdir(parents=True, exist_ok=True)
                (target / "written-by-refresh-capture").write_bytes(b"new snapshot data")
                MODULE.write_json(kwargs["output"], current)
                return current

            with patch.object(MODULE, "capture_to_path", side_effect=capture_current):
                MODULE.refresh_review_context(
                    repo, "owner/repo", 34, root, run["owner_token"]
                )

            self.assertEqual(old_object.read_bytes(), b"captured base object")
            self.assertFalse((snapshot / "written-by-refresh-capture").exists())
            self.assertEqual(len(capture_targets), 1)
            self.assertNotEqual(capture_targets[0], snapshot)
            MODULE.cleanup_review_run(repo, root, run["owner_token"])

    def test_refresh_uses_a_unique_snapshot_per_attempt_and_records_latest_association(self):
        with native_acl_temp_directory() as repo:
            run = MODULE.create_review_run(repo, 34)
            root = Path(run["artifact_root"])
            original = context()
            initial_snapshot = root / "pr-review-latest-snapshot-initial.git"
            write_snapshot_markers(initial_snapshot, "initial")
            initial_latest = context(snapshot_dir=str(initial_snapshot))
            saved = seed_review_artifacts(root, original, initial_latest)
            preserved = {
                name: data for name, data in saved.items()
                if name not in {"pr-review-latest-context.json", "pr-review-latest-conversation.md"}
            }
            initial_snapshot_bytes = snapshot_tree_bytes(initial_snapshot)
            capture_targets = []

            def capture(current, marker):
                def capture_current(**kwargs):
                    target = Path(kwargs["snapshot_dir"])
                    capture_targets.append(target)
                    write_snapshot_markers(target, marker)
                    MODULE.write_json(kwargs["output"], current)
                    return current

                with patch.object(MODULE, "capture_to_path", side_effect=capture_current):
                    return MODULE.refresh_review_context(
                        repo, "owner/repo", 34, root, run["owner_token"]
                    )

            first_context = context(head_oid=NEW_HEAD_OID)
            first_result = capture(first_context, "first")
            first_snapshot = Path(first_result.get("latest_snapshot") or capture_targets[0])
            first_snapshot_bytes = snapshot_tree_bytes(first_snapshot)
            second_context = context(head_oid="f" * 40)
            second_result = capture(second_context, "second")
            second_snapshot = Path(second_result.get("latest_snapshot") or capture_targets[1])

            self.assertNotEqual(capture_targets[0], capture_targets[1])
            self.assertEqual(first_result.get("latest_snapshot"), str(first_snapshot))
            self.assertEqual(second_result.get("latest_snapshot"), str(second_snapshot))
            self.assertNotEqual(first_snapshot, second_snapshot)
            self.assertEqual(snapshot_tree_bytes(initial_snapshot), initial_snapshot_bytes)
            self.assertEqual(snapshot_tree_bytes(first_snapshot), first_snapshot_bytes)
            self.assertEqual(
                MODULE.load_context(root / "pr-review-latest-context.json")["snapshot_dir"],
                str(second_snapshot),
            )
            self.assertEqual(
                MODULE.load_context(root / "pr-review-latest-context.json")["context_hash"],
                second_context["context_hash"],
            )
            for name, expected in preserved.items():
                self.assertEqual((root / name).read_bytes(), expected)
            MODULE.cleanup_review_run(repo, root, run["owner_token"])
            self.assertFalse(first_snapshot.exists())

    def test_failed_or_invalid_refresh_keeps_latest_pair_and_previous_snapshot_unchanged(self):
        with native_acl_temp_directory() as repo:
            run = MODULE.create_review_run(repo, 34)
            root = Path(run["artifact_root"])
            original = context()
            initial_snapshot = root / "pr-review-latest-snapshot-initial.git"
            write_snapshot_markers(initial_snapshot, "initial")
            initial_latest = context(snapshot_dir=str(initial_snapshot))
            seed_review_artifacts(root, original, initial_latest)
            capture_targets = []

            def capture_snapshot(current, marker, fail_capture=False):
                def capture_current(**kwargs):
                    target = Path(kwargs["snapshot_dir"])
                    capture_targets.append(target)
                    write_snapshot_markers(target, marker)
                    if fail_capture:
                        raise MODULE.ContextError("injected capture failure")
                    MODULE.write_json(kwargs["output"], current)
                    return current

                return capture_current

            successful = context(head_oid=NEW_HEAD_OID)
            with patch.object(
                MODULE, "capture_to_path", side_effect=capture_snapshot(successful, "success")
            ):
                result = MODULE.refresh_review_context(
                    repo, "owner/repo", 34, root, run["owner_token"]
                )
            previous_snapshot = Path(result["latest_snapshot"])
            previous_snapshot_bytes = snapshot_tree_bytes(previous_snapshot)
            latest_pair_names = (
                "pr-review-latest-context.json",
                "pr-review-latest-conversation.md",
            )
            previous_latest_pair = {
                name: (root / name).read_bytes() for name in latest_pair_names
            }

            attempts = (
                ("capture failure", successful, True, False),
                ("invalid identity", context(repository="other/repo"), False, False),
                ("promotion failure", context(head_oid="f" * 40), False, True),
            )
            for marker, attempted_context, fail_capture, fail_promotion in attempts:
                with self.subTest(attempt=marker):
                    capture_current = capture_snapshot(
                        attempted_context, marker.replace(" ", "-"), fail_capture
                    )
                    promote = MODULE.promote_artifact
                    calls = 0

                    def fail_second_promotion(*args, **kwargs):
                        nonlocal calls
                        calls += 1
                        if calls == 2:
                            raise MODULE.ContextError("injected promotion failure")
                        return promote(*args, **kwargs)

                    with patch.object(MODULE, "capture_to_path", side_effect=capture_current):
                        if fail_capture:
                            with self.assertRaisesRegex(MODULE.ContextError, "capture failure"):
                                MODULE.refresh_review_context(
                                    repo, "owner/repo", 34, root, run["owner_token"]
                                )
                        elif fail_promotion:
                            with patch.object(
                                MODULE, "promote_artifact", side_effect=fail_second_promotion
                            ):
                                with self.assertRaisesRegex(
                                    MODULE.ContextError, "promotion failure"
                                ):
                                    MODULE.refresh_review_context(
                                        repo, "owner/repo", 34, root, run["owner_token"]
                                    )
                        else:
                            invalid = MODULE.refresh_review_context(
                                repo, "owner/repo", 34, root, run["owner_token"]
                            )
                            self.assertEqual(invalid["next_action"], "recover-context")

                    self.assertNotEqual(capture_targets[-1], previous_snapshot)
                    self.assertEqual(snapshot_tree_bytes(previous_snapshot), previous_snapshot_bytes)
                    for name, expected in previous_latest_pair.items():
                        self.assertEqual((root / name).read_bytes(), expected)
            MODULE.cleanup_review_run(repo, root, run["owner_token"])

    def test_refresh_capture_failure_keeps_both_context_pairs_and_completed_review_artifacts(self):
        with native_acl_temp_directory() as repo:
            run = MODULE.create_review_run(repo, 34)
            root = Path(run["artifact_root"])
            original = context()
            previous_latest = context(head_oid=NEW_HEAD_OID)
            saved = seed_review_artifacts(root, original, previous_latest)

            with patch.object(
                MODULE, "capture_to_path", side_effect=MODULE.ContextError("capture failed")
            ):
                with self.assertRaisesRegex(MODULE.ContextError, "capture failed"):
                    MODULE.refresh_review_context(
                        repo, "owner/repo", 34, root, run["owner_token"]
                    )

            for name, expected in saved.items():
                self.assertEqual((root / name).read_bytes(), expected)
            MODULE.cleanup_review_run(repo, root, run["owner_token"])

    def test_refresh_context_rolls_back_pair_when_second_promotion_fails(self):
        with native_acl_temp_directory() as repo:
            run = MODULE.create_review_run(repo, 34)
            root = Path(run["artifact_root"])
            original = context()
            current = context(reviews=[{
                "id": 10,
                "author": "reviewer",
                "state": "COMMENTED",
                "submitted_at": "2026-01-01T00:00:00Z",
                "commit_id": "head",
                "body": "arrived during review",
            }])
            saved = seed_review_artifacts(root, original, context(head_oid=NEW_HEAD_OID))

            def capture_current(**kwargs):
                MODULE.write_json(kwargs["output"], current)
                return current

            real_promote = MODULE.promote_artifact
            calls = 0

            def fail_second_promotion(*args, **kwargs):
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise MODULE.ContextError("injected second promotion failure")
                return real_promote(*args, **kwargs)

            with patch.object(MODULE, "capture_to_path", side_effect=capture_current):
                with patch.object(
                    MODULE,
                    "promote_artifact",
                    side_effect=fail_second_promotion,
                ):
                    with self.assertRaisesRegex(
                        MODULE.ContextError, "injected second promotion failure"
                    ):
                        MODULE.refresh_review_context(
                            repo, "owner/repo", 34, root, run["owner_token"]
                        )

            for name, expected in saved.items():
                self.assertEqual((root / name).read_bytes(), expected)
            MODULE.cleanup_review_run(repo, root, run["owner_token"])

    def test_first_refresh_rolls_back_partial_latest_pair_when_second_promotion_fails(self):
        with native_acl_temp_directory() as repo:
            run = MODULE.create_review_run(repo, 34)
            root = Path(run["artifact_root"])
            original = context()
            current = context(head_oid=NEW_HEAD_OID)
            saved = seed_review_artifacts(root, original)

            def capture_current(**kwargs):
                MODULE.write_json(kwargs["output"], current)
                return current

            real_promote = MODULE.promote_artifact
            calls = 0

            def fail_second_promotion(*args, **kwargs):
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise MODULE.ContextError("injected second promotion failure")
                return real_promote(*args, **kwargs)

            with patch.object(MODULE, "capture_to_path", side_effect=capture_current):
                with patch.object(MODULE, "promote_artifact", side_effect=fail_second_promotion):
                    with self.assertRaisesRegex(
                        MODULE.ContextError, "injected second promotion failure"
                    ):
                        MODULE.refresh_review_context(
                            repo, "owner/repo", 34, root, run["owner_token"]
                        )

            self.assertFalse((root / "pr-review-latest-context.json").exists())
            self.assertFalse((root / "pr-review-latest-conversation.md").exists())
            for name, expected in saved.items():
                self.assertEqual((root / name).read_bytes(), expected)
            MODULE.cleanup_review_run(repo, root, run["owner_token"])

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
            self.assertEqual(MODULE.load_context(path)["head_oid"], HEAD_OID)
            path.write_text('{"schema_version": 999}', encoding="utf-8")
            with self.assertRaises(MODULE.ContextError):
                MODULE.load_context(path)


if __name__ == "__main__":
    unittest.main()
