# Team Harness — Shared Development Workflows

Team Harness contributes a shared way of working to **Claude Code**, **Codex**,
and **OpenCode** through four visible phases: Spec, Implementation, Validation
and Publication. The native general agent coordinates the work, while the
selected skills provide the methods and evidence for each phase.

TH's role is workflow guidance. The native harness owns agent execution,
permissions, sandboxing, approvals, and session controls. TH uses those
capabilities; its purpose is not to replace the general agent or duplicate the
native harness's safety mechanisms.

The current general agent selects and reads the relevant skill:

| Need | Workflow |
| --- | --- |
| Development with written intent and tasks | [`spec`](skills/spec/SKILL.md) |
| Inspect a proposed solution before implementation | [`sketch`](skills/sketch/SKILL.md), on demand in any flow |
| Broader coordination and recoverable execution | [`pipeline`](skills/pipeline/SKILL.md) |
| Review an existing pull request | [`review-pr`](skills/review-pr/SKILL.md) |
| Assess architecture, relationships and technical debt | [`audit`](skills/audit/SKILL.md) |
| Investigate functional defects in a project or module | [`find-bugs`](skills/find-bugs/SKILL.md) |
| Prepare or publish a completed change | [`create-pr`](skills/create-pr/SKILL.md) |
| Keep useful context across tasks, flows and sessions | [`workspace`](skills/workspace/SKILL.md) |

The [four-phase method](skills/spec/references/development-phases.md) explains
the inputs, expected work, tools, outputs and completion evidence. It is shared
by `spec` and the explicitly selected `pipeline`; it does not activate a
pipeline, add a permission gate or require every available tool.

In `spec`, the current agent retains planning, implementation and decisions.
It invokes [two native phase agents](skills/spec/references/phase-agents.md)
for validation and PR preparation/publication, reusing the workspace and evidence.

Independent specialists contribute findings and recommendations. The coordinator
judges them against the objective and available evidence, verifies corrections,
and continues the authorized work. Workspace and Obsidian support preserve
useful context; voice and language guidance preserve the operator's preferences.

The workspace skill is the common method for substantive work, including direct
tasks outside a pipeline. It reuses one local or Obsidian home for decisions,
evidence and handoffs without requiring Context Harness or creating empty records
for brief conversations and read-only status requests.

