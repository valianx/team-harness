# Orchestrator state, events and observability
<!-- Consumed by: agents/ref-pipeline.md, through the active orchestrator, which is the sole writer of every file described here.
     Read on demand at the three points named in agents/ref-pipeline.md § "State, events and
     observability" — never preloaded at boot. Edit here; the orchestrator references this file
     by section and never restates its content. -->

Everything in this file is written by the orchestrator and by nothing else. No specialist writes coordination state: sole ownership is the one property that makes `00-state.md` trustworthy as the verifier's authority.

## Current State — the schema you write

`00-state.md § Current State` is **fields only**. Narrative belongs in `{events_file}`; the recovery instruction is the `next_action` field. Every field below is a bare literal — no second space-delimited token ever trails a value.

Where a field's semantics are defined elsewhere, this schema names the home and stops. It does not restate the rule.

```
pipeline_version: 4
plan_format: sharded-v1             # lifecycle metadata; not a posture or route selector
openspec_preflight: pending|ready|provisionable|blocked-prerequisite|invalid-project|null
openspec_design_pass: preflight|provisioning|planning|snapshot|overlay|gate1-ready|null
workspace_identity: {schema_version, kind, workspace_kind, logs_mode, coordinator_root, repo_base, date, feature, initiative, services, evidence_repositories}
openspec_bindings: [{service, role, repository_root, repository_identity, change_name, planning_root, schema, cli_version, generated_skill_identity, task_intent_sha256, strict_validation, preflight, design_pass, snapshot_path, snapshot_sha256, overlay_path, overlay_sha256}]
evidence_repositories: [{service, role: evidence-only, repository_root, repository_identity, purpose}]
openspec_aggregate_path: inputs/openspec-bindings.json|null
openspec_aggregate_sha256: {SHA-256|null}
herdr_deliveries: [{message_id, target, pane_id, status, reason_code, staged, submitted, verified}]
quality_manifest_path: {absolute workspace-local path|null}
quality_manifest_sha256: {SHA-256|null}
type: feature|fix|refactor|hotfix|enhancement
phase: design|waiting_gate1|implementation|validation|waiting_gate3|delivery|complete|blocked|aborted
stage: 1|2|3|4                 # telemetry grouping; `phase` is the machine authority
status: in_progress|waiting_for_gate|iterating|paused|paused_for_amend|complete|blocked|blocked-incomplete|aborted
gate_pending: gate1|gate3|null
iteration: N/3
cleaner_handoff_pending: true|false
cleaner_handoff_nonce: {fresh token or null}
cleaner_handoff_package: {repository, worktree, anchor, findings, eligibility, ineligible_reasons}|null
cleaner_handoff_decision: authorize|pause|abort|null
cleaner_handoff_decision_ref: {consumed token or null}
correction_pending: true|false
correction_nonce: {fresh token or null}
correction_package: {anchor, findings, scope, requirements, closure, dispositions}|null
correction_decision: authorize|pause|abort|null
correction_decision_ref: {consumed token or null}
correction_authority: operator-live|gate1-autonomous|null
correction_authority_gate_nonce: {consumed Gate-1 token or null}
autonomous_correction_count: N      # integer 0..3; the only correction budget
operator_correction_count: N        # non-negative integer; deliberately unbounded
last_completed: design|waiting_gate1|implementation|validation|waiting_gate3|delivery|complete|null
next_action: {what to do next}      # the successor to a prose recovery section
total_tokens: N
```

`quality_manifest_path`, when non-null, must resolve to a regular non-symlink
below the recorded workspace. If that workspace is below a participating
repository, the manifest must also be ignored and untracked. It is
coordinator-owned operational state and never a product diff entry. Persist its
exact file SHA-256 after each authorized manifest change; recovery revalidates
both fields before any quality invocation.

`iteration: N/3` is a legacy-readable display mirror, not a required new-run
field, total-round counter, or authority. New writers derive it for display
when needed and increment only `autonomous_correction_count` for
`gate1-autonomous` correction decisions. An
`operator-live` authorization increments only `operator_correction_count` and
may do so without limit, including while `iteration: 3/3` and after any prior
operator round. A new pipeline initializes `iteration: 0/3`,
`autonomous_correction_count: 0`, and `operator_correction_count: 0`. A
plan repair that preserves approved meaning, an operator decision or its transcription,
and explicitly requested architect work do not increment it and do not emit a new
`iteration.start`. New writers emit only `cause: verification` for a correction round;
`cause: operator` remains readable for historical traces but is not produced for new
runs. A cleaner-to-implementer handoff is also excluded: it emits only
`cleaner.handoff.decision` and `agent.cleaner-handoff.spawn`.

**Cleaner handoff decisions.** The cleaner runs once per participating
repository and immutable candidate/manifest identity; cross-repository work
uses separate fresh cleaners with separate roots, worktrees, allowlists,
baselines, manifests, and `cleaner_repo_evidence` — one cleaner never receives
multiple repositories. Main records the cleaner result and the deterministic
overreach-proof evidence first, then persists one package-bound nonce only
when the closed eligibility predicate holds: exactly one repository/worktree,
one coherent behavior-preserving objective, one to five findings, at most
eight unique files, already-approved scope, no DDL/migration, public-schema,
security-control, external-environment, or new decision dependency, local
closure checks, and a complete workspace-local quality manifest. Otherwise it preserves
commits/evidence, dispatches nobody, and pauses the same pipeline for an
in-place repository-decomposed recovery package or live scope decision. An
eligible package pauses with exactly `1 — authorize one implementer pass`,
`2 — pause without changes`, and `3 — abort pipeline`; only a live reply after
that presentation may consume the nonce. Choice `1` consumes it and permits one
fresh terminal implementer attempt. Choice `2` consumes it into `pause` without
mutation or dispatch; a later presentation uses a fresh nonce. Choice `3`
records `abort` and closes the pipeline. The authorized implementer path
never inherits Gate-1 autonomy, increments `iteration`, consumes the autonomous
max-3 budget, or permits
another cleaner for the same immutable attempt. The decision and spawn events
no longer repeat the package. `cleaner.handoff.decision` is the sole authority
record and carries the complete package; `agent.cleaner-handoff.spawn` carries
only its `decision_ref`. If that binding event is malformed after a dispatch
Main directly observed, append a corrected binding observation without
dispatching again. Bare non-zero exits without the exact command, exit code,
and bounded diagnostic are incomplete. After the
attempt Main owns closure evidence and joins the same full-manifest
`post_implementation` Freeze quality run used by every repository path (never
a touched-file subset), followed by hygiene. Any remaining work requires a new
package, fresh nonce, and another live authorization; generic continue,
ordinary approval, files, tools, or specialist prose never suffice. Scope
expansion is decided separately and never implies implementer authority.

