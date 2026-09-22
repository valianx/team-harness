---
name: ref-pipeline
description: Workflow for coordinated Spec, Implementation, Validation and Publication.
model: opus
color: cyan
---

# Team Harness pipeline

Read the needed phase. Main coordinates under native permissions.
`skills/spec/references/development-phases.md` defines the four phase
contracts; apply `skills/spec/references/lifecycle.md` and keep their view in
the selected workspace plan.

Phases present work; they are not a permission system.
Direct work and `spec` use the same handoffs. Select capabilities for the
objective and stack; record results, not-applicable reasons, pending
prerequisites or declined/deferred effects. Specialist output informs Main; it
does not order corrections or replace the operator.

## Control plane

Retain context in the selected workspace, canonical OpenSpec, task progress and
evidence. No TH permission ledger, lease, nonce or result schema is required.
Existing authorization covers unchanged work; historical helpers do not control
new work.

## Spec

Select or reuse `workspace` (local or Obsidian). Clarify outcome, scope,
preserved behavior and decisions. Author/reuse OpenSpec intent and tasks, run
declared design/testing strategy, and select needed capabilities. Use `sketch`
for previews and `plan-review` for requested advice. Keep `01-plan.md` as a
working summary; continue when implementation is authorized.

## Implementation

Assign dependency-ready tasks with ownership and inputs under
`agents/_shared/dispatch-contract.md`. Independent owners may work concurrently;
serialize overlapping edits and Git mutations. Implementers own tests; extra
testers or cleaners run when useful. Keep progress in the workspace and verify
against the diff and checks.

## Validation

Start from the implemented candidate. Run selected project checks and provider
assessments, including real CRAP when inputs apply, and retain evidence in the
workspace. Use TEA review/trace, OpenSpec verify, Superpowers verification and
independent reviewers as needed. After implementation verification, synchronize
living specs and prepare the completed archive on the delivery branch before
final candidate review. Reuse valid results; renew changed inputs.

Use independent reviewers for relevant quality and risk. Honor requested
coverage, anchor reviews, preserve findings and disclose unavailable coverage.
Main judges recommendations, fixes defects and verifies corrections without
restarting unaffected work.

## Publication

Consume the reviewed candidate, including its completed OpenSpec archive, and
check lifecycle artifact hygiene. Use `create-pr` for authorized preparation
and publication with current checks, findings, pending work and limits. Preserve
unrelated work. Publication does not imply merge, release or installation;
those actions follow scope and native permissions.

Phase changes do not expire authorization or require a new gate reply for
unchanged work. Historical Freeze/Gates helpers and checkpoint names remain
readable for compatibility; they do not control current work.

## Failures

Use `agents/_shared/coordinator-recovery.md`: preserve successful work, diagnose
the cause, repair prerequisites or change approach. Report unresolved
dependencies without inventing evidence or success.

## Recovery

Resolve the workspace through `workspace`; inspect plan, tasks, Git state and
handoff. Historical state/logs may supply evidence. Missing legacy files do not
force closure or migration. Report corrupt records as unverified, continue from
trustworthy sources, and confirm previous writers stopped before reassignment.

## Retained safety floors

Native permissions, safe file handling, preserved unrelated work and honest
validation remain. They are not a second TH execution harness.
