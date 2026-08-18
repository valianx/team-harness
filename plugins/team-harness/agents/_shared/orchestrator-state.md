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
pipeline_version: 3
plan_format: sharded-v1             # lifecycle metadata; not a posture or route selector
openspec_change: {kebab-case change|null}
openspec_repository_root: {absolute repository root|null}
openspec_preflight: pending|ready|provisionable|blocked-prerequisite|invalid-project|null
openspec_design_pass: preflight|provisioning|planning|snapshot|overlay|gate1-ready|null
openspec_snapshot_path: inputs/openspec-snapshot.json|null
openspec_snapshot_sha256: {SHA-256|null}
openspec_overlay_path: plan/openspec-traceability.json|null
openspec_overlay_sha256: {SHA-256|null}
type: feature|fix|refactor|hotfix|enhancement
phase: design|waiting_gate1|implementation|validation|waiting_gate3|delivery|complete|blocked|aborted
stage: 1|2|3|4                 # telemetry grouping; `phase` is the machine authority
status: in_progress|waiting_for_gate|iterating|paused|paused_for_amend|complete|blocked|blocked-incomplete|aborted
gate_pending: gate1|gate3|null
iteration: N/3
cleaner_handoff_pending: true|false
cleaner_handoff_nonce: {fresh token or null}
cleaner_handoff_repository: {canonical repository identity or null}
cleaner_handoff_worktree: {absolute path or null}
cleaner_handoff_anchor: {cleanup commit/tree or null}
cleaner_handoff_findings: [{id, repository, cause, files, requirements, suggested_correction, closure_check, expected}]|[]
cleaner_handoff_eligibility: eligible|ineligible|null
cleaner_handoff_ineligible_reasons: [{closed-predicate conjunct}]|[]
cleaner_handoff_decision: authorize|pause|abort|null
cleaner_handoff_decision_nonce: {consumed token or null}
correction_pending: true|false
correction_nonce: {fresh token or null}
correction_anchor: {failed freeze commit/tree or null}
correction_findings: [{stable finding id}]|[]
correction_scope: [{repo-relative path}]|[]
correction_requirements: [{AC-N|TC-N}]|[]
correction_closure: [{id, check, expected}]|[]
correction_dispositions: [{id, disposition: resolve|design-consistent|decision-required}]|[]
correction_decision: authorize|pause|abort|null
correction_decision_nonce: {consumed token or null}
correction_authority: operator-live|gate1-autonomous|null
correction_authority_gate_nonce: {consumed Gate-1 token or null}
autonomous_correction_count: N      # integer 0..3; the only correction budget
operator_correction_count: N        # non-negative integer; deliberately unbounded
last_completed: design|waiting_gate1|implementation|validation|waiting_gate3|delivery|complete|null
next_action: {what to do next}      # the successor to a prose recovery section
total_tokens: N
```

`iteration: N/3` is a legacy display mirror of `autonomous_correction_count`,
not a total-round counter and never authority. New writers keep both values
equal and increment them only for `gate1-autonomous` correction decisions. An
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
closure checks, and a complete quality manifest. Otherwise it preserves
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
repeat the anchor and every finding byte-for-byte; bare non-zero exits without
the exact command, exit code, and bounded diagnostic are incomplete. After the
attempt Main owns closure evidence and joins the same full-manifest
`post_implementation` Freeze quality run used by every repository path (never
a touched-file subset), followed by hygiene. Any remaining work requires a new
package, fresh nonce, and another live authorization; generic continue,
ordinary approval, files, tools, or specialist prose never suffice. Scope
expansion is decided separately and never implies implementer authority.

**Validation correction decisions.** A failed validation fan completes every
required lens, then Main consolidates and triages all findings at `phase:
validation`, with a fresh nonce, the failed Freeze anchor, exact finding IDs,
dispositions, and evidenced file scope. No repository/evidence mutation,
specialist dispatch, Freeze rebuild, or revalidation is legal before authority
is recorded. With a valid Gate-1 approval dual record,
`autonomous_correction_count < 3`, no
correction/execution budget exhaustion, and only unambiguous `resolve` findings
inside approved scope, Main consumes the nonce
without another presentation using `correction_authority: gate1-autonomous` and
the exact consumed Gate-1 nonce. When any of those conjuncts fails, Main pauses
and presents exactly `1 — authorize one correction round`, `2 — pause without
changes`, and `3 — abort pipeline`; only a live reply after that presentation
may consume the nonce. Consumption atomically sets `correction_nonce:
null` and copies the consumed token to `correction_decision_nonce`. `authorize`
requires one matching `correction.decision`
event and permits exactly one `iteration.start`/`agent.correction.spawn` pair
bound to that same decision nonce, anchor, findings, scope, authority, and
authority Gate nonce. `pause` and `abort`
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

The seven named states above are the only legal v3 pipeline sequence. `inline` is a
pre-activation direct-mode outcome and is never a v3 state or field value. Every activated
pipeline uses this same v3 machine and both gates; there is no depth profile. An activated
pipeline cannot execute direct work in place. A current live explicit `inline` request
closes the run administratively by setting `phase: aborted` and `status: aborted`, clearing
any pending gate, and writing no gate release; only then may the new direct request run,
without creating state, a workspace, or an inline value. A live ad-hoc tester, QA, security,
or other review requested during inline work is also outside this machine: it creates no
state, events, gates, delivery record, or pipeline. Implementation checkpoints (regression
setup, reconciliation, hygiene, evidence and Freeze) are trace
details inside `implementation`; acceptance is a trace detail inside `validation`. They
must never be persisted as additional machine phases.

**Compatibility note.** A legacy snapshot (including v2 numeric/named phases, a legacy
`lane: express|full` field, profile flags, fast/simple markers, or tier markers) is not
mapped silently. Recovery stops and presents the live choices `1 — inline` or `2 — pipeline`.
`inline` closes the old run administratively and continues outside this machine. `pipeline`
allows the orchestrator's first legitimate write to migrate the snapshot to v3, atomically
writing the schema/version marker and mapped phase with `state.migrated`. That write
preserves every valid dual-record gate field, release decision, pending or consumed nonce,
checklist mark, and historical event; it never synthesizes a gate release or repairs a malformed or
missing half. Recovery may advance across a prerequisite gate only when that gate's state
field and its matching `stage.gate.release` event both exist, carry the same decision and
nonce, and pass the dual-record contract. An absent, stale, or mismatched half fails closed
and blocks recovery; phase names or legacy status alone never release a gate.

**Native Codex accounting overlay — conditional.** Apply this overlay only when
a `phase.end` contains `usage.kind: codex_usage_delta`; a trace without that
object remains on the legacy/Claude `total_tokens: N` and pricing contract
above. The selected Codex snapshot changes the value grammar and adds only
these fields:

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

**Declared Codex agent-lifecycle overlay — conditional.** Apply this overlay
only when the trace contains `agent.spawn`, `agent.close`, or
`agent.correction.spawn`; a trace without those records retains its existing
state grammar. These are coordinator-declared lifecycle records, not native
session telemetry. The selected snapshot adds only these fields:

```text
agent_lifecycle_schema_version: 1|null
agent_lifecycle_metrics_status: available|unavailable|null
agent_lifecycle_metrics_reason_code: {closed lifecycle code}|null
agent_lifecycle_attempt_count: N|null
agent_lifecycle_follow_up_count: N|null
agent_lifecycle_correction_count: N|null
agent_lifecycle_quality_verdicts: {pass:N,concerns:N,fail:N,n_a:N}|null
agent_lifecycle_metrics: {cached_input_tokens,uncached_input_tokens,output_tokens,wall_time_ms,tool_calls}|null
approved_ac_count: N|null
cached_input_per_approved_ac: decimal|unavailable
```

The snapshot aggregates only terminal `agent.close.attempt_metrics` records as
defined by `references/observability.md`; it does not divide, attribute, or
copy a root/phase usage delta. A missing, duplicate, open, malformed,
unavailable, or conflicting attempt makes `agent_lifecycle_metrics_status:
unavailable`, clears `agent_lifecycle_metrics`, and renders
`cached_input_per_approved_ac: unavailable`. Count follow-ups from final
closes, corrections from correction spawns, and quality verdicts from their
closed enum only. `approved_ac_count` is a current approved-plan count with no
AC text or identifier. Never write a native ID, alias, rollout path,
transcript, prompt, tool output, or free-form task label into this overlay.

**Intake classification** — the orchestrator produces the initial values at intake. `security_sensitive` is monotonic: the named plan and Phase-2-close backstops may escalate `false → true`, but no downstream step may change `true → false`. The other fields are never re-derived downstream.
```
security_sensitive: true|false
frontend_scope: true|false
bug_tier: 1|2|3|4|null
bug_tier_source: auto|operator|architect-promote|null
```

**Design classification** — `architect` produces these at Design time; the orchestrator transcribes them (next block). They do not exist at intake and the orchestrator never authors a value for them.
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

Every field belongs to exactly one of these two blocks, with one producer and one production state. `changes_security_control` sits in the second: it is a property of the designed change, so it cannot be known at intake. Before Design closes it is simply **absent** — never `null` standing in for "not yet decided", because an absent field and a decided-`false` field must not look alike to a reader. `security_floor_applies` derives from `security_sensitive` alone (`agents/ref-pipeline.md § Validation`), so nothing gated is waiting on the second block.

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

`architect` returns the values as a structured `classification:` status-block
field mirrored in `01-plan.md § Review Summary § Classification block`; it
does NOT write `00-state.md`. Validate before transcribing: all nine fields
(the eight above plus `changes_security_control`) present as bare booleans and
matching the plan mirror — any gap or mismatch is `status: failed` for that
dispatch; re-dispatch `architect`, never fill a value with your own judgement
or transcribe a partially-valid block. Transcribe the nine values literally.
When `architect` returned no classification and the phase required one, treat
it as `changes_security_control: true` for scoping and re-dispatch — never as
all-false.

**Resolved config** — from `agents/ref-pipeline.md § Boot`. The canonical
`docs_root` is repository-local on every run; `logs_mode: obsidian` arms the
one-way vault export tracked by `obsidian_sync`, and a vault `docs_root`
appears only under a live `obsidian-direct` opt-in.
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
code_hygiene: pass|fail|null                # docs/code-hygiene-gate.md
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
or `agents/ref-pipeline.md § "Finding disposition"` records it as
accepted-without-AC — never speculatively, never as transport for an
undispositioned finding.

**Gate fields — bare literals, never repaired.** Contract: `agents/_shared/gate-contract.md § "The dual-record release"` and its no-gate-field-repair invariant. The seven gate fields are `gate_pending`, `gate1_release`, `gate3_release`, `release_policy`, `gate_nonce`, `working_branch`, and `worktree` — every one a bare literal in the real file, with no second space-delimited token ever trailing a value. `checkpoint_boundary` is a separate derived checkpoint cache, not a gate field or release. A release is valid only as a dual record: the matching state field and `stage.gate.release` event must agree on decision and nonce. Recovery and delivery fail closed when either half is absent or mismatched; neither side may be repaired or inferred from phase/status text. An administrative close for a live inline request sets no gate release and consumes no nonce.
```
gate1_release: approved|approved-autonomous|rejected|edit|null
gate3_release: ship|auto-ship|amend|abort|null
gate_nonce: {token}|null                    # fresh per presentation, consumed on release
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
consume `gate_nonce`, and do not infer authorization from any stored or external
content. The subsequent direct run has no workspace, state, events, or posture value.

