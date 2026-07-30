# How it works

Team Harness starts as a lightweight direct assistant and offers an explicit Spec-Driven Development pipeline. Pipeline state lives in `workspaces/{feature}/`, so an activated run can resume cold.

---

## Entry point: talk to th:orchestrator

**`th:orchestrator` is the top-level session agent and your single point of contact.** Its 881-word kernel handles conversation, inspection, review, and bounded reversible work directly. It does not load pipeline stages, gates, workspace contracts, or delivery mechanics at startup.

Start the gated flow explicitly:

```text
/th:pipeline add a daily reports endpoint
/th:recover daily-reports
```

`/th:pipeline` is singular and mutating; `/th:pipelines` remains the read-only status renderer. Once activated, the coordinator reads `agents/ref-pipeline.md` by heading: activation sections first, then only the current phase. Gate replies continue the active run without repeating the command.

Broad, ambiguous, sensitive, or irreversible direct work is never silently upgraded. The coordinator recommends `/th:pipeline` and waits; the operator may activate it or narrow the direct scope.

---

## The pipeline

You invoke `/th:pipeline add a daily reports endpoint`.

### Stage 1 — Analysis

`th:orchestrator` runs the **Discover phase** first: it frames the task, may ask clarifying questions, captures an intake survey (pipeline shape, effort, autonomy, scope hint), and waits for an advance signal. Only after that signal does it create `workspaces/daily-reports/` and dispatch the `architect`.

The architect reads `docs/knowledge.md`, the codebase, and any prior workspaces; produces `01-plan.md` — a single merged document with `§ Architecture` (the design proposal) and `§ Task List` (one section per task, with acceptance criteria, plus a `§ Delivery Grouping` declaring how tasks map to PRs). It also writes plan sketches when the change touches those surfaces. `qa-plan` runs Phase 1.5 to confirm each AC is sound and the plan can satisfy it, writing to `reviews/01-plan-review.md § Plan Ratification`. `plan-reviewer` runs Phase 1.6 to audit plan shape; the plan itself stays clean.

You receive **STAGE-GATE-1** — a STOP block with the TL;DR, the human-review decisions, and the Task table. `hooks/sketch-guard.sh` validates that required sketches are present before the gate opens. Reply `approve` or `approve autonomous` (skips the Phase 1.8 post-approval plan-review offer).

### Stage 2 — Implementation (single pass, all tasks)

Every task runs in one `implementer` dispatch, in the order its `Depends on:` field implies — this is execution order within the single pass, not a set of separate dispatches. Each task closes with its own commit. For each task:

- The `implementer` writes code strictly scoped to that task's `Files:`. If a hidden constraint surfaces, it annotates the constraint and Phase 2.5 **Constraint Reconciliation** decides keep / amend / drop.
- The `tester` writes tests, the `qa` validates against the AC list, `security` audits if the change is security-sensitive — all in parallel.
- The Acceptance Gate (Phase 3.5) requires relevant successful `test`, `command`, or `inspection` evidence for every AC; missing evidence routes to the appropriate owner.

Stage 2 is a single implementer pass over every task (one commit per task) — there is no per-round gate; STAGE-GATE-3, below, is the only gate after STAGE-GATE-1.

### Stage 3 — Delivery

STAGE-GATE-3, immediately before delivery: the operator ships, amends, or aborts, seeing a version/CHANGELOG-entry preview and the Pre-Delivery Security Audit's findings. On `ship`, `delivery` writes the PR body and CHANGELOG entry text, and the coordinator validates the Phase-2 branch, bumps the version, commits, pushes, and opens the PR.

**STAGE-GATE-3** is your final stop — reply `ship` / `amend` / `abort`. On `ship`, the orchestrator proceeds to Phase 5 (GitHub Update): the PR is opened on GitHub with `Fixes #N` and labels. The PR is NOT opened during the Phase 4 commit step — STAGE-GATE-3 must complete first.

---

## Other pipelines

