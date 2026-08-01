# Codex configuration resolution

Resolve Team Harness configuration before any direct-mode intake or work.
This is read-only: never create, repair, migrate, or update configuration from
a direct mode.

1. Read `${CODEX_HOME:-$HOME/.codex}/.team-harness.json` first.
2. If the native file is absent, try `~/.claude/.team-harness.json`, then the
   opencode path resolved from `OPENCODE_CONFIG_DIR`,
   `$XDG_CONFIG_HOME/opencode`, or `~/.config/opencode`.
3. If a higher-priority file exists but is malformed, report a concise warning
   and use safe defaults. Do not hide corruption by falling through to another
   runtime's file.
4. Accept only correctly typed values. Ignore an invalid individual key and
   name it in one warning:
   - `logs-mode`: `local` or `obsidian`.
   - `logs-path` and `logs-subfolder`: non-empty strings; an Obsidian path is
     usable only when the base is absolute, non-root, and accessible.
   - `language`: two lowercase letters.
   - `english_learning`, `obsidian_tasks`, and `flow_telemetry.enabled`:
     booleans.
   - `lane_autoselect`: `announce-and-proceed-on-trivial` or `always-stop`.
   - `clickup.workspace_id`: a string.
5. Apply `language` to responses and operator-facing workspace prose.
   `english_learning: true` adds the configured brief correction signal only
   when the operator writes in English; it never changes the response language.
   Other keys apply only when the requested direct operation uses that surface.
6. Reading workspace settings does not authorize creating a workspace. Direct
   mode remains workspace-free unless the operator's actual bounded task asks
   for a file output. Pipeline activation independently revalidates the same
   configuration before choosing its workspace.

When a compatibility source is used, mention it once and recommend
`$team-harness:setup` to import the values into native Codex configuration.
