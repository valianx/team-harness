## ADDED Requirements

### Requirement: Multi-repository Design binds OpenSpec per writable service
For a multi-repository initiative, Team Harness SHALL maintain an ordered `openspec_bindings` collection with exactly one binding for every participating writable service that owns OpenSpec intent. Each binding SHALL identify the service, repository root and immutable repository identity, change name, planning root, schema, CLI and generated-skill identities, artifact coordinates, raw hashes, task-intent hash, strict-validation result, snapshot, and execution overlay. Team Harness MUST NOT choose a coordinator or reference repository as a substitute source of intent.

#### Scenario: Three services own their own specifications
- **WHEN** `merchant-bridge`, `payments-orchestrator`, and `transactions` participate as writable services
- **THEN** state and Gate 1 contain three independently validated bindings whose planning artifacts remain in their owning repositories

#### Scenario: A repository is read-only evidence
- **WHEN** `payment-gateway` is consulted only as evidence
- **THEN** it is recorded with an evidence-only disposition and receives no OpenSpec binding, writable scope, task ownership, or Gate-1 acceptance coordinates

#### Scenario: A writable service has no valid binding
- **WHEN** a participating writable service lacks a readable and strictly valid service-owned OpenSpec change
- **THEN** Design remains recoverable and blocks consolidated Gate 1 without relocating or synthesizing that service's specification elsewhere

### Requirement: Every service overlay is derived from explicit implementable judgment
Each writable service's canonical OpenSpec `tasks.md` SHALL contain one closed Team Harness execution contract with exactly one record per task coordinate. The contract SHALL declare a real writable worktree and immutable base, non-empty product file scope, dependencies, technical constraints, applicable invariants and evidence, bounded discovery scope, required seams, exact quality commands, observable-runtime classification, pre-implementation-test routing, cross-runtime preservation, rollback, and delivery grouping. Derivation SHALL project this contract into overlay v2 task shards and a hash-bound workspace quality manifest without inventing scope from task titles.

#### Scenario: Planning emits complete executable judgment
- **WHEN** the architect-authored execution contract validates against the pinned task coordinates and writable roots
- **THEN** derivation writes shards containing real files, discovery and verification controls, writes `.team-harness/quality.json`, and binds their identities in the service overlay

#### Scenario: Planning leaves a scaffold or omits execution scope
- **WHEN** any execution record is absent, malformed, placeholder-bearing, stale, uses the OpenSpec planning file as product scope, lacks a required quality/discovery/evidence value, or selects an unwritable worktree
- **THEN** derivation or plan-contract fails before aggregate binding and Gate 1 cannot be presented

### Requirement: Multi-repository Gate 1 is consolidated and freshness-bound
An OpenSpec-bound multi-repository initiative SHALL present one consolidated Gate 1 only after every required service binding validates, every cross-service dependency and execution order is represented, and the aggregate snapshot identity is fresh. The approval SHALL bind the exact ordered binding set, per-binding snapshot and overlay hashes, aggregate hash, repository roles, and read-only evidence dispositions. It MUST NOT authorize a missing, later-added, stale, or ownership-mismatched binding.

#### Scenario: All service bindings are valid and fresh
- **WHEN** every writable service has a valid snapshot and overlay and cross-service dependencies are unambiguous
- **THEN** Team Harness presents one Gate 1 summary naming each service-owned change, its bounded scope, execution order, and aggregate identity

#### Scenario: One service changes after the gate preview
- **WHEN** any bound artifact, repository identity, binding membership, dependency, order, snapshot hash, or overlay hash differs before approval is consumed
- **THEN** the aggregate freshness check invalidates the preview and requires reconciliation before Gate 1 can be released

#### Scenario: Evidence-only repository is promoted to writable scope
- **WHEN** implementation intent begins to modify a repository previously classified as evidence-only
- **THEN** Team Harness treats this as a binding-set and scope change, creates or selects a service-owned OpenSpec binding, rebuilds the aggregate snapshot, and re-presents Gate 1

