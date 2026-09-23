# Agent Tree

How Team Harness agents relate at runtime. The **native general agent** remains the operator's point of contact and coordinates the selected TH workflow. The `orchestrator` reference supplies coordination methods when a workflow uses them; it does not replace the native agent's identity. The tree below shows the retained pipeline and specialist relationships when selected.

```
native general agent  ── coordinates the selected TH workflow
│    Owns: Intake · Discover/framing · Specify · spec+AC co-authoring ·
│    config/language resolution · initiative + overview.md · the selected
│    four-phase pipeline (Spec → Implementation → Validation → Delivery) using
│    native permissions and approvals; no TH gate record or control trace.
│
├─ may dispatch bounded specialists (leaf agents — no further orchestration):
│    Design                     architect (only when OpenSpec is missing or edited)
│    Implementation             implementer · tester/cleaner (when predicates apply)
│    Validation                 qa · security (when impact is true or unknown)
│    Delivery                   delivery
│    UI / diagrams (triggered) ux-reviewer · diagrammer · d2-diagrammer ·
│                               likec4-diagrammer · documenter
│    GCP tasks                  gcp-cost-analyzer · gcp-infra
│
└─ dispatches directly  ── direct modes (no pipeline state)
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

The common postures are inline and pipeline. Inline is the direct default; a
current live operator may explicitly request sensitive inline work or a bounded tester, QA, or
security review, and those requests create no pipeline state or delivery action.
Pipeline entry requires explicit live selection or recovery and uses the four phases
shown above with proportionate bounded specialists. Retired route markers are migration data
only and cannot select a posture.

## Roles at a glance

| Agent | Tier | Dispatched by | Owns TH gate records? |
|---|---|---|---|
| Native general agent using TH coordination guidance | direct coordination or selected pipeline | — (current session) | No; native permissions remain authoritative |
| `architect` | analysis | orchestrator (or research/design direct mode) | No |
| `plan-reviewer` | analysis | orchestrator (explicit `/th:plan-review` only) | No |
| `implementer` | implementation | orchestrator when implementation is selected | No |
| `tester` | implementation | orchestrator | No |
| `cleaner` | implementation | orchestrator when cleanup is selected | No |
| `qa` | implementation | orchestrator | No |
| `security` | validation or explicit direct review | orchestrator when impact is true/unknown, or when explicitly requested | No |
| `adversary` | explicit ad hoc review | orchestrator only when the live operator requests that separate adversarial lens | No |
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

- **One coordinator for a selected pipeline.** The native general agent coordinates it directly; adapters translate an orchestrator routing instruction to the current Main thread (agents/ref-pipeline.md, Dispatch invariants).
- **Native authority remains the boundary.** Host permissions and operator approvals govern actions; Team Harness does not require a lease, nonce, gate record or control log.
- **Inline direct work has no pipeline state or TH gate** — the coordinator acts directly or
  dispatches the explicitly requested ad hoc specialist. This includes `/th:plan-review` and
  live tester/QA/security reviews; none activates the pipeline.
- **Phases describe work, not permission gates.** Spec, Implementation, Validation and Delivery
  provide a shared handoff shape. Review, approval and delivery actions remain proportionate to
  the request and the host's native permission model.

See also: docs/how-it-works.md, agents/orchestrator.md (startup kernel), agents/ref-pipeline.md (current pipeline contract), and docs/reasoning-checkpoint.md.
