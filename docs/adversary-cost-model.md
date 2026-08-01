# Adversary Cost Model

> Measurement assumptions for the conditional validation-checkpoint `adversary` audit. This document describes the current one-audit-per-delivery-group design, not the retired per-task/per-round model.

## Measured baseline

Two security-saturated runs from 2026-07-17/18 provide the historical anchor:

| Run | Adversary tokens | Share of run | Dispatches | Per dispatch |
|---|---:|---:|---:|---:|
| sot-cutover-http PR-A | 1.65M | 19.1% | 8 | ~206K |
| sot-cutover-http PR-B | 1.42M | 13.8% | 8 | ~177K |

Blended baseline: approximately **1.52M tokens per run**, **8 dispatches**, and **190K tokens per dispatch**. These runs predate the current delivery-group audit shape and are retained only as a comparison anchor.

## Current dispatch shape

The current pipeline dispatches `adversary`:

- once over the consolidated frozen delivery diff when `security_floor_applies`;
- once more for each operator-requested `amend` cycle that later resumes delivery
  with `ship`, scoped to the amendment dependency closure;
- never from autonomous patch iterations;
- never for an abandoned or still-pending amend cycle;
- never on a non-sensitive run.

This removes dispatch-count multiplication by task and verifier round. The
remaining count is one initial audit plus one re-audit for each amend cycle that
actually resumes delivery, not one for every requested amend.

## Static context reduction

The July 30 prompt revision reduces `agents/adversary.md` from:

| Version | Lines | Words | Bytes |
|---|---:|---:|---:|
| Before | 309 | 5,705 | 39,711 |
| After | 191 | 1,409 | 10,066 |

The byte reduction is approximately **75%** for the agent-owned static prompt. This is not a claim that total dispatch tokens fall by 75%: the frozen diff remains the authoritative input and may dominate a large audit.

Additional structural reductions:

- no explicit duplicate read of `CLAUDE.md`;
- no Web or direct Knowledge Graph tools;
- no mandatory full `02-implementation.md` or `01-plan.md` read; the audit keeps the targeted
  approach, risk, classification, key-decision, security-assessment, and in-scope AC sections;
- only the Security Design-Review section of the Stage-1 panel artifact;
- no per-file packet-membership reread;
- targeted source reads only when the frozen diff lacks evidence needed to establish a precondition;
- one combined per-control attempt instead of separate attempt and inverted-claim narratives.

These reductions remove duplicated context. They do not reduce the number of changed controls attempted or the evidence required for `broke-it`.

## Output guidance

Each dispatch carries:

```text
Adversary output budget (format guidance): ~800 + 600×(in-scope changed-control count) tokens
```

The budget is a presentation target, not a stop condition. It never permits the agent to omit a control, suppress a break, or compress a reachable precondition until it becomes non-actionable.

## Quality invariants

Cost reduction is acceptable only while all of these remain true:

1. The complete frozen diff is read.
2. Every changed security control in scope receives a distinct attempt.
3. `broke-it` requires a protected property, reachable precondition, and `file:line` trace.
4. `security` and `adversary` retain different methods and verdict vocabularies.
5. Untestable material coverage is declared through `incomplete_on_changed_control`.
6. A correctable `broke-it` or incomplete sensitive-coverage finding fails validation and
   returns to implementation → Freeze → a fresh audit; only non-correctable structural
   concerns remain operator-disposed at Gate 3.

`could-not-break` is neutral and non-certifying. It maps to `concerns` only when material evidence or coverage was unavailable, rather than automatically penalizing every completed negative attempt.

## Live measurement

Use `00-execution-events.{jsonl,md}` and `00-pipeline-summary.md § Cost` from the next representative sensitive pipeline run.

Record:

1. adversary input and output tokens;
2. frozen-diff byte size;
3. changed-control count;
4. packet escapes;
5. full versus amend audit;
6. verdict, break count, and incomplete-coverage flag.

Compare total and per-dispatch tokens with the historical baseline, but normalize interpretation by frozen-diff size and control count. A smaller prompt cannot make a large substantive diff cheap, and a raw token ratio without those coordinates would overstate or understate the improvement.

The revision is successful when context consumption falls without a reduction in distinct controls attempted or evidenced breaks surfaced. A token reduction accompanied by sampled undeclared coverage is a regression, not an optimization.
