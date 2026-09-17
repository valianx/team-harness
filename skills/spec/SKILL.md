---
name: spec
description: Develop an objective through OpenSpec intent, implementation tasks, focused validation, and adversarial review.
---

Use OpenSpec to make the desired outcome and acceptance clear, then deliver it.
The current general agent coordinates this workflow across Claude Code, Codex
and OpenCode. Read the installed OpenSpec instructions and the relevant
repository conventions. Use [lifecycle](references/lifecycle.md) for authoring,
reconciliation and archive. When a workspace plan, resumption, multi-repository
dependency, or same-candidate review needs concrete routing, read
[coordination](references/coordination.md).

## Frame and plan

Read the affected code, living specs and relevant active changes. Reuse an
existing change when it describes the objective. Write a concise proposal and
tasks; add design and specification deltas where they clarify behavior.
Routine repository chores need no new change directory.

Make the outcome, scope, acceptance scenarios and unresolved decisions visible.
Reuse the operator's authorization to implement; ask only about missing choices
or a material change of scope. Before implementation, run the repository's
pinned OpenSpec validation with `openspec validate <change> --strict` and resolve
invalid intent or scenarios. This checks the specification without adding an
approval step.

A concise workspace plan can link the current intent, tasks, repository paths
and progress. When you create one, use [assets/plan.md](assets/plan.md), use the
read-only workspace helper described in [coordination](references/coordination.md)
when it is available, and preserve the resulting path and canonical `source`
link so `recover` can find it later. If the helper does not fit the repository
layout, record the configured workspace path explicitly. Keep one shared plan
for sequential repositories where helpful; do not create a plan merely to
satisfy the skill. Choose task boundaries by dependencies and ownership, not a
repository count or fixed number of files. Multiple writers can work in
independent scopes using native agent coordination.

## Implement and validate

Implement coherent tasks, preserving unrelated work. Use specialists when their
independence or expertise helps. Maintain tests that exercise the requested
behavior and run relevant repository checks. Record results and limitations
concisely, updating the tasks as the work completes.

Use [author review](references/author-review.md) to challenge assumptions and
look for regressions. Review is especially useful for meaningful behavior
changes; choose lenses according to the actual surface. A committed candidate
can use the same-candidate package from [coordination](references/coordination.md)
when immutable evidence helps, but this remains an advisory option. The
coordinator judges findings, applies worthwhile corrections, and verifies them.
Reviewer verdicts are evidence for that decision, not publication permissions.

## Deliver

Use `create-pr` during candidate preparation and publication whenever a PR is
part of the request. It checks durable files and relevant open specs. Archive
completed and verified changes with their implementation in the same PR through
the shared lifecycle; keep genuinely unfinished work active.

Keep code, living specs and any archive consistent after corrections. Reuse
applicable checks and review results, refreshing the affected evidence when the
candidate changes. Continue with the authorized delivery and report the result,
remaining limitations, and any real decision still needed.
