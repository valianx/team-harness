# Team Harness

> An agent harness for **Claude Code**. Turns the chat into a Spec-Driven Development pipeline with mandatory human gates and full state captured as files so any session can resume from where the last one left off.

[![Version](https://img.shields.io/badge/version-2.3.0-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

---

## Install

**macOS / Linux / WSL**

```bash
curl -fsSL https://valianx.github.io/team-harness/install.sh | bash
```

**Windows (PowerShell)**

```powershell
irm https://valianx.github.io/team-harness/install.ps1 | iex
```

**Windows (cmd.exe)**

```cmd
curl -fsSL https://valianx.github.io/team-harness/install.cmd -o install.cmd && install.cmd
```

The installer walks you through three prompts (Memory MCP URL, context7 API key, install mode) and writes agents + skills + hooks into `~/.claude/`. Restart Claude Code after install. Full options + env-var setup in [`docs/install.md`](./docs/install.md).

---

## Quick start

After install, open Claude Code and type:

```
/design <what you want to build>
```

The orchestrator opens a pipeline: plan → human approval → implementation → verify → push approval → PR. State lives in `session-docs/{feature}/`; `/recover <feature>` resumes any time.

---

## Documentation

| | |
|---|---|
| [How it works](./docs/how-it-works.md) | Pipeline walkthrough, why a harness, what ships |
| [Installation guide](./docs/install.md) | Modes, env vars, --force, from source, updating |
| [Agents & low-cost matrix](./agents/README.md) | Full agent roster + model/effort matrix + low-cost mode |
| [Configuration reference](./CLAUDE.md) | Architectural conventions, working agreements, subagent routing |
| [Contributing](./docs/contributing.md) | Working agreements, testing, release process |
| [Knowledge graph policy](./docs/kg-content-policy.md) | What goes in the Memory MCP (and what doesn't) |

---

## License

[MIT](./LICENSE) © 2026 Mario Gutierrez.
