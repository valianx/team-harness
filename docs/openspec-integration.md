# OpenSpec integration

OpenSpec records product intent and acceptance for TH development. `spec` is
the usual workflow; `pipeline` uses the same lifecycle when broader coordination
is chosen. Both use upstream OpenSpec artifacts and validation.

Read relevant living specs and active changes before adding new intent. Reuse
existing work; write a concise proposal and tasks, with design and deltas where
they clarify observable behavior. Repository chores need no new change merely
because delivery will use a PR.

Implement coherent tasks and verify acceptance. Independent reviewers challenge
assumptions and provide findings and coverage limits. The coordinator weighs
those findings, verifies corrections and continues the authorized work.

Use [the shared lifecycle](../skills/spec/references/lifecycle.md) during PR
preparation. Completed, verified changes are archived on the implementation
branch with updated living specs in the same PR. Keep incomplete changes active,
reconcile contradictions, and avoid archiving unrelated work.

Archive preserves canonical intent history; it does not make execution logs,
screenshots, review transcripts or scratch scripts durable product files.
Keep those in permitted temporary or configured workspace storage.
