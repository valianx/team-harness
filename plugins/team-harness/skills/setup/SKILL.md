---
name: setup
description: "Configure or reconfigure the complete Team Harness Codex installation: native settings, bundled specialist agents, workspace preferences, and integration verification. Use when the operator invokes Team Harness setup or asks to configure any Codex integration."
---

# Team Harness setup for Codex

Converge the installed Codex runtime. The marketplace distributes plugin code;
this skill configures that code for use. Do not activate a pipeline, create
pipeline state, or spawn subagents.

Team Harness settings are native and runtime-isolated at
`${CODEX_HOME:-$HOME/.codex}/.team-harness.json`. Never read Claude Code or
opencode settings during ordinary operation and never modify their files. MCP
registrations and credentials are owned by the native runtime and are left
untouched unless the operator explicitly configures Context7.

## Upstream provider route

Route the explicit targets `openspec`, `superpowers`, and `tea` (also `bmad tea`)
here before inspecting or reconciling TH configuration. For a provider-only
request, complete that route and return without creating TH settings. Continue
the TH-specific procedure only when TH setup was also requested.

Match provider names as complete words in the requested target, never as
substrings: `team` and `team-harness` do not select `tea`. TH-only options apply
only to a separately requested TH operation.

Read [the shared upstream-tool integration reference](../spec/references/upstream-tools.md)
when the operator names OpenSpec, Superpowers, or TEA. Full setup may report provider
availability without installing anything implicitly. For an explicit provider request,
use its official mechanism under native permissions: OpenSpec's package manager and
project `init`/`update`, Superpowers' host-plugin lifecycle, or the official BMAD TEA
module and upstream test-design, test-review, trace, or runner entry. Preserve provider
files and configuration, and distinguish installed capability from active session; only
propose reload/restart for a documented host limitation or observed stale activation.

Resolve all helpers relative to this skill and use them for every managed
write:

- `scripts/manage_config.py` validates, backs up, and atomically writes native
  settings with mode `0o600`.
- `scripts/manage_agents.py` installs or refreshes the twenty bundled generated
  agents without overwriting an unmanaged same-name file.
- `scripts/manage_github_identities.py` validates and atomically manages the
  runtime-neutral GitHub workspace/account routes without reading token bytes.

## Routing

With no targeted intent, run the complete flow. For a targeted request, change
only that concern and still ensure the native settings document exists.
Provider targets `openspec`, `superpowers`, and `tea` use the route above and do
not enter this settings flow. TH settings targets are `workspace`, `language`, `english-learning`, `context7`,
`agents`, `features`, `github-accounts`, `clickup`, and `obsidian-tasks`.

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
   before continuing. After update, read `skills/setup/SKILL.md` from the
   validated installed root and continue with that version's procedure instead
   of the remembered setup steps. An unavailable network is non-blocking when
   the installed snapshot is usable.

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
   also enables both flags and supplies the generic `gpt-5.6-luna` / `max`
   subagent fallback under `[agents]`. It also sets
   `project_doc_fallback_filenames = ["CLAUDE.md"]`, so Codex reads `CLAUDE.md`
   only at directory levels where `AGENTS.md` is absent; it never overrides
   Main's selected model. Global installation applies both defaults narrowly:
   agent sync
   installs a missing fallback and migrates only the exact formerly managed
   `gpt-5.6-terra` / `medium` pair to `gpt-5.6-luna` / `max`. It preserves any
   other complete operator-selected pair as `custom-preserved`. Standard named
   specialists retain the generated per-role projection table; the seven
   `pipeline-*` identities intentionally omit model and effort so the pipeline
   can supply either that standard pair or one live-session pair at dispatch.
   For project-document
   fallbacks, sync preserves their order and appends `CLAUDE.md` once when it is
   absent.

5. Gather only requested values, showing current values as defaults. Apply all
   selected settings in one `manage_config.py set` command.

   - Workspace defaults to `local`. For `obsidian`, require an existing
     absolute vault path plus a safe relative subfolder. Reject filesystem
     roots, the user home, traversal, globs, and symlink escapes. Preserve the
     configured destination as a Team Harness preference; writing there remains
     subject to the host's native permission boundary. The pipeline's
     non-escalated live write probe remains authoritative before reporting the
     external workspace ready. If that probe fails, report the exact target and
     native refusal rather than rewriting global policy.
   - Preserve the native `sandbox_mode`, `approval_policy`,
     `approvals_reviewer`, `network_access`, and `writable_roots` values. Native
     permission settings and server-side GitHub branch protection remain
     authoritative; TH no longer supplies an additional force-push interceptor.
   - Language is a two-letter lowercase code or absent for automatic detection.
   - English learning and Obsidian Tasks are booleans.
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

6. Preserve native execution policy after applying any selected workspace
   values. Setup does not inspect or reconcile global sandbox, approval,
   network, or writable-root settings.

7. Reconcile all twenty bundled specialists in the persisted scope on every full
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
   Inspect and sync output includes `runtimeConfig`, `runtimeConfigChanged`, and
   `restartRequired`. When sync changes a role or fallback, use the installed
   `../reload/SKILL.md` activation procedure after setup finishes. Verify affected
   components before declaring them ready; reconnect and resume this conversation
   when the host cannot reload them. No-op sync or updates to other roles do not
   invalidate an already verified reviewer profile. Never require a new chat
   solely because setup ran.

8. Inspect MCP registrations with `codex mcp list --json`. Preserve every
   existing registration and credential. Context7 remains an independent,
   explicit option: only when the operator selects the `context7` target,
   require `CONTEXT7_API_KEY` in the launch environment without printing it,
   then run
   `codex mcp add context7 --env DEFAULT_MINIMUM_TOKENS=10000 -- npx -y @upstash/context7-mcp@3.2.5`.
   Team Harness setup never registers Memory or Context Harness servers.

9. The Codex distribution has no TH permission-hook manifest or launcher.
   Treat those retired assets as unnecessary; do not recreate them or request
   hook trust, repair, or restart because they are absent. Preserve the
   operator's native permissions and unrelated hooks. Native policies are not
   claimed to duplicate the checks removed from TH.

10. Re-run the applicable helper inspections and `codex mcp list --json`; re-run
    `codex features list` only when step 4 ran. Report one compact result:
    native config path, workspace/language, agent scope and twenty agent statuses,
    GitHub route count when configured, feature-flag status when checked, MCP registrations,
    workspace destination, pending activation or same-conversation reconnect,
    and any exact native access failure observed while writing there. Report
    that native execution policy was preserved; never print
    imported opaque values, secrets, or environment-variable values.

The flow is idempotent. Blank input preserves current values; unrelated native
keys remain untouched; unchanged config and agent files are not rewritten.
