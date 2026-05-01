# skills/

Slash-command entry points. Each `.md` file (or subfolder) registers one skill that a developer invokes inside Claude Code.

## Two kinds of skill

### Simple skill — one file

Most skills are a single `<name>.md` at the top level. The installer copies them to `~/.claude/commands/<name>.md`, which Claude Code exposes as `/<name>`.

Convention: parse arguments, build a task payload, route to the `orchestrator` agent.

### Complex skill — folder

A folder at this level (e.g. `excalidraw-diagram/`) holds:

- `SKILL.md` — the skill prompt itself.
- `references/` — supporting scripts, templates, reference material loaded on demand.

The installer copies the whole subfolder to `~/.claude/skills/<name>/`.

The top level also contains a one-file `<name>.md` sibling for each complex skill; the simple file is the lightweight entry point, and the subfolder holds the heavy lifting.

## Routing

- **Routes to orchestrator** (default for pipeline work): `/issue`, `/plan`, `/design`, `/research`, `/spike`, `/test`, `/test-pipeline`, `/validate`, `/define-ac`, `/security`, `/audit`, `/review-pr`, `/deliver`, `/diagram`, `/likec4-diagram`, `/d2-diagram`, `/translate`, `/init`, `/recover`, `/eval`, `/gcp-costs`, `/cross-repo`.
- **Standalone** (no orchestrator involvement): `/lint`, `/status`, `/memory`, `/tmux`, `/kg-viewer`, `/background`.

## Adding a simple skill

1. Create `skills/<name>.md` with frontmatter and a short body.
2. Default behaviour: parse args, route to orchestrator with a descriptive mode. Use existing skills as templates.
3. Run `./bin/install.sh` (or `uv run bin/install.py`) to propagate.
4. Add a `CHANGELOG.md` entry under `[Unreleased]`.
5. Open a PR.

## Adding a complex skill

1. Create `skills/<name>/SKILL.md` with the full prompt.
2. Add `references/` with templates, scripts, or docs the skill needs.
3. Create a thin `skills/<name>.md` entry point that routes into `~/.claude/skills/<name>/SKILL.md`.
4. Re-install and document as above.

## Notes

- `README.md` in this folder is contributor documentation; the installer does **not** copy it to `~/.claude/commands/`.
- Keep skill files thin. Heavy logic belongs in the agents they route to.
- Skill filenames (minus `.md`) become the slash-command name in Claude Code. Don't rename casually.
