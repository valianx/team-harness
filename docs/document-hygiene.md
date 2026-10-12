# Document Hygiene

Contributor guide to keeping repository instructions concise and detailed
documentation in its canonical home.

## Repository entry point

[`AGENTS.md`](../AGENTS.md) is the contributor entry point. Keep actionable
repository instructions there and link to the detailed guides in `docs/`.
Detailed tables, rationale, protocols and historical entries belong in their
owning document rather than being duplicated in the entry point.

## What belongs in AGENTS.md vs docs/

| AGENTS.md | docs/ |
|-----------|-------|
| Workflow selection and responsibility boundaries | Detailed workflow contracts and migration guides |
| Canonical source locations and working rules | Architectural conventions and rationale |
| Required contributor validation and delivery pointers | Suite registry, commands and release lifecycle |
| Benchmark boundaries and evidence pointers | Reproducible protocols and run evidence |
| Links to canonical guides | Detailed content and historical decisions |

## docs/ structure

| File | Content | Updated by |
|------|---------|-----------|
| `docs/knowledge.md` | Flat bullets with tag prefixes | explicit knowledge flow |
| `docs/decisions.md` | Architecture decision history (date + decision + rationale) | contributor documenting a decision |
| `docs/patterns.md` | Historical patterns (pattern + example path) | contributor documenting a pattern |
| `docs/constraints.md` | Constraints and supporting detail | contributor documenting a constraint |
| `docs/testing.md` | Testing conventions and suite registry | contributor changing tests or verification commands |

Update the existing canonical document when its content changes. Agents that
require project knowledge consume task-relevant entries supplied by the
coordinator; when none are available, the implementer uses a bounded `rg`
fallback and never reads `docs/knowledge.md` in full. Detailed guides remain
available on demand.
