# skills/

Slash-command entry points. Each skill is a directory with a `SKILL.md` file that registers one command a developer invokes inside Claude Code.

## Skill format — directory

Every skill lives at `skills/<name>/SKILL.md`. This format is compatible with both the Claude Code plugin (auto-discovers all `SKILL.md` files) and the Go installer (copies the full directory recursively).

When the plugin is active (canonical path), skills are invoked as `/th:<name>`.
When installed via the legacy Go binary installer, skills are invoked as `/<name>`.

### Complex skill — subfolder with references

Skills that need supporting material (scripts, templates, reference data) add a `references/` subdirectory inside the skill folder:

```
skills/
└── excalidraw-diagram/
    ├── SKILL.md         ← skill prompt
    └── references/      ← scripts, templates, reference material
```

Convention: parse arguments, build a task payload, route to the `orchestrator` agent.

## Routing

- **Routes to orchestrator** (default for pipeline work): `/th:issue`, `/th:plan`, `/th:design`, `/th:research`, `/th:learn`, `/th:spike`, `/th:test`, `/th:test-pipeline`, `/th:validate`, `/th:define-ac`, `/th:security`, `/th:audit`, `/th:review-pr`, `/th:deliver`, `/th:diagram`, `/th:likec4-diagram`, `/th:d2-diagram`, `/th:translate`, `/th:bootstrap`, `/th:recover`, `/th:eval`, `/th:gcp-costs`, `/th:cross-repo`.
- **Standalone** (no orchestrator involvement): `/th:lint`, `/th:pipelines`, `/th:kg`, `/th:tmux`, `/th:background`, `/th:update`, `/th:report-issue`, `/th:hookify`, `/th:save-session`, `/th:resume-session`, `/th:harness-audit`, `/th:todo`.
- **Standalone complex skills** (no slash-command entry point, triggered by description matching): `obsidian-markdown`, `obsidian-bases`, `json-canvas`, `obsidian-cli`.

## Adding a skill

1. Create `skills/<name>/SKILL.md` with frontmatter and a body.
2. Default behaviour: parse args, route to orchestrator with a descriptive mode. Use existing skills as templates.
3. For skills with supporting material, add `skills/<name>/references/` with the relevant files.
4. **Plugin (canonical):** run `/plugin reload th` inside Claude Code to pick up the new skill.
   **Legacy (contributors):** run `go run ./cmd/install` from the repo root to propagate via the Go installer.
5. Add a `CHANGELOG.md` entry under `[Unreleased]`.
6. Open a PR.

## Continuity contract on `blocked-no-dispatch`

When a skill dispatches `Task(subagent_type=orchestrator, ...)`, the orchestrator runs as a nested subagent and the Claude Code harness strips its `Task` tool — regardless of the agent's frontmatter. The orchestrator detects this at boot via a probe and returns a response that starts with **"Dispatch handoff — top-level Claude takes over now"**, plus (if a recovery context existed) writes `status: blocked-no-dispatch` and a `## Handoff` section to `workspaces/{feature}/00-state.md`.

**Top-level Claude MUST honour the handoff automatically.** This is not a user-decision point; the user already authorised the pipeline when they typed the skill or mention. The protocol is:

1. Read `00-state.md` (`## Current State` + `## Handoff`) if it exists, or use the handoff fields embedded in the orchestrator's response.
2. Read `agents/orchestrator.md` for the per-phase contract and the agent contract file — derive the file path by stripping the `th:` prefix from `next_dispatch.agent` (e.g. `th:architect` → `agents/architect.md`).
3. Dispatch `{next-agent}` directly via `Task(subagent_type={next-agent}, ...)` from the top-level session — `{next-agent}` is the prefixed value from `next_dispatch.agent` (e.g. `th:architect`), used verbatim.
4. Continue through the remaining phases, dispatching each agent in sequence (or in parallel where the contract specifies, e.g. `tester` + `qa` + `security` in Phase 3). Update `00-state.md` after every transition.
5. Respect gates: STAGE-GATE-2 between PRs is silent iff `autonomous: true`; STAGE-GATE-3 always asks the user before push.
6. **Do NOT** ask the user "should I take over?", **do NOT** re-invoke `@th:orchestrator` (it recreates the nested context), and **do NOT** write the agents' workspaces inline — top-level Claude still inherits the orchestrator's "you NEVER write code/tests/docs" contract during the takeover.

This contract is universal across every routing skill. The full directive lives in `agents/orchestrator.md` § "Dispatch-blocked exit" and in `CLAUDE.md` § 14 "Subagent Orchestration" — both are authoritative.

## Notes

- `README.md` in this folder is contributor documentation; the installer does **not** copy it to `~/.claude/commands/` or the plugin root.
- Keep skill files thin. Heavy logic belongs in the agents they route to.
- Skill directory names (minus the path) become the slash-command name in Claude Code. Don't rename casually.
