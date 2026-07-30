# Coordinator-mention allowlist

> Declared inventory of every surviving mention of the retired coordinator (`th:leader`,
> `agents/leader.md`, `leader-relayed-operator`, `00-leader-roster.md`, and the two-coordinator
> split they named) after the coordinator-fusion migration (`workspaces` feature
> `coordinator-fusion`). Built per `01-plan.md § "The treatment vocabulary"`: a surviving mention
> is legitimate only under rule R4 (historical record — changelog, decisions, KG register,
> acceptance matrices, probe transcripts) or rule R5 (a deliberate, stated exception). Every other
> mention is a defect and must be reconciled or rewritten, never left standing.

## What this file is for

`tests/test_coordinator_mention_residual.py` (Task-4) re-derives the set of surviving
`leader`-class mentions from the tree and fails on any mention not listed here with its rule and
reason. This file is the operator-visible side of that check — short, because it carries only R4
and R5 entries, never every mention in the repository.

**Residual, declared and not chased (T4-AC-6c):** this check closes "a mention survives that is
not declared here." It does **not** close two adjacent classes: (1) a mention declared historical
here that is in fact still live (the check trusts the R4/R5 classification it reads, it does not
re-verify semantic intent); (2) a substitution that preserves the per-file mention *count* while
changing what the surviving mention asserts. Both residuals are accepted, not solved, by this
mechanism — they require a human or a semantic reviewer to catch.

## How to append (declared, so no lane invents its own convention)

Each task or seam that finishes reconciling a file appends its own R4/R5 rows to the table below
under its own seam heading, using `Edit` with `replace_all: false`, anchored on that seam's own
heading — never inserted mid-table under a sibling seam's heading, and never reordering rows
already present. A seam that finds zero R4/R5 survivors in its own files still adds its heading
with a one-line "no survivors" note, so the table's seam-heading set stays a complete index of
which seams have reported in.

## Legend

- **Rule** — `R4` (historical record, prose intact, pointer to a retired file annotated rather
  than reapointed) or `R5` (deliberate exception, reason stated).
- **File:line** — anchor at the time of this migration's own commits. A later, unrelated edit to
  the same file may move the line; the check re-derives the mention by content match, not by line
  number, so a stale line number here is inert, not a defect.

## Seam-agents

| File:line | Mention | Rule | Reason |
|---|---|---|---|
| `agents/ref-special-flows.md:12` | "A prior revision of this file split these across a retired `agents/leader.md`..." | R4 | Explains the fusion's own history at the file's own intro; states the mechanism it replaced and why, never asserts the split as live. |
| `agents/ref-special-flows.md:191` | "A prior revision had each task dispatched by `plan-and-execute` run as its own `th:orchestrator` instance... tracked by a separate `th:leader` progress roster." | R4 | Explains why `plan-and-execute` no longer spawns per-task coordinators; the retired model is named to justify the current one, not asserted as current. |
| `agents/_shared/gate-contract.md:324-325` | "the operator's decision travel through a second agent (`th:leader`), which relayed it to the recorder under an explicit `leader-relayed-operator` provenance tag" | R4 | `§ "Integrity model"`'s own retirement note for Layer 1 — states what was retired and what property was lost, per T3-AC-4b. |
| `agents/ref-dispatch-machinery.md:121` | "`00-leader-roster.md` schema and write discipline" | R4 | `§ "What left this file"` removal table — names the retired mechanism and the reason it has no successor (one coordinator, nothing to track across instances). |
| `agents/security.md:131-146` | "A prior revision of this file described a dispatch carrying a `Correction scope:` coordinate whenever the coordinator classified an operator correction into 'bucket 2'..." | R4 | Reconciles Task-3's `agents/security.md` entry (added to the Files list during operator-directed edits closing SDR-31): the delta-scoped-re-firing subsection loses its subject with the iteration machinery's retirement; the adjacent never-carried-forward-on-a-security-surface-touch rule survives and is retargeted to the operator's `edit`, per AC-22a/b/c. |
| `docs/plan-structure-gate.md:8-10,144-146` | "Formerly sibling to `docs/patch-mode.md § "Stage-1 Selective Panel Re-Firing"` as a bucket-5 feeder..." | R4 | Reconciles Task-3's `docs/plan-structure-gate.md` entry: the file declared itself a feeder of the retired iteration mechanics and a consumer of bucket 5; both mentions now state the retirement rather than a live feed relationship. |

