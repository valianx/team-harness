# How it works

Team-harness turns Claude Code into a Spec-Driven Development pipeline. Every feature runs through three stages with mandatory human gates between them. State lives in files (`workspaces/{feature}/`) so any session — yours, a teammate's, tomorrow's — can resume cold by reading them.

---

## Entry point: the orchestrator

**The `orchestrator` agent is the canonical front door for every workflow.** You drive the entire lifecycle by talking to it conversationally — design, implementation, delivery, and recovery all enter through the same agent. Phrasings that route correctly:

```
@th:orchestrator give me the work plan for this task: <description>   # → Stage 1 design
@th:orchestrator implement it                                          # → Stage 2 implementation
@th:orchestrator open the PR                                           # → Stage 3 delivery + push
@th:orchestrator recover <feature>                                     # → resume from 00-state.md
```

The orchestrator's intent-detection step (Step 6 of its contract in `agents/orchestrator.md`) classifies the natural-language request and dispatches to the right phase or direct mode — design, implementation, verify, delivery, plan-review, validate, deliver, research, and others. Verbs such as `design`, `give me the plan`, `implement`, `open the PR`, `validate`, `review the plan`, `research`, and `recover` map to specific phases. The intent-detection patterns are bilingual; the operator can use either English or Spanish at the chat layer, but repo artefacts (this doc included) are written in English.

**Skills (slash commands) are optional shortcuts.** Skills like `/design`, `/deliver`, `/recover`, `/issue`, `/research`, `/status` exist and work, but they all route into the same orchestrator agent under the hood. They give you a deterministic entry point (no intent-detection step) and a few extras like `/design #5` fetching GitHub issue #5 automatically — but the conversational `@th:orchestrator` path covers everything.

Pick whichever feels more natural. The rest of this doc uses the orchestrator-conversational form.

---

## The pipeline

You tell the orchestrator: `@th:orchestrator give me the work plan for this task: add a daily reports endpoint`.

### Stage 1 — Analysis

The `orchestrator` creates `workspaces/daily-reports/` and routes to the `architect`. The architect reads `docs/knowledge.md`, the codebase, and any prior workspaces; produces `01-architecture.md` (the design proposal) and `02-task-list.md` (one section per PR, with Given/When/Then acceptance criteria). `qa` runs Phase 1.5 to confirm every AC maps to a Work Plan step. `plan-reviewer` runs Phase 1.6 to audit the plan-shape (one PR per service, AC format, consolidated documents, cross-references).

You receive **STAGE-GATE-1** — a STOP block with the TL;DR, the human-review decisions, and the PR table. Reply `approve` (per-PR stops in Stage 2) or `approve autonomous` (skip the per-PR stops).

### Stage 2 — Implementation (one PR at a time)

PRs run in parallel rounds computed from their `Depends on:` field (round 1 is everything with no dependencies). For each PR:

- The `implementer` writes code strictly scoped to that PR's `Files:`. If a hidden constraint surfaces, it annotates the constraint and Phase 2.5 **Constraint Reconciliation** decides keep / amend / drop.
- The `tester` writes tests, the `qa` validates against the AC list, `security` audits if the change is security-sensitive — all in parallel.
- The Acceptance Gate (Phase 3.5) re-reads the three artifacts; if any AC is missing a passing test it routes back to the implementer.
- Phase 3.6 (`acceptance-checker`) independently compares the original spec against the delivered work.

**STAGE-GATE-2** fires between PRs — unless you granted autonomy at GATE-1.

### Stage 3 — Delivery

`delivery` updates the CHANGELOG, bumps the version, creates the feature branch, commits with conventional messages. Phase 4.5 **Internal Review** runs the `reviewer` advisory-mode on the freshly-pushed diff and surfaces the top 3 issues.

**STAGE-GATE-3** is your final stop — reply `ship` / `amend` / `abort`. On `ship`, the PR opens on GitHub.

---

## Other pipelines

For full reference coverage of every pipeline — including the refactor flow, database changes flow, test pipeline, research/spike, plan flow, acceptance gate semantics, gh-fallback degradation tiers, and multi-reviewer — see [`docs/pipelines.md`](./pipelines.md).

---

## Bug-fix flow (type: fix and type: hotfix)

