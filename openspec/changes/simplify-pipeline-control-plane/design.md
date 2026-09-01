## Context

See `proposal.md` for motivation and `specs/**/spec.md` for required behavior.
The v4 runtime already has content-addressed work capsules, bounded ownership,
Freeze identities, quality envelopes, and causal evidence. The problem is not
the absence of control; it is that the same decision is represented in too many
places and some observations still influence routing.

Main remains the sole operator-facing coordinator and state-machine owner.
Specialists share filesystem and Git metadata, so one canonical worktree still
cannot have concurrent committing writers. The current checkout is dirty at
base `85c3eef6ae3fdcb50db737d2b971feb677d6b802`, so implementation uses a clean
isolated worktree under the repository's ignored `.worktrees/` directory.

### Effective specification baseline

| Source | Disposition in this change |
|---|---|
| Main `openspec-design-orchestration` | Preserve canonical OpenSpec intent, bidirectional traceability, strict validation, per-service snapshots, and separate repository/workspace homes. |
| Completed `harden-multi-repo-coordination-contract` | Preserve ordered service bindings, consolidated Gate 1, explicit execution contracts, aggregate freshness, immutable dispatch sealing, precise binding failures, and read-only evidence. Supersede only its fixed probe, renewal, and replacement allowance. |
| Active `repair-legacy-v1-migration-dispatch` | Absorb its precise `failed_binding` diagnostics and verified continuation authorization into the v5 converter. The legacy branch is not a second current route. |
| Main gate, validation, Freeze, and Codex parity specs | Replace dual authority and ordinal correction routing; retain severity/security floors, red-to-green evidence, one complete Freeze run, and the standard Sol/Luna role matrix. |

The hardening change is the completed behavioral baseline even while its delta
remains active. This change is the authoritative successor for liveness and
legacy hot-path behavior. Lifecycle handling may sync/archive or mark those
changes superseded, but implementation must not edit their planning trees or
apply their conflicting clauses after v5 cutover.

## Goals / Non-Goals

**Goals:**

- Express dispatch and completion with two objects and one durable control log.
- Remove duplicate approval, ownership, state, retry, and result handshakes.
- Reuse valid specialist context and perform preflight, cleaning, and quality
  work only when their triggering condition exists.
- Preserve live authority, exclusive writes, immutable acceptance, independent
  validation, security, native permissions, and outward-action approvals.
- Convert supported legacy workspaces once and keep compatibility out of the
  current execution path.

**Non-Goals:**

- Adding a third posture, fast/full profiles, a generic workflow engine, or a
  specialist-to-specialist authority channel.
- Adding a hard-control manifest, role ABI manifest, result inbox protocol,
  aggregate receipt transport, or independent artifact/cursor primitives.
- Allowing concurrent committing writers in one canonical worktree.
- Inferring missing historical authority or weakening acceptance/security.
- Reworking HerdR delivery, workspace identity formulas, or multi-repository
  service ownership that the hardening baseline already settled.

## Decisions

### 1. Treat the reconciled baseline above as a dependency, not an implementation task

The baseline inventory is complete in this design and in the delta scenarios.
Implementation begins with product regressions against the retained floors; it
does not use an implementation checkbox to mutate another OpenSpec change.
Hardened binding/seal behavior remains normative. Fixed liveness counts are
historical converter input only. The separate legacy-repair delta is
superseded because its exact outcomes are required by the converter tests.

### 2. Use two closed primitives

`capability_lease` combines authority and work ownership. Its minimal fields
are: schema version, lease identity, logical role, authority-event identity,
approved intent/scope/security identities, canonical worktree, writable paths,
immutable input references, context identity, and lifecycle state. Artifact
references are ordinary hash/path fields inside the lease.

`result_envelope` contains: schema version, lease identity, terminal or progress
status, changed/evidence paths, artifact references, commits, structured
findings, closure evidence, bounded diagnostics, next-prerequisite facts, and
the observed control-log sequence.

Both schemas are closed and versioned. No separate `AuthorityRef`, `ScopeLease`,
`ArtifactRef`, or `StateCursor` validators are introduced. The shared validator
canonicalizes JSON before hashing, bounds arrays and diagnostics, rejects
unknown fields, path/symlink escapes, and secret-shaped content, and binds every
result to one active lease and observed log sequence.

Alternative considered: five independently typed primitives. Rejected because
the caller would need to assemble and reconcile five identities for every
dispatch even though authority and scope always travel together and artifacts
and cursor positions have no independent lifecycle.

### 3. Use one append-only control log and derived projections