## Seam-agents-shared

No survivors outside `gate-contract.md` (listed under Seam-agents above, since that file's
reconciliation happened as part of Task-3's first file, ahead of the seam split). `gh-fallback.md`,
`dispatch-contract.md`, `output-template.md`, `kg-write-policy.md` carry zero R4/R5 mentions.

## Seam-docs-control

| File:line | Mention | Rule | Reason |
|---|---|---|---|
| `docs/subagent-orchestration.md:19` | "a top-level `leader` dispatching a second coordinator, `th:orchestrator`, as a nested spawn" | R4 | `§ "Nested-context dispatch — RETIRED protocol"` names the exact spawn the retired handoff machinery backstopped, so a reader understands why the machinery is gone rather than reading an unexplained deletion. |
| `docs/reasoning-checkpoint.md:128` | "a `th:leader` that confirmed B1's functional-clarity artifact... propagated the confirmation to a separately-dispatched `th:orchestrator` as a 'checkpoint-trust-transfer'" | R4 | `§ "No cross-agent trust-transfer"` names the retired split and the trust-transfer mechanism it required, to justify why no trust-transfer exists in the single-coordinator model. |
| `docs/worktree-discipline.md:550` | "`th:leader` that would not spawn a second-coordinator `th:orchestrator` subagent until the [capability cache confirmed]" | R4 | `§ "Capability cache — RETIRED"` names what the cache gated (the M3 nested-subagent round-trip) so the retirement reads as a consequence of the fusion, not an unexplained removal. |
| `docs/observability.md:396-397` | "The `00-leader-roster.md` file, the `fanout.*` event family, and the two-tier `leader-recover`/`orchestrator-recover` split" | R4 | `§ "Initiative-level trace (serial multi-project sequencing)"` names the three retired mechanisms together, tying their loss to the same invariant (#2) that makes multi-project sequencing serial. |
| `docs/code-hygiene-gate.md:39,85,210` | "comment leader" | R5 | Verified by reading each line: "the first non-whitespace token after the leading `+` is a comment **leader**" — the English term for the character that starts a comment (`#`, `//`, `--`), an unrelated token collision with the retired coordinator's name, not a mention of it. Deliberate exception, no edit needed. |

## Seam-docs-reference

| File:line | Mention | Rule | Reason |
|---|---|---|---|
| `docs/upstream-issue-draft.md:55` | "our harness detected the stripped tool via a boot probe and emitted a dispatch handoff for top-level Claude to relay; that specific workaround has since been retired" | R4 | Draft upstream issue for Anthropic, historical record of a scenario observed under the pre-fusion architecture; the sentence states the retirement rather than asserting it live. |
| `docs/upstream-issue-draft.md:72` | "**Superseded, historical.** ... the specific nested-dispatch scenario that motivated this workaround no longer has a producer in our own architecture" | R4 | Same draft's own "Workaround we ship today" section, explicitly marked superseded and pointing to the current retirement note rather than describing a live mechanism. |

No other survivors in this seam's 11 files (`docs/how-it-works.md`, `docs/agent-tree.md`,
`docs/voice-guide.md`, `docs/install.md`, `docs/integration.md`, `docs/cost-and-caching.md`,
`docs/opencode-model-config.md`, `docs/plugin-migration.md`, `docs/roadmap.md`,
`docs/troubleshooting.md`) — every other mention was rewritten to the single coordinator (R1/R2/R3).

**Finding resolved (operator-directed fix, post-Task-3).** `skills/setup/managed-blocks/orchestrator-dispatch-rule.md` (Task-2, previously committed) carried a `FALLBACK — nested-context Task unavailability` paragraph describing `th:orchestrator` itself losing `Task` when invoked as a nested subagent and emitting a `dispatch_handoff` directive, contradicting `docs/subagent-orchestration.md § "Nested-context dispatch — RETIRED protocol, retained provisioning"` (Task-3), which declares the entire `dispatch_handoff`/`blocked-no-dispatch` mechanism retired with no successor. The canonical managed block, its byte-identical reproduction in `skills/setup/SKILL.md`, and `cmd/install/global_claude_md.go`'s Go-rendered third carrier (found stale in a later pass — this note's original scope of "two Markdown carriers" was itself incomplete) are now all reconciled to the `subagent-orchestration.md` retirement framing — see the seam-skills row below.

