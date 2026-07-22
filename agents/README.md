# agents/

System prompts for the subagents of the `team-harness` system. Each `.md` file is a single agent.

## File convention

Every agent file is Markdown with YAML frontmatter:

```md
---
name: leader
description: Top-level coordinator and the operator's single point of contact.
model: opus
effort: xhigh
color: cyan
---

# Agent body (system prompt)
...
```

**Frontmatter keys.**
- `name` — agent identifier (matches the filename).
- `description` — one-line summary used by the invoker to decide when to route to this agent.
- `model` — `opus` for the highest-stakes, non-recoverable analysis and coordination (`architect`, `security`, `agent-builder`, `leader`); `sonnet` for everything else — execution against a plan AND secondary analysis/review a human or gate still ratifies (`adversary`, `reviewer`, `qa`, `translator`, …), since Sonnet 5 at `xhigh` sits near Opus for these at a fraction of the cost; `haiku` only for `researcher`/`init` (mechanical, downstream-gated).
- `effort` — reasoning level when the agent is active. Allowed: `medium` | `high` | `xhigh` (the ceiling). **`max` is retired** (marginal gain over `xhigh` at a large cost premium) and **`low` is forbidden** (the floor is `medium`). On Claude Code `effort` is session-global, so this per-agent value is opencode-honored and advisory on CC; the model is the load-bearing per-agent lever there. The matrix in the Roster below is canonical.
- `color` — arbitrary colour label for display.
- `tools` — comma-separated allowlist of tools the agent can invoke (capability scoping). The runtime restricts the agent to this set; tools not listed are unavailable. Read-only agents (`security`, `qa`) MUST NOT include `Bash`, `Edit`, or `Write` beyond their own workspace doc. Agents that need external research include `WebFetch`, `WebSearch`. Agents that build (implementer, tester, delivery, diagrammers) include `Bash`. The canonical allowlist per agent lives in each agent's frontmatter and is the source of truth.

## Roster

The combination of `model` + `effort` + `tools` below is the canonical matrix for this repo. `/th:lint` enforces `model` and `effort` (Check 7) and the tool allowlist surface (Check 4) — any drift between an agent's frontmatter and this table fails the check.

Coordination is split across two agents. **`leader`** is the top-level session agent and the operator's single point of contact — it owns Intake, Discover/framing, Specify, spec+AC co-authoring, config/language resolution, and initiative/`overview.md` ownership. At each gate it presents the STAGE-GATE to the operator inline and relays the operator's decision (verbatim, tagged `leader-relayed-operator`) to the orchestrator, which records it — it never writes a gate-release itself and owns no pipeline `00-state.md`. It spawns one **`orchestrator`** per task (or per project in a multi-project initiative) to run Phase 1 Design → Phase 6 Knowledge Save, and that instance prepares and records all three STAGE-GATEs and is the sole writer of its own `00-state.md`. `leader` also dispatches non-gated specialists directly for the lighter direct modes (research, docs, mentor, init, translator, define-ac). The canonical runtime hierarchy — who dispatches whom, and where each gate lives — is [`docs/agent-tree.md`](../docs/agent-tree.md).

