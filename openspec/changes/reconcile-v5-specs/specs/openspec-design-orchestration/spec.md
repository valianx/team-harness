## ADDED Requirements
### Requirement: A workspace without a control log closes administratively
When recovery or activation selects a workspace whose `control/control.jsonl` is absent, TH SHALL NOT infer, convert, or repair state. It SHALL append exactly one `pipeline.close` entry with `terminal_state: closed-administratively` to the workspace events file and SHALL offer inline continuation or a fresh run. Before writing, TH SHALL refuse a `control/` entry or an events file that is a symbolic link or has more than one hard link, and SHALL verify after opening that the events file it writes is the regular file it checked. A workspace that has a control log SHALL never take this path.

#### Scenario: Orphan workspace is closed
- **WHEN** the selected workspace has no `control/control.jsonl`
- **THEN** one `pipeline.close` entry is appended, the outcome is `closed-administratively`, and the operator is offered inline continuation or a fresh run

#### Scenario: Control log is present
- **WHEN** the selected workspace has `control/control.jsonl`
- **THEN** the administrative close is refused with `CONTROL_LOG_PRESENT` and recovery replays the log instead

#### Scenario: A linked path is refused
- **WHEN** `control/` or the events file is a symbolic link or a hard link, or the opened events file differs from the one checked
- **THEN** nothing is written and the close is refused with `CONTROL_PATH_SYMLINK` or `EVENTS_PATH_INVALID`

## MODIFIED Requirements
### Requirement: Existing pipeline entry and lifecycle remain authoritative
Team Harness SHALL invoke OpenSpec only as an internal part of the Design phase of an explicitly activated TH pipeline. It MUST NOT introduce an additional pipeline entry point, alternate state machine, or OpenSpec-owned gate.

#### Scenario: Operator starts the normal pipeline
- **WHEN** the operator invokes `@Team-Harness pipeline` with a task and completes the existing intake
- **THEN** TH enters its existing Design phase and uses OpenSpec internally without requiring a separate OpenSpec workflow invocation

#### Scenario: OpenSpec reports artifact readiness
- **WHEN** OpenSpec reports that proposal, specs, design, or tasks are ready
- **THEN** TH treats that status as design input and does not advance state or release Stage Gate 1 from it

#### Scenario: An internal OpenSpec action completes normally
- **WHEN** preflight, planning, strict validation, identity recomputation, projection rebuild, or another authorized internal action completes without a required gate, unresolved material decision, external mutation authority, or real blocker
- **THEN** Main continues to the next valid pipeline action automatically, reports concise progress without requesting an operator reply, and does not require the operator to invoke another OpenSpec or TH command

#### Scenario: Operator intervention is strictly required
- **WHEN** the next action is a mandatory TH gate, requires a material choice not fixed by the canonical artifacts, needs separate authority for an external mutation, or is blocked by an error that cannot be resolved safely within scope
- **THEN** Main pauses once with the exact decision or authority required and the evidence needed to answer it

### Requirement: Planning inputs are pinned for Gate 1
TH SHALL compute one content identity per writable service with `openspecContentIdentity` over the canonical OpenSpec artifacts — every file under the change root, hashed as the sorted sequence of relative path and bytes, with checkbox state in `tasks.md` normalized out — so a renamed, added, or removed file changes the identity. TH SHALL record it in the control log at Gate 1 together with the change name, path, and CLI version. TH SHALL recompute and compare the identity before every lease is issued and at Freeze. A mismatch SHALL pause with the diff shown and SHALL require Gate 1 to be re-presented over the revised change. A checkbox transition SHALL NOT change the identity; `taskProgressDelta` SHALL classify it as authorized progress, regression, or a structural change, and only authorized progress continues without a recorded action. No snapshot file, aggregate manifest, overlay hash, or helper-bundle identity is recorded.

#### Scenario: OpenSpec inputs remain unchanged
- **WHEN** TH recomputes the identity before issuing a lease
- **THEN** it matches the Gate-1 value and the lease is issued

#### Scenario: Canonical intent changes after projection
- **WHEN** any of `proposal.md`, `design.md`, `specs/**`, or the non-checkbox content of `tasks.md` differs from the pinned content
- **THEN** TH pauses, shows the diff, and re-presents Gate 1 over the revised change before any further lease

#### Scenario: OpenSpec records authorized task progress
- **WHEN** the only difference in `tasks.md` is a pending-to-complete transition on a task coordinate present in the pinned text
- **THEN** the identity is unchanged and the pipeline continues

