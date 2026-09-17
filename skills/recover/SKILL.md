---
name: recover
description: Resume an interrupted Team Harness task using its saved intent, progress and the current repository.
---

Resolve the workspace or task named by $ARGUMENTS. Read its plan, source links,
progress, checks and available results. Preserve the exact plan path and
canonical OpenSpec source when handing the task back. Compare the saved
repository, branch and revision with the current worktree before continuing.

Treat legacy state and control logs as historical evidence. Preserve completed
work and useful context; resumption needs no control-log replay, nonce, lease
or administrative close. Clarify only real conflicting facts or missing scope.

Continue the authorized objective through its current `spec` or `pipeline`
workflow. If a multi-repository plan exists, verify each repository's saved
reference and dependency evidence before adapting consumers. If work is already
complete, report the result and remaining delivery steps. Keep notes concise
and native permissions in effect.
