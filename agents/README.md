# agents/

System prompts for the subagents of the `team-harness` system. Each `.md` file is a single agent.

## File convention

Every agent file is Markdown with YAML frontmatter:

```md
---
name: th-orchestrator
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
| `th-orchestrator` | opus | `high` | Read, Edit, Write, Bash, Glob, Grep, Task, WebFetch, WebSearch, NotebookEdit, all 9 `mcp__memory__*` (KG read + write) | Central hub. Coordinates the pipeline and routes to all other agents. |
| `architect` | opus | `max` | Read, Glob, Grep, Edit, Write, WebFetch, WebSearch, `mcp__memory__search_nodes`, `mcp__memory__open_nodes` | Architecture design, research, planning, audits. **No Bash** (read-only on system). KG read-only (Phase 6 writes stay in th-orchestrator). |
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
| `documenter` | opus | `high` | Read, Edit, Write, Glob, Grep, Bash | Diagram-first Obsidian documentation from architect research. |
| `delivery` | sonnet | `medium` | Read, Edit, Write, Bash, Glob, Grep | Docs, changelog, version, branch, commit, PR. |
| `reviewer-consolidator` | opus | `high` | Read, Edit, Write, Glob, Grep | Merges 2-3 focused review drafts (security/architecture/style) into a single unified review. De-duplicates findings, surfaces contradictions, determines verdict. Invoked by th-orchestrator after parallel focused reviewer passes in multi-reviewer mode. |

Plus reference files (`ref-direct-modes.md`, `ref-special-flows.md`) loaded on-demand by the th-orchestrator. They are not invocable subagents — their `model` field is vestigial and not enforced by `/lint`.

Plus `_shared/gh-fallback.md` — a cross-cutting snippet (not an invocable agent) installed to `~/.claude/agents/_shared/`. Contains the single source-of-truth fallback patterns for graceful degradation when the `gh` CLI is unavailable. Consumed by `delivery.md`, `th-orchestrator.md`, `ref-special-flows.md`, and skills `issue.md`, `plan.md`, `design.md`, `define-ac.md`, `audit.md`, `review-pr.md` via cross-references.

## Earn the model AND the effort AND the tools

Three principles drive the matrix above:

1. **Model by nature of the work.** Agents that do **analysis or coordination** (architect, security, reviewer, qa, gcp-cost-analyzer, agent-builder, init, th-orchestrator) run on `opus` — a wrong call here cascades through the whole pipeline. Agents that do **execution against a finished plan** (implementer, tester, delivery, diagrammers, translator) run on `sonnet` — the heavy thinking has already been done upstream.
2. **Effort by depth of judgement required.** `max` for irreversible analysis (architecture, security audits, PR reviews, agent design). `high` for solid analytical work that doesn't need exhaustive exploration (th-orchestrator routing, qa validation, FinOps prioritisation, implementer following a Work Plan). `medium` for everything else, **including the most mechanical tasks** — the floor is `medium`, never `low`.
3. **Tools by capability boundary.** The `tools` field is the **agency boundary** — what the agent literally cannot do regardless of what its prompt instructs. Read-only auditors (`architect`, `security`, `qa`, `acceptance-checker`) lose `Bash` so they cannot mutate the host even by accident. Builders (`implementer`, `tester`, `delivery`, diagrammers, `translator`, `init`, `agent-builder`) keep `Bash` but the harness gates destructive commands at `PreToolUse` (see `hooks/config.json`). Permission surface = agency boundary; tighten one and the prompt becomes a softer guardrail backed by a hard one.

## Low-cost mode

Low-cost mode is for **developers on lower-tier Anthropic plans (Free, Pro, or a tight personal budget)** who want to use team-harness without burning through API quota on a single feature. It is not the typical configuration — operators on Max or Team plans should stay on `standard`, which is the default for that reason.

When you run the installer interactively it asks: `Install mode [s/l]? [s]:` — press `l` + Enter to select low-cost, or just Enter to keep the standard default. You can also set `INSTALL_MODE=low-cost` before running for non-interactive installs. The installer rewrites the `model:` and `effort:` frontmatter of every agent file **in-flight** during the copy into `~/.claude/agents/`. The source files in `agents/*.md` are never modified. To switch back, re-run the installer and press Enter at the mode prompt (accepting the `[s]` default), or set `INSTALL_MODE=standard`.

**Engineering-honest trade-off.** On low-cost mode: architecture proposals are 1-2 iterations rougher (less novel synthesis, weaker risk enumeration); security audits are coarser (obvious OWASP-Top-10 issues caught, subtle injection vectors more likely missed); reviewer verdicts are more lenient; test suites miss ~5-15% more negative-path cases; code-generation correctness is preserved at `sonnet` (the implementer's standard tier). Single pipeline run is roughly **15-30% cheaper** and **15-30% slower** (more Phase 3 iteration loops). Suitable for personal projects, prototypes, and side-org workloads where the human reviewer at each STAGE-GATE is the trusted backstop — not for production-grade work where the standard mode's quality contract is load-bearing.

**Low-cost matrix** (canonical — source of truth is `cmd/install/modes.go::lowCostMatrix`):

| Agent | Standard model | Standard effort | Low-cost model | Low-cost effort | Notes |
|---|---|---|---|---|---|
| `th-orchestrator` | opus | high | sonnet | high | Coordination + gate routing; effort stays high so STAGE-GATE logic executes correctly. |
| `architect` | opus | max | sonnet | high | Design work; effort high preserves depth-of-search. Human reads at STAGE-GATE-1. |
| `agent-builder` | opus | max | sonnet | high | Agent/skill authoring; effort high preserves design depth. Human reviews the diff at PR time. |
| `security` | opus | max | sonnet | high | Security audit; effort high is the cap. Human reads `04-security.md` at STAGE-GATE-2/3. |
| `reviewer` | opus | max | sonnet | high | PR review gate; effort high preserves severity calibration. Human approves at STAGE-GATE-3. |
| `reviewer-consolidator` | opus | high | sonnet | high | Multi-reviewer merge step; effort high preserves de-dup and contradiction detection quality. |
| `qa` | opus | high | sonnet | high | AC validation; effort high retained — drives merge decision at STAGE-GATE-2/3. |
| `plan-reviewer` | sonnet | medium | sonnet | medium | No change — already at the floor; gate role is inviolable. |
| `gcp-cost-analyzer` | opus | high | sonnet | medium | Non-blocking advisory report; human decides on all output. |
| `init` | opus | medium | sonnet | medium | One-shot bootstrap; human edits output before first commit. |
| `implementer` | sonnet | high | sonnet | medium | Model stays sonnet; effort drops to medium (more iteration loops via tester+qa). |
| `tester` | sonnet | medium | sonnet | medium | No change — mechanical work; coverage gaps surface in AC trace. |
| `acceptance-checker` | sonnet | medium | sonnet | medium | No change — structural diff is mechanical; verdict is non-binding (Phase 3.6). |
| `diagrammer` | sonnet | medium | sonnet | medium | No change — render-validate loop is the gate, not the model. |
| `likec4-diagrammer` | sonnet | medium | sonnet | medium | No change — DSL validation catches errors. |
| `d2-diagrammer` | sonnet | medium | sonnet | medium | No change — DSL validation catches errors. |
| `translator` | sonnet | medium | sonnet | medium | No change — glossary is the contextual anchor; human reviews diff at PR time. |
| `delivery` | sonnet | medium | sonnet | medium | No change — mechanical; reviewer audits at Phase 4.5; human approves PR. |

**Tally:** all 18 agents on `sonnet` in low-cost mode. Effort: 7 × `high` (gate-makers + design heavyweights + acceptance auditors + consolidator), 11 × `medium` (everything else). No `max`, no `low`, no `haiku`, no `opus`.

## Adding or modifying an agent

Per the top-level `CLAUDE.md`, agent changes route through the `architect` subagent first, and the `agent-builder` agent writes the prompt. After editing:

1. Run `./bin/install.sh` (or `uv run bin/install.py`) to propagate into your own `~/.claude/`.
2. Add a `CHANGELOG.md` entry under `[Unreleased]`.
3. Open a PR.

## Notes

- `README.md` in this folder is contributor documentation; the installer does **not** copy it to `~/.claude/agents/`.
- Keep one concern per file. One `.md` = one agent.
- Agent prompts communicate with each other through files in `session-docs/{feature-name}/`, never through return values.
