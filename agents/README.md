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
- `model` — `opus` for the single authoritative design pass and the highest-stakes evidence-backed acceptance, security, agent construction, and coordination (`architect`, `qa`, `security`, `agent-builder`, `orchestrator`); `sonnet` for execution against an approved plan and secondary analysis/review (`adversary`, `reviewer`, `cleaner`, `translator`, …); `haiku` only for `researcher`/`init-project` (mechanical, downstream-gated).
- `effort` — reasoning level when the agent is active. Allowed: `medium` | `high` | `xhigh` (the ceiling). **`max` is retired** (marginal gain over `xhigh` at a large cost premium) and **`low` is forbidden** (the floor is `medium`). Mechanical cleanup uses `medium`; implementation and test authoring use `high`. On Claude Code effort is session-global, so this per-agent value is opencode-honored and advisory on CC; the model is the load-bearing per-agent lever there. The matrix in the Roster below is canonical.
- `color` — arbitrary colour label for display.
- `tools` — comma-separated allowlist of tools the agent can invoke (capability scoping). The runtime restricts the agent to this set; tools not listed are unavailable. Read-only agents (`security`, `qa`) MUST NOT include `Bash`, `Edit`, or `Write` beyond their own workspace doc. Agents that need external research include `WebFetch`, `WebSearch`. Builders that execute repository commands (implementer, tester, cleaner, diagrammers) include `Bash`; prose-only Delivery does not. The canonical allowlist per agent lives in each agent's frontmatter and is the source of truth.

## Roster

The combination of `model` + `effort` + `tools` below is the canonical matrix for this repo. `/th:lint` enforces `model` and `effort` (Check 7) and the tool allowlist surface (Check 4) — any drift between an agent's frontmatter and this table fails the check.

One agent owns coordination. **`orchestrator`** is the top-level session agent and the operator's single point of contact. Its startup kernel serves direct work by default; `/th:pipeline` explicitly activates the lazy-loaded v3 contract in `ref-pipeline.md`. During an active pipeline it owns Intake, Discover/framing, Specify, spec+AC co-authoring, config/language resolution, initiative state, both STAGE-GATEs, and every write to `00-state.md`, events, the decision ledger, and the pipeline summary. It never dispatches another coordinator.

The active pipeline machine is `design → waiting_gate1 → implementation → validation →
waiting_gate3 → delivery → complete`. Team Harness has exactly two postures: `inline` and
`pipeline`. Inline is the direct default and remains outside the machine; a current live operator
may explicitly select sensitive inline work or request a bounded tester, QA, or security review,
and those ad hoc reviews create no workspace, state, events, gates, or delivery action. Pipeline
entry requires explicit live activation or recovery and always uses the canonical full v3 machine.
Retired route markers are migration data only and never select a posture or release a gate. A
failed direct predicate is reported to the operator rather than hidden behind a dispatch.

