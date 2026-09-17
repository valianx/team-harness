# agents/

System prompts for the subagents of the `team-harness` system. Each `.md` file is a single agent.

## File convention

Every agent file is Markdown with YAML frontmatter:

```md
---
name: orchestrator
description: Top-level coordinator and the operator's single point of contact.
model: opus
effort: high
color: cyan
---

# Agent body (system prompt)
...
```

**Frontmatter keys.**
- `name` — agent identifier (matches the filename).
- `description` — one-line summary used by the invoker to decide when to route to this agent. This line **is** the agent's objective statement (see "Objective column — authoring standard" below) — it must name only work the agent itself owns, never a capability that belongs to another agent (e.g., a post-code validator's description claiming standalone AC-authoring, when that authoring is a separate agent's job).
- `model` — model identifier used when this role is dispatched. Keep it in the source frontmatter so the runtime and generated registries agree.
- `effort` — effort value used when this role is dispatched. It is per-agent metadata; the runtime decides how the target harness interprets it.
- `color` — arbitrary colour label for display.
- `tools` — comma-separated allowlist of tools the agent can invoke (capability scoping). The runtime restricts the agent to this set; tools not listed are unavailable. Read-only agents (`security`, `qa`) MUST NOT include `Bash`, `Edit`, or `Write` beyond their own workspace doc. Agents that need external research include `WebFetch`, `WebSearch`. Builders that execute repository commands (implementer, tester, cleaner, diagrammers) include `Bash`; prose-only Delivery does not. The canonical allowlist per agent lives in each agent's frontmatter and is the source of truth.

## Roster

The roster below mirrors the source frontmatter and records the dispatch metadata and capability surface for contributors. The source frontmatter remains authoritative; `/th:lint` checks that the roster and generated artifacts stay coherent.

One agent owns coordination. **`orchestrator`** is the top-level session agent and the operator's single point of contact. Its startup kernel serves direct work by default; `/th:pipeline` explicitly activates the workflow described in `ref-pipeline.md`. It binds the objective, routes specialists, keeps workspace notes, consolidates evidence, and reports the next decision. It never dispatches another coordinator.

The workflow commonly moves through `design → implementation → validation → delivery`.
Inline is the direct default; an operator can explicitly ask for a focused specialist review or
activate the pipeline. Each specialist contributes evidence from its assigned scope, while the
operator and the host harness retain decisions about permissions and publication.

