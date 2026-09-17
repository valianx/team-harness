# skills/

Reusable Team Harness workflows for Claude Code, Codex and OpenCode. Each
skill owns the method for a recognizable task and is discoverable through its
name and description.

## Skill format — directory

Every skill lives at `skills/<name>/SKILL.md`. This format is compatible with both the Claude Code plugin (auto-discovers all `SKILL.md` files) and the Go installer (copies the full directory recursively).

When the plugin is active (canonical path), skills are invoked as `/th:<name>`.
When installed via the legacy Go binary installer, skills are invoked as `/<name>`.

**Shared capability convention.** Every top-level skill name is available in
Claude Code, Codex, and opencode. `skills/` owns the canonical domain workflow;
`tools/codex-runtime/sync-skills.mjs` packages generated Codex and opencode
adapters that translate runtime paths, tools, delegation, and permissions.
Hand-authored overrides are reserved for behavior that genuinely differs by
runtime. When changing a workflow, check those overrides as well as generated
adapters so all hosts retain the capability.

### Complex skill — subfolder with references

Keep the core method in `SKILL.md`. Use references for conditional detail,
scripts for useful executable helpers and assets for output templates:

```
skills/
└── excalidraw-diagram/
    ├── SKILL.md         ← skill prompt
    └── references/      ← supporting guidance loaded when relevant
```

Describe the objective, inputs, meaningful decisions and expected result. A
skill can connect research, implementation and review without prescribing a
fixed agent count or mandatory reports. Substantial domain procedures belong
with the skill that uses them; specialists contribute expertise and the
current general agent coordinates.

## Routing

- Use `spec` for written intent and a bounded development objective; choose
  `pipeline` when the operator wants broader coordination.
- Use `review-pr` for reviewing an existing PR and `create-pr` for preparation
  and publication, including delivery from spec or pipeline work.
- Use the matching domain skill for research, documentation, testing or other
  tasks. `modes` exposes the installed catalog and native invocation syntax.
- Skills run in the current general agent. Delegate bounded specialist work
  when it contributes useful context or independent review. Native tools and
  permissions govern execution; reviewers provide recommendations to Main.

## Adding a skill

1. Compare the intended request with existing skills. `lint --against` can help
   decide whether to extend an existing capability.
2. Create or update `skills/<name>/SKILL.md` with a precise description and an
   actionable method. Keep the method in one place and link relevant resources.
3. Run `node tools/codex-runtime/sync-skills.mjs` and inspect the packaged
   changes. Align any applicable hand-authored runtime override.
4. Check references and package freshness, then try representative requests.
   Validate outcomes and preservation of useful behavior; counting headings or
   matching prose does not establish that a workflow works.
5. Record the user-visible change and deliver it through `create-pr`. Updating
   a contributor checkout does not imply installing it into the user's hosts;
   use the selected runtime's `update` or `reload` skill when requested.

## Notes

- `README.md` in this folder is contributor documentation; the installer does **not** copy it to `~/.claude/commands/` or the plugin root.
- Load only the supporting detail relevant to the task. A small entrypoint is
  useful when its references retain the complete method.
- Skill directory names (minus the path) become the slash-command name in Claude Code. Don't rename casually.
