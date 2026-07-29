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

## Seam-docs-reference

| File:line | Mention | Rule | Reason |
|---|---|---|---|
| `docs/upstream-issue-draft.md:55` | "our harness detected the stripped tool via a boot probe and emitted a dispatch handoff for top-level Claude to relay; that specific workaround has since been retired" | R4 | Draft upstream issue for Anthropic, historical record of a scenario observed under the pre-fusion architecture; the sentence states the retirement rather than asserting it live. |
| `docs/upstream-issue-draft.md:72` | "**Superseded, historical.** ... the specific nested-dispatch scenario that motivated this workaround no longer has a producer in our own architecture" | R4 | Same draft's own "Workaround we ship today" section, explicitly marked superseded and pointing to the current retirement note rather than describing a live mechanism. |

No other survivors in this seam's 11 files (`docs/how-it-works.md`, `docs/agent-tree.md`,
`docs/voice-guide.md`, `docs/install.md`, `docs/integration.md`, `docs/cost-and-caching.md`,
`docs/opencode-model-config.md`, `docs/plugin-migration.md`, `docs/roadmap.md`,
`docs/troubleshooting.md`) — every other mention was rewritten to the single coordinator (R1/R2/R3).

**Finding, not fixed here (out of this seam's file ownership).** `skills/setup/managed-blocks/orchestrator-dispatch-rule.md` (Task-2, already committed) still carries a `FALLBACK — nested-context Task unavailability` paragraph describing `th:orchestrator` itself losing `Task` when invoked as a nested subagent and emitting a `dispatch_handoff` directive. This appears to contradict `docs/subagent-orchestration.md § "Nested-context dispatch — RETIRED protocol, retained provisioning"` (Task-3, already committed), which declares the entire `dispatch_handoff`/`blocked-no-dispatch` mechanism retired with no successor and states that a coordinator-dispatch case observed again is a contract defect (`status: blocked`), not a signal to resurrect the handoff. `docs/troubleshooting.md` and this file were reconciled against the `subagent-orchestration.md` framing (full retirement); the managed-block file was left untouched because it belongs to Task-2, not this task. Surfaced for the operator to reconcile.

## Seam-skills

| File:line | Mention | Rule | Reason |
|---|---|---|---|
| `skills/setup/SKILL.md:345` | "FALLBACK — nested-context Task unavailability ... it emits a `dispatch_handoff` directive" | R5 | Byte-identical reproduction of the canonical managed block owned by Task-2 (`skills/setup/managed-blocks/orchestrator-dispatch-rule.md`), which this skill writes verbatim into `~/.claude/CLAUDE.md`. Not an independent claim — kept in lockstep with the source of truth rather than re-derived. |

No other survivors in this seam's 14 files. `skills/recover/SKILL.md`, `skills/lint/SKILL.md`,
`skills/pipelines/SKILL.md`, `skills/setup/SKILL.md` (rest), `skills/trace/SKILL.md`,
`skills/inline/SKILL.md`, `skills/README.md`, `skills/audit/SKILL.md`,
`skills/plan-review/SKILL.md`, `skills/apply-review/SKILL.md`, `skills/background/SKILL.md`,
`skills/update/SKILL.md`, `skills/audit-security/SKILL.md`, `output-styles/developer-mode.md`
were rewritten to the single coordinator (R1/R2/R3).

## Seam-root

Not yet reconciled at the time of this commit (this file itself is seam-root's own new artifact;
`CLAUDE.md`, `README.md`, `CONTRIBUTING.md` remain). Placeholder — see `02-implementation.md §
"What remains"`.

## Seam-history

Not yet reconciled at the time of this commit. Placeholder — see `02-implementation.md § "What
remains"`. Every entry this seam adds is expected to be R4 by construction (changelog and
decisions are historical record by definition), but each still needs its own row rather than a
blanket exemption, so the check has something concrete to match against.
