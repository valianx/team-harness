# Agent Tree

How Team Harness agents relate at runtime after the `th:leader` / `th:orchestrator` split. The top-level session agent is **`th:leader`**; it spawns a **`th:orchestrator`** per task to run the gated pipeline, and dispatches non-gated specialists directly for the lighter direct modes.

```
th:leader  ── top-level session agent · the operator's single point of contact
│            Owns: Intake · Discover/framing · Specify · spec+AC co-authoring ·
│            config/language resolution · initiative + overview.md.
│            Presents each STAGE-GATE to the operator inline and relays the decision
│            (verbatim, tagged leader-relayed-operator) to the orchestrator, which
│            records it; records no gate-release and owns no pipeline 00-state.md.
│            Multiplies th:orchestrator — one per task, one per project in a
│            multi-project initiative.
│            (The split is the only execution model, gated by a boot capability check;
│             if the environment can't support it, th:leader STOPS with a clear error — no fallback.)
│
├─▶ spawns  th:orchestrator  ── task-scoped execution engine (one per task/project)
│   │        Runs Phase 1 Design → Phase 6 Knowledge Save, prepares and records all
│   │        three STAGE-GATEs (th:leader presents each inline and relays the decision),
│   │        sole writer of its own 00-state.md.
│   │        Never spawns another orchestrator or a leader.
│   │
│   └─ dispatches pipeline specialists (leaf agents — no further orchestration):
│        Stage 1 · Analysis        architect · qa-plan (ratify) · plan-reviewer ·
│                                   security (design-review)
│        Stage 2 · Implementation  implementer · tester · qa · security · adversary
│        Stage 3 · Delivery        delivery · reviewer (internal pre-PR) ·
│                                   reviewer-consolidator
│        UI / diagrams (triggered) ux-reviewer · diagrammer · d2-diagrammer ·
│                                   likec4-diagrammer · documenter
│        GCP tasks                  gcp-cost-analyzer · gcp-infra
│
└─▶ dispatches directly  ── non-gated direct modes (no orchestrator, no STAGE-GATE)
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
| `th:leader` | coordination | — (top-level session agent) | No — presents + relays; records no gate-release |
| `th:orchestrator` | execution | `th:leader` (per task/project) | Yes — prepares + records all three STAGE-GATEs |
| `architect` | analysis | orchestrator (or leader in research/design direct mode) | No |
| `qa-plan` | analysis | orchestrator (ratify) / leader (define-ac direct) | No |
| `plan-reviewer` | analysis | orchestrator | No |
| `implementer` | implementation | orchestrator (or leader for a Tier 0 fix) | No |
| `tester` | implementation | orchestrator | No |
| `qa` | implementation | orchestrator | No |
| `security` | analysis + implementation | orchestrator (design-review + verify) | No |
| `adversary` | implementation | orchestrator (verify, security-sensitive) | No |
| `delivery` | delivery | orchestrator | No |
| `reviewer` / `reviewer-consolidator` | delivery | orchestrator | No |
| `ux-reviewer` | analysis + implementation | orchestrator (frontend scope) | No |
| `diagrammer` / `d2-diagrammer` / `likec4-diagrammer` | any | orchestrator / leader | No |
| `documenter` | docs | leader (docs direct mode) | No |
| `researcher` / `code-researcher` / `research-consolidator` | research | leader (research direct mode) | No |
| `mentor` / `init` / `translator` | direct | leader | No |
| `gcp-cost-analyzer` / `gcp-infra` | ops | orchestrator / leader | No (gcp-infra has its own blast-radius confirmation) |
| `agent-builder` | meta | operator (not a pipeline run) | No |

## Invariants

- **Only `th:leader` multiplies `th:orchestrator`.** A `th:orchestrator` never spawns another orchestrator or a leader — so there is never a second node of the same name in the tree, and you always know whether you are talking to the leader or an orchestrator.
- **Gate state lives only inside the orchestrator.** The orchestrator prepares each STAGE-GATE and records its release — the dual-record (the `gateN_release` field in its own 00-state.md plus the `stage.gate.release` event); it is the sole writer of gate state. The leader presents each gate's STOP block to the operator inline and relays the operator's decision (verbatim, tagged `leader-relayed-operator`) back to the orchestrator, but never emits, records, or forges any part of a gate-release.
- **Direct modes have no STAGE-GATE,** so the leader dispatches those specialists itself without an orchestrator.

See also: `docs/how-it-works.md` (end-to-end flow), `docs/pipelines.md` (stage/phase mechanics), `agents/leader.md` and `agents/orchestrator.md` (the two coordination contracts), `docs/reasoning-checkpoint.md § "Under the leader/orchestrator split"`.