When the orchestrator classifies a request as `type: fix` or `type: hotfix` (via signals like `bug`, `solucionar`, `arreglar`, `corregir`, `regresión`, urgency markers, or GitHub `bug` label), the pipeline runs the **Bug-fix Pipeline** — the same 3-stage shell as feature flow, with type-specific content shifts. Nothing is stripped from the workspaces backbone; every artifact a feature produces is also produced for a bug fix.

| Stage | Bug-fix difference |
|---|---|
| Stage 1 — Analysis | The architect runs in **root-cause mode** and produces `01-root-cause.md` (1 page max, focused on file:line + mechanism + scope) instead of `01-architecture.md`. plan-reviewer gains Rules 7 + 8 (Regression Test Approach declared in `01-root-cause.md`; regression test cross-referenced in every PR's AC). |
| Phase 2.0 — Regression Test (NEW, between STAGE-GATE-1 and Phase 2) | The tester authors a **failing test** in `02-regression-test.md` BEFORE the implementer touches source code. The test becomes the implementer's contract. Mandatory always; there is no fallback. |
| Stage 2 — Implementation | The implementer runs under a **scope-discipline contract**: zero tangential refactors, no "while I'm here" cleanups. Spotted issues go to `## Follow-ups Spotted`, not into the diff. |
| Stage 2 — Verify | `security` agent runs **always** in parallel with `tester` and `qa`, regardless of any other criterion. Defense-in-depth: many bugs have non-obvious security implications. |
| Stage 3 — Delivery | CHANGELOG entry goes under `### Fixed`. PR title is `fix(area): <summary>` (or `... (hotfix)` for hotfix). PR body includes a mandatory **Bug Report** section with reproduction steps + root cause + regression test path. `Fixes #N` triggers GitHub's auto-close. |

For `type: hotfix`: Phase 1 (architect root-cause) is skipped entirely; the orchestrator emits a one-sentence prose plan at STAGE-GATE-1 instead. Phase 2.0 (regression test) is still mandatory.

### Tier System (1-4)

The Bug-fix Pipeline is **tier-classified** at Phase 0a (Classify) so trivial bugs skip ceremony and critical bugs get extended analysis. The orchestrator combines three signals — keywords in the bug report (low-tier hints like `typo`, high-tier triggers like `auth`/`injection`/`token`/`bypass`), file-path patterns (Tier 1: `*.md` / `docs/**`; Tier 2: `.github/**` / `scripts/**` / `*.test.*`; Tier 3: `src/**` / `lib/**` / `app/**` / `cmd/**`; Tier 4: sensitive paths combined with high-tier keywords), and operator overrides (`[TIER: N]`, `[regression-test: required]`, `[security: required]`) — to derive `bug_tier: 1 | 2 | 3 | 4`. Sensitive paths (`auth/**`, `middleware/**`, `api/**`, `db/**`, `security/**`, `crypto/**`, `session/**`) force a minimum of Tier 3 regardless of the operator's hint, so a Tier 1 / Tier 2 run cannot accidentally bypass security on production-critical code.

| Tier | Name | Phase 1 (root-cause) | Phase 2.0 (regression test) | Phase 3 agents | Agent runs |
|---|---|---|---|---|---|
| **1** | Docs/Trivial | Skipped — one-sentence prose plan | Conditional skip when no behavior change | tester (suite no-regress) only | ~3 |
| **2** | Light fix | Architect with `mode: light-root-cause`, ≤30 lines | Mandatory | tester + qa | ~5 |
| **3** | Standard fix | Architect with `mode: full-root-cause`, 1 pg max (current PR #50 default) | Mandatory | tester + qa + security | ~7 |
| **4** | Critical/Security | Architect with `mode: full-root-cause` + mandatory `## Prior Art` (`mcp__memory__search_nodes`) | Mandatory | tester + qa + security (extended analysis) | ~9 |

The architect can re-tier in Phase 1 via `tier_promote: <new_tier>` if codebase analysis reveals the scope is wider than the initial classification — operator-in-loop, same protocol as `type_reclassify`. Default is Tier 3 when signals are ambiguous (conservative).

Full flow definition: [`agents/ref-special-flows.md`](../agents/ref-special-flows.md) § Bug-fix Flow § Tier System.

---

## Resume any time

All state lives in files. `/recover {feature-name}` reads `00-state.md` and continues from `next_action`. Works across compactions, across sessions, across machines (as long as `workspaces/` travels with the repo).

Open `02-task-list.md` at any point and you see PR-level `Status:` (`pending | in-progress | verified | merged | blocked`) and AC checkboxes flipped to `- [x]` on PASS. No cross-referencing required.

---

## Why a harness

Chat-driven Claude Code, run unguided, has documented failure modes that compound over a feature's lifetime:

| Without a harness | With this harness |
|---|---|
| Acceptance criteria drift silently mid-task | `[CONSTRAINT-DISCOVERED]` annotations + Phase 2.5 reconciliation force keep/amend/drop to be a deliberate decision |
| Plans accumulate iteration cruft (`v1 → v6`, "previously decided", parallel review files) | `architect` forbids version markers; `qa` cannot write sibling review files — analysis docs read as one polished pass |
| Reviews get punted to the human ("the harness blocked it") | Phase 1.6 plan-review is inviolable — subagent or inline fallback, never escalated to the user without an audit |
| Multi-PR splits leave the WHY in nobody's head | Base PRs carry `Cleanup PR:` with operational rationale; secondary PRs carry `Base PR:` back-reference |
| "Did the AC pass?" requires reading three files | `02-task-list.md` self-describes: `Status:` per PR + AC checkboxes flipped on PASS |
| Agents silently disappear when their frontmatter has invalid YAML | A structural test parses every agent and fails on broken YAML |
| Destructive commands slip through inattention | `PreToolUse` policy blocks `rm -rf`, force push, secret-file writes |

Each row is a real failure mode encountered and patched. See [`docs/knowledge.md`](./knowledge.md) for the canonical pattern / decision log.

---

## What ships

- **Agents.** `orchestrator`, `architect`, `implementer`, `tester`, `qa`, `plan-reviewer`, `acceptance-checker`, `delivery`, `reviewer`, `reviewer-consolidator`, `security`, `diagrammer`, `likec4-diagrammer`, `d2-diagrammer`, `translator`, `gcp-cost-analyzer`, `init`, `agent-builder`. Full roster + model + effort matrix in [`agents/README.md`](../agents/README.md).
- **Skills** (slash commands). Most route into the orchestrator; standalone utilities include `/lint`, `/status`, `/memory`, `/tmux`, `/th-update`, and `/background`. Common routed entries: `/design`, `/recover`, `/deliver`, `/review-pr`, `/issue`. `/background` launches a background `claude -p` headless session for eligible long-running tasks — it does not route through the orchestrator.
- **Hooks.** `hooks/policy-block.sh` is the `PreToolUse` policy gate — it intercepts every `Bash`, `Write`, `Edit`, and `NotebookEdit` tool call and denies destructive operations before they execute (48 tested cases: `rm -rf`, force-push, secret-file writes, SQL DROP/TRUNCATE, sensitive-path writes). Notification scripts per OS are optional opt-in. See [`hooks/README.md`](../hooks/README.md).
- **External Memory MCP** server. Semantic memory across projects. The server (`context-harness-mcp` or any MCP-compatible service) lives outside this repo. Reference: [`docs/kg-content-policy.md`](./kg-content-policy.md).

---

## Verification

```bash
bash tests/run-all.sh
```

| Suite | Catches |
|---|---|
| `test_policy_block.sh` | Destructive-command leakage at `PreToolUse` |
| `test_agent_structure.py` | Missing contract sections, drift between agents, role conflicts, model+effort matrix |
| `test_agent_frontmatter.py` | Silent-agent-drop class of bug (invalid YAML in agent frontmatter) |

Prompt behaviour itself only validates in live pipelines — restart Claude Code and smoke-test by hand.

---

## Roadmap

**Today.** Team Harness is built on **Claude Code** specifically — the agents, skills, hooks, and installer assume the Claude Code CLI, the `Task(subagent_type=…)` dispatch model, the `~/.claude/` layout, and the slash-command surface. There is no abstraction layer over the runtime.

**v2 — provider abstraction.** A future major version will introduce a runtime layer that lets the same agent + skill + hook artifacts target other agentic systems (OpenAI Assistants, LangGraph, local-model harnesses, etc.) without rewriting prompts. The orchestration model (Stage 1 / 2 / 3 + parallel verify + mandatory human gates) is provider-agnostic; the bindings are not.

No timeline. PRs welcome that explore the abstraction shape without breaking the current Claude Code path.