One coordinator-owned hash-linked JSONL log records only events that affect
control: operator authority, lease issue/revoke/close, accepted result,
transition, and mechanical release. Each record has one identity, sequence,
previous hash, type, provenance, and type-specific payload.

`00-state.md` and `reviews/findings-ledger.md` are human-readable projections
from that log. They never authorize work. General telemetry may remain in its
existing stream but cannot pause, authorize, rotate, or advance the pipeline.

The log avoids both the current dual authority record and the earlier proposal's
separate authority ledger, result inboxes, and findings authority.

Append is commit-last: validate and canonicalize the next record, verify its
sequence and previous hash, persist atomically, then project. Replay stops at
the first invalid record and never accepts a later record across the gap.

### 4. Admit a hard control only when it prevents a named failure

The current route retains five floors: live authority for semantic/scope or
outward changes, exclusive mutable ownership, immutable input integrity,
independent acceptance/security evidence, and native permission/security
enforcement. A routing rule must map to one of these failures and have an
executable check plus bounded recovery. Otherwise it is guidance or telemetry.

This is enforced through closed routing enums and behavioral tests, not through
another machine-readable control manifest.

### 5. Reuse the existing dispatch/result transport

Main sends a `capability_lease` as part of the existing immutable work capsule.
The specialist returns one `result_envelope` through the runtime's native
terminal-result channel. Main validates it and appends the accepted result to
the control log before projecting state.

There are no role-owned inboxes, specialist-written coordinator files, fixed
receipt exchanges, or peer-issued leases. If terminal transport is interrupted,
Main first reads the runtime's durable terminal status; otherwise causal
recovery decides whether the same session can continue or a fresh one is
required.

The current work capsule remains the immutable transport container. It carries
the lease rather than duplicating its authority, scope, hashes, roots, or
ownership in prompt prose. Main accepts a result identity once, appends that
acceptance before changing any projection, and treats repeats as idempotent.

### 6. Keep a lease across valid same-agent continuation

A lease stays valid across follow-up turns while role, authority, semantic
scope, worktree, immutable inputs, context identity, and exclusive ownership
remain unchanged. Main may send only delta evidence. It revokes or replaces the
lease when any identity changes, ownership transfers, context becomes
unverifiable, or the task closes.

Fresh QA is required for a changed Freeze. Security is fresh when the impact
predicate is true or cannot be proven false. Counts, elapsed time, tool calls,
and compaction thresholds are warnings only; verified context loss is the
rotation condition.

### 7. Let liveness report facts and causal recovery choose the action

Liveness reports delivery, acknowledgement, terminality, declared progress,
and interruption facts. It does not choose retry, resume, replacement, or
failure. Recovery preserves valid progress, proves the prior writer safe, and
selects continuation, replacement, or pause from authority, identity, context,
ownership, and changed causal evidence.

The completed hardening change's one-probe, one-renewal, and one-replacement
allowance is deliberately not carried into v5 routing. A bounded probe may
still collect delivery facts, but neither the probe count nor an attempt number
authorizes interruption or replacement.

### 8. Make preflight, cleaner, and quality demand-driven

Activation validates only the pipeline core and the architect needed next.
Every other role is checked immediately before its first possible dispatch
using the existing canonical registry and generated-role freshness checks. No
new ABI manifest is added. A persisted model/effort choice is execution
metadata and is reused while still available.

Pre-implementation checks cover prerequisites and the per-task red condition,
not the full candidate quality set. Deterministic hygiene produces a safe
allowlist; an empty set causes no cleaner dispatch. Complete quality runs once
per candidate tree at Freeze and again only after that tree changes.

The standard Codex role matrix remains unchanged: the live or standard
Sol/Luna model-and-effort choice is persisted as non-authoritative execution
metadata and revalidated only when the role becomes dispatchable.

### 9. Quarantine compatibility in a one-shot v5 converter

The converter validates supported v1-v4 authority, state, bindings, immutable
inputs, and dirty progress, then creates a v5 control log and projections in a
create-then-switch transaction. Missing or conflicting authority pauses for a
live decision; mechanical projection differences are repaired automatically.
Normal v5 dispatch and recovery do not import legacy routing modules.

The converter preserves the precise service/error returned by binding
validation and accepts a legacy continuation only after verifying the original
Gate, certificate identity, current aggregate, repair evidence, and authority
timeline. Create-then-switch writes the new log and projections beside the old
state, validates them completely, and changes the current pointer last.

### 10. Keep canonical sources and runtime projections substantive

The canonical pipeline helpers and semantic agent contracts change first.
Codex instruction adapters, packaged helpers, generated TOMLs, plugin agent
copies, and opencode projections are regenerated only after their canonical
sources pass focused tests. Projection tests assert behavior-bearing markers
and helper parity rather than merely checking file existence.

