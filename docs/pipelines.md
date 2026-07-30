# Pipelines reference

> **This file is derived, not authoritative.** Every flow below is defined in one place, and that place is named in the table. This document exists so a human can see the whole catalogue at once — it must never restate a flow's mechanics, because a second copy is what drifts. If this file and the named home disagree, the home wins and this file is stale.

Regenerate this index whenever a flow's home changes. Do not edit a flow's behaviour here.

---

## The pipeline

The opt-in gated flow is Design → Implementation → Verify → Delivery, with a human gate at the end of analysis and another before publication. `/th:pipeline` activates it; its authoritative lazy-loaded definition is `agents/ref-pipeline.md`.

| What you want to know | Authoritative home |
|---|---|
| Phase sequence and what advances it | `agents/ref-pipeline.md` |
| Gate mechanics: dual record, STOP templates, ambiguous reply, nonce | `agents/_shared/gate-contract.md` |
| Which specialist is called when, and what its return must contain | `agents/ref-pipeline.md § "Your Team"` |
| What a dispatch may and must not carry | `agents/_shared/dispatch-contract.md` |
| Lane model (inline / express / full) and its cost estimate | `docs/pipeline-lanes.md` |
| Intake: lane classification, bug tier, provenance tiers | `agents/ref-intake-flows.md` |
| Discover depth, external-report scope verification | `docs/discover-phase.md` |
| Spec co-authoring | `docs/spec-coauthoring.md` |
| Publication mechanics: version bump, branch, changelog, push, PR | `agents/_shared/delivery-mechanics.md` |
| Event schema, cost formula, trace fields | `docs/observability.md` |
| Suite-run evidence and tree anchors | `docs/suite-evidence.md` |
| Code-hygiene pattern set | `docs/code-hygiene-gate.md` |

## Flow variants

Each variant is defined once, in `agents/ref-special-flows.md`, under the section named here. This table is a locator, not a summary.

| Variant | Section in `agents/ref-special-flows.md` |
|---|---|
| Bug fix (`type: fix`), including the tier system | `## Bug-fix Flow` |
| Hotfix (`type: hotfix`) | `## Hotfix sub-flow` |
| Refactor | `## Refactor Flow` |
| Security-sensitive (extended) | `## Security-Sensitive Flow` |
| Database changes | `## Database Changes Flow` |
| Test pipeline | `## Test Pipeline Flow` |
| Research · code research · spike | `## Research Flow` · `## Research-Code Flow` · `## Spike Flow` |
| Plan (task breakdown) | `## Plan Flow` |
| Milestone build (`type: plan`) | `## Milestone-Build Flow`, `## Milestone Index` |
| Documentation | `## Documentation Flow` |
| Simple mode · fast mode | `## User-Initiated Simple Mode` · `## Fast Mode` |
| Learn / teaching | `## Learn (Teaching) Flow` |
| Plan sketches, per type | `## Plan Sketches — Per-Type Applicability` |
| Artifact verification in special flows | `## Artifact Verification in Special Flows` |

## Initiative mode (multi-project)

Grouping several projects' pipelines under one `overview.md` parent index. Projects run one at a time. Supported and current; infrequent. Definition: `agents/ref-dispatch-machinery.md`.

## Direct modes

Non-gated modes the coordinator runs directly: diagram, likec4, d2, review, translate, plan-review. Definition: `agents/ref-direct-modes.md`.

## PR review

Review of an existing GitHub PR is a standalone, snapshot-bound skill, never a coordinator-owned pipeline phase — `/th:review-pr` is the hard trigger (`agents/ref-pipeline.md § "11 — Intent routing"`). Its immutable gather, evidence-triggered lenses, concise body/inline-thread split, and decision menu are defined once in `skills/review-pr/SKILL.md`; the read-only and publish-gate contracts live in `agents/ref-direct-modes.md`. Not duplicated here.

## When `gh` is absent or unauthenticated

Degradation chain: `agents/_shared/gh-fallback.md`.

---

## Not in this catalogue

Retired, and named here only so a reader who remembers them stops looking: the multi-task fan-out and its consolidator, the second coordinator and its roster, the coordinator spawn payload, the acceptance gate's separate checker agent, the in-pipeline PR reviewer, and the nested-dispatch takeover protocol. History for each lives in `CHANGELOG.md` and `docs/decisions.md`, never here.
