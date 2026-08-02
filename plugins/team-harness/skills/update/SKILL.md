---
name: update
description: "Update Team Harness for Codex and automatically reconcile the complete operational installation: marketplace snapshot, native configuration, bundled specialist agents, MCP registrations, and deterministic hook wiring."
---

# Update Team Harness for Codex

The marketplace distributes code; this skill updates and configures the
installed runtime. Do not activate a pipeline, create workspace state, or spawn
subagents. Accept `--force` to reinstall an equal-version development snapshot.

## Procedure

1. Record `OLD_PLUGIN` as the lexical absolute plugin root that contains this
   loaded `skills/update/SKILL.md`; do not resolve away a versioned symlink.
   Run `codex plugin list --json` and `codex plugin marketplace list --json`.
   Require `team-harness@team-harness`; otherwise direct the operator to the
   marketplace install followed by `$team-harness:setup`.

2. Refresh only this marketplace with
   `codex plugin marketplace upgrade team-harness --json`, then inspect the
   installed and available semantic versions. A local marketplace is already
   source-current and is reinstalled only with `--force`.

3. When the available version is newer, or `--force` is present, execute the
   bounded replacement through Codex's native permission flow:

   ```text
   codex plugin remove team-harness@team-harness
   codex plugin add team-harness@team-harness
   ```

   Do not remove the marketplace. If add fails after remove, stop and report
   `codex plugin add team-harness@team-harness` as the recovery command.

4. Resolve all remaining helpers from the newly installed plugin path returned
   by `codex plugin list --json`; the running skill text is still the old
   snapshot. From this point, `NEW_PLUGIN` and `NEW_VERSION` are the only
   operational source: never execute a helper, inspect a hook, or derive an
   installed version from `OLD_PLUGIN`.

   Bridge the current thread's old versioned path to the validated new
   snapshot using the new helper:

   ```bash
   python3 NEW_PLUGIN/skills/update/scripts/bridge_snapshot.py \
     --old-plugin OLD_PLUGIN --new-plugin NEW_PLUGIN
   ```

   The helper writes only inside the common
   `plugins/cache/team-harness/team-harness/` directory. It creates a missing
   old path or atomically repoints an existing in-cache symlink, but never
   replaces a real directory or an unrelated symlink. This lets already-loaded
   hook and skill paths continue through the new snapshot without a restart.
   Preserve its `restartRequired` result for the final report.

   Always create or migrate the independent native configuration:

   ```bash
   python3 NEW_PLUGIN/skills/setup/scripts/manage_config.py ensure --version NEW_VERSION
   ```

   This fills missing safe defaults and updates helper metadata while
   preserving every configured and opaque operator value. It never reads or
   writes Claude Code or opencode configuration. Cross-runtime copying belongs
   only to an explicit `$team-harness:setup` import.

5. Read `agent-scope` from the native config (the ensured default is
   `global`) and reconcile all ten bundled agents automatically:

   ```bash
   python3 NEW_PLUGIN/skills/setup/scripts/manage_agents.py inspect --scope SCOPE
   python3 NEW_PLUGIN/skills/setup/scripts/manage_agents.py sync --scope SCOPE
   ```

   Install missing agents and replace only stale Team Harness-generated files.
   Stop on an unmanaged same-name conflict. Do not call or download the
   separate Go installer; agent bytes are part of the marketplace snapshot.

6. Inspect `codex mcp list --json`. Preserve registered MCP definitions and
   report missing registrations that native configuration expects; never
   replace an MCP or reveal credentials during an update.

7. Verify the new snapshot's `hooks/hooks.json` contains only the supported
   deterministic deny hooks (`policy-block` and `gcp-guard`) and no
   `PermissionRequest` or approval-classifying guards. Verify both commands
   prefer `PLUGIN_ROOT`, accept Codex's `CLAUDE_PLUGIN_ROOT` compatibility
   alias without depending on a Claude Code installation, and recover a
   replacement snapshot from the same Codex cache without exiting `127`. Hook
   trust remains an operator action through `/hooks`; never bypass it.

8. Verify the installed plugin version, native settings, ten agent files, MCP
   list, and bridge target. Report old/new versions, marketplace result, config
   migration, agent reconciliation, hook status, bridge status, and any
   recovery command. When the bridge reports `restartRequired: false`, state
   that the current thread can continue with its already-known skill and hook
   paths; do not require a restart merely because the cache version changed.

   Ask the operator to restart Codex or open a new thread only when the bridge
   requires it or when the release changes capabilities Codex indexes at thread
   creation, such as added or renamed skills, agent declarations, MCP server
   declarations, or hook registrations. Never claim that discovery metadata or
   an already-running MCP process was hot-reloaded. If a new thread is required,
   stop normal work in the current thread after explicitly requesting it.

Even when plugin versions compare equal, steps 4–7 still run. Update is also a
repair/convergence command, not only a version downloader.