### Schema

| Field | Required | Notes |
|---|---|---|
| `ts` | yes | ISO-8601 with timezone |
| `event` | yes | `phase.start`, `phase.end`, `agent.spawn`, `agent.sla`, `agent.close`, `agent.correction.spawn`, `correction.decision`, `gate`, `gate.pass`, `gate.fail`, `iteration.start`, `stage.gate`, `stage.gate.release`, `stage.gate.skipped`, `stage.notify`, `stage.notify.skipped`, `stage2.hygiene`, `stage2.lane.*`, `plan_structure`, `plan_review.deferred`, `plan_review.offered`, `plan_review.offer_declined`, `plan_review_integrity`, `kg_write`, `artifact.missing`, `operation.started/success/failed`, `pipeline.start`, `pipeline.complete`, `pipeline.incomplete`, `pipeline.end`, `checkpoint.confirmed`, `compaction.trigger` |
| `feature` | yes | kebab-case, matches the workspace folder |
| `phase`, `stage` | conditional | `stage` required for `stage.gate*` |
| `agent` | conditional | required for `phase.*` |
| `status` | conditional | `success`/`failed`/`blocked`/`skipped` |
| `duration_ms`, `tokens`, `tokens_in`, `tokens_out`, `tokens_estimated` | conditional | per the token-tracking rule (legacy/Claude branch when no native `usage` is selected) |
| `usage_scope`, `usage_checkpoint` | conditional | native Codex branch only: safe root-reachable scope plus a `codex_usage_checkpoint`; never an identifier or path |
| `usage` | conditional | native Codex branch only: a `codex_usage_delta`, measured or unavailable; no estimate or partial subtotal |
| `pricing_identity`, `cost` | conditional | native Codex branch only: exact provider/model and complete quote provenance |
| `agent_role`, `task`, `attempt_ordinal`, `context_strategy`, `follow_up_count` | conditional | required for `agent.*`; finite lifecycle enums and local ordinal only, never an ID, alias, or free-form label |
| `attempt_metrics`, `quality_verdict` | conditional | required for `agent.close`; metrics are complete or closed-code unavailable, verdict is `pass`/`concerns`/`fail`/`n-a` |
| `correction_cause` | conditional | required for `agent.correction.spawn`; literal `verification` only |
| `correction_nonce`, `correction_anchor`, `correction_findings`, `correction_scope`, `correction_requirements`, `correction_closure`, `correction_dispositions` | conditional | required for `correction.decision` and every authorized `iteration.start`/`agent.correction.spawn`; the complete seven-field package must be byte-for-byte identical across all three events, not merely share a nonce; exact bounded identity, never inferred; closure has one deterministic check/expected result per finding |
| `correction_authority`, `correction_authority_gate_nonce` | conditional | required and byte-identical across `correction.decision`, `iteration.start`, and `agent.correction.spawn`; `operator-live` uses a null Gate nonce and is unbounded, while `gate1-autonomous` requires the exact nonce from the valid Gate-1 approval release and `autonomous_correction_count < 3` |
| `verdict` | conditional | `pass`/`concerns`/`fail`/`partial-fail` |
| `decision` | conditional | required for `stage.gate.release` and `correction.decision`; correction value is `authorize\|pause\|abort` |
| `cause` | conditional | `verification` for new `iteration.start` correction rounds; historical `operator` values remain readable |
| `provenance` | conditional | required for `checkpoint.confirmed`; a **closed enum, never free text**, and never subject to the bound below |
| `tools`, `model`, `effort` | optional | propagated verbatim from the returning status block |
| `extra` | optional | event-specific |

