# Team Harness — Multi-runtime Agent Orchestration

> Team Harness is a multi-runtime agent orchestration system for **Claude Code**, **Codex**, and **opencode**: the top-level thread frames each request and dispatches specialized architect, implementer, tester, QA, security, and delivery agents through a Spec-Driven Development (SDD) pipeline with mandatory human gates.
>
> Every pipeline stage is captured as files on disk, so any session can resume from where the last one stopped.

[![Version](https://img.shields.io/github/v/release/valianx/team-harness?label=version&color=blue)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

> Team Harness runs under **Claude Code**, **Codex** (POSIX-only beta), and **opencode**. See [`docs/lifecycle.md`](./docs/lifecycle.md) and the [Codex runtime guide](./docs/codex-runtime.md).

New pipeline Designs use [OpenSpec as the canonical intent source](./docs/openspec-integration.md)
inside the existing TH lifecycle. TH keeps specialist execution, evidence, both gates, and
delivery; OpenSpec owns repository-local proposal/spec/design/task artifacts.

---

## Install

### Claude Code

1. Add the marketplace:
```
/plugin marketplace add valianx/team-harness
```

2. Install the plugin:
```
/plugin install th
```

3. Configure MCP servers and logs mode:
```
/th:setup
```

### Codex beta (POSIX only)

1. Add the repository marketplace:
```text
codex plugin marketplace add valianx/team-harness
```

2. Install the plugin:
```text
codex plugin add team-harness@team-harness
```

3. Start a new Codex thread and configure the runtime:

```text
$team-harness:setup
```

The setup skill configures native Team Harness settings, optional MCP servers,
workspace/language preferences, optional workspace-to-GitHub identity routes,
and thirteen specialist agents: seven for the gated
pipeline, one direct read-only inline reviewer, and four for immutable PR review. It preserves
Codex's native permission and hook-trust prompts. It can also import every
missing setting from an existing Claude Code or opencode Team Harness config;
opaque values are copied directly and never displayed.

After setup, update, or an agent sync, restart Codex before dispatching an
inline reviewer. Inline dispatch requires the fresh session that loaded the
verified managed profile; an on-disk digest cannot attest a profile already
loaded by an older session.

Review the [plugin hook manifest](./plugins/team-harness/hooks/hooks.json) and
its referenced scripts, then explicitly trust the repository before enabling
those hooks. Plugin installation and agent installation are separate. The
plugin provides the Team Harness skills; the thirteen generated agents are installed
by the setup skill from the marketplace snapshot.

The equivalent manual agent-installation fallback, from the project root, is:

From the root of the project where Team Harness will run, install its thirteen
   agents (requires Go 1.25.8 or newer):
```bash
cd /path/to/your/project
go run github.com/valianx/team-harness/cmd/install@latest apply --runtime codex --scope project
```

Without Go, download the matching `install-<os>-<arch>` asset and
`SHA256SUMS` from [GitHub Releases](https://github.com/valianx/team-harness/releases),
verify the exact asset before executing it, and run it from the project root.
For example, after verifying `install-linux-amd64`:
```bash
chmod +x install-linux-amd64
./install-linux-amd64 apply --runtime codex --scope project
```

The checksum proves that the binary matches the file published in the same
GitHub release; it does not protect against compromise of the release origin.

Use `--scope global` instead when the thirteen agents should be available from your
Codex user configuration rather than only this checkout. Seven agents are required
by the gated `pipeline` workflow, `inline-reviewer` serves direct read-only
reviews, and four agents are required by `review-pr`; lightweight `init` remains
available with the plugin alone.

4. Start another Codex thread so newly configured MCP servers and installed
   agents are loaded.

5. Try the two entry points in a clean `Main` thread:
```text
@Team-Harness init explain how this repository is structured
@Team-Harness pipeline add an export-to-CSV feature to invoices
```

To browse every Team Harness skill available in Codex, type `/skills`, start a
skill mention with `$team-harness`, or invoke the alphabetical catalog:

```text
$team-harness:modes
```

The same 57 canonical capability names are shipped to Claude Code, Codex, and
opencode. Runtime adapters translate native paths, tools, permissions, and
delegation without maintaining separate feature lists.

`init` performs lightweight intake and direct bounded work without pipeline
state or agent preflight. A current live request for tester, QA, security, or
adversary may dispatch the native `inline-reviewer` over the local project.
Each requested lens reads the anchored repository root and immutable commit or
range through a native `read-only` sandbox; no workspace, state, events, gates,
branch, delivery record, or publication is created. The adversary lens is added
only when the security floor applies (changed auth, permissions, identity,
secrets, cryptography, untrusted input, uploads, data export, executable code,
or security policy/audit controls; ambiguity is sensitive) or the operator
requests it. Each lens attempt has a fresh identity and a selected-agent
preflight; replayed or substituted returns are untrusted. A missing or stale
target, unsupported lens, or unavailable read-only boundary is explicit and
cannot produce PASS; global PASS requires every required lens to complete with
`verdict: pass`. Reviewers must stay in the project root, although the
read-only boundary prevents mutation rather than enforcing filesystem
confinement. PR text, numbers, and URLs always route exclusively to
`review-pr`; generic inline review never intercepts that snapshot/publication
flow. `pipeline` explicitly starts the full gated workflow in `Main`; it does
not create a seventh coordinator or require `/agent`.

Upgrade, removal, local development, hook trust, and the complete role/model
roster are documented in [`docs/codex-runtime.md`](./docs/codex-runtime.md).
For routine upgrades invoke `$team-harness:update` from a Codex thread.
Use `$team-harness:modes` in Codex, `/th:modes` in Claude Code, or
`/th-modes` in opencode for an alphabetical, read-only capability catalog.

### Install into opencode

See [`docs/lifecycle.md`](./docs/lifecycle.md) for the current maturity of the opencode runtime. Install Team Harness into opencode with:

**Linux / macOS (bash):**
```
curl -fsSL https://valianx.github.io/team-harness/install-opencode.sh | bash
```

**Windows (PowerShell):**
```
iwr https://valianx.github.io/team-harness/install-opencode.ps1 | iex
```

This installs all agents, skills, commands, and hooks. The bare form requires no environment variables — MCP server registration is optional and skipped when credentials are absent.

To auto-register MCP servers at install time, supply them via environment:

**Linux / macOS:**
```
MEMORY_MCP_URL=https://your-mcp.example.com/mcp \
  CONTEXT7_API_KEY=your-key \
  curl -fsSL https://valianx.github.io/team-harness/install-opencode.sh | bash
```

**Windows:**
```
$env:MEMORY_MCP_URL = "https://your-mcp.example.com/mcp"
iwr https://valianx.github.io/team-harness/install-opencode.ps1 | iex
```

Or to register only Memory MCP (context7 skipped), set only `MEMORY_MCP_URL` in the same way.

To add or update MCP entries after install, re-run with the desired env vars set.

**Environment variables:**

| Variable | Required | Purpose |
|---|---|---|
| `MEMORY_MCP_URL` | Optional | Memory MCP server URL. When set, registered in `opencode.json` at install time. When absent, skipped — configure later. |
| `CONTEXT7_API_KEY` | Optional | context7 API key for library docs retrieval. When set, registers the context7 MCP server. When absent, skipped — configure later. |
| `MEMORY_MCP_BEARER` | Optional at install | opencode resolves `{env:MEMORY_MCP_BEARER}` at runtime. If unset when the install runs, a one-line non-blocking warning is printed; the install still completes. |

The installer writes only the Memory URL literally to `opencode.json`. Both secrets (`MEMORY_MCP_BEARER` and `CONTEXT7_API_KEY`) remain as `{env:}` references resolved by opencode at runtime — they are never written to disk by team-harness.

**Security note:** The downloaded binary is verified against the published `SHA256SUMS` before it runs. The checksum file is served over HTTPS from the GitHub release origin but is not cryptographically signed — verification protects against corruption and tampering of the binary relative to the checksum, not against a compromise of the release origin (TOFU over HTTPS).

`/th:setup` configures the two required MCP servers (Memory and context7), the
**logs mode**, and optional workspace-to-GitHub identity routes. The identity
routes use the same token-free schema in Claude Code, Codex, and opencode; see
[GitHub identity routing](./docs/github-identities.md).

Logs mode controls where pipeline workspaces are stored:

| Mode | Where | When to use |
|---|---|---|
| `local` | `./workspaces/` in each project | Default. Simple, no extra config. |
| `obsidian` | Obsidian vault path you provide | Cross-project visibility. Workspaces appear as searchable notes in your vault. |

### Update

Run the update command, then reload:

```
/th:update
/reload-plugins
```

`/th:update` refreshes the marketplace catalog, downloads the new version into the plugin cache, and syncs the managed `~/.claude/CLAUDE.md` blocks. `/reload-plugins` (or restarting Claude Code) activates it — that step is operator-driven and cannot be automated.

> **Note — manual fallback, only if `/th:update` fails.** Run the three steps yourself, then reload:
> ```
> claude plugin marketplace update team-harness-marketplace
> claude plugin update th@team-harness-marketplace
> /reload-plugins
> ```
> The catalog refresh (`marketplace update`) alone does **not** download files — `claude plugin update` is the step that fetches the new version. This is exactly what `/th:update` automates, so prefer the command above and use this sequence only for troubleshooting.

### Updating (opencode)

Run the dedicated updater bootstrap — it performs a cheap version pre-check (no binary download when already current), downloads and SHA256-verifies the binary, shows the four-bucket diff preview, and applies only changed files:

**Linux / macOS:**
```bash
curl -fsSL https://valianx.github.io/team-harness/update-opencode.sh | bash
```

**Windows (PowerShell):**
```powershell
iwr https://valianx.github.io/team-harness/update-opencode.ps1 | iex
```

Or run the subcommand directly (headless / CI):
```text
install update --runtime opencode --scope global --non-interactive
```

After the update completes, **restart opencode** to activate the refreshed agents, skills, and commands — the update is NOT live in any running opencode session until restart.

The updater reports one of three states:
- **update available** — new files downloaded, diff applied, restart to activate.
- **already current** — no binary downloaded, no files written.
- **installed ahead** — recorded version is newer than this binary; no downgrade performed.

Alternatively, type `/th-update` inside opencode. The command instructs the agent to run the updater above in a terminal.

---

## Quick start

After install, open Claude Code. The top-level session agent is **`th:orchestrator`** — the operator's single point of contact. Talking to it directly stays lightweight; start the gated flow explicitly when you want its stages and specialist reviews. The entry points are:

- `th:orchestrator` — direct conversation, inspection, review, and bounded changes
- `/th:pipeline <request>` — activate the gated multi-agent pipeline
- `/th:setup` — configure logs-mode, vault path, and verify MCP connectivity
- `/th:update` — update to the latest release

```
explain how the auth middleware works
/th:pipeline add export-to-CSV to invoices
/th:recover export-to-csv
```

Learn mode (explain a codebase, library, or concept with a layered teaching pack):

```
/th:learn explain how React hooks work
/th:learn how does the auth layer work in this project
/th:learn how does the LLM work in this ADK project --resume
```

> **`th:orchestrator` is the canonical entry point.** It starts in lightweight direct mode. Use `/th:pipeline {request}` when you want the gated multi-agent flow; skills such as `/th:design` and `/th:deliver` remain direct shortcuts, while `/th:recover` resumes an existing pipeline. See [`docs/agent-tree.md`](./docs/agent-tree.md) for the runtime relationship.

---

## Orchestrator disposition

The top-level session agent is **`th:orchestrator`**. Its small startup kernel handles conversation, inspection, review, and bounded reversible changes directly. It loads the gated pipeline (architect → implementer → tester/qa/security → delivery) only after a live `/th:pipeline`, an explicit request to start one, or `/th:recover` for persisted state. A deterministic gate (`hooks/dev-guard.sh`) still governs outward actions independently of either posture.

Full contract: docs/dev-mode.md.

---

## Requirements

**Required:**
- [Claude Code](https://docs.claude.com/en/docs/claude-code) — the primary runtime team-harness depends on. opencode is also supported through projected agents, skills, and rules plus its native permission model. See [`docs/lifecycle.md`](./docs/lifecycle.md) for the stage-by-stage maturity of each runtime and the [migration guide](./docs/opencode-migration-guide.md)
- [context7](https://context7.com/) API key — for library docs retrieval
- A reachable [Memory MCP](https://github.com/valianx/context-harness-mcp) URL — there is no default URL; `/th:setup` requires an explicit value

**Recommended:**
- [`gh`](https://cli.github.com/) CLI — for GitHub integration (`/th:issue`, `/th:deliver`, `/th:review-pr`). When absent, skills fall back to `curl` or operator-paste paths.

---

## Documentation

| | |
|---|---|
| [Vision](./docs/vision.md) | Where team-harness is headed — the developer amplified by a trusted agent team |
| [Roadmap](./docs/roadmap.md) | What we are building next — the sequenced path toward the vision |
| [How it works](./docs/how-it-works.md) | Pipeline walkthrough, why a harness, what ships |
| [Dual-runtime lifecycle](./docs/lifecycle.md) | How a change reaches Claude Code and opencode — author, build, test, release, install, update, activate, deprecate |
| [Pipelines reference](./docs/pipelines.md) | All 8+ pipelines, tier classification, phase tables, gate semantics |
| [Migration guide](./docs/plugin-migration.md) | Migrating from the Go installer to the plugin |
| [Agents reference](./agents/README.md) | Full agent roster, model/effort matrix, low-cost mode |
| [Agent tree](./docs/agent-tree.md) | How `th:orchestrator` and the leaf specialists relate at runtime |
| [Configuration reference](./CLAUDE.md) | Architectural conventions, working agreements, subagent routing |
| [Knowledge base](./docs/knowledge.md) | Decisions, patterns, stack notes, and constraints accumulated across features |
| [Integration guide](./docs/integration.md) | context-harness-mcp setup, mcpServers config, 16-tool contract, troubleshooting |
| [Troubleshooting](./docs/troubleshooting.md) | SSH/HTTPS errors, duplicate agents, missing dispatch rule |
| [Changelog](./CHANGELOG.md) | Release history |

---

## What gets a test

A test in this repository asserts a **property of executable code or of a
machine-readable artifact, evaluated by running it**. Hooks, the Go installer,
the shell bootstrap scripts, the TypeScript gate bodies, and the JSON/YAML
manifests all qualify: they have inputs, outputs, and exit codes, so a failure
names a real defect.

Agent and skill prose does **not** qualify. A test may not assert that a
Markdown file contains a wording, a section heading, a token, a line count, or a
byte-exact snapshot.

**The diagnostic question:** *if this test failed, would the cheapest way to make
it green be to add or reword a sentence?* If yes, it is a text assertion and it
does not get registered.

Concretely, none of these may be added as a test:

- presence of a phrase, heading, table row, or modal verb (`MUST`, `NEVER`) in an agent or skill file
- byte-exact or hash snapshots of prose blocks
- counts — of sections, checks, enumerated items, or cross-references
- cross-file wording parity between two Markdown files
- a check whose oracle is a `grep` over prose
- a behavioral test whose pass condition is the model **self-reporting** that it followed a rule
- a test pinned to an architecture that no longer ships

**Why the prohibition is absolute rather than case-by-case.** A text assertion is
a useful canary and a harmful contract, and it cannot be both at once. Once
registered, it inverts the direction of authority: the specification stops
governing the prose and the prose starts serving the check. Development then
drifts toward whatever makes the search succeed — sentences get added because a
test wants them, wordings get frozen because a snapshot pins them, and a
contradiction can sit in a file while every check passes, because presence was
the only thing ever measured. A previous corpus of ~46,000 lines of these
assertions was deleted for exactly this reason; it had begun deciding designs.

**What replaces them.** Prose contracts are enforced by *reading* — the agent's
own file states its contract, a reviewer agent reads the artifact, and the
operator reads the result. That is a judgement task, and it stays one. When a
prose rule genuinely needs mechanical enforcement, the correct move is to make it
unnecessary: scope the tool so the forbidden action is unavailable, or move the
deterministic part into code that can be executed and asserted.

`grep` remains a valid **enumerator** — use it freely to find work. It is not a
valid **decider**.

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the
fork-PR flow and the project's working agreements. By participating you agree to
the [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## License

[MIT](./LICENSE) © 2026 Mario Gutierrez.