### Requirement: Post-Gate derived artifacts are repaired without changing approved intent
Before the first implementation specialist dispatch, Team Harness SHALL classify a failing OpenSpec packet as derived-artifact damage only when the released consolidated Gate 1 verifies, the aggregate manifest bytes and binding membership remain unchanged, every canonical source still matches the approved snapshot intent, the canonical execution contract remains complete, and a clean regeneration produces the exact approved overlay SHA-256. For that class only, Team Harness SHALL transactionally replace the derived plan index, task shards, quality manifest, and traceability overlay, rerun overlay, plan-contract, aggregate, and gate-identity validation, persist deterministic repair evidence, and continue in `implementation` without reopening Design or presenting another Gate 1.

#### Scenario: A derived shard or quality manifest is missing after Gate 1
- **WHEN** no implementation specialist has been dispatched, canonical intent and the aggregate are unchanged, and staged regeneration reproduces the approved overlay hash
- **THEN** Team Harness atomically restores the complete derived artifact set, records pre/post hashes and validation results, preserves the existing Gate-1 identity, and continues implementation

#### Scenario: Canonical execution judgment is absent
- **WHEN** the approved canonical `tasks.md` lacks the complete execution contract required to reconstruct product scope, evidence, quality commands, or runtime preservation
- **THEN** Team Harness reports `DERIVED_REPAIR_INELIGIBLE` and MUST NOT infer those values, invoke automatic architect work, claim the old Gate covers new judgment, or mutate the derived artifacts

#### Scenario: Regeneration changes the approved overlay identity
- **WHEN** a staged regeneration produces an overlay hash different from the binding hash covered by the released Gate 1, or canonical/aggregate/gate freshness cannot be proven
- **THEN** Team Harness rolls back or publishes nothing, records no successful repair, and requires explicit reconciliation under normal gate rules

#### Scenario: Implementation work already began
- **WHEN** any specialist dispatch or implementation progress transition is already recorded for the affected binding
- **THEN** automatic derived-artifact replacement is ineligible and the coordinator fails closed rather than rewriting a live execution packet

### Requirement: Approved legacy placeholder overlays migrate through an explicit Gate chain
For a legacy v1 workspace whose released Gate 1 bound placeholder overlays that cannot be reproduced as executable v2 bytes, Team Harness MAY preserve the immutable original Gate record only when a prior live `operator.decision` explicitly authorized the bounded derived-contract repair, that event followed the matching Gate release and preceded both the successful repair and the first implementation specialist dispatch, and a deterministic migration certificate binds the original Gate identity and aggregate SHA-256 to the current validated aggregate SHA-256. The certificate SHALL prove exact normalized normative task-prefix hashes per service, hash the repair evidence and decisive timeline events, retain the original gate file unchanged, and define one continuation identity consumed alongside—not substituted for—the original Gate.

#### Scenario: Live operator authorized repair before implementation
- **WHEN** the original Gate release, operator decision, successful repair, and first specialist dispatch occur in that strict order; the current normative task prefixes match their approved hashes; and all current snapshots, overlays, shards, quality controls, aggregate membership, and repository identities validate
- **THEN** Team Harness writes `inputs/gate1-v1-migration.json`, preserves `inputs/gate1-binding.json` byte-for-byte, returns the certificate SHA-256 and continuation identity as closed verification output, and continues under the original Gate plus migration continuation identity without presenting Gate 1 again

#### Scenario: Existing repaired workspace is adopted deterministically
- **WHEN** a workspace was already repaired under a recorded live operator decision and its repair evidence, event log, original Gate record, current aggregate, canonical task prefixes, and post-repair artifacts satisfy the migration schema
- **THEN** the migration command may create the same certificate after the fact without rewriting any plan, OpenSpec, overlay, snapshot, aggregate, progress, or Gate artifact

#### Scenario: Authorization or chronology cannot be proven
- **WHEN** the operator decision is absent, non-live, after the repair, or after the first implementation dispatch; the original Gate record is stale or malformed; the normative prefix differs; or any before/after hash and current artifact disagree
- **THEN** migration fails with `LEGACY_GATE_MIGRATION_INVALID`, writes no certificate, and the old Gate cannot authorize the current aggregate

