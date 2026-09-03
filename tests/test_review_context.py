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
SKILL = ROOT / "skills" / "review-pr" / "SKILL.md"
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

    def test_review_snapshot_lifecycle_outlives_exec_yields(self):
        contract = SKILL.read_text(encoding="utf-8")
        self.assertNotIn("Register the EXIT trap", contract)
        self.assertNotRegex(contract, r"(?m)^\s*trap\b.*\bEXIT\b")
        self.assertIn("MUST outlive every specialist dispatch", contract)
        self.assertIn("whether any one yield exceeds 30 seconds", contract)
        self.assertIn("only after every dispatched reviewer has", contract)
        self.assertLess(
            contract.index("MUST outlive every specialist dispatch"),
            contract.index("Run `cleanup-run` explicitly from the coordinator only after"),
        )

    def test_reviewer_contracts_preserve_deleted_symlink_and_optional_workspace_rules(self):
        ref = (ROOT / "agents" / "ref-direct-modes.md").read_text(encoding="utf-8")
        self.assertIn("A deleted\nchanged-file path is evidence from `Diff Path` only", ref)

        for relative in (
            "agents/reviewer.md",
            "agents/pr-review-qa.md",
            "agents/pr-review-security.md",
        ):
            with self.subTest(relative=relative):
                contract = (ROOT / relative).read_text(encoding="utf-8")
                self.assertIn("non-symlink regular file", contract)
                self.assertRegex(contract, r"resolved\s+path remains inside")
                self.assertIn("deleted", contract)
                self.assertIn("head worktree", contract)

    def test_review_policy_defaults_and_parses_the_fenced_yaml_block(self):
        self.assertEqual(
            MODULE.read_review_policy(None),
            {"verification": "blocking-only", "max_suggestions": 5, "source": "default"},
        )
        with tempfile.TemporaryDirectory() as directory:
            policy = Path(directory) / "review-policy.md"
            policy.write_text(
                "# Policy\n\n```yaml\nverification: off  # repo owner call\nmax_suggestions: 3\n```\n",
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
            git("add", "README.md"); git("commit", "-q", "-m", "base without policy")
            no_policy = git("rev-parse", "HEAD")
            (repo / ".team-harness").mkdir()
            (repo / ".team-harness" / "review-policy.md").write_text("```yaml\nverification: all\nmax_suggestions: 2\n```\n", encoding="utf-8")
            git("add", ".team-harness"); git("commit", "-q", "-m", "owner policy")
            base = git("rev-parse", "HEAD")
            (repo / ".team-harness" / "review-policy.md").write_text("```yaml\nverification: off\n```\n", encoding="utf-8")
            git("add", ".team-harness"); git("commit", "-q", "-m", "pr turns verification off")
            snapshot = repo / ".git"
            self.assertEqual(MODULE.read_base_review_policy(snapshot, no_policy), {"verification": "blocking-only", "max_suggestions": 5, "source": "default"})
            self.assertEqual(MODULE.read_base_review_policy(snapshot, base), {"verification": "all", "max_suggestions": 2, "source": "base-commit"})
            with self.assertRaisesRegex(MODULE.ContextError, "full commit SHA"):
                MODULE.read_base_review_policy(snapshot, "HEAD")
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

    def test_apply_verification_confirms_demotes_and_drops(self):
        inline, verifier = self.verification_fixture()
        result = MODULE.apply_verification(inline, verifier, "blocking-only")
        self.assertEqual(result["coverage"], "verified 1/3")
        self.assertIsNone(result["forced_event"])
        bodies = [finding["body"] for finding in result["inline"]]
        self.assertEqual(len(bodies), 3)
        self.assertTrue(bodies[0].startswith("**Blocking: null deref**"))
        self.assertTrue(bodies[1].startswith("**Suggestion: (unverified) missing auth check**"))
        self.assertEqual(result["inline"][2], inline[3])
        self.assertEqual(
            [(entry["disposition"], entry["finding"]) for entry in result["ledger"]],
            [("demoted", "Blocking: missing auth check"), ("dropped", "Blocking: phantom race")],
        )
        self.assertTrue(all(entry["reason"].startswith("verifier — ") for entry in result["ledger"]))

    def test_apply_verification_never_adds_findings_and_handles_missing_results(self):
        inline, verifier = self.verification_fixture()
        verifier["findings"].append({"path": "src/new.ts", "line": 1, "side": "RIGHT", "status": "confirmed", "evidence": "x"})
        del verifier["findings"][0]
        result = MODULE.apply_verification(inline, verifier, "blocking-only")
        self.assertEqual(result["coverage"], "verified 0/3")
        self.assertEqual({finding["path"] for finding in result["inline"]}, {"src/a.ts", "src/b.ts", "src/d.ts"})
        self.assertEqual(result["ledger"][0]["reason"], "verifier — no verifier result")

    def test_apply_verification_absent_verifier_and_policy_off(self):
        inline, _ = self.verification_fixture()
        absent = MODULE.apply_verification(inline, None, "blocking-only")
        self.assertEqual(absent["coverage"], "verified 0/3 (verifier absent)")
        self.assertEqual(absent["forced_event"], "COMMENT")
        self.assertEqual(absent["inline"], inline)
        off = MODULE.apply_verification(inline, None, "off")
        self.assertEqual(off["coverage"], "verification off (policy)")
        self.assertIsNone(off["forced_event"])
        every = MODULE.apply_verification(inline, {"findings": []}, "all")
        self.assertEqual(every["coverage"], "verified 0/4")
        with self.assertRaisesRegex(MODULE.ContextError, "verifier status"):
            MODULE.apply_verification(inline, {"findings": [{"path": "a", "line": 1, "side": "RIGHT", "status": "maybe"}]}, "all")

    def test_apply_verification_rejects_duplicate_anchors_and_labels_unknown_bodies(self):
        inline, verifier = self.verification_fixture()
        verifier["findings"].append(dict(verifier["findings"][0], status="refuted", evidence="second opinion"))
        with self.assertRaisesRegex(MODULE.ContextError, "two statuses for src/a.ts:10 RIGHT"):
            MODULE.apply_verification(inline, verifier, "blocking-only")
        odd = [
            {"path": "src/e.ts", "line": 5, "side": "RIGHT", "body": "**blocking: lower case**\n\nEvidence."},
            {"path": "src/f.ts", "line": 6, "side": "RIGHT", "body": "Unlabelled claim.\n\nEvidence."},
            {"path": "src/g.ts", "line": 7, "side": "RIGHT", "body": "**suggestion: style**"},
        ]
        result = MODULE.apply_verification(odd, {"findings": []}, "blocking-only")
        self.assertEqual(result["coverage"], "verified 0/2")
        self.assertTrue(result["inline"][0]["body"].startswith("**Suggestion: (unverified) lower case**"))
        self.assertTrue(result["inline"][1]["body"].startswith("**Suggestion: (unverified)** Unlabelled claim."))
        self.assertEqual(result["inline"][2], odd[2])
        self.assertEqual(len(result["ledger"]), 2)

    def test_apply_verification_cli_writes_the_applied_inline_leaf(self):
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
            self.assertEqual(len(written), 3)
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
            (repo / ".gitignore").write_text("node_modules\n", encoding="utf-8")
            agents = repo / ".codex" / "agents"
            agents.mkdir(parents=True)
            for name in MODULE.REVIEW_AGENT_NAMES[:-1]:
                (agents / f"{name}.toml").write_text(
                    f"# Instruction source: runtime/codex/instructions/{name}.md\n"
                    f"# Semantic source: agents/{name}.md (sonnet/high)\n# Projection tier: x\n"
                    f'name = "{name}"\nsandbox_mode = "read-only"\n',
                    encoding="utf-8",
                )
            with patch.dict(os.environ, {"PATH": str(repo)}):
                result = MODULE.preflight(repo, "codex", None)
            self.assertFalse(result["ok"])
            self.assertEqual(result["gh"], "unavailable")
            self.assertEqual(result["workspaces_ignore"], "added")
            self.assertEqual(result["codex_agents"]["status"], "mixed")
            self.assertEqual(result["codex_agents"]["missing"], ["reviewer-consolidator"])
            self.assertIn("/workspaces/", (repo / ".gitignore").read_text(encoding="utf-8"))
            (agents / "reviewer-consolidator.toml").write_text('name = "reviewer-consolidator"\n', encoding="utf-8")
            with patch.dict(os.environ, {"PATH": str(repo)}):
                again = MODULE.preflight(repo, "codex", None)
            self.assertEqual(again["workspaces_ignore"], "present")
            self.assertEqual(again["codex_agents"]["invalid"], ["reviewer-consolidator"])
            with patch.dict(os.environ, {"PATH": str(repo)}):
                claude = MODULE.preflight(repo, "claude", None)
            self.assertIsNone(claude["codex_agents"])
            self.assertEqual(claude["blockers"], ["gh unavailable"])

    def test_snapshot_repo_avoids_writes_to_read_only_source_git_dir(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            remote = root / "remote.git"
            source = root / "source"
            producer = root / "producer"
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

            git("clone", "--quiet", "--branch", "main", str(remote), str(producer))
            git("config", "user.name", "Review Test", cwd=producer)
            git("config", "user.email", "review@example.test", cwd=producer)
            (producer / "file.txt").write_text("head\n", encoding="utf-8")
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
            self.assertEqual(git("rev-parse", "HEAD", cwd=worktree), head_oid)

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

    def test_security_selection_maps_reason_and_triggers(self):
        cases = [
            ("agents/security.md\n", "+permission boundary\n", "known-sensitive", True),
            ("docs/guide.md\n", "+clarify review behavior\n", "known-non-executable", False),
            ("config/app.json\n", '+{"flag": true}\n', "known-non-executable", False),
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
        self.assertTrue(result["security_required"])

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
        self.assertTrue(result["security_required"])

    def test_unreadable_diff_artifact_fails_closed_to_security_required(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            changed_path = root / "changed-files.txt"
            changed_path.write_text("docs/guide.md\n", encoding="utf-8")
            missing_diff_path = root / "missing.diff"
            output = io.StringIO()
            with redirect_stdout(output):
                MODULE.command_select_security(
                    SimpleNamespace(
                        changed_files=changed_path,
                        diff=missing_diff_path,
                        explicit_security=False,
                        tier=None,
                    )
                )
            result = json.loads(output.getvalue())
        self.assertEqual(result["reason"], "indeterminate")
        self.assertTrue(result["security_required"])

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
        self.assertTrue(MODULE.resolve_security_required(reason, []))

    def test_only_a_positive_benign_classification_waives_the_security_lens(self):
        """The property, not the inputs: every reason but one requires the lens."""
        waived = MODULE.REASONS_WAIVING_SECURITY
        self.assertEqual(waived, {"known-non-executable"})
        for reason in ("known-sensitive", "unmatched-executable", "indeterminate"):
            with self.subTest(reason=reason):
                self.assertTrue(MODULE.resolve_security_required(reason, []))
        self.assertFalse(MODULE.resolve_security_required("known-non-executable", []))

    def test_every_indeterminate_producer_requires_the_security_lens(self):
        """Each distinct way classification can fail must reach the same fail-closed answer."""
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
                self.assertTrue(MODULE.resolve_security_required(reason, []))

    def test_an_unknown_future_reason_requires_the_security_lens(self):
        """A reason nobody enumerated inherits the floor rather than escaping it."""
        self.assertTrue(MODULE.resolve_security_required("some-reason-added-later", []))

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
        self.assertTrue(MODULE.resolve_security_required(reason, []))

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
        first_recapture = context(head_oid="new-head")
        second_recapture = context(head_oid="new-head")

        first = MODULE.compare_contexts(approved, first_recapture)
        second = MODULE.compare_contexts(approved, second_recapture)

        self.assertEqual(first["status"], "code-changed")
        self.assertEqual(second["status"], "code-changed")
        self.assertEqual(first["expected_head_oid"], second["expected_head_oid"])
        self.assertEqual(first["actual_head_oid"], second["actual_head_oid"])

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
        moved = context(head_oid="new-head")

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
        self.assertEqual(semantic_comparison["next_action"], "restart-technical-review")
        self.assertFalse(semantic_comparison["technical_results_reusable"])

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
            "restart-technical-review",
        )
        edited_body = context(pr={"title": "Title", "body": "New requirements"})
        self.assertEqual(
            MODULE.compare_contexts(original, edited_body)["status"],
            "conversation-changed",
        )

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

    def test_refresh_context_promotes_review_state_without_rebuilding_technical_state(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
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

            def capture_current(**kwargs):
                MODULE.write_json(kwargs["output"], current)
                return current

            with patch.object(MODULE, "capture_to_path", side_effect=capture_current):
                result = MODULE.refresh_review_context(
                    repo, "owner/repo", 34, root, run["owner_token"]
                )

            self.assertEqual(result["next_action"], "reconcile-conversation")
            self.assertTrue(result["technical_results_reusable"])
            self.assertTrue(result["promoted"])
            self.assertEqual(
                MODULE.load_context(root / "pr-review-context.json")["context_hash"],
                current["context_hash"],
            )
            MODULE.cleanup_review_run(repo, root, run["owner_token"])

    def test_refresh_context_keeps_old_artifacts_when_semantic_context_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            run = MODULE.create_review_run(repo, 34)
            root = Path(run["artifact_root"])
            original = context()
            current = context(pr={"title": "Changed scope", "body": "New requirements"})
            MODULE.write_json(root / "pr-review-context.json", original)
            (root / "pr-review-conversation.md").write_text("old\n", encoding="utf-8")

            def capture_current(**kwargs):
                MODULE.write_json(kwargs["output"], current)
                return current

            with patch.object(MODULE, "capture_to_path", side_effect=capture_current):
                result = MODULE.refresh_review_context(
                    repo, "owner/repo", 34, root, run["owner_token"]
                )

            self.assertEqual(result["next_action"], "restart-technical-review")
            self.assertFalse(result["technical_results_reusable"])
            self.assertFalse(result["promoted"])
            self.assertEqual(
                MODULE.load_context(root / "pr-review-context.json")["context_hash"],
                original["context_hash"],
            )
            MODULE.cleanup_review_run(repo, root, run["owner_token"])

    def test_refresh_context_rolls_back_pair_when_second_promotion_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
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
            MODULE.write_json(root / "pr-review-context.json", original)
            conversation = root / "pr-review-conversation.md"
            conversation.write_text("old\n", encoding="utf-8")
            original_context = (root / "pr-review-context.json").read_bytes()
            original_conversation = conversation.read_bytes()

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

            self.assertEqual(
                (root / "pr-review-context.json").read_bytes(), original_context
            )
            self.assertEqual(conversation.read_bytes(), original_conversation)
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
            self.assertEqual(MODULE.load_context(path)["head_oid"], "head")
            path.write_text('{"schema_version": 999}', encoding="utf-8")
            with self.assertRaises(MODULE.ContextError):
                MODULE.load_context(path)


if __name__ == "__main__":
    unittest.main()
