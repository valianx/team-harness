## MODIFIED Requirements

### Requirement: Planning inputs are pinned for Gate 1
TH SHALL compute one content identity per writable service over the canonical OpenSpec artifacts — `proposal.md`, `design.md`, `specs/**`, and `tasks.md` with checkbox state normalized out — and SHALL record it in the control log at Gate 1 together with the change name, path, and CLI version. TH SHALL recompute and compare the identity before every lease is issued and at Freeze. A mismatch SHALL pause with the diff shown and SHALL require Gate 1 to be re-presented over the revised change. A checkbox transition SHALL NOT change the identity. No snapshot file, aggregate manifest, overlay hash, or helper-bundle identity is recorded.

#### Scenario: OpenSpec inputs remain unchanged
- **WHEN** TH recomputes the identity before issuing a lease
- **THEN** it matches the Gate-1 value and the lease is issued

#### Scenario: Canonical intent changes after projection
- **WHEN** any of `proposal.md`, `design.md`, `specs/**`, or the non-checkbox content of `tasks.md` differs from the pinned content
- **THEN** TH pauses, shows the diff, and re-presents Gate 1 over the revised change before any further lease

#### Scenario: OpenSpec records authorized task progress
- **WHEN** the only difference in `tasks.md` is checkbox state
- **THEN** the identity is unchanged and the pipeline continues

#### Scenario: Aggregate implementation validation advances one service
- **WHEN** a multi-repository run issues a lease for one service
- **THEN** only that service's identity is checked for that lease

#### Scenario: Task progress mutation is not monotonic
- **WHEN** a completed checkbox returns to pending
- **THEN** the identity is unchanged, the regression is recorded in the control log, and the batch that owns the task is re-leased

#### Scenario: A required supplied artifact cannot be read
- **WHEN** the change directory or any file the identity covers cannot be read
- **THEN** TH pauses before issuing a lease, naming the unreadable path

## REMOVED Requirements

### Requirement: TH derives a minimal execution overlay
**Reason**: v5 Design generates only the read-only operator plan; specialists read the change directory through the lease's immutable inputs.

**Migration**: `openspec-overlay.mjs` and `plan/**` are deleted.

### Requirement: Traceability is complete in both directions
**Reason**: Traceability mapped OpenSpec coordinates onto overlay items that no longer exist; scenarios are the acceptance items.

**Migration**: `traceability.json` is no longer written. QA cites scenarios by heading.

### Requirement: Every service overlay is derived from explicit implementable judgment
**Reason**: v5 derives writable paths and verification just in time per batch; an authored execution contract in `tasks.md` is the duplicate v5 removed.

**Migration**: `openspec-bindings.mjs` and `plan-contract.mjs` are deleted.

### Requirement: Post-Gate derived artifacts are repaired without changing approved intent
**Reason**: There are no derived artifacts to repair under v5.

**Migration**: None; the content identity is recomputed, never repaired.

### Requirement: Approved legacy placeholder overlays migrate through an explicit Gate chain
**Reason**: No pre-v5 workspace remains resumable; a Gate-1 approval over an existing change directory is re-read, not certified.

**Migration**: Pre-v5 workspaces are closed administratively and finished inline or restarted.

### Requirement: Silent specialists close through a bounded liveness lease
**Reason**: v5 liveness reports facts and causal recovery chooses the action; the probe/renewal/replacement allowance was superseded by the v5 change's own text.

**Migration**: `specialist-liveness.mjs` is deleted; `ref-pipeline.md § Failures` owns `specialist-unresponsive`.

### Requirement: Derived OpenSpec dispatch artifacts become immutable atomically
**Reason**: v5 binds immutable inputs in the capability lease and compares the result's changed paths with the real diff; a separate seal over plan, manifest, and shard hashes has nothing to seal.

**Migration**: `specialist-write-scope.mjs` and `helper-bundle.mjs` are deleted.

### Requirement: Recovery commands and pre-implementation tests preserve executable boundaries
**Reason**: v5 recovery replays the control log; recovery receipts for a rebuilt control state have no consumer.

**Migration**: `openspec-recovery.mjs` and `correction-packet-preflight.mjs` are deleted; the quality runner keeps its own bounded-command execution.

### Requirement: Active OpenSpec compatibility is one-shot
**Reason**: The converter's only inputs were v1-v4 workspaces, none of which remains resumable.

**Migration**: `convertLegacyWorkspace` is deleted; a workspace without `control/control.jsonl` receives an administrative close and the inline-or-fresh offer.
