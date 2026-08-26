## Why

Team Harness currently derives different workspace identities for the same multi-repository initiative, binds Design to only one repository's OpenSpec change, and has no operational HerdR messaging contract. These gaps cause coordinators to choose the wrong vault location, centralize service-owned specifications, or leave inter-agent messages pasted but unsubmitted until the operator intervenes.

## What Changes

- Define one canonical initiative workspace identity and resolver. In Obsidian mode the coordinator root is `{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}`, and every activation, state, recovery, trace, and pipeline-list consumer derives or reads that same identity instead of composing its own path.
- Replace the singular multi-repository OpenSpec binding with an ordered binding per participating writable service. Each binding preserves the service repository as the source of truth and records its change, schema/tool identities, artifacts, coordinates, hashes, validation result, snapshot, and execution overlay; read-only evidence repositories do not acquire a spec binding.
- **BREAKING** Replace per-project Gate 1 approval for an OpenSpec-bound multi-repository initiative with one consolidated Gate 1 that covers the validated bindings and cross-service execution order. A stale, missing, invalid, or ownership-mismatched required binding blocks the consolidated gate without moving specifications into a reference repository.
- **BREAKING** Replace permissive OpenSpec derivation scaffolds with overlay v2. The planning architect authors one closed execution-contract JSON block in canonical `tasks.md`; derivation validates and projects real worktree/base, files, dependencies, invariants, evidence, discovery scope, seams, quality argv, pre-test applicability, preservation, and rollback, and materializes a hash-bound workspace quality manifest. Missing or placeholder judgment blocks Gate 1.
- Preserve an already released consolidated Gate 1 when implementation preflight proves that only derived OpenSpec workspace artifacts are missing or damaged: regenerate them transactionally from unchanged snapshot-bound canonical intent, require the rebuilt overlay bytes to match the approved binding hash, rerun validation, and record reproducible repair evidence. Missing canonical execution judgment, source drift, an overlay-hash change, or any prior implementation dispatch remains fail-closed and is not auto-repairable.
- Add an explicit legacy-v1 migration certificate for workspaces whose approved overlay was itself a placeholder and therefore cannot be reproduced byte-for-byte. A live operator-authorized repair may append a non-normative execution-contract extension, recapture valid v2 derived artifacts, and preserve the original Gate record through a hash chain from the approved aggregate to the current aggregate, but only when exact normative task prefixes are unchanged and the authorization/repair occurred before the first implementation dispatch.
- Make aggregate implementation freshness binding-local: a service receiving an authorized checkbox transition validates that transition, an untouched service validates against its pre-Gate snapshot, and a previously progressed service revalidates its last durable progress event without borrowing another service's authorization.
- Replace indefinite implementation-or-later specialist waiting with a deterministic liveness lease: one token-bound probe, one possible lease renewal, interruption before declared-path audit, and at most one clean fresh same-role replacement. Partial progress or a second silent attempt blocks; Main never takes over the specialist role.
- Close the derived-artifact dispatch race with one atomic per-service lock and a permanent dispatch binding over the exact plan, quality manifest, and shard hashes. Repair and sealing cannot overlap; after sealing, repair is permanently ineligible and every fresh specialist dispatch must verify the same binding.
- Make persisted bounded-command receipts executable as written, surface wrapper and child failures through a non-zero process status, and require recovery to validate the receipt fields before claiming evidence.
- Keep pre-implementation tests inside the current shard boundary and require fixtures to satisfy already-approved input contracts before semantic RED is accepted.
- Add a shared optional HerdR operations contract for TH agents: discover the target with `herdr agent list`, discover the verified sender with `herdr pane current`, resolve unique pane identities, include a current-session response channel, queue text with `herdr agent send` in every agent state, submit it with `herdr pane send-keys <pane> enter`, and verify delivery with `herdr agent read`.
- Require HerdR dispatch to fail safely on absent CLI, ambiguous identity, pane drift, unsafe content, or submission failure. Accepted input without immediate transcript evidence is `queued`; it must never be reported as `received` or resent blindly merely because it is not yet visible in committed output.
- Update canonical workflow sources, Codex/plugin projections, generated artifacts, lint/generation checks, and focused behavioral tests so the three contracts remain synchronized.

## Capabilities

### New Capabilities

- `herdr-agent-messaging`: Safe, verifiable discovery, send, submit, and receipt handling for coordination with HerdR-managed agents.

### Modified Capabilities

- `workspace-canonical-local`: Define the canonical dated coordinator workspace for a multi-repository initiative and require all workspace consumers to use the persisted identity.
- `openspec-design-orchestration`: Support multiple service-owned OpenSpec bindings, per-binding implementable execution contracts and immutable evidence, and one consolidated multi-repository Gate 1.

## Impact

- Canonical pipeline and initiative contracts under `agents/`, including workspace derivation, state schema, Design, recovery, tracing, and Gate 1 presentation.
- Packaged pipeline, trace, tmux, and background skill references plus their Codex projections and generated copies.
- OpenSpec snapshot, recovery, overlay, state-validation, and workspace-resolution helpers and schemas.
- Tests for canonical workspace identity, multiple OpenSpec bindings and hashes, read-only evidence disposition, consolidated Gate 1 freshness, post-Gate derived-artifact repair eligibility and rollback, legacy-v1 gate migration chains and event ordering, HerdR queued delivery in every agent state, explicit Enter submission, receipt verification, and projection freshness.
- No new ownership is assigned to `payment-gateway` in the motivating initiative: `merchant-bridge`, `payments-orchestrator`, and `transactions` own independent bindings; `payment-gateway` remains read-only evidence.
