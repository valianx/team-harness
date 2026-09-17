---
name: init
description: Frame a task with Team Harness and select a useful workflow without starting a pipeline.
---

Handle $ARGUMENTS in the current general agent. Establish the desired outcome,
constraints and useful next step; reuse context and ask only for material
missing information.

Use `spec` when written intent and tasks help development, `pipeline` when
the operator chooses broader coordination, `review-pr` for an existing PR,
and `create-pr` for preparation or publication. The native skill catalog and
`modes` expose the full set. Read the selected skill's current instructions.

Complete straightforward work directly. Delegate a bounded independent task
when useful and consistent with the user's preferences. Invoking init alone
creates no workspace or pipeline state.

Use clear, neutral language and the user's preferred level of detail. TH adds
workflow guidance; native agent identity, permissions and settings continue.

Use Codex-native tools and available agents. Read TH preferences from
`${CODEX_HOME:-$HOME/.codex}/.team-harness.json` only when relevant; absence
uses ordinary defaults. Native permissions and user settings remain in effect.
Read [the general agent guide](../setup/references/general-agent-guide.md)
for workflow discovery and voice defaults.
