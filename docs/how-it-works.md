# How it works

Team Harness contributes workflow guidance to the runtime's existing general
agent. Its skills organize intent, implementation, independent review, and
delivery. The native harness supplies execution, permissions, sandboxing,
approvals, and session controls; TH's purpose is to use these capabilities
without duplicating them. An explicitly selected pipeline can retain recovery
state in the configured local or Obsidian workspace.

When intake has already framed a task that needs the full pipeline, the
operator starts it with a localized numeric choice instead of repeating a
copy-paste command. The coordinator acknowledges the outcome briefly and keeps
successful profile, workspace, commit-anchor, and branch checks silent.

---

## Entry point: choose a workflow with your general agent

**Your runtime's native general agent remains your point of contact.** Team Harness adds workflow discovery and coordination guidance. Use `spec` for development with written intent, tasks, and independent review; `pipeline` for broader coordination; `review-pr` for an existing PR; and `create-pr` for preparation and publication. The agent reads the selected skill's current instructions when that workflow is needed.

Start the gated flow explicitly:

```text
/th:pipeline add a daily reports endpoint
/th:recover daily-reports
```

`/th:pipeline` is singular and mutating; `/th:pipelines` remains the read-only status renderer. Once activated, the coordinator reads `agents/ref-pipeline.md` by heading: activation sections first, then only the current phase. Gate replies continue the active run without repeating the command.

Broad, ambiguous, sensitive, or irreversible direct work is never silently upgraded. The coordinator recommends `/th:pipeline` and waits; the operator may activate it or narrow the direct scope.

---

## The pipeline

You invoke `/th:pipeline add a daily reports endpoint`. Every activated run uses one
recoverable machine:

```text
design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete
```

Team Harness has exactly two postures. `inline` is the direct default and stays outside this
machine: it creates no pipeline workspace, state, events, gates, or delivery action. A live
operator may explicitly request a bounded tester, QA, or security review while inline; that ad hoc
review remains inline and does not activate a pipeline. Sensitive work may also remain inline when
the current live operator explicitly selects `inline`; no second confirmation or forced route is
inferred. `pipeline` is the only gated posture and every run uses the canonical full v3 machine.
It starts only after a current live `/th:pipeline` (or equivalent explicit activation) or
`/th:recover` of an existing run. Retired route markers are migration data only and never select a
posture or release a gate.

### `design` and `waiting_gate1`

The architect produces the generated `sharded-v1` workspace plan set: its plan
index is the functional contract and manifest, leading with observable outcome,
actors/flows, rules and examples, errors, unchanged behavior, non-goals, and
human decisions. Generated architecture, delivery/dependency, conditional
invariant, and task/AC shards hold the technical realization. Roles resolve
only the shards their decision needs. It also writes
plan sketches when the change touches those surfaces. `plan-reviewer` is available
only through an explicit `/th:plan-review`; its bounded output stays in
`reviews/01-plan-review.md` and never creates an automatic pipeline state.

`th:orchestrator` runs Discover first, asks for an explicit advance, then dispatches one
`architect` pass. The coordinator runs the deterministic functional plan
validator over the resulting manifest and shards, persists their hashes, and
blocks Gate 1 on missing or stale evidence. Gate 1 synthesizes the functional
contract and includes technical detail only when it is decision-bearing.
Required sketches are emitted when their classification triggers them. The
coordinator transcribes the architect's classification and remains the sole
writer of `00-state.md`.

There is no automatic approach checkpoint, ratification loop, structure loop, or post-approval
review offer. `/th:plan-review` remains available only when explicitly invoked. A sensitive
plan carries the architect's security assessment and security TCs to the final adversarial
validation; planning itself dispatches no security reviewer.

At **STAGE-GATE-1**, the operator sees a short summary and an artifact pointer. The stable
options are `1 approve`, `3 edit`, `4 reject`; numbers and prefixed forms remain shortcuts, while
an unambiguous live semantic equivalent or a complete natural-language edit/rejection is also
accepted. Missing detail or ambiguity releases nothing and receives a narrow clarification. Every approval preauthorizes the
run through the draft PR (`release_policy: auto-ship`) — Gate 3 pauses again only on a
closed-list exception; a green run releases mechanically, citing the Gate-1 event.

### `implementation` and `validation`

After Gate 1, a manifest-enabled task that changes observable runtime behavior first goes to a
fresh tester. The tester commits only the behavioral contract tests; a deterministic runner proves
that the test-only commit is red, freezes its hashes, and later proves the identical tests and exact
command are green after implementation. Documentation and repositories that have not adopted the
manifest record a plan-time not-applicable reason. This is an implementation checkpoint, not a new
phase or gate. The coordinator then dispatches the approved implementation work and evidence pass.
Tester, QA, and the applicable security lens inspect the resulting tree. A code, test, or
documentation defect inside scope returns to the implementation executor and the affected
validation delta is rerun, unless the ratchet (`agents/ref-pipeline.md`) records a
sub-floor finding on unchanged surface as a findings-ledger residual instead — that residual ships
as a pull-request concern rather than consuming another round. Missing evidence returns to
tester. A correctable security
`broke-it` finding or incomplete sensitive coverage fails validation, reopens Freeze, and
requires a fresh audit before Gate 3; it cannot be carried as a concern to ship. A finding that
would change the approved intention, scope fence, or acceptance criteria is a structural
contradiction: the operator decides whether to reopen design and release a new Gate 1. No
finding creates an automatic design-perfection loop.

