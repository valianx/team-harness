# Codex runtime (POSIX-only beta)

Team Harness ships a Codex plugin at `plugins/team-harness/` and a repository
marketplace at `.agents/plugins/marketplace.json`. The tagged Git tree is the
artifact; there is no separate Codex archive.

## Install and lifecycle

Add the repository marketplace, install the plugin, and start a new thread:

```text
codex plugin marketplace add valianx/team-harness
codex plugin add team-harness@team-harness
```

Then invoke `$team-harness:setup`. The marketplace only distributes code;
setup converges the operational installation. It writes native settings to
`${CODEX_HOME:-$HOME/.codex}/.team-harness.json`, configures workspace and
language preferences, offers Memory/context7 MCP registration, verifies hook
trust, and places the six bundled specialist agents in project or global scope.
An explicit setup import can copy missing values from Claude Code or opencode
without printing opaque values; normal Codex modes never read another
runtime's configuration and existing Codex-native values always win.

Contributors testing an already trusted local checkout can replace the first
command with `codex plugin marketplace add .`.

For a smaller Git checkout, include both the catalog and its local plugin source:

```text
codex plugin marketplace add valianx/team-harness \
  --sparse .agents/plugins \
  --sparse plugins/team-harness
```

Use `$team-harness:update` for the normal update flow. It refreshes the
marketplace, compares versions, replaces the installed plugin through native
permissions, ensures native settings exist, and automatically aligns all six
bundled agents in the configured scope. It also repairs configuration and
agents when the version is current. The underlying manual sequence remains `codex plugin marketplace
upgrade team-harness`, remove `team-harness@team-harness`, then add it again.
Run `codex plugin marketplace remove team-harness` only when no installed
plugin still depends on it.

During local plugin development, make a real file change before reinstalling so
the development cache key changes; then remove and add
`team-harness@team-harness` again and start a new thread. If no source byte has
changed, Codex may correctly reuse the same cached snapshot.

Codex requires explicit trust before repository hooks execute. The plugin wires
only deterministic-deny hooks (`policy-block` and the catastrophic branch of
`gcp-guard`); approval-classifying guards are omitted because Codex has no
hook-level `ask` and native permissions own approvals. Review
`plugins/team-harness/hooks/hooks.json` and its scripts before trusting the
checkout; never bypass hook trust for an unreviewed repository. Hooks and the
installer beta currently require a POSIX shell. Installation or updates are
picked up only by a new Codex thread.

For contributors, the generated project `.codex/config.toml` keeps
`workspace-write` plus `on-request` approvals, enables dependency network
access, and grants write access only to the current user's standard Go, uv,
npm, and Go module cache directories. This avoids shared predictable `/tmp`
paths and broad write access to `$HOME`. Temporary `.git`
directories remain protected by Codex and any test that constructs them still
requires a narrowly scoped live approval.

The plugin supplies nine skills (`setup`, `update`, `init`, `pipeline`,
`design`, `implement`, `validate`, `deliver`, `recover`) and the six generated
agent definitions used by setup/update. Consumers do not need the Go installer.
These helper commands remain available for diagnostics and manual recovery:

```bash
python3 PLUGIN/skills/setup/scripts/manage_agents.py inspect --scope project
python3 PLUGIN/skills/setup/scripts/manage_agents.py sync --scope project
python3 PLUGIN/skills/setup/scripts/manage_agents.py sync --scope global
```

The current release uses one version namespace across five sites: the Claude
plugin manifest, Claude marketplace entry, Codex plugin manifest, `CLAUDE.md`
current-version line, and the installer's checked-in `var version` fallback.
CI and the prepublish guard require these sites to be changed together when a
distributed runtime input changes. Repositories that predate the Codex plugin
or installer path retain optional-site compatibility until that path exists.

The six agents are a mandatory prerequisite for the gated `pipeline` skill,
but not for lightweight `init` intake:
the primary thread must find a complete set of `architect.toml`,
`implementer.toml`, `tester.toml`, `qa.toml`, `security.toml`, and
`delivery.toml` in either the project `.codex/agents/` or global
`$CODEX_HOME/agents/` scope before it delegates. Setup/update install them from
the marketplace snapshot; start a new Codex thread after placement. The plugin-only skills remain
available for direct use when the agents are not installed.

## Roles and model projection

`Main` stays in ordinary direct mode until the live operator mentions the
plugin. `@Team-Harness init <task>` loads only the lightweight orchestrator
kernel: it begins conversational intake and handles simple bounded work directly
without workspace state, gates, or agent preflight. A live request for tester,
QA, or security is also supported as a workspace-free inline review; it does not
activate the pipeline or require a six-agent preflight.

Only that explicit pipeline invocation (or explicit approval after intake)
loads the phase contracts. `Main` then owns pipeline state and delegates
directly to `architect`, `implementer`, `tester`, `qa`, `security`, and
`delivery`. It does not spawn a seventh or persistent orchestrator and returns
to direct behavior when the workflow completes or is explicitly aborted.

### Workspace-free inline review

For a non-PR inline review, `Main` records `requested_lenses` and
`required_lenses` (every operator-named lens is required), captures a canonical
realpath-and-digest evidence manifest, and sends each lens the same package with
`target_id` and `manifest_digest`. Codex uses an effective read-only tool profile
only when it can prove one; otherwise the lens receives Main-pre-captured bytes
and results only, with no shell, network, publication, or direct tree access.
Each lens returns a terminal status and evidence-bound findings; missing or
mismatched evidence is `incomplete`/`untrusted`, and global PASS requires every
required lens to be complete and validated. No workspace, state, events, gates,
Stage Gate, branch, delivery record, or publication is created. Any PR intent,
number, or URL has exclusive `review-pr` precedence and retains that flow's
snapshot, lens selection, consolidation, preview, and publication gate.

Skill activation does not change Main's selected model, reasoning effort,
sandbox, or approval policy. The projection below applies to the six spawned
specialists:

| Claude role metadata | Codex model | Effort |
|---|---|---|
| `opus` + `xhigh` | `gpt-5.6-sol` | `xhigh` |
| other `opus` | `gpt-5.6-sol` | `xhigh` |
| non-`opus` | `gpt-5.6-luna` | `max` |

`.codex/README.md` is the generated roster. After editing canonical role
metadata or adapters, run `$sync-codex-agents`; do not hand-edit generated TOML.

Codex's native sandbox and permission path remain authoritative. Only
deterministic deny floors emit a hook decision; hook-level `ask` and classifier
`allow` are never translated into authorization.

## Verify

```bash
node tools/codex-runtime/generate.mjs --check
node tools/codex-runtime/test_generate.mjs
node tools/codex-runtime/validate-marketplace.mjs
node tools/codex-runtime/sync-hooks.mjs --check
bash tests/test_codex_hooks.sh
python3 tests/test_codex_runtime.py
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/team-harness
```

The final command is an optional contributor check when the system
`plugin-creator` skill is installed; CI uses the repository structural validator.
