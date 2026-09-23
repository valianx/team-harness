# Troubleshooting

## Codex plugin or agents do not appear

Run Team Harness `reload` in the existing thread after install or upgrade. It
refreshes supported plugin components and distinguishes unavailable activation
evidence from a demonstrated need to reconnect. Confirm the marketplace and
plugin with `codex plugin marketplace list` and `codex plugin list`. Plugin
installation does not install `.codex/agents/*.toml`; run the separate agent
installer when those roles are wanted.

## Codex permissions or agents do not behave as expected

Codex action boundaries are owned by its native sandbox, permissions and
approval reviewer. Team Harness does not install a Codex policy-hook layer.
Run `reload` to refresh skills, commands and agents, then inspect the native
runtime status. Missing evidence alone does not establish a restart
requirement; reconnect only when the host reports a stale component that
cannot be activated in place.

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

**Symptom:** `/reload-plugins` shows `0 skills` even though agents load correctly.

**Cause:** Skills require YAML frontmatter with a `description` field to be discovered by the plugin system. If the SKILL.md files don't have frontmatter, the plugin loader skips them.

**Status:** Under investigation. Skills are invoked via the orchestrator flow which routes internally — the 0-skill count does not block normal usage via `@th:orchestrator`.

---

## Selected pipeline remains inline instead of dispatching specialists

**Symptom:** After explicitly selecting `/th:pipeline`, the native general agent
continues the whole task inline instead of creating the configured workspace or
dispatching a bounded specialist that the request needs.

**Cause:** The dispatch rule may be missing from `~/.claude/CLAUDE.md`, or the
selected workflow may not require specialist work. Direct conversation and
small reversible changes are intentionally inline; the rule applies only after
the operator selects a workflow that needs coordination.

**Fix:** Run `/th:setup` to reconcile the managed dispatch block, then reload
the plugin when the host supports it. Read the canonical block from
skills/setup/managed-blocks/orchestrator-dispatch-rule.md; do not add a
nested coordinator or a separate permission layer. If the selected workflow
does not need a specialist, continuing inline is the expected result.

---

## A specialist loses tools in a nested context

**Symptom:** A bounded specialist cannot use a tool its own contract grants
after the native host dispatches it.

**Cause:** Tool access is controlled by the active native runtime and the
current session context. Team Harness setup and update do not provision a
machine-wide nesting-depth setting.

**Fix:** Confirm that the selected workflow and specialist contract match the
active host, then inspect the host's native permission/session diagnostics.
Use the plugin reload path only when the host reports stale installed assets.
Do not add `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, restart a session, or create
a second coordinator solely from this symptom.

---

## Duplicate agents/skills after migrating from binary installer

**Symptom:** After installing the plugin, you see both namespaced (`th:orchestrator`) and non-namespaced (`orchestrator`) versions of agents, or skills fire twice.

**Cause:** Files from the binary installer remain in `~/.claude/agents/`, `~/.claude/skills/`, and `~/.claude/commands/` while the plugin also registers the same agents.

**Fix:** Inspect the retired installer's ownership ledger and preview each
legacy path. Remove only files explicitly recorded as Team Harness-owned and
still present. If ownership is absent or unclear, preserve the path and use
the plugin's reload guidance. Never use wildcard or recursive removal against
the commands, agents or skills directories.

Do not remove arbitrary user hooks or settings entries. Preserve native
permission configuration and any context/observation integration that is not
owned by the retired installer path.

The files that must be preserved (they hold your configuration):
- `~/.claude.json` — MCP server config
- `~/.claude/.team-harness.json` — logs mode and vault path
- `~/.claude/CLAUDE.md` — dispatch rule

---

## MCP servers not connecting

**Symptom:** Memory or Context7 MCP server shows errors or is unavailable.

**Fix:** Inspect the native runtime's MCP registration first. Run
`/th:setup` only when you want to configure Context7 explicitly; it preserves
existing Memory and Context Harness entries and does not request or copy their
credentials. Repair a Memory or Context Harness entry through the runtime's
native MCP mechanism. Reconnect only when the host reports that activation
requires it.

---

## Plugin not updating

**Symptom:** After running `/plugin marketplace update`, changes don't seem to apply.

**Fix:** After the marketplace update, reload the plugin:

```
/plugin marketplace update team-harness-marketplace
/reload-plugins
```

If changes still don't appear, reconnect only after confirming that reload
was unavailable or the host reports the running session is stale.