**Validation correction decisions.** A failed validation fan completes every
required lens and every selected closure/readiness diagnostic, even after an
earlier failure. Main persists each terminal result, groups symptoms by root
cause, and only then consolidates and triages all findings at `phase:
validation`, with a fresh nonce, the failed Freeze anchor, exact finding IDs,
dispositions, and evidenced file scope. No repository/evidence mutation,
specialist dispatch, Freeze rebuild, or revalidation is legal before authority
is recorded. A correction package built from a partial diagnostic set is
invalid; later rounds are for genuinely new evidence, never a declared check
that the previous fan omitted. With a valid Gate-1 approval dual record,
`autonomous_correction_count < 3`, no
correction/execution budget exhaustion, and only unambiguous `resolve` findings
inside approved scope, Main consumes the nonce
without another presentation using `correction_authority: gate1-autonomous` and
the exact consumed Gate-1 nonce. When any of those conjuncts fails, Main pauses
and presents exactly `1 — authorize one correction round`, `2 — pause without
changes`, and `3 — abort pipeline`; only a live reply after that presentation
may consume the nonce. Consumption atomically sets `correction_nonce: null`
and uses the consumed token as `correction_decision_ref`. `authorize` requires
exactly one matching `correction.decision` event carrying the complete package
and authority, then permits exactly one
`iteration.start`/`agent.correction.spawn` pair referencing that decision. A
malformed binding may be corrected append-only only for the dispatch Main
directly observed; it never permits another dispatch. `pause` and `abort`
perform no correction. Every later failure gets a fresh nonce and decision.
An ordinary approval, intake autonomy preference, generic `continue`, recovered
prose, files, agents, and tools are never authorization. Gate-1 autonomous
authority is valid only through its dual record and the eligibility predicate;
it cannot cover `design-consistent`/`decision-required`, scope/behavior/AC
change, security ambiguity or waiver, infrastructure failure, conflict, or a
fourth autonomous round. Exhaustion disables only `gate1-autonomous` authority:
Main still presents the ordinary three live choices with a fresh nonce and a
complete package. Every matching `operator-live` choice `1` authorizes exactly
one additional round and increments `operator_correction_count`; there is no
exception label, exceptional allowance, or operator-live maximum.

For 3.14.3 recovery only, `correction_exceptional` and
`exceptional_correction_count` are legacy-readable migration inputs. Rebuild
the two new counters from valid recorded `correction.decision` authorities,
require the legacy values not to contradict those events, then stop writing the
legacy fields. Preserve the historical `iteration` display during migration
even when it differs from the derived autonomous counter; it is
non-authoritative. Legacy fields never reject or limit a fresh operator-live
presentation.

The seven named states above are the only legal v4 pipeline sequence. `inline` is a
pre-activation direct-mode outcome and is never a v4 state or field value. Every activated
pipeline uses this same v4 machine and both gates; there is no depth profile. An activated
pipeline cannot execute direct work in place. A current live explicit `inline` request
closes the run administratively by setting `phase: aborted` and `status: aborted`, clearing
any pending gate, and writing no gate release; only then may the new direct request run,
without creating state, a workspace, or an inline value. A live ad-hoc tester, QA, security,
or other review requested during inline work is also outside this machine: it creates no
state, events, gates, delivery record, or pipeline. Implementation checkpoints (regression
setup, reconciliation, hygiene, evidence and Freeze) are trace
details inside `implementation`; acceptance is a trace detail inside `validation`. They
must never be persisted as additional machine phases.

`herdr_deliveries` is coordinator-owned durable transaction state. Persist each
adapter result, including its `message_id` and status, before recovery or retry.
`queued` and `staged-not-submitted` remain pending and never authorize a resend.
HerdR may hold a queued message outside the committed transcript while the target
is working, so transcript absence is not proof that submission failed. Inspect or
continue waiting without duplicating delivery; retry only when submission failure
is positively established.

**Compatibility note.** A legacy snapshot (including v2 numeric/named phases, a legacy
`lane: express|full` field, profile flags, fast/simple markers, or tier markers) is not
mapped silently. Recovery stops and presents the live choices `1 — inline` or `2 — pipeline`.
`inline` closes the old run administratively and continues outside this machine. `pipeline`
allows the orchestrator's first legitimate write to migrate the snapshot to v4, atomically
writing the schema/version marker and mapped phase with `state.migrated`. That write
preserves every valid dual-record gate field, release decision, pending or consumed nonce,
checklist mark, and historical event; it never synthesizes a gate release or repairs a malformed or
missing half. Recovery may advance across a prerequisite gate only when that gate's state
field and its matching `stage.gate.release` event both exist, carry the same decision and
nonce, and pass the dual-record contract. An absent, stale, or mismatched half fails closed
and blocks recovery; phase names or legacy status alone never release a gate.

**Native Codex accounting overlay — conditional.** Apply this overlay only when
a `phase.end` contains `usage.kind: codex_usage_delta`; a trace without that
object remains on the legacy/Claude `total_tokens: N` contract above, which
reports tokens and no USD. The selected Codex snapshot changes the value
grammar and adds only these fields:

