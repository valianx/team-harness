## Context

See proposal.md. The current GCP prompts repeat routing and exact reply rules.
Inline review adds `profile_session` outside the executable package producer,
although loaded-byte attestation is not available from every host.

## Decisions

- Keep the GCP planning artifacts and domain-specific validation. Centralize
  authorization meaning in docs/gcp-infra.md and use natural unambiguous scope,
  with no nested coordinator or prescribed reply string.
- Retain independent QA/security advice and have Main resolve concrete findings.
- Remove the loaded-profile marker prerequisite only. Keep selected installed
  role integrity, native read-only capability, immutable Git evidence and honest
  coverage. Disk integrity is not an assertion about loaded memory.
- Keep the existing pipeline ownership, immutable inputs and recovery machinery:
  its executable consumers still depend on those contracts. Do not replace it
  based only on similarity to a native harness.
- Reconcile historical deltas against newer delivered requirements before
  upstream archive. Record execution evidence outside tracked product files;
  never relabel an unfinished benchmark as completed.
- Retain benchmark fixtures and measurement guidance. Remove the OpenSpec scope
  check's unrelated baseline-table requirement; an optional measurement records
  anchors, comparable metrics and limits in the workspace. Retire the old task
  explicitly without reporting any live pipeline run.

## Risks / Trade-offs

- Natural approval may be ambiguous: ask only about missing project, effect or
  destructive consequence, after preparing the reviewable plan.
- Loaded agent bytes may be unknown: preserve that limitation and rely on the
  exposed native role boundary, not a fabricated activation claim.
- Old spec deltas can overwrite newer behavior: compare requirement blocks and
  keep the current delivered behavior before each archive operation.

## Migration

Regenerate the Claude/Codex/OpenCode distributions and ship the archived change
with the implementation. No runtime permission migration or cloud apply occurs.
