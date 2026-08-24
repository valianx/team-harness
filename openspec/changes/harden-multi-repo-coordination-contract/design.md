## Context

See `proposal.md` for motivation. Today workspace identity is duplicated across activation, initiative, trace, and documentation contracts; the v3 state schema and OpenSpec helpers accept one binding; and HerdR has no Team Harness adapter even though its CLI intentionally separates literal text staging from Enter submission. The local HerdR CLI confirms `agent list`, `agent wait`, `agent send`, `pane send-keys`, and `agent read` as distinct operations and exposes `idle`, `working`, `blocked`, and `unknown` states.

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
3. if not `idle`, wait boundedly for `idle`, then list and revalidate;
4. build a size-limited plain-text envelope containing sender role, initiative/feature, repository/workspace, purpose, response expectation, and a non-secret message id;
5. stage with `herdr agent send <target> <text>`;
6. list again and require the same target-to-pane mapping;
7. submit with `herdr pane send-keys <pane> enter`;
8. read the same target with bounded lines and retries and classify the result.

Only committed transcript evidence permits `received`. A failed Enter returns `staged-not-submitted`; ambiguous post-submit evidence returns `submitted-unverified` and never triggers automatic resend. `working`, `blocked`, and `unknown` normalize to busy. Busy timeout returns `pending-busy` without staging. The adapter never evaluates message text as shell syntax and never claims gate or operator authority.

Alternative considered: document raw commands in each skill. Rejected because the exact omission that caused the incident—forgetting Enter or verification—would remain easy to reproduce and difficult to test.

### 6. Canonical and generated surfaces fail freshness checks together

Extend generation manifests so the workspace resolver, HerdR adapter/reference, pipeline references, and runtime projections are copied from declared canonical inputs. Add semantic checks that reject singular OpenSpec fields in new-run templates, conflicting initiative formulas, HerdR send paths without submit/read verification, and stale generated files. Existing `generate --check`, generation tests, skill sync checks, lint, and focused runtime suites remain release evidence.

## Risks / Trade-offs

- [The v4 state and consolidated Gate 1 change initiative recovery semantics] → Keep a read-only v3 compatibility adapter, fixtures for interrupted v3 runs, and no automatic workspace migration.
- [One pre-execution Gate 1 increases initial Design work] → Validate service bindings independently and surface precise per-binding failures while preserving one operator decision.
- [A service changes after another begins implementation] → Recompute child and aggregate hashes; invalidate continuation on intent or membership drift while accepting only verified monotonic checkbox progress.
- [HerdR transcript rendering may not prove receipt on every supported agent UI] → Return `submitted-unverified`, never auto-resend, and keep native coordination available.
- [Busy agents could remain unavailable indefinitely] → Use bounded waiting and a retryable `pending-busy` result with no partial input.
- [Path changes could orphan historical workspaces] → Resolve historical runs exclusively from persisted identity and date-agnostic discovery with repository-identity confirmation; never move them automatically.

## Migration Plan

1. Add failing fixtures for divergent workspace formulas, v3 recovery, multiple service bindings, aggregate freshness, evidence-only repositories, and every HerdR delivery outcome.
2. Introduce the shared workspace resolver and v4 state schema while retaining v3 read compatibility.
3. Generalize OpenSpec helpers to per-binding operations and add the aggregate manifest and consolidated Gate-1 binding.
4. Update canonical pipeline, recovery, trace, initiative, tmux, and background contracts, then regenerate all packaged/runtime projections.
5. Run focused suites, strict OpenSpec validation, generation freshness, lint, and the relevant shared-runtime suite.
6. Release as a versioned Team Harness update. Rollback restores the prior runtime package; v4 workspaces remain blocked with an explicit unsupported-version result rather than being downgraded or rewritten.