| Agent | Objective | Model | Effort | Tools (allowlist) | Role |
|---|---|---|---|---|---|
| `orchestrator` | Serve direct work from a lightweight kernel; on explicit activation, run the gated pipeline and present every gate. | opus | `high` | Read, Edit, Write, Bash, Glob, Grep, Task, WebFetch, WebSearch, NotebookEdit, `mcp__memory__search_nodes`, `mcp__memory__open_nodes`, `mcp__memory__create_nodes`, `mcp__memory__add_observations`, `mcp__memory__create_relations`, `mcp__memory__read_graph`, `mcp__memory__session_start`, `mcp__memory__session_end`, `mcp__memory__record_flow_event` | Top-level session agent. Direct by default; `/th:pipeline` or `/th:recover` loads `ref-pipeline.md` by section. During an active run it is the sole writer of `00-state.md`, dispatches leaf specialists directly, and prepares, presents, and records every STAGE-GATE. |
| `architect` | Produce the architecture proposal, Work Plan, and risk analysis for a task; never writes production code. | opus | `xhigh` | Read, Glob, Grep, Edit, Write, WebFetch, WebSearch, `mcp__memory__search_nodes`, `mcp__memory__open_nodes` | One authoritative bounded design pass; plan review is explicit-only. **No Bash** (read-only on system). KG writes stay in the coordinator's knowledge checkpoint. |
| `agent-builder` | Build agent and skill definitions that meet this authoring standard; never implements product code or features. | opus | `xhigh` | Read, Edit, Write, Glob, Grep, Bash | Create / improve agents and skills. |
| `security` | Produce a prioritized security audit report against OWASP/CWE/ASVS; never modifies source code. | opus | `xhigh` | Read, Glob, Grep, Edit, Write, WebFetch, WebSearch, `mcp__memory__search_nodes`, `mcp__memory__open_nodes` | OWASP / CWE / ASVS audits and design review. **No Bash**; writes only declared report artifacts. |
| `adversary` | Try to break every changed security control in the frozen delivery diff and return `broke-it` or `could-not-break`; never certifies. | sonnet | `xhigh` | Read, Glob, Grep, Edit, Write | Independent validation-checkpoint adversarial reviewer, dispatched only when the security floor applies. **No Bash or external search.** Writes only its own English report; `Edit` supports recovery and amend reports without touching source. |
| `reviewer` | Review an immutable GitHub PR snapshot and return concise body + inline findings; never publishes or changes files. | sonnet | `high` | Read, Glob, Grep, Context7 | Evidence-based general or explicitly focused PR review. |
| `pr-review-qa` | Validate acceptance criteria against an immutable PR snapshot and return findings inline. | sonnet | `high` | Read, Glob, Grep | Dedicated PR QA lens. No process execution, delegation, or filesystem mutation; the coordinator persists its return. |
| `pr-review-security` | Review an immutable PR snapshot for concrete security regressions and return an inline draft. | sonnet | `high` | Read, Glob, Grep | Dedicated PR security lens. No Bash, Edit, or Write; the coordinator persists its returned draft. |
| `qa-plan` | Define sound acceptance criteria when explicitly requested; never writes code. | sonnet | `high` | Read, Glob, Grep, Edit, Write | Direct `define-ac` support and explicit `/th:plan-review` only; never an automatic pipeline phase. **No Bash**. |
| `qa` | Validate an implementation against its acceptance criteria and report pass/fail; never writes code or defines AC standalone (that lives in `qa-plan`). | opus | `xhigh` | Read, Glob, Grep, Edit, Write, `mcp__memory__search_nodes`, `mcp__memory__open_nodes` | Highest-capability final acceptance over the frozen implementation and executable evidence; also docs-validation and cross-repo review. **No Bash** (read-only on system). KG read-only for AC-pattern lookup. |
| `plan-reviewer` | Audit `01-plan.md` against the plan-shape rules when explicitly requested; never modifies the plan. | sonnet | `medium` | Read, Glob, Grep, Write | Read-only audit for `/th:plan-review`; no automatic pre-gate dispatch. **No Bash, no Edit** (write-only on its own workspace doc). |
| `gcp-cost-analyzer` | Produce a GCP cost and resource-inventory report; does not modify or delete any GCP resources. | opus | `high` | Read, Bash, Glob, Grep, Write | GCP cost / resource inventory reports. Bash limited to `gcloud`/`bq` reads. |
| `gcp-infra` | Plan GCP infrastructure changes via generated `gcloud` scripts; never mutates GCP directly without an explicit operator-approved apply step. | opus | `xhigh` | Read, Bash, Glob, Grep, Write | GCP infrastructure changes via generated `gcloud` scripts (create → validate → apply). Read-and-plan default; mutation hard-gated at a STOP block; destructive needs extra ack. |
| `init-project` | Bootstrap a repository's `CLAUDE.md` and `CHANGELOG.md`; produces no application code. | haiku | `medium` | Read, Edit, Write, Glob, Grep, Bash | Bootstrap `CLAUDE.md` in any repo. |
| `implementer` | Write the smallest approved production diff; may update explicitly planned canonical documentation requested by the operator or required for public accuracy. Never designs architecture or writes tests. | sonnet | `high` | Read, Edit, Write, Bash, Glob, Grep, NotebookEdit | Production code and narrowly scoped canonical documentation following the architect's Work Plan. |
| `tester` | Author and run test suites against acceptance criteria; never writes production code. | sonnet | `high` | Read, Edit, Write, Bash, Glob, Grep, `mcp__memory__search_nodes`, `mcp__memory__open_nodes` | Test suites with factory mocks. KG read-only for test-pattern lookup. |
| `cleaner` | Clean the approved changed production surface without changing behavior or tests; never expands scope or designs new architecture. | sonnet | `medium` | Read, Edit, Write, Bash, Glob, Grep | One bounded post-green cleanup pass before Freeze; deterministic quality evidence remains coordinator-owned. |
| `diagrammer` | Generate an Excalidraw diagram from the architect's analysis; does not analyze codebases, write code, tests, or documentation. | sonnet | `medium` | Read, Edit, Write, Glob, Grep, Bash, WebFetch | Excalidraw diagrams (render-validate loop). |
| `likec4-diagrammer` | Generate a LikeC4 diagram from the architect's analysis; does not analyze codebases, write code, tests, or documentation. | sonnet | `medium` | Read, Edit, Write, Glob, Grep, Bash | LikeC4 diagrams (architecture-as-code). |
| `d2-diagrammer` | Generate a D2 diagram from the architect's analysis; does not analyze codebases, write code, tests, or documentation. | sonnet | `medium` | Read, Edit, Write, Glob, Grep, Bash | D2 diagrams. |
| `translator` | Extract and translate user-facing strings into i18n keys, producing a glossary and translation report; never modifies test files. | sonnet | `medium` | Read, Edit, Write, Glob, Grep, Bash | i18n discovery, glossary, translation. |
| `documenter` | Transform research findings into Obsidian documentation with diagram-first layout; does not research codebases — that is the architect's job. | sonnet | `high` | Read, Edit, Write, Glob, Grep, Bash | Diagram-first Obsidian documentation from architect research. |
| `ux-reviewer` | Review frontend UI/UX quality and produce a report; never writes code. | opus | `high` | Read, Glob, Grep, Edit, Write, `mcp__context7__resolve-library-id`, `mcp__context7__query-docs` | UI/UX review for frontend tasks — accessibility, responsiveness, component reuse. Dispatched when `frontend_scope: true`. |
| `delivery` | Turn reviewed evidence into the acceptance matrix and PR-body draft; never modifies tracked files or performs git/GitHub mechanics. | sonnet | `medium` | Read, Edit, Write | Pre-Gate-3 PR prose only. |
| `reviewer-consolidator` | Merge selected reviewer/QA/security drafts into one concise review returned inline; never modifies files. | sonnet | `medium` | Read, Glob, Grep | De-duplicates logical findings, adjudicates evidence, and separates body-only cross-file findings from inline threads. |
| `mentor` | Teach the operator as a senior peer via chat and inline diagrams; never writes to or modifies code files. | opus | `high` | Read, Glob, Grep, WebSearch, WebFetch, `mcp__context7__resolve-library-id`, `mcp__context7__query-docs`, Write (teaching-pack files only) | Teaches the operator (codebase/library/language/concept). Read-only on code; produces a layered, diagram-rich teaching pack with one Mermaid concept-map per layer and holds a multi-turn tutoring dialogue. |
| `researcher` | Collect evidence for one narrow search angle and return structured findings; never concludes, ranks, or recommends. | haiku | `medium` | Read, Glob, Grep, WebFetch, WebSearch, Write | Parallel web research map agent. Receives one narrow search angle, runs WebSearch + WebFetch, returns structured evidence-only findings (`claim` + `source_url` + `verbatim_excerpt` + `confidence`). Never concludes, never recommends — evidence collection only. Dispatched by `orchestrator` (research direct mode) as N parallel lanes (default 3, cap 5). |
| `code-researcher` | Collect file:line-grounded evidence for one narrow code angle; never concludes, ranks, or recommends. | sonnet | `high` | Read, Glob, Grep, Bash, Write | Parallel codebase research map agent (read-only). Receives one narrow code angle (a subsystem path-set, concern, or question facet), investigates real files via Read/Glob/Grep + read-only git introspection, and returns file:line-grounded evidence. Never concludes, never ranks, never recommends. Dispatched by `orchestrator` (research-code direct mode) as N parallel code lanes. |
| `research-consolidator` | Deduplicate per-lane research findings into one cited report; never silently picks a winner among conflicting sources. | sonnet | `high` | Read, Glob, Grep, Edit, Write | Parallel web research reduce agent. Reads per-lane findings files, deduplicates claims, surfaces conflicting sources under `### Conflicting sources` (never silently picks a winner), re-weighs source quality, and produces consolidated cited findings for `research/00-research.md` or a Discover warm-findings file. |

