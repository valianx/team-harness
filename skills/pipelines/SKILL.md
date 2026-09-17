---
name: pipelines
description: Show Team Harness task progress and relevant OpenSpec archive status.
---

Read task plans and progress under the configured TH workspace. Use persisted
workspace identities when available and include current or already-bound
repositories' relevant OpenSpec changes. Tasks without legacy `00-state.md`
are valid; report the evidence actually present.

Summarize each task's objective, progress, active ownership where known, last
observed update, unresolved findings and next action. Read native agent status
when available. Missing telemetry or an old timestamp does not prove failure.

Apply [the OpenSpec lifecycle](../spec/references/lifecycle.md) to report archive
candidates, unfinished work and reconciliation needs. Checked tasks alone do not
prove implementation or verification. Include direct spec work even without a
pipeline workspace.

Legacy state, gate fields and control logs may explain historical progress but
are not the current workflow's authority. Use `recover` to continue an
interrupted task. This skill reports status without changing files or starting
work.
