---
name: ref-pipeline
description: Workflow reference for coordinated development; not a standalone agent.
model: opus
color: cyan
---

# Coordinated development workflow

Use this workflow when the operator chooses pipeline coordination. The current
general agent owns integration and communication. Native permissions govern
execution; TH contributes planning, ownership, review and continuity.

## Plan

Understand the objective, inspect relevant code and existing OpenSpec work, and
use `spec` to record intent and acceptance. An architect can investigate a
material design question. Keep a concise plan with scope, tasks, dependencies,
repository paths, decisions and validation approach. When the objective spans
repositories, identify the prerequisite first and record the resolved revision,
artifact or contract fixture that consumers must be checked against. Use the
current spec skill's coordination reference for workspace-helper and recorded
plan options when delegation or resumption benefits from a common plan; an
ordinary task needs no plan artifact merely to enter this workflow.

Present decisions the operator actually needs to make. Reuse existing approval
to implement; a stage boundary alone does not create another permission step.
The plan should help the work proceed, rather than duplicate the specs.

## Implement

Choose coherent tasks and assign clear file or module ownership. Parallelize
independent work; coordinate shared-file edits and Git operations so agents do
not overwrite one another. Give specialists the objective, current sources,
constraints, and evidence needed for their task. For sequential repositories,
finish and validate the prerequisite before changing consumers; keep separate
branches and evidence while linking them from the common plan. Use native
agent sessions for continuation instead of TH leases or authority envelopes.

Implementers can own ordinary tests with their changes. Use a separate tester
when independent test design is useful, and a cleaner for concrete cleanup that
improves the delivered diff. The coordinator integrates results and updates
progress.

## Validate and challenge

Compare the implementation against acceptance and run appropriate repository
checks. Record the candidate revision and meaningful outcomes so evidence can
be reused while applicable. A changed candidate needs checks relevant to that
change; an unchanged candidate needs no repeated full run. If the repository
declares a quality manifest, the optional quality runner can execute selected
checks with an explicit `--repo`, workspace, base, candidate and manifest. It
is a deterministic evidence helper, not an implicit Freeze or validation gate.

If a plan includes sketches, reviewers and validators may read the applicable
files and report mismatches. Note missing design evidence when acceptance
depends on it. The optional sketch probe has no current automatic caller.

Ask QA, security, or adversarial reviewers to examine the aspects that benefit
from independent judgment. For a committed candidate, package the exact
revision with the verify review-fan helper when immutable evidence helps; use
the archived OpenSpec reference when the change was archived. Give reviewers
identified evidence and native read-only roles. Preserve findings and coverage
limits. The coordinator weighs the evidence in the full task context, fixes
actual defects, and verifies the corrections. Reviewer recommendations do not
grant or veto publication.

## Deliver

Use `create-pr` to inspect the diff, exclude transient work, reconcile relevant
OpenSpec changes and prepare the PR. Archive completed, verified work on the
implementation branch before delivery so specs and code arrive in the same PR.

Reuse the user's authorization for push, PR or merge as applicable, subject to
native permissions. Review the final candidate and report any material
unresolved risk. After a repair, update the relevant evidence and continue
without recreating internal release records.

## Resume

Keep a short plan or progress note in the configured workspace with repository
and branch, objective, source links, completed work, checks, unresolved findings,
active owners and next step. Preserve its exact path and canonical OpenSpec
source in the handoff. Existing notes and old control logs are historical
evidence. Verify them against the current worktree, commits and available agent
results; they do not grant new authority.

Resume completed work where it remains applicable. Resolve real conflicts or
missing decisions with the operator. A legacy workspace can continue through
this workflow without replaying a control protocol or generating replacement
nonces, leases and release events.
