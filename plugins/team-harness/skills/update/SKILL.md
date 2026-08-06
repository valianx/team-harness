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
   Read and validate `OLD_VERSION` from its `.codex-plugin/plugin.json`. Run
   `codex plugin list --json` and `codex plugin marketplace list --json`.
   Require `team-harness@team-harness`; otherwise direct the operator to the
   marketplace install followed by `$team-harness:setup`.

2. Refresh only this marketplace, then inspect the refreshed plugin listing:

   ```text
   codex plugin marketplace upgrade team-harness --json
   codex plugin list --json
   ```

   Resolve the plugin's lexical marketplace
   `source.path`, validate that source's `.codex-plugin/plugin.json`, and read
   `AVAILABLE_VERSION` there. Do not treat the version displayed by `plugin
   list` as the running version: after a marketplace refresh it can describe
   the refreshed source while the current thread still uses `OLD_PLUGIN`.
   Compare `OLD_VERSION` and `AVAILABLE_VERSION` semantically:

   - newer: continue with installation;
   - equal with `--force`: continue with an equal-version development refresh;
   - equal without `--force`: skip installation and use the current snapshot;
   - older: stop before installation and report the stale marketplace; `--force`
     never authorizes a downgrade.

   A local marketplace is already source-current and is reinstalled only with
   `--force`.

3. For the newer and equal-plus-`--force` cases only, install or refresh the
   marketplace snapshot in place through Codex's native permission flow:

   ```text
   codex plugin add team-harness@team-harness --json
   ```

   Capture the command's JSON `installedPath` and `version` as `NEW_PLUGIN` and
   `NEW_VERSION`, then validate the installed manifest at that exact lexical
   path. `plugin add` is idempotent for an existing installation and preserves the
   active plugin until the replacement is ready. **Never run `codex plugin
   remove` during update:** a live thread's trusted `PreToolUse` hooks resolve
   through the installed versioned cache path, so removing it first creates a
   fail-closed gap that can block the subsequent add command itself. Do not
   remove the marketplace either. If add fails, stop and report the error; the
   prior installation remains the recovery path and must not be removed or
   repaired manually by this skill.

   When no install is required, set `NEW_PLUGIN=OLD_PLUGIN` and
   `NEW_VERSION=OLD_VERSION`.

4. The running skill text is still the old snapshot. Initialize the
   post-install convergence result as `pending`. From this point,
   `NEW_PLUGIN` and `NEW_VERSION` are the only operational source: never
   execute a helper, inspect a hook, or derive the post-update installed
   version from `OLD_PLUGIN`.

   Bridge the current thread's old versioned path to the validated new
   snapshot using the new helper:

   ```bash
   python3 NEW_PLUGIN/skills/update/scripts/bridge_snapshot.py \
     --old-plugin OLD_PLUGIN --new-plugin NEW_PLUGIN
   ```

   The helper writes only inside the common
   `plugins/cache/team-harness/team-harness/` directory. It creates a missing
   old path or atomically repoints an existing in-cache symlink, but never
   replaces a real directory or an unrelated symlink. Preserving a real old
   snapshot is intentional: the running thread remains operational on those
   already-loaded bytes and the helper reports `restartRequired: true` instead
   of risking a live-path deletion. A missing or previously bridged old path can
   still point safely at the new snapshot. Preserve the helper's
   `restartRequired` result for the final report.

   Always create or migrate the independent native configuration:

   ```bash
   python3 NEW_PLUGIN/skills/setup/scripts/manage_config.py ensure --version NEW_VERSION
   ```

   This fills missing safe defaults and updates helper metadata while
   preserving every configured and opaque operator value. It never reads or
   writes Claude Code or opencode configuration. Cross-runtime copying belongs
   only to an explicit `$team-harness:setup` import.

   Reconcile the native multi-agent backend on every update, including an
   equal-version repair. These commands are idempotent and make the V2 runtime
   requirement explicit instead of relying on a prior setup:

   ```text
   codex features enable multi_agent
   codex features enable multi_agent_v2
   ```

5. Read `agent-scope` from the native config (the ensured default is
   `global`) and reconcile all twelve bundled agents automatically:

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
   deterministic deny hooks (`policy-block`, `gcp-guard`, and the deny-only
   `gate-guard` force-push floor) and no `PermissionRequest` or
   approval-classifying guards. Verify both commands
   prefer `PLUGIN_ROOT`, accept Codex's `CLAUDE_PLUGIN_ROOT` compatibility
   alias without depending on a Claude Code installation, and recover a
   replacement snapshot from the same Codex cache without exiting `127`. Hook
   trust remains an operator action through `/hooks`; never bypass it.

   Steps 4–7 are one retryable convergence sequence. The bridge helper is
   idempotent; config ensure and agent sync are idempotent and repair partial
   prior writes; MCP inspection and hook verification are read-only. If any
   step fails, stop before the success report and return
   `partial-convergence` with the failed step, `OLD_PLUGIN`/`OLD_VERSION`,
   `NEW_PLUGIN`/`NEW_VERSION`, and `$team-harness:update` as the exact retry.
   Never remove or roll back the installed plugin, reverse a completed bridge,
   restore a config backup, or undo synchronized agents: the prior snapshot
   remains available, and rerunning update safely recomputes the version state
   and resumes every idempotent step. A retry that reaches the same bridge,
   config, or agent state is a no-op; step 8 is emitted only after every step
   succeeds.

8. Verify the installed plugin version, native settings, both multi-agent
   features, twelve agent files, MCP list, and bridge target. Report old/new
   versions, marketplace result, config migration, V2 feature reconciliation,
   agent reconciliation, hook status, bridge status, and any recovery command.
   When the bridge reports `restartRequired: false`, state
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