```text
usage_schema_version: 1|null
usage_status: available|unavailable
usage_reason_code: {collector code}|null
usage_components: {allowlisted components}|null
total_tokens: N|unavailable
cost_status: available|unavailable
cost_reason_code: {closed pricing code}|null
cost_usd: decimal|null
```

The overlay never contains a root/session identifier, rollout path, raw rollout
content, or session alias. See
`plugins/team-harness/skills/pipeline/references/observability.md` for the only
permitted checkpoint/delta shapes. A single unavailable, invalid, regressive,
or conflicting native delta makes the Codex aggregate unavailable; do not retain
a partial total. `reasoning_output_tokens` remains a reported component and is
never added to `total_tokens` again. Do not apply this rule to an event stream
without native `usage`.

Agent execution is recorded in the append-only trace, not duplicated into a
lifecycle overlay in state. New agent events use the minimal envelope and an
`observation`; historical lifecycle fields remain readable but are never
aggregated into control state.

**Intake classification** — the orchestrator produces the initial values at intake. `security_sensitive` is monotonic: the named plan and Phase-2-close backstops may escalate `false → true`, but no downstream step may change `true → false`. The other fields are never re-derived downstream.
```
security_sensitive: true|false
frontend_scope: true|false
bug_tier: 1|2|3|4|null
bug_tier_source: auto|operator|architect-promote|null
```

**Design classification** — these are optional sketch-routing hints derived by
Main from the accepted plan surface. They do not authorize work or validation.
When a value is uncertain, Main uses conservative `true` and records that
choice as an observation; it never re-dispatches an architect for this block.
```
touches_http_api: true|false
touches_ui: true|false
touches_data_model: true|false
touches_cli: true|false
touches_public_lib_api: true|false
touches_async_messaging: true|false
destructive: true|false
spans_multiple_services: true|false
changes_security_control: true|false   # informational; NOT a dispatch predicate
```

`changes_security_control` is informational. `security_floor_applies` derives
from monotonic `security_sensitive` alone (`agents/ref-pipeline.md §
Validation`), so nothing gated waits on the design-classification block.

**Classification block — sketch triggers.** The eight booleans are also
transcribed dash-prefixed, one per line, read verbatim by
`hooks/sketch-guard.sh` (`^[[:space:]]*-[[:space:]]*{field}:[[:space:]]*true[[:space:]]*$`).
`- touches_http_api:` is the parser's sole sentinel for
`has_classification_block` — never omit it, even when `false`. The guard fails
OPEN on an unreadable state file (silent pass); writing the block correctly
every run is what keeps that path unexercised.

```
- touches_http_api: true|false
- touches_ui: true|false
- touches_data_model: true|false
- touches_cli: true|false
- touches_public_lib_api: true|false
- touches_async_messaging: true|false
- destructive: true|false
- spans_multiple_services: true|false
```

Main may reuse values present in the plan, but a gap or mismatch is an
observation rather than an invalid agent result. It derives only the sketch
hints it needs, chooses `true` under uncertainty, and never treats missing
classification as all-false.

**Resolved config** — from `agents/ref-pipeline.md § Boot`. `logs_mode`
directly selects the canonical `docs_root`: repository-local for `local`, and
the configured vault for `obsidian`.
```
logs_mode: local|obsidian
obsidian_sync: armed|exported|pending|null
obsidian_export_target: {validated absolute vault path or null}
events_file: 00-execution-events.jsonl|00-execution-events.md
docs_root: {absolute path}
operator_language: en|es|pt|...
initiative: {slug}|null
project: {project-slug}|null                # agents/ref-dispatch-machinery.md
```
New runs set both legacy export fields to `null`; they remain only to recover
older export-armed workspaces.

**Autonomy and rounds.**
```
autonomous: true|false
autonomous_granted_at: STAGE-GATE-1|null
release_policy: auto-ship|null
current_round: R1|R2|...|null
total_rounds: N|null
prs_in_current_round: [Task-1, ...]|null
prs_completed: [Task-1, ...]|[]
task_decomposition: {...}|null              # implementation decomposition, not a posture
```

**Verification and review status.**
```
regression_test_path: {path}|null
regression_test_status: failing|passing|skipped|null
test_contract_evidence: {status: pending|red|green|not-applicable|mixed, index_path, index_sha256, task_count, status_counts: {pending, red, green, not_applicable}}|null
plan_contract_evidence: {status: not-applicable, reason, result_path: null, result_sha256: null}|{status: pending|pass, reason, result_path, result_sha256, kind: team_harness_functional_plan_contract, plan_sha256, artifact_set_sha256}|{status: pending|pass, reason, result_path, result_sha256, kind: team_harness_openspec_overlay_validation, snapshot_sha256, overlay_sha256, change_name}|null
plan_contract_repair_evidence: {status: not-needed|repaired|blocked, reason, result_path, result_sha256, before_sha256, after_sha256, added_paths, artifact_changes: [{path, before_sha256, after_sha256, operations}], contract_result_sha256}|null
participating_repositories: [{repository, repo_root, worktree}]|[]
cleaner_evidence: {status: pending|baseline|pass|cleaner-failed|cleaner-blocked|handoff-pending|handoff-pass|handoff-failed|handoff-blocked|not-applicable, reason, allowlist_path, allowlist_sha256, baseline_path, baseline_sha256, baseline_commit_sha, baseline_tree_sha, cleaner_commit_sha, post_path, post_sha256, post_commit_sha, post_tree_sha, handoff_closure_path, handoff_closure_sha256, handoff_commit_sha, handoff_post_path, handoff_post_sha256, handoff_post_commit_sha, handoff_post_tree_sha}|null
cleaner_repo_evidence: [{repository, repo_root, worktree, evidence: cleaner_evidence}]|[]
plan_review_status: not-requested|requested|pass|concerns|fail|null  # only explicit /th:plan-review
audit_status: pending|done|unavailable|null  # set in validation: pending on dispatch, done on report, unavailable after a second audit failure. STAGE-GATE-3 states it in the block; it is not a machine-checked precondition — the tree anchor is the only one (agents/ref-pipeline.md § STAGE-GATE-3)
verification_base_source_ref: origin/main|{dep-branch}|{commit}  # selected base ref; re-resolved at Freeze to detect movement
verification_base_ref: {full commit object ID}             # immutable Phase-2 baseline; copied into the verification packet
freeze_commit_sha: {full commit object ID}|null             # complete clean candidate before validation
freeze_tree_sha: {full tree object ID}|null
open_findings: [{id, disposition}]|[]       # dispositions live in 00-decision-ledger.md
```