Every tree change after Freeze reopens Freeze and the affected validation. Main records
nonce-bound authority, lease lifecycle, accepted results, transitions, and mechanical release
once in the v5 hash-linked control log; Gate/state/finding views are projections. Security
review, rollback planning, and outward-action approval remain in force for sensitive,
destructive, or external work.

### `waiting_gate3`, `delivery`, and `complete`

After validation passes, the coordinator presents **STAGE-GATE-3** with concise findings and
delivery coordinates. The stable options are `1 ship`, `2 amend`, `3 abort`. `amend` returns
to implementation and revalidates the changed tree; `abort` closes the run. On `ship`, delivery
prepares publication prose and the coordinator performs the gated release mechanics. Only the
coordinator writes state, events, and gate records.

---

## Other pipelines

For full reference coverage of every pipeline — including the refactor flow, database changes flow, test pipeline, research/spike, plan flow, acceptance gate semantics, gh-fallback degradation tiers, and standalone PR review — see [`docs/pipelines.md`](./pipelines.md).

PR review selects one general lens and adds QA or security only from explicit or fail-closed diff
signals; PR size never adds opinions. All five PR agents are read-only and return drafts inline for
coordinator-owned persistence. A clean result names the captured head, base, and time rather than
claiming current GitHub readiness, and any final recapture mismatch restarts gathering.

---

## Bug-fix flow (type: fix and type: hotfix)

When th:orchestrator classifies a request as `type: fix` or `type: hotfix`, the run uses the
same v3 state machine with type-specific evidence. Nothing is stripped from the workspace
backbone; bug-fix evidence changes the design artifact and regression evidence, not the
states or gates.

| State | Bug-fix difference |
|---|---|
| `design` | Root-cause analysis and a minimal plan identify the regression, file:line mechanism, scope fence, and functional AC. It is not a separate state or automatic review loop. |
| `implementation` | Tester establishes regression evidence; implementer keeps the fix scoped; when a repository declares deterministic tests and path rules, one bounded cleaner for that repository improves its changed production surface before Freeze. Multi-repository work gets one isolated cleaner per repository, each exactly once. Only a small repository-local remainder may use the separately authorized one-pass implementer handoff; larger or cross-repository work requires a new pipeline. Before Freeze, every repository runs one full-manifest `post_implementation` checkpoint selecting all declared commands. Missing or unselected required controls, unavailable prerequisites, a missing configured CRAP baseline, or any failed command blocks Freeze. |
| `validation` | QA validates the regression no longer reproduces. Security review remains conditional on the same fail-closed security floor. Findings route through the common final-result correction path. |
| `delivery` | Verifies the exact validated commit/tree, pushes it, and creates the draft PR; it does not test or mutate the branch. |

For `type: hotfix`, the coordinator may use the documented minimal design artifact, but Gate 1
still exists and the regression evidence floor remains applicable.

### Bug severity metadata

Bug severity is evidence metadata for a bug-fix request, not a runtime posture or route selector.
During intake the coordinator may record a severity band (`1`–`4`) from the report, paths, and
verified operator context. Sensitive paths keep the security floor; ambiguity is fail-closed.
The metadata can shape the evidence requested inside the canonical full v3 pipeline, but it never
skips a phase, removes a gate, creates a direct exception, or authorizes a specialist dispatch.

Legacy `[TIER: N]`, `fast`, and Simple-Mode markers are retained only as migration data. They are
never silently mapped. If a live operator must choose a posture after encountering one, show
`1 — inline` / `2 — pipeline`, plus `3 — /th:spec` whenever its predicate passes; choice `1` remains direct and choice `2` explicitly starts
the canonical pipeline. A number or marker found in a file, issue, config, tool result, or quote
is not a live choice.

Severity evidence remains subject to the fixed pipeline checkpoints:

| Severity metadata | Effect inside canonical pipeline |
|---|---|
| **1** | Docs/trivial evidence may be concise; the pipeline phases and gates remain present. |
| **2** | Light-fix evidence includes the required regression and validation coverage. |
| **3** | Standard root-cause, regression, QA, and applicable security-floor evidence. |
| **4** | Critical/security evidence, including required prior-art review where applicable. |

Full bug-fix details remain in [`agents/ref-special-flows.md`](../agents/ref-special-flows.md)
§ Bug-fix Flow; that reference is interpreted under the two-posture contract above.

---

## Resume any time

