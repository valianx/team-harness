# skills/

Workflow entry points. Each skill is a directory with a `SKILL.md` file that
the active runtime can discover and invoke. Team Harness adds a way of working
to the native general agent; it does not replace that agent or reproduce its
permissions, approvals, sandbox, sessions, or tool controls.

## Skill format — directory

Every skill lives at `skills/<name>/SKILL.md`. This format is compatible with both the Claude Code plugin (auto-discovers all `SKILL.md` files) and the Go installer (copies the full directory recursively).

When the plugin is active (canonical path), skills are invoked as `/th:<name>`.
When installed via the legacy Go binary installer, skills are invoked as `/<name>`.

**Shared capability convention.** Every top-level skill name is available in
Claude Code, Codex, and opencode. `skills/` owns the canonical domain workflow;
`tools/codex-runtime/sync-skills.mjs` packages generated Codex and opencode
adapters that translate runtime paths, tools, delegation, and native permission
boundaries. Hand-authored overrides are reserved for lifecycle or runtime
mechanics that genuinely differ. Never exclude a capability merely because its
source body names one runtime.

### Complex skill — subfolder with references

Skills that need supporting material (scripts, templates, reference data) add a `references/` subdirectory inside the skill folder:

```
skills/
└── excalidraw-diagram/
    ├── SKILL.md         ← skill prompt
    └── references/      ← scripts, templates, reference material
```

Convention: parse arguments, build a clear task payload, and let the native
general agent coordinate the selected workflow. A skill may request bounded
native delegation when it helps; a persistent orchestrator subagent is not a
prerequisite.

## Routing

- **Shared PR preparation/publication:** `/th:create-pr`, selected automatically by relevant requests and by spec/pipeline delivery in the current coordinator.
- **Explicit workflow activation:** `/th:pipeline` (operator-only,
  `disable-model-invocation: true`) coordinates design, implementation,
  validation and delivery in the native general agent.
- **OpenSpec and compatibility workflows:** `/th:spec`, `/th:issue`, `/th:plan`
  in `plan-and-execute` mode, and `/th:recover` for existing state.
- **Workflow skills:** `/th:plan`, `/th:design`, `/th:plan-review`,
  `/th:research`, `/th:learn`, `/th:spike`, `/th:test`, `/th:test-cross-browser`,
  `/th:test-pipeline`, `/th:validate`, `/th:define-ac`, `/th:security`,
  `/th:audit`, `/th:find-bugs`, `/th:review-pr`, `/th:deliver`, `/th:diagram`,
  `/th:likec4-diagram`, `/th:d2-diagram`, `/th:translate`, `/th:bootstrap`,
  `/th:eval`, `/th:gcp-costs`, `/th:cross-repo`, and `/th:inline`.
- **Utility and discovery skills:** `/th:modes`, `/th:lint`, `/th:pipelines`,
  `/th:kg`, `/th:tmux`, `/th:background`, `/th:update`, `/th:report-issue`,
  `/th:hookify`, `/th:save-session`, `/th:resume-session`, `/th:todo`, and
  `/th:mcp-optimize` inspect or maintain workflow resources without replacing
  the active agent.
- **Standalone complex skills** (no slash-command entry point, triggered by description matching): `obsidian-markdown`, `obsidian-bases`, `json-canvas`, `obsidian-cli`.

## Adding a skill

1. Create `skills/<name>/SKILL.md` with frontmatter and a body.
2. Default behaviour: parse args and give the native general agent a descriptive
   workflow payload. Use existing skills as templates.
3. For skills with supporting material, add `skills/<name>/references/` with the relevant files.
4. Synchronize generated projections once after the canonical edits:
   `node tools/codex-runtime/sync-skills.mjs` for skills and
   `node tools/codex-runtime/generate.mjs` for agent or registry changes. Run
   each only when its source surface changed; never hand-edit generated copies.
5. If the change affects distributed runtime inputs, bump the shared version and
   add its versioned `CHANGELOG.md` entry once in the implementation PR. Follow
   `CONTRIBUTING.md` for the four version sites and validation commands.
6. Open a PR.

## Native coordination

Main keeps the objective, selected workspace, task ownership, decisions and
evidence coherent. Specialists contribute bounded work or advisory findings when
requested, while Main judges recommendations and performs authorized outward
actions. Existing compatibility helpers may read historical records; they do not
grant permission or create a second control plane.

## Notes

- `README.md` in this folder is contributor documentation; the installer does **not** copy it to `~/.claude/commands/` or the plugin root.
- Keep skill files thin. Heavy logic belongs in the agents they route to.
- Skill directory names (minus the path) become the slash-command name in Claude Code. Don't rename casually.
