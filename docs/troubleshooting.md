# Troubleshooting

## Plugin install fails: "source type not supported"

**Error:** `Failed to install: This plugin uses a source type your Claude Code version does not support.`

**Cause:** Claude Code version is too old for the marketplace source format.

**Fix:** Update Claude Code to the latest version and retry.

---

## Plugin install fails: "Permission denied (publickey)"

**Error:**
```
Failed to clone repository: git@github.com: Permission denied (publickey).
fatal: Could not read from remote repository.
```

**Cause:** Claude Code clones plugins via git. If git is configured to use SSH for GitHub but no SSH key is set up, the clone fails.

**Fix:** Force git to use HTTPS for GitHub:

```bash
git config --global url."https://github.com/".insteadOf "git@github.com:"
```

Then retry `/plugin install th`.

---

## Plugin install fails: "No ED25519 host key is known"

**Error:**
```
No ED25519 host key is known for github.com and you have requested strict checking.
Host key verification failed.
```

**Cause:** The `~/.ssh/known_hosts` file doesn't have GitHub's host key (common on machines that only use `gh` CLI without SSH).

**Fix:**

```bash
mkdir -p ~/.ssh
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null
```

Then retry `/plugin install th`.

---

## 0 skills loaded after install

**Symptom:** `/reload-plugins` shows `0 skills` even though agents and hooks load correctly.

**Cause:** Skills require YAML frontmatter with a `description` field to be discovered by the plugin system. If the SKILL.md files don't have frontmatter, the plugin loader skips them.

**Status:** Under investigation. Skills are invoked via the orchestrator flow which routes internally — the 0-skill count does not block normal usage via `@th:orchestrator`.

---

## Pipeline runs inline instead of dispatching specialists

**Symptom:** When you ask Claude to do a task, it plans and implements inline in chat instead of creating a workspace and dispatching specialist agents via `Task`.

**Cause:** The dispatch rule is missing from `~/.claude/CLAUDE.md`. This rule states that the top-level agent IS the orchestrator, and that it dispatches specialists via `Task` rather than executing a specialist's role inline.

**Fix:** Run `/th:setup` — it writes the dispatch rule automatically. The managed block (`<!-- orchestrator-dispatch-rule:start -->` … `<!-- orchestrator-dispatch-rule:end -->`) is defined once, canonically, at `skills/setup/managed-blocks/orchestrator-dispatch-rule.md` — reproduce it from that file rather than a copy pasted here, so this page cannot drift from what `/th:setup` actually writes.

---

## A specialist loses `Task` one level deep

**Symptom:** a specialist leaf agent dispatched by `th:orchestrator` (or invoked one level deep from a skill wrapper or an `@`-mention inside an ongoing session) cannot itself use tools its own contract grants.

**Cause:** Claude Code's subagent-nesting depth is configurable, not a permanent cap, via the `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` environment variable in `~/.claude/settings.json`. It defaults to unset, in which case a subagent one level deep does not retain the tools its own contract grants.

**Fix:** Run `/th:setup` (or `/th:update` on an already-installed machine) — both provision `env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "2"` after an explicit confirmation. Restart the session (or start a new one) — the value resolves at session start and does not take effect mid-session. This is depth headroom for a specialist leaf agent, not a coordinator-dispatch fallback: `th:orchestrator` is always the top-level session agent and never itself runs nested, so there is no second-coordinator handoff to relay. Full mechanism: `docs/setup-update-model.md § Architecture prerequisite: subagent nesting depth`; `docs/subagent-orchestration.md § "Nested-context dispatch — RETIRED protocol, retained provisioning"`.

---

## Duplicate agents/skills after migrating from binary installer

**Symptom:** After installing the plugin, you see both namespaced (`th:orchestrator`) and non-namespaced (`orchestrator`) versions of agents, or skills fire twice.

**Cause:** Files from the binary installer remain in `~/.claude/agents/`, `~/.claude/skills/`, and `~/.claude/commands/` while the plugin also registers the same agents.

**Fix:** Remove the binary installer files before using the plugin:

```bash
rm -rf ~/.claude/agents/
rm -rf ~/.claude/commands/
rm -rf ~/.claude/skills/
rm ~/.claude/hooks/policy-block.sh ~/.claude/hooks/notify-*.sh ~/.claude/hooks/config.json
```

Also remove hook entries from `~/.claude/settings.json` that reference `~/.claude/hooks/` (the plugin registers its own hooks).

The files that must be preserved (they hold your configuration):
- `~/.claude.json` — MCP server config
- `~/.claude/.team-harness.json` — logs mode and vault path
- `~/.claude/CLAUDE.md` — dispatch rule

---

## MCP servers not connecting

**Symptom:** Memory or context7 MCP server shows errors or is unavailable.

**Fix:** Run `/th:setup` to reconfigure. It will ask for your MCP URL and API key, write them to `~/.claude.json`, and verify connectivity.

---

## Plugin not updating

**Symptom:** After running `/plugin marketplace update`, changes don't seem to apply.

**Fix:** After the marketplace update, reload the plugin:

```
/plugin marketplace update team-harness-marketplace
/reload-plugins
```

If changes still don't appear, restart Claude Code.
