## Why

The Codex update path spends most of its time orchestrating many sequential no-op inspections and reconciliations after the marketplace snapshot is already current. This makes a routine update materially slower than the equivalent Claude Code flow and obscures the only operator decision that may actually be needed: whether to apply a stale persistent runtime profile.

## What Changes

- Add one bounded post-install convergence operation that inspects, applies, and verifies the Codex-owned installation surfaces in a single pass with one machine-readable receipt.
- Introduce a fast path that skips writes for already-current configuration, features, agents, MCP expectations, hooks, and snapshot bridging while still proving the final installation state.
- Preserve the live approval boundary for persistent runtime-profile changes by returning a concise pending decision that accepts a short affirmative, negative, or natural-language adjustment.
- Keep marketplace version comparison and native plugin replacement authoritative; never downgrade, remove the active snapshot first, weaken sandbox settings, overwrite operator-owned values, or hide partial convergence.
- Replace the current operator-visible chain of helper invocations and repeated final reads with a small fixed update flow and focused recovery from the failed or pending convergence domain.

## Capabilities

### New Capabilities

- `codex-update-convergence`: Defines the bounded, idempotent, receipt-driven update and post-install convergence behavior for Team Harness on Codex.

### Modified Capabilities

None.

## Impact

- Affects the Codex update skill, its packaged plugin copy, setup/update helpers, and update regression tests.
- May consolidate existing configuration, runtime, agent, MCP, hook, feature, and snapshot-bridge checks behind a new update helper or shared library surface.
- Does not activate a Team Harness pipeline, dispatch agents, change Claude Code or OpenCode update behavior, or alter Codex's native plugin installation authority.
