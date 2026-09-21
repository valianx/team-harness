---
name: ref-pipeline
description: Workflow for coordinated design, implementation, validation and delivery.
model: opus
color: cyan
---

# Team Harness pipeline

Read only the phase needed. Main coordinates under native permissions.
Work proceeds through design, implementation, validation and delivery, with
iteration when evidence calls for it. Apply
`skills/spec/references/lifecycle.md` for OpenSpec.

## Control plane

Retain context in the selected workspace, canonical OpenSpec, task progress and
relevant evidence. No TH permission ledger, lease, nonce or result schema is
required. Existing authorization remains valid for unchanged work. Historical
v5 helpers inspect old records; they do not control new work.

## Design

Select or reuse the workspace through `workspace`, including local or Obsidian
mode and existing initiative/milestone context. Clarify the outcome, scope,
preserved behavior and material decisions. Reuse suitable OpenSpec artifacts;
author or delegate missing design work within repository scope limits.

Keep a concise `01-plan.md` linking canonical intent and tasks. It is a working
summary, not an authority record. Use `sketch` when preview helps, and
`plan-review` for requested independent advice. Continue when implementation
is already authorized; ask only for a genuinely unresolved design decision.

## Implementation

Assign coherent dependency-ready tasks with explicit ownership and relevant
inputs under `agents/_shared/dispatch-contract.md`. Independent owners may
work concurrently; serialize overlapping edits and Git mutations. Implementers
own ordinary tests. Additional testers and cleaners run when useful.

Keep task progress and decisions in the same workspace. Verify results against
the actual diff and checks before integrating. Continue useful sessions with
delta context instead of another handshake.

## Freeze and validation

Prepare a reviewable candidate, including completed OpenSpec archive in its
delivery branch. Run proportionate checks and repository requirements. Reuse
valid results; repeat when changes or unresolved concerns justify it.

Use independent reviewers for quality and relevant risk areas. Honor requested
coverage; choose further expertise through judgment, not a classifier floor.
Anchor reviews to the candidate, preserve all findings and disclose unavailable
coverage. Main judges recommendations, fixes real defects and verifies corrections.
Review a changed surface as needed without restarting unaffected work.

## Gates and delivery

Checkpoints resolve real decisions. Existing approval does not expire when a
phase changes. Do not request Gate 1/Gate 3 replies or tokens for a clear decision.
Use `create-pr` for preparation and authorized publication, including checks,
review findings and limits. Use the intended account and preserve unrelated work.
Merge, release and installation follow requested scope and native permissions.

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
