---
name: background
description: Dispatch a bounded task through opencode's native subtask capability and report its handle and result.
---

# Background work in opencode

Use only after an explicit operator request. Reject tasks that require live
interactive gates, secrets, or an outward write. Dispatch one bounded subtask
through opencode's native agent/task mechanism when available; never invoke the
`claude` or `codex` binaries. If the host exposes no background mechanism,
state that limitation and offer to complete the task in the current session.

Report the task scope, agent, status, and how the operator can retrieve the
result. Background completion never authorizes a publish, deploy, merge, or
other outward mutation.
