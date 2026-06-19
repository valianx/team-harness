# Contributing

Develop against the source files in `agents/`, `skills/`, `hooks/` — **not `~/.claude/` directly**. After editing, re-run the installer to propagate.

## Working agreements (enforced)

See [`CLAUDE.md` §6](../CLAUDE.md) for the full set. The floor:

- Feature branch (`feat/<kebab>`, `fix/<kebab>`, `chore/<kebab>`, `docs/<kebab>`, `refactor/<kebab>`) — never commit on `main`.
- Conventional-commit messages.
- Never push to `main` directly — every change ships via pull request.
- Every user-facing change updates `CHANGELOG.md` under `[Unreleased]`.

## Testing local edits

> **Note for end-users:** The Go installer (`go run ./cmd/install` and the bootstrap scripts in `bin/`) is the legacy install path as of v2.33.0. End-users install via the Claude Code plugin (`/plugin install th`). The Go installer remains the propagation tool for contributors editing agents, skills, or hooks locally.

Use `go run ./cmd/install` from the repo root. The `//go:embed` directive snapshots your working-tree `agents/`, `skills/`, `hooks/` at compile time, so the install reflects your edits exactly.

The bootstrap scripts (`./bin/install.sh` / `.\bin\install.ps1`) always download the released binary — they don't use your local clone.

## Running tests

```bash
bash tests/run-all.sh
```

Three suites cover what's testable without a live LLM: hook policy gate (functional), agent + skill + hook structural integrity, and agent YAML frontmatter parseability. Prompt behaviour requires a live pipeline to validate.

## Verifying gh-fallback paths locally

To smoke-test the graceful degradation introduced in v2.10.0 without needing to actually uninstall `gh`:

1. Set `has_gh=false` in your test by temporarily running with a dummy `GH_TOKEN` and no `gh` auth (e.g., `GH_TOKEN="" gh auth logout --hostname github.com` in a scratch env).
2. In a Claude Code session, run `/issue #N` for a real issue number on a public GitHub repo — the skill should fetch the issue via the `curl` Tier A fallback and report "gh CLI unavailable. Fetched issue #N via the GitHub REST API instead."
3. For Tier B write paths, run `/deliver` on a feature branch — if `GH_TOKEN` is set, it should attempt a curl PR creation; if not, it should emit the compare URL and a body file, then report `blocked-manual-push`.
4. For Tier D (project board), verify the orchestrator logs "Project board update skipped — gh CLI unavailable" rather than erroring out.

This is a manual smoke test — the automated test suite (`tests/test_agent_structure.py`) only verifies the static cross-references are present.

## Agent / pipeline changes

Per [`CLAUDE.md` §14](../CLAUDE.md):

- Adding or modifying an agent → route through `architect` first, then `agent-builder` writes the prompt.
- Installer / hooks / MCP server changes → `architect` then `security` review (elevated privileges on the user's machine).
- Pipeline phase changes → architecture review mandatory; update `agents/orchestrator.md` + `agents/ref-direct-modes.md` + `agents/ref-special-flows.md` atomically.

## opencode build (beta)

Team Harness runs under both Claude Code and opencode. Authoring rules for the
dual-runtime build:

- **New hooks → TypeScript** (`hooks/ts/`), not Bash (CLAUDE.md §6.3). One TS body
  runs on Node (Claude Code) and Bun (opencode) via the `normalized-v1` shim; parity
  is enforced by `tests/test_ts_hook_parity.sh` (run-all Suite 15).
- **Project assets between harness formats** with `/harness-migrate` (`tools/harness-migrate/`), not by hand.

Process detail: [migration guide](./opencode-migration-guide.md) ·
[distribution roadmap](./opencode-distribution-roadmap.md).

## Release process

The release flow is operator-side. `delivery` bumps the `version` constant in `cmd/install/main.go` and adds a `[X.Y.Z]` block to `CHANGELOG.md`, but does **not** run `git tag` — the human decides when to publish.

After a PR merges:

```bash
git checkout main && git pull origin main
git tag -a vX.Y.Z -m "Release vX.Y.Z — short description"
git push origin vX.Y.Z
```

The tag push triggers `release.yml` (builds 5 cross-compiled binaries → GitHub Releases) and `pages.yml` (publishes the three bootstrap scripts to GitHub Pages on `release: published`).

Pre-requisite (one-time, repo-level): repo Settings → Pages → Source = **GitHub Actions** + an environment named `github-pages` configured to allow deployments from the relevant tags / branches.