**Never pretty-print** — one JSON object per line, append-only. In obsidian mode the same JSONL lives inside a ```` ```jsonl ```` fence; extract with `sed -n '/^```jsonl$/,/^```$/{/^```/d;p}'` before piping to `jq`.

### Free-text bound

Every free-text field — `operation.*`'s `detail`/`error`/`suggestion`, `kg_write.writes[].detail`, `plan_structure.extra.detail`, and the notification `{summary}` — is **one compact clause, ≤120 chars**, never multi-sentence narrative, stripped of `\n\r\t` and quote characters. **Format only:** it never reduces one-object-per-line and never substitutes for an event.

**One named exception, additive: the `checkpoint.confirmed` confirmatory text.** ≤280 chars (one confirmatory turn, not the surrounding conversation). Quotes and `\n\r\t` are **escaped as JSON string escapes, never stripped**, so the operator's exact characters survive. Every backtick is escaped at the byte level with its unicode escape (U+0060) rather than left literal — this protects the JSONL fence obsidian mode wraps the trace in, which the quote escape alone does not. Truncation past the bound is marked visibly with `…[truncated]`. The secret prohibition is unaffected: a confirmation carrying a credential records `provenance` and `withheld — secret prohibition` in place of the text. Altering the recorded characters inside the bound is exactly the stripping this exception exists to avoid.

### `tools` propagation

| Status-block line | `tools` sub-object |
|---|---|
| `context7_consult: hit:N miss:N skipped:M` | `"context7": {"hit", "miss", "skipped"}` |
| `memory_consult: search_nodes:N open_nodes:N` | `"memory": {"search_nodes", "open_nodes"}` |
| `kg_save_candidates: [a, b]` | `"kg_save_candidates": [...]` |

Omit sub-objects not reported; omit `tools` entirely if none.

### `kg_write`

One event per write batch, stamping the literal `site`. With capture off the automatic path, the live site is the audit's security-finding write (`site: security-finding`); an on-request save stamps its own. Closed 4-value reason vocabulary: `ok`, `skipped:mcp-down`, `skipped:malformed-call`, `skipped:policy-filtered`. Best-effort — never changes control flow.

**`kg_write` is deliberately singular.** Do not introduce `kg.started`/`kg.success`/`kg.failed`. Silent-on-success knowledge operations use `operation.*` with a `detail` discriminator; `kg_write` is the one exception to that family — a batch-with-counts event `operation.*` cannot express without contaminating its single-operation schema.

### Reconciliation backstop

At every gate emission, before the block: count `[x]` checklist rows against `phase.end` events and backfill any gap with `tokens_estimated: true` + `backfilled: true`, deriving `duration_ms` from trace breadcrumbs when available, else the heuristic. **Never overwrite a measured event.**

**Native Codex exception, selected only by `phase.end.usage`.** When the trace
contains `usage.kind: codex_usage_delta`, do not use the legacy heuristic for
that trace. Repair a missing native closure only with one `phase.end` carrying
an unavailable collector-safe `usage` result and `backfilled: true`; never
estimate, use zero, or preserve a partial native subtotal.

## Decision ledger

`{docs_root}/00-decision-ledger.{jsonl|md}` — append-only, distinct from the events file. Records durable decision dispositions, rationale, and dry-run enforcement **only** — never phase timing, tokens, or tool counts, which stay in the trace. **The orchestrator is the exclusive writer.**

**Write sites:** `gate-verdict` (at Gate 1, Gate 3 and any explicit plan-review result — the verdict already computed plus a one-sentence rationale); `operator-approval` (every gate reply — the decision already recorded, plus the rationale from the operator's own text or `"no reason given"`); `disposition` (a finding accepted, watched or rejected at a gate, or per-comment during an apply-review round — only an explicitly non-correctable finding may be accepted at Gate 3; a correctable `broke-it` or incomplete sensitive coverage must return to implementation and cannot be recorded as `ship-over-finding`); `dry-run-enforced` (a deploy or migration routed through dry-run first).

**Confidence is not approval.** A high-confidence plan or a green suite never substitutes for the operator's gate decision.

## Pipeline summary

`{docs_root}/00-pipeline-summary.md` — rewritten **in full, never appended**, at four mandatory checkpoints: the STAGE-GATE-1 emission, Freeze, every `iteration.start`, and pipeline end. Rewriting at other transitions is best-effort.

Sections: `## TL;DR`, `## Phase Timeline`, `## Dispatch Issues`, `## Tool Effectiveness`, `## Verification Packet`, `## Cost`, `## Lifecycle Efficiency` (only for a selected declared lifecycle trace), `## Iterations`, `## Files Changed`. Field-by-field derivation: `docs/observability.md § Pipeline Summary Protocol` and `§ Cost rollup`.

