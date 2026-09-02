## Context

See `proposal.md` for motivation. The Codex update contract currently exposes each convergence concern as a separate coordinator tool call: plugin and marketplace inspection, marketplace refresh, plugin replacement, snapshot bridging, native settings, runtime inspection, two feature enables, agent inspection and synchronization, MCP inspection, hook verification, and a final repetition of most reads. Most calls are no-ops on a healthy installation, but every call incurs model/tool round-trip latency.

The existing helpers already implement the important ownership and filesystem rules. The design should consolidate their decisions rather than weaken them. Plugin replacement must remain a native Codex operation, persistent runtime-profile writes still need attributable live approval, and a running thread must continue to use only a validated versioned snapshot.

## Goals / Non-Goals

**Goals:**

- Reduce post-install coordinator orchestration to one convergence call in the common case and one additional focused call only after live runtime approval.
- Make the common already-current path read-only and cheap.
- Return a single closed receipt that is sufficient for the operator report and recovery.
- Reuse the current domain safety rules and preserve idempotent recovery.

**Non-Goals:**

- Reimplement Codex marketplace discovery or plugin installation.
- Make all filesystem changes atomic as one rollback unit.
- Auto-approve persistent runtime configuration or broaden sandbox permissions.
- Change setup behavior or the Claude Code and OpenCode update paths unless shared extraction is mechanically necessary.
- Add pipeline state, an update workspace, specialist dispatch, or an external dependency.

## Decisions

### 1. Keep snapshot selection and convergence as two authority stages

The update skill will retain a short native snapshot-selection stage: identify the loaded manifest, refresh the Team Harness marketplace, compare the source manifest semantically, and invoke native plugin installation only when required. It will eliminate redundant plugin-list reads when the same facts are already available from the loaded manifest, marketplace metadata, source manifest, and installation receipt.

After selection, exactly one versioned helper from `NEW_PLUGIN` owns post-install convergence. Keeping native installation outside the helper preserves Codex's plugin authority and avoids asking an old loaded script to replace itself. Moving every later domain behind the new snapshot prevents old-contract drift.

Alternative considered: one helper that also shells out to marketplace upgrade and plugin add. Rejected because it blurs the native installation approval boundary and cannot safely replace the executable snapshot that supplied itself.

### 2. Implement a single-pass domain engine with a closed receipt

Add a Codex update convergence helper with one normal entry point and an optional explicit runtime-approval fingerprint bound to the pending delta. Internally it uses ordered domain adapters:

1. validate the exact old/new snapshot roots and bridge state;
2. ensure Team Harness native settings;
3. classify the persistent runtime profile;
4. inspect and enable missing required Codex features;
5. classify and synchronize bundled agents;
6. inspect expected MCP registrations without replacing them;
7. validate the exact bounded hook manifest;
8. verify changed-domain postconditions and aggregate restart state.

Each adapter returns the same small status shape and exposes no rendered secrets. The engine emits one JSON receipt on stdout and bounded diagnostics on stderr. It stops at an unsafe or failed domain, retains completed idempotent changes, and reports the failed domain. A subsequent invocation recomputes state; no separate update workspace or checkpoint file is needed.

Alternative considered: retain separate helpers and shorten only the skill prose. Rejected because the coordinator would still pay the same tool round trips and would remain responsible for joining heterogeneous outputs correctly.

### 3. Reuse domain logic as importable code, not subprocess every helper

Refactor or wrap existing configuration, runtime, agent, and bridge logic so the convergence engine can call their classify/apply functions in-process while their existing command-line interfaces remain compatible. Native Codex operations that have no safe library interface use the canonical absolute runtime executable, fixed argument arrays, sanitized environment, streaming output limits, and timeouts; they execute only when classification proves a change is needed. Snapshot-owned paths reject symlink components, and hook validation binds to exact packaged artifact digests rather than command substrings. In particular, the already-current path does not call two unconditional feature-enable commands or an agent inspect followed by an agent sync.

Alternative considered: invoke every existing helper as a child process inside one outer helper. It would reduce model round trips but retain duplicate parsing, process startup, and inspect-then-sync work. Compatibility shims may use subprocesses temporarily, but the target implementation shares domain functions.

### 4. Runtime approval pauses only the protected domain

The first pass applies and verifies all automatically authorized domains even when runtime classification is stale. It records the minimal redacted runtime delta and returns `pending-approval` without applying that domain. The skill renders this as a concise yes/no/change question and interprets a short unambiguous live response conversationally.

On approval, the skill reruns the same helper with the pending receipt's runtime-approval fingerprint. The helper recomputes every domain, rejects a changed delta or snapshot, skips current work, applies the runtime profile, and verifies it. The authorization is invocation-scoped and is never persisted or inferred. A decline preserves completed work and reports the ordinary update invocation as recovery.

Alternative considered: stop the first pass before all later domains, matching the current sequence. Rejected because it makes an optional runtime decision block unrelated safe reconciliation and increases the work repeated after approval.

### 5. Treat the receipt as the only final verification input

The receipt schema is versioned and closed. It contains snapshot identities, `current | converged | pending-approval | partial-convergence`, each declared domain's status, changed domains, restart requirement, a redacted pending-runtime summary, failed domain, and recovery invocation. Success is emitted only after all non-pending postconditions are checked. The coordinator validates the receipt and reports it; it does not rerun plugin, feature, agent, MCP, bridge, or hook inspections.

This converts performance from a prose aspiration into a testable orchestration invariant: after snapshot selection there is one coordinator convergence call before input and at most one more after runtime approval.

Alternative considered: emit free-form summaries from each domain. Rejected because they force the coordinator to reconstruct success and make malformed or partial output easy to misreport.

## Risks / Trade-offs

- **[A larger helper becomes a new control point]** → Keep domain adapters small, use a closed receipt schema, and test each adapter plus the joined pass independently.
- **[One escalated helper can touch several protected targets]** → Bind an escalated retry to the receipt's failed domain; every other domain is classification-only and fails rather than writing if it became stale. Runtime mutation remains under its separate delta-bound live authorization.
- **[Partial writes are not transactionally rolled back]** → Retain the existing monotonic idempotent model, expose the exact failed domain, and prove reruns skip completed postconditions.
- **[Refactoring existing helpers could change setup behavior]** → Preserve their CLI contracts and add parity fixtures before switching update to shared functions.
- **[Native Codex JSON or config shapes can change]** → Validate bounded closed inputs, fail as partial convergence on unknown shapes, and avoid speculative direct writes where native CLI authority exists.
- **[Fewer visible calls can reduce debuggability]** → Include per-domain statuses and bounded failure codes in the single receipt without exposing command strings, credentials, or full configuration.

## Migration Plan

1. Add receipt/domain tests and shared helper APIs while retaining the existing command-line entry points.
2. Add the convergence engine and exercise current, repair, pending approval, approved, sandbox denial, malformed input, and partial-resume fixtures.
3. Rewrite the packaged Codex update skill to use the short snapshot-selection stage plus the convergence engine; remove repeated per-domain and final verification calls.
4. Run update/package/runtime suites and a temporary `CODEX_HOME` end-to-end installation test.
5. Bump the distributable version and changelog only after the packaged snapshot contains the helper and contract.

Rollback is a normal plugin version rollback or a follow-up release restoring the prior skill. The new helper never deletes the prior snapshot, and its writes remain compatible with the existing idempotent setup helpers, so the old update path can inspect and repair them.