| Agent | Objective | Model | Effort | Tools (allowlist) | Role |
|---|---|---|---|---|---|
| `orchestrator` | Coordinate Team Harness workflows from written intent and independent review to the user's objective. | opus | `high` | Read, Edit, Write, Bash, Glob, Grep, Task, WebFetch, WebSearch, NotebookEdit, `mcp__memory__search_nodes`, `mcp__memory__open_nodes`, `mcp__memory__create_nodes`, `mcp__memory__add_observations`, `mcp__memory__create_relations`, `mcp__memory__read_graph`, `mcp__memory__session_start`, `mcp__memory__session_end`, `mcp__memory__record_flow_event` | Top-level coordinator; routes specialists, keeps workspace notes, and consolidates evidence. |
| `architect` | Design and review architecture, risk, migration, and technology choices; never writes code. | opus | `xhigh` | Read, Glob, Grep, Edit, Write, WebFetch, WebSearch, `mcp__memory__search_nodes`, `mcp__memory__open_nodes`, `mcp__context7__resolve-library-id`, `mcp__context7__query-docs` | Architecture proposals and research. |
| `agent-builder` | Design and create Claude Code agents and slash commands; always runs `/th:lint` after writing. | opus | `xhigh` | Read, Edit, Write, Glob, Grep, Bash | Agent and command authoring. |
| `security` | Perform comprehensive OWASP/CWE/ASVS security audits; never modifies source code. | opus | `xhigh` | Read, Glob, Grep, Edit, Write, WebFetch, WebSearch, `mcp__memory__search_nodes`, `mcp__memory__open_nodes`, `mcp__context7__resolve-library-id`, `mcp__context7__query-docs` | Security audit reports. |
| `adversary` | Challenge a proposed design or implementation with reachable failure cases and concrete evidence. | sonnet | `xhigh` | Read, Glob, Grep | Independent adversarial findings. |
| `reviewer` | Review pull requests for correctness, contract, security, and change-caused regressions without publishing. | sonnet | `high` | Read, Glob, Grep, `mcp__context7__resolve-library-id`, `mcp__context7__query-docs` | General PR review. |
| `inline-reviewer` | Review one bounded inline lens: tester, QA, security, or adversary. | sonnet | `high` | Read, Glob, Grep | Runtime-native inline review. |
| `pr-review-qa` | Validate acceptance criteria against a pull-request snapshot and return findings with coverage. | sonnet | `high` | Read, Glob, Grep | PR QA lens. |
| `pr-review-security` | Review a pull-request snapshot for concrete security regressions and return an inline draft. | sonnet | `high` | Read, Glob, Grep | PR security lens. |
| `pr-review-verifier` | Confirm or refute blocking pull-request findings against the supplied worktree; add no findings. | opus | `high` | Read, Glob, Grep | Finding verification. |
| `qa` | Independently verify a candidate against acceptance and quality evidence; never writes code or planning content. | opus | `xhigh` | Read, Glob, Grep, Edit, Write, `mcp__memory__search_nodes`, `mcp__memory__open_nodes` | Acceptance and quality review. |
| `plan-reviewer` | Audit OpenSpec and its concise plan view; report gaps and risks without editing or approving work. | sonnet | `medium` | Read, Glob, Grep | On-demand planning review. |
| `gcp-cost-analyzer` | Analyze GCP costs and resource utilization; never modifies or deletes GCP resources. | opus | `high` | Read, Bash, Glob, Grep, Write | GCP cost reports. |
| `gcp-infra` | Manage GCP infrastructure through generated create, validate, and apply scripts. | opus | `xhigh` | Read, Bash, Glob, Grep, Write, WebSearch, WebFetch, `mcp__context7__resolve-library-id`, `mcp__context7__query-docs` | GCP infrastructure plans and scripts. |
| `init-project` | Bootstrap Claude Code configuration and a changelog in a repository; produces no application code. | haiku | `medium` | Read, Edit, Write, Glob, Grep, Bash | Repository bootstrap. |
| `implementer` | Implement the smallest approved production diff and ordinary owned tests; does not design architecture. | sonnet | `high` | Read, Edit, Write, Bash, Glob, Grep, NotebookEdit, `mcp__context7__resolve-library-id`, `mcp__context7__query-docs` | Production implementation. |
| `tester` | Select appropriate evidence, author warranted regression tests, and run existing suites without test-count quotas. | sonnet | `high` | Read, Edit, Write, Bash, Glob, Grep | Test authoring and execution. |
| `cleaner` | Clean the approved changed production surface without changing behavior or tests. | sonnet | `medium` | Read, Edit, Write, Bash, Glob, Grep | Bounded cleanup. |
| `diagrammer` | Generate Excalidraw diagrams from architect analysis; does not analyze code or write product code. | sonnet | `medium` | Read, Edit, Write, Glob, Grep, Bash, WebFetch | Excalidraw diagrams. |
| `likec4-diagrammer` | Generate LikeC4 diagrams from architect analysis; does not analyze code or write product code. | sonnet | `medium` | Read, Edit, Write, Glob, Grep, Bash | LikeC4 diagrams. |
| `d2-diagrammer` | Generate D2 diagrams from architect analysis; does not analyze code or write product code. | sonnet | `medium` | Read, Edit, Write, Glob, Grep, Bash | D2 diagrams. |
| `translator` | Discover and internationalize frontend strings, producing a glossary and translation report. | sonnet | `medium` | Read, Edit, Write, Glob, Grep, Bash, `mcp__context7__resolve-library-id`, `mcp__context7__query-docs` | i18n discovery and implementation. |
| `documenter` | Transform research findings into structured Obsidian documentation with diagrams. | sonnet | `high` | Read, Edit, Write, Glob, Grep, Bash | Documentation from research. |
| `ux-reviewer` | Review frontend UI/UX quality and produce reports; never writes code. | opus | `high` | Read, Glob, Grep, Edit, Write, `mcp__context7__resolve-library-id`, `mcp__context7__query-docs` | UI/UX review. |
| `delivery` | Prepare reviewed acceptance-matrix and PR-body drafts without modifying repository or GitHub state. | sonnet | `medium` | Read, Edit, Write | Delivery prose. |
| `reviewer-consolidator` | Consolidate selected PR-review lenses into a concise body and de-duplicated inline threads. | sonnet | `medium` | Read, Glob, Grep | Review consolidation. |
| `mentor` | Answer as a senior peer with short inline diagrams; teaching packs are optional. | opus | `high` | Read, Glob, Grep, WebSearch, WebFetch, `mcp__context7__resolve-library-id`, `mcp__context7__query-docs`, Write | Teaching and explanation. |
| `researcher` | Collect evidence for one narrow web-search angle; never concludes, ranks, or recommends. | haiku | `medium` | Read, Glob, Grep, WebFetch, WebSearch, Write | Web evidence collection. |
| `code-researcher` | Collect file:line evidence for one narrow code angle; never concludes, ranks, or recommends. | sonnet | `medium` | Read, Glob, Grep, Bash, Write | Code evidence collection. |
| `research-consolidator` | Consolidate per-lane research findings and surface source conflicts without inventing claims. | sonnet | `high` | Read, Glob, Grep, Edit, Write | Research consolidation. |

