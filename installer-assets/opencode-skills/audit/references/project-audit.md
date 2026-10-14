# Project audit applicability and consolidation

Use with the [coverage method](coverage-method.md) for a full project audit or
the relevant assigned diagnostic question. Keep one effort and existing report;
this method introduces no separate state, index file or orchestration engine.

## Select meaningful coverage

Establish project/repository grouping, snapshots/configuration/dependencies,
available environments, critical user/system capabilities, emphasis and delivery
at intake. Assess these dimensions; risk determines depth, tools and scenarios.

| Dimension | Pertinent questions |
|---|---|
| Product and threats | Actors, rules/invariants, assets/trust boundaries, replay, concurrency, skipped steps and abuse. |
| Architecture and contracts | Responsibilities, actual consumers, APIs/events/webhooks and repository/dependency success/failure handoffs. |
| Security | Applicable versioned controls, identity/session recovery/revocation, object/property/function authorization, tenant isolation, secrets/media and resource abuse. |
| Data and privacy | Quality/loading, schema/migrations, transactions, ownership/concurrency, collection/retention/export/erasure, logs/files/backups and third parties. |
| Functional QA | Oracles/effective coverage, persistence/readback, critical journeys by role, invalid/error states, dependency failure, compensation/idempotency and recovery. |
| UI/UX and accessibility | Critical tasks and states, keyboard/focus/forms, manual/automated accessibility, relevant assistive technology, responsive/browser/device and i18n. |
| Performance and efficiency | Queries/projections/pagination, cache freshness/isolation, requests/bundles/media, CPU/memory/concurrency, representative load and field/lab experience. |
| Infrastructure and operations | Declared/effective topology, actual-provider IAM/network/limits, pools/ephemeral state, jobs/queues/sockets/restarts/draining, monitoring/SLOs and backup/restore with defined RPO/RTO. |
| Supply chain and delivery | Dependencies/runtime lifecycle, CI permissions/trust, release commit/build/digest, SBOM/provenance and observable published/deployed artifacts. |
| Maintainability | Boundaries/contracts, runbooks/documentation, supported dependencies and vulnerability closure; licenses, safety or AI-specific risks when relevant. |

Connect material journeys to actors, entry, contracts, state/data, dependencies,
consumers and expected results, with meaningful success and failure/recovery
scenarios. Give relevant seams an inspection owner. Record `observed`, `inferred`,
`unverified` or `not applicable` with evidence or a reason. A service without UI
needs no fictional screens; missing auth/DB/cloud access does not remove its
relevant journeys. IaC is not effective deployed configuration. Use maintained
primary sources and actual-provider guidance, recording versions when material;
do not vendor standards or interpret references as universal tool quotas.

## Findings and evidence

Maintain a minimal finding record within the report: canonical cause/ID, affected
repositories/locations, actor/preconditions/trigger, expected versus actual effect,
impact, severity, priority, confidence, status and lens/evidence references, targeted
improvement and closure check. Link multiple occurrences to one supported cause;
keep distinct mechanisms distinct. Upgrade an existing observation's status/ID
when confirmed without increasing the unique count. Preserve conflicting advice
and Main's reasoned acceptance, refutation or deferral.

Bind evidence to its question, source snapshot, dependency/configuration and
environment. Identify real modules/services versus fixtures, mocks or protocol
stubs, the mounted entry/integration boundary, command/oracle and observed effect.
A successful defect reproduction is not a passed product regression; isolated
middleware does not prove its full router. Preserve units, dataset/load and
conditions: elapsed duration is not CPU; field performance is distinct from lab
diagnostics and expert usability hypotheses from participant observations.
Keep skipped files, parser errors and tool/credential limits visible. A clean
scanner, screenshot or partial fixture supports only its actual evidence scope.

Reuse attributable evidence while its relevant inputs and question still apply.
Changed inputs renew affected/dependent analysis; a new phase, reviewer or format
alone does not require rerunning valid checks. Preserve completed independent
work when a specialist fails and state the smallest missing observation.

## One useful report

For `full-audit`, write one `00-full-audit.md`: decision summary, scope/snapshots/
environments, topology and boundary contracts, unique findings, per-repository
context, coverage/evidence/limits and prioritized improvements/optimizations.
For each proposal retain expected behavior, dependencies/order, relative effort,
tradeoffs and verifiable closure criteria. Do not invent tariffs or savings.
Link actual command outputs, reproductions, measurements and captures in the
same workspace; retain useful annexes without duplicate principal publications.
Respect an explicitly requested grouping or format.

Check claim fidelity, causal counts/status upgrades, applicable coverage limits,
proposal dependencies and link/content preservation before delivery. Reuse adequate
independent coverage; packaging is not another whole audit. Requested external
delivery follows the [artifact delivery method](../../write-documents/references/delivery.md).
Report completed investigation separately from unverified controls or pending
external access, without claiming certification or global compliance.