[![Version](https://img.shields.io/github/v/release/valianx/team-harness?label=version&color=blue)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

> Team Harness runs under **Claude Code**, **Codex** (POSIX-only beta), and **opencode**. See [`docs/lifecycle.md`](./docs/lifecycle.md) and the [Codex runtime guide](./docs/codex-runtime.md).

[OpenSpec](./docs/openspec-integration.md) owns proposal, spec, design, and task
artifacts for work that needs written intent. Completed changes are archived in
the implementation PR. The four phases describe the shared journey; the broader
pipeline remains an explicitly selected workflow and uses native tasks and
permissions without its own gate tokens or control journal.

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

3. Once the host exposes the installed Team Harness skills, configure the runtime:

```text
$team-harness:setup
```

The setup skill configures native Team Harness settings, optional MCP servers,
workspace/language preferences, optional workspace-to-GitHub identity routes,
and thirteen specialist agents: seven for the coordinated
pipeline, one direct read-only inline reviewer, and five for immutable PR review. It preserves
Codex's native permission and hook-trust prompts. It can also import every
missing setting from an existing Claude Code or opencode Team Harness config;
opaque values are copied directly and never displayed.

After setup, update, or an agent sync, use `reload` to check activation and
continue in the current Codex thread. Report unavailable observations as partial
activation. Reconnect only for an identified component that cannot activate in
place, preserving the current conversation; no blanket restart is needed.

Codex uses its native permissions and approvals. Team Harness does not install
a Codex policy-hook layer, so there is no hook manifest to trust for this
workflow. Plugin installation and agent installation are separate. The
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
reviews, and five agents are required by `review-pr`; lightweight `init` remains
available with the plugin alone.

4. Use `reload` to refresh supported components and check activation in the
   current conversation. Reconnect only when a specific remaining need is demonstrated.

5. Select the workflow that fits the request in your current thread:
```text
@Team-Harness init explain how this repository is structured
@Team-Harness spec add an export-to-CSV feature to invoices
@Team-Harness pipeline add an export-to-CSV feature to invoices
```

To browse every Team Harness skill available in Codex, type `/skills`, start a
skill mention with `$team-harness`, or invoke the alphabetical catalog:

```text
$team-harness:modes
```

The same canonical capability catalog is shipped to Claude Code, Codex, and
opencode. Runtime adapters translate native paths, tools, permissions, and
delegation without maintaining separate feature lists.

The native general agent selects the current skill. `init` helps frame the task;
`spec` retains written intent and tasks across the four phases when authorized;
`pipeline` supplies broader coordination for the same phase handoffs.
Independent reviewers inspect an anchored candidate through native read-only
capabilities. Main preserves findings and limits, judges recommendations and
verifies corrections. A PR reference identifies the target; the requested action
selects review, comment application, publication or merge.

Use `review-pr --regressions` to investigate concrete suspected defects with the
same bounded assertion against the captured base and PR head. The existing
verifier checks whether the observed difference is an unintended regression;
the report distinguishes preexisting failures and unavailable evidence.
See the [probe protocol](skills/review-pr/references/regression-probes.md) for
execution prerequisites and coverage limits. Main attempts operational repairs
without another approval when the approved deliverable and authority stay unchanged.

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

This installs all agents, skills, commands, and retained runtime context assets. The bare form requires no environment variables — MCP server registration is optional and skipped when credentials are absent.

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

Installation registers a concise TH guide through OpenCode's native `instructions`
configuration. It preserves the selected general agent and unrelated instructions.
An existing `TH-orchestrator` selection also remains unchanged; choose another
general agent through OpenCode if desired. TH's skills remain available either way.

**Environment variables:**

| Variable | Required | Purpose |
|---|---|---|
| `MEMORY_MCP_URL` | Optional | Memory MCP server URL. When set, registered in `opencode.json` at install time. When absent, skipped — configure later. |
| `CONTEXT7_API_KEY` | Optional | context7 API key for library docs retrieval. When set, registers the context7 MCP server. When absent, skipped — configure later. |
| `MEMORY_MCP_BEARER` | Optional at install | opencode resolves `{env:MEMORY_MCP_BEARER}` at runtime. If unset when the install runs, a one-line non-blocking warning is printed; the install still completes. |

The installer writes only the Memory URL literally to `opencode.json`. Both secrets (`MEMORY_MCP_BEARER` and `CONTEXT7_API_KEY`) remain as `{env:}` references resolved by opencode at runtime — they are never written to disk by team-harness.

**Security note:** The downloaded binary is verified against the published `SHA256SUMS` before it runs. The checksum file is served over HTTPS from the GitHub release origin but is not cryptographically signed — verification protects against corruption and tampering of the binary relative to the checksum, not against a compromise of the release origin (TOFU over HTTPS).

`/th:setup` configures workspace preferences, optional integrations, and optional workspace-to-GitHub identity routes. The identity
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

`/th:update` refreshes the marketplace catalog, downloads the new version into the plugin cache, and syncs the managed `~/.claude/CLAUDE.md` blocks. `/reload-plugins` activates it when a new version was downloaded; reconnect only if reload reports a specific component that cannot activate in place.

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

After installation, use Team Harness `reload` to check the active host's agents,
skills, commands and other components. Apply supported refreshes in the current
session; report unverifiable components as partial. Propose a reconnect only
when a specific component needs it and preserve the existing conversation.
Installing new files alone proves neither live activation nor a need to restart.

The updater reports one of three states:
- **update available** — new files downloaded and diff applied; check activation with `reload`.
- **already current** — no binary downloaded, no files written.
- **installed ahead** — recorded version is newer than this binary; no downgrade performed.

Alternatively, type `/th-update` inside opencode. The command instructs the agent to run the updater above in a terminal.

---

## Quick start

After install, work with your runtime's native general agent. It discovers Team Harness skills and coordinates the workflow you select without replacing its native identity. The entry points in Claude Code are:

- `/th:spec <request>` — develop from written intent, tasks, and independent review
- `/th:pipeline <request>` — activate the coordinated multi-agent workflow
- `/th:review-pr <PR>` — review an existing pull request
- `/th:create-pr` — prepare and publish completed work using existing authorization
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

> **The native general agent coordinates Team Harness workflows.** Use `/th:spec` for written intent and tasks, `/th:pipeline` for broader coordination, `/th:review-pr` for PR review and `/th:create-pr` for preparation/publication. Read the selected current skill; `/th:recover` remains available for an existing pipeline.

---

## Native agent and Team Harness workflows

The general agent retains its native coding instructions. Team Harness adds workflow discovery, specialist coordination, voice and language preferences, and workspace/Obsidian context. The developer-mode replacement style is retired. Native permissions and approvals remain the authority for execution boundaries.

Full contract: docs/dev-mode.md.

---

## Requirements

**Required:**
- [Claude Code](https://docs.claude.com/en/docs/claude-code) — the primary runtime team-harness depends on. opencode is also supported through projected agents, skills, and rules plus its native permission model. See [`docs/lifecycle.md`](./docs/lifecycle.md) for the stage-by-stage maturity of each runtime and the [migration guide](./docs/opencode-migration-guide.md)
- The selected native host and the tools needed by the chosen workflow. Context7 and a personal knowledge service are optional.

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
| [Pipelines reference](./docs/pipelines.md) | Flow entry points, four-phase handoffs and historical compatibility |
| [Migration guide](./docs/plugin-migration.md) | Migrating from the Go installer to the plugin |
| [Agents reference](./agents/README.md) | Full agent roster, model/effort matrix, low-cost mode |
| [Agent tree](./docs/agent-tree.md) | How `th:orchestrator` and the leaf specialists relate at runtime |
| [Configuration reference](./CLAUDE.md) | Architectural conventions, working agreements, subagent routing |
| [Knowledge base](./docs/knowledge.md) | Decisions, patterns, stack notes, and constraints accumulated across features |
| [Integration guide](./docs/integration.md) | Optional knowledge integrations; workspace context has no remote dependency |
| [External tools](./docs/upstream-tools.md) | OpenSpec, Superpowers, TEA and quality analyzers: selection, execution, shared workspace and upstream ownership |
| [Troubleshooting](./docs/troubleshooting.md) | SSH/HTTPS errors, duplicate agents, missing dispatch rule |
| [Changelog](./CHANGELOG.md) | Release history |

---

## What gets a test

A test in this repository asserts a **property of executable code or of a
machine-readable artifact, evaluated by running it**. Hooks, the Go installer,
the shell bootstrap scripts, the TypeScript observational hook bodies, and the JSON/YAML
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