## Technical Invariants

| ID | Invariant |
|---|---|
| I-1 | Protected semantic, scope, security, Gate, and outward actions require a valid live authority event. |
| I-2 | One canonical worktree has at most one committing writer; immutable readers may overlap. |
| I-3 | Leases, results, snapshots, capsules, and migration inputs are identity-bound, contained, regular non-symlink data. |
| I-4 | A changed Freeze gets fresh QA; security is fresh when impact is true or cannot be proven false. |
| I-5 | Main alone appends control events and writes state, finding, Gate, and acceptance projections. |
| I-6 | Conversion never invents authority, mixes writable schemas, or overwrites a valid v5 workspace with v4 state. |
| I-7 | Claude, Codex, opencode, installed plugin helpers, and generated role projections preserve the same control semantics. |
| I-8 | Complete quality runs exactly once per candidate identity; cleaner runs only for a deterministic safe allowlist. |
| I-9 | Counts, ordinals, elapsed time, and telemetry never authorize, pause, rotate, or advance work. |

## Services Touched

- Canonical pipeline control helpers and their packaged runtime copies.
- Coordinator, specialist, Gate, state, validation, recovery, and delivery
  contracts for Claude, Codex, and opencode projections.
- OpenSpec binding/recovery compatibility, quality/cleaner policy, generated
  agent assets, contributor documentation, and deterministic test suites.

## Security Assessment

This change modifies authority guards, validation gates, error handling,
exclusive-write enforcement, and legacy fail-closed behavior, so
`changes_security_control` is true. The security lens must cover forged
provenance, nonce reuse, log truncation/reordering, lease transfer, path and
symlink escape, result replay, hash confusion, secret leakage, ambiguous legacy
authority, and outward-action ordering. Native sandbox and host permission
policy remain independent enforcement layers.

## Risks / Trade-offs

- [A log bug could mis-project authority or state] -> Closed records, hash links,
  replay fixtures, atomic append, and fail-closed recovery.
- [A long-lived lease could outlive valid ownership] -> Revalidate its identity
  before every follow-up and revoke on any ownership, input, or context change.
- [Native result transport can be interrupted] -> Inspect durable terminal state
  first, preserve repository progress, then use causal recovery.
- [Lazy role validation discovers an issue later] -> Stop immediately before
  that role's dispatch without invalidating prior authority or work.
- [Demand-driven cleaner misses optional polish] -> Quality and QA remain
  mandatory; absence of deterministic safe cleanup causes no mutation.
- [Migration ambiguity could fabricate authority] -> Fail closed and request
  only the missing live decision.
- [A broad projection regeneration could overwrite unrelated dirty files] ->
  Create the isolated worktree from the immutable base, keep all tasks
  sequential there, and compare generated output only inside that worktree.
- [Superseded active deltas could later reintroduce old routing] -> Keep their
  retained outcomes in current scenarios and treat conflicting application
  after v5 cutover as mixed-spec validation failure.

## Migration Plan

1. Freeze representative v1-v4 fixtures for Gate, correction, interruption,
   multi-repository ownership, dirty progress, precise binding failures, and a
   verified legacy continuation.
2. Land schemas, log replay, leases, results, projections, and causal recovery
   behind v4 shadow comparisons.
3. Land staged role preflight plus demand-driven cleaner and Freeze quality.
4. Run create-then-switch conversion, verify the v5 representation, and change
   the current pointer last.
5. Assert current dispatch/recovery entrypoints reject legacy fields and imports.
6. Regenerate all runtime projections and run focused, full, security,
   migration, strict OpenSpec, and before/after friction checks.

Rollback before cutover leaves v4 untouched. After a v5 workspace exists,
rollback must remain able to read v5 and must never overwrite it with v4 state.

## Work Plan

All committing tasks use
`/home/valian/projects/team-harness/.worktrees/simplify-pipeline-control-plane`
on branch `feat/simplify-pipeline-control-plane` from immutable base
`85c3eef6ae3fdcb50db737d2b971feb677d6b802`. They are sequential because a
single canonical worktree shares Git index/ref metadata. The slices are:

1. closed primitives and append/replay;
2. sole-authority projections and Gate/state integration;
3. leased dispatch and exclusive ownership;
4. result acceptance and role envelopes;
5. same-agent continuation plus fact-only liveness;
6. staged role preflight and model metadata;
7. conditional cleaner and one Freeze quality run;
8. one-shot converter and v5 cutover;
9. cross-runtime projection, documentation, strict validation, and friction evidence.

Scope remains aligned with the approved simplification request. No unresolved
operator decision changes the specifications, approach, or task breakdown.