| Agent | Model | Effort | Tools (allowlist) | Role |
|---|---|---|---|---|
| `leader` | opus | `xhigh` | Read, Edit, Write, Bash, Glob, Grep, Task, WebFetch, WebSearch, NotebookEdit, KG read + `mcp__memory__record_flow_event`/`session_*` | Top-level session agent + operator's single point of contact. Owns Intake, Discover/framing, Specify, spec+AC co-authoring, config/language, initiative/`overview.md`. Spawns one `orchestrator` per task; dispatches direct-mode specialists itself. **Presents + relays** — presents each STAGE-GATE to the operator inline and relays the decision (tagged `leader-relayed-operator`); never records a gate-release and owns no pipeline `00-state.md`. On CC it runs as the session agent (never dispatched as a subagent), so its effective model is the session model, not this frontmatter. |
| `orchestrator` | sonnet | `xhigh` | Read, Edit, Write, Bash, Glob, Grep, Task, WebFetch, WebSearch, NotebookEdit, KG read + `mcp__memory__record_flow_event`/`session_*` | Task-scoped execution engine — one per task/project, spawned by `leader`. Runs Phase 1 Design → Phase 6 Knowledge Save, routes to the leaf specialists, **prepares and records all three STAGE-GATEs** (`leader` presents each inline and relays the decision back), and is the sole writer of its own `00-state.md`. Never spawns another `orchestrator` or a `leader`. |
| `architect` | opus | `xhigh` | Read, Glob, Grep, Edit, Write, WebFetch, WebSearch, `mcp__memory__search_nodes`, `mcp__memory__open_nodes` | Architecture design, research, planning, audits. **No Bash** (read-only on system). KG read-only (Phase 6 writes stay in `orchestrator`). |
| `agent-builder` | opus | `xhigh` | Read, Edit, Write, Glob, Grep, Bash | Create / improve agents and skills. |
| `security` | opus | `xhigh` | Read, Glob, Grep, Edit, Write, WebFetch, WebSearch, `mcp__memory__search_nodes`, `mcp__memory__open_nodes` | OWASP / CWE / ASVS audits. **No Bash** (strict read-only on system). KG read-only for prior-vuln lookup. |
| `adversary` | sonnet | `xhigh` | Read, Glob, Grep, Write, WebFetch, WebSearch, `mcp__memory__search_nodes`, `mcp__memory__open_nodes`, `mcp__context7__resolve-library-id`, `mcp__context7__query-docs` | Independent adversarial reviewer with a break-the-design mandate. Runs in Stage-2 verify in parallel with `security` on security-sensitive changes; verdict `broke-it \| could-not-break`; report in English. **No Bash, no Edit** (write-only to own workspace doc `reviews/04-adversary.md`). KG read-only. |
| `reviewer` | sonnet | `medium` | Read, Glob, Grep, Edit, Write, Bash | GitHub PR review. Bash limited to `git`/`gh` for diff retrieval. |
| `qa-plan` | opus | `high` | Read, Glob, Grep, Edit, Write, `mcp__memory__search_nodes`, `mcp__memory__open_nodes` | Pre-code AC work: ratify-plan (Phase 1.5), define-ac (standalone), reconcile (Phase 2.5), plan-review panel substance-reviewer. **No Bash** (read-only on system). KG read-only. |
| `qa` | sonnet | `high` | Read, Glob, Grep, Edit, Write, `mcp__memory__search_nodes`, `mcp__memory__open_nodes` | Post-code validation: validate (Phase 3), pr-review-qa, docs-validation, cross-repo review. **No Bash** (read-only on system). KG read-only for AC-pattern lookup. |
| `plan-reviewer` | sonnet | `medium` | Read, Glob, Grep, Write | Read-only audit of Stage 1 artifact (`01-plan.md`) against the plan-shape rules; emits pass/concerns/fail verdict at Phase 1.6 before STAGE-GATE-1. **No Bash, no Edit** (write-only on its own workspace doc). |
| `gcp-cost-analyzer` | opus | `high` | Read, Bash, Glob, Grep, Write | GCP cost / resource inventory reports. Bash limited to `gcloud`/`bq` reads. |
| `gcp-infra` | opus | `xhigh` | Read, Bash, Glob, Grep, Write | GCP infrastructure changes via generated `gcloud` scripts (create → validate → apply). Read-and-plan default; mutation hard-gated at a STOP block; destructive needs extra ack. |
| `init` | haiku | `medium` | Read, Edit, Write, Glob, Grep, Bash | Bootstrap `CLAUDE.md` in any repo. |
| `implementer` | sonnet | `high` | Read, Edit, Write, Bash, Glob, Grep, NotebookEdit | Production code following the architect's Work Plan. |
| `tester` | sonnet | `high` | Read, Edit, Write, Bash, Glob, Grep, `mcp__memory__search_nodes`, `mcp__memory__open_nodes` | Test suites with factory mocks. KG read-only for test-pattern lookup. |
| `diagrammer` | sonnet | `medium` | Read, Edit, Write, Glob, Grep, Bash, WebFetch | Excalidraw diagrams (render-validate loop). |
| `likec4-diagrammer` | sonnet | `medium` | Read, Edit, Write, Glob, Grep, Bash | LikeC4 diagrams (architecture-as-code). |
| `d2-diagrammer` | sonnet | `medium` | Read, Edit, Write, Glob, Grep, Bash | D2 diagrams. |
| `translator` | sonnet | `medium` | Read, Edit, Write, Glob, Grep, Bash | i18n discovery, glossary, translation. |
| `documenter` | sonnet | `high` | Read, Edit, Write, Glob, Grep, Bash | Diagram-first Obsidian documentation from architect research. |
| `ux-reviewer` | opus | `high` | Read, Glob, Grep, Edit, Write, `mcp__memory__search_nodes`, `mcp__memory__open_nodes`, `mcp__context7__resolve-library-id`, `mcp__context7__query-docs` | UI/UX review for frontend tasks — accessibility, responsiveness, component reuse. Dispatched when `frontend_scope: true`. |
| `delivery` | sonnet | `medium` | Read, Edit, Write, Bash, Glob, Grep | Docs, changelog, version, branch, commit, PR. |
| `reviewer-consolidator` | sonnet | `medium` | Read, Edit, Write, Glob, Grep | Merges 2-3 focused review drafts (security/architecture/style) into a single unified review. De-duplicates findings, surfaces contradictions, determines verdict. Invoked by `orchestrator` after parallel focused reviewer passes in multi-reviewer mode. |
| `mentor` | opus | `high` | Read, Glob, Grep, WebSearch, WebFetch, `mcp__context7__resolve-library-id`, `mcp__context7__query-docs`, Write (teaching-pack files only) | Teaches the operator (codebase/library/language/concept). Read-only on code; produces a layered, diagram-rich teaching pack with one Mermaid concept-map per layer and holds a multi-turn tutoring dialogue. |
| `researcher` | haiku | `medium` | Read, Glob, Grep, WebFetch, WebSearch, Write | Parallel web research map agent. Receives one narrow search angle, runs WebSearch + WebFetch, returns structured evidence-only findings (`claim` + `source_url` + `verbatim_excerpt` + `confidence`). Never concludes, never recommends — evidence collection only. Dispatched by `leader` (research direct mode) as N parallel lanes (default 3, cap 5). |
| `code-researcher` | sonnet | `high` | Read, Glob, Grep, Bash, Write | Parallel codebase research map agent (read-only). Receives one narrow code angle (a subsystem path-set, concern, or question facet), investigates real files via Read/Glob/Grep + read-only git introspection, and returns file:line-grounded evidence. Never concludes, never ranks, never recommends. Dispatched by `leader` (research-code direct mode) as N parallel code lanes. |
| `research-consolidator` | sonnet | `high` | Read, Glob, Grep, Edit, Write | Parallel web research reduce agent. Reads per-lane findings files, deduplicates claims, surfaces conflicting sources under `### Conflicting sources` (never silently picks a winner), re-weighs source quality, and produces consolidated cited findings for `research/00-research.md` or a Discover warm-findings file. |

