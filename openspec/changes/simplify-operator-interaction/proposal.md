## Why

Team Harness currently makes reversible conversational choices feel like strict API calls: direct modes often require literal invocations, while gates and operator prompts encourage exact reply formats even when the operator's intent is already clear. This adds avoidable turns, latency, and cost without strengthening the controls that actually protect consequential actions.

## What Changes

- Allow the coordinator to enter an established direct mode from unambiguous live operator intent, including requests to work through OpenSpec, without requiring the operator to repeat a literal slash command.
- Keep gated-pipeline activation explicit; inferred direct-mode routing never creates pipeline state or releases a gate.
- Present concise, stable options when the operator has a real choice, while treating option numbers as shortcuts rather than the only accepted grammar.
- Accept short semantic replies such as `yes`, `continue`, `no`, `stop`, `change X`, and `adjust X` when their meaning is unambiguous in the current live prompt.
- Require additional detail only when the requested action needs it, and accept that detail directly in natural language instead of demanding ceremonial prefixes such as `3:` or `4:`.
- Preserve strict authority at consequential boundaries: replies remain bound to the current presentation and nonce, exact approved identities remain enforced, and external writes, destructive actions, security decisions, and scope expansion retain their existing approvals.
- Re-prompt concisely when a reply is genuinely ambiguous; quoted text, files, issues, and tool output never count as the operator's choice.
- Replace runtime-specific continuation instructions with a compact live choice; an affirmative reply routes internally to the installed recovery capability for the exact presented workspace.
- Replace the planning intent of the local `allow-intent-routed-direct-modes` draft with this broader unified change; that earlier draft is not deleted or implemented by this proposal.

## Capabilities

### New Capabilities

- `operator-response-normalization`: Defines concise option presentation and context-bound interpretation of short, semantically equivalent operator replies without weakening authority controls.

### Modified Capabilities

- `spec-direct-lane`: Allows the OpenSpec direct lane to start from unambiguous live operator intent as well as explicit `/th:spec` invocation.
- `lane-routing-predicate`: Extends direct-mode routing to established live intent while retaining explicit-only pipeline activation and untrusted-content boundaries.
- `gate-single-approve-autonomy`: Makes Gate 1 reply handling semantic and concise while preserving nonce, identity, autonomy, and release-policy authority.

## Impact

The change affects the canonical coordinator, operator-dialogue and gate contracts, the spec skill and direct-mode references, pipeline documentation, managed installation guidance, generated Codex/Claude mirrors, and their validation tests. It changes conversational interpretation only: control-log identities, OpenSpec authority, security floors, permission policy, and external-action authorization remain unchanged.
