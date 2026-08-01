# Pipelines reference

> **This file is derived, not authoritative.** Every flow below is defined in one place, and that place is named in the table. This document exists so a human can see the whole catalogue at once — it must never restate a flow's mechanics, because a second copy is what drifts. If this file and the named home disagree, the home wins and this file is stale.

Regenerate this index whenever a flow's home changes. Do not edit a flow's behaviour here.

---

## The two postures

Team Harness has exactly two runtime postures: `inline` and `pipeline`. `inline` is the direct
default. It creates no pipeline workspace, state, events, gates, or delivery action; a live
operator may explicitly request a bounded tester, QA, or security review and that ad hoc review
also remains inline. Sensitive inline work is allowed when the current live operator selects
`inline`; no second confirmation or forced route is inferred.

`pipeline` is the only gated posture and is always the canonical full v3 state machine:
`design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete`.
Only a current live `/th:pipeline` (or equivalent explicit activation) or `/th:recover` of an
existing run enters it. Its authoritative lazy-loaded definition is `agents/ref-pipeline.md`.
Retired route markers are compatibility data only; they do not select a posture or release a gate.

| What you want to know | Authoritative home |
|---|---|
| Named states, successors and what advances them | `agents/ref-pipeline.md` + `agents/_shared/orchestrator-state.md` |
| Gate mechanics: dual record, STOP templates, ambiguous reply, nonce | `agents/_shared/gate-contract.md` |
| Which specialist is called when, and what its return must contain | `agents/ref-pipeline.md § "Your Team"` |
| What a dispatch may and must not carry | `agents/_shared/dispatch-contract.md` |
| Two-posture compatibility and legacy migration | `docs/pipeline-lanes.md` |
| Intake: posture classification, bug metadata, provenance tiers | `agents/ref-intake-flows.md` |
| Discover depth, external-report scope verification | `docs/discover-phase.md` |
| Spec co-authoring | `docs/spec-coauthoring.md` |
| Publication mechanics: version bump, branch, changelog, push, PR | `agents/_shared/delivery-mechanics.md` |
| Event schema, cost formula, trace fields | `docs/observability.md` |
| Suite-run evidence and tree anchors | `docs/suite-evidence.md` |
| Code-hygiene pattern set | `docs/code-hygiene-gate.md` |
| Concise gate options and numeric shortcuts | `agents/_shared/gate-contract.md` |

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
| Legacy simple/fast wording | `docs/pipeline-lanes.md` § Legacy route markers (compatibility only) |
| Learn / teaching | `## Learn (Teaching) Flow` |
| Plan sketches, per type | `## Plan Sketches — Per-Type Applicability` |
| Artifact verification in special flows | `## Artifact Verification in Special Flows` |

## Initiative mode (multi-project)

Grouping several projects' pipelines under one `overview.md` parent index. Projects run one at a time. Supported and current; infrequent. Definition: `agents/ref-dispatch-machinery.md`.

## Direct modes

Non-gated modes the coordinator runs directly: diagram, likec4, d2, review, translate, and
plan-review. Definition: `agents/ref-direct-modes.md`. `plan-review` is never an automatic
pipeline panel; it runs only after an explicit `/th:plan-review` invocation.

## PR review

Review of an existing GitHub PR is a standalone, snapshot-bound skill, never a coordinator-owned pipeline phase — `/th:review-pr` is the hard trigger (`agents/ref-pipeline.md § "11 — Intent routing"`). Its immutable gather, fail-closed lens selection, concise body/inline-thread split, and decision menu are defined once in `skills/review-pr/SKILL.md`. PR agents return inline under exact read-only capabilities; the coordinator persists fixed paths after strict tree comparison. Publication recaptures head, base, merge-base, and mergeability; any mismatch invalidates approval. The read-only and publish-gate contracts live in `agents/ref-direct-modes.md`. Not duplicated here.

## When `gh` is absent or unauthenticated

Degradation chain: `agents/_shared/gh-fallback.md`.

---

## Not in this catalogue

Retired, and named here only so a reader who remembers them stops looking: the multi-task fan-out and its consolidator, the second coordinator and its roster, the coordinator spawn payload, the acceptance gate's separate checker agent, the in-pipeline PR reviewer, and the nested-dispatch takeover protocol. History for each lives in `CHANGELOG.md` and `docs/decisions.md`, never here.
