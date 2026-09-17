---
name: setup
description: "Configure or reconfigure the Team Harness Codex installation: native Team Harness settings, bundled specialist agents, explicitly selected MCP servers, workspace preferences, and workflow discovery."
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

The native general agent must know that Team Harness is available without
changing its identity, coding instructions, permissions, approvals, or model.
Use [the general-agent guide](references/general-agent-guide.md) as the short
managed block for workflow discovery and voice. It names the key skills
(`$team-harness:spec`, `$team-harness:pipeline`, `$team-harness:review-pr`,
`$team-harness:create-pr`, and `$team-harness:apply-review`) and points to
`$team-harness:modes` for the complete catalog.

Resolve all helpers relative to this skill and use them for every managed
write:

- `scripts/manage_config.py` validates, backs up, and atomically writes native
  settings with mode `0o600`.
- `scripts/manage_agents.py` installs or refreshes the twenty bundled generated
  agents without overwriting an unmanaged same-name file.
- `scripts/manage_github_identities.py` validates and atomically manages the
  runtime-neutral GitHub workspace/account routes without reading token bytes.

The general-agent guide is the one guided native-instructions write that does
not use one of these helpers. Follow its managed-block procedure only for a
full setup or the `instructions`/`voice` target; preserve every other line and
native override. Do not implement it by changing a runtime profile or by
writing a second policy layer.

## Routing

With no targeted intent, run the complete flow. For a targeted request, change
only that concern and still ensure the native settings document exists.
Supported targets are `workspace`, `language`, `english-learning`, `memory`,
`context7`, `agents`, `github-accounts`, `clickup`, `obsidian-tasks`,
`flow-telemetry`, `instructions`, and `voice`.

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

2a. For a full setup or the explicit `instructions`/`voice` target, follow the
managed-block procedure in
`references/general-agent-guide.md`. Skip it for every other targeted setup.

3. For a full setup, refresh marketplace metadata and inspect the installed
   plugin with `codex plugin marketplace upgrade team-harness --json` and
   `codex plugin list --json`. If code is stale, run `$team-harness:update`
   before continuing. An unavailable network is non-blocking when the installed
   snapshot is usable.

4. Gather only requested values, showing current values as defaults. Apply all
   selected settings in one `manage_config.py set` command.

   - Workspace defaults to `local`. For `obsidian`, require an existing
     absolute vault path plus a safe relative subfolder. Reject filesystem
     roots, the user home, traversal, globs, and symlink escapes. Team Harness
     stores the selected workspace values but does not change Codex sandbox or
     writable-root policy.
   - Preserve the active Codex approval policy, permission rules, sandbox,
     network access, model, and reasoning effort. Team Harness does not install
     command allow rules or change global runtime execution defaults.
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

5. Reconcile all twenty bundled specialists in the persisted scope on every full
   setup, and whenever `agents` is targeted:

   ```bash
   python3 scripts/manage_agents.py inspect --scope SCOPE
   python3 scripts/manage_agents.py sync --scope SCOPE
   ```

   The spawn-overridable pipeline set is `pipeline-architect`,
   `pipeline-implementer`, `pipeline-tester`, `pipeline-cleaner`, `pipeline-qa`,
   `pipeline-security`, and `pipeline-delivery`; the seven corresponding logical
   role identities retain their standard projections for other bounded skills.
   The direct inline review set is `inline-reviewer`; the PR-review
   set is `reviewer`, `pr-review-qa`, `pr-review-security`, `pr-review-verifier`, and
   `reviewer-consolidator`. Missing files are installed and stale Team Harness-managed
   files are refreshed automatically. A same-name unmanaged file is a blocking
   conflict: report it and do not overwrite it. Writes outside the repository
   use Codex's native permission prompt. Do not use or download the separate Go
   installer; the marketplace snapshot is the source of these agent bytes.
   Inspect and sync report the selected scope and role file changes. They do
   not alter global model, reasoning-effort, or project-document fallback
   settings. When a role file changes, reread the native skill or use the
   installed `../reload/SKILL.md` activation procedure; report activation only
   when the host provides evidence.

6. Configure selected MCP servers after `codex mcp list --json`. Preserve an
   existing registration unless the operator explicitly requests replacement.

   - Memory: register a streamable HTTP URL, optionally with the name (not the
     value) of a bearer-token environment variable:
     `codex mcp add memory --url URL [--bearer-token-env-var ENV_NAME]`.
   - Context7: require `CONTEXT7_API_KEY` in the launch environment without
     printing it, then run
     `codex mcp add context7 --env DEFAULT_MINIMUM_TOKENS=10000 -- npx -y @upstash/context7-mcp@3.2.5`.

7. Re-run the applicable helper inspections and `codex mcp list --json`. Report
   one compact result: native Team Harness config path, workspace/language,
   agent scope and role statuses, GitHub route count when configured, MCP
   registrations, and any activation evidence or pending native reread. Never
   print imported opaque values, secrets, or environment-variable values.

The flow is idempotent. Blank input preserves current values; unrelated native
keys remain untouched; unchanged config and agent files are not rewritten.
