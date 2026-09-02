## Context

See `proposal.md` for motivation and `specs/**/spec.md` for required behavior.
The v4 runtime already has bounded ownership, Freeze identities, quality
envelopes, causal evidence, and canonical OpenSpec planning. The problem is not
the absence of control; it is that Design compiles the same meaning into a large
execution contract, snapshots, overlays, shards, and capsules before work can
start, while the same decision is represented in too many control records.

Main remains the sole operator-facing coordinator and state-machine owner.
Specialists share filesystem and Git metadata, so one canonical worktree still
cannot have concurrent committing writers. The current checkout is dirty at
base `85c3eef6ae3fdcb50db737d2b971feb677d6b802`, so implementation uses a clean
isolated worktree under the repository's ignored `.worktrees/` directory.

### Effective specification baseline

| Source | Disposition in this change |
|---|---|
| Main `openspec-design-orchestration` | Preserve canonical OpenSpec intent, strict validation, separate repository/workspace homes, and Gate 1. Replace semantic overlays, exhaustive execution contracts, and mandatory per-artifact snapshots with one pinned canonical identity plus just-in-time operational leases. |
| Completed `harden-multi-repo-coordination-contract` | Preserve ordered service membership, consolidated Gate 1, exclusive ownership, precise binding failures, and read-only evidence. Supersede fixed probe/renewal/replacement allowances and any hot-path requirement for a complete future dispatch graph. |
| Active `repair-legacy-v1-migration-dispatch` | Absorb its precise `failed_binding` diagnostics and verified continuation authorization into the v5 converter. The legacy branch is not a second current route. |
| Main gate, validation, Freeze, and Codex parity specs | Replace dual authority, ordinal correction routing, universal tester/QA duplication, and the `qa-plan` role; retain independent final verification, conditional test independence, security floors, one complete Freeze run, and the standard Sol/Luna role matrix for surviving roles. |

The hardening change is the completed behavioral baseline even while its delta
remains active. This change is the authoritative successor for liveness and
legacy hot-path behavior. Lifecycle handling may sync/archive or mark those
changes superseded, but implementation must not edit their planning trees or
apply their conflicting clauses after v5 cutover.

## Goals / Non-Goals

**Goals:**

- Express dispatch and completion with two objects and one durable control log.
- Keep Design operator-readable while making OpenSpec its only semantic source.
- Derive execution detail just in time and batch coherent same-worktree work.
- Make validation lenses depend on reproducible risk and changed impact.
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
- Replacing Gate 1 with automatic plan approval or removing explicit
  operator-requested plan review.
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

`capability_lease` combines authority and work ownership. It is derived just in
time for one dependency-ready worktree batch. Its minimal fields
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

### 5. Reuse native dispatch/result transport without a semantic capsule graph

Main sends one `capability_lease` through the runtime's existing specialist
dispatch. The specialist returns one `result_envelope` through the native
terminal-result channel. Main validates it and appends the accepted result to
the control log before projecting state.

There are no role-owned inboxes, specialist-written coordinator files, fixed
receipt exchanges, or peer-issued leases. If terminal transport is interrupted,
Main first reads the runtime's durable terminal status; otherwise causal
recovery decides whether the same session can continue or a fresh one is
required.

An implementation may serialize a lease and its immutable references as one
transport envelope, but it MUST NOT require a Design-authored semantic overlay,
permanent future task capsule, or duplicated prompt graph. Main accepts a result
identity once, appends that acceptance before changing any projection, and
treats repeats as idempotent.

### 6. Keep a lease across valid same-agent continuation

A lease stays valid across follow-up turns while role, authority, semantic
scope, worktree, immutable inputs, context identity, and exclusive ownership
remain unchanged. Main may send only delta evidence. It revokes or replaces the
lease when any identity changes, ownership transfers, context becomes
unverifiable, or the task closes.

A fresh independent verifier is required for a changed Freeze. A separate
tester exists only when its recorded risk predicate requires test independence;
security is fresh when impact is true or cannot be proven false. Counts,
elapsed time, tool calls, and compaction thresholds are warnings only; verified
context loss is the rotation condition.

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

### 8. Make role preflight, testing, cleaner, and quality demand-driven

Activation validates the pipeline core. Architect is checked only when the
bound OpenSpec change needs authorship or semantic update. Every other surviving
role is checked immediately before its first possible dispatch using the
existing canonical registry and generated-role freshness checks. `qa-plan` is
removed from semantic sources, rosters, packaged copies, generated assets,
define-AC routing, and explicit plan-review routing. No new ABI manifest is
added. A persisted model/effort choice is execution metadata and is reused while
still available.

Pre-implementation checks cover prerequisites only. A separate tester and RED
contract run only for a recorded bug-reproduction, migration/data-safety,
public-compatibility, security-control, stale-independent-evidence, or explicit
operator predicate. Otherwise the implementer owns tests and production in one
bounded batch. Deterministic hygiene produces a safe allowlist; an empty set
causes no cleaner dispatch. Complete quality runs once per candidate tree at
Freeze and again only after that tree changes.

