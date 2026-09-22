---
name: ref-pipeline
description: Workflow for coordinated Spec, Implementation, Validation and Publication.
model: opus
color: cyan
---

# Team Harness pipeline

Read only the phase needed. Main coordinates under native permissions. The
shared `skills/spec/references/development-phases.md` reference defines the
expected inputs, work, outputs and evidence for the four visible phases: Spec,
Implementation, Validation and Publication. Apply
`skills/spec/references/lifecycle.md` for OpenSpec and keep the phase view in
the selected workspace plan.

The four phases are a way to present the work, not a second permission system
or a requirement to activate this pipeline. Existing direct work and the
selected `spec` flow can use the same handoffs. Each capability is selected for
the objective and stack, then recorded as executed with its result, not
applicable with a reason, pending with its missing prerequisite, or declined
or deferred with its effect. Specialist output is evidence for Main; it does
not order a correction or replace the operator's decision.

## Control plane

Retain context in the selected workspace, canonical OpenSpec, task progress and
relevant evidence. No TH permission ledger, lease, nonce or result schema is
required. Existing authorization remains valid for unchanged work. Historical
v5 helpers inspect old records; they do not control new work.

## Spec

Select or reuse the workspace through `workspace`, including local or Obsidian
mode and existing initiative/milestone context. Clarify the outcome, scope,
preserved behavior and material decisions. Author or reuse OpenSpec intent and
tasks, run the declared design and testing-strategy work, and choose the
additional capabilities that the objective needs. Use `sketch` when preview
helps and `plan-review` for requested independent advice.

Keep a concise `01-plan.md` linking canonical intent and tasks. It is a working
summary, not an authority record. Continue when implementation is already
authorized; ask only for a genuinely unresolved design decision.

## Implementation

Assign coherent dependency-ready tasks with explicit ownership and relevant
inputs under `agents/_shared/dispatch-contract.md`. Independent owners may
work concurrently; serialize overlapping edits and Git mutations. Implementers
own ordinary tests. Additional testers and cleaners run when useful.

Keep task progress and decisions in the same workspace. Verify results against
the actual diff and checks before integrating. Continue useful sessions with
delta context instead of another handshake.

## Validation

Start from the implemented candidate and focused tests. Run the selected
project checks and provider assessments, including the real CRAP diagnostic
when its inputs apply, and retain their actual scope, result and evidence in
the workspace. Use TEA review/trace, OpenSpec implementation verification,
Superpowers completion verification and independent reviewers according to
the current objective and existing review decision. After implementation
verification, synchronize living specs and prepare the completed archive on
the delivery branch before final candidate review. Reuse valid results;
renew only evidence whose inputs changed.

Use independent reviewers for quality and relevant risk areas. Honor requested
coverage; choose further expertise through judgment, not a classifier floor.
Anchor reviews to the candidate, preserve all findings and disclose unavailable
coverage. Main judges recommendations, fixes real defects and verifies corrections.
Review a changed surface as needed without restarting unaffected work.

## Publication

Consume the reviewed delivery candidate, including its completed OpenSpec
archive, and check artifact hygiene under the lifecycle. Use `create-pr` for
preparation and authorized publication, including current checks, review
findings, pending work and limits. Use the intended account and preserve
unrelated work. Publication does not imply merge, release or installation;
those actions follow the requested scope and native permissions.

Phase changes do not expire existing authorization and do not require a new
gate reply for unchanged work. Historical Freeze/Gates helpers and checkpoint
names remain readable for old records and technical compatibility, but they do
not control current work.

## Failures

Use `agents/_shared/coordinator-recovery.md`: preserve successful work, diagnose
the concrete cause, repair prerequisites or change approach. Report a real
unresolved dependency without inventing evidence or success.

## Recovery

Resolve the exact workspace through `workspace`; inspect the plan, tasks, Git
state and handoff. Historical state/logs may supply evidence. Missing legacy
files do not force closure or migration. Report corrupt records as unverified
and continue from trustworthy sources where possible. Confirm previous writers
stopped before reassigning overlapping files.

## Retained safety floors

Native permissions, safe file handling, preserved unrelated work and honest
validation remain. They are not a second TH execution harness.
