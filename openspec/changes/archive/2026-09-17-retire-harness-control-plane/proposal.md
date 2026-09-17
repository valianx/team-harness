## Why

Team Harness still described an internal execution control plane and permission
hooks that duplicate the native boundaries provided by Claude Code, Codex and
OpenCode. Those contracts made review output look like authority, caused
restart and readiness loops, and left the living OpenSpec requirements ahead of
the shipped workflow. The useful behavior is a small workflow layer that makes
intent, available skills and evidence visible while the native runtime remains
in charge of execution.

## What Changes

- Retire the TH-owned control-plane, nonce, lease, gate and permission-hook
  requirements from the current workflow contracts.
- Keep OpenSpec as written intent and keep `spec`, `pipeline`, `review-pr`,
  `create-pr` and `modes` discoverable to the native general agent.
- Treat specialist and review returns as evidence and recommendations. Main
  evaluates them with the full task context and chooses the next action.
- Keep author-side PR comment handling in one proportional evaluation guide,
  without a mandatory per-comment ledger or a separate orchestration protocol.
- Preserve native permission and sandbox boundaries, normal PR authorization,
  anchored review evidence, and opt-in telemetry without making telemetry a
  prerequisite.
- Make update and reload report a restart only when the active native runtime
  actually requires one; unchanged configuration does not create a restart
  request.

## Capabilities

### New Capabilities

- `native-workflow-discovery`: native-agent discovery of Team Harness workflows
  without replacing runtime behavior or authority.

### Modified Capabilities

- `agent-authoring-standard`
- `contract-right-sizing`
- `design-single-pass`
- `freeze-quality-run`
- `herdr-agent-messaging`
- `lane-routing-predicate`
- `operator-response-normalization`
- `pr-review-independence` (strict-validation wording only)
- `quality-runner-diagnostics`
- `validation-convergence`
- `workspace-canonical-local`
- `pipeline-control-plane`
- `specialist-coordination-protocol`
- `gate-single-approve-autonomy`
- `guided-lane-verification`
- `security-classification-floor`
- `spec-direct-lane`
- `openspec-design-orchestration`
- `openspec-archive-lifecycle`
- `codex-runtime-parity`
- `codex-update-convergence`

## Impact

Current OpenSpec living specs, workflow guidance, review classification and
Codex update/reload behavior. Existing archived changes remain historical and
are not rewritten or re-applied.

## Non-Goals

- Removing native runtime permissions, sandboxing, account approval or GitHub
  authorization.
- Deleting OpenSpec history, active changes or temporary evidence outside the
  maintained workflow sources.
- Adding another gate, control log, lease protocol, global setting policy or
  mandatory review lens.
