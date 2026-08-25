## Context

See `proposal.md` for motivation. Today workspace identity is duplicated across activation, initiative, trace, and documentation contracts; the v3 state schema and OpenSpec helpers accept one binding; and HerdR has no Team Harness adapter even though its CLI intentionally separates literal text staging from Enter submission. The local HerdR CLI confirms `agent list`, `agent send`, `pane send-keys`, and `agent read` as distinct operations, queues submitted input while an agent is working, and exposes `idle`, `working`, `blocked`, and `unknown` states.

The design must preserve the coordinator as the sole state/gate owner, service-owned OpenSpec sources, immutable hashes, native permission policy, and fail-closed behavior for required planning or workspace evidence.

## Goals / Non-Goals

**Goals:**

- Make workspace identity and OpenSpec binding membership deterministic, persisted, and independently testable.
- Gather all service-owned Design inputs before a single initiative Gate 1, then preserve the existing serial execution safety invariant.
- Make HerdR delivery transactional and observable so staged text cannot be reported as sent.
- Keep canonical sources and shipped runtime projections mechanically synchronized.

**Non-Goals:**

- Installing, updating, configuring, or granting permissions to HerdR.
- Turning an evidence-only repository into a writable participant or creating OpenSpec artifacts for it.
- Parallelizing service implementation, weakening per-service validation, merging repositories, or creating a coordinator repository.
- Migrating an active historical workspace to a new filesystem location.

## Decisions

### 1. One deterministic workspace-identity resolver owns path composition

Add a bounded resolver used by activation, initiative discovery, recovery, trace, and pipeline listing. Its input is normalized effective configuration plus verified repository identities, pipeline shape, date, and slug; its output is a versioned identity object containing `coordinator_root`, `workspace_kind`, `repo_base`, `date`, `feature`, `initiative`, and ordered service locations. The helper validates containment, symlinks, ambiguity, and repository identity but does not create state. The existing live write probe remains a separate prerequisite.

The formula is written once in the canonical initiative/workspace contract and implemented once in the resolver. Consumers refer to the identity object and are linted against embedding competing initiative formulas. New single-repository paths are date-prefixed; a confirmed Obsidian initiative resolves to `{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}` and service artifacts live below `{coordinator_root}/{service}`.

Alternative considered: fix only `pipeline/references/activation.md`. Rejected because trace, recovery, pipelines, documentation, and agent prompts would remain free to drift again.

### 2. New runs use one v4 coordinator state with an ordered binding collection

Bump the new-run state schema to `pipeline_version: 4`. The initiative root owns one `00-state.md`; service-specific planning, implementation, validation, and delivery artifacts remain in deterministic child directories. Replace singular OpenSpec state with:

- `openspec_bindings[]`: stable service key, repository root and identity, role (`writable-owner`), change/planning identities, preflight/design status, snapshot path/hash, overlay path/hash, and task-progress identity;
- `evidence_repositories[]`: separately typed read-only repositories and evidence purpose;
- `openspec_aggregate_path` and `openspec_aggregate_sha256`: the ordered binding set, roles, dependencies, execution order, and child hashes;
- initiative-level Gate-1 evidence bound to the aggregate hash.

Single-repository v4 runs use exactly one binding, avoiding a second schema and preserving the fail-closed ownership requirement. Recovery reads v3 singular fields through a compatibility adapter that produces an in-memory one-element binding without moving its workspace or silently rewriting historical gate identity. New writes use v4 only.

Alternative considered: retain one `00-state.md` per service and add an overview index. Rejected because it leaves gate authority and binding freshness distributed across several mutable state files—the defect the coordinator workspace is intended to remove.

### 3. Snapshots and overlays remain per service; the gate binds an aggregate manifest

Store service evidence under stable service-keyed paths, for example `inputs/openspec/<service>/snapshot.json` and `plan/openspec/<service>/traceability.json`. Derive `inputs/openspec-bindings.json` as canonical JSON with sorted keys but preserve the explicit execution order array. Its hash covers repository roles, immutable identities, each service snapshot/overlay hash, cross-service dependencies, and evidence-only dispositions.

The OpenSpec adapter, snapshot, overlay, progress, recovery, and event validators accept one binding at a time and an aggregate coordinator operation composes their results. This reuses existing single-binding validation rather than creating a weaker multi-repository validator. Any unreadable required service artifact, identity mismatch, invalid strict validation, ambiguous coordinate, or stale child/aggregate hash fails closed before Gate 1 or dispatch.