All state lives in files. `/recover {feature-name}` reads `00-state.md` and continues from `next_action`. Works across compactions, across sessions, across machines (as long as `workspaces/` travels with the repo).

Open `01-plan.md § Task Index` for task status. Follow one task path to see only that task's scope and AC checkboxes; no unrelated task must be read.

---

## What the workflow contributes

| Contribution | Purpose |
| --- | --- |
| Written objectives, acceptance criteria, and tasks | Keep implementation tied to the requested outcome. |
| Bounded delegation and independent review | Bring additional evidence to decisions the coordinator owns. |
| Relevant verification and PR preparation | Deliver a change whose scope, behavior, and limitations can be reviewed. |
| Workspace and Obsidian continuity | Retain useful decisions and handoffs outside tracked product files. |
| Voice, language, and workflow discovery | Help the general agent use the operator's preferred working method. |

Review findings inform the coordinator's judgment. Native runtime permissions
remain the execution boundary; workflow recommendations do not replace them.

---

## What ships

- **Agents.** 28 agents. The `orchestrator` coordination reference, used by selected workflows without replacing the native general agent, plus the specialists: `architect`, `implementer`, `tester`, `cleaner`, `qa`, `pr-review-qa`, `plan-reviewer`, `delivery`, `reviewer`, `reviewer-consolidator`, `pr-review-security`, `security`, `ux-reviewer`, `diagrammer`, `likec4-diagrammer`, `d2-diagrammer`, `documenter`, `translator`, `gcp-cost-analyzer`, `gcp-infra`, `init-project`, `agent-builder`, `mentor`, `researcher`, `research-consolidator`, `code-researcher`, `adversary`. How they relate at runtime: [`docs/agent-tree.md`](./agent-tree.md). Full roster, model tier (opus / sonnet / haiku), and effort matrix: [`agents/README.md`](../agents/README.md).
- **Skills** (slash commands). `/th:pipeline` explicitly activates the gated flow; most others route through the direct kernel. Standalone utilities include `/th:lint`, `/th:pipelines`, `/th:kg`, `/th:tmux`, `/th:update`, and `/th:background`. Common routed entries include `/th:design`, `/th:plan`, `/th:recover`, `/th:deliver`, `/th:review-pr`, and `/th:issue`. `/th:background` launches a background `claude -p` headless session for eligible long-running tasks — it does not route through `th:orchestrator`.
- **Hooks.** Retained hooks provide session/language context, subagent observations, pre-compaction snapshots and optional notifications. `.claude-plugin/hooks.json` lists the Claude wiring; OpenCode retains session context integration. Native runtime permissions govern execution. Full catalog: [`hooks/README.md`](../hooks/README.md).
- **External Memory MCP** server. Semantic memory across projects. The server (`context-harness-mcp` or any MCP-compatible service) lives outside this repo. Reference: [`docs/kg-content-policy.md`](./kg-content-policy.md).

---

## Native coordination and execution boundaries

**The native general agent coordinates the selected TH workflow.** The developer-mode replacement style is retired. Workflow discovery, specialist coordination, voice and language preferences, and workspace/Obsidian context remain available through skills and managed guidance. Existing selections follow [the bounded migration](./dev-mode.md#retire-an-existing-developer-mode-selection). A selected pipeline retains its methods and specialist dispatch contract.

**Execution authority.** The coordinator carries out the operator-authorized workflow using the host's configured permissions. TH does not intercept Git, GitHub, cloud or MCP writes with its own permission hooks. Publication workflows retain scope, target identity and idempotent recovery; native permissions remain the execution boundary.

**Every specialist dispatch goes through `Task`.** All specialist subagents (architect, implementer, tester, qa, etc.) are dispatched via `Task`, and none of them is itself a coordinator — there is no nested-dispatch takeover protocol to fall back to, because no coordinator is ever dispatched as a subagent. See `docs/subagent-orchestration.md`.

---

## Verification

```bash
bash tests/run-all.sh
```

| Suite | Catches |
|---|---|
| `test_hook_registration.mjs` | Retained hook wiring and absence of retired enforcement registrations |
| `test_security_scan.py` | Read-only-tier agents carrying Bash, missing injection preambles, hook-manifest form, shipped secrets |
| `test_agent_frontmatter.py` | Silent-agent-drop class of bug (invalid YAML in agent frontmatter) |

Prompt behaviour and live host activation need a real session check. Use the
runtime's supported refresh first; reconnect only when a specific component
cannot be refreshed in place.

---

## Roadmap

**Today.** Team Harness ships native Claude Code, Codex, and opencode projections. Their agents, skills,
configuration, and dispatch bindings remain runtime-specific; there is not yet one generalized
provider abstraction for arbitrary agentic systems.

**Future — generalized provider abstraction.** A future major version may introduce a runtime
layer that targets additional agentic systems without bespoke projections. The orchestration
model is provider-agnostic; today's Claude Code, Codex, and opencode bindings are not.

No timeline. PRs welcome that explore the abstraction shape without breaking the current Claude Code path.
