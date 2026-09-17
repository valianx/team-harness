---
name: ref-dispatch-machinery
description: Guidance for coordinating work across repositories; not a standalone agent.
model: opus
color: cyan
---

# Multi-repository coordination

Identify each repository, its branch/worktree, role in the objective and
dependencies. Reuse existing workspace links; a concise overview can record
shared decisions and delivery order without duplicating every task or spec.

Delegate independent work with clear ownership. Coordinate shared resources and
Git operations and integrate results before dependent work begins. Sequential
execution is useful for dependent repositories; native parallel agents can help
with independent ones.

Keep source paths and evidence attributable to the correct repository. The
general agent owns the combined result, applies review findings in context, and
uses create-pr for each authorized delivery.
