# Contributing to Team Harness

Thanks for your interest in contributing. Team Harness is an open-source agent
harness for Claude Code, distributed as a plugin. This guide covers how to
propose a change. The **binding rules** for any change live in
[`CLAUDE.md` §6 — Mandatory Working Agreements](./CLAUDE.md#6-mandatory-working-agreements);
this document summarizes them and shows you the contribution flow.

## You do not need the `th` plugin or developer mode to contribute

Installing the `th` plugin and running developer mode is the **maintainer's local
workflow**, not a contribution prerequisite. To contribute a change you only need
`git`, a GitHub account, and (recommended) the `gh` CLI. The free verification
suite runs with `bash`, `python3`, and `uv`.

## Fork-PR flow (outside contributors)

If you are not a collaborator on `valianx/team-harness`, contribute via a fork:

1. **Fork** `valianx/team-harness` to your own account (GitHub UI → "Fork", or
   `gh repo fork valianx/team-harness --clone`).
2. **Clone** your fork:
   `git clone https://github.com/<you>/team-harness.git`
3. **Add upstream** so you can stay in sync:
   `git remote add upstream https://github.com/valianx/team-harness.git`
4. **Branch** from an up-to-date `main` using the repo's naming convention:
   `git checkout main && git pull upstream main`
   `git switch -c feat/<kebab>` (or `fix/`, `chore/`, `docs/`, `refactor/`).
5. **Make your change** and commit with a
   [conventional-commit](https://www.conventionalcommits.org/) message:
   `git commit -m "feat(area): short description"`
6. **Push to your own fork:**
   `git push -u origin feat/<kebab>`
7. **Open a PR against upstream:**
   `gh pr create --repo valianx/team-harness --base main`
   (or use the GitHub UI "Compare & pull request" button).

> A direct `git push` to `valianx/team-harness` returns a 403 unless you are a
> collaborator — that is expected. The fork-PR flow above is the path for outside
> contributors.

**Collaborators** with write access may skip the fork and branch directly in the
upstream repo, but still open a PR — no one pushes to `main` directly.

## The binding rules (summary — see CLAUDE.md §6 for the authority)

These are the floor for every change. The full, authoritative text is in
[`CLAUDE.md` §6](./CLAUDE.md#6-mandatory-working-agreements) — this is a summary,
not a second source of truth.

- **Branch naming:** `feat/`, `fix/`, `chore/`, `docs/`, or `refactor/` + `<kebab>`. Never commit on `main`.
- **Conventional commits:** `feat(area): …`, `fix(area): …`, `docs(area): …`, etc.
- **Never push to `main`** — every change ships via pull request.
- **Changelog fragment:** add `changelog.d/{slug}.md` (a Keep-a-Changelog block —
  `### Added` / `### Changed` / `### Fixed` / `### Security`). One file per PR; the
  delivery step assembles them at release. Do not edit `## [Unreleased]` inline.
- **Distributed-asset version bump:** if your change touches `agents/`, `skills/`,
  or `hooks/`, you MUST bump the version in **both** `.claude-plugin/plugin.json`
  AND `.claude-plugin/marketplace.json` (matched semver). Without it the
  marketplace serves no update. Pure docs/governance changes (like this file) do
  NOT bump the version.
- **Tests green before you push:** run `bash tests/run-all.sh` — it must exit 0.
- **Never commit secrets** — tokens, API keys, `.env` files, certificates, private keys.

See [`CLAUDE.md` §6](./CLAUDE.md#6-mandatory-working-agreements) for the complete
agreements, governance escalation rules, and the anti-pattern list.

## Contributing to the opencode build (beta)

Team Harness targets both Claude Code and opencode. Most surfaces are cross-harness
with no extra work — agents, skills, and rules (`CLAUDE.md` / `AGENTS.md`) are read
by both runtimes as-is. Two rules apply when a change touches the runtime-specific
surfaces:

- **New hooks are authored in TypeScript, not Bash** (CLAUDE.md §6.3, Decision A). A
  single TypeScript hook body runs on Claude Code (Node) and opencode (Bun) through
  the `normalized-v1` shim in `hooks/ts/`; Bash↔TS decision parity is enforced by
  `tests/test_ts_hook_parity.sh` (run-all Suite 15). See
  [`docs/opencode-distribution-roadmap.md`](./docs/opencode-distribution-roadmap.md)
  § Cross-Harness Authoring Mandate.
- **Project this repo's own assets between harness formats** with the repo-local
  `/harness-migrate <to-opencode|to-claude-code>` command (`tools/harness-migrate/`)
  — never by hand-editing frontmatter. It is a contributor tool, not a distributed
  asset.

Background and the per-asset-type process:
[`docs/opencode-migration-guide.md`](./docs/opencode-migration-guide.md).

## Agent and pipeline changes

Per [`CLAUDE.md` §14](./CLAUDE.md#14-subagent-orchestration):

- Adding or modifying an agent → route through `architect` first, then `agent-builder` writes the prompt.
- Installer / hooks / MCP server changes → `architect` then `security` review (elevated privileges on the user's machine).
- Pipeline phase changes → architecture review mandatory; update `agents/leader.md` + `agents/orchestrator.md` + `agents/ref-direct-modes.md` + `agents/ref-special-flows.md` atomically.

## Verifying your change

```
bash tests/run-all.sh
```

This runs the policy-block, structure, and frontmatter suites. CI runs the same
command on every PR. See [`docs/testing.md`](./docs/testing.md) for the suite registry.

### Verifying gh-fallback paths locally

To smoke-test the graceful degradation introduced in v2.10.0 without needing to actually uninstall `gh`:

1. Set `has_gh=false` in your test by temporarily running with a dummy `GH_TOKEN` and no `gh` auth (e.g., `GH_TOKEN="" gh auth logout --hostname github.com` in a scratch env).
2. In a Claude Code session, run `/issue #N` for a real issue number on a public GitHub repo — the skill should fetch the issue via the `curl` Tier A fallback and report "gh CLI unavailable. Fetched issue #N via the GitHub REST API instead."
3. For Tier B write paths, run `/deliver` on a feature branch — if `GH_TOKEN` is set, it should attempt a curl PR creation; if not, it should emit the compare URL and a body file, then report `blocked-manual-push`.
4. For Tier D (project board), verify the orchestrator logs "Project board update skipped — gh CLI unavailable" rather than erroring out.

This is a manual smoke test — the automated test suite (`tests/test_agent_structure.py`) only verifies the static cross-references are present.

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

## Reporting issues

- **Bugs / features / questions about the repo:** open a
  [GitHub issue](https://github.com/valianx/team-harness/issues/new/choose) using
  one of the templates.
- **Problems with the `th` plugin specifically** (an agent, a skill, a gate): the
  convenience path is `/th:report-issue <bug|feature|docs|question> "<summary>"`
  from inside Claude Code — it builds the issue with the right pattern and an
  environment block. Plain GitHub issues are equally welcome.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By
participating you agree to uphold it.

## Security

Do not open public issues for security vulnerabilities. See
[`SECURITY.md`](./SECURITY.md) for private reporting.