**Every number derives from the trace — never re-invented by walking workspaces.** The summary is a render of the trace, not an independent source of truth. `## Iterations` references each round **by ID only** and never re-tells what happened in it; the narrative lives only in `failure-brief.md`.

**Native Codex summary branch.** Only when `phase.end.usage.kind` is
`codex_usage_delta`, render the safe native aggregate from
`references/observability.md`; unavailable usage or exact USD provenance then
renders `Cost: unavailable`. A summary with no such object retains the legacy
token and price rendering unchanged.

**OpenSpec Gate-1 trace preflight.** After the two Design architect attempts
close and before presenting Gate 1, validate the complete configured events
file and bound feature with the packaged `openspec-events.mjs`. Missing `ts` or
`feature`, a dispatch mode serialized as lifecycle `task`, a non-canonical
status, missing `attempt_metrics`, or any open attempt fails closed. Do not
repair the append-only trace as part of gate presentation.

**Declared lifecycle summary branch.** Only when an `agent.*` lifecycle event
exists, render `## Lifecycle Efficiency` from the conditional lifecycle
overlay: declared attempts, final follow-ups, corrections, closed quality
verdict counts, cached input, uncached input, output, wall time, tool calls,
approved-AC count, and cached-input-per-approved-AC. If the attempt aggregate
or denominator fails closed, render every affected metric as `unavailable`;
never attribute phase usage to an attempt or retain a partial total. This
additive section does not select or alter either cost branch.

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
   the agent returns (with `tokens`, `duration_ms`, `tools`, `model`, `effort`),
   `gate` when a gate is reached. **First, because events are append-only and
   must reflect real time** — backfilling later loses timestamp accuracy.
   **Legacy Claude branch — no native `usage` object.** **Token tracking is
   mandatory.** Every `phase.end` carries `tokens`: from the call result
   metadata when available, otherwise estimated (`duration_min × 1500`
   opus-heavy, `× 800` sonnet-heavy) with `tokens_estimated: true`.
   **`"tokens": 0` is forbidden.**

   **Native Codex branch, selected only by `phase.end.usage.kind`.** For a
   native `codex_usage_delta`, append the safe `usage` object and checkpoint
   shape from `plugins/team-harness/skills/pipeline/references/observability.md`
   instead of using the legacy token estimate for accounting. Every started
   native phase is measured by checkpoint subtraction or records a
   collector-safe unavailable result. Zero substitution is forbidden in both
   branches; aliases and partial totals are additionally forbidden in this
   native branch.

   **Declared specialist lifecycle.** Immediately before a deliberate
   specialist dispatch or continuation, append the matching allowlisted
   `agent.spawn`; on a terminal return append exactly one `agent.close` before
   the enclosing `phase.end`. A verification correction emits a fresh
   `agent.correction.spawn`, never a continuation of a terminal ordinal. These
   coordinator declarations use only the finite fields in
   `references/observability.md`; they are not a request to recover native
   lifecycle telemetry or attribute phase usage to an attempt.