Alternative considered: concatenate all service specs into one coordinator snapshot. Rejected because it obscures ownership, creates unstable cross-repository paths, and risks turning the coordinator workspace into a second editable source of intent.

### 4. Initiative Design converges before one Gate 1; execution remains serial

The coordinator gathers and validates each writable service's OpenSpec artifacts and execution overlay, records evidence-only repositories, resolves cross-service dependencies, and computes the aggregate manifest before presenting Gate 1. The nonce and approval record bind the aggregate hash and exact ordered binding set. Any membership, role, dependency, order, repository identity, or child hash change invalidates the preview and requires reconciliation.

After approval, services execute in the aggregate order, one at a time, using their own pinned tasks and scenarios. They do not present another Gate 1. Existing per-service validation, Freeze, publication approval, and outward-write safety remain in force; the consolidated Gate 1 grants no authority to mutate evidence-only repositories.

Alternative considered: preserve per-service Gate 1. Rejected because the operator cannot approve cross-service dependencies or ownership as one coherent contract and later services can invalidate assumptions approved earlier.

### 5. HerdR uses a shared reference plus a deterministic adapter

Create one canonical `agents/_shared/herdr-agent-messaging.md` reference and package it with the existing shared-agent projection. Pipeline coordination and the `tmux`/`background` canonical skills link to that source instead of embedding command sequences. A bounded adapter invokes HerdR with argument arrays and emits a small JSON result; tests use a fake executable and never require a live HerdR session.

The adapter performs this transaction:

1. capability-check the required subcommands;
2. `herdr agent list`, then resolve one exact named target and pane;
3. `herdr pane current --current`, then require sender agent, terminal, and pane identity while allowing an optional label;
4. build a size-limited plain-text envelope containing verified sender identity, role, initiative/feature, repository/workspace, purpose, response expectation, current-session response channel, and a non-secret message id;
5. stage with `herdr agent send <target> <text>` in any reported agent state;
6. list again and require the same target-to-pane mapping while allowing state drift;
7. submit with `herdr pane send-keys <pane> enter`, which queues input while the agent is working;
8. read the same target with bounded lines and retries and classify the result.

Only committed transcript evidence permits `received`. A failed Enter returns `staged-not-submitted`; a successful Enter without immediate committed transcript evidence returns `queued` and never triggers automatic resend. `idle`, `working`, `blocked`, and `unknown` all accept queued submission. The adapter never evaluates message text as shell syntax and never claims gate or operator authority.

Alternative considered: document raw commands in each skill. Rejected because the exact omission that caused the incident—forgetting Enter or verification—would remain easy to reproduce and difficult to test.

### 6. Canonical and generated surfaces fail freshness checks together

Extend generation manifests so the workspace resolver, HerdR adapter/reference, pipeline references, and runtime projections are copied from declared canonical inputs. Add semantic checks that reject singular OpenSpec fields in new-run templates, conflicting initiative formulas, HerdR send paths without submit/read verification, and stale generated files. Existing `generate --check`, generation tests, skill sync checks, lint, and focused runtime suites remain release evidence.

### 7. OpenSpec derivation projects explicit judgment instead of certifying scaffolds

The single planning architect appends one closed execution-contract JSON block to canonical `tasks.md`. It owns every value a deterministic script cannot infer from task prose: real worktree/base, product files, dependencies, invariants, evidence, discovery scope, required seams, quality argv, observable-runtime classification, test-first routing, cross-runtime preservation, and rollback. The snapshot already hash-binds `tasks.md`; `derive` reads that exact source, validates one record per task coordinate, and emits overlay v2, complete readable shards, and the workspace quality manifest.

`derive` writes no Gate-1 artifact when the contract is absent, malformed, stale, placeholder-bearing, incomplete, or outside writable roots. `plan-contract` independently rejects placeholder execution controls and missing or hash-mismatched quality manifests. This preserves the one-architect Design goal without pretending that task titles reveal file ownership or executable verification.

### 8. Post-Gate repair is an identity-preserving replay, not a design correction

Add a `repair-derived` operation to the overlay helper for the implementation-entry preflight. The coordinator supplies the snapshot and overlay SHA-256 values from the already verified aggregate binding plus a positive assertion that no specialist dispatch or progress transition exists. The helper first verifies the live snapshot bytes, every canonical source through the existing snapshot verifier, and the complete execution contract. It derives into an isolated staging directory, validates the staged set, and requires its overlay bytes to equal the approved overlay SHA-256 before touching live derived artifacts.

