# Audit coverage method

Use the maintained [arc42 perspectives](https://arc42.org/overview/) and the
[SEI ATAM scenario approach](https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/)
as orientation references. They help select relevant viewpoints and quality
scenarios; they do not turn a TH audit into a formal ATAM evaluation or a
certification of the architecture.

## Coverage record

For the agreed project, module or layer, record the surfaces that matter and
the relationships between them. Start each selected capability with the
user/system outcome to assess. Trace its entry, actors, contracts, state/data,
effective configuration, implementing components, actual consumers and relevant
runtime/dependency handoffs across repositories through to the resulting behavior.
For each material interaction, connect:

- the component or boundary examined;
- material success and failure/recovery scenarios, and relevant change scenarios;
- the evidence path, command result or report used;
- `observed`, `inferred` or `unverified` status;
- the inspection owner and any material limit.

Use arc42 context, building-block, runtime and deployment perspectives when
they apply. Express quality concerns as concrete ATAM-style scenarios with a
stimulus, affected concern and observable response; omit inapplicable views
with a reason. Trace actual consumers and cross-boundary handoffs before
recommending removal or consolidation.

At entry or resumption, reuse evidence only while its question, source,
environment and configuration still apply. When those inputs change, renew
evidence for affected and dependent analysis; preserve completed independent
analysis and its limits.

Separate source observations, observed runtime behavior and inferred outcomes.
For material uncertainty, identify the unverified step or environmental
assumption and the smallest missing observation that could resolve it.

Reading every entry point or counting files is inventory evidence only.
Inventory or phase completion does not prove that interactions work or that
defects are absent. A missing host, unreadable source, skipped command or
unexecuted behavior remains an explicit coverage limit in the caller's report,
normally `research/00-audit.md` for direct audit. Use the
[project audit method](project-audit.md) for applicable shared finding/evidence
records and project-wide consolidation; preserve the caller's output grouping.
