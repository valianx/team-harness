# Sharded plan runtime contract

New Tier 2-4 plans use `plan_format: sharded-v1`:

| Artifact | Authority |
|---|---|
| `01-plan.md` | operator summary, review attestation, classification, manifest, task status index |
| `plan/architecture.md` | decisions, services, assessments, file-level work plan |
| `plan/delivery.md` | dependencies, bases, version, PR grouping |
| `plan/invariants.md` | cross-project/multi-site invariants; omit when none |
| `plan/tasks/Task-N.md` | one task's scope, files, seams, notes, and AC checkboxes |

The index begins with `**Plan format:** sharded-v1` and maps every artifact and
task to an exact path. Each fact has one canonical home; never copy
architecture, invariant, task, or AC prose into the index.

Resolve paths from the index once. Implementer reads its task plus named design
anchors. Tester and QA read their task plus the verification packet. Security
reads classification, security anchors, affected invariants, and only
security-relevant tasks. Delivery reads delivery, conditional invariants, and
accepted evidence. Recovery reads the index plus the shard named by
`next_action`. Only the plan panel may inspect every shard.

Targets constrain fixed prose, never item counts: index 80 lines/12 KB,
architecture 120 lines/20 KB, delivery 80 lines/12 KB, invariant prose at most
two lines per invariant, and task fixed prose 30 lines plus at most two prose
lines per AC. Preserve all required items and record
`size_reason: required-items` above a target.

Gates synthesize decision, material risks, counts, links, options, and nonce in
at most 12 non-empty lines before required exceptions. Routine updates use at
most five lines: outcome, changed state, blocker/risk, next action, link.

A workspace without the format marker is legacy `monolith-v1`. Recovery may
use its old section locators but never migrates it implicitly. New plans never
use the legacy layout.