Plus reference files (`ref-direct-modes.md`, `ref-special-flows.md`) loaded on-demand by the coordination agents (`leader` and `orchestrator`). They are not invocable subagents — their `model` field is vestigial and not enforced by `/th:lint`.

Plus two cross-cutting snippets in `_shared/` (not invocable agents), installed to `~/.claude/agents/_shared/`:

- `_shared/gh-fallback.md` — single source-of-truth fallback patterns for graceful degradation when the `gh` CLI is unavailable. Consumed by `delivery.md`, `leader.md`, `ref-special-flows.md`, and skills `issue.md`, `plan.md`, `design.md`, `define-ac.md`, `audit.md`, `review-pr.md` via cross-references.
- `_shared/operational-rules.md` — cross-cutting voice, language register, git safety, and pipeline integrity rules. Referenced by all 19 agent `## Voice` sections via `§ "Voice"` and `§ "Language register"`. Centralizes rules that were previously duplicated inline in every agent file.

## Earn the model AND the effort AND the tools

Three principles drive the matrix above:

1. **Model by nature of the work.** The highest-stakes, non-recoverable analysis and coordination (architect, security, agent-builder, qa-plan, `leader`, and the GCP/UX specialists) runs on `opus` — a wrong call here cascades through the whole pipeline. Everything else runs on `sonnet`: execution against a finished plan (implementer, tester, delivery, diagrammers), high-volume post-code auditing (qa, documenter), AND secondary analysis/review whose output a human or gate still ratifies (`adversary`, `reviewer`, `reviewer-consolidator`, `translator`) — Sonnet 5 at `xhigh` sits near Opus for these at a fraction of the cost, so the split is stakes-and-recoverability, not analysis-vs-execution. Only `researcher` and `init` stay on `haiku` (mechanical, structured, downstream-gated — see the eligibility criteria below).
2. **Effort by depth of judgement required.** `xhigh` is the ceiling — for exhaustive or irreversible analysis (`architect`, `security`, `adversary`, `agent-builder`, `gcp-infra`); `max` is retired (marginal gain over `xhigh` at a large cost premium). `high` for solid analytical work that doesn't need exhaustive exploration (qa validation, implementer following a Work Plan, tester authoring regression tests). `medium` for everything else, **including the most mechanical tasks** — the floor is `medium`, never `low`. On Claude Code effort is session-global (this per-agent value is opencode-honored, advisory on CC); the model is the load-bearing per-agent lever there.
3. **Tools by capability boundary.** The `tools` field is the **agency boundary** — what the agent literally cannot do regardless of what its prompt instructs. Read-only auditors (`architect`, `security`, `qa`, `qa-plan`) lose `Bash` so they cannot mutate the host even by accident. Builders (`implementer`, `tester`, `delivery`, diagrammers, `translator`, `init`, `agent-builder`) keep `Bash` but the harness gates destructive commands at `PreToolUse` (see `hooks/config.json`). Permission surface = agency boundary; tighten one and the prompt becomes a softer guardrail backed by a hard one.