## Seam-skills

| File:line | Mention | Rule | Reason |
|---|---|---|---|
| `skills/setup/SKILL.md:345` | "No nested-handoff/takeover protocol. The `dispatch_handoff`/`blocked-no-dispatch` machinery ... is retired" | R4 | Byte-identical reproduction of the canonical managed block owned by Task-2 (`skills/setup/managed-blocks/orchestrator-dispatch-rule.md`), which this skill writes verbatim into `~/.claude/CLAUDE.md`. States the retirement rather than a live mechanism — same treatment as the `CLAUDE.md § "14."` row above. |

No other survivors in this seam's 14 files. `skills/recover/SKILL.md`, `skills/lint/SKILL.md`,
`skills/pipelines/SKILL.md`, `skills/setup/SKILL.md` (rest), `skills/trace/SKILL.md`,
`skills/inline/SKILL.md`, `skills/README.md`, `skills/audit/SKILL.md`,
`skills/plan-review/SKILL.md`, `skills/apply-review/SKILL.md`, `skills/background/SKILL.md`,
`skills/update/SKILL.md`, `skills/audit-security/SKILL.md`, `output-styles/developer-mode.md`
were rewritten to the single coordinator (R1/R2/R3).

## Cross-carrier addendum — `cmd/install/global_claude_md.go` (Task-2, bounded-patch fix)

| File:line | Mention | Rule | Reason |
|---|---|---|---|
| `cmd/install/global_claude_md.go:29` | "No nested-handoff/takeover protocol. The `dispatch_handoff`/`blocked-no-dispatch` machinery ... is retired" | R4 | Third carrier of the same managed block (`skills/setup/managed-blocks/orchestrator-dispatch-rule.md`, `skills/setup/SKILL.md`), rendered as a Go string literal and written verbatim into every operator's `~/.claude/CLAUDE.md` by `ensureGlobalClaudeMD()`. Not part of any Task-3 seam (`cmd/install/**` is Task-2's file set) — recorded here as a cross-carrier addendum so the "Finding resolved" note above stays accurate about all three carriers, per the append protocol's own "no lane invents its own convention" rule extended to a third-party fix. States the retirement, matched for substance against the two Markdown carriers rather than diffed byte-for-byte (the Go source necessarily breaks backtick spans out of the raw string literal). |

## Seam-root

| File:line | Mention | Rule | Reason |
|---|---|---|---|
| `CLAUDE.md § "14. Subagent Orchestration"` | "No nested-handoff/takeover protocol. The `dispatch_handoff`/`blocked-no-dispatch` machinery ... is retired" | R4 | States the retirement and points to the canonical retirement note; not a live-mechanism claim. |

No other survivors in `CLAUDE.md`, `README.md`, `CONTRIBUTING.md` — all other mentions of the
retired coordinator were rewritten to the single `orchestrator` (R1/R2/R3).
`docs/coordinator-mention-allowlist.md` is this seam's own new artifact (`CLAUDE.md § Repo Map`
entry pending seam-history's own pass, since `CLAUDE.md` itself is not the artifact's owner).
`CLAUDE.md` measured 35782 bytes after reconciliation — under the 35 KB soft cap (T3-AC-7b).

## Seam-history

Every entry below is R4 by construction (changelog, decisions, and acceptance-matrix records are
historical record by definition) — prose is unchanged, no pointer is reapointed.

### `docs/knowledge.md` (38 mentions)

