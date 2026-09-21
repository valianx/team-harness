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

Route the explicit targets `openspec`, `superpowers`, `tea`, `semgrep`,
`dependency-cruiser`, `knip`, `sentry`, `find-bugs`, `quality` and `quality-tools`
(also `bmad tea`)
here before inspecting or reconciling TH configuration. For a provider-only
request, complete that route and return without creating TH settings. Continue
the TH-specific procedure only when TH setup was also requested.

Match provider names as complete words in the requested target, never as
substrings: `team` and `team-harness` do not select `tea`. TH-only options apply
only to a separately requested TH operation.

Read [the shared upstream-tool integration reference](../spec/references/upstream-tools.md)
when the operator names OpenSpec, Superpowers, TEA, or a quality capability. Full setup may
report whether a provider is installed without installing it implicitly. For an explicit
request, use the official OpenSpec package/project lifecycle, Superpowers plugin lifecycle,
BMAD TEA module lifecycle, or the selected quality provider's owner route. Preserve
provider-owned files and configuration; report installed, discoverable and usable states
separately from the active session. Propose a reload/restart only for a documented host
limitation or observed stale activation.

## Quality capability route

`quality`/`quality-tools` is a selector, not an install-all command. Ask for the applicable
objective and stack before preparing one capability. Read the policy's `quality_providers` and
the [shared upstream-tool reference](../spec/references/upstream-tools.md), then:

1. Reuse a healthy project-managed executable or native skill on the active OpenCode host.
2. For missing/unusable selected tools, use the official route: Semgrep CE via Brew/Python/uv/
   pipx; dependency-cruiser or Knip via npm project/tool-cache installation; Sentry `find-bugs`
   via `npx --yes skills@1.7.0 add getsentry/skills --skill find-bugs --agent opencode --global --yes`.
3. Verify the resolved version, prerequisites, invocation and workspace output before handing the
   capability to audit, find-bugs or review-pr. Do not install inactive-host capabilities or
   change project manifests unless that product change is separately authorized.
4. Report any pending native activation and its recovery. The basename `find-bugs` may refer to
   TH's project/module skill or Sentry's captured-branch method; resolve by owner/source and
   objective, never by basename alone.

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
