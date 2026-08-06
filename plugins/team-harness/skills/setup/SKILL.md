---
name: setup
description: "Configure or reconfigure the complete Team Harness Codex installation: native settings, bundled specialist agents, optional MCP servers, workspace preferences, and hook verification. Use when the operator invokes Team Harness setup or asks to configure any Codex integration."
---

# Team Harness setup for Codex

Converge the installed Codex runtime. The marketplace distributes plugin code;
this skill configures that code for use. Do not activate a pipeline, create
pipeline state, or spawn subagents.

Team Harness settings are native and runtime-isolated at
`${CODEX_HOME:-$HOME/.codex}/.team-harness.json`. Never read Claude Code or
opencode settings during ordinary operation and never modify their files.
The only cross-runtime operation allowed here is an explicit one-time copy of
values selected by the operator.

Resolve all helpers relative to this skill and use them for every managed
write:

- `scripts/manage_config.py` validates, backs up, and atomically writes native
  settings with mode `0o600`.
- `scripts/manage_agents.py` installs or refreshes the twelve bundled generated
  agents without overwriting an unmanaged same-name file.
- `scripts/manage_github_identities.py` validates and atomically manages the
  runtime-neutral GitHub workspace/account routes without reading token bytes.

## Routing

With no targeted intent, run the complete flow. For a targeted request, change
only that concern and still ensure the native settings document exists.
Supported targets are `workspace`, `language`, `english-learning`, `memory`,
`context7`, `agents`, `features`, `github-accounts`, `clickup`, `obsidian-tasks`, and
`flow-telemetry`.

`lane-autoselect` is legacy migration metadata, not a supported target or an
active selector. Never use it to choose a route; require the live operator's
choice:

```text
1 — inline
2 — pipeline
```

Remove the legacy key only during a legitimate configuration write or explicit
migration, and preserve every unrelated value.

## Procedure

1. Inspect native state:

   ```bash
   python3 scripts/manage_config.py show
   ```

   Malformed native JSON is blocking; never fall through to another runtime.
   When the native file is absent and Claude Code or opencode import sources
   are available, offer a one-time import. This is the sole exception to
   runtime isolation. Inspect without displaying values:

   ```bash
   python3 scripts/manage_config.py inspect-import --from claude
   python3 scripts/manage_config.py inspect-import --from opencode
   ```

   Show only paths and key names. After explicit selection, copy with
   `import --from SOURCE --version 3.6.5`. The helper deep-fills missing keys,
   copies opaque values without printing them, preserves existing native
   values, and records provenance. Never merge sources silently.

2. Create or migrate native configuration on every setup, including targeted
   setup. This adds safe defaults only when keys are absent and stamps the
   installed version without replacing operator values:

   ```bash
   python3 scripts/manage_config.py ensure --version 3.6.5
   ```

3. For a full setup, refresh marketplace metadata and inspect the installed
   plugin with `codex plugin marketplace upgrade team-harness --json` and
   `codex plugin list --json`. If code is stale, run `$team-harness:update`
   before continuing. An unavailable network is non-blocking when the installed
   snapshot is usable.

4. Only for a full setup or an explicit `features` target, enable Codex
   multi-agent V2 with Codex's native feature writer; do not hand-rewrite the
   global `config.toml`:

   ```bash
   codex features enable multi_agent
   codex features enable multi_agent_v2
   ```

   For every other targeted setup, skip both feature-writer commands and do not
   change global Codex feature state. Confirm both flags with
   `codex features list` only when this step runs. The generated project config
   also enables both flags and supplies the generic `gpt-5.6-terra` / `medium`
   subagent fallback under `[agents]`; it never overrides Main's selected
   Sol/xhigh model. Global installation synchronizes the twelve role files with
   their exact per-role mappings rather than attempting a fragile global model
   config rewrite.