Eligible output is the closed derived set: compact plan index, every task shard, `.team-harness/quality.json`, and traceability overlay. Replacement uses staged files, per-target before/after hashes, backup-and-rollback behavior, and a commit-last repair evidence record. After replacement the coordinator reruns overlay, plan-contract, aggregate-manifest, and consolidated-gate verification; because snapshot, overlay, aggregate, binding order, nonce, and gate identity are unchanged, no new Gate 1 is needed.

The operation refuses missing canonical execution judgment, source or task-intent drift, unrecorded or existing implementation progress, a stale aggregate/gate assertion, a regenerated overlay hash mismatch, unsafe roots, or any staging/rollback failure. In particular, historical scaffolds whose canonical OpenSpec never contained product files, quality commands, discovery scope, evidence, preservation, and rollback are not mechanically repairable: supplying those values would change approved judgment rather than restore derived bytes.

Alternative considered: let Main or an architect fill missing fields after Gate 1 and call them derived. Rejected because neither task titles nor placeholder shards encode the missing choices, and the resulting overlay hash would no longer be the identity the operator approved.

### 9. Legacy v1 uses a supplemental continuation identity

The v2 byte-identical repair path cannot recover a Gate that approved a defective placeholder overlay: executable replacement necessarily changes snapshot, overlay, and aggregate hashes. For that historical class, keep `inputs/gate1-binding.json` immutable and add `inputs/gate1-v1-migration.json`. The latter is not a rewritten Gate. It is a deterministic certificate over the original gate identity/aggregate, the live operator-decision event, the repair-evidence bytes, the current aggregate, exact per-service normative task-prefix hashes, and the successful-repair/first-dispatch ordering.

The migration helper supports adoption of a repair already completed in the workspace. It recomputes the original Gate's self-identity, requires the gate release and live operator decision in the append-only event log, requires repair success after that decision and before the first implementation-role `agent.spawn`, verifies the repair-evidence SHA-256 from the event, validates each current binding and overlay, and proves that the canonical text before `## Team Harness Execution Contract` hashes exactly to the approved normative prefix. Design-phase architect dispatches do not count as implementation start. It then writes only the certificate; it never edits canonical OpenSpec, plan shards, snapshots, overlays, aggregate, progress, event history, or the Gate record.

The continuation identity hashes the original gate identity, original aggregate, repair evidence, current aggregate, service order, and authority-event hash. Recovery and implementation must verify both records and the current artifacts. A later aggregate change, task-prefix change, missing evidence, service-order drift, or invalid event chronology breaks the chain and fails closed.

Alternative considered: overwrite the old Gate's aggregate hash with the repaired aggregate. Rejected because that would erase what the operator actually approved and make audit evidence internally inconsistent.

### 10. Aggregate implementation freshness selects a phase per binding

`verifyOpenSpecBindingsManifest` cannot pass one initiative-level implementation phase blindly to every snapshot verifier. For each binding with explicitly supplied authorized task IDs, it verifies exactly those IDs in implementation mode. For a binding with no new authorization, it reads the hash-bound snapshot's progress record: no progress events means pre-Gate freshness, while existing events mean an idempotent implementation verification using only the most recent durable event IDs. This permits serial multi-service advancement without manufacturing a zero-task transition or allowing one service's task authority to satisfy another.

The snapshot verifier remains the authority for intent drift, rollback, event consistency, and unauthorized advancement. Aggregate phase selection adds no mutation and does not weaken fail-closed behavior: an untouched binding with source drift fails pre-Gate verification, and a progressed binding whose current checkbox state exceeds or contradicts its recorded progress fails implementation verification.

### 11. Specialist silence closes through a bounded liveness lease

Keep ordinary native wait timeouts as non-decision heartbeats until the role SLA. At that deadline, a pure helper receives the role, attempt number and token, dispatch/probe/ACK timestamps, native status, and post-interrupt declared-path audit flags. It returns one closed action: `wait`, `probe`, `interrupt`, `collect`, `replace`, or `block`. The coordinator sends at most one token-bound probe; a matching bounded checkpoint renews the lease once for the same role SLA, and no second renewal exists.

An expired lease authorizes interruption, not immediate replacement. The coordinator first confirms terminal interruption and then audits only the role packet's declared owned paths and expected evidence paths. Any work or evidence blocks to protect partial output from a concurrent writer. A clean first attempt permits one fresh same-role replacement; a clean second attempt exhausts the liveness budget and blocks. Main never implements, tests, cleans, validates, or prepares delivery as a fallback.

The architect remains outside this automatic lease because Design silence may conceal unresolved operator-facing judgment; its existing operator-owned timeout continues unchanged. Implementation, tester, cleaner, QA, security, and delivery roles use the bounded lease. Recovery reconstructs the persisted attempt/lease identity rather than resetting elapsed time.

