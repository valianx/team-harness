---
name: trace
description: Show available task progress, evidence, optional telemetry, and OpenSpec completion or retirement status.
---

Read the task named by $ARGUMENTS from the current repository and configured TH
workspace. Use the persisted workspace identity when present; otherwise resolve
the plan or task directory from existing sources. Clarify ambiguous matches.

Summarize the objective, current progress, relevant checks, findings and next
step. Apply [the shared lifecycle](../spec/references/lifecycle.md) to report
relevant OpenSpec archive disposition, including spec work without a pipeline.

For `--jsonl`, `--tools`, `--fails`, or `--tokens` (`--cost` legacy
alias), inspect available event or trace files and explain the requested data.
Optional telemetry may be absent; report unknown values rather than inferring
zero usage or a broken workflow.

This is read-only status. Old control logs and state files are historical
evidence, not authority. Do not create state or change archive status while
reporting it.
