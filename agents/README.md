# agents/

System prompts for the subagents of the `team-harness` system. Each `.md` file is a single agent.

## File convention

Every agent file is Markdown with YAML frontmatter:

```md
---
name: orchestrator
description: Central hub that coordinates the pipeline.
model: opus
effort: high
color: blue
---

# Agent body (system prompt)
...
```

**Frontmatter keys.**
- `name` — agent identifier (matches the filename).
- `description` — one-line summary used by the invoker to decide when to route to this agent.
- `model` — `opus` for agents whose work is **analysis or coordination** (cannot fail); `sonnet` for agents whose work is **execution following a plan** (write code, tests, diagrams, commits, docs).
- `effort` — reasoning level when the agent is active. Allowed: `medium` | `high` | `xhigh` | `max`. **`low` is forbidden by project policy** (the floor is `medium`). Tune per agent based on how much judgement the role demands; the matrix in the Roster below is canonical.
- `color` — arbitrary colour label for display.
- `tools` — comma-separated allowlist of tools the agent can invoke (capability scoping). The runtime restricts the agent to this set; tools not listed are unavailable. Read-only agents (`security`, `acceptance-checker`, `qa`) MUST NOT include `Bash`, `Edit`, or `Write` beyond their own session-doc. Agents that need external research include `WebFetch`, `WebSearch`. Agents that build (implementer, tester, delivery, diagrammers) include `Bash`. The canonical allowlist per agent lives in each agent's frontmatter and is the source of truth.

## Roster

The combination of `model` + `effort` + `tools` below is the canonical matrix for this repo. `/lint` enforces `model` and `effort` (Check 7) and the tool allowlist surface (Check 4) — any drift between an agent's frontmatter and this table fails the check.

| Agent | Model | Effort | Tools (allowlist) | Role |
|---|---|---|---|---|
| `orchestrator` | opus | `high` | Read, Edit, Write, Bash, Glob, Grep, Task, WebFetch, WebSearch, NotebookEdit, all 9 `mcp__memory__*` (KG read + write) | Central hub. Coordinates the pipeline and routes to all other agents. |
| `architect` | opus | `max` | Read, Glob, Grep, Edit, Write, WebFetch, WebSearch, `mcp__memory__search_nodes`, `mcp__memory__open_nodes` | Architecture design, research, planning, audits. **No Bash** (read-only on system). KG read-only (Phase 6 writes stay in orchestrator). |
| `agent-builder` | opus | `max` | Read, Edit, Write, Glob, Grep, Bash | Create / improve agents and skills. |
| `security` | opus | `max` | Read, Glob, Grep, Edit, Write, WebFetch, WebSearch, `mcp__memory__search_nodes`, `mcp__memory__open_nodes` | OWASP / CWE / ASVS audits. **No Bash** (strict read-only on system). KG read-only for prior-vuln lookup. |
| `reviewer` | opus | `max` | Read, Glob, Grep, Edit, Write, Bash | GitHub PR review. Bash limited to `git`/`gh` for diff retrieval. |
| `qa` | opus | `high` | Read, Glob, Grep, Edit, Write, `mcp__memory__search_nodes`, `mcp__memory__open_nodes` | Acceptance criteria definition and validation. **No Bash** (read-only on system). KG read-only for AC-pattern lookup. |
| `plan-reviewer` | sonnet | `medium` | Read, Glob, Grep, Write | Read-only audit of Stage 1 artifacts (`01-architecture.md` + `02-task-list.md`) against the six plan-shape rules; emits pass/concerns/fail verdict at Phase 1.6 before STAGE-GATE-1. **No Bash, no Edit** (write-only on its own session-doc). |
| `gcp-cost-analyzer` | opus | `high` | Read, Bash, Glob, Grep, Write | GCP cost / resource inventory reports. Bash limited to `gcloud`/`bq` reads. |
| `init` | opus | `medium` | Read, Edit, Write, Glob, Grep, Bash | Bootstrap `CLAUDE.md` in any repo. |
| `implementer` | sonnet | `high` | Read, Edit, Write, Bash, Glob, Grep, NotebookEdit | Production code following the architect's Work Plan. |
| `tester` | sonnet | `medium` | Read, Edit, Write, Bash, Glob, Grep, `mcp__memory__search_nodes`, `mcp__memory__open_nodes` | Test suites with factory mocks. KG read-only for test-pattern lookup. |
| `acceptance-checker` | sonnet | `medium` | Read, Glob, Grep, Write | External audit comparing original spec vs delivered artifacts (Phase 3.6, non-binding verdict). **No Bash, no Edit** (write-only on its own session-doc). |
| `diagrammer` | sonnet | `medium` | Read, Edit, Write, Glob, Grep, Bash, WebFetch | Excalidraw diagrams (render-validate loop). |
| `likec4-diagrammer` | sonnet | `medium` | Read, Edit, Write, Glob, Grep, Bash | LikeC4 diagrams (architecture-as-code). |
| `d2-diagrammer` | sonnet | `medium` | Read, Edit, Write, Glob, Grep, Bash | D2 diagrams. |
| `translator` | sonnet | `medium` | Read, Edit, Write, Glob, Grep, Bash | i18n discovery, glossary, translation. |
| `delivery` | sonnet | `medium` | Read, Edit, Write, Bash, Glob, Grep | Docs, changelog, version, branch, commit, PR. |

Plus reference files (`ref-direct-modes.md`, `ref-special-flows.md`) loaded on-demand by the orchestrator. They are not invocable subagents — their `model` field is vestigial and not enforced by `/lint`.

## Earn the model AND the effort AND the tools

Three principles drive the matrix above:

1. **Model by nature of the work.** Agents that do **analysis or coordination** (architect, security, reviewer, qa, gcp-cost-analyzer, agent-builder, init, orchestrator) run on `opus` — a wrong call here cascades through the whole pipeline. Agents that do **execution against a finished plan** (implementer, tester, delivery, diagrammers, translator) run on `sonnet` — the heavy thinking has already been done upstream.
2. **Effort by depth of judgement required.** `max` for irreversible analysis (architecture, security audits, PR reviews, agent design). `high` for solid analytical work that doesn't need exhaustive exploration (orchestrator routing, qa validation, FinOps prioritisation, implementer following a Work Plan). `medium` for everything else, **including the most mechanical tasks** — the floor is `medium`, never `low`.
3. **Tools by capability boundary.** The `tools` field is the **agency boundary** — what the agent literally cannot do regardless of what its prompt instructs. Read-only auditors (`architect`, `security`, `qa`, `acceptance-checker`) lose `Bash` so they cannot mutate the host even by accident. Builders (`implementer`, `tester`, `delivery`, diagrammers, `translator`, `init`, `agent-builder`) keep `Bash` but the harness gates destructive commands at `PreToolUse` (see `hooks/config.json`). Permission surface = agency boundary; tighten one and the prompt becomes a softer guardrail backed by a hard one.

## Adding or modifying an agent

Per the top-level `CLAUDE.md`, agent changes route through the `architect` subagent first, and the `agent-builder` agent writes the prompt. After editing:

1. Run `./bin/install.sh` (or `uv run bin/install.py`) to propagate into your own `~/.claude/`.
2. Add a `CHANGELOG.md` entry under `[Unreleased]`.
3. Open a PR.

## Notes

- `README.md` in this folder is contributor documentation; the installer does **not** copy it to `~/.claude/agents/`.
- Keep one concern per file. One `.md` = one agent.
- Agent prompts communicate with each other through files in `session-docs/{feature-name}/`, never through return values.
