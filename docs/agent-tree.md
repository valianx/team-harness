# Agent Tree

How Team Harness agents relate at runtime. The top-level session agent is **`th:orchestrator`** — the operator's single point of contact. It runs intake, Discover/framing, Specify, and the gated pipeline itself, and dispatches every specialist directly. No agent in this roster spawns another coordinator; there is exactly one coordinator node in any run.

```
th:orchestrator  ── top-level session agent · the operator's single point of contact
│    Owns: Intake · Discover/framing · Specify · spec+AC co-authoring ·
│    config/language resolution · initiative + overview.md · the gated pipeline
│    (Phase 1 Design → Phase 6 Knowledge Save) · all three STAGE-GATEs, presented
│    inline and recorded in the same operation · sole writer of 00-state.md.
│
├─ dispatches pipeline specialists (leaf agents — no further orchestration):
│    Stage 1 · Analysis        architect · qa-plan (ratify) · plan-reviewer ·
│                               security (design-review)
│    Stage 2 · Implementation  implementer · tester · qa · security · adversary
│    Stage 3 · Delivery        delivery · reviewer (internal pre-PR) ·
│                               reviewer-consolidator
│    UI / diagrams (triggered) ux-reviewer · diagrammer · d2-diagrammer ·
│                               likec4-diagrammer · documenter
│    GCP tasks                  gcp-cost-analyzer · gcp-infra
│
└─ dispatches directly  ── non-gated direct modes (no STAGE-GATE)
     research      researcher (fan-out) · code-researcher · research-consolidator ·
                   architect (research mode)
     docs          documenter
     other         mentor · init (bootstrap) · translator · qa-plan (define-ac)
     Tier 0 fix    implementer (direct → straight to PR; the one gated-work exception)

meta (outside any pipeline run):  agent-builder  ── authors new agents and skills
```

## Roles at a glance

| Agent | Tier | Dispatched by | Owns gates? |
|---|---|---|---|
| `th:orchestrator` | coordination + execution | — (top-level session agent) | Yes — prepares + records all three STAGE-GATEs |
| `architect` | analysis | orchestrator (or research/design direct mode) | No |
| `qa-plan` | analysis | orchestrator (ratify / define-ac direct) | No |
| `plan-reviewer` | analysis | orchestrator | No |
| `implementer` | implementation | orchestrator (direct for a Tier 0 fix) | No |
| `tester` | implementation | orchestrator | No |
| `qa` | implementation | orchestrator | No |
| `security` | analysis + implementation | orchestrator (design-review + verify) | No |
| `adversary` | implementation | orchestrator (verify, security-sensitive) | No |
| `delivery` | delivery | orchestrator | No |
| `reviewer` / `reviewer-consolidator` | delivery | orchestrator | No |
| `ux-reviewer` | analysis + implementation | orchestrator (frontend scope) | No |
| `diagrammer` / `d2-diagrammer` / `likec4-diagrammer` | any | orchestrator | No |
| `documenter` | docs | orchestrator (docs direct mode) | No |
| `researcher` / `code-researcher` / `research-consolidator` | research | orchestrator (research direct mode) | No |
| `mentor` / `init` / `translator` | direct | orchestrator | No |
| `gcp-cost-analyzer` / `gcp-infra` | ops | orchestrator | No (gcp-infra has its own blast-radius confirmation) |
| `agent-builder` | meta | operator (not a pipeline run) | No |

## Invariants

- **Exactly one coordinator node.** `th:orchestrator` never spawns another orchestrator — a specialist it dispatches is always a leaf agent, never itself a coordinator, and no exception clause exists (`agents/orchestrator.md § Dispatch invariants`).
- **Gate state has a single writer.** The orchestrator prepares each STAGE-GATE, presents its STOP block to the operator inline, and records the release (the dual-record: the `gateN_release` field in `00-state.md` plus the `stage.gate.release` event) in the same operation — no second agent relays or forges any part of it (`agents/_shared/gate-contract.md § "The dual-record release"`).
- **Direct modes have no STAGE-GATE** — the orchestrator dispatches those specialists itself, with no pipeline `00-state.md` created.

See also: `docs/how-it-works.md` (end-to-end flow), `docs/pipelines.md` (stage/phase mechanics), `agents/orchestrator.md` (the coordination contract), `docs/reasoning-checkpoint.md`.
