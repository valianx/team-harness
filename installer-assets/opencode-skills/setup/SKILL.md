---
name: setup
description: Configure or reconcile the native Team Harness opencode installation, preferences, agents, skills, and commands.
---

# Set up Team Harness in opencode

Inspect the active opencode config root and `.team-harness.json` without
reading Claude Code or Codex configuration. Reconcile the installed Team
Harness ledger, agents, skills, commands, and operator preferences through the
native installer when it is available. Preserve unknown configuration keys,
never print secret values, and ask before adding MCP credentials or performing
machine-wide writes.

Report the config root, installed version, changed components, preserved
settings, and whether a new opencode session is required for discovery.

## Upstream provider route

Route the explicit targets `openspec`, `superpowers`, and `tea` (also `bmad tea`)
here before inspecting or reconciling TH configuration. For a provider-only
request, complete that route and return without creating TH settings. Continue
the TH-specific procedure only when TH setup was also requested.

Match provider names as complete words in the requested target, never as
substrings: `team` and `team-harness` do not select `tea`. TH-only options apply
only to a separately requested TH operation.

Read [the shared upstream-tool integration reference](../spec/references/upstream-tools.md)
when the operator names OpenSpec, Superpowers, or TEA. Full setup may report whether a
provider is installed without installing it implicitly. For an explicit request, use the
official OpenSpec package/project lifecycle, Superpowers plugin lifecycle, or BMAD TEA
module lifecycle and native entries. Preserve provider-owned files and configuration;
report installed capability separately from active session and propose a reload/restart
only for a documented host limitation or observed stale activation.

## GitHub identity routes

For a full setup or an explicit `github-accounts` target, use the packaged
`scripts/manage_github_identities.py` helper. It implements the same portable
schema as Claude Code and Codex under the opencode-native settings document:

```json
{
  "github": {
    "account_routes": [
      {
        "workspace": "/absolute/workspace/prefix",
        "host": "github.com",
        "account": "github-login",
        "config_dir": "/optional/isolated/GH_CONFIG_DIR"
      }
    ]
  }
}
```

Run `python3 scripts/manage_github_identities.py --runtime opencode show`, ask
for the operator's routes, and never ship or infer developer-specific accounts
or paths. Longest matching workspace prefix wins. `config_dir` is optional; when
present it must contain a regular mode-`0600` `hosts.yml` in a private directory
outside every git worktree. This isolated strategy is preferred. When absent,
publication may use a just-in-time `gh auth switch` compatibility strategy and
must serialize GitHub writes for that host.

Persist the complete array with:

```bash
python3 scripts/manage_github_identities.py --runtime opencode configure \
  --routes-json '<validated JSON array>'
```

The helper rejects token-shaped input, preserves unrelated config keys, backs
up an existing document, and writes atomically at mode `0600`. It never reads or
stores token bytes. Provisioning an isolated directory with
`GH_CONFIG_DIR=<dir> gh auth login` remains an operator action.
