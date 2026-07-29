# skills/

Slash-command entry points. Each skill is a directory with a `SKILL.md` file that registers one command a developer invokes inside Claude Code.

## Skill format — directory

Every skill lives at `skills/<name>/SKILL.md`. This format is compatible with both the Claude Code plugin (auto-discovers all `SKILL.md` files) and the Go installer (copies the full directory recursively).

When the plugin is active (canonical path), skills are invoked as `/th:<name>`.
When installed via the legacy Go binary installer, skills are invoked as `/<name>`.

**Runtime-restricted skills — durable convention.** A skill that functions under only one runtime (Claude Code or opencode) must name that restriction in the first clause of its `description` frontmatter field (e.g. a description opening with "Opencode runtime only"), and add a matching runtime line near the top of the body, before the first operational instruction. Claude Code's skill frontmatter reference does not honor a `runtime`/`os`/`platform` field, so legibility in the listed text is the only mechanism available. The one-way exclusion from the opposite direction (a Claude-Code-only skill kept out of the opencode copy) is enforced separately by `cmd/install/manifest_registry.go`'s `opencodeExcludedSkills`.

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

- **Routes to orchestrator** (default for pipeline work): `/th:issue`, `/th:plan`, `/th:design`, `/th:plan-review`, `/th:research`, `/th:learn`, `/th:spike`, `/th:test`, `/th:test-cross-browser`, `/th:test-pipeline`, `/th:validate`, `/th:define-ac`, `/th:security`, `/th:audit`, `/th:review-pr`, `/th:deliver`, `/th:diagram`, `/th:likec4-diagram`, `/th:d2-diagram`, `/th:translate`, `/th:bootstrap`, `/th:recover`, `/th:eval`, `/th:gcp-costs`, `/th:cross-repo`, `/th:inline` (operator-only session toggle, `disable-model-invocation: true`).
- **Standalone** (no orchestrator involvement): `/th:lint`, `/th:pipelines`, `/th:kg`, `/th:tmux`, `/th:background`, `/th:update`, `/th:report-issue`, `/th:hookify`, `/th:save-session`, `/th:resume-session`, `/th:harness-audit`, `/th:todo`, `/th:mcp-optimize`.
- **Standalone complex skills** (no slash-command entry point, triggered by description matching): `obsidian-markdown`, `obsidian-bases`, `json-canvas`, `obsidian-cli`.

## Adding a skill

1. Create `skills/<name>/SKILL.md` with frontmatter and a body.
2. Default behaviour: parse args, route to orchestrator with a descriptive mode. Use existing skills as templates.
3. For skills with supporting material, add `skills/<name>/references/` with the relevant files.
4. **Plugin (canonical):** run `/plugin reload th` inside Claude Code to pick up the new skill.
   **Legacy (contributors):** run `go run ./cmd/install` from the repo root to propagate via the Go installer.
5. Add a `CHANGELOG.md` entry under `[Unreleased]`.
6. Open a PR.

## No nested-dispatch continuity contract — retired

A skill invokes `th:orchestrator` as the top-level session agent, never via `Task(subagent_type=orchestrator, ...)` — there is no coordinator dispatched as a subagent for this repo's routing skills to hand off from. The `dispatch_handoff`/`blocked-no-dispatch` takeover protocol that used to exist for that scenario is retired along with the second coordination agent it backstopped: see `docs/subagent-orchestration.md § "Nested-context dispatch — RETIRED protocol, retained provisioning"` for the full retirement note and the harmless depth-2 nesting provisioning that survives it for specialist leaf agents invoked one level deep.

## Notes

- `README.md` in this folder is contributor documentation; the installer does **not** copy it to `~/.claude/commands/` or the plugin root.
- Keep skill files thin. Heavy logic belongs in the agents they route to.
- Skill directory names (minus the path) become the slash-command name in Claude Code. Don't rename casually.
