---
name: recover
description: Resume an explicitly activated Team Harness pipeline from durable workspace state without replaying completed phases. Use only for pipeline recovery; ordinary Codex work remains direct when no active state exists.
---

# Recover

Read `../pipeline/references/state-and-gates.md` and
`../pipeline/references/recovery.md`. The primary thread performs recovery and
remains the sole coordination-state writer and gate presenter. If no explicit
pipeline state exists, report that there is nothing to recover; do not create a
pipeline implicitly.
