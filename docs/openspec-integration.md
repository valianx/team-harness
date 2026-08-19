# OpenSpec Design integration

Team Harness uses OpenSpec as the canonical source of product intent, reached through two entry
points that share the identical `openspec/changes/` schema, naming, and archive path. The full
pipeline's Design phase (`@Team-Harness pipeline <task>`) retains both gates, state, specialist
routing, Freeze, validation, correction authority, and delivery, exactly as below. The coordinator-
only `/th:spec` lane (`skills/spec/SKILL.md`, `docs/pipeline-lanes.md § "The direct spec lane"`)
authors the same `proposal.md`/`tasks.md` (and `design.md`/spec deltas when a specced capability is
touched) directly, with one conversational approval and no workspace, state, snapshot, overlay, or
gate ceremony. Neither entry point adds a third OpenSpec lifecycle or a lane-specific artifact
layout; archive treats a change from either origin identically.

## Canonical source model

OpenSpec owns the repository-local change under `openspec/changes/<change>/`: `proposal.md`,
`specs/**/spec.md`, `design.md`, and `tasks.md`. TH never copies or paraphrases those artifacts
into a second editable specification. It stores a hash-bound snapshot at
`<workspace>/inputs/openspec-snapshot.json` and a minimal operational overlay at
`<workspace>/plan/openspec-traceability.json`.

Every TH acceptance or execution item references stable OpenSpec coordinates. Every applicable
OpenSpec requirement, scenario, design decision, and task maps back to a TH item or carries an
explicit exclusion. Non-direct mappings are disclosed as `split`, `merged`, `th-extension`, or
`excluded` with a rationale. `ambiguous`, missing reverse coverage, stale hashes, dangling
coordinates, or copied normative text block Gate 1.

The overlay v1 arrays are `acceptance_items` and `execution_items`; it has no
top-level `tasks`. Task `Task-N` sources live at the unique matching
`.execution_items[]` entry, and specialist packets bind that entry by JSON
Pointer plus content hash.

Execution packets use two explicit roots. Repository files and canonical
OpenSpec source coordinates are relative to `path_roots.repository_root`;
Team Harness plan, input, review, contract, and evidence artifacts are relative
to `path_roots.workspace_artifact_root`. Bare relative paths never inherit cwd,
and `../` is not a valid bridge between the two domains.

## Single-pass Design

Main advances through these actions without requiring another operator command after each success:

1. Preflight Node.js `>=20.19.0`, npm, OpenSpec `1.9.0`, project initialization, and the generated
   integration for the active runtime. A compatible but uninitialized repository is initialized
   automatically; this is not an operator checkpoint.
2. Dispatch a fresh architect in `openspec-planning` mode — the single reasoning pass. It follows
   the installed upstream `openspec-propose` or `openspec-update-change` skill and writes only the
   bound OpenSpec change, carrying every judgment call (routing, scope decomposition, invariants)
   into it.
3. Run OpenSpec status and strict validation, extract stable coordinates, and capture the snapshot.
4. Run `openspec-overlay.mjs derive` directly over the validated snapshot and the live writable
   roots — a mechanical projection, never a second agent dispatch. It writes the compact Gate-1
   index, repository ownership, specialist routing, file scope, constraints, quality IDs,
   Freeze/evidence controls, rollback, delivery grouping, and each shard's explicit dispatch
   anchors. Every proposed worktree must remain inside one of the writable roots. A validator
   failure re-enters the same `openspec-planning` flow and reruns the derivation over the
   corrected snapshot, invoking it with `overwrite: true` authorized by that recorded correction
   event since the prior derivation's targets already exist; there is no standing second dispatch
   mode.
5. Validate snapshot freshness, bidirectional traceability, exact agreement between every
   shard's `required_invariants`, `required_evidence_anchors`, and
   `cross_runtime_preservation` declarations and its execution item, writable execution
   topology, and the canonical event trace; then present Gate 1.
6. During implementation, `openspec-overlay.mjs verify-and-rebind` performs
   every authorized monotonic task-checkbox transition and mechanical overlay
   binding update as one idempotent recoverable operation. It restores the old
   snapshot on a safe rebind failure and resumes an interrupted transition only
   from the exact predecessor/task event; every other stale condition remains
   fail-closed.

