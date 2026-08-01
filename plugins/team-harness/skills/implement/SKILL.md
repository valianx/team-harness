---
name: implement
description: Continue implementation of an explicitly activated and Stage-Gate-1-approved Team Harness pipeline. This skill does not activate the pipeline; without active Team Harness state, implement directly with normal Codex behavior.
---

# Implement

Locate state whose `activation` is `explicit`. If none exists, do not create
pipeline state or gates; read `../init/references/configuration.md`, resolve the
persistent settings, and continue the user's ordinary Codex implementation.

For an active pipeline, read
`../pipeline/references/state-and-gates.md` and
`../pipeline/references/implementation.md`. Require the dual-record Gate 1
release, execute approved dependency rounds, and leave validation to the
validation phase. The primary thread remains the state owner and never delegates
gate approval.
