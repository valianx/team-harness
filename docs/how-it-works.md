# How it works

Team-harness turns Claude Code into a Spec-Driven Development pipeline. Every feature runs through three stages with mandatory human gates between them. State lives in files (`session-docs/{feature}/`) so any session — yours, a teammate's, tomorrow's — can resume cold by reading them.

---

## Entry point: the orchestrator

**The `orchestrator` agent is the canonical front door for every workflow.** You drive the entire lifecycle by talking to it conversationally — design, implementation, delivery, recovery all enter through the same agent. Examples of real phrasings that route correctly:

```
@orchestrator dame el plan de trabajo para esta tarea: <descripción>   # → Stage 1 design
@orchestrator implementala                                              # → Stage 2 implementation
@orchestrator lanza el PR                                               # → Stage 3 delivery + push
@orchestrator recuperá <feature>                                        # → resume from 00-state.md
```

The orchestrator's intent-detection step (Step 6 of its contract in `agents/orchestrator.md`) classifies your natural-language request and dispatches to the right phase or direct mode — design, implementation, verify, delivery, plan-review, validate, deliver, research, etc. Verbs like `diseñá`, `dame el plan`, `implementala`, `lanza el PR`, `validá`, `revisá el plan`, `investigá`, `recuperá` all map to specific phases.

**Skills (slash commands) are optional shortcuts.** Skills like `/design`, `/deliver`, `/recover`, `/issue`, `/research`, `/status` exist and work, but they all route into the same orchestrator agent under the hood. They give you a deterministic entry point (no intent-detection step) and a few extras like `/design #5` fetching GitHub issue #5 automatically — but the conversational `@orchestrator` path covers everything.

Pick whichever feels more natural. The rest of this doc uses the orchestrator-conversational form.

---

## The pipeline

You tell the orchestrator: `@orchestrator dame el plan de trabajo para esta tarea: agregar un endpoint de daily reports`.

### Stage 1 — Analysis

The `orchestrator` creates `session-docs/daily-reports/` and routes to the `architect`. The architect reads `docs/knowledge.md`, the codebase, and any prior session-docs; produces `01-architecture.md` (the design proposal) and `02-task-list.md` (one section per PR, with Given/When/Then acceptance criteria). `qa` runs Phase 1.5 to confirm every AC maps to a Work Plan step. `plan-reviewer` runs Phase 1.6 to audit the plan-shape (one PR per service, AC format, consolidated documents, cross-references).

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

## Resume any time

All state lives in files. `/recover {feature-name}` reads `00-state.md` and continues from `next_action`. Works across compactions, across sessions, across machines (as long as `session-docs/` travels with the repo).

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

- **17 agents** (`orchestrator`, `architect`, `implementer`, `tester`, `qa`, `plan-reviewer`, `acceptance-checker`, `delivery`, `reviewer`, `security`, plus `diagrammer` / `likec4-diagrammer` / `d2-diagrammer`, `translator`, `gcp-cost-analyzer`, `init`, `agent-builder`). Full roster + model + effort matrix in [`agents/README.md`](../agents/README.md).
- **28 skills** (slash commands). Most route into the orchestrator; four are standalone (`/lint`, `/status`, `/memory`, `/tmux`). Common entries: `/design`, `/recover`, `/deliver`, `/review-pr`, `/issue`, `/background`.
- **Hooks.** `hooks/policy-block.sh` is the `PreToolUse` gate (48 tested cases: destructive Bash, force-push, secret-file writes, etc.). Notification scripts per OS are optional opt-in.
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