#### Scenario: Later continuation verifies a migrated Gate
- **WHEN** recovery or implementation consumes a legacy migrated workspace
- **THEN** it verifies both the immutable original Gate and the complete migration certificate against the current aggregate and repair evidence; either record alone is insufficient

### Requirement: Silent specialists close through a bounded liveness lease
For every implementation-or-later specialist, Team Harness SHALL treat ordinary native wait timeouts before the role SLA as non-decision heartbeats. At the role SLA it SHALL send exactly one attempt-token-bound liveness probe, allow a fixed two-minute acknowledgement grace, accept at most one matching bounded checkpoint that renews the lease for the role SLA, and then deterministically interrupt an attempt whose lease expires. After confirmed interruption, Team Harness SHALL inspect only declared owned paths and expected evidence paths before deciding whether replacement is safe. It MUST NOT run a concurrent replacement, retry indefinitely, or substitute Main for the specialist.

#### Scenario: Specialist remains within its role SLA
- **WHEN** one or more native wait calls time out before the role SLA
- **THEN** Team Harness continues waiting without interruption, replacement, or failure inference

#### Scenario: One matching checkpoint renews the lease
- **WHEN** the role SLA expires and the running specialist returns a checkpoint ACK carrying the current attempt token within two minutes
- **THEN** Team Harness renews that attempt exactly once for the role SLA and accepts no second probe or renewal

#### Scenario: Silent clean first attempt is replaced once
- **WHEN** the acknowledgement grace or renewed lease expires, interruption succeeds, and all declared owned and evidence paths remain unchanged
- **THEN** Team Harness may dispatch exactly one fresh same-role attempt with isolated context and preserves the coordinator/specialist ownership boundary

#### Scenario: Interrupted attempt left progress
- **WHEN** the post-interrupt audit finds any changed declared owned path or expected evidence path
- **THEN** Team Harness blocks as `specialist-interrupted-with-progress`, preserves the partial result, and does not dispatch a concurrent or replacement writer

#### Scenario: Fresh replacement is also silent
- **WHEN** attempt 2 reaches the same clean expired-lease condition
- **THEN** Team Harness blocks as `specialist-retry-exhausted` without a third attempt or local coordinator fallback

### Requirement: Derived OpenSpec dispatch artifacts become immutable atomically
Before building the first implementation-role packet for a writable service, Team Harness SHALL acquire one atomic per-service derived-set lock and persist a permanent dispatch binding over the exact aggregate, consolidated Gate-1 identity, optional migration continuation identity, snapshot, overlay, compact plan, workspace quality manifest, and every overlay-declared task shard. `repair-derived`, initial sealing, and seal verification SHALL use the same lock. Every fresh specialist dispatch SHALL verify the binding bytes and all bound artifact hashes. Team Harness MUST NOT repair, silently rehash, rebind, or resend against changed derived bytes after the seal exists.

#### Scenario: Repair finishes before dispatch sealing
- **WHEN** eligible derived repair owns the service lock while Main attempts to seal a specialist packet
- **THEN** sealing returns `DERIVED_SET_BUSY`, publishes no binding, and Main may retry only after the repair finishes and the complete derived set validates

#### Scenario: Dispatch binding exists before repair
- **WHEN** the permanent service dispatch binding has been created and any repair path is invoked, even with empty progress and a caller assertion that implementation has not started
- **THEN** repair returns `DERIVED_REPAIR_INELIGIBLE` before invoking any derived-artifact writer

#### Scenario: A shard changes after packet preflight
- **WHEN** any bound plan, quality manifest, or task-shard byte changes after the service dispatch binding is created
- **THEN** verification returns `DISPATCH_BINDING_STALE`, no specialist is dispatched, and Main does not accept rehashing or rebinding as repair

