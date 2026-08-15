#!/usr/bin/env python3
"""Cross-runtime tests for Team Harness GitHub identity routing."""

from __future__ import annotations

import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / "skills/setup/scripts/manage_github_identities.py"
COPIES = (
    ROOT / "plugins/team-harness/skills/setup/scripts/manage_github_identities.py",
    ROOT / "installer-assets/opencode-skills/setup/scripts/manage_github_identities.py",
)


def run(helper: Path, env: dict[str, str], runtime: str, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(helper), "--runtime", runtime, *args],
        text=True,
        capture_output=True,
        env=env,
        check=False,
    )


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def config_path(runtime: str, home: Path, codex: Path, opencode: Path) -> Path:
    if runtime == "claude":
        return home / ".claude/.team-harness.json"
    if runtime == "codex":
        return codex / ".team-harness.json"
    return opencode / ".team-harness.json"


def main() -> int:
    canonical_bytes = CANONICAL.read_bytes()
    for helper in (CANONICAL, *COPIES):
        require(stat.S_IMODE(helper.stat().st_mode) == 0o755, f"helper mode drifted: {helper}")
    for copy in COPIES:
        require(copy.read_bytes() == canonical_bytes, f"generated helper content drifted: {copy}")

    with tempfile.TemporaryDirectory() as raw_temp:
        temp = Path(raw_temp)
        home = temp / "home"
        codex = temp / "codex"
        opencode = temp / "opencode"
        home.mkdir()
        workspace = temp / "workspaces"
        nested_workspace = workspace / "private"
        repo = workspace / "service"
        nested_repo = nested_workspace / "service"
        unrelated_repo = temp / "elsewhere/service"
        for path in (workspace, nested_workspace, repo, nested_repo, unrelated_repo):
            path.mkdir(parents=True, exist_ok=True)
        isolated = temp / "credentials/account-b"
        isolated.mkdir(parents=True, mode=0o700)
        isolated.chmod(0o700)
        hosts = isolated / "hosts.yml"
        hosts.write_text("github.com:\n", encoding="utf-8")
        hosts.chmod(0o600)
        routes = [
            {
                "workspace": str(workspace),
                "host": "github.com",
                "account": "account_a",
            },
            {
                "workspace": str(nested_workspace),
                "host": "github.com",
                "account": "account-b",
                "config_dir": str(isolated),
            },
        ]
        env = {
            **os.environ,
            "HOME": str(home),
            "CODEX_HOME": str(codex),
            "OPENCODE_CONFIG_DIR": str(opencode),
        }

        for runtime in ("claude", "codex", "opencode"):
            target = config_path(runtime, home, codex, opencode)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps({"opaque": {"preserve": True}}), encoding="utf-8")
            target.chmod(0o600)

            configured = run(
                CANONICAL,
                env,
                runtime,
                "configure",
                "--routes-json",
                json.dumps(routes),
            )
            require(configured.returncode == 0, configured.stderr)
            require(json.loads(configured.stdout)["routeCount"] == 2, "route count mismatch")
            document = json.loads(target.read_text(encoding="utf-8"))
            require(document["opaque"]["preserve"] is True, f"{runtime} clobbered opaque config")
            require(stat.S_IMODE(target.stat().st_mode) == 0o600, f"{runtime} config mode is not 0600")

            parent_match = run(
                CANONICAL,
                env,
                runtime,
                "resolve",
                "--repo-root",
                str(repo),
            )
            require(parent_match.returncode == 0, parent_match.stderr)
            parent_result = json.loads(parent_match.stdout)
            require(parent_result["account"] == "account_a", "parent route selected wrong account")
            require(parent_result["strategy"] == "account-switch", "parent route selected wrong strategy")

            nested_match = run(
                CANONICAL,
                env,
                runtime,
                "resolve",
                "--repo-root",
                str(nested_repo),
            )
            require(nested_match.returncode == 0, nested_match.stderr)
            nested_result = json.loads(nested_match.stdout)
            require(nested_result["account"] == "account-b", "longest prefix did not win")
            require(nested_result["strategy"] == "isolated-config", "isolated route not selected")
            require(nested_result["configDir"] == str(isolated), "isolated config path drifted")

            no_match = run(
                CANONICAL,
                env,
                runtime,
                "resolve",
                "--repo-root",
                str(unrelated_repo),
            )
            require(no_match.returncode == 0, no_match.stderr)
            require(json.loads(no_match.stdout)["status"] == "no-match", "unexpected fallback match")

            before_mtime = target.stat().st_mtime_ns
            repeated = run(
                CANONICAL,
                env,
                runtime,
                "configure",
                "--routes-json",
                json.dumps(routes),
            )
            require(repeated.returncode == 0, repeated.stderr)
            require(json.loads(repeated.stdout)["changed"] is False, "repeat configure is not a no-op")
            require(target.stat().st_mtime_ns == before_mtime, "repeat configure rewrote config")

        invalid_cases = (
            [{"workspace": str(workspace), "account": "account-a", "extra": "reject"}],
            [{"workspace": str(workspace), "account": "account-a", "config_dir": "ghp_secret"}],
            [{"workspace": str(workspace), "account": "account-"}],
            [{"workspace": str(workspace), "account": "account--a"}],
            [{"workspace": str(workspace), "account": "a" * 40}],
            [
                {"workspace": str(workspace), "account": "account-a"},
                {"workspace": str(workspace), "account": "account-b"},
            ],
            [{"workspace": "/", "account": "account-a"}],
        )
        for invalid in invalid_cases:
            result = run(
                CANONICAL,
                env,
                "codex",
                "configure",
                "--routes-json",
                json.dumps(invalid),
            )
            require(result.returncode != 0, f"accepted invalid routes: {invalid}")
            require("ghp_secret" not in result.stdout + result.stderr, "secret-shaped input was echoed")

    print("github-identity-routes: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