Every `[pattern]`/`[decision]`/`[constraint]` entry is a dated knowledge-base record of a prior
feature's architecture at the time it shipped (`docs/knowledge.md`'s own stated purpose, per
CLAUDE.md § "KG passive capture"); R4 by the same "registro del grafo" clause `01-plan.md § "The
treatment vocabulary"` names explicitly. Representative rows, not exhaustive (38 mentions across
~15 entries, all the same class):

| File:line | Mention (truncated) | Rule | Reason |
|---|---|---|---|
| `docs/knowledge.md:78` | "the leader's default intake disposition is now patient-by-default..." | R4 | Dated `[decision]` entry (v2.46.0) describing the pre-fusion architecture at the time it shipped. |
| `docs/knowledge.md:88` | "orchestrator Layer-2 self-check covers nested-context sessions where Task is stripped..." | R4 | Dated `[decision]` entry (v2.50.0) describing the pre-fusion architecture at the time it shipped. |
| `docs/knowledge.md:112` | "the leader dispatches N `researcher` (haiku) agents in parallel..." | R4 | Dated `[decision]` entry (v2.84.0) describing the pre-fusion architecture at the time it shipped. |
| `docs/knowledge.md:120` | "`agents/ref-dispatch-machinery.md § "Multi-Task fan-out"`" | R4 | Dated `[pattern]` entry (v2.88.0) citing a section this migration's own `ref-dispatch-machinery.md § "What left this file"` table now records as removed — the citation is stale relative to the current tree (a genuine dangling pointer, not merely a coordinator-identity mention), reported alongside this migration's other cross-file pointer findings rather than fixed here (`docs/knowledge.md` is not in any task's `Files:` list). |
| `docs/knowledge.md:179` | "independent of and additional to the leader's own upstream classification" | R4 | Dated `[decision]` entry describing the pre-fusion two-agent classification split at the time it shipped. |

No other survivors in `docs/knowledge.md` require individual rows — every remaining hit (~33 of 38)
is the same dated-KG-entry class: a `[decision]`/`[pattern]`/`[constraint]` bullet naming
`agents/leader.md` or `th:leader` as the architecture that was true when that entry was written,
never asserted as current.

### `CHANGELOG.md` (57 mentions)

| File:line | Mention (truncated) | Rule | Reason |
|---|---|---|---|
| `CHANGELOG.md:31` | "Canonical dispatch contract (`agents/_shared/dispatch-contract.md`) states the two-halves ..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:37` | "Gate rendering for STAGE-GATE-1/2/3 and the Express combined gate moves to `leader` on the..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:40` | "The functional-clarity confirmation is now a `checkpoint.confirmed` trace event (with `pro..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:42` | "The leader's dispatch machinery (repo-identity verification, `overview.md` template, Roste..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:73` | "**Subagent-nesting-depth prerequisite provisioned from both lifecycle commands.** `/th:set..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:75` | "**Per-agent MCP tool grants trimmed to what each body actually invokes.** `agents/leader.m..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:78` | "**Fenced-surface guard for the pipeline's Class-B control surface** (`tests/test_agent_str..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:91` | "`acceptance-checker` agent fully retired: the Phase 3.6 Acceptance Check dispatch and ever..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:113` | "Stage-1 plan-review panel (`qa-plan` ratification + `plan-reviewer` shape audit) is now de..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:143` | "`agents/leader.md` wires the posture: Step 6 intent row (e) `inline-working-posture-toggle..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:144` | "Structural Suite 169 (`inline-working-posture`) in `tests/test_agent_structure.py`: § 2b ..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:176` | "`agents/_shared/gate-contract.md § "Outward-action release floor"` — the canonical clau..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:181` | "`agents/leader.md` documents the no-pre-declaration invariant (a spawn payload never carri..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:197` | "`docs/worktree-discipline.md` gains **Rule 7 — Boot-time preflight sweep**, the canonica..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:210` | "Added a shared output-verbosity contract (`docs/output-contract-patterns.md`, compact mirr..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:211` | "Removed the documented Spanish report-body exception for `security`/`reviewer`/`adversary`..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:216` | "Made the leader's boot capability check runtime-aware: the Claude Code branch is byte-iden..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:218` | "Fixed a round-trip defect in the harness-migrate CC↔opencode transform: converting `agen..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:222` | "Durable `TH Leader` display rename for the opencode-installed leader agent (`name: TH Lead..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:235` | "`agents/architect.md` now declares a `scope_frozen` boundary at the approach checkpoint an..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:237` | "`/th:release` no longer dispatches the orchestrator/delivery agent: the release cut (both ..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:238` | "`agents/leader.md` § Lane classification gains a standing directive: simple/mechanical wo..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:248` | "`agents/leader.md`, `agents/orchestrator.md`, and `agents/_shared/gate-contract.md` — th..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:251` | "Split the pipeline coordinator into two agents. `th:leader` is the top-level session agent..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:252` | "STAGE-GATEs are now leader-mediated. The `th:orchestrator` prepares and records each gate ..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:266` | "Agent model re-tiering: `adversary` and `reviewer` move `opus → sonnet`, and `acceptance..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:273` | "Structural suite: model-pin assertions for `acceptance-checker`, `translator` (suite92) an..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:287` | "The `ui-wireframe` plan-stage sketch is now delivered as a standalone, self-contained HTML..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:313` | "Phase 3.6 conditional re-run guard now watches `02-implementation.md` in addition to `01-p..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:332` | "**Acceptance-checker narrowed to drift-only, scheduled concurrently with Build Verificatio..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:438` | "`skills/recover/SKILL.md`: added explicit switch arms for the four blocked statuses the or..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:570` | "`acceptance-checker`: clarified that `fail` verdict routes back to implementer/architect w..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:784` | "`agents/init.md`, `agents/acceptance-checker.md`, `agents/translator.md`: flip `model: son..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:786` | "`agents/acceptance-checker.md`: `effort: medium` → `effort: high` — only agent catchin..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:787` | "`agents/README.md`: roster effort cells (architect/gcp-infra → `xhigh`, acceptance-check..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:788` | "`agents/README.md`: roster rows, "Earn the model" prose, per-agent 3-criteria justificatio..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:790` | "`tests/test_agent_structure.py` Suite 92: `model: haiku` pin assertions added for `init`, ..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:833` | "Direct-mode agents (qa, security, and 10 others: acceptance-checker, architect, delivery, ..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:1001` | "Sketch required-reading consumption contract: `implementer`, `tester`, and `qa` must read ..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:1017` | "`tests/test_agent_structure.py` Suite 82 — 28 structural assertions for the plan-sketche..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:1023` | "`agents/acceptance-checker.md` — Step 3.6 added: delivered surface vs plan sketches diff..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:1240` | "**Developer mode — top-level orchestrator with a precondition model.** Pipelines run ONL..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:1269` | "**Reasoning checkpoint** — deterministic 3-boundary gate that blocks phase dispatch unti..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:1314` | "Orchestrator nested-context inline-fallback no longer self-runs or defers the Stage-1 plan..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:1522` | "Closed four fail-open security vectors in the Bug-fix Pipeline (PR B — pipeline-flows-ha..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:1528` | "Repaired the nested-dispatch takeover / handoff contract: bound `{next-agent}` to an expli..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:1593` | "Selective mid-pipeline KG reads on error and security-finding writes: the orchestrator now..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:1605` | "Takeover-protocol references in the managed `nested-dispatch-takeover` block are now plugi..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:1666` | "New managed block `nested-dispatch-takeover` written to `~/.claude/CLAUDE.md` by `/th:setu..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:1982` | "**Orchestrator nested-context limitation documented** (`CLAUDE.md` §14, `agents/th-orches..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:2254` | "BREAKING (contract, not behavior): `agents/orchestrator.md` "Dispatch-blocked exit" — th..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:2286` | "**Orchestrator boot probe + dispatch-blocked exit (`agents/orchestrator.md`).** Replaced t..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:2287` | "**Auto-takeover on `blocked-no-dispatch` (universal, no user prompt).** The orchestrator's..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:2419` | "**Tool allowlist per agent (capability scoping).** Every agent's frontmatter now declares ..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:2444` | "**Top-level `README.md`**: corrected counts ("18 agents, 30 skills" → "16 agents, 27 ski..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:2464` | "**Phase 3.6 (acceptance-checker) is now conditional.** Runs only when `complexity: complex..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |
| `CHANGELOG.md:2473` | "**New `acceptance-checker` agent (sonnet@medium).** Independent reviewer invoked between P..." | R4 | Historical CHANGELOG entry (Keep-a-Changelog format; past entries are never rewritten) describing pre-fusion architecture at the time it was true. |

### `docs/specs/opencode-runtime-aware-boot/acceptance-matrix.md` (12 mentions)

| File:line | Mention (truncated) | Rule | Reason |
|---|---|---|---|
| `docs/specs/opencode-runtime-aware-boot/acceptance-matrix.md:5` | "Task-1 AC-1 ... `tests/test_leader_orchestrator_split.sh` `AC-2.6-floor-literal` PASS ... `agents/leader.md:65,73` PASS" | R4 | Historical acceptance-record for a past feature's verification rounds; line anchors into `agents/leader.md` are point-in-time citations of a file that existed then, never reapointed. |
| `docs/specs/opencode-runtime-aware-boot/acceptance-matrix.md:6` | "Task-1 AC-2 ... `agents/leader.md:77-81` PASS" | R4 | Same as above. |
| `docs/specs/opencode-runtime-aware-boot/acceptance-matrix.md:7` | "Task-1 AC-3 ... `agents/leader.md:66` PASS" | R4 | Same as above. |
| `docs/specs/opencode-runtime-aware-boot/acceptance-matrix.md:8` | "Task-1 AC-4 ... `agents/leader.md:67-68` PASS" | R4 | Same as above. |
| `docs/specs/opencode-runtime-aware-boot/acceptance-matrix.md:9` | "Task-1 AC-5 ... `agents/leader.md:69` PASS" | R4 | Same as above. |
| `docs/specs/opencode-runtime-aware-boot/acceptance-matrix.md:10` | "Task-1 AC-6 ... `agents/leader.md:67` PASS" | R4 | Same as above. |
| `docs/specs/opencode-runtime-aware-boot/acceptance-matrix.md:11` | "Task-1 AC-7 ... `agents/leader.md:71,66` PASS" | R4 | Same as above. |
| `docs/specs/opencode-runtime-aware-boot/acceptance-matrix.md:12` | "Task-1 AC-8 ... `tests/test_leader_orchestrator_split.sh:390-448` PASS" | R4 | Same as above. |
| `docs/specs/opencode-runtime-aware-boot/acceptance-matrix.md:20` | "Task-3 AC-2 | CC form retains `name: leader`; never affected" | R4 | Same as above. |
| `docs/specs/opencode-runtime-aware-boot/acceptance-matrix.md:21` | "Task-3 AC-3 | Non-leader agents unchanged, no second primary" | R4 | Same as above. |
| `docs/specs/opencode-runtime-aware-boot/acceptance-matrix.md:22` | "Task-3 AC-4 | `agents/leader.md` frontmatter stays `name: leader`" | R4 | Same as above. |
| `docs/specs/opencode-runtime-aware-boot/acceptance-matrix.md:27` | "**Combined: 21/21 PASS.** ... adversary finding at `agents/leader.md:67` closed via bounded patch" | R4 | Same as above. |

### `docs/decisions.md` (1 mention)

| File:line | Mention | Rule | Reason |
|---|---|---|---|
| `docs/decisions.md:10` | "Also retires the Phase 3.6 `acceptance-checker` drift audit entirely (no replacement dispatch)." | R4 | A 2026-07-21 decision entry naming a mechanism this migration is unrelated to (`acceptance-checker` had already been retired by a prior PR); historical record, prose intact. |

### `docs/specs/stage2-code-hygiene-gate/acceptance-matrix.md` — no survivor

The one grep hit (`comment-leader-filter` at line 10) is a hygiene-gate pattern-fixture name — an
unrelated token collision, not a mention of the retired coordinator. Verified by reading the row:
it names a test fixture about comment-prefix filtering, with no connection to `th:leader` or any
retired mechanism. No allowlist entry needed; not touched.