Alternative considered: launch repeated fresh specialists or let Main complete a single-file task locally. Rejected because repeated attempts are unbounded and local fallback violates specialist separation, can overlap a still-running writer, and cannot supply an independent tester/QA/security verdict.

### 12. Derived artifacts acquire a permanent dispatch identity under one lock

Before Main builds the first specialist packet for a service, it acquires the same atomic per-service lock used by `repair-derived`, recomputes the approved aggregate, Gate, snapshot, and overlay identity, hashes the compact plan, workspace quality manifest, and every overlay-declared task shard, and creates `inputs/openspec/<service>/dispatch-binding.json` with create-only semantics. Every later fresh dispatch recomputes and compares that closed record. A mismatch is stale evidence, not permission to rehash the packet.

`repair-derived` checks for that permanent seal while holding the same lock. If repair owns the lock first, sealing returns `DERIVED_SET_BUSY` and may be retried only after repair closes; if sealing owns it first, all later repairs return `DERIVED_REPAIR_INELIGIBLE`. A pre-existing lock is never deleted or stolen. This makes the transition from repairable derived state to dispatchable immutable state linearizable and removes the check/write gap left by a caller-supplied `implementationStarted: false` assertion.

Alternative considered: reread the event log immediately before replacement or simply rehash every binding after a mismatch. Rejected because a dispatch can still begin between the final read and the write, while rebinding stale packets normalizes unauthorized concurrent mutation instead of detecting it.

## Risks / Trade-offs

- [The v4 state and consolidated Gate 1 change initiative recovery semantics] → Keep a read-only v3 compatibility adapter, fixtures for interrupted v3 runs, and no automatic workspace migration.
- [One pre-execution Gate 1 increases initial Design work] → Validate service bindings independently and surface precise per-binding failures while preserving one operator decision.
- [A service changes after another begins implementation] → Recompute child and aggregate hashes; invalidate continuation on intent or membership drift while accepting only verified monotonic checkbox progress.
- [HerdR transcript rendering may not prove receipt immediately while input is queued] → Return `queued`, never auto-resend, and keep native coordination available.
- [A queued message may remain pending for the duration of a long agent turn] → Preserve its message id as durable pending state and inspect later without blocking submission or duplicating input.
- [Path changes could orphan historical workspaces] → Resolve historical runs exclusively from persisted identity and date-agnostic discovery with repository-identity confirmation; never move them automatically.
- [Execution metadata increases canonical task structure] → Keep it in one machine-readable block, validate a closed bounded schema, and project rather than duplicate judgment across workspace artifacts.
- [A failed multi-file replacement could leave a mixed derived set] → Stage and validate the complete set first, retain bounded backups during replacement, roll back on any write failure, and write repair evidence last as the commit record.
- [A migration certificate could be mistaken for retroactive approval] → Require a pre-repair live operator decision in the immutable event chronology, preserve the original Gate bytes, label the new hash a continuation identity, and make both records mandatory on every later consume.
- [A global implementation phase can manufacture empty transitions for untouched services] → Select freshness mode independently per binding and reuse only that binding's last durable progress IDs when no new transition is authorized.
- [An interrupted specialist may have produced unreported work] → Confirm interruption, audit only declared owned/evidence paths, and block rather than replace whenever either surface changed.
- [A liveness ACK could renew the wrong attempt indefinitely] → Bind it to one attempt token, cap it at 512 bytes, allow exactly one role-SLA renewal, and cap the role at two total attempts.
- [A repair could rewrite shards between Main's preflight and specialist read] → Serialize repair and dispatch sealing with one create-only per-service lock, persist the exact derived-set hashes, and make post-seal repair or hash rebinding fail closed.

## Migration Plan

1. Add failing fixtures for divergent workspace formulas, v3 recovery, multiple service bindings, aggregate freshness, evidence-only repositories, and every HerdR delivery outcome.
2. Introduce the shared workspace resolver and v4 state schema while retaining v3 read compatibility.
3. Generalize OpenSpec helpers to per-binding operations and add the aggregate manifest and consolidated Gate-1 binding.
4. Update canonical pipeline, recovery, trace, initiative, tmux, and background contracts, then regenerate all packaged/runtime projections.
5. Run focused suites, strict OpenSpec validation, generation freshness, lint, and the relevant shared-runtime suite.
6. Release as a versioned Team Harness update. Rollback restores the prior runtime package; v4 workspaces remain blocked with an explicit unsupported-version result rather than being downgraded or rewritten.
