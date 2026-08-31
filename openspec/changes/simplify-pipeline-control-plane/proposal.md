## Why

### Problem and Observable Outcome

- **Problem:** The current pipeline represents authority, ownership, state,
  artifact identity, liveness, and specialist results in several overlapping
  records. Those copies can disagree and still drive pauses, rotation, repeated
  validation, or coordinator relays.
- **Observable outcome:** A pipeline run dispatches and completes specialist
  work through one capability lease, one result envelope, and one append-only
  control log; same-cause loops stop safely, while harmless counts and elapsed
  time never select the route.

### Actors and Flows

- **Actor:** The operator approves once at Gate 1 and is asked again only when
  protected meaning, security authority, outward effects, ownership safety, or
  an external prerequisite truly changes.
- **Actor:** Main issues bounded work, accepts results, appends control events,
  and rebuilds human-readable projections.
- **Actor:** Specialists consume immutable inputs, mutate only leased scope,
  and return structured evidence through the runtime's existing terminal
  result transport.

### Business Rules and Examples

- **Rule:** A control may route execution only when an executable check protects
  live authority, exclusive writes, immutable inputs, independent evidence, or
  native permission/security enforcement.
- **Example:** A correction with unchanged authority and a new safe causal
  action continues under the existing lease; repeating the same failed causal
  identity pauses with the missing condition.

### Alternate and Error Behavior

- Invalid or forged leases, results, control records, paths, hashes, nonces, or
  legacy authority fail closed without changing the last valid projection.
- Supported v1-v4 workspaces convert once. Ambiguous authority or mixed writable
  schemas stop before dispatch and preserve the original workspace.

### Unchanged Behavior

- Gate-1 approval, one committing writer per canonical worktree, pinned OpenSpec
  acceptance, fresh QA for a changed Freeze, impact-triggered security review,
  native permissions, and separate approval for protected outward actions stay
  mandatory.
- Multi-repository binding membership, service ownership, aggregate freshness,
  immutable dispatch sealing, and read-only evidence dispositions stay intact.

### Non-Goals

- No generic workflow engine, new coordination channel, peer-issued authority,
  role inbox, hard-control manifest, role ABI manifest, or third control
  primitive is introduced.
- HerdR messaging, workspace-location formulas, public application APIs, and
  product UI are not redesigned.

### Decisions for human review

- None — the approved request fixes the two primitives, single-log authority,
  retained safety floors, and one-shot v5 boundary.

## What Changes

- Introduce exactly two control-plane primitives:
  - `capability_lease`: who may perform which bounded work, with the applicable
    live authority, mutable scope, immutable inputs, ownership, and validity;
  - `result_envelope`: what the specialist completed, with evidence, artifact
    references, findings, status, and the observed control-log position.
- Treat artifact references and state cursors as fields of those primitives,
  not as independent control currencies or independently dispatched objects.
- Store authority decisions, lease lifecycle, accepted results, and pipeline
  transitions in one coordinator-owned append-only control log. Human-readable
  state and findings files become rebuildable projections.
- Use the runtime's existing specialist dispatch and terminal-result transport.
  Do not add per-attempt inboxes, receipt protocols, peer routing, or another
  coordination channel.
- Keep an existing `capability_lease` valid across same-agent continuation while
  authority, scope, ownership, inputs, and context remain valid. Rotate only for
  changed identity, lost context, ownership transfer, or an independent review
  requirement.
- Preserve Gate-1 authority for causally changed corrections inside approved
  intent, scope, acceptance meaning, and security floor. Counts and retry
  ordinals remain observations and never select the route.
- Validate roles only before they can actually be dispatched. Keep model policy
  as non-authoritative resumable metadata so unchanged choices are not repeated.
- Run cleaner only when deterministic hygiene evidence identifies safe eligible
  work, and execute one complete quality run for each candidate tree at Freeze.
- Remove stale `TH-STATE-REF`, `TH-LIVENESS-RESUME`, `single retry`, `/3`,
  `max-3`, and ambiguous `correction round` routes from current contracts.
- **BREAKING**: introduce `pipeline_version: 5`. Supported v1-v4 workspaces pass
  through a one-shot converter before current dispatch; the v5 hot path neither
  reads nor writes legacy routing fields.
- Preserve the completed multi-repository hardening outcomes while superseding
  its fixed probe/renewal/replacement liveness allowance with fact-only
  liveness and causal recovery.
- Absorb the active legacy-v1 repair's precise binding diagnostics and verified
  continuation authorization into the converter boundary; it must not become a
  competing current-path contract after v5 cutover.

The following proposed mechanisms are explicitly out of scope because they add
control without protecting an additional asset: a hard-control manifest, a new
role ABI manifest, role-owned result inboxes, aggregate receipt transport, and
five independently versioned primitive schemas.

## Capabilities

### New Capabilities

- `pipeline-control-plane`: Defines the two primitives, single control log,
  derived projections, retained safety floors, causal recovery, and migration
  boundary.
- `specialist-coordination-protocol`: Defines exclusive capability leases,
  same-agent continuation, terminal result envelopes, and Main-only routing.

### Modified Capabilities

- `gate-single-approve-autonomy`: Remove ordinal correction limits and duplicate
  authority while preserving one Gate-1 approval and closed pause classes.
- `validation-convergence`: Route correction from causal evidence, project
  findings from results, and refresh only stale or impact-relevant evidence.
- `openspec-design-orchestration`: Use the two-primitive dispatch contract and
  move legacy dispatch recovery behind the v5 converter.
- `freeze-quality-run`: Make cleaner demand-driven and avoid duplicate complete
  quality execution before Freeze.
- `codex-runtime-parity`: Validate each role when it becomes dispatchable rather
  than preflighting the whole roster at activation.

## Impact

This affects shared agent contracts, the packaged pipeline skill and
references, state/gate/recovery/liveness/dispatch helpers, OpenSpec capsule
binding, quality/cleaner policy, Codex role validation, generated projections,
documentation, and their behavioral suites.

The change depends on the completed
`harden-multi-repo-coordination-contract` behavior as its effective baseline and
supersedes only that delta's ordinal liveness policy. It also absorbs the two
observable obligations in `repair-legacy-v1-migration-dispatch`. Their change
trees remain untouched; normal OpenSpec lifecycle ordering must prevent either
delta from being applied later as a competing current-path contract.
