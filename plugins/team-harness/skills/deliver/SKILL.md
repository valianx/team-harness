---
name: deliver
description: Continue local delivery preparation for an accepted, explicitly activated Team Harness pipeline while preserving the final outward-action gate. This skill does not activate the pipeline; without active Team Harness state, use normal direct Codex behavior.
---

# Deliver

Locate state whose `activation` is `explicit`. If none exists, do not create
pipeline state or gates; continue in ordinary direct mode and obey normal
runtime approvals.

For an active pipeline, read
`../pipeline/references/state-and-gates.md` and
`../pipeline/references/delivery.md`. Require passing acceptance evidence and
preserve `STAGE-GATE-3` before every previewed outward action. An earlier
autonomous grant does not release this final gate.
