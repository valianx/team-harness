---
name: pipeline
description: Coordinate a development objective through planning, implementation, independent review, and delivery when the operator chooses the pipeline.
---

The operator has chosen coordinated development for $ARGUMENTS. Keep the
current general agent as coordinator and use native tools and specialist roles.
Read [the workflow](../../agents/ref-pipeline.md) for the stages.

Start from the user's objective and existing authorization. Make the intended
outcome, scope, decisions and acceptance evidence clear. Reuse `spec` for
written intent and lifecycle, and `create-pr` for candidate preparation and
publication. Reviewers advise the coordinator; they do not authorize delivery.

Use a concise workspace plan to track progress and resume interruptions.
A pipeline does not alter the runtime's native permissions or settings.

Use Codex-native tools and available agents. Read TH preferences from
`${CODEX_HOME:-$HOME/.codex}/.team-harness.json` only when relevant; absence
uses ordinary defaults. Native permissions and user settings remain in effect.
