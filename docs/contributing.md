# Contributing

Develop against the source files in `agents/`, `skills/`, `hooks/` — **not `~/.claude/` directly**. After editing, re-run the installer to propagate.

## Working agreements (enforced)

See [`CLAUDE.md` §6](../CLAUDE.md) for the full set. The floor:

- Feature branch (`feat/<kebab>`, `fix/<kebab>`, `chore/<kebab>`, `docs/<kebab>`, `refactor/<kebab>`) — never commit on `main`.
- Conventional-commit messages.
- Never push to `main` directly — every change ships via pull request.
- Every user-facing change updates `CHANGELOG.md` under `[Unreleased]`.

## Testing local edits

Use `go run ./cmd/install` from the repo root. The `//go:embed` directive snapshots your working-tree `agents/`, `skills/`, `hooks/` at compile time, so the install reflects your edits exactly.

The bootstrap scripts (`./bin/install.sh` / `.\bin\install.ps1`) always download the released binary — they don't use your local clone.

## Running tests

```bash
bash tests/run-all.sh
```

Three suites cover what's testable without a live LLM: hook policy gate (functional), agent + skill + hook structural integrity, and agent YAML frontmatter parseability. Prompt behaviour requires a live pipeline to validate.

## Agent / pipeline changes

Per [`CLAUDE.md` §13](../CLAUDE.md):

- Adding or modifying an agent → route through `architect` first, then `agent-builder` writes the prompt.
- Installer / hooks / MCP server changes → `architect` then `security` review (elevated privileges on the user's machine).
- Pipeline phase changes → architecture review mandatory; update `agents/orchestrator.md` + `agents/ref-direct-modes.md` + `agents/ref-special-flows.md` atomically.

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
