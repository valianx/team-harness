## Why

Small spec efforts spend disproportionate time rebuilding context and coordinating
reviewers. One completed hotfix needed 84 minutes to reach a PR despite a 12-second
test suite; a local review spent 19 minutes identifying an evidence omission.
The workflow should reuse completed work and give reviewers the question and
evidence they need without duplicating native runtime controls.

## What Changes

- Resume spec from existing intent, implementation and valid evidence; use the
  principal for provider methods and routine checks.
- Keep one independent review per selected question, with concise context and
  test outcomes including relevant skips supplied before dispatch.
- Simplify inline review instructions: native read-only roles, anchored commits,
  targeted inspection and honest coverage replace repeated manual attestations
  and mandatory fallback execution chains.
- Preserve original findings, complete relevant repairs and continue authorized
  delivery without restarting unaffected stages.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `spec-direct-lane`: adopt existing work and avoid provider-by-provider agents.
- `guided-lane-verification`: bounded review preparation and recovery.
- `codex-runtime-parity`: rely on native reviewer capability rather than repeated
  byte-level profile attestation.

## Impact

Spec, validation and inline-review guidance; Claude and Codex role instructions;
generated distributions, documentation and release metadata. Existing helper
package/summary formats and model defaults stay compatible.

## Non-Goals

Replace OpenSpec or upstream testing methods; change external PR-review behavior;
add a timer, telemetry, gate, automatic model selection or another workflow.