Plus reference files (`ref-pipeline.md`, `ref-direct-modes.md`, `ref-special-flows.md`, `ref-intake-flows.md`, `ref-dispatch-machinery.md`) loaded on demand by `orchestrator`. They are not invocable subagents. `ref-pipeline.md` contains the gated contract that previously made the startup agent 20K+ words; its sections load only after explicit activation.

Plus thirteen cross-cutting snippets in `_shared/` (not invocable agents), installed to `~/.claude/agents/_shared/`:

- `_shared/gh-fallback.md` — single source-of-truth fallback patterns for graceful degradation when the `gh` CLI is unavailable. Consumed by `orchestrator.md`, `ref-special-flows.md`, and skills `issue.md`, `plan.md`, `design.md`, `define-ac.md`, `audit.md`, `review-pr.md` via cross-references.
- `_shared/implementation-assembly.md` — the coordinator's pre-Freeze version/changelog assembly and complete-candidate commit.
- `_shared/delivery-mechanics.md` — publish-only delivery: exact validated commit/tree check, push, draft PR, and one merge-state snapshot. It never tests or mutates the branch.
- `_shared/operational-rules.md` — cross-cutting voice, language register, git safety, and pipeline integrity rules. Referenced by all agent `## Voice` sections via `§ "Voice"` and `§ "Language register"`.
- `_shared/operator-dialogue.md` — chat-surface contract: reply shape, length budgets, identifiers-follow-prose, act-then-report. Binds live replies only. Consumed by `orchestrator.md`.
- `_shared/dispatch-contract.md` — single source of truth for what a dispatch prompt may and must not carry, and for the two-halves scope rule (review scope is never bounded by the dispatcher; write scope is always bounded by the recipient's own contract). Consumed by `orchestrator.md` by pointer, never restated inline.
- `_shared/gate-contract.md` — the dual-record STAGE-GATE release contract: bare-literal gate fields, the no-repair invariant, and the STOP-block templates. Consumed by `orchestrator.md`.
- `_shared/plan-consolidation.md` — the plan-is-a-snapshot invariant: `01-plan.md` carries each canonical field's final, reconciled value, never a change log of how it got there. Consumed by `architect.md`, `plan-reviewer.md`, `qa-plan.md`, `qa.md`, `orchestrator.md`.
- `_shared/ac-evidence.md` — canonical AC soundness, evidence-type, test-authoring, and acceptance-gate contract. Consumed by `qa-plan.md`, `tester.md`, `qa.md`, and `ref-pipeline.md`.
- `_shared/apply-review-disposition.md` — the author-side conservative disposition governing how reviewer comments are evaluated during comment incorporation. Consumed by `orchestrator.md`.
- `_shared/finding-connection.md` — the cross-check that links a change widening a path with any other finding or comment that already declares a risk on that path. Consumed by `apply-review-disposition.md` and `review-lenses/loosening-impact.md`.
- `_shared/kg-write-policy.md` — KG write-time content policy and dedup gates. Loaded only by explicit knowledge flows and the narrow security-finding write site; Delivery never writes KG state.
- `_shared/output-template.md` — cross-cutting output-discipline contract (silence-on-success, one-line error + next-step). Consumed by `orchestrator.md`, `delivery.md`, `init-project.md`, `architect.md`, `implementer.md`, `tester.md`, `cleaner.md`, `qa.md`, `security.md`, and the setup/lint/memory skills.

### Objective column — authoring standard

`Objective` is the same statement as the agent's frontmatter `description` (see "Frontmatter keys" above), condensed to fit the table above — not a new listing, and not a place to restate `Role`.

**Form.** The clearest agent files in this tree already state their objective as one verb, one output, and one explicit prohibition — "never concludes", "does not modify or delete any GCP resources", "NEVER issues a GO", "never code". Apply that form only where an agent's own file already states it this way; where it doesn't, state the lens plainly rather than invent a prohibition the agent's own contract doesn't make.

**Counting test — per lens, not per step.** An agent earns one objective per lens (concern), never one per procedure step it happens to execute. `delivery` is a worked example: acceptance-matrix assembly and PR-body drafting are two steps under one publication-prose lens. Counting those steps as separate objectives would misstate the role.

**Recorded-not-in-scope widenings.** Four agents run more than one lens by design: `architect`'s breadth (design, research, planning, audits), `tester`'s two modes (author, verify), `reviewer`'s two destinations (GitHub PR review, the advisory internal-review digest), and `ux-reviewer`'s dual role (Stage 1 enrich, Stage 3 validate). Each `Objective` cell above states the agent's primary lens; the additional lenses stay documented in `Role`, not restated as a second objective and not written as a debt to pay down.

**The `ref-*` prefix is a naming convention, not an exclusion loophole.** A file named `agents/ref-*.md` is a lazy-loaded reference file consumed by the coordination agent (`orchestrator`) — it is never a dispatchable agent, never earns a Roster row of its own, and any `model`/`effort` frontmatter it carries is vestigial. Naming a dispatchable agent `ref-*` is a convention violation, not a legitimate way to exclude it from the Roster bijection or from `/th:lint`'s checks; the deterministic enforcement of this rule lives in `docs/testing.md` (Suite 180).

## Earn the model AND the effort AND the tools

Three principles drive the matrix above:

1. **Model by evidence and decision leverage.** The single authoritative design pass and the highest-stakes evidence-backed acceptance, security, agent construction, and coordination (`architect`, `qa`, security, agent-builder, `orchestrator`, and the GCP/UX specialists) run on `opus`. Automatic plan-review rounds are absent; explicitly requested plan review stays on `sonnet`. Only `researcher` and `init-project` stay on `haiku`.
2. **Effort by depth of judgment required.** `xhigh` is the ceiling — for exhaustive or irreversible analysis (`architect`, `qa`, `security`, `adversary`, `agent-builder`, `gcp-infra`); `max` is retired (marginal gain over `xhigh` at a large cost premium). `high` covers implementation against a Work Plan and test authoring. `medium` is for mechanical work — the floor is `medium`, never `low`. On Claude Code effort is session-global (this per-agent value is opencode-honored, advisory on CC); the model is the load-bearing per-agent lever there.
3. **Tools by capability boundary.** The `tools` field is the **agency boundary** — what the agent literally cannot do regardless of what its prompt instructs. Read-only auditors (`architect`, `security`, `qa`, `qa-plan`) lose `Bash` so they cannot mutate the host even by accident. Builders that execute repository commands (`implementer`, `tester`, diagrammers, `translator`, `init-project`, `agent-builder`) keep `Bash`, while prose-only Delivery is limited to `Read, Edit, Write`; the harness gates destructive commands from Bash-capable roles at `PreToolUse` (see `hooks/config.json`). Permission surface = agency boundary; tighten one and the prompt becomes a softer guardrail backed by a hard one.

### Haiku eligibility criteria

`haiku` is eligible for an agent role ONLY when **ALL three** of the following hold:

1. **The task is mechanical with structured output.** No synthesis, no design judgment, no architectural decisions. Examples: search-and-extract, classification, pattern matching, format conversion.
2. **The task requires no judgment or synthesis.** The agent follows a deterministic procedure and emits structured data. A wrong output is cheap: it is caught by the gate (consolidator, qa, human review) without cascading.
3. **Failures are cheap and detectable downstream.** A dead or empty-result lane is handled fail-open. A gate or consolidator downstream re-weighs quality and surfaces problems explicitly.

When any condition does not hold, `sonnet` is the minimum floor. Use `opus` when the work involves analysis, coordination, or irreversible decisions.

### Per-agent haiku justification

`researcher` and `init-project` are the only `haiku` roles. Each is mechanical with structured output and a named downstream safety net that absorbs its light judgment.

**`init-project`**
- C1 mechanical/structured: clean — bootstrap is templated `CLAUDE.md` generation against a discovered stack; the output structure is deterministic.
- C2 no judgment: partial — light naming/structure judgment when generating section headers and golden commands.
- C3 cheap/detectable failure: clean — one-shot output reviewed before the first commit.
- **Named safety net:** the operator edits the generated `CLAUDE.md` before the first commit. A wrong naming or structure call is caught at human review; no cascade.

`translator` was promoted `haiku → sonnet`: it is a rare-but-must-not-fail role (neutral-register translation) that earns a stronger model even though its downstream safety net (human i18n-diff review) remains.

## Low-cost mode

Low-cost mode is for **developers on lower-tier Anthropic plans (Free, Pro, or a tight personal budget)** who want to use team-harness without burning through API quota on a single feature. It is not the typical configuration — operators on Max or Team plans should stay on `standard`, which is the default for that reason.

When you run the installer interactively it asks: `Install mode [s/l]? [s]:` — press `l` + Enter to select low-cost, or just Enter to keep the standard default. You can also set `INSTALL_MODE=low-cost` before running for non-interactive installs. The installer rewrites the `model:` and `effort:` frontmatter of every agent file **in-flight** during the copy into `~/.claude/agents/`. The source files in `agents/*.md` are never modified. To switch back, re-run the installer and press Enter at the mode prompt (accepting the `[s]` default), or set `INSTALL_MODE=standard`.

**Engineering-honest trade-off.** On low-cost mode: architecture proposals are 1-2 iterations rougher (less novel synthesis, weaker risk enumeration); security audits are coarser (obvious OWASP-Top-10 issues caught, subtle injection vectors more likely missed); reviewer verdicts are more lenient; test suites miss ~5-15% more negative-path cases; code-generation correctness is preserved at `sonnet` (the implementer's standard tier). Single pipeline run is roughly **15-30% cheaper** and **15-30% slower** (more validation correction rounds). Suitable for personal projects, prototypes, and side-org workloads where the human reviewer at each STAGE-GATE is the trusted backstop — not for production-grade work where the standard mode's quality contract is load-bearing.

**Low-cost matrix** (vestigial — Go installer infra decommissioned 2026-06-02; `cmd/install/modes.go::lowCostMatrix` is no longer the source of truth. Table kept for historical reference only. Its **Standard** columns predate the `adversary`/`reviewer` → `sonnet` and `translator` → `sonnet` re-tiering and the `max` → `xhigh` ceiling — the Roster table above is canonical.):

| Agent | Standard model | Standard effort | Low-cost model | Low-cost effort | Notes |
|---|---|---|---|---|---|
| `orchestrator` | opus | high | sonnet | high | Top-level coordination (Intake/Specify/spec+AC/config); presents and records gates itself, dispatches specialists directly. Reflects the post-fusion single-coordinator roster; the legacy Go matrix predates it. |
| `orchestrator` | sonnet | xhigh | sonnet | high | Task-scoped execution engine; prepares and records both STAGE-GATEs, so effort stays high in low-cost so gate logic executes correctly. Reflects the post-split roster; the legacy Go matrix predates it. |
| `architect` | opus | xhigh | sonnet | high | One authoritative bounded design pass, gated at STAGE-GATE-1; automatic plan-review loops are absent and explicit `/th:plan-review` remains available. |
| `agent-builder` | opus | max | sonnet | high | Agent/skill authoring; effort high preserves design depth. Human reviews the diff at PR time. |
| `security` | opus | max | sonnet | high | Security audit; effort high is the cap. Human reads `reviews/04-security.md` at STAGE-GATE-1. |
| `adversary` | opus | max | sonnet | high | Adversarial review; effort high is the cap. Human reads `reviews/04-adversary.md` at STAGE-GATE-3. Plugin-only for model-tier purposes (no cmd/install/ entry). |
| `reviewer` | opus | max | sonnet | high | PR review gate; effort high preserves severity calibration. Human approves at STAGE-GATE-3. |
| `reviewer-consolidator` | opus | high | sonnet | high | Multi-reviewer merge step; effort high preserves de-dup and contradiction detection quality. |
| `qa-plan` | sonnet | high | sonnet | high | Semantic AC definition and plan-capability judgment; deterministic structure checks and the operator gate contain the risk. |
| `qa` | opus | xhigh | sonnet | high | Highest-capability post-code acceptance over the frozen tree and executable evidence; low-cost mode retains sonnet/high. |
| `plan-reviewer` | sonnet | medium | sonnet | medium | No change — already at the floor; gate role is inviolable. |
| `gcp-cost-analyzer` | opus | high | sonnet | medium | Non-blocking advisory report; human decides on all output. |
| `gcp-infra` | opus | xhigh | sonnet | medium | Irreversible-but-gated mutation planning (verb classification, blast-radius, reversibility, alternatives, runbook + rollback); gates: `gcp-guard.sh` + validation audit checkpoint + STOP. Standard raises to xhigh; low-cost stays medium (gated output, human approves every apply). |
| `init-project` | haiku | medium | sonnet | medium | Haiku→sonnet upgrade in low-cost mode; human edits output before first commit. |
| `implementer` | sonnet | high | sonnet | medium | Model stays sonnet; effort drops to medium (more iteration loops via tester+qa). |
| `tester` | sonnet | high | sonnet | medium | Effort high in standard; drops to medium in low-cost. |
| `documenter` | sonnet | high | sonnet | medium | Effort high in standard; drops to medium in low-cost. |
| `diagrammer` | sonnet | medium | sonnet | medium | No change — render-validate loop is the gate, not the model. |
| `likec4-diagrammer` | sonnet | medium | sonnet | medium | No change — DSL validation catches errors. |
| `d2-diagrammer` | sonnet | medium | sonnet | medium | No change — DSL validation catches errors. |
| `translator` | haiku | medium | sonnet | medium | Haiku→sonnet upgrade in low-cost mode; glossary is the contextual anchor; human reviews diff at PR time. |
| `delivery` | sonnet | medium | sonnet | medium | No change — mechanical; human approves PR at STAGE-GATE-3. |
| `mentor` | opus | high | sonnet | high | Teaching is analysis + synthesis; effort high preserves layered-pack depth. Human reads the pack before the tutoring session. |
| `researcher` | haiku | medium | sonnet | medium | Post-decommission agent — not in Go installer lowCostMatrix. In low-cost mode, runs on sonnet (haiku→sonnet upgrade; mechanical role is still suitable). |
| `research-consolidator` | sonnet | high | sonnet | medium | Post-decommission agent — not in Go installer lowCostMatrix. Effort drops to medium in low-cost; consolidation quality is reduced but the fail-open fail-safe applies. |

**Tally (standard mode):** core `opus` agents — `orchestrator`, architect, qa, agent-builder, security, mentor (plus the GCP/UX specialists); `haiku` — `researcher`, `init-project`; everything else on `sonnet`, including `qa-plan`, `adversary`, `reviewer`, `reviewer-consolidator`, and `translator`. In low-cost mode, all on `sonnet`. No `max`, no `low`.

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