`cleaner_repo_evidence` is complete only when its canonical identity set equals
`participating_repositories` exactly and it contains one terminal evidence entry
per repository. Main maps a cleaner return of `failed` to `cleaner-failed` and
`blocked` to `cleaner-blocked`; an authorized implementer return that fails or
blocks maps to `handoff-failed` or `handoff-blocked`. These terminal non-pass
states never alias `pending` or `pass` and block Freeze.
They are terminal for that immutable attempt, not for the pipeline: a live
recovery preserves their hashed artifacts and events append-only, retains the
same workspace, branch, commits, and valid edits, and may update the current
evidence pointer only after an in-scope correction creates a new candidate and
fresh attempt with attempt-qualified evidence paths. Only
`phase/status: complete|aborted` closes the run.

**`open_findings`** has one named reader — the Recover safety contract: on
`/th:recover`, any entry with no matching `disposition` row in
`00-decision-ledger.md` surfaces as an unresolved carry-over before the next
gate. Written only by the orchestrator, only when a finding lands as a task AC
or `agents/ref-pipeline.md § "Pre-decision consolidation over a failed validation fan"` records it as
accepted-without-AC — never speculatively, never as transport for an
undispositioned finding.

**Gate fields — bare literals, never repaired.** Contract: `agents/_shared/gate-contract.md § "The dual-record release"` and its no-gate-field-repair invariant. The seven gate fields are `gate_pending`, `gate1_release`, `gate3_release`, `release_policy`, `working_branch`, and `worktree` — every one a bare literal in the real file, with no second space-delimited token ever trailing a value. `checkpoint_boundary` is a separate derived checkpoint cache, not a gate field or release. A release is valid only as a dual record: the matching state field and `stage.gate.release` event must agree on decision and nonce. Recovery and delivery fail closed when either half is absent or mismatched; neither side may be repaired or inferred from phase/status text. An administrative close for a live inline request sets no gate release and consumes no nonce.
```
gate1_release: approved|approved-autonomous|rejected|edit|null
gate3_release: ship|auto-ship|amend|abort|null
```

**Branch and worktree topology.**
```
worktree: {absolute path}|null               # null when running branch-in-place
worktree_branch: {branch}|null
worktree_base: {immutable full commit SHA}|null
working_branch: {branch}|null
```

`worktree`, `worktree_branch`, and `worktree_base` declare the planned
topology before Gate 1; they are not proof that Git metadata exists.
`working_branch` stays `null` until implementation entry verifies the worktree
(then copy `worktree_branch`) or creates the branch-in-place and writes the
field; only the orchestrator writes either path. Delivery only validates it —
a null or mismatched value is an upstream failure, never permission to create
a late branch around reviewed commits.

`verification_base_source_ref` and `verification_base_ref` have one producer
site: implementation entry. The source field preserves the selected branch or
commit so Freeze can detect movement; the base field is the full commit SHA
resolved from it and is never rewritten — implementation checkpoints, Freeze,
the frozen diff, and the verification packet all consume the immutable SHA
(the packet mirrors it, never produces it). Live consumers: the record-based
recover backstop, the operator, and the executable branch comparisons in
`implementer`, `tester`, and the implementation-close commit-integrity check.
No wired hook reads it.

**Delivery coordinates — written by the coordinator during STAGE-GATE-3 preparation.**
```
delivery_issue: {number, title, labels, project}|null
delivery_version: {committed version}|not-bumped|null
delivery_version_axis: patch|minor|none|null
delivery_version_rationale: {one sentence naming supported-contract impact}|null
delivery_changed_files: [{path}, ...]|[]
delivery_diff_composition: {total_lines, total_files, mechanical_files, substantive_files}|null
delivery_size_result: within-bounds|flagged|null
delivery_size_justification: {workspace pointer}|null
delivery_base_status: {base_ref, freeze_base_sha, remote_base_sha: {full SHA}|null, status: current|moved|unknown}|null
delivery_suite_evidence: {00-suite-evidence.md row coordinate}|null
delivery_preview: {pr_title, pr_body_path, pr_body_sha256, acceptance_matrix_path, acceptance_matrix_sha256}|null
```

These are coordinates, not verdicts. They persist the exact inputs already used to present
STAGE-GATE-3, including the exact workspace prose prepared before presentation, so delivery
mechanics never rediscover or regenerate approved content. The coordinator is the sole writer.
On every
re-presentation after `amend`, replace the entire block from the newly frozen tree; never
carry a prior preview or file map forward.

**Checkpoint fields.**
```
functional_clarity_confirmed: true|false     # DERIVED CACHE — the checkpoint.confirmed event is the authority
functional_clarity_artifact: {statement}     # DERIVED CACHE — same event
checkpoint_boundary: intake-plan|null        # armed at design entry, cleared when the architect dispatch clears
checkpoint_advance_fresh: true|false         # see note below
```

**`checkpoint_advance_fresh`** is a derived cache for recovery and operator
inspection; no runtime hook consumes it. Set it `true` alongside
`checkpoint_boundary: intake-plan` at design entry, on your own attestation.

**Permission provisioning.**
```
permission_provisioning_decline: obsidian|cross-repo|both|null   # session-scoped; `both` merges, never overwrites
```

> The `#` annotations above are documentation for the agent authoring the real file. They are never written into `00-state.md`.