#### Scenario: A file is renamed, added, or removed
- **WHEN** the change root gains, loses, or renames a file while every remaining byte is unchanged
- **THEN** the identity differs from the Gate-1 value and TH pauses as for a canonical change

#### Scenario: Aggregate implementation validation advances one service
- **WHEN** a multi-repository run issues a lease for one service
- **THEN** only that service's identity is checked for that lease

#### Scenario: Task progress mutation is not monotonic
- **WHEN** a completed checkbox returns to pending
- **THEN** the identity is unchanged, the regression is recorded in the control log, and the batch that owns the task is re-leased

#### Scenario: A required supplied artifact cannot be read
- **WHEN** the change directory or any file the identity covers cannot be read
- **THEN** TH pauses before issuing a lease, naming the unreadable path

### Requirement: Repository and workspace artifacts retain separate homes
Each service's OpenSpec source-of-intent artifacts SHALL remain under that service repository's resolved OpenSpec planning root. TH coordinator state — the control log, its projections, decisions, reviews, and evidence — SHALL remain under the one canonical initiative workspace. The coordinator workspace holds recorded identities and evidence only and MUST NOT become an editable OpenSpec root. Evidence-only repositories remain read-only and never inherit planning ownership.

#### Scenario: Pipeline uses an Obsidian workspace
- **WHEN** TH coordinates multiple service-owned OpenSpec changes in Obsidian mode
- **THEN** the coordinator workspace contains the control log and per-service evidence while each proposal, spec, design, and task remains editable only in its owning repository

#### Scenario: No repository is the initiative coordinator
- **WHEN** participating services are peers and none owns the cross-service initiative
- **THEN** Team Harness keeps coordination in the external initiative workspace and does not centralize sibling OpenSpec artifacts in any reference service

### Requirement: Multi-repository Design binds OpenSpec per writable service
For a multi-repository initiative, Team Harness SHALL record in the Gate-1 event an ordered list with exactly one entry for every participating writable service that owns OpenSpec intent. Each entry SHALL identify the service, repository root and immutable repository identity, change name, planning root, CLI version, strict-validation result, and the service's content identity. No binding collection, snapshot, or execution overlay is recorded. Team Harness MUST NOT choose a coordinator or reference repository as a substitute source of intent.

#### Scenario: Three services own their own specifications
- **WHEN** `merchant-bridge`, `payments-orchestrator`, and `transactions` participate as writable services
- **THEN** the Gate-1 event lists three independently validated services with their content identities, and their planning artifacts remain in their owning repositories

#### Scenario: A repository is read-only evidence
- **WHEN** `payment-gateway` is consulted only as evidence
- **THEN** it is recorded with an evidence-only disposition and receives no Gate-1 entry, writable scope, task ownership, or acceptance coordinates

#### Scenario: A writable service has no valid binding
- **WHEN** a participating writable service lacks a readable and strictly valid service-owned OpenSpec change
- **THEN** Design remains recoverable and blocks consolidated Gate 1 without relocating or synthesizing that service's specification elsewhere

### Requirement: Multi-repository Gate 1 is consolidated and freshness-bound
An OpenSpec-bound multi-repository initiative SHALL present one consolidated Gate 1 only after every required service validates, every cross-service dependency and execution order is represented, and every recorded content identity is fresh. The approval SHALL bind the exact ordered service list, each service's content identity, repository roles, and read-only evidence dispositions. It MUST NOT authorize a missing, later-added, stale, or ownership-mismatched service.

#### Scenario: All service bindings are valid and fresh
- **WHEN** every writable service has a strictly valid change with a fresh content identity and cross-service dependencies are unambiguous
- **THEN** Team Harness presents one Gate 1 summary naming each service-owned change, its bounded scope, execution order, and aggregate identity

#### Scenario: One service changes after the gate preview
- **WHEN** any service's content identity, repository identity, list membership, dependency, or order differs before approval is consumed
- **THEN** the aggregate freshness check invalidates the preview and requires reconciliation before Gate 1 can be released

#### Scenario: Evidence-only repository is promoted to writable scope
- **WHEN** implementation intent begins to modify a repository previously classified as evidence-only
- **THEN** Team Harness treats this as a service-list and scope change, selects or authors that service's OpenSpec change, records its content identity, and re-presents Gate 1
