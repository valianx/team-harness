---
name: ref-architect-modes
description: Secondary-mode reference for the architect (research, audit, planning, consolidation, root-cause templates). Read on-demand by th:architect — not a standalone agent.
model: opus
color: yellow
---

# Architect secondary modes

Process detail and output templates for the architect's non-design modes.
Loaded on demand by `agents/architect.md` when the dispatch names the mode;
never a dispatch target. Locate the needed section by heading; do not read
this file in full.

## Contents

- [Research Mode](#research-mode)
- [Audit Mode](#audit-mode)
- [Planning Mode](#planning-mode)
- [Consolidation Mode](#consolidation-mode)
- [Root-cause templates](#root-cause-templates)

## Research Mode

Produces a neutral, evidence-based report with options and a recommendation —
never an architecture proposal. Output:
`workspaces/{feature-name}/research/00-research.md`.

1. **Define the research question** — technology migration, library
   comparison, approach evaluation, or feasibility study.
2. **Gather evidence.** When the coordinator provides a consolidated findings
   file (written by `research-consolidator`), read it as the primary evidence
   base; spot-fetch with `WebFetch` only for gaps flagged under
   `## Coverage gaps` — do not re-run broad `WebSearch` over covered angles.
   With no consolidated findings, use context7, WebSearch, codebase analysis,
   and a compatibility check against the existing stack directly.
3. **Analyze per option:** concrete pros/cons, migration effort, risk and
   reversibility, team impact, stack compatibility.
4. **Write the report.** In follow-up rounds, amend the SAME
   `research/00-research.md` in place — never a `-v2` sibling. Re-synthesize
   `## Recommendation` and `## Next Steps`, reconcile `## Coverage gaps`, and
   write or overwrite `## Residual Gaps`.

```markdown
# Research: {topic}
**Date:** {date}
**Agent:** architect (research mode)

## Research Question
## Context
## Sources Consulted
## Options Analyzed
Per option: description, pros, cons, migration effort (low/med/high), risk, compatibility with current stack.
## Comparison Matrix
Table: options × criteria (performance, migration effort, community, learning curve, compatibility)
## Recommendation
## Next Steps

## Coverage gaps

```gaps
- id: {g1}
  material: {true|false}
  web_closeable: {true|false}
  desc: "{what is still missing}"
  angle: "{narrow search angle, or 'n/a'}"
```

## Residual Gaps

**Termination reason:** {no-material-closeable-gaps | round-cap-reached | all-gaps-closed}

- `{gap-id}`: {desc} — reason: {non-material | not-web-closeable | round-cap-reached}
```

Re-emit the same fenced `gaps` block shape each round, reconciled against the
synthesis: remove or de-materialize addressed gaps; `- none` when none remain.
`## Residual Gaps` is mandatory at termination and names exactly one
termination reason. When all gaps closed across rounds, say so; when none ever
existed, write "No coverage gaps identified."

## Audit Mode

Produces a diagnostic report with severity-categorized findings and concrete
file references — never a proposal or task breakdown. Output:
`workspaces/{feature-name}/research/00-audit.md`.

1. **Scope** — full project, module, or layer.
2. **Deep scan** with Glob/Grep/Read: structure, dependency graph, pattern
   consistency, duplication and missing abstractions, layer violations, dead
   code.
3. **Documentation review** — README/CLAUDE.md/inline docs accuracy vs
   reality.
4. **Write the report:**

```markdown
# Architecture Audit: {scope}
**Date:** {date}
**Scope:** {what was audited}

## Summary
{2-3 sentence executive summary}

## Findings

### Critical (should fix soon)
- **{finding}** — {file:line} — {explanation and impact}

### Warning (tech debt accumulating)
- **{finding}** — {file:line} — {explanation}

### Info (improvement opportunities)
- **{finding}** — {explanation}

## Patterns Observed
- {pattern}: {where it's used, is it consistent?}

## Recommendations
1. {prioritized actionable recommendation}
```

## Planning Mode

Produces a structured task breakdown the coordinator turns into GitHub
issues — no architecture proposal, research report, code, or tests. Output:
`workspaces/{feature-name}/01-planning.md`.

**Task sizing (agent-time, never human-time).** XS 5-15 min (config change,
single-file fix) max 2-3 AC; S 15-30 min (1-3 file feature) max 3-4; M 30-60
min (multi-file feature, new service with tests) max 4-5; L 60 min-2.5 h
(cross-module feature, external-API integration) max 5-7. Nothing larger than
L — over 2.5 h or 7 AC splits. Default to the low end; do not add safety
margins, map from human-team estimates, or inflate for unnamed complexity.
Multipliers only on a named trigger — unfamiliar stack ×1.3, rollback-risk
migration ×1.5, spike ×2.0 — largest one only, never stacked. Parallel
dispatch changes batch time only across distinct canonical
worktrees/repositories; same-worktree tasks are sequential (shared Git
metadata), so batch wall-clock ≈ longest round across worktrees, sum within
one. A human-weeks project typically runs 3-8 hours of agent batch execution;
a much higher estimate is padding. Too big: needs its own architecture
proposal, touches >3-4 unrelated areas, >7 AC, full end-to-end feature, or
>3 h estimate. Too small: single-line change with no meaningful AC. Split by
layer, behavior, component, or dependency.

**Dispatch classification (mandatory, exactly one per task):**

| Label | Meaning | Rule |
|-------|---------|------|
| `BLOCKER` | blocks other tasks | no dependencies AND blocks ≥2 tasks → earliest round |
| `PARALLEL` | independent on a distinct canonical worktree/repository | no dependencies, blocks ≤1, distinct worktree, disjoint ownership |
| `CONVERGENCE` | sync point | depends on ≥2 tasks from different streams |
| `SEQUENTIAL` | ordered in its stream | depends on exactly 1 task; also the default whenever in doubt or tasks share a worktree |

**Process:** analyze the task spec → investigate the codebase (impact points,
patterns, constraints) → research documentation via context7 → decompose with
the sizing rules → per task define title (imperative, ≤70 chars), description,
label (`feature|fix|refactor|enhancement`), dispatch label, Given/When/Then
ACs (≤20), files affected, architecture guidance, size + agent-time estimate,
dependencies, and blocks.

```markdown
# Planning Breakdown: {feature-name}
**Date:** {date}
**Agent:** architect (planning mode)
**Project type:** {backend/frontend/fullstack}

## Problem Analysis
## Architecture Context

## Task Breakdown

### Group: {logical group name}

#### Task 1: {imperative title}
- **Label:** {feature/fix/refactor/enhancement}
- **Dispatch:** {BLOCKER/PARALLEL/CONVERGENCE/SEQUENTIAL}
- **Size:** {XS/S/M/L} — **Agent-time:** {estimate}
- **Group:** {group name}
- **Dependencies:** {none | Task N}
- **Blocks:** {Task M | none}
- **Description:** {what needs to be done}
- **Acceptance Criteria:**
  - [ ] AC-1: Given {context}, When {action}, Then {result}
- **Files affected:** {list}
- **Architecture guidance:** {pattern to follow, interfaces to respect}

## Dispatch Map
| Task | Dispatch | Size | Agent-Time | Dependencies | Blocks | Round |
|------|----------|------|-----------|-------------|--------|-------|

**Execution plan:** Round N: {tasks} — ~{longest task in round}; total batch
time = sum of round times.

## Summary
| Group | Tasks | XS | S | M | L |

## Risks & Considerations
- {risk or cross-cutting concern}
```

## Consolidation Mode

Used by `/th:cross-repo` to synthesize N per-repo reports into one document.
Works only from the per-repo reports — never analyzes codebases directly.
Output: `{output-dir}/00-consolidated.md`.

1. **Load inputs:** `analysis-context.md`, all `*-summary.md`, all detailed
   reports; the profile (invariants, expected topology) and flow definition
   when present.
2. **Invariant validation** (profile): per invariant, mark PASS/FAIL/WARN with
   `file:line` evidence from the reports.
3. **Contract validation** (flow mode): per hop boundary, compare what hop N
   produces with what hop N+1 expects — field names, types, missing fields,
   formats — and identify undocumented dependencies.
4. **Cross-cutting analysis:** systemic issues (same problem in 3+ repos =
   organizational), inconsistent patterns, missing layers (observability,
   circuit breakers, DLQs), business-rule gaps, and per-hop failure-scenario
   tracing.
5. **Write the report:**

```markdown
# Cross-Repo Analysis: {analysis name}
**Date:** {date}
**Mode:** {flow-tracing|system-audit|ad-hoc}
**Profile:** {name or "none"} | **Flow:** {name or "none"} | **Repos:** {N}

## Executive Summary
{3-5 lines: overall health, top risk, most urgent action}

## Invariant Validation
| Invariant | Status | Evidence | Repo |

## Flow Analysis
### Contract Validation
| Boundary | Expected | Actual | Status | Issue |
### Business Rules Coverage
| Rule | Declared In | Enforced In | Status | Evidence |
### Failure Scenarios
| Scenario | Impact | Current Handling | Recommendation |

## Per-Hop Summary
| Hop | Service | Critical | High | Medium | Low | Business Rules | Test Quality |

## Cross-Cutting Findings
### Systemic Issues (same problem across repos)
### Inconsistencies Between Services
### Missing Layers

## Findings by Severity
### Critical
- **{finding}** — {repo}:{file}:{line} — {impact} — {remediation}
### High
### Medium
### Low / Info

## Risk Matrix
| Risk | Probability | Impact | Affected Hops | Priority |

## Recommendations (Prioritized)
1. **[Critical]** {action} — fixes {findings} — estimated effort: {scope}

## Topology: Declared vs Discovered
- **Declared:** … | **Discovered:** … | **Discrepancies:** …
```

## Root-cause templates

Sub-mode size contracts (`agents/architect.md § Root-Cause Analysis Mode`
holds the mode contract):

| Sub-mode | Trigger | `01-root-cause.md` content | Cap |
|---|---|---|---|
| `light-root-cause` | `bug_tier: 2` | TL;DR (1 line) + `## Mechanism` (≤5 sentences) + `## Scope of Fix` (≤3 sentences) + `## Regression Test Approach`; omit Prior Art, Trade-offs, Decisions, Services Touched, Work Plan | ≤30 lines; plan-reviewer Rule 7 accepts the abbreviated shape when `bug_tier: 2` is declared |
| `full-root-cause` (Tier 3) | `bug_tier: 3` | full template; `## Prior Art` optional (only with a known relevant `process-insight`) | ≤80 body lines; Rule 7 flags >120 as `concerns` |
| `full-root-cause` (Tier 4) | `bug_tier: 4` | full template + mandatory `## Prior Art`: query `mcp__memory__search_nodes` with 1-3 failure-mode queries; when nothing is relevant, write `No prior art found in the knowledge graph for this failure mode.` — the empty section signals the agent looked | ≤80 body lines; Prior Art excluded (≤15 more) |

```markdown
# Root-Cause Analysis: {feature-name}
**Date:** {YYYY-MM-DD}
**Agent:** architect (root-cause mode)
**Type:** fix

## TL;DR
{2-4 lines: what the bug is, why it happens, what the fix is, what the risk is}

## Bug Location
- **File:** `{path}:{line-range}`
- **Function/component:** `{name}`
- **Module/service:** `{module}`

## Failure Mechanism
{3-6 sentences: input → defective code path → observed behaviour, with file:line per step}

## Scope of Fix
- **Files to modify:** {1-3 typically — more is a signal to re-examine}
- **Behavioural change:** {user-visible change}
- **Non-changes:** {APIs, schemas, public contracts that do NOT change}

## Prior Art
{per the sub-mode table}

## Regression Test Approach
{Mandatory. The tester reads this to author the failing test.}
- **Test layer:** unit | integration | e2e — {which layer deterministically reproduces the bug}
- **Test scaffold:** {fixtures, mocks, environment}
- **Failing assertion:** {the assertion that fails today and passes after the fix}

## Decisions for human review
- {label} — {one-sentence context}. → decided as X | → open question
(or "- No human-judgement decisions required — minimal fix following established patterns. → decided")

## Trade-offs
- Chose {minimal fix} over {larger refactor} because {reason}

## Services Touched
{single line — plan-reviewer Rule 5 cross-checks}

## Work Plan
| # | Step | File | Action | Depends on |
|---|------|------|--------|------------|
| 1 | Write failing regression test | {test-file} | Capture the bug; assert expected behaviour | — |
| 2 | Apply fix | {source-file} | {minimal change} | Step 1 |
| 3 | Run suite; confirm regression passes, no suite regress | n/a | Verification | Step 2 |
```

`01-plan.md` for a bug fix is structurally identical to the design-mode schema
(`agents/ref-architect-design.md`) with two differences: delivery grouping is
almost always `all-tasks-one-pr` (a split needs a closed-list reason), and per
plan-reviewer Rule 8 the regression-test path appears in the task's `TC-N`
block as `regression test exists at <TBD-Phase-2.0>` until the orchestrator
mutates that one technical placeholder to the real path — functional ACs
describe corrected behavior, never test existence. The Review Summary inherits
the same classification block, all nine values, with the same fail-closed
default and diff-grounded justification for `false` on a security-sensitive
fix. Task shards cover confirming the mechanism, applying the correction, and
verifying the result — combined into as few tasks as the fix genuinely needs;
`01-plan.md` is always produced for a `type: fix` dispatch.
