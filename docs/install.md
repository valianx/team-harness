# Installation guide

## Codex beta (POSIX only)

Install from the repository marketplace:

```text
codex plugin marketplace add valianx/team-harness
codex plugin add team-harness@team-harness
```

Plugin installation is separate from generated-agent placement for pipeline
specialists and independent reviewers. Use `$team-harness:setup` and bundled
native helpers for those TOML agents. The current principal can use `init` for
lightweight intake, `spec` for development with written intent and independent
review, or `pipeline` for broader coordination. Plugin-only skills can run
without additional executors. Use `reload` to refresh supported components and
report any actual activation gap. See
[`codex-runtime.md`](./codex-runtime.md) for the contributor/offline
flow, upgrade, and removal.

Detailed installation reference. For the **canonical install**, see the [README](../README.md#install).

---

## Plugin install (canonical)

The Claude Code plugin is the canonical install path. Run the following three commands inside Claude Code:

```
/plugin marketplace add valianx/team-harness
/plugin install th
/th:setup
```

`/th:setup` configures workspace mode (local, Obsidian or a supported native Space),
native preferences and the managed instruction block. Context7 is optional;
existing MCP registrations and credentials are preserved. Activate changed plugin
assets with `/reload-plugins`; reconnect only for a demonstrated activation need.

---

## Native-runtime installer (contributors / offline / CI)

The Go binary installs agents and skills for OpenCode or Codex through explicit
subcommands. Claude Code uses the marketplace path above. The bootstrap scripts
`bin/install.sh`, `bin/install.ps1`, and `bin/install.cmd` print the native
Claude Code commands and exit without downloading when called with no
subcommand. They download and forward arguments for `plan`, `apply`, `update`,
`uninstall`, or the explicit `setup models` action.

Examples:

```text
install apply --runtime opencode --scope global
install apply --runtime codex --scope project
install update --runtime opencode --scope global --non-interactive
```

See [`bin/README.md`](../bin/README.md) for bootstrap details. Native host
activation determines whether a reload or reconnect is needed.

---

### Native-runtime configuration

The installer applies the selected manifest and preserves existing native
configuration. Context7 can be configured explicitly with the runtime's native
MCP command and `CONTEXT7_API_KEY`; Team Harness does not ask for or copy
Memory or Context Harness credentials. Workspace, language, voice, and native
permission settings remain operator-owned.

---

### Native model selection

Choose the chat model and reasoning effort with the active runtime's native controls.
OpenCode and Pi offer [guided worker model profiles](../skills/setup/references/worker-models.md)
for reasoning, general and mechanical work, with role overrides and inheritance
by default. Existing OpenCode provider tiers remain compatible when profiles are
absent; see [OpenCode model configuration](./opencode-model-config.md). Codex's role
projection and ephemeral model override are documented in the
[Codex runtime guide](./codex-runtime.md#roles-and-model-projection). Claude Code
and OpenCode retain their native approval settings.

### Non-interactive install (CI / scripts)

Pass the native subcommand and runtime explicitly. The binary keeps native
configuration separate and does not require Memory or Context Harness values.

```bash
install apply --runtime opencode --scope global --non-interactive
install update --runtime codex --scope project --non-interactive
```

`CONTEXT7_API_KEY` is read only when Context7 is explicitly configured by the
native runtime. Existing MCP registrations, credentials, and permission
settings are preserved.

---

## From source (contributors)

```bash
git clone https://github.com/valianx/team-harness.git
cd team-harness
go run ./cmd/install apply --runtime opencode --scope global
```

`go run ./cmd/install` builds from local source. With no subcommand it prints
the native Claude marketplace path; pass `apply`, `plan`, `update`, or
`uninstall` with `--runtime opencode|codex` for a native engine. The
`//go:embed` directive snapshots `agents/`, `skills/`, and `hooks/` at compile
time, so the binary reflects your working tree exactly. The bootstrap scripts
always download the released binary — they do not use the local clone.

---

## Optional scaffolds (post-install)

After installing, two optional scaffolds are available via `/th:bootstrap`:

- `/th:bootstrap --scaffold-rereview-workflow` — adds `.github/workflows/team-harness-rereview.yml` to the consumer repo. The workflow posts a PR comment when new commits arrive on a PR that already has a team-harness review, nudging the operator to re-run `/review-pr`. On private repos, each run consumes ~1 GitHub Actions minute.
- `/th:bootstrap --scaffold-review-policy` — adds `.team-harness/review-policy.md` with a starter review policy template. The `reviewer` agent reads this file when present and enforces the declared rules.
  The same file may carry a fenced `yaml` block with `verification: blocking-only | all | off` (default `blocking-only`) and `max_suggestions: <n>` (default `5`); `/th:review-pr` reads both through `review_context.py policy` before dispatching the verifier.

## Invoking the bug-fix and feature pipelines

After install, the native general agent discovers TH skills and coordinates the workflow you select. In Claude Code, use `spec` for written intent and independent review, or select the broader pipeline explicitly:

```
/th:spec fix the pagination bug in the users list
/th:spec add an export-to-CSV feature to the invoices page
/th:pipeline refactor the auth middleware to use the new JWT library
```

**Slash-command shortcuts** select an explicit coordinator flow:

| Command | Equivalent to |
|---|---|
| `/th:pipeline <request>` | Selects the broader four-phase workflow and loads its current contract progressively |
| `/issue #N` | Starts from the fetched GitHub issue body |
| `/design <feature>` | Routes to design direct mode |
| `/deliver` | Routes to delivery direct mode |
| `/recover <feature>` | Resumes an interrupted pipeline |
| `/th:pipelines` | Shows current pipeline state |

**No nested-coordinator dispatch exists to trip an anti-recursion limit.** The native
general agent remains the coordinator; an orchestrator instruction is translated
to that current Main thread by the runtime adapter. It may dispatch bounded
specialists when the selected workflow needs them, using native permissions and
proportionate review. There is no second coordinator or TH gate handoff
(docs/subagent-orchestration.md).

---

## Updating

**Plugin (canonical):** run `/th:update` inside Claude Code. A `th` update is three steps — the skill does two, the operator does one:

1. **Refresh the catalog** — `claude plugin marketplace update team-harness-marketplace` (updates marketplace metadata; downloads nothing).
2. **Download the new version** — `claude plugin update th@team-harness-marketplace` (fetches the new version into the plugin cache).
3. **Activate** — `/reload-plugins` to load the downloaded version. Reconnect only when the host reports that reload cannot activate it.

`/th:update` performs steps 1 and 2 from Bash, then re-syncs the managed general-agent and voice blocks in `~/.claude/CLAUDE.md`. It no longer copies a replacement output style; existing selections follow [the bounded migration](./dev-mode.md#retire-an-existing-developer-mode-selection). Step 3 is operator-driven — the skill cannot reload the session. Running `/th:update` every release keeps both the cache and the fixed-path artifacts aligned; re-running `/th:setup` is **not** part of the update flow. For the full mental model — division of labour, the cache-vs-fixed-path propagation model, and the self-healing property — see [`setup-update-model.md`](./setup-update-model.md).

**Native-runtime binary:** run an explicit `update` for the selected engine. Existing native settings and MCP registrations remain operator-owned.

```bash
install update --runtime opencode --scope global --non-interactive
```

---

## Requirements and read-only status

Start with the selected native host and minimum TH package, reuse a healthy installation,
then configure only chosen optional capabilities. The shared
[requirements catalog](../skills/setup/scripts/setup_requirements.json) identifies prerequisites by operation.

- Claude Code uses its marketplace plugin; Node enables its context/observation hooks.
- Codex uses its native plugin and bundled setup helpers; agent configuration needs Python 3.11+, not the Go installer.
- OpenCode's published installer places assets without a Python or Go toolchain requirement.
- Pi uses its native package lifecycle and [documented Pi/Node minimum](./pi-runtime.md#install-and-maintain), without Python or Go for basic installation.

Request `setup status` through the active host's setup skill for CLI/version, TH package,
configuration health and separate activation evidence. `status --all` explicitly inventories
the other supported hosts without installing or configuring them. Installed files and prior receipts do not prove live activation.
The optional status helper needs Python 3.8+; setup verifies `python3`/`python` or Windows
`py -3`/`python`/`python3` using bounded literal argv. If none works, native inspection continues
with a partial helper diagnostic and recovery, preserving the installation.

GitHub CLI, Context7, Obsidian, native Space access and workflow providers are optional unless the selected capability needs them.
Keep existing preferences, models, permissions and Space bindings; unavailable Space access does not select another context home.