The planning dispatch includes a 120-second structured `TH_PROGRESS` transport.
Main observes input validation and artifact-writing milestones without
reading partial output. Crossing the 10-minute architect SLA produces one
`TH_SLA` diagnostic with live status, last heartbeat, and `artifact_state`, plus
one `agent.sla` event. An empty heartbeat/artifact observation is reported as
`no-material-progress-observed`; it never stops or replaces the still-live
architect.

Progress commentary is informational. Main pauses only for a mandatory TH gate, a material choice
not resolved by canonical artifacts, separately authorized external mutation, or a real blocker.

## Dependency and generated-skill ownership

If Node.js or npm is absent or incompatible, TH reports the exact prerequisite and does not install
Node. If the pinned OpenSpec CLI is absent/incompatible or an existing generated integration is
stale, TH presents one live install/update-or-abort decision. An approval installs exactly
`@fission-ai/openspec@1.9.0` without `sudo` or runs the required update.

When the compatible CLI reports an uninitialized repository, TH runs the exact upstream
`openspec init` command automatically. Codex protects `.agents` and `.codex`; if the bounded attempt reports
`INIT_SANDBOX_DENIED`, TH retries that exact argv once through native sandbox escalation with
`login:false` and verifies the resulting generated integration. No other failure code authorizes
that escalation. Generic initialization failures retain a sanitized diagnostic, expose no raw
stdout/stderr or secret-bearing values, and remain fail-closed.

OpenSpec remains the writer and owner of generated `openspec-*` skills and `opsx` commands. TH uses
the installed planning skills during Design and bounded apply instructions during authorized
implementation. It neither forks nor redistributes those generated files. The Claude, Codex, Go,
and OpenCode packages use the positive roots in `runtime/package-ownership.json`; consumer
OpenSpec integrations are preserved unchanged.

## Specialist consumption and authority

- Implementer reads pinned OpenSpec task/design coordinates plus its TH execution shard. Apply
  instructions are guidance; they cannot select a phase, expand scope, release a gate, or publish.
- Tester and QA read pinned OpenSpec requirements/scenarios directly. Tester owns executable
  evidence; QA remains final acceptance owner on the frozen tree.
- Cleaner, security/adversary, delivery, state/events, nonces, corrections, Gate 1, Gate 3, and
  publication remain unchanged TH responsibilities.

After implementation begins, the combined progress transition accepts only authorized monotonic
task checkbox changes from pending to complete and immediately rebinds the overlay. Task text,
structure, added/removed coordinates, rollbacks, or any other canonical change block the next
dispatch and require reconciliation.

## Repository, local workspace, and Obsidian

Canonical OpenSpec Markdown always stays in the target repository. TH state, snapshot, overlay,
decisions, reviews, and evidence stay in the configured TH workspace:

```text
repository/openspec/changes/<change>/...       canonical source
workspace/.team-harness/quality.json           operational quality policy
workspace/inputs/openspec-snapshot.json        pinned identity and navigation
workspace/plan/openspec-traceability.json      TH execution overlay
workspace/reviews/...                          TH validation evidence
```

When `logs_mode: obsidian`, `workspace` is the configured vault path. Snapshot metadata records the
vault root, `mode: obsidian`, repository-relative artifact paths, coordinates, line numbers, and
content hashes. Obsidian is therefore the audit/navigation surface, not a second OpenSpec source.

Before Freeze, TH verifies that the snapshot-bound OpenSpec source set is
present byte-for-byte below the implementation checkout, tracked by Git, and
included in the final base-to-candidate diff when created or changed by this
pipeline. It also verifies that the workspace quality manifest is absent from
that product diff. When the workspace is nested below a checkout, the manifest
must also be ignored and untracked. A worktree boundary never moves canonical
OpenSpec artifacts into the workspace or operational quality state into a
product path.

## Recovery and finalization

Durable state records the bound change, repository root, preflight result, current Design pass,
snapshot/overlay paths and hashes, and one next action. Recovery resumes preflight, an already
approved provisioning operation, upstream planning, snapshot capture, or overlay generation at the
recorded boundary. It does not ask the operator to re-enter a workflow command. Source drift routes
to reconciliation; a valid completed Design resumes at Gate 1.

OpenSpec `sync` and `archive` remain outside implementation authority. They are offered only after
TH acceptance and the applicable Gate 3/operator authority. They cannot replace push/PR authority
or retroactively validate the shipped tree.