### Haiku eligibility criteria

`haiku` is eligible for an agent role ONLY when **ALL three** of the following hold:

1. **The task is mechanical with structured output.** No synthesis, no design judgment, no architectural decisions. Examples: search-and-extract, classification, pattern matching, format conversion.
2. **The task requires no judgment or synthesis.** The agent follows a deterministic procedure and emits structured data. A wrong output is cheap: it is caught by the gate (consolidator, qa, human review) without cascading.
3. **Failures are cheap and detectable downstream.** A dead or empty-result lane is handled fail-open. A gate or consolidator downstream re-weighs quality and surfaces problems explicitly.

When any condition does not hold, `sonnet` is the minimum floor. Use `opus` when the work involves analysis, coordination, or irreversible decisions.

### Per-agent haiku justification

`researcher` and `init` are the only `haiku` roles. Each is mechanical with structured output and a named downstream safety net that absorbs its light judgment.

**`init`**
- C1 mechanical/structured: clean — bootstrap is templated `CLAUDE.md` generation against a discovered stack; the output structure is deterministic.
- C2 no judgment: partial — light naming/structure judgment when generating section headers and golden commands.
- C3 cheap/detectable failure: clean — one-shot output reviewed before the first commit.
- **Named safety net:** the operator edits the generated `CLAUDE.md` before the first commit. A wrong naming or structure call is caught at human review; no cascade.

`translator` was promoted `haiku → sonnet`: it is a rare-but-must-not-fail role (neutral-register translation) that earns a stronger model even though its downstream safety net (human i18n-diff review) remains.

## Low-cost mode