2. **Update `00-state.md`** — the `§ Current State` fields, the completed state `[x]`, and the `§ Agent Results` row **upserted by `(agent, phase)` key**: overwrite in place on a same-key re-run across iterations, never append a duplicate. A new row appears only for a genuinely new key, so `qa` and `adversary` in validation each keep their own current verdict and are never collapsed to one last-writer-wins value.
   *Narrative sections are gone.* There is no TL;DR to rewrite, no Hot Context to overwrite, and no prose recovery section: the events file carries the narrative and the `next_action` field carries the recovery instruction.
3. **Only then dispatch.**

**Enforcement:** never dispatch the next phase until the event is appended and the state file updated. If compaction lost the place, read the trace — when the last event does not match the last `[x]`, backfill before continuing.

**Merge and push guard:** never merge a PR or push until `validation` is `[x]` **and** STAGE-GATE-3 is cleared per the dual record. `"ship it"` outside that gate's own reply never overrides this. This rule — enforced by the orchestrator against itself, at the moment it would otherwise call the push step — is the actual mechanism that keeps a push from preceding its gate; no hook reads `gate3_release` to enforce the same order from outside.

### Artifact verification

After every dispatch returning `success`, verify the expected doc exists on disk before proceeding.

| Agent | Phase | Expected |
|---|---|---|
| `architect` | `design` | `01-plan.md` + any triggered `sketches/*` |
| `architect` | `design` root-cause | `01-root-cause.md` **and** `01-plan.md` |
| `implementer` | `implementation` | `02-implementation.md` |
| `tester` | `implementation` regression | `02-regression-test.md` |
| `tester` | `implementation` evidence | `03-testing.md` |
| `qa` | `validation` | `reviews/04-validation.md` |
| `adversary` | `validation` | initial: `reviews/04-adversary.md`; operator amend `N`: `reviews/04-adversary-amend-{N}.md` |
| `qa-plan` | explicit plan-review | `reviews/01-plan-review.md § Plan Ratification` |
| `plan-reviewer` | explicit plan-review | `reviews/01-plan-review.md § Plan Review` |
| `delivery` | `delivery` | `inputs/pr-body-draft.md` + the pipeline Acceptance Matrix |