#### Scenario: Sealing is repeated without mutation
- **WHEN** Main repeats sealing or verifies a fresh correction dispatch against byte-identical bound artifacts
- **THEN** it receives the same dispatch-binding SHA-256 with `changed: false`

## MODIFIED Requirements

### Requirement: Planning inputs are pinned for Gate 1
TH SHALL record one immutable OpenSpec snapshot per bound service plus one aggregate manifest in the configured coordinator workspace. Each service snapshot SHALL record the OpenSpec change identity, repository identity, planning root, schema, CLI version, generated-skill identity, artifact paths, normalized coordinates, raw content hashes, and an intent hash calculated by normalizing only task checkbox state. The aggregate manifest SHALL record the ordered binding set, per-binding snapshot and overlay hashes, repository roles, cross-service dependencies, execution order, and its own SHA-256. TH MUST verify every required file and identity before consolidated Gate 1 release or implementation and MUST distinguish authorized per-service task progress from changes to canonical intent or binding membership.

#### Scenario: OpenSpec inputs remain unchanged
- **WHEN** TH checks the aggregate manifest before presenting or consuming consolidated Gate 1
- **THEN** every service snapshot, artifact hash, task intent hash, overlay hash, repository identity, binding role, dependency, and aggregate hash matches and the initiative may continue subject to normal gate rules

#### Scenario: Canonical intent changes after projection
- **WHEN** any non-task artifact changes, task text or structure changes, a coordinate is added or removed, a completed task returns to pending, a binding changes ownership or membership, or an aggregate dependency changes
- **THEN** TH blocks continuation and requires explicit reconciliation and a fresh per-service and aggregate projection before presenting or consuming Gate 1

#### Scenario: OpenSpec records authorized task progress
- **WHEN** implementation has begun and the only difference in one or more task artifacts is a known pending-to-complete transition produced by authorized work in the owning service
- **THEN** TH accepts each verified progress transition, updates the affected raw hashes and aggregate manifest, and preserves the unchanged intent hashes and Gate-1 identity

#### Scenario: Aggregate implementation validation advances one service
- **WHEN** aggregate verification authorizes task transitions for one service while another binding has no implementation progress and a third may already have durable progress from an earlier dispatch
- **THEN** TH validates the active service with only its supplied task IDs, validates the untouched service against its unchanged pre-Gate source, and revalidates the previously progressed service against its last durable progress event without treating an empty per-service authorization as an invalid transition or borrowing IDs across services

#### Scenario: Task progress mutation is not monotonic
- **WHEN** any bound task checkbox changes outside an authorized pending-to-complete transition, a completed task returns to pending, or progress cannot be matched uniquely to its owning service and pinned coordinate
- **THEN** TH blocks specialist dispatch and requires explicit reconciliation rather than treating the mutation as progress

#### Scenario: A required supplied artifact cannot be read
- **WHEN** any bound repository, planning root, artifact, snapshot, or overlay required by the aggregate manifest cannot actually be read
- **THEN** TH fails closed before specialist dispatch or gate release and identifies the failed binding and required artifact

### Requirement: Repository and workspace artifacts retain separate homes
Each service's OpenSpec source-of-intent artifacts SHALL remain under that service repository's resolved OpenSpec planning root. TH coordinator state, aggregate manifest, cross-service execution overlay, decisions, reviews, and evidence SHALL remain under the one canonical initiative workspace. Per-service snapshots and overlays in the coordinator workspace are immutable evidence and MUST NOT become editable OpenSpec roots. Evidence-only repositories remain read-only and never inherit planning ownership.

#### Scenario: Pipeline uses an Obsidian workspace
- **WHEN** TH coordinates multiple service-owned OpenSpec changes in Obsidian mode
- **THEN** the coordinator workspace contains the aggregate and per-binding evidence while each proposal, spec, design, and task remains editable only in its owning repository

#### Scenario: No repository is the initiative coordinator
- **WHEN** participating services are peers and none owns the cross-service initiative
- **THEN** Team Harness keeps coordination in the external initiative workspace and does not centralize sibling OpenSpec artifacts in any reference service