Plus reference files (`ref-pipeline.md`, `ref-direct-modes.md`, `ref-special-flows.md`, `ref-intake-flows.md`, `ref-dispatch-machinery.md`) loaded on demand by `orchestrator`. They are not invocable subagents. `ref-pipeline.md` contains the workflow contract; its sections load only after explicit activation.

Plus cross-cutting snippets in `_shared/` (not invocable agents), installed to `~/.claude/agents/_shared/`:

- `_shared/gh-fallback.md` — single source-of-truth fallback patterns for graceful degradation when the `gh` CLI is unavailable. Consumed by `orchestrator.md`, `ref-special-flows.md`, and skills `issue.md`, `plan.md`, `design.md`, `define-ac.md`, `audit.md`, `review-pr.md` via cross-references.
- `_shared/implementation-assembly.md` — the coordinator's pre-delivery version/changelog assembly and complete-candidate commit.
- `_shared/delivery-mechanics.md` — publish-only delivery: validate the candidate, push, open or update the PR, and report its merge state. It never tests or mutates the branch.
- `_shared/operational-rules.md` — cross-cutting voice, language register, git safety, and execution conventions. Referenced by agent `## Voice` sections via `§ "Voice"` and `§ "Language register"`.
- `_shared/operator-dialogue.md` — chat-surface contract: reply shape, length budgets, identifiers-follow-prose, act-then-report. Binds live replies only. Consumed by `orchestrator.md`.
- `_shared/dispatch-contract.md` — single source of truth for dispatch prompt content, the pipeline specialist reference, and the two-halves scope rule. Coordinators and leaf specialists consume it by pointer; never restate it inline.
- `_shared/coordinator-recovery.md` — guidance for causal post-failure recovery and progress preservation. Attempts and corrections are observations only.
- `_shared/coordinator-liveness.md` — guidance for interruption, progress checks, and declared-path audits; routing remains contextual.
- `_shared/orchestrator-state.md` — workspace progress notes and evidence conventions used by the coordinator.
- `_shared/gate-contract.md` — wording for optional operator decision checkpoints and stop conditions. Consumed by `orchestrator.md`.
- `_shared/plan-consolidation.md` — OpenSpec semantic ownership, compact generated `01-plan.md`, and just-in-time operational derivation. Consumed by `architect.md`, `plan-reviewer.md`, `qa.md`, and `orchestrator.md`.
- `_shared/ac-evidence.md` — observable acceptance evidence and review-freshness guidance. Consumed by `tester.md`, `qa.md`, and `ref-pipeline.md`.
- `_shared/apply-review-disposition.md` — the author-side conservative disposition governing how reviewer comments are evaluated during comment incorporation. Consumed by `orchestrator.md`.
- `_shared/finding-connection.md` — the cross-check that links a change widening a path with any other finding or comment that already declares a risk on that path. Consumed by `apply-review-disposition.md` and `review-lenses/loosening-impact.md`.
- `_shared/kg-write-policy.md` — KG write-time content policy and dedup checks. Loaded only by explicit knowledge flows and the narrow security-finding write site; Delivery never writes KG state.
- `_shared/output-template.md` — cross-cutting output-discipline contract (silence-on-success, one-line error + next-step). Consumed by `orchestrator.md`, `delivery.md`, `init-project.md`, `architect.md`, `implementer.md`, `tester.md`, `cleaner.md`, `qa.md`, `security.md`, and the setup/lint/memory skills.

### Objective column — authoring standard

`Objective` is the same statement as the agent's frontmatter `description` (see "Frontmatter keys" above), condensed to fit the table above. Keep it concrete: name the work lens, its useful output, and any boundary that matters. The `Role` column may describe method or context without becoming a second objective.

**The `ref-*` prefix is a naming convention, not an exclusion loophole.** A file named `agents/ref-*.md` is a lazy-loaded reference file consumed by the coordination agent (`orchestrator`) — it is never a dispatchable agent, never earns a Roster row of its own, and any `model`/`effort` frontmatter it carries is vestigial. Naming a dispatchable agent `ref-*` is a convention violation, not a legitimate way to exclude it from the Roster bijection or from `/th:lint`'s checks; the deterministic enforcement of this rule lives in `docs/testing.md` (Suite 180).

## Runtime metadata and installation modes

The `model`, `effort`, and `tools` values are per-agent deployment metadata.
The source frontmatter is authoritative and the roster is a human-readable
mirror; generators and installers create the runtime copies. This README does
not assign a global tier, override a role, or replace the target harness's
configuration.

The legacy installer may apply an installation profile when it copies agents.
Its transformation is defined by the installer and runtime configuration, not
by a second policy table in this document.

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