5. Gather only requested values, showing current values as defaults. Apply all
   selected settings in one `manage_config.py set` command.

   - Workspace defaults to `local`. For `obsidian`, require an existing
     absolute vault path plus a safe relative subfolder. Reject filesystem
     roots, the user home, traversal, globs, and symlink escapes. Codex native
     sandbox approval remains authoritative; never weaken it.
   - Language is a two-letter lowercase code or absent for automatic detection.
   - English learning, Obsidian Tasks, and flow telemetry are booleans;
     telemetry defaults off.
   - Legacy `lane-autoselect` values (`announce-and-proceed-on-trivial` or
     `always-stop`) are migration-only and non-authoritative; never set or use
     them to route. Require the live `1 — inline` / `2 — pipeline` choice.
   - ClickUp stores only a workspace ID, never a token.
   - Agent scope is `global` (default, available to every project) or `project`.
     Persist it as `agent-scope`.

   For a full setup or the explicit `github-accounts` target, configure the
   runtime-neutral `github.account_routes` array with
   `scripts/manage_github_identities.py`. First run:

   ```bash
   python3 scripts/manage_github_identities.py --runtime codex show
   ```

   Each entry contains an absolute `workspace` prefix, `host` (default
   `github.com`), `account`, and optional isolated `config_dir`. Ask for values;
   never ship or infer developer-specific accounts or paths. Longest matching
   workspace prefix wins. An isolated `config_dir` is preferred and must contain
   a regular mode-`0600` `hosts.yml` outside every git worktree. Without it,
   delivery uses a just-in-time `gh auth switch` compatibility strategy and
   must serialize GitHub writes for that host. Persist the complete array with:

   ```bash
   python3 scripts/manage_github_identities.py --runtime codex configure \
     --routes-json '<validated JSON array>'
   ```

   The helper rejects token-shaped input and stores only paths, hosts, and login
   names. It preserves every unrelated native setting. Provisioning an isolated
   directory with `GH_CONFIG_DIR=<dir> gh auth login` remains an operator action;
   never read, print, copy, or store token bytes.

6. Reconcile all twelve bundled specialists in the persisted scope on every full
   setup, and whenever `agents` is targeted:

   ```bash
   python3 scripts/manage_agents.py inspect --scope SCOPE
   python3 scripts/manage_agents.py sync --scope SCOPE
   ```

   The pipeline set is `architect`, `implementer`, `tester`, `cleaner`, `qa`, `security`,
   and `delivery`; the direct inline review set is `inline-reviewer`; the PR-review
   set is `reviewer`, `pr-review-qa`, `pr-review-security`, and
   `reviewer-consolidator`. Missing files are installed and stale Team Harness-managed
   files are refreshed automatically. A same-name unmanaged file is a blocking
   conflict: report it and do not overwrite it. Writes outside the repository
   use Codex's native permission prompt. Do not use or download the separate Go
   installer; the marketplace snapshot is the source of these agent bytes.

7. Configure selected MCP servers after `codex mcp list --json`. Preserve an
   existing registration unless the operator explicitly requests replacement.

   - Memory: register a streamable HTTP URL, optionally with the name (not the
     value) of a bearer-token environment variable:
     `codex mcp add memory --url URL [--bearer-token-env-var ENV_NAME]`.
   - Context7: require `CONTEXT7_API_KEY` in the launch environment without
     printing it, then run
     `codex mcp add context7 --env DEFAULT_MINIMUM_TOKENS=10000 -- npx -y @upstash/context7-mcp@3.2.5`.

8. Verify the installed plugin's `hooks/hooks.json`. Codex supports the
   deterministic deny hooks only: `policy-block`, the catastrophic-deny
   portion of `gcp-guard`, and `gate-guard`'s force-push floor. `gate-guard`
   denies direct force flags, `--force-with-lease`, `+refspec` forms, and the
   statically resolved wrapper forms covered by its bounded command analyzer,
   even after `ship`. It does not guarantee detection when a push is assembled
   from runtime-only shell state such as variables, aliases, functions, PATH,
   or Git configuration; this accepted limitation is not expanded in setup,
   and server-side GitHub branch protection remains authoritative. Benign push
   and ordinary GitHub approval ownership remain native. Approval-classifying
   `ask` guards are intentionally not registered because Codex's native
   permission flow owns approvals.
   Explain that the operator must review and trust hooks through `/hooks`;
   never approve or bypass trust.

9. Re-run the applicable helper inspections and `codex mcp list --json`; re-run
    `codex features list` only when step 4 ran. Report one compact result:
    native config path, workspace/language, agent scope and twelve agent statuses,
    GitHub route count when configured, feature-flag status when checked, MCP registrations, hook
    verification/trust, and whether a new thread is required. Never print
    imported opaque values, secrets, or environment-variable values.

The flow is idempotent. Blank input preserves current values; unrelated native
keys remain untouched; unchanged config and agent files are not rewritten.
