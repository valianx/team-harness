## Why

Team Harness currently derives different workspace identities for the same multi-repository initiative, binds Design to only one repository's OpenSpec change, and has no operational HerdR messaging contract. These gaps cause coordinators to choose the wrong vault location, centralize service-owned specifications, or leave inter-agent messages pasted but unsubmitted until the operator intervenes.

## What Changes

- Define one canonical initiative workspace identity and resolver. In Obsidian mode the coordinator root is `{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}`, and every activation, state, recovery, trace, and pipeline-list consumer derives or reads that same identity instead of composing its own path.
- Replace the singular multi-repository OpenSpec binding with an ordered binding per participating writable service. Each binding preserves the service repository as the source of truth and records its change, schema/tool identities, artifacts, coordinates, hashes, validation result, snapshot, and execution overlay; read-only evidence repositories do not acquire a spec binding.
- **BREAKING** Replace per-project Gate 1 approval for an OpenSpec-bound multi-repository initiative with one consolidated Gate 1 that covers the validated bindings and cross-service execution order. A stale, missing, invalid, or ownership-mismatched required binding blocks the consolidated gate without moving specifications into a reference repository.
- Add a shared optional HerdR operations contract for TH agents: discover with `herdr agent list`, resolve a unique agent and pane, wait or report pending when the target is busy, identify the sender and coordination context, stage text with `herdr agent send`, submit it with `herdr pane send-keys <pane> enter`, and verify delivery with `herdr agent read`.
- Require HerdR dispatch to fail safely on absent CLI, ambiguous identity, pane drift, busy timeout, unsafe content, submission failure, or unverifiable receipt. It must never report success merely because text was staged.
- Update canonical workflow sources, Codex/plugin projections, generated artifacts, lint/generation checks, and focused behavioral tests so the three contracts remain synchronized.

## Capabilities

### New Capabilities

- `herdr-agent-messaging`: Safe, verifiable discovery, send, submit, and receipt handling for coordination with HerdR-managed agents.

### Modified Capabilities

- `workspace-canonical-local`: Define the canonical dated coordinator workspace for a multi-repository initiative and require all workspace consumers to use the persisted identity.
- `openspec-design-orchestration`: Support multiple service-owned OpenSpec bindings, per-binding immutable evidence, and one consolidated multi-repository Gate 1.

## Impact

- Canonical pipeline and initiative contracts under `agents/`, including workspace derivation, state schema, Design, recovery, tracing, and Gate 1 presentation.
- Packaged pipeline, trace, tmux, and background skill references plus their Codex projections and generated copies.
- OpenSpec snapshot, recovery, overlay, state-validation, and workspace-resolution helpers and schemas.
- Tests for canonical workspace identity, multiple OpenSpec bindings and hashes, read-only evidence disposition, consolidated Gate 1 freshness, HerdR idle/busy flows, explicit Enter submission, receipt verification, and projection freshness.
- No new ownership is assigned to `payment-gateway` in the motivating initiative: `merchant-bridge`, `payments-orchestrator`, and `transactions` own independent bindings; `payment-gateway` remains read-only evidence.