For full reference coverage of every pipeline — including the refactor flow, database changes flow, test pipeline, research/spike, plan flow, acceptance gate semantics, gh-fallback degradation tiers, and multi-reviewer — see [`docs/pipelines.md`](./pipelines.md).

---

## Bug-fix flow (type: fix and type: hotfix)

When th:orchestrator classifies a request as `type: fix` or `type: hotfix` (via signals like `bug`, `solucionar`, `arreglar`, `corregir`, `regresión`, urgency markers, or GitHub `bug` label), the pipeline runs the **Bug-fix Pipeline** — the same 3-stage shell as feature flow, with type-specific content shifts. Nothing is stripped from the workspaces backbone; every artifact a feature produces is also produced for a bug fix.

| Stage | Bug-fix difference |
|---|---|
| Stage 1 — Analysis | The architect runs in **root-cause mode** and produces `01-root-cause.md` (1 page max, focused on file:line + mechanism + scope) instead of `01-plan.md`. plan-reviewer gains Rules 7 + 8 (Regression Test Approach declared in `01-root-cause.md`; regression test cross-referenced in every task's AC). |
| Phase 2.0 — Regression Test (NEW, between STAGE-GATE-1 and Phase 2) | The tester authors a **failing test** in `02-regression-test.md` BEFORE the implementer touches source code. The test becomes the implementer's contract. Mandatory always; there is no fallback. |
| Stage 2 — Implementation | The implementer runs under a **scope-discipline contract**: zero tangential refactors, no "while I'm here" exploration or cleanup. Incidental issues remain untouched. AC-compatible technical deviations are recorded only in `02-implementation.md`; task-blocking constraints and required scope drift are also surfaced to the coordinator. |
| Stage 2 — Verify | `security` agent runs **always** in parallel with `tester` and `qa`, regardless of any other criterion. Defense-in-depth: many bugs have non-obvious security implications. |
| Stage 3 — Delivery | CHANGELOG entry goes under `### Fixed`. PR title is `fix(area): <summary>` (or `... (hotfix)` for hotfix). PR body includes a mandatory **Bug Report** section with reproduction steps + root cause + regression test path. `Fixes #N` triggers GitHub's auto-close. |

For `type: hotfix`: Phase 1 (architect root-cause) is skipped entirely; th:orchestrator emits a one-sentence prose plan at STAGE-GATE-1 instead. Phase 2.0 (regression test) is still mandatory.

### Tier System (0–4)

The Bug-fix Pipeline is **tier-classified** at Phase 0a (Classify) so trivial bugs skip ceremony and critical bugs get extended analysis. th:orchestrator combines three signals — keywords in the bug report (low-tier hints like `typo`, high-tier triggers like `auth`/`injection`/`token`/`bypass`), file-path patterns (Tier 1: `*.md` / `docs/**`; Tier 2: `.github/**` / `scripts/**` / `*.test.*`; Tier 3: `src/**` / `lib/**` / `app/**` / `cmd/**`; Tier 4: sensitive paths combined with high-tier keywords), and operator overrides (`[TIER: N]`, `[regression-test: required]`, `[security: required]`) — to derive `bug_tier: 0 | 1 | 2 | 3 | 4`. Sensitive paths (`auth/**`, `middleware/**`, `api/**`, `db/**`, `security/**`, `crypto/**`, `session/**`) force a minimum of Tier 3 regardless of the operator's hint, so a Tier 1 / Tier 2 run cannot accidentally bypass security on production-critical code.

| Tier | Name | Phase 1 (root-cause) | Phase 2.0 (regression test) | Phase 3 agents | workspaces |
|---|---|---|---|---|---|
| **0** | Trivial/Cosmetic | Skipped | Skipped | tester only (suite no-regress; no full audit) | **None** — no `workspaces/` folder created |
| **1** | Docs/Trivial | Skipped — one-sentence prose plan | Conditional skip when no behavior change | tester (suite no-regress) only | Yes — minimal |
| **2** | Light fix | Architect with `mode: light-root-cause`, ≤30 lines | Mandatory | tester + qa | Yes — full |
| **3** | Standard fix | Architect with `mode: full-root-cause`, 1 pg max | Mandatory | tester + qa (security at the Pre-Delivery Security Audit) | Yes — full |
| **4** | Critical/Security | Architect with `mode: full-root-cause` + mandatory `## Prior Art` (`mcp__memory__search_nodes`) | Mandatory | tester + qa (security at the Pre-Delivery Security Audit, extended analysis) | Yes — full + prior-art |

**Tier 0 — no workspaces.** Genuinely cosmetic changes (typo in a comment, whitespace in README, CHANGELOG typo): the implementer makes the fix, runs tests, and opens the PR. No `00-state.md`, no `01-plan.md`, no workspaces folder. The PR review is the only gate. Auto-classifies when all of: single file, ≤5 lines changed, docs/comment/whitespace-only path, no test paths, no system-level files (`agents/*.md`, `skills/*.md`, `cmd/install/*.go`). Declare explicitly with `[TIER: 0]`.

The architect can recommend a re-tier in Phase 1 via `failure_kind: reclassification-needed` + `recommended_tier: <new_tier>` if codebase analysis reveals the scope is wider than the initial classification — operator-in-loop. Default is Tier 3 when signals are ambiguous (conservative).

Full flow definition: [`agents/ref-special-flows.md`](../agents/ref-special-flows.md) § Bug-fix Flow § Tier System.

---

## Resume any time

All state lives in files. `/recover {feature-name}` reads `00-state.md` and continues from `next_action`. Works across compactions, across sessions, across machines (as long as `workspaces/` travels with the repo).

Open `01-plan.md § Task List` at any point and you see task-level `Status:` (`pending | in-progress | verified | merged | blocked`) and AC checkboxes flipped to `- [x]` on PASS. No cross-referencing required.

---

## Why a harness

Chat-driven Claude Code, run unguided, has documented failure modes that compound over a feature's lifetime:

| Without a harness | With this harness |
|---|---|
| Acceptance criteria drift silently mid-task | `[CONSTRAINT-DISCOVERED]` annotations + Phase 2.5 reconciliation force keep/amend/drop to be a deliberate decision |
| Plans accumulate iteration cruft (`v1 → v6`, "previously decided", parallel review files) | `architect` forbids version markers; `qa` cannot write sibling review files — analysis docs read as one polished pass |
| Reviews get punted to the human ("the harness blocked it") | Phase 1.6 plan-review is inviolable — dispatched as a subagent, never escalated to the user without a verdict; there is no degraded inline mode |
| Multi-PR splits leave the WHY in nobody's head | Base PRs carry `Cleanup PR:` with operational rationale; secondary PRs carry `Base PR:` back-reference |
| "Did the AC pass?" requires reading three files | `01-plan.md § Task List` self-describes: `Status:` per task + AC checkboxes flipped on PASS |
| Agents silently disappear when their frontmatter has invalid YAML | A structural test parses every agent and fails on broken YAML |
| Destructive commands slip through inattention | `PreToolUse` policy blocks `rm -rf`, force push, secret-file writes |

Each row is a real failure mode encountered and patched. See [`docs/knowledge.md`](./knowledge.md) for the canonical pattern / decision log.

---

## What ships

- **Agents.** 26 agents. The coordination agent — `orchestrator` (top-level session agent) — plus the specialists: `architect`, `implementer`, `tester`, `qa`, `qa-plan`, `plan-reviewer`, `delivery`, `reviewer`, `reviewer-consolidator`, `security`, `ux-reviewer`, `diagrammer`, `likec4-diagrammer`, `d2-diagrammer`, `documenter`, `translator`, `gcp-cost-analyzer`, `gcp-infra`, `init`, `agent-builder`, `mentor`, `researcher`, `research-consolidator`, `code-researcher`, `adversary`. How they relate at runtime: [`docs/agent-tree.md`](./agent-tree.md). Full roster, model tier (opus / sonnet / haiku), and effort matrix: [`agents/README.md`](../agents/README.md).
- **Skills** (slash commands). `/th:pipeline` explicitly activates the gated flow; most others route through the direct kernel. Standalone utilities include `/th:lint`, `/th:pipelines`, `/th:kg`, `/th:tmux`, `/th:update`, and `/th:background`. Common routed entries include `/th:design`, `/th:plan`, `/th:recover`, `/th:deliver`, `/th:review-pr`, and `/th:issue`. `/th:background` launches a background `claude -p` headless session for eligible long-running tasks — it does not route through `th:orchestrator`.
- **Hooks.** Registered boundary hooks are intentionally narrow: `policy-block` blocks catastrophic recursive deletion and provider-shaped credentials; `dev-guard` gates Git/GitHub/ClickUp outward actions; `gcp-guard` classifies mutating gcloud verbs. Additional retained hook bodies may be unwired; `.claude-plugin/hooks.json` is the authority. Notification scripts are optional. Full catalog: [`hooks/README.md`](../hooks/README.md).
- **External Memory MCP** server. Semantic memory across projects. The server (`context-harness-mcp` or any MCP-compatible service) lives outside this repo. Reference: [`docs/kg-content-policy.md`](./kg-content-policy.md).

---

## Dev mode (top-level-is-orchestrator, SEC-DR-2)

**The top-level Claude Code agent IS `th:orchestrator`** — the coordination agent, not a specialist. No filesystem marker, no mode flag, and no special invocation is required — when Claude Code runs at the top level, it operates with the full `th:orchestrator` role: it handles intake/discover/specify directly and runs the gated pipeline itself, dispatching every specialist subagent (architect, implementer, tester, qa, etc.) via `Task`. It never dispatches another coordinator, including another copy of itself; there is no split to verify and no monolith fallback, because there is no second coordinator for the pipeline to fall back from.

**Outward-action gate.** All outward actions (`git push`, `gh pr create`, `gh pr merge`, GitHub API writes, ClickUp MCP writes) are evaluated via `hooks/dev-guard.sh`. The hook fires unconditionally and gates by destination — the agent cannot auto-approve regardless of autonomy grants. A `git push` whose single recognized refspec targets a non-default branch on `origin` resolves to `allow` (no prompt); a push to the default branch, a tag push, a force push, `gh pr create`/`merge`, GitHub API writes, and ClickUp MCP writes still resolve to `ask`, requiring explicit operator approval.

**Every specialist dispatch goes through `Task`.** All specialist subagents (architect, implementer, tester, qa, etc.) are dispatched via `Task`, and none of them is itself a coordinator — there is no nested-dispatch takeover protocol to fall back to, because no coordinator is ever dispatched as a subagent. See `docs/subagent-orchestration.md`.

---

## Verification

```bash
bash tests/run-all.sh
```

| Suite | Catches |
|---|---|
| `test_policy_block.sh` | Destructive-command leakage at `PreToolUse` |
| `test_security_scan.py` | Read-only-tier agents carrying Bash, missing injection preambles, hook-manifest form, shipped secrets |
| `test_agent_frontmatter.py` | Silent-agent-drop class of bug (invalid YAML in agent frontmatter) |

Prompt behaviour itself only validates in live pipelines — restart Claude Code and smoke-test by hand.

---

## Roadmap

**Today.** Team Harness is built on **Claude Code** specifically — the agents, skills, hooks, and installer assume the Claude Code CLI, the `Task(subagent_type=…)` dispatch model, the `~/.claude/` layout, and the slash-command surface. There is no abstraction layer over the runtime.

**v2 — provider abstraction.** A future major version will introduce a runtime layer that lets the same agent + skill + hook artifacts target other agentic systems (OpenAI Assistants, LangGraph, local-model harnesses, etc.) without rewriting prompts. The orchestration model (Stage 1 / 2 / 3 + parallel verify + mandatory human gates) is provider-agnostic; the bindings are not.

No timeline. PRs welcome that explore the abstraction shape without breaking the current Claude Code path.
