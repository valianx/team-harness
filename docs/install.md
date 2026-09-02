# Installation guide

## Codex beta (POSIX only)

Install from the repository marketplace:

```text
codex plugin marketplace add valianx/team-harness
codex plugin add team-harness@team-harness
```

Review and explicitly trust the plugin hooks, then start a new thread. Plugin
installation is separate from the thirteen-agent placement required by delegated
pipeline and PR-review workflows; use `install apply --runtime codex --scope project` for the thirteen
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

`/th:setup` configures the two required MCP servers (Memory and context7) and sets your **logs mode** (local `./workspaces/` or an Obsidian vault). After setup, restart Claude Code to pick up the new agents and skills.

---

## Legacy installer (contributors / offline / CI)

> **Note:** The Go binary installer is the legacy install path as of v2.33.0. It remains functional for offline environments, CI pipelines, and operators who require `low-cost` mode (the plugin cannot transform frontmatter on install). End-users installing for the first time should use the plugin path above.

The bootstrap scripts detect your OS and architecture, download the latest released binary from GitHub Releases, and run it. Agents, skills, and hooks are embedded in the binary (no separate downloads) and written directly to `~/.claude/`.

See [`bin/README.md`](../bin/README.md) for the full legacy bootstrap documentation.

After install, **restart Claude Code** to pick up the new agents and MCP servers.

---

### What the installer asks

On an interactive terminal, the installer walks through three prompts in order:

1. **Memory MCP URL** — paste the public URL of your Knowledge Graph MCP server (typically [`context-harness-mcp`](https://github.com/valianx/context-harness-mcp) deployed to Railway, Render, Fly, your own server, or any Docker host). There is **no default URL** — paste your URL or the full JSON snippet from your `context-harness-mcp /dashboard`.
2. **context7 API key** — for library docs retrieval. Get one at [context7.com](https://context7.com/). Preserved from a prior install if already configured.
3. **Install mode** — `[s] standard` (default) or `[l] low-cost`. Press Enter to accept standard.

---

### Install modes

| Mode | Who it's for | What changes |
|---|---|---|
| `standard` (default) | Operators on Max / Team plans | Agent files copied byte-identical; canonical quality contract |
| `low-cost` | Operators on Free / Pro / tight personal budget | Rewrites agent `model:` / `effort:` frontmatter in-flight; all agents run on `sonnet` |

Low-cost trades documented quality for lower API cost. Standard is the default precisely because Max / Team operators should stay there. See [`agents/README.md §"Low-cost mode"`](../agents/README.md#low-cost-mode) for the full matrix and trade-off analysis.

### Non-interactive install (CI / scripts)

Set env vars instead of prompting:

```bash
MEMORY_MCP_URL=https://your-mcp.example.com/mcp \
CONTEXT7_API_KEY=ctx7sk-... \
INSTALL_MODE=standard \
curl -fsSL https://valianx.github.io/team-harness/install.sh | bash
```

| Env var | Required? | Notes |
|---|---|---|
| `MEMORY_MCP_URL` | Yes (for fresh install) | Preserved from existing `~/.claude.json` if already set |
| `MEMORY_MCP_BEARER` | Optional | JWT for authenticated MCPs |
| `CONTEXT7_API_KEY` | Recommended | Empty = context7 features disabled |
| `INSTALL_MODE` | Optional | `standard` (default) or `low-cost` |

---

### Reset MCP config

Pass `--force` to reset existing `mcpServers` entries in `~/.claude.json` (bypass the Keep/Change preservation menu):

```bash
curl -fsSL https://valianx.github.io/team-harness/install.sh | bash -s -- --force
```

The installer always overwrites agents, skills, and hooks in `~/.claude/`. Customizations made directly to those files will be replaced on every install. To customize, fork the repo and re-deploy. Operator-specific identity (`mcpServers.memory` URL, context7 API key) keeps its existing Keep/Change preservation logic.

---

## From source (contributors)

```bash
git clone https://github.com/valianx/team-harness.git
cd team-harness
go run ./cmd/install
```

`go run ./cmd/install` builds from local source. The `//go:embed` directive snapshots `agents/`, `skills/`, and `hooks/` at compile time, so the binary reflects your working tree exactly. The bootstrap scripts (`./bin/install.sh` / `.\bin\install.ps1`) always download the released binary — they don't use the local clone.

---

## Optional scaffolds (post-install)

After installing, two optional scaffolds are available via `/th:bootstrap`:

- `/th:bootstrap --scaffold-rereview-workflow` — adds `.github/workflows/team-harness-rereview.yml` to the consumer repo. The workflow posts a PR comment when new commits arrive on a PR that already has a team-harness review, nudging the operator to re-run `/review-pr`. On private repos, each run consumes ~1 GitHub Actions minute.
- `/th:bootstrap --scaffold-review-policy` — adds `.team-harness/review-policy.md` with a starter review policy template. The `reviewer` agent reads this file when present and enforces the declared rules.
  The same file may carry a fenced `yaml` block with `verification: blocking-only | all | off` (default `blocking-only`) and `max_suggestions: <n>` (default `5`); `/th:review-pr` reads both through `review_context.py policy` before dispatching the verifier.

## Invoking the bug-fix and feature pipelines

The canonical entry point after install is the `orchestrator` agent — the top-level Claude Code session agent, not a subagent spawned by anything. Type `@th:orchestrator <task>` in your Claude Code session:

```
@th:orchestrator fix the pagination bug in the users list
@th:orchestrator add an export-to-CSV feature to the invoices page
@th:orchestrator refactor the auth middleware to use the new JWT library
```

**Slash-command shortcuts** select an explicit coordinator flow:

| Command | Equivalent to |
|---|---|
| `/th:pipeline <request>` | Activates the gated pipeline and loads its contract progressively |
| `/issue #N` | `@th:orchestrator` with the GitHub issue body fetched automatically |
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
3. **Activate** — `/reload-plugins` (or restart Claude Code) to load the downloaded version.

`/th:update` performs steps 1 and 2 from Bash, then re-syncs the fixed-path artifacts that the plugin runtime does **not** auto-load (the managed `~/.claude/CLAUDE.md` blocks and `output-styles/developer-mode.md`). Step 3 is operator-driven — the skill cannot reload the session. Running `/th:update` every release keeps both the cache and the fixed-path artifacts aligned; re-running `/th:setup` is **not** part of the update flow. For the full mental model — division of labour, the cache-vs-fixed-path propagation model, and the self-healing property — see [`setup-update-model.md`](./setup-update-model.md).

**Legacy installer:** re-run the bootstrap. Unchanged files are skipped; files that differ from the embedded release bytes are overwritten.

```bash
curl -fsSL https://valianx.github.io/team-harness/install.sh | bash
```

---

## Requirements

**Required:**
- [Claude Code](https://docs.claude.com/en/docs/claude-code) — the runtime team-harness depends on
- [context7](https://context7.com/) API key — for library docs retrieval
- A reachable [Memory MCP](https://github.com/valianx/context-harness-mcp) URL — for the knowledge graph

**Recommended (not required):**
- [`gh`](https://cli.github.com/) CLI — for `/issue`, `/deliver`, and `/review-pr` GitHub integration. When `gh` is absent or unauthenticated, these skills use `curl` against the GitHub REST API (if `$GH_TOKEN`/`$GITHUB_TOKEN` is set) or fall back to operator-paste paths with `blocked-manual-push` status. The installer prints a note when `gh` is missing.

No Python, no `uv` — the binary is stdlib-only Go.
