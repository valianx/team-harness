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

Then invoke `$team-harness:setup`. The setup skill writes native settings to
`${CODEX_HOME:-$HOME/.codex}/.team-harness.json`, configures workspace and
language preferences, offers Memory/context7 MCP registration, checks hook
trust, and can place the six specialist agents in project or global scope.
It can import all missing values from Claude Code or opencode without printing
opaque values; existing Codex-native values always win.

Contributors testing an already trusted local checkout can replace the first
command with `codex plugin marketplace add .`.

For a smaller Git checkout, include both the catalog and its local plugin source:

```text
codex plugin marketplace add valianx/team-harness \
  --sparse .agents/plugins \
  --sparse plugins/team-harness
```

Use `$team-harness:update` for the normal update flow. It refreshes the
marketplace, compares versions, asks before replacing the installed plugin,
preserves native settings, and offers to align an existing specialist-agent
installation. The underlying manual sequence remains `codex plugin marketplace
upgrade team-harness`, remove `team-harness@team-harness`, then add it again.
Run `codex plugin marketplace remove team-harness` only when no installed
plugin still depends on it.

During local plugin development, make a real file change before reinstalling so
the development cache key changes; then remove and add
`team-harness@team-harness` again and start a new thread. If no source byte has
changed, Codex may correctly reuse the same cached snapshot.

Codex requires explicit trust before repository hooks execute. Review
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

Plugin installation and agent installation are separate. The plugin supplies
nine skills (`setup`, `update`, `init`, `pipeline`, `design`, `implement`,
`validate`, `deliver`, `recover`). The Go installer supplies the six generated project or global
agents without modifying `config.toml`. The commands below assume the released
installer binary is available as `install`. Without that binary, run the same
subcommands as `go run github.com/valianx/team-harness/cmd/install@latest ...`
from the target project root (Go 1.25.8+); contributors working in this checkout
may use `go run ./cmd/install ...` instead:

```bash
install apply --runtime codex --scope project
install update --runtime codex --scope project
install uninstall --runtime codex --scope project
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
`$CODEX_HOME/agents/` scope before it delegates. Install them separately and
start a new Codex thread after placement. The plugin-only skills remain
available for direct use when the agents are not installed.

## Roles and model projection

`Main` stays in ordinary direct mode until the live operator mentions the
plugin. `@Team-Harness init <task>` loads only the lightweight orchestrator
kernel: it begins conversational intake and handles simple bounded work directly
without workspace state, gates, agent preflight, or subagents. If a task would
benefit from the full workflow, it recommends `@Team-Harness pipeline <task>`
and waits for the operator.

Only that explicit pipeline invocation (or explicit approval after intake)
loads the phase contracts. `Main` then owns pipeline state and delegates
directly to `architect`, `implementer`, `tester`, `qa`, `security`, and
`delivery`. It does not spawn a seventh or persistent orchestrator and returns
to direct behavior when the workflow completes or is explicitly aborted.

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

Codex's `PermissionRequest` path keeps the native operator prompt
authoritative: a classifier `allow` is never converted into an automatic
approval. Only deterministic deny floors emit a Codex deny; without an
explicit Codex-scoped, action-bound authorization (not present in this beta),
all other permission requests produce no decision.

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
