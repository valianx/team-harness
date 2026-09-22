# How it works

Team Harness supplies a way of working to Claude Code, Codex and OpenCode.
The native general agent remains the coordinator; its host provides permissions,
execution, sandboxing, sessions and approvals.

## Entry point: choose a workflow with your general agent

Read the currently installed skill. Use `spec` for written intent and tasks,
`pipeline` when broader coordination helps, `review-pr` for reviewing an
existing PR and `create-pr` for preparation/publication. A PR URL alone does
not distinguish reviewing, resolving comments or merging; the request does.

## The four development phases

Spec → Implementation → Validation → Publication is the shared way to present
development work. Read the [phase reference](../skills/spec/references/development-phases.md)
for the expected inputs, selected tools, outputs and evidence. Existing skills
perform the work; the phases do not add a second permission system or force the
`pipeline` workflow.

Spec records intent, tasks, testing strategy and the workspace plan. Implementation
produces the product changes and maintained tests. Validation runs the selected
checks, provider assessments and reviews, preserving their scope and limits.
Publication prepares the archive and artifact hygiene, then performs the
authorized `create-pr` action. The coordinator can stop at a requested endpoint
or resume a later phase from the existing workspace and canonical tasks.

The broader pipeline is one way to coordinate this sequence. Reuse approved
decisions, clarify only missing choices or changed effects, and delegate
independent tasks with explicit ownership when that improves the work.

## Other pipelines

Research, docs, test-pipeline, audit, learning and diagrams remain available
through their skills. Read only the flow needed. They share the workspace method.

## Bug-fix flow (type: fix and type: hotfix)

Reproduce or gather evidence, establish the cause, apply a focused correction and
verify the affected property. Severity informs investigation; it does not select
an authorization lane.

## Resume any time

Use `resume-session` for a read-only brief and `recover` to continue.
Plans, OpenSpec tasks, handoffs and actual Git state supply context. Missing
historical control logs do not force closure. Existing records remain readable.

## What the workflow contributes

Written intent, coherent tasks, specialist expertise, independent review and
delivery hygiene. Reviewers recommend from partial context; Main evaluates the
evidence, verifies corrections and continues the authorized objective.

## What ships

Skills, role contracts, native adapters, optional observational hooks and
installation tools. Workspace notes use Markdown in the chosen local or
Obsidian home. Database changes always get a data model and frontend work a
wireframe before implementation; other sketches remain on demand. Voice/language preferences
remain native settings. Remote memory is optional and is never required by a flow.

## Native coordination and execution boundaries

TH does not replace the native general agent or require leases, gate nonces,
control journals or security-classification permissions. Existing v5 helpers
are retained for compatibility with historical records and receipts.

## Verification

Run checks appropriate to the behavior and repository requirements. Review the
candidate independently, preserve findings and coverage limits, and verify real
fixes. Archive completed OpenSpec changes in the same implementation PR.
