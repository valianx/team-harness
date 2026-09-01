# Agent Tree

How Team Harness agents relate at runtime. The top-level session agent is **`th:orchestrator`** — the operator's single point of contact. It runs intake, Discover/framing, Specify, and the gated pipeline itself, and dispatches every specialist directly. No agent in this roster spawns another coordinator; there is exactly one coordinator node in any run.

```
th:orchestrator  ── top-level session agent · the operator's single point of contact
│    Owns: Intake · Discover/framing · Specify · spec+AC co-authoring ·
│    config/language resolution · initiative + overview.md · the gated pipeline
│    (design → waiting_gate1 → implementation → validation → waiting_gate3 →
│    delivery → complete) · both STAGE-GATEs, presented inline and recorded in
│    the same operation · sole writer of 00-state.md and its coordination trace.
│
├─ dispatches pipeline specialists (leaf agents — no further orchestration):
│    Design                     architect · security (design-review when sensitive)
│    Implementation             tester · implementer · cleaner
│    Validation                 qa · adversary (when the security floor applies)
│    Delivery                   delivery
│    UI / diagrams (triggered) ux-reviewer · diagrammer · d2-diagrammer ·
│                               likec4-diagrammer · documenter
│    GCP tasks                  gcp-cost-analyzer · gcp-infra
│
└─ dispatches directly  ── non-gated direct modes (no STAGE-GATE)
     research      researcher (fan-out) · code-researcher · research-consolidator ·
                   architect (research mode)
     docs          documenter
     other         mentor · init-project (bootstrap) · translator
     direct fix    coordinator when eligible (no pipeline state or specialist dispatch)

meta (outside any pipeline run):  agent-builder  ── authors new agents and skills
```

`@Team-Harness init` remains the lightweight intake command; it is not the
project-bootstrap agent name.

## Runtime postures

Exactly two postures are available: `inline` and `pipeline`. Inline is the direct default; a
current live operator may explicitly request sensitive inline work or a bounded tester, QA, or
security review, and those requests create no workspace, state, events, gates, or delivery action.
Pipeline entry requires explicit live activation or recovery and always uses the canonical full v3
machine shown above. Retired route markers are migration data only and cannot select a posture or
release a gate.

## Roles at a glance

| Agent | Tier | Dispatched by | Owns gates? |
|---|---|---|---|
| `th:orchestrator` | lightweight direct coordination; gated execution after activation | — (top-level session agent) | Yes, only during an active pipeline |
| `architect` | analysis | orchestrator (or research/design direct mode) | No |
| `plan-reviewer` | analysis | orchestrator (explicit `/th:plan-review` only) | No |
| `implementer` | implementation | orchestrator after Gate 1 | No |
| `tester` | implementation | orchestrator | No |
| `cleaner` | implementation | orchestrator after green evidence, before Freeze | No |
| `qa` | implementation | orchestrator | No |
| `security` | design review | orchestrator when `security_sensitive` | No |
| `adversary` | validation | orchestrator when the security floor applies | No |
| `delivery` | delivery | orchestrator | No |
| `reviewer` / `reviewer-consolidator` | delivery | orchestrator | No |
| `ux-reviewer` | analysis + implementation | orchestrator (frontend scope) | No |
| `diagrammer` / `d2-diagrammer` / `likec4-diagrammer` | any | orchestrator | No |
| `documenter` | docs | orchestrator (docs direct mode) | No |
| `researcher` / `code-researcher` / `research-consolidator` | research | orchestrator (research direct mode) | No |
| `mentor` / `init-project` / `translator` | direct | orchestrator | No |
| `gcp-cost-analyzer` / `gcp-infra` | ops | orchestrator | No (gcp-infra has its own blast-radius confirmation) |
| `agent-builder` | meta | operator (not a pipeline run) | No |

## Invariants

- **Exactly one coordinator node.** `th:orchestrator` never spawns another orchestrator. The small kernel stays direct until `/th:pipeline`; the activated contract retains the specialist-only dispatch invariant (`agents/ref-pipeline.md § Dispatch invariants`).
- **Gate authority has a single writer.** Main presents each Gate inline and appends the nonce-bound operator decision to the control log before rebuilding projections; no specialist can relay or forge it (`agents/_shared/gate-contract.md § "Authority event and projection"`).
- **Inline direct work has no STAGE-GATE or pipeline state** — the coordinator acts directly or
  dispatches the explicitly requested ad hoc specialist. This includes `/th:plan-review` and
  live tester/QA/security reviews; none activates the pipeline.
- **Numeric gate UX is stable.** Gate 1 presents `1 approve`, `3 edit`, `4 reject` — every
  approval preauthorizes the run through the draft PR (`release_policy: auto-ship`). Gate 3
  STOPs only on a closed-list exception, presenting `1 ship`, `2 amend`, `3 abort`; a green run
  records a mechanical `auto-ship` release citing the Gate-1 event. A number alone is accepted
  only for the corresponding decision; edit/reject use `N: detail`. The dual record and live
  operator approval at Gate 1 remain mandatory (`agents/_shared/gate-contract.md`).

See also: `docs/how-it-works.md`, `agents/orchestrator.md` (startup kernel), `agents/ref-pipeline.md` (gated contract), and `docs/reasoning-checkpoint.md`.
