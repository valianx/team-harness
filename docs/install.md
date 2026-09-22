# Installation guide

## Codex beta (POSIX only)

Install from the repository marketplace:

```text
codex plugin marketplace add valianx/team-harness
codex plugin add team-harness@team-harness
```

Review and explicitly trust the plugin hooks, then start a new thread. Plugin
installation is separate from the generated-agent placement used by delegated
pipeline, spec completion and PR-review workflows; use `install apply --runtime codex --scope project` for these
generated TOML agents before delegation. Start from a clean `Main` thread and
invoke `@Team-Harness init <task>` for lightweight intake without state or
subagents. Invoke `@Team-Harness pipeline <task>` only for the full gated flow.
No seventh coordinator is installed or selected through `/agent`. Plugin-only skills can still
be used without the agents. See
[`codex-runtime.md`](./codex-runtime.md) for the trusted-checkout contributor
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

`/th:setup` configures your **logs mode** (local `./workspaces/` or an Obsidian vault), native preferences, and the managed instruction block. Context7 remains an optional, explicit MCP integration. Existing MCP registrations and credentials are preserved; setup does not provision Memory or Context Harness. Activate changed plugin assets with `/reload-plugins` when the host supports it, and reconnect only when the host reports that reload cannot activate them.

---

## Native-runtime installer (contributors / offline / CI)

The Go binary installs agents and skills for OpenCode or Codex through explicit
subcommands. Claude Code uses the marketplace path above. The bootstrap scripts
`bin/install.sh`, `bin/install.ps1`, and `bin/install.cmd` print the native
Claude Code commands and exit without downloading when called with no
subcommand. They download and forward arguments only for `plan`, `apply`,
`update`, or `uninstall`.

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

Team Harness does not select an installation tier or rewrite agent model metadata.
Choose the model and reasoning effort with the active runtime's native controls;
Codex's role projection and ephemeral model override are documented in the
[Codex runtime guide](./codex-runtime.md#roles-and-model-projection). Claude Code
and OpenCode continue to use their own native model and approval settings.

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
| `/th:pipeline <request>` | Activates the gated pipeline and loads its contract progressively |
| `/issue #N` | Starts from the fetched GitHub issue body |
| `/design <feature>` | Routes to design direct mode |
| `/deliver` | Routes to delivery direct mode |
| `/recover <feature>` | Resumes an interrupted pipeline |
| `/th:pipelines` | Shows current pipeline state |

**No nested-coordinator dispatch exists to trip an anti-recursion limit.** The orchestrator has `Task` from the start of the session and dispatches every specialist (`architect`, `implementer`, `tester`, `cleaner`, `qa`, `security`, and the rest) directly, as a leaf agent — never another coordinator, never itself. There is no second coordinator to hand off to and no dispatch-handoff round-trip on this path (`docs/subagent-orchestration.md`).

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

## Requirements

**Required:**
- A supported native runtime: [Claude Code](https://docs.claude.com/en/docs/claude-code), Codex, or OpenCode

**Recommended (not required):**
- [`gh`](https://cli.github.com/) CLI — for `/issue`, `/deliver`, and `/review-pr` GitHub integration. When `gh` is absent or unauthenticated, these skills use `curl` against the GitHub REST API (if `$GH_TOKEN`/`$GITHUB_TOKEN` is set) or fall back to operator-paste paths with `blocked-manual-push` status. The installer prints a note when `gh` is missing.

**Optional:**
- [context7](https://context7.com/) API key — for library docs retrieval when explicitly configured

No Python, no `uv` — the installer binary is stdlib-only Go.