For `adversary`, resolve the expected path from the current dispatch/status
block's exact `audit_run`: `initial` maps to `reviews/04-adversary.md` and
`amend-N` maps to `reviews/04-adversary-amend-{N}.md`. Never glob for an amend
report or select the greatest suffix. If the exact current report is absent,
verification fails even when an older amend report exists.

Exists and non-empty → proceed. Otherwise append `artifact.missing` (`action: retry`) and re-dispatch **exactly once** with an explicit "your artifact was not found" instruction. A second failure → `artifact.missing` (`action: escalate`), `status: blocked`. This is the `artifact-missing` failure kind (`agents/ref-pipeline.md § Failures`).

**No agent in the table above is exempt.** `qa-plan` in ratify mode writes `reviews/01-plan-review.md § Plan Ratification` per the panel contract (`agents/_shared/plan-consolidation.md § "Section-ownership map"`), so its row is verified like any other. An exemption would only apply to an agent producing no artifact at all, and the table lists none.

### Final sanity check

After delivery returns `success`, before the GitHub update substep:

1. Enumerate the `status: success` rows in `§ Agent Results`.
2. Resolve each expected artifact from the table above, excluding no-file rows.
3. Verify each exists and is non-empty.
4. Verify `00-pipeline-summary.md` exists, is non-empty, and contains `## Cost`.
5. Verify the trace exists and `phase.end` count ≥ the count of `[x]` checklist rows.