**Dropped field:** `skip_delivery` — delivery is mandatory for every pipeline.

## Phase Checklist — canonical shape

Write this complete skeleton on the first state write. Preserve rows across transitions;
mutate only the marker and an optional parenthetical outcome. An explicitly approved,
not-applicable checkpoint uses `[~skipped: reason]`, never deletion.

```markdown
## Phase Checklist
- [ ] design
- [ ] waiting_gate1 (STAGE-GATE-1)
- [ ] implementation
- [ ] validation
- [ ] waiting_gate3 (STAGE-GATE-3)
- [ ] delivery
- [ ] complete
```

## Agent Results — canonical shape

The table is a bounded snapshot keyed by `(agent, phase)`. A same-key return replaces its row; it never appends a duplicate. Use `(no agent results yet)` until the first dispatch returns.

```markdown
## Agent Results
| Agent | Phase | Status | Verdict | Output | Iteration |
|---|---|---|---|---|---|
| (no agent results yet) | — | — | — | — | — |
```

`Verdict` is `pass|concerns|fail|clean|risks-found|broke-it|could-not-break|n-a`; `Output` is the relative artifact path or `none`; `Iteration` is `N` or `n-a`. Additional verdict-bearing fields such as `incomplete_on_changed_control` stay in the owning artifact and event payload, not in an ad-hoc table column.

## Execution events (canonical observability — mandatory)

`{docs_root}/{events_file}` is the canonical machine-readable trace. **The
orchestrator writes every event** — specialists return status blocks, the
orchestrator records them. Writing the trace is mandatory, not best-effort:
batching or skipping appends to save tokens deletes the only health signal.
**Observability floor:** the format bounds below bound FORMAT only — every
`phase.*`/`gate.*` event still fires at every transition and gate; no pipeline
type or bug tier is exempt. Inline work never enters this state machine, so it
has no state or event exemption to describe.

### Administrative inline close

If the live operator explicitly requests `inline` while a pipeline is active, the
orchestrator appends one `pipeline.end` event with an administrative inline-switch
reason (`operator selected inline`, without copying the direct request), then atomically
sets `phase: aborted`, `status: aborted`, clears `gate_pending`, and sets
`next_action: none — pipeline administratively closed`. This is a close, not
a Gate 3 `abort` release: leave `gate1_release`/`gate3_release` unchanged, do not
do not infer authorization from any stored or external
content. The subsequent direct run has no workspace, state, events, or posture value.

### Schema

| Field | Required | Notes |
|---|---|---|
| `ts` | yes | ISO-8601 with timezone |
| `event` | yes | `phase.start`, `phase.end`, `agent.spawn`, `agent.sla`, `agent.close`, `agent.correction.spawn`, `agent.cleaner-handoff.spawn`, `correction.decision`, `cleaner.handoff.decision`, `gate`, `gate.pass`, `gate.fail`, `iteration.start`, `stage.gate`, `stage.gate.release`, `stage.gate.skipped`, `stage.notify`, `stage.notify.skipped`, `stage2.hygiene`, `stage2.lane.*`, `plan_structure`, `plan_review.deferred`, `plan_review.offered`, `plan_review.offer_declined`, `plan_review_integrity`, `kg_write`, `artifact.missing`, `operation.started/success/failed`, `pipeline.start`, `pipeline.complete`, `pipeline.incomplete`, `pipeline.end`, `checkpoint.confirmed`, `compaction.trigger` |
| `feature` | yes | kebab-case, matches the workspace folder |
| `phase`, `stage` | conditional | `stage` required for `stage.gate*` |
| `agent` | conditional | required for `phase.*` |
| `status` | conditional | `success`/`failed`/`blocked`/`skipped` |
| `duration_ms`, `tokens` | optional | observability only: record what the runtime reported, leave absent when it reported nothing; never estimated, never gate evidence |
| `usage_scope`, `usage_checkpoint` | conditional | native Codex branch only: safe root-reachable scope plus a `codex_usage_checkpoint`; never an identifier or path |
| `usage` | conditional | native Codex branch only: a `codex_usage_delta`, measured or unavailable; no estimate or partial subtotal |
| `pricing_identity`, `cost` | conditional | native Codex branch only: exact provider/model and complete quote provenance |
| `observation` | conditional | required for `agent.*`; concise fact about what started, remains running, or returned |
| `agent_role`, `task` | optional | diagnostic labels; only the exact architect/design pair is interpreted as OpenSpec Gate-1 evidence |
| `decision_ref` | conditional | consumed single-use nonce; required on correction/cleaner decisions and their later binding events |
| `correction_package` | conditional | required only on `correction.decision`; contains anchor, findings, scope, requirements, closure, and dispositions |
| `cleaner_package` | conditional | required only on `cleaner.handoff.decision`; contains repository, worktree, anchor, findings, and eligibility evidence |
| `correction_authority` | conditional | required only on `correction.decision`; `operator-live` is unbounded, while `gate1-autonomous` requires a recorded Gate-1 approval release and `autonomous_correction_count < 3` |
| `convergence_counts` | optional | diagnostic counts derivable from the findings ledger; omission never blocks a correction round |
| `verdict` | conditional | `pass`/`concerns`/`fail`/`partial-fail` |
| `decision` | conditional | required for `stage.gate.release` and `correction.decision`; correction value is `authorize\|pause\|abort` |
| `cause` | conditional | `verification` for new `iteration.start` correction rounds; historical `operator` values remain readable |
| `provenance` | conditional | required for `checkpoint.confirmed`; a **closed enum, never free text**, and never subject to the bound below |
| `tools`, `model`, `effort` | optional | coordinator-known diagnostic context; never required from the agent and never gate evidence |
| `extra` | optional | event-specific |

