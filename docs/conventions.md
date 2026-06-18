# Architectural Conventions — Extended Reference

> Extracted from CLAUDE.md §5 to keep the main file under its size cap. The one-liner rules and pointers stay in CLAUDE.md §5. This file holds the extended detail for conventions that do not have a dedicated `docs/` file of their own.

---

## Workspaces as the shared board

A workspace is the shared working directory for a single pipeline session. Each pipeline run creates its own isolated workspace at `workspaces/{feature-name}/`. Agents communicate through files — each reads prior agents' output and writes its own. The operator uses the workspace as a review surface. Values are never passed through return values. `workspaces/` is always git-ignored and never committed.

## Dual-mode workspaces

Two output modes are available, controlled by `logs-mode` in `~/.claude/.team-harness.json`:

- **local** (default) — writes to `./workspaces/{feature-name}/` in the repo working tree.
- **obsidian** — writes to the configured Obsidian vault at `{logs-path}/{logs-subfolder}/{repo-name}/{date}_{feature}/`. The orchestrator resolves the base path once at pipeline start and passes it to every subagent. Obsidian mode adds YAML frontmatter (repo, feature, pipeline, date, agent) to every workspace doc.

The operator switches modes via `/th:setup` or a session override in `00-state.md`.

## Installer file overwrite behavior

Agents, skills, and hooks in `~/.claude/` are canonical bytes from this repo. Direct edits to those files are not a supported customization path — they are replaced on every install. The installer:

- Skips files whose hash matches the embedded source (unchanged files are not re-written).
- Backs up `~/.claude.json` before every merge.
- Presents a Keep/Change preservation menu for operator-specific identity (`mcpServers.memory` URL/bearer, context7 API key) — these are never silently clobbered.

## Single config file — `~/.claude/.team-harness.json`

All Team Harness settings live in one file: `logs-mode`, `logs-path`, `logs-subfolder`, installer manifest, version metadata, and skill-specific keys (e.g., ClickUp under `clickup`).

Rules for contributors:
- Skills MUST NOT create their own config files in `~/.claude/` — use namespaced keys inside `.team-harness.json`.
- Every write is a merge: read the full document, replace only the owned key, write the whole document back. Never write a partial payload.
- Exception: `~/.claude/settings.json` is Claude Code's own file and is managed separately by the harness.

## Obsidian-mode diagram embedding

In `logs-mode: obsidian`, diagram generation works as follows:

- **D2** — renders via the `d2` CLI to SVG; the SVG file is written into the vault workspace folder and an `![[…]]` embed appended to `05-diagram.md`.
- **LikeC4** — renders via `npx likec4 export png` to PNG; same embed pattern.
- When the CLI is absent, the diagram source is written and a `render: skipped` marker appended — the file is not left empty.
- Local mode and the Excalidraw path are unchanged by this convention.
