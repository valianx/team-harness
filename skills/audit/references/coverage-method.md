# Audit coverage method

Use the maintained [arc42 perspectives](https://arc42.org/overview/) and the
[SEI ATAM scenario approach](https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/)
as orientation references. They help select relevant viewpoints and quality
scenarios; they do not turn a TH audit into a formal ATAM evaluation or a
certification of the architecture.

## Coverage record

For the agreed project, module or layer, record the surfaces that matter and
the relationships between them. For each material interaction, connect:

- the component or boundary examined;
- a relevant success, change or failure scenario;
- the evidence path, command result or report used;
- `observed`, `inferred` or `unverified` status;
- the inspection owner and any material limit.

Use arc42 context, building-block, runtime and deployment perspectives when
they apply. Express quality concerns as concrete ATAM-style scenarios with a
stimulus, affected concern and observable response; omit inapplicable views
with a reason. Trace actual consumers and cross-boundary handoffs before
recommending removal or consolidation.

Reading every entry point or counting files is inventory evidence only. It does
not prove that interactions work or that defects are absent. A missing host,
unreadable source, skipped command or unexecuted behavior remains an explicit
coverage limit in `research/00-audit.md`.