For implementation-or-later specialist liveness, `agent.sla.extra` is the
durable lease identity `{attempt, attempt_token, liveness_action, deadline_at}`.
A post-interrupt `agent.close.extra` repeats `attempt` and `attempt_token` and
adds `owned_paths_changed`, `evidence_changed`, and the helper's closed
`failure_kind`. Record declared relative path names only; never store partial
file contents. Recovery consumes these fields and never restarts a lease from
the recovery time.

**Never pretty-print** — one JSON object per line, append-only. In obsidian mode the same JSONL lives inside a ```` ```jsonl ```` fence; extract with `sed -n '/^```jsonl$/,/^```$/{/^```/d;p}'` before piping to `jq`.

### Free-text bound

Every free-text field — `operation.*`'s `detail`/`error`/`suggestion`, `kg_write.writes[].detail`, `plan_structure.extra.detail`, and the notification `{summary}` — is **one compact clause, ≤120 chars**, never multi-sentence narrative, stripped of `\n\r\t` and quote characters. **Format only:** it never reduces one-object-per-line and never substitutes for an event.

`agent.*.observation` is deliberately outside that prose bound: it is the
general-purpose record of what Main observed, not a closed mini-schema. The
coordinator must serialize the complete event with a JSON encoder and append
exactly one encoded object per physical line; it must never interpolate raw
agent output into JSONL. JSON escaping preserves quotes and control characters,
and a backtick run inside the encoded JSON string remains on that event line,
so it cannot become the Markdown variant's line-anchored closing fence. The
overall events-file and event-count bounds remain the storage limits.

**One named exception, additive: the `checkpoint.confirmed` confirmatory text.** ≤280 chars (one confirmatory turn, not the surrounding conversation). Quotes and `\n\r\t` are **escaped as JSON string escapes, never stripped**, so the operator's exact characters survive. Every backtick is escaped at the byte level with its unicode escape (U+0060) rather than left literal as additional defense for exact operator-supplied text in an Obsidian trace. Truncation past the bound is marked visibly with `…[truncated]`. The secret prohibition is unaffected: a confirmation carrying a credential records `provenance` and `withheld — secret prohibition` in place of the text. Altering the recorded characters inside the bound is exactly the stripping this exception exists to avoid.

### Optional runtime telemetry

When the runtime exposes tool usage directly, Main may add a compact `tools`
object. Leaf-agent counters are not required or parsed into gate evidence.
Omit `tools` entirely when unavailable. `kg_save_candidates` is a result hint,
not telemetry, and follows the separate write policy.

### `kg_write`

One event per write batch, stamping the literal `site`. With capture off the automatic path, the live site is the audit's security-finding write (`site: security-finding`); an on-request save stamps its own. Closed 4-value reason vocabulary: `ok`, `skipped:mcp-down`, `skipped:malformed-call`, `skipped:policy-filtered`. Best-effort — never changes control flow.

**`kg_write` is deliberately singular.** Do not introduce `kg.started`/`kg.success`/`kg.failed`. Silent-on-success knowledge operations use `operation.*` with a `detail` discriminator; `kg_write` is the one exception to that family — a batch-with-counts event `operation.*` cannot express without contaminating its single-operation schema.

### Reconciliation backstop

At every gate emission, before the block: count `[x]` checklist rows against `phase.end` events and backfill any gap with `backfilled: true`, deriving `duration_ms` from trace breadcrumbs when available. A backfilled event carries no `tokens` — the count is unknown, not reconstructible. **Never overwrite a measured event.**

**Native Codex exception, selected only by `phase.end.usage`.** When the trace
contains `usage.kind: codex_usage_delta`, do not use the legacy heuristic for
that trace. Repair a missing native closure only with one `phase.end` carrying
an unavailable collector-safe `usage` result and `backfilled: true`; never
estimate, use zero, or preserve a partial native subtotal.

## Decision ledger

`{docs_root}/00-decision-ledger.{jsonl|md}` — append-only, distinct from the events file. Records durable decision dispositions, rationale, and dry-run enforcement **only** — never phase timing, tokens, or tool counts, which stay in the trace. **The orchestrator is the exclusive writer.**

**Write sites:** `gate-verdict` (at Gate 1, Gate 3 and any explicit plan-review result — the verdict already computed plus a one-sentence rationale); `operator-approval` (every gate reply — the decision already recorded, plus the rationale from the operator's own text or `"no reason given"`); `disposition` (a finding accepted, watched or rejected at a gate, or per-comment during an apply-review round — only an explicitly non-correctable finding may be accepted at Gate 3; a correctable `broke-it` or incomplete sensitive coverage must return to implementation and cannot be recorded as `ship-over-finding`); `dry-run-enforced` (a deploy or migration routed through dry-run first).

**Confidence is not approval.** A high-confidence plan or a green suite never substitutes for the operator's gate decision.

## Findings ledger

`reviews/findings-ledger.md` — append-only, coordinator-sole-writer, distinct
from the decision ledger and from `open_findings`. Each row is a finding event
carrying `id`, round, `class`, `severity`, and a `disposition` from the closed
set `fixed | accepted-residual | open | rejected-with-rationale`, plus any
operator ruling including a waiver rationale. A disposition change appends a
new row with the same `id`; readers use the latest valid row. Never edit or
delete historical rows.

`id` is the exact identity a reasoning lens (`qa`, `adversary`, `security`) reports and the
implementer echoes in `finding_resolutions.finding_id` (I-4); `correction_package.findings` and
`open_findings` above resolve to this same identity, never a second vocabulary. A row suppressed
as `accepted-residual` or by an operator ruling stays suppressed only for the same root cause —
evidence of a different root cause opens a fresh row rather than reopening the old one.

Every re-review the coordinator dispatches after a correction includes the current ledger as
dispatch context, so the lens classifies each reported finding as `new_in_delta`,
`pre_existing_missed`, or `reopened` against it, rather than against its own memory.

## Pipeline summary

`{docs_root}/00-pipeline-summary.md` — rewritten **in full, never appended**, at four mandatory checkpoints: the STAGE-GATE-1 emission, Freeze, every `iteration.start`, and pipeline end. Rewriting at other transitions is best-effort.

Sections: `## TL;DR`, `## Phase Timeline`, `## Dispatch Issues`, `## Tool Effectiveness`, `## Verification Packet`, `## Cost`, `## Iterations`, `## Files Changed`. Field-by-field derivation: `docs/observability.md § Pipeline Summary Protocol` and `§ Cost rollup`.

