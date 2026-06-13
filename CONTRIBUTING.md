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

## Verifying your change

```
bash tests/run-all.sh
```

This runs the policy-block, structure, and frontmatter suites. CI runs the same
command on every PR. See [`docs/testing.md`](./docs/testing.md) for the suite registry.

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
