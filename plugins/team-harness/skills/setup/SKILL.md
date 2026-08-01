---
name: setup
description: Configure or reconfigure Team Harness for Codex, including its native settings, workspace location, response language, optional MCP servers, six custom agents, and hook trust. Use when the operator invokes Team Harness setup, asks to configure the Codex plugin, or wants to change one Team Harness setting without starting the gated pipeline.
---

# Team Harness setup for Codex

Configure the installed Codex runtime. This is a standalone lifecycle utility:
do not activate the Team Harness pipeline, create pipeline state, or spawn
subagents while running setup.

Store Team Harness settings in
`${CODEX_HOME:-$HOME/.codex}/.team-harness.json`. Never create or modify
`~/.claude/CLAUDE.md`, `~/.claude/settings.json`, Claude output styles, or
Claude plugin state. If the native Codex settings file is absent and
Claude Code or opencode has a `.team-harness.json`, offer an import of
all missing values, including opaque sensitive values; never overwrite an
existing Codex value during import. Resolve opencode from `OPENCODE_CONFIG_DIR`, then
`$XDG_CONFIG_HOME/opencode`, then `~/.config/opencode`.

Use `scripts/manage_config.py` for every Team Harness settings read or write.
It validates values, preserves unrelated keys, creates a rolling `0o600`
backup, and replaces the document atomically. Do not improvise writes to the
JSON file.

## Intent routing

With no targeted intent, run the complete flow. For a targeted request, handle
only the named concern and then report it:

- `workspace` or `obsidian`: workspace output mode and path.
- `language`: persistent response/workspace language.
- `english-learning`: English correction mode.
- `memory` or `context7`: the matching MCP server.
- `agents`: the six Codex specialist agents.
- `clickup`, `obsidian-tasks`, `lane-autoselect`, or `flow-telemetry`: the
  matching settings key.

Do not run the marketplace freshness check for a targeted request.

## Procedure

1. Resolve the bundled script relative to this skill directory and run:

   ```bash
   python3 scripts/manage_config.py show
   ```

   Treat malformed native JSON as a blocking configuration error. If the
   output reports one or more import sources, show their paths and ask which
   source to import first. Inspect each source without displaying values:

   ```bash
   python3 scripts/manage_config.py inspect-import --from claude
   python3 scripts/manage_config.py inspect-import --from opencode
   ```

   Show only the source path, importable key names, preserved native key names,
   and excluded helper-managed metadata key names. When both exist, do not merge them silently: the
   selected first source wins because imports fill only missing native keys.
   On approval run the matching command:

   ```bash
   python3 scripts/manage_config.py import --from claude
   python3 scripts/manage_config.py import --from opencode
   ```

   The helper copies values directly from source JSON to the native `0o600`
   document without printing them or putting them in command arguments. It
   deep-fills missing keys, never overwrites an existing native value, and
   records source, path, imported key names, and timestamp under
   `migration.imports`. It excludes only helper-managed metadata. Values such
   as Claude's `autogate` are preserved for lossless migration but remain inert:
   Codex hooks explicitly strip them before permission evaluation. Preview key
   names before import and report keys preserved because they were already
   configured.

2. For a full setup, run the advisory freshness check:

   ```bash
   codex plugin marketplace upgrade team-harness --json
   codex plugin list --json
   ```

   If the installed plugin version is behind the refreshed marketplace entry,
   recommend `$team-harness:update` and ask whether to update first or continue.
   An offline or unavailable marketplace is non-blocking; state that freshness
   could not be checked.

3. Gather only the requested settings. Show existing values as defaults.

   - Workspace: choose `local` (default, `{repo}/workspaces/`) or `obsidian`.
     For Obsidian require an existing absolute vault path and a safe relative
     subfolder, default `work-logs`. Do not accept a filesystem root, the user
     home, `..`, or glob metacharacters. Explain that Codex may request access
     to the external directory according to its native sandbox policy; never
     weaken global permissions automatically.
   - Language: accept a two-letter lowercase ISO 639-1 code, or remove the key
     to restore automatic detection.
   - English learning, Obsidian Tasks, and flow telemetry: boolean values.
     Telemetry is opt-in and defaults off.
   - Lane auto-select: accept only `announce-and-proceed-on-trivial` or
     `always-stop`.
   - ClickUp: store only the workspace ID. Never store a token.

   Apply the chosen values in one command using repeated `--set KEY=JSON`
   arguments, and use `--remove KEY` for a requested reset. Examples:

   ```bash
   python3 scripts/manage_config.py set --set 'logs-mode="local"' --version 3.7.0
   python3 scripts/manage_config.py set --set 'language="es"'
   python3 scripts/manage_config.py set --set 'english_learning=true'
   python3 scripts/manage_config.py set --remove language
   ```

   Writes outside the current repository remain subject to Codex's native
   approval prompt. Never claim a write succeeded before re-running `show`.

4. Configure MCP servers only when selected. Inspect first with
   `codex mcp list --json`. Replacing an existing server requires showing the
   exact non-secret configuration and obtaining explicit approval before
   `codex mcp remove NAME` followed by `codex mcp add`.

   - Memory: ask for a streamable HTTP URL and, optionally, the *name* of an
     environment variable containing its bearer token. Never ask Codex to echo
     or persist the token value. Use:

     ```bash
     codex mcp add memory --url URL
     codex mcp add memory --url URL --bearer-token-env-var ENV_NAME
     ```

   - Context7: require `CONTEXT7_API_KEY` to be present in the environment that
     launches Codex, without printing it, then use:

     ```bash
     codex mcp add context7 --env DEFAULT_MINIMUM_TOKENS=10000 -- npx -y @upstash/context7-mcp
     ```

   A new Codex thread is required before newly added MCP tools are available.
   Verify connectivity only in that new thread; do not claim a server is
   connected merely because registration succeeded.

5. Configure specialists when selected. Check for the complete set
   `architect.toml`, `implementer.toml`, `tester.toml`, `qa.toml`,
   `security.toml`, and `delivery.toml` in project `.codex/agents/` and global
   `${CODEX_HOME:-$HOME/.codex}/agents/`. If missing, ask for project or global
   scope and obtain approval before running the installed Team Harness binary:

   ```bash
   install apply --runtime codex --scope project
   install apply --runtime codex --scope global
   ```

   If `install` is unavailable, report the documented fallback
   `go run github.com/valianx/team-harness/cmd/install@latest apply ...`; do not
   download or execute it without approval.

6. Explain that hooks require operator review and trust through `/hooks`.
   Never approve or bypass hook trust on the operator's behalf.

7. Re-run `manage_config.py show` and `codex mcp list --json`, then give one
   compact summary: native config path, workspace mode, language, MCP
   registrations, agent scope/completeness, hook-trust next step, and whether a
   new thread is required. Do not print secrets or environment-variable values.

The flow is idempotent: keep current values on blank input, preserve unrelated
config keys, and avoid writes when the resolved document is unchanged.