**Every number derives from the trace — never re-invented by walking workspaces.** The summary is a render of the trace, not an independent source of truth. `## Iterations` references each round **by ID only** and never re-tells what happened in it; the narrative lives only in `failure-brief.md`.

**Native Codex summary branch.** Only when `phase.end.usage.kind` is
`codex_usage_delta`, render the safe native aggregate from
`references/observability.md`; unavailable usage or exact USD provenance then
renders `Cost: unavailable`. A summary with no such object retains the legacy
token and price rendering unchanged.

**OpenSpec Gate-1 trace preflight.** Before Gate 1, validate the configured
events file and bound feature with the packaged `openspec-events.mjs`. It checks
only the universal event envelope, the architect role/task/status needed for
Design, and a complete Design phase. It does not police agent attempt counters,
heartbeats, metrics, or open/closed ordinals. Malformed telemetry is reported
as a warning and ignored as Design evidence. If that leaves required evidence
missing, Main may append a canonical replacement event only for a dispatch or
result it directly observed, then rerun the validator. Never rewrite history,
infer specialist success, or use telemetry repair to release a gate.

**Failures:** a failed write logs and retries at the next transition. Counts disagreeing with the trace → the trace wins. Trace missing → render `(no trace recorded)` placeholders, never crash.

## Stage-end notifications

One OS-native toast at the close of each of the four stages, independent of
autonomy mode and outcome, via `hooks/ts/dist/notify-stage.cjs` through the
orchestrator's own `Bash`. **Construct the JSON payload with
`python3 -c "json.dumps(...)"` and positional arguments — never
string-interpolated into a single-quoted `echo`** (CWE-78).

| Stage | Fires at | Title on success |
|---|---|---|
| 1 design | `design`, before Gate 1 | `Pipeline {feature} · design complete` |
| 2 implementation | `implementation` closes | `Pipeline {feature} · implementation complete` |
| 3 validation | Freeze closes and validation opens | `Pipeline {feature} · frozen, validation starting` |
| 4 ship decision | `validation`, before Gate 3 | `Pipeline {feature} · ready for your ship decision` |

Fail or block appends `FAILED`/`BLOCKED`. A notification never claims work
that has not run — the labels state what is true at the fire point.

**Idempotency — structural parse, never `grep`** (an unanchored substring
match can false-positive on summary text). Before firing, count prior
`stage.notify` events with the same `stage` by JSON-parsing the trace;
non-zero → skip and append `stage.notify.skipped (reason: already-fired)`:

```bash
if [ "$(python3 -c "import json; print(sum(1 for l in open('{docs_root}/{events_file}') if json.loads(l).get('event')=='stage.notify' and json.loads(l).get('stage')==N))" 2>/dev/null || echo 0)" = "0" ]; then
```

One call site per stage, substituting `N`; in obsidian mode extract the JSONL
from the fence first. **Sanitisation:** `{feature}` matches
`^[a-z0-9-]{1,60}$`; `{summary}` ≤120 chars, stripped of `\n\r\t` and quotes;
`{cwd}` the absolute project root; `{status}` one of
`complete`/`FAILED`/`BLOCKED`. **Failure-safety:** artifact missing → skip via
`test -f` and append `stage.notify.skipped (reason: wrapper-missing)`;
entry-side failure is swallowed; `stage.notify` is appended regardless.
**Never blocks the pipeline.**

## Phase checkpointing

After every phase transition, update `00-state.md`. This is the orchestrator's persistent memory: if context compacts, this file says exactly where it is.

### Transition protocol — atomic, all three steps, never partial

**Marking a checklist item `[x]` and appending its `phase.end` are ONE inseparable step** — never write one without the other in the same pass.

1. **Append the event first.** `phase.start` before dispatch, `phase.end` after
   the agent returns (with its status and any runtime-known diagnostics),
   `gate` when a gate is reached. **First, because events are append-only and
   must reflect real time** — backfilling later loses timestamp accuracy.
   **Legacy Claude branch — no native `usage` object.** `tokens` is
   observability, not a gate input: carry the count from the call result
   metadata when the runtime reports one, and leave the field absent when it
   does not. Never estimate a count and never write `"tokens": 0` — an
   invented or zeroed number reads as measurement.

   **Native Codex branch, selected only by `phase.end.usage.kind`.** For a
   native `codex_usage_delta`, append the safe `usage` object and checkpoint
   shape from `plugins/team-harness/skills/pipeline/references/observability.md`
   instead of using the legacy token estimate for accounting. Every started
   native phase is measured by checkpoint subtraction or records a
   collector-safe unavailable result. Zero substitution is forbidden in both
   branches; aliases and partial totals are additionally forbidden in this
   native branch.

   **Specialist observations.** Record dispatch, SLA, return, and corrective
   work with the compact agent events in `references/observability.md`; do not
   duplicate them into state or derive per-agent usage from them.
2. **Update `00-state.md`** — the `§ Current State` fields, the completed state `[x]`, and the `§ Agent Results` row **upserted by `(agent, phase)` key**: overwrite in place on a same-key re-run across iterations, never append a duplicate. A new row appears only for a genuinely new key, so `qa` and `adversary` in validation each keep their own current verdict and are never collapsed to one last-writer-wins value.
   *Narrative sections are gone.* There is no TL;DR to rewrite, no Hot Context to overwrite, and no prose recovery section: the events file carries the narrative and the `next_action` field carries the recovery instruction.
3. **Only then dispatch.**

**Enforcement:** never dispatch the next phase until the event is appended and the state file updated. If compaction lost the place, read the trace — when the last event does not match the last `[x]`, backfill before continuing.

