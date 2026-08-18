# Agent Authoring Standard

Every role in this repository ships as two artifacts: a **semantic contract**
(`agents/*.md`) that fully states the role's rules, and per runtime a
**compact adapter** (for example `runtime/codex/instructions/*.md`) that
projects those rules into the host's dispatch format. This standard governs
both. It exists because instruction files past the budget measurably degrade
compliance, and because the full body of an agent file is paid in tokens on
every dispatch of that agent.

`/th:lint` enforces the structural half of this standard deterministically
(Check 12); the semantic↔adapter parity check in the projection suite
(`tests/test_codex_runtime.py`) enforces propagation. `agent-builder` applies
this standard to every file it creates or edits.

## Canonical skeleton

Every agent file follows this order:

1. **Role sentence** — one sentence: who the agent is and the single job it
   performs. The frontmatter `description` is a one-line third-person summary
   of the same job.
2. **When-invoked steps** — the concrete steps the agent takes on dispatch,
   in execution order, starting from what it reads.
3. **Measurable criteria** — what makes the work acceptable, stated so an
   outside reader can verify each criterion against artifacts.
4. **Literal output template** — the exact return block (status fields,
   artifact pointers), given as a fenced literal, not described in prose.
5. **Boundaries** — what the agent never does, bounded to real risks of this
   role's tool grants.

Frontmatter is mandatory: `name`, `description`, `model`, `effort`, `color`,
and an explicit `tools` allowlist. A missing `tools` line is a lint failure,
not an implicit grant.

## Size budgets

| File class | Word budget | Hard cap |
|---|---|---|
| Specialist agent (`agents/*.md`) | ≤ 2,000 words | 500 lines |
| Shared contract (`agents/_shared/*.md`) | ≤ 1,500 words | 500 lines |
| Reference file (`agents/ref-*.md`, skill `references/*`) | split by execution path | TOC required over 100 lines |

Lint warns at 80% of a word budget and fails at the hard cap. References stay
**one level deep**: an agent may point to a reference; a reference may not
point to another reference that the reader must open to act. A reference over
100 lines opens with a table of contents so a section can be loaded by
heading without reading the file in full. When one file serves several
execution paths, split it by path instead of growing it.

A budget constrains fixed prose, never required items: when a file exceeds a
target because of genuinely required enumerations (a closed field schema, a
literal template), keep the items and state `size_reason: required-items` in
the PR body rather than deleting content to fit.

## Authoring rules

1. **Per-line deletion test.** Every line must change behavior if deleted.
   A line that survives deletion without behavioral loss is noise; remove it.
2. **One motivated rule over enumerations.** State the principle once with
   its reason instead of enumerating instances; add an instance only when it
   genuinely does not follow from the principle.
3. **One default plus one named escape hatch.** Prefer a single default
   behavior and one explicitly named exception over option lists.
4. **One term per concept.** Pick a term and use it everywhere; a synonym
   reads as a second concept.
5. **No time-sensitive statements in living files.** No "recently", "new",
   "as of", version-relative comparisons, or references to retired states
   except in explicitly historical sections.
6. **Scarce emphasis.** Bold and CAPS mark only load-bearing floors; when
   everything is emphasized, nothing is.
7. **Front-load the load-bearing rule.** The rule a reader must not miss
   comes first in its section, not after context.
8. **Literal templates over described formats.** Show the exact output block;
   never describe a format in prose the model must reconstruct.
9. **One canonical home per fact.** State a rule in one file and point to it
   from the others; a duplicated truth drifts.
10. **Example only where a rule is ambiguous.** A good rule usually needs no
    example; add one Bad/Good pair only where compliance genuinely failed
    without it.

## Semantic↔adapter parity

A rule present in the semantic source must be present — possibly reworded —
in every projection of that role, and never contradicted by one. Compressing
an already-compact adapter is not a goal; parity is. The deterministic parity
table in `tests/test_codex_runtime.py` anchors each role's load-bearing rules
on both sides; editing a rule in either file without updating the other side
(or the table) fails the projection suite.

## Rewriting an oversized file

Rewrite highest per-dispatch cost first. Every removed rule must be
inferable from a remaining rule, redundant with a single remaining canonical
site, or dead. Security floors and gate contracts are never removed or
weakened by a rewrite. Rewrite whole sections in coherent order — never
append patch paragraphs — and target net word reduction per file. Validate
each rewrite with the deterministic behavioral suite and a trial run before
merging.

## PR checklist

- [ ] File follows the canonical skeleton in order.
- [ ] Within word budget and hard line cap (or `size_reason: required-items`
      stated in the PR body).
- [ ] Frontmatter complete, including an explicit `tools` allowlist.
- [ ] References one level deep; TOC present when over 100 lines.
- [ ] No dangling section anchors (every `file § "Heading"` cite resolves).
- [ ] Runtime adapters updated for every changed rule; parity table updated
      when anchors moved.
- [ ] `/th:lint` and the deterministic suites pass.
