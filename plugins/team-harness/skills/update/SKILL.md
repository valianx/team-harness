---
name: update
description: "Update Team Harness for Codex and automatically reconcile the complete operational installation: marketplace snapshot, native configuration, bundled specialist agents, MCP registrations, and deterministic hook wiring."
---

# Update Team Harness for Codex

The marketplace distributes code; this skill updates and configures the
installed runtime. Do not activate a pipeline, create workspace state, or spawn
subagents. Accept `--force` to reinstall an equal-version development snapshot.

## Procedure

1. Run `codex plugin list --json` and `codex plugin marketplace list --json`.
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
   snapshot. Always create or migrate the independent native configuration:

   ```bash
   python3 NEW_PLUGIN/skills/setup/scripts/manage_config.py ensure --version NEW_VERSION
   ```

   This fills missing safe defaults and updates helper metadata while
   preserving every configured and opaque operator value. It never reads or
   writes Claude Code or opencode configuration. Cross-runtime copying belongs
   only to an explicit `$team-harness:setup` import.

5. Read `agent-scope` from the native config (the ensured default is
   `global`) and reconcile all six bundled agents automatically:

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
   `PermissionRequest` or approval-classifying guards. Hook trust remains an
   operator action through `/hooks`; never bypass it.

8. Verify the installed plugin version, native settings, six agent files, and
   MCP list. Report old/new versions, marketplace result, config migration,
   agent reconciliation, hook status, and any recovery command. State that a
   new Codex thread is required; the operator must start a new Codex thread to
   activate new skills, agents, MCP tools, and hook bytes. Never claim the
   current thread updated itself.

Even when plugin versions compare equal, steps 4–7 still run. Update is also a
repair/convergence command, not only a version downloader.
