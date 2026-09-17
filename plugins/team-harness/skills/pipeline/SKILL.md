---
name: pipeline
description: Coordinate a development objective through planning, implementation, independent review, and delivery when the operator chooses the pipeline.
---

The operator has chosen coordinated development for $ARGUMENTS. Keep the
current general agent as coordinator and use native tools and specialist roles.
Read [the workflow](../../agents/ref-pipeline.md) for the stages and use
the packaged `spec` skill for OpenSpec intent, plans and archive lifecycle.

Start from the user's objective and existing authorization. Make the intended
outcome, scope, decisions and acceptance evidence clear. Reuse `spec` for
written intent and lifecycle, and `create-pr` for candidate preparation and
publication. Reviewers advise the coordinator; they do not authorize delivery.

Use the stages as a practical coordination outline: plan only the decisions
and dependencies that matter, implement coherent tasks with clear ownership,
validate the delivered behavior against the intent and relevant repository
checks, then prepare delivery. When repositories depend on one another, finish
and validate the prerequisite against an exact branch, revision, artifact or
contract fixture before adapting consumers. Keep one shared plan with
per-repository evidence when that improves resumption; do not create pipeline
artifacts just to enter a stage.

Use a concise workspace plan to track progress and resume interruptions. If
sketches or the deterministic quality runner are useful for this objective,
use them as optional evidence according to their current references; their
absence does not imply a failed pipeline and `validate` does not invoke them
automatically. A pipeline does not alter the runtime's native permissions or
settings.

Use Codex-native tools and available agents. Read TH preferences from
`${CODEX_HOME:-$HOME/.codex}/.team-harness.json` only when relevant; absence
uses ordinary defaults. Native permissions and user settings remain in effect.
