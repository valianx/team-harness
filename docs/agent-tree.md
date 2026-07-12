# Agent Tree

How Team Harness agents relate at runtime after the `th:lider` / `th:orquestador` split. The top-level session agent is **`th:lider`**; it spawns a **`th:orquestador`** per task to run the gated pipeline, and dispatches non-gated specialists directly for the lighter direct modes.

```
th:lider  ── top-level session agent · the operator's single point of contact
│            Owns: Intake · Discover/framing · Specify · spec+AC co-authoring ·
│            config/language resolution · initiative + overview.md.
│            Presents each STAGE-GATE to the operator inline and relays the decision
│            (verbatim, tagged lider-relayed-operator) to the orquestador, which
│            records it; records no gate-release and owns no pipeline 00-state.md.
│            Multiplies th:orquestador — one per task, one per project in a
│            multi-project initiative.
│            (The split is the only execution model, gated by a boot capability check;
│             if the environment can't support it, th:lider STOPS with a clear error — no fallback.)
│
├─▶ spawns  th:orquestador  ── task-scoped execution engine (one per task/project)
│   │        Runs Phase 1 Design → Phase 6 Knowledge Save, prepares and records all
│   │        three STAGE-GATEs (th:lider presents each inline and relays the decision),
│   │        sole writer of its own 00-state.md.
│   │        Never spawns another orquestador or a lider.
│   │
│   └─ dispatches pipeline specialists (leaf agents — no further orchestration):
│        Stage 1 · Analysis        architect · qa-plan (ratify) · plan-reviewer ·
│                                   security (design-review)
│        Stage 2 · Implementation  implementer · tester · qa · security · adversary ·
│                                   acceptance-checker
│        Stage 3 · Delivery        delivery · reviewer (internal pre-PR) ·
│                                   reviewer-consolidator
│        UI / diagrams (triggered) ux-reviewer · diagrammer · d2-diagrammer ·
│                                   likec4-diagrammer · documenter
│        GCP tasks                  gcp-cost-analyzer · gcp-infra
│
└─▶ dispatches directly  ── non-gated direct modes (no orquestador, no STAGE-GATE)
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
| `th:lider` | coordination | — (top-level session agent) | No — presents + relays; records no gate-release |
| `th:orquestador` | execution | `th:lider` (per task/project) | Yes — prepares + records all three STAGE-GATEs |
| `architect` | analysis | orquestador (or lider in research/design direct mode) | No |
| `qa-plan` | analysis | orquestador (ratify) / lider (define-ac direct) | No |
| `plan-reviewer` | analysis | orquestador | No |
| `implementer` | implementation | orquestador (or lider for a Tier 0 fix) | No |
| `tester` | implementation | orquestador | No |
| `qa` | implementation | orquestador | No |
| `security` | analysis + implementation | orquestador (design-review + verify) | No |
| `adversary` | implementation | orquestador (verify, security-sensitive) | No |
| `acceptance-checker` | implementation | orquestador | No |
| `delivery` | delivery | orquestador | No |
| `reviewer` / `reviewer-consolidator` | delivery | orquestador | No |
| `ux-reviewer` | analysis + implementation | orquestador (frontend scope) | No |
| `diagrammer` / `d2-diagrammer` / `likec4-diagrammer` | any | orquestador / lider | No |
| `documenter` | docs | lider (docs direct mode) | No |
| `researcher` / `code-researcher` / `research-consolidator` | research | lider (research direct mode) | No |
| `mentor` / `init` / `translator` | direct | lider | No |
| `gcp-cost-analyzer` / `gcp-infra` | ops | orquestador / lider | No (gcp-infra has its own blast-radius confirmation) |
| `agent-builder` | meta | operator (not a pipeline run) | No |

## Invariants

- **Only `th:lider` multiplies `th:orquestador`.** A `th:orquestador` never spawns another orquestador or a lider — so there is never a second node of the same name in the tree, and you always know whether you are talking to the lider or an orquestador.
- **Gate state lives only inside the orquestador.** The orquestador prepares each STAGE-GATE and records its release — the dual-record (the `gateN_release` field in its own 00-state.md plus the `stage.gate.release` event); it is the sole writer of gate state. The lider presents each gate's STOP block to the operator inline and relays the operator's decision (verbatim, tagged `lider-relayed-operator`) back to the orquestador, but never emits, records, or forges any part of a gate-release.
- **Direct modes have no STAGE-GATE,** so the lider dispatches those specialists itself without an orquestador.

See also: `docs/how-it-works.md` (end-to-end flow), `docs/pipelines.md` (stage/phase mechanics), `agents/lider.md` and `agents/orquestador.md` (the two coordination contracts), `docs/reasoning-checkpoint.md § "Under the líder/orquestador split"`.
