# skills/

Slash-command entry points. Each `.md` file (or subfolder) registers one skill that a developer invokes inside Claude Code.

## Two kinds of skill

### Simple skill — one file

Most skills are a single `<name>.md` at the top level. The installer copies them to `~/.claude/commands/<name>.md`, which Claude Code exposes as `/<name>`.

Convention: parse arguments, build a task payload, route to the `th-orchestrator` agent.

### Complex skill — folder

A folder at this level (e.g. `excalidraw-diagram/`) holds:

- `SKILL.md` — the skill prompt itself.
- `references/` — supporting scripts, templates, reference material loaded on demand.

The installer copies the whole subfolder to `~/.claude/skills/<name>/`.

The top level also contains a one-file `<name>.md` sibling for each complex skill; the simple file is the lightweight entry point, and the subfolder holds the heavy lifting.

## Routing

- **Routes to th-orchestrator** (default for pipeline work): `/issue`, `/plan`, `/design`, `/research`, `/spike`, `/test`, `/test-pipeline`, `/validate`, `/define-ac`, `/security`, `/audit`, `/review-pr`, `/deliver`, `/diagram`, `/likec4-diagram`, `/d2-diagram`, `/translate`, `/init`, `/recover`, `/eval`, `/gcp-costs`, `/cross-repo`.
- **Standalone** (no th-orchestrator involvement): `/lint`, `/status`, `/memory`, `/tmux`, `/background`, `/th-update`.

## Adding a simple skill

1. Create `skills/<name>.md` with frontmatter and a short body.
2. Default behaviour: parse args, route to th-orchestrator with a descriptive mode. Use existing skills as templates.
3. Run `./bin/install.sh` (or `.\bin\install.ps1` on Windows) to propagate.
4. Add a `CHANGELOG.md` entry under `[Unreleased]`.
5. Open a PR.

## Adding a complex skill

1. Create `skills/<name>/SKILL.md` with the full prompt.
2. Add `references/` with templates, scripts, or docs the skill needs.
3. Create a thin `skills/<name>.md` entry point that routes into `~/.claude/skills/<name>/SKILL.md`.
4. Re-install and document as above.

## Continuity contract on `blocked-no-dispatch`

When a skill dispatches `Task(subagent_type=th-orchestrator, ...)`, the th-orchestrator runs as a nested subagent and the Claude Code harness strips its `Task` tool — regardless of the agent's frontmatter. The th-orchestrator detects this at boot via a probe and returns a response that starts with **"Dispatch handoff — top-level Claude takes over now"**, plus (if a recovery context existed) writes `status: blocked-no-dispatch` and a `## Handoff` section to `session-docs/{feature}/00-state.md`.

**Top-level Claude MUST honour the handoff automatically.** This is not a user-decision point; the user already authorised the pipeline when they typed the skill or mention. The protocol is:

1. Read `00-state.md` (`## Current State` + `## Handoff`) if it exists, or use the handoff fields embedded in the th-orchestrator's response.
2. Read `agents/th-orchestrator.md` for the per-phase contract and `agents/{next-agent}.md` for the agent contract.
3. Dispatch `{next-agent}` directly via `Task(subagent_type={next-agent}, ...)` from the top-level session.
4. Continue through the remaining phases, dispatching each agent in sequence (or in parallel where the contract specifies, e.g. `tester` + `qa` + `security` in Phase 3). Update `00-state.md` after every transition.
5. Respect gates: STAGE-GATE-2 between PRs is silent iff `autonomous: true`; STAGE-GATE-3 always asks the user before push.
6. **Do NOT** ask the user "should I take over?", **do NOT** re-invoke `@th-orchestrator` (it recreates the nested context), and **do NOT** write the agents' session-docs inline — top-level Claude still inherits the th-orchestrator's "you NEVER write code/tests/docs" contract during the takeover.

This contract is universal across every routing skill (`/issue`, `/recover`, `/plan`, `/design`, `/deliver`, `/validate`, `/research`, `/spike`, `/test`, `/test-pipeline`, `/security`, `/audit`, `/diagram`, `/d2-diagram`, `/likec4-diagram`, `/define-ac`, `/translate`, `/init`, `/eval`, `/gcp-costs`, `/cross-repo`, `/review-pr`). The full directive lives in `agents/th-orchestrator.md` § "Dispatch-blocked exit" and in `CLAUDE.md` § 13 "Subagent Orchestration" — both are authoritative.

## Notes

- `README.md` in this folder is contributor documentation; the installer does **not** copy it to `~/.claude/commands/`.
- Keep skill files thin. Heavy logic belongs in the agents they route to.
- Skill filenames (minus `.md`) become the slash-command name in Claude Code. Don't rename casually.
