---
name: validate
description: Continue validation for an explicitly activated Team Harness pipeline using tester, QA, and security roles as required. This skill does not activate the pipeline; without active Team Harness state, validate directly with normal Codex behavior.
---

# Validate

Locate state whose `activation` is `explicit`. If none exists, do not create
pipeline state or gates; read `../init/references/configuration.md`, resolve the
persistent settings, and continue the user's ordinary Codex validation.

For an active pipeline, read
`../pipeline/references/state-and-gates.md` and
`../pipeline/references/validation.md`. The primary thread consolidates results
and owns all coordination-state writes. Do not modify acceptance criteria to
turn a failure into a pass.
