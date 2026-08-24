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
