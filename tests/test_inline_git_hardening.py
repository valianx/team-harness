#!/usr/bin/env python3
"""Executable behaviour of the hardened immutable Git environment used for inline review.

Builds a real repository and runs git under the exact hardened prefix, asserting what the
environment does rather than what any document says about it. Rescued from the retired
prose-assertion suite, which asserted the argv templates as literal strings in Markdown.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

FAILURES: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        FAILURES.append(message)


def check_inline_git_hardening() -> None:
    """Hardened Git resolves exact immutable IDs and refuses injected revisions."""
    with tempfile.TemporaryDirectory() as temporary:
        repo = Path(temporary)
        immutable_env = {
            **os.environ,
            "GIT_OPTIONAL_LOCKS": "0",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_COUNT": "0",
            "GIT_NO_LAZY_FETCH": "1",
            "GIT_ALLOW_PROTOCOL": "",
        }
        immutable_prefix = (
            "git", "--no-pager", "--no-replace-objects", "--literal-pathspecs",
            "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false",
            "-c", "maintenance.auto=false", "-c", "gc.auto=0",
            "-c", "log.showSignature=false", "-C", str(repo),
        )

        def git(*args: str) -> str:
            result = subprocess.run(
                ("git", *args), cwd=repo, check=True, text=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            return result.stdout

        def immutable(*args: str) -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                (*immutable_prefix, *args), text=True, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, check=False, env=immutable_env,
            )

        def resolved_endpoint(revision: str) -> str | None:
            """Executable model of Main's exact single-endpoint resolver."""
            if not revision or revision.startswith("-") or ".." in revision:
                return None
            if any(ord(character) < 32 or ord(character) == 127 for character in revision):
                return None
            result = immutable("rev-parse", "--verify", "--end-of-options", f"{revision}^{{commit}}")
            if result.returncode or not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", result.stdout.rstrip("\n")):
                return None
            if result.stdout.count("\n") != 1 or not result.stdout.endswith("\n"):
                return None
            return result.stdout[:-1]

        def resolved_tree(commit_oid: str) -> str | None:
            if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", commit_oid):
                return None
            result = immutable("rev-parse", "--verify", "--end-of-options", f"{commit_oid}^{{tree}}")
            if result.returncode or result.stdout.count("\n") != 1 or not result.stdout.endswith("\n"):
                return None
            return result.stdout[:-1] if re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", result.stdout[:-1]) else None

        def clean() -> bool:
            result = immutable("status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none")
            return result.returncode == 0 and result.stdout == ""

        git("init", "-q")
        git("config", "user.email", "inline@example.invalid")
        git("config", "user.name", "Inline Test")
        (repo / "normal.txt").write_text("normal\n")
        (repo / ":(glob)*.txt").write_text("literal\n")
        git("add", "--all")
        git("commit", "-qm", "first")
        first = git("rev-parse", "HEAD").strip()
        first_tree = git("rev-parse", f"{first}^{{tree}}").strip()
        require(clean(), "clean immutable inline target was rejected")
        require(resolved_endpoint("HEAD") == first, "exact endpoint resolver did not return HEAD commit ID")
        require(resolved_tree(first) == first_tree, "exact endpoint resolver did not bind HEAD tree ID")
        for injection in ("--all", "--show-toplevel", "--revs-only", "HEAD..HEAD", "HEAD\nHEAD"):
            require(resolved_endpoint(injection) is None, f"injected endpoint was accepted: {injection!r}")
        require(resolved_tree(f"{first}\n{first}") is None, "multi-output tree binding was accepted")
        (repo / "dirty.txt").write_text("uncommitted\n")
        require(not clean(), "dirty worktree was accepted as immutable inline target")
        (repo / "dirty.txt").unlink()
        require(clean(), "clean status did not recover after test cleanup")
        (repo / "normal.txt").write_text("replacement\n")
        git("commit", "-am", "second", "-q")
        second = git("rev-parse", "HEAD").strip()
        git("replace", first, second)

        hardened_tree = immutable("rev-parse", f"{first}^{{tree}}").stdout.strip()
        require(hardened_tree == first_tree, "replace ref altered hardened revision binding")
        literal = immutable("show", "--no-ext-diff", "--no-textconv", first, "--", ":(glob)*.txt").stdout
        require("+literal" in literal and "+normal" not in literal, "pathspec magic was not treated literally")

        marker = repo / ".git" / "gpg-program-ran"
        gpg_program = repo / ".git" / "hostile-gpg-program"
        gpg_program.write_text(f"#!/bin/sh\nprintf invoked > {marker}\nexit 1\n")
        os.chmod(gpg_program, 0o755)
        signed_content = (
            f"tree {first_tree}\n"
            "author Inline Test <inline@example.invalid> 0 +0000\n"
            "committer Inline Test <inline@example.invalid> 0 +0000\n"
            "gpgsig -----BEGIN PGP SIGNATURE-----\n"
            " invalid test signature\n"
            " -----END PGP SIGNATURE-----\n\n"
            "synthetic signed commit\n"
        )
        signed = subprocess.run(
            ("git", "hash-object", "-t", "commit", "-w", "--stdin"), cwd=repo,
            input=signed_content, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
        ).stdout.strip()
        git("update-ref", "refs/heads/signed", signed)
        git("config", "log.showSignature", "true")
        git("config", "gpg.program", str(gpg_program))
        subprocess.run(("git", "log", "-1", "signed"), cwd=repo, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        require(marker.exists(), "hostile local log.showSignature did not exercise gpg.program regression")
        marker.unlink()
        hardened_log = immutable("log", "-1", signed)
        require(hardened_log.returncode == 0 and not marker.exists(), "hardened log executed hostile gpg.program")

        fsmonitor_marker = repo / ".git" / "fsmonitor-ran"
        fsmonitor = repo / ".git" / "hostile-fsmonitor"
        fsmonitor.write_text(f"#!/bin/sh\nprintf invoked > {fsmonitor_marker}\nexit 0\n")
        os.chmod(fsmonitor, 0o755)
        git("config", "core.fsmonitor", str(fsmonitor))
        git("status", "--porcelain")
        require(fsmonitor_marker.exists(), "fixture did not exercise configured fsmonitor")
        fsmonitor_marker.unlink()
        index = repo / ".git" / "index"
        index_before = index.stat()
        require(clean(), "hardened clean status rejected clean fsmonitor fixture")
        index_after = index.stat()
        require(not fsmonitor_marker.exists(), "hardened status executed configured fsmonitor")
        require(
            (index_before.st_mtime_ns, index_before.st_size) == (index_after.st_mtime_ns, index_after.st_size),
            "hardened status refreshed the index",
        )
        require(not (repo / ".git" / "index.lock").exists(), "hardened status left an index lock")

        bound_blob = git("rev-parse", f"{first}:normal.txt").strip()
        require(immutable("cat-file", "-e", f"{bound_blob}^{{blob}}").returncode == 0, "bound blob preflight failed")
        original_bytes = immutable("cat-file", "blob", bound_blob).stdout
        (repo / "normal.txt").write_text("attacker edit\n")
        require(immutable("cat-file", "blob", bound_blob).stdout == original_bytes, "mutable worktree edit changed bound blob evidence")
        (repo / "normal.txt").write_text("replacement\n")
        require(clean(), "worktree restore did not return fixture to clean state")
        require(immutable("cat-file", "blob", bound_blob).stdout == original_bytes, "read/restore changed bound blob evidence")

        origin = Path(temporary) / "origin.git"
        source = Path(temporary) / "source"
        partial = Path(temporary) / "partial"
        subprocess.run(("git", "init", "--bare", "-q", str(origin)), check=True)
        subprocess.run(("git", "init", "-q", str(source)), check=True)
        subprocess.run(("git", "-C", str(source), "config", "user.email", "inline@example.invalid"), check=True)
        subprocess.run(("git", "-C", str(source), "config", "user.name", "Inline Test"), check=True)
        (source / "promisor.txt").write_text("promisor-only\n")
        subprocess.run(("git", "-C", str(source), "add", "promisor.txt"), check=True)
        subprocess.run(("git", "-C", str(source), "commit", "-qm", "promisor"), check=True)
        subprocess.run(("git", "-C", str(source), "remote", "add", "origin", str(origin)), check=True)
        subprocess.run(("git", "-C", str(source), "push", "-q", "origin", "HEAD"), check=True)
        subprocess.run(("git", "-C", str(origin), "config", "uploadpack.allowFilter", "true"), check=True)
        subprocess.run(("git", "clone", "-q", "--no-checkout", "--no-local", "--filter=blob:none", str(origin), str(partial)), check=True)
        promisor_blob = subprocess.run(
            ("git", "-C", str(partial), "rev-parse", "HEAD:promisor.txt"), text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
        ).stdout.strip()
        partial_env = {**immutable_env, "GIT_DIR": str(partial / ".git"), "GIT_WORK_TREE": str(partial)}
        objects = partial / ".git" / "objects"
        object_state = sorted((path.relative_to(objects), path.read_bytes()) for path in objects.rglob("*") if path.is_file())
        missing = subprocess.run(
            (*immutable_prefix[:-1], str(partial), "cat-file", "-e", f"{promisor_blob}^{{blob}}"),
            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, env=partial_env,
        )
        object_state_after = sorted((path.relative_to(objects), path.read_bytes()) for path in objects.rglob("*") if path.is_file())
        require(missing.returncode != 0, "hardened promisor preflight fetched a missing blob")
        require(object_state == object_state_after, "hardened promisor preflight mutated the object database")

    for invalid in ("/absolute", "../traversal", "dir/../traversal", "bad\x00path", "bad\npath"):
        absolute = invalid.startswith("/")
        traversal = any(part == ".." for part in invalid.split("/"))
        control = any(ord(character) < 32 or ord(character) == 127 for character in invalid)
        require(absolute or traversal or control, f"invalid path escaped validation: {invalid!r}")

    def consolidate(required: list[tuple[str, str, str, str]], returns: list[dict[str, object]]) -> tuple[bool, dict[tuple[str, str, str, str], str]]:
        """Executable contract model for Main's one-result keyed consolidation."""
        slots = {slot: "missing" for slot in required}
        trusted = True
        for returned in returns:
            slot = (returned["lens"], returned["dispatch_id"], returned["target_id"], returned["coordinates"])
            if slot not in slots or returned["expected_lens"] != returned["lens"]:
                trusted = False
                continue
            if slots[slot] != "missing":
                slots[slot] = "untrusted"
                continue
            if returned["lens_status"] != "complete" or returned["verdict"] != "pass" or returned["blocker"] or returned["blocking_disagreement"]:
                slots[slot] = "non-pass"
            else:
                slots[slot] = "pass"
        return trusted and all(value == "pass" for value in slots.values()), slots

    tester_slot = ("tester", "attempt-t", "target", "base..head")
    qa_slot = ("qa", "attempt-q", "target", "base..head")
    passing_tester = {"lens": "tester", "expected_lens": "tester", "dispatch_id": "attempt-t", "target_id": "target", "coordinates": "base..head", "lens_status": "complete", "verdict": "pass", "blocker": False, "blocking_disagreement": False}
    passing_qa = {**passing_tester, "lens": "qa", "expected_lens": "qa", "dispatch_id": "attempt-q"}
    passed, slots = consolidate([tester_slot, qa_slot], [passing_tester, passing_qa])
    require(passed and set(slots.values()) == {"pass"}, "valid distinct lens returns did not pass keyed consolidation")
    matrix = {
        "missing": [passing_tester],
        "failed": [{**passing_tester, "lens_status": "failed"}, passing_qa],
        "blocker": [{**passing_tester, "blocker": True}, passing_qa],
        "replay": [passing_tester, passing_qa, {**passing_tester, "dispatch_id": "old-attempt"}],
        "duplicate": [passing_tester, passing_tester, passing_qa],
        "substitution": [{**passing_tester, "lens": "qa"}, passing_qa],
    }
    for outcome, returns in matrix.items():
        passed, _ = consolidate([tester_slot, qa_slot], returns)
        require(not passed, f"{outcome} return incorrectly produced global PASS")



def main() -> int:
    check_inline_git_hardening()
    if FAILURES:
        for failure in FAILURES:
            print(f"inline git hardening: FAIL: {failure}", file=sys.stderr)
        return 1
    print("inline git hardening: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