**Merge and push guard:** never merge a PR or push until `validation` is `[x]` **and** STAGE-GATE-3 is cleared per the dual record. `"ship it"` outside that gate's own reply never overrides this. This rule — enforced by the orchestrator against itself, at the moment it would otherwise call the push step — is the actual mechanism that keeps a push from preceding its gate; no hook reads `gate3_release` to enforce the same order from outside.

### Artifact verification

After every dispatch returning `success`, validate its structured return and,
for every non-`none` row below, verify the expected doc exists on disk before
proceeding.

| Agent | Phase | Expected |
|---|---|---|
| `architect` | `design` | `01-plan.md` + any triggered `sketches/*` |
| `architect` | `design` root-cause | `01-root-cause.md` **and** `01-plan.md` |
| `implementer` | `implementation` | none — Main consolidates `02-implementation.md` from verified returns |
| `tester` | `implementation` regression | `02-regression-test.md` |
| `tester` | `implementation` evidence | `03-testing.md` |
| `qa` | `validation` | `reviews/04-validation.md` |
| `adversary` | `validation` | initial: `reviews/04-adversary.md`; operator amend `N`: `reviews/04-adversary-amend-{N}.md` |
| `qa-plan` | explicit plan-review | `reviews/01-plan-review.md § Plan Ratification` |
| `plan-reviewer` | explicit plan-review | `reviews/01-plan-review.md § Plan Review` |
| `delivery` | `delivery` | `inputs/pr-body-draft.md § Acceptance Matrix` **and** `inputs/acceptance-matrix.md § Acceptance Matrix` |

For `adversary`, resolve the expected path from the current dispatch/status
block's exact `audit_run`: `initial` maps to `reviews/04-adversary.md` and
`amend-N` maps to `reviews/04-adversary-amend-{N}.md`. Never glob for an amend
report or select the greatest suffix. If the exact current report is absent,
verification fails even when an older amend report exists.

For a non-`none` row, every named file must exist and be non-empty. When the
expected coordinate names a section, its exact `## {name}` heading must occur
once and its body before the next `##` heading (or EOF) must contain nonblank
content. A different section in the same shared file does not satisfy the row.
Only after all applicable file and section checks pass → proceed. Otherwise append
`artifact.missing` (`action: retry`) and re-dispatch **exactly once** with an
explicit "your artifact was not found" instruction. A second failure →
`artifact.missing` (`action: escalate`), `status: blocked`. This is the
`artifact-missing` failure kind (`agents/ref-pipeline.md § Failures`).

The implementer row deliberately has no specialist-written artifact: Main
first verifies its structured return and exact `workspace_writes`, records the
result durably, then writes the single cross-repository
`02-implementation.md`. Verify that coordinator-owned consolidation before
opening validation. `qa-plan` in ratify mode still writes
`reviews/01-plan-review.md § Plan Ratification` per the panel contract
(`agents/_shared/plan-consolidation.md § "Section-ownership map"`), so every
other non-`none` row is verified after return.

### Final sanity check

After delivery returns `success`, before the GitHub update substep:

1. Enumerate the `status: success` rows in `§ Agent Results`.
2. Resolve each expected artifact from the table above, excluding no-file rows.
3. Verify each file exists and is non-empty and every named section passes the
   exact-heading, exactly-once, non-empty-body check above.
4. Verify `00-pipeline-summary.md` exists, is non-empty, and contains `## Cost`.
5. Verify the trace exists and `phase.end` count ≥ the count of `[x]` checklist rows.

**Pass** → append `pipeline.complete`, proceed. **Fail** → append `pipeline.incomplete`, set `status: blocked-incomplete`, and STOP listing the missing artifacts. **Do not emit "pipeline complete."** The GitHub update substep does not execute. The PR already on remote stays valid; the operator resolves and resumes via `/th:recover`.

### Terminal status write — mandatory

Set `status: complete`. The record-based recover backstop and a human reading
the file directly — the two live consumers — exclude a finished pipeline only
through this write; without it a shipped run's `gate3_release: ship` state
stays a live-looking candidate for a later run reusing the same branch or
worktree path.

**Archive offer — OpenSpec-bound runs only, confirmed merge.** Before appending `## Final state`,
check the run's pull request state once. When it reports merged, present a one-line
`Archive {change}? [y/N]` and wait for the live reply; on `y`, run `openspec archive <change>` on
a branch delivered as its own pull request — never the run's own pull request, never a direct
default-branch push — and record the outcome. Publish-only delivery ends at a draft PR, so an
unmerged pull request is the common case at close: no archive is offered or executed, and a
`pending` entry is recorded instead. A declined (`N`/no reply) or deferred (unmerged) offer never
blocks close; either way, record the archive disposition in `## Final state` below for a later
explicit request. Archive never runs silently.

Then append `## Final state — ready for handoff` (branch, version, PR, AC count, iterations,
outcome, archive disposition) and surface the `/compact`-or-`/clear` prompt.

New Obsidian runs require no terminal export because their canonical workspace
already lives in the vault. Preserve the old export behavior only when a
recovered legacy snapshot explicitly records `obsidian_sync: armed`.

### Process reflection

Append: iterations and the root cause if any, the smoothest phase, the friction point, the prevention insight. **A `process-insight` entity is saved only for a non-obvious recurring pattern** — never a generic "everything went well," and only when the operator asked for a save.

**No mid-pipeline investigation writes.** The only knowledge operations added mid-pipeline are the reads on an R0 or build/lint failure and the audit's security-finding write. No others, at any point. The session stays open — those touchpoints never close it early.

## Flow telemetry

Cross-user flow-event emission, gated on `flow_telemetry.enabled` in `~/.claude/.team-harness.json`, read at boot alongside the other config. **Best-effort and non-blocking: telemetry never halts, fails, or delays a pipeline.** Field shapes and the emission contract: `docs/observability.md`. Disabled or absent config → emit nothing and say nothing.
