---
name: design
description: Design a solution and acceptance approach for the requested objective.
---

Handle $ARGUMENTS in the current general agent.

Read the relevant code, existing specs and constraints. Explain the proposed approach,
alternatives, acceptance scenarios and material decisions. Use an architect when
independent design work helps. Reuse existing authorization and ask only for
missing decisions. Use spec for written intent and pipeline when already selected.

Use Codex-native tools and available agents. Read TH preferences from
`${CODEX_HOME:-$HOME/.codex}/.team-harness.json` only when relevant; absence
uses ordinary defaults. Native permissions and user settings remain in effect.
