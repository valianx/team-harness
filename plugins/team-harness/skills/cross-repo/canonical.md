
# Cross-repository contracts

Use this focused analysis for dependencies, producer/consumer contracts,
invariants and failure behavior across repositories. General source exploration
uses [research-code](../research-code/SKILL.md); a comprehensive project audit uses
[full-audit](../full-audit/SKILL.md). Main coordinates with native tools and
permissions. This is diagnostic work and does not authorize product changes,
profile updates, publication or a development pipeline.

## Resolve inputs

Support repository paths with `--context`, or `--profile <name>` with optional
`--flow <name>`. Preserve `--focus security|architecture|quality|business|tests`
(`all` by default), `--output`, `--workspace`, `--no-parallel` and
`--list-profiles`. Relative repository paths resolve from the caller's repository;
use an unambiguous project association when already supplied in context.

Profiles and flow definitions are operator inputs, not a catalog shipped with TH.
Resolve their base from an explicit `--profiles-dir <path>` or known context,
otherwise `<caller-repository>/system-profiles/`. A named profile is
`<base>/<name>/profile.md`; its named flow is `<base>/<name>/flows/<flow>.md`.
Read declared roles, repository paths, invariants, rules and contracts. List mode
reports profiles/flows actually present at that base, or that none are available,
without creating examples. A flow requires a profile. Report exact missing or
unreadable input paths and resolve that material gap before dependent tracing.

Validate targets and retain missing repositories as explicit limits; continue
independent analysis when useful targets remain. Do not fabricate topology or
follow profile references outside the authorized scope. Reuse
[workspace](../workspace/SKILL.md) for the bound context; keep file paths separate.

## Trace the selected question

Use the [coverage method](../audit/references/coverage-method.md) for material
capabilities and [shared findings/evidence](../audit/references/project-audit.md#findings-and-evidence)
for attributable causes, status upgrades and reuse. Connect each relevant entry,
actor, contract, state/data transition, dependency and actual consumer to the
outcome, including meaningful success and failure/recovery behavior.

Compare producer and consumer fields/types/formats, transport and version
assumptions, identity/ownership, ordering/idempotency and dependency-failure
handling where relevant. Validate declared invariants and distinguish expected
from discovered topology. Source inference is not observed integration.

Select native architectural, security, QA or testing advice for distinct bounded
questions within the requested focus. Give each specialist owned repositories
or seams, relevant profile/flow context, current evidence and the common report
destination. Do not multiply a fixed reviewer set by repository count. Use native
slots for independent work, or the same analysis sequentially with `--no-parallel`
or unavailable transport. Preserve useful results and named failure/timeout limits.

## Consolidate and report

When this method contributes to `full-audit`, put its contract evidence and
dispositions in that effort's integral report. Do not create another full audit
or a second principal deliverable.

Honor `--output` (absolute or operational-directory-relative) and `--workspace` file destinations. Otherwise Main retains
the report in the same Page; file modes use `cross-repo/{analysis-slug}/report/00-consolidated.md`.
Keep scope/snapshots/environment, relevant profile/flow context, repository roles,
unique findings, invariant/contract results, failure coverage, topology,
recommendations and limits together. Working per-repository/lens annexes and
`analysis-context.md` are useful only when they support the investigation;
do not require or publish a separate document for every reviewer.

Main consolidates existing evidence rather than rescanning all repositories for
packaging. A bounded architect may compare supplied contract reports when useful.
Reuse attributable unchanged-input evidence, update canonical cause/IDs instead
of summing lens counts, and link observations needed to resolve material gaps.
Preserve the operator's language and requested delivery grouping.

Present the report location, targets/focus, material boundary or invariant findings
and explicit limits. Keep native evidence in declared real local storage. Clean only
run-owned transient scratch after its useful evidence has been retained; never
delete another effort, requested deliverable or linked reproduction.