**Pass** → append `pipeline.complete`, proceed. **Fail** → append `pipeline.incomplete`, set `status: blocked-incomplete`, and STOP listing the missing artifacts. **Do not emit "pipeline complete."** The GitHub update substep does not execute. The PR already on remote stays valid; the operator resolves and resumes via `/th:recover`.

### Terminal status write — mandatory

Set `status: complete`. The record-based recover backstop and a human reading
the file directly — the two live consumers — exclude a finished pipeline only
through this write; without it a shipped run's `gate3_release: ship` state
stays a live-looking candidate for a later run reusing the same branch or
worktree path.

Then append `## Final state — ready for handoff` (branch, version, PR, AC count, iterations, outcome) and surface the `/compact`-or-`/clear` prompt.

When `obsidian_sync: armed` and the terminal close, pause, or abort did not
already export at draft-PR creation, run the same one-way export described in
`agents/_shared/delivery-mechanics.md § 5` before ending the turn: atomic copy
to the recorded target, `obsidian_sync: exported` on success, `pending` with
one sanitized reason on failure, never a block.

### Process reflection

Append: iterations and the root cause if any, the smoothest phase, the friction point, the prevention insight. **A `process-insight` entity is saved only for a non-obvious recurring pattern** — never a generic "everything went well," and only when the operator asked for a save.

**No mid-pipeline investigation writes.** The only knowledge operations added mid-pipeline are the reads on an R0 or build/lint failure and the audit's security-finding write. No others, at any point. The session stays open — those touchpoints never close it early.

## Flow telemetry

Cross-user flow-event emission, gated on `flow_telemetry.enabled` in `~/.claude/.team-harness.json`, read at boot alongside the other config. **Best-effort and non-blocking: telemetry never halts, fails, or delays a pipeline.** Field shapes and the emission contract: `docs/observability.md`. Disabled or absent config → emit nothing and say nothing.