The standard Codex model tiers for surviving roles remain unchanged. The live
or standard Sol/Luna choice is persisted as non-authoritative execution metadata
and revalidated only when the role becomes dispatchable.

### 9. Keep Design as a thin OpenSpec-to-Gate transaction

Canonical `proposal.md`, delta specs, `design.md`, and `tasks.md` remain in the
bound repository change. If they already exist and pass `openspec validate
--strict`, Main does not dispatch architect. If authorship or an operator edit
is required, one architect uses the upstream propose/update workflow.

Main then generates `01-plan.md` as a compact operator projection containing
observable outcome, included/excluded scope, approach, coherent work batches,
material risks and decisions, unchanged behavior, links, and the pinned
OpenSpec identity. It contains no duplicated AC/TC text, file-by-task graph,
commands, seams, or dispatch schema; it is regenerated, never manually edited.

Gate 1 reads this projection and links canonical OpenSpec. An explicit
`/th:plan-review` may run the surviving plan reviewer over canonical OpenSpec and
projection fidelity, but no `qa-plan`, security design panel, or automatic
review fan runs. A semantic finding updates OpenSpec, regenerates the projection,
and requires the ordinary Gate presentation over the new identity.

Alternative considered: retain the exhaustive execution contract in
`tasks.md`. Rejected because it consumed most of the planning artifact, forced
future operational guesses before dependencies were ready, and allowed derived
metadata to block an otherwise valid change.

### 10. Quarantine compatibility in a one-shot v5 converter

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

### 11. Keep canonical sources and runtime projections substantive

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
| I-3 | Canonical OpenSpec inputs, leases, results, generated projections, and migration inputs are identity-bound, contained, regular non-symlink data. |
| I-4 | A changed Freeze gets one fresh independent verifier; a separate tester and security lens run only when their closed predicates require them. |
| I-5 | Main alone appends control events and writes state, finding, Gate, and acceptance projections. |
| I-6 | Conversion never invents authority, mixes writable schemas, or overwrites a valid v5 workspace with v4 state. |
| I-7 | Claude, Codex, opencode, installed plugin helpers, and generated role projections preserve the same control semantics. |
| I-8 | Complete quality runs exactly once per candidate identity; separate RED/tester and cleaner work run only for a recorded matching predicate. |
| I-9 | Counts, ordinals, elapsed time, and telemetry never authorize, pause, rotate, or advance work. |
| I-10 | OpenSpec is the sole semantic plan; `01-plan.md` is a regenerated operator projection and never an editable authority source. |

## Services Touched

- Canonical pipeline control helpers and their packaged runtime copies.
- Coordinator, specialist, Gate, state, validation, recovery, and delivery
  contracts for Claude, Codex, and opencode projections.
- Removal of `qa-plan` from semantic sources, rosters, define-AC and plan-review
  routing, packaged copies, documentation, and current tests.
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
  mandatory through the independent verifier; absence of deterministic safe
  cleanup causes no mutation.
- [A compact plan omits useful operator context] -> Generate the fixed readable
  outcome/scope/approach/batches/risks/decisions/preservation/link surface and
  link canonical OpenSpec for full detail.
- [Risk classification skips a useful tester] -> Use a closed fail-safe
  predicate; public compatibility, migrations, security controls, unknown
  impact, and explicit operator request select the independent tester path.
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
3. Land thin OpenSpec Design, compact `01-plan.md`, JIT batch leases, `qa-plan`
   removal, staged role preflight, risk-derived validation, demand-driven
   cleaner, and Freeze quality.
4. Run create-then-switch conversion, verify the v5 representation, and change
   the current pointer last.
5. Assert current dispatch/recovery entrypoints reject legacy fields and imports.
6. Regenerate all runtime projections and run focused, full, security,
   migration, strict OpenSpec, and before/after friction checks.

Rollback before cutover leaves v4 untouched. After a v5 workspace exists,
rollback must remain able to read v5 and must never overwrite it with v4 state.

## Work Plan

Implementation uses dependency-ready batches in one canonical worktree; the
exact worktree, writable files, seams, helper coordinates, and commands are
resolved immediately before each lease rather than embedded in this design.
The ordered batches are:

1. thin OpenSpec Design, compact operator projection, and `qa-plan` retirement;
2. closed primitives, control-log append/replay, and derived Gate/state views;
3. JIT batch leases, result acceptance, exclusive ownership, and causal recovery;
4. staged role preflight, risk-derived testing/verification/security, conditional
   cleaner, and one Freeze quality run;
5. one-shot converter, v5 cutover, cross-runtime projections, documentation,
   strict validation, and before/after friction evidence.

Scope remains aligned with the approved simplification request. No unresolved
operator decision changes the specifications, approach, or task breakdown.