Low-cost mode is for **developers on lower-tier Anthropic plans (Free, Pro, or a tight personal budget)** who want to use team-harness without burning through API quota on a single feature. It is not the typical configuration — operators on Max or Team plans should stay on `standard`, which is the default for that reason.

When you run the installer interactively it asks: `Install mode [s/l]? [s]:` — press `l` + Enter to select low-cost, or just Enter to keep the standard default. You can also set `INSTALL_MODE=low-cost` before running for non-interactive installs. The installer rewrites the `model:` and `effort:` frontmatter of every agent file **in-flight** during the copy into `~/.claude/agents/`. The source files in `agents/*.md` are never modified. To switch back, re-run the installer and press Enter at the mode prompt (accepting the `[s]` default), or set `INSTALL_MODE=standard`.

**Engineering-honest trade-off.** On low-cost mode: architecture proposals are 1-2 iterations rougher (less novel synthesis, weaker risk enumeration); security audits are coarser (obvious OWASP-Top-10 issues caught, subtle injection vectors more likely missed); reviewer verdicts are more lenient; test suites miss ~5-15% more negative-path cases; code-generation correctness is preserved at `sonnet` (the implementer's standard tier). Single pipeline run is roughly **15-30% cheaper** and **15-30% slower** (more Phase 3 iteration loops). Suitable for personal projects, prototypes, and side-org workloads where the human reviewer at each STAGE-GATE is the trusted backstop — not for production-grade work where the standard mode's quality contract is load-bearing.

**Low-cost matrix** (vestigial — Go installer infra decommissioned 2026-06-02; `cmd/install/modes.go::lowCostMatrix` is no longer the source of truth. Table kept for historical reference only. Its **Standard** columns predate the `adversary`/`reviewer` → `sonnet` and `translator` → `sonnet` re-tiering and the `max` → `xhigh` ceiling — the Roster table above is canonical.):

| Agent | Standard model | Standard effort | Low-cost model | Low-cost effort | Notes |
|---|---|---|---|---|---|
| `leader` | opus | xhigh | sonnet | high | Top-level coordination (Intake/Specify/spec+AC/config); presents + relays gates, spawns one `orchestrator` per task. Reflects the post-split roster; the legacy Go matrix predates it. |
| `orchestrator` | sonnet | xhigh | sonnet | high | Task-scoped execution engine; prepares and records all three STAGE-GATEs, so effort stays high in low-cost so gate logic executes correctly. Reflects the post-split roster; the legacy Go matrix predates it. |
| `architect` | opus | xhigh | sonnet | high | Exhaustive design discovery (architecture + Work Plan + 8-bool classification + domain heuristics), gated at STAGE-GATE-1. Low-cost effort stays high to preserve depth-of-search; standard raises to xhigh to reflect the exhaustive discovery mandate. |
| `agent-builder` | opus | max | sonnet | high | Agent/skill authoring; effort high preserves design depth. Human reviews the diff at PR time. |
| `security` | opus | max | sonnet | high | Security audit; effort high is the cap. Human reads `reviews/04-security.md` at STAGE-GATE-2/3. |
| `adversary` | opus | max | sonnet | high | Adversarial review; effort high is the cap. Human reads `reviews/04-adversary.md` at STAGE-GATE-2/3. Plugin-only for model-tier purposes (no cmd/install/ entry). |
| `reviewer` | opus | max | sonnet | high | PR review gate; effort high preserves severity calibration. Human approves at STAGE-GATE-3. |
| `reviewer-consolidator` | opus | high | sonnet | high | Multi-reviewer merge step; effort high preserves de-dup and contradiction detection quality. |
| `qa-plan` | opus | high | sonnet | high | Pre-code AC work (ratify-plan, define-ac, reconcile); effort high retained — gates architect output. |
| `qa` | sonnet | high | sonnet | high | Post-code AC validation; effort high retained — drives merge decision at STAGE-GATE-2/3. |
| `plan-reviewer` | sonnet | medium | sonnet | medium | No change — already at the floor; gate role is inviolable. |
| `gcp-cost-analyzer` | opus | high | sonnet | medium | Non-blocking advisory report; human decides on all output. |
| `gcp-infra` | opus | xhigh | sonnet | medium | Irreversible-but-gated mutation planning (verb classification, blast-radius, reversibility, alternatives, runbook + rollback); gates: `gcp-guard.sh` + Phase 3.5 audit + STOP. Standard raises to xhigh; low-cost stays medium (gated output, human approves every apply). |
| `init` | haiku | medium | sonnet | medium | Haiku→sonnet upgrade in low-cost mode; human edits output before first commit. |
| `implementer` | sonnet | high | sonnet | medium | Model stays sonnet; effort drops to medium (more iteration loops via tester+qa). |
| `tester` | sonnet | high | sonnet | medium | Effort high in standard; drops to medium in low-cost. |
| `documenter` | sonnet | high | sonnet | medium | Effort high in standard; drops to medium in low-cost. |
| `diagrammer` | sonnet | medium | sonnet | medium | No change — render-validate loop is the gate, not the model. |
| `likec4-diagrammer` | sonnet | medium | sonnet | medium | No change — DSL validation catches errors. |
| `d2-diagrammer` | sonnet | medium | sonnet | medium | No change — DSL validation catches errors. |
| `translator` | haiku | medium | sonnet | medium | Haiku→sonnet upgrade in low-cost mode; glossary is the contextual anchor; human reviews diff at PR time. |
| `delivery` | sonnet | medium | sonnet | medium | No change — mechanical; reviewer audits at Phase 4.5; human approves PR. |
| `mentor` | opus | high | sonnet | high | Teaching is analysis + synthesis; effort high preserves layered-pack depth. Human reads the pack before the tutoring session. |
| `researcher` | haiku | medium | sonnet | medium | Post-decommission agent — not in Go installer lowCostMatrix. In low-cost mode, runs on sonnet (haiku→sonnet upgrade; mechanical role is still suitable). |
| `research-consolidator` | sonnet | high | sonnet | medium | Post-decommission agent — not in Go installer lowCostMatrix. Effort drops to medium in low-cost; consolidation quality is reduced but the fail-open fail-safe applies. |

**Tally (standard mode):** core `opus` agents — `leader`, architect, agent-builder, security, qa-plan, mentor (plus the GCP/UX specialists); `haiku` — `researcher`, `init`; everything else on `sonnet`, now including `orchestrator`, `adversary`, `reviewer`, `reviewer-consolidator`, `translator`. In low-cost mode, all on `sonnet`. No `max`, no `low`.

**Low-cost mode and the haiku tier:** the low-cost matrix (legacy Go installer, `cmd/install/modes.go::lowCostMatrix`) is frozen pre-haiku and does NOT track the `researcher` or `research-consolidator` agents. The Go installer is roadmapped as the **opencode agents installer** — fleet model-allocation changes no longer propagate to it. Plugin install (`/plugin install th`) is the canonical path and receives the correct `model: haiku` assignment. See `CLAUDE.md §3` for the full exclusion rationale.

## Adding or modifying an agent

Per the top-level `CLAUDE.md`, agent changes route through the `architect` subagent first, and the `agent-builder` agent writes the prompt. After editing:

1. **Plugin (canonical):** run `/plugin reload th` inside Claude Code to pick up changes.
   **Legacy (contributors):** run `go run ./cmd/install` from the repo root to propagate into your own `~/.claude/`. The `./bin/install.sh` / `.\bin\install.ps1` bootstrap scripts download the released binary — they don't use the local clone.
2. Add a `CHANGELOG.md` entry under `[Unreleased]`.
3. Open a PR.

## Notes

- `README.md` in this folder is contributor documentation; the installer does **not** copy it to `~/.claude/agents/`.
- Keep one concern per file. One `.md` = one agent.
- Agent prompts communicate with each other through files in `workspaces/{feature-name}/`, never through return values.
