# State ownership and gates

## One machine

New pipelines write `pipeline_version: 4` and use exactly this sequence:

```text
design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete
```

The durable snapshot records `pipeline_version: 4` and `plan_format: sharded-v1`.

Every activated run uses this canonical v4 machine; there is no alternate depth
profile or route selector. The only postures are inline and pipeline. Direct
inline work never enters this machine and
never writes pipeline state. A live operator-requested tester, QA, security, or
other bounded review while inline remains an ad-hoc report with no workspace,
state, events, gates, Stage Gate, or delivery record. An explicitly activated
pipeline cannot execute direct work in place; a current live explicit `inline`
request first closes the run administratively (`phase: aborted`, `status:
aborted`, pending gate cleared, no gate release), then returns to direct work
with no new state or workspace.

Implementation checkpoints (regression, reconciliation, hygiene, evidence, and
Freeze) are trace details inside `implementation`; acceptance is a trace detail
inside `validation`. They are not additional persisted phases.

Native Codex usage is also a trace detail, but it is mandatory: every started
phase ends with the measured or unavailable `phase.end` shape in
[observability.md](observability.md). A phase name, gate, or successful result
never supplies a token value by implication.

For an OpenSpec-bound Design, Main must run the packaged
`openspec-events.mjs` against the complete configured events file and bound
feature after the required architect work closes and before writing
`phase: waiting_gate1`. Only `verdict: pass` permits Gate 1. Malformed telemetry
is a warning and does not poison otherwise complete evidence. Main may append a
canonical replacement event for directly observed facts when needed, but must
not rewrite history, infer a result, or repair gate authority.

## Ownership and snapshot

The primary Codex thread exclusively owns `00-state.md`, execution events, gate
presentation/interpretation, and consolidated specialist results. Specialists
return bounded results and may edit only their assigned repository files and
report artifacts; they never write state, releases, nonces, or gate events and
never speak for the operator. Write `next_action` before every dispatch and
record its result before advancing. Preserve unrelated changes.

The absolute `workspace_identity.coordinator_root` selected directly by
`workspace_identity.logs_mode` and the effective
mode become immutable identity at the first state write. Every
artifact and event for that run stays below that one canonical root. A
permission failure, restart, recovery, or configured-root change never
migrates or splits an existing pipeline; only an explicit abort followed by a
separate activation may choose another root. `logs_mode: obsidian` means the
canonical workspace is in the configured vault.

Keep a replaceable snapshot with these stable fields (narrative belongs in the
events file):

```text
pipeline_version: 4
plan_format: sharded-v1
openspec_preflight: pending|ready|provisionable|blocked-prerequisite|invalid-project|null
openspec_design_pass: preflight|provisioning|planning|snapshot|overlay|gate1-ready|null
workspace_identity: {schema_version, kind, workspace_kind, logs_mode, coordinator_root, repo_base, date, feature, initiative, services, evidence_repositories}
openspec_bindings: [{service, role, repository_root, repository_identity, change_name, planning_root, schema, cli_version, generated_skill_identity, task_intent_sha256, strict_validation, preflight, design_pass, snapshot_path, snapshot_sha256, overlay_path, overlay_sha256}]
evidence_repositories: [{service, role: evidence-only, repository_root, repository_identity, purpose}]
evidence_dispatch_bindings: [{service, task_shard_path, role: implementer|tester|null, generation: 1|2, path, sha256, dispatch_identity_sha256}]
openspec_aggregate_path: inputs/openspec-bindings.json|null
openspec_aggregate_sha256: {SHA-256|null}
helper_bundle: {compatibility_epoch, bundle_root, bundle_identity_sha256, manifest_path, manifest_sha256}|null
herdr_deliveries: [{message_id, target, pane_id, status, reason_code, staged, submitted, verified}]
activation: explicit
type: feature|fix|refactor|hotfix|enhancement
feature: {kebab-case slug}
repo_root: {absolute path}
workspace: {absolute path}
quality_manifest_path: {absolute workspace-local path|null}
quality_manifest_sha256: {SHA-256|null}
logs_mode: local|obsidian
obsidian_sync: armed|exported|pending|null
obsidian_export_target: {validated absolute vault path or null}
events_file: 00-execution-events.jsonl|00-execution-events.md
operator_language: {resolved language code}
phase: design|waiting_gate1|implementation|validation|waiting_gate3|delivery|complete|blocked|aborted
stage: 1|2|3|4
status: in_progress|waiting_for_gate|iterating|paused|paused_for_amend|complete|blocked|blocked-incomplete|aborted
security_sensitive: true|false
frontend_scope: true|false
bug_tier: 1|2|3|4|null
bug_tier_source: auto|operator|architect-promote|null
last_completed: design|waiting_gate1|implementation|validation|waiting_gate3|delivery|complete|null
next_action: {single recoverable action}
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
correction_preflight: {path, sha256, preflight_identity_sha256, service, task_ids}|null
autonomous_correction_count: N
operator_correction_count: N
usage_schema_version: 1|null
usage_status: available|unavailable
usage_reason_code: {collector code}|null
usage_components: {allowlisted components}|null
total_tokens: N|unavailable
cost_status: available|unavailable
cost_reason_code: {closed pricing code}|null
cost_usd: decimal|null
autonomous: true|false
autonomous_granted_at: STAGE-GATE-1|null
gate_pending: gate1|gate3|null
gate_nonce: {fresh token or null}
gate1_release: approved|approved-autonomous|rejected|edit|null
release_policy: auto-ship|null
gate3_release: ship|auto-ship|amend|abort|null
regression_test_path: {path}|null
regression_test_status: failing|passing|skipped|null
test_contract_evidence: {status: pending|red|green|not-applicable|mixed, index_path, index_sha256, task_count, status_counts: {pending, red, green, not_applicable}, required_task_count, required_covered_count, required_missing_count}|null
plan_contract_evidence: {status: not-applicable, reason, result_path: null, result_sha256: null}|{status: pending|pass, reason, result_path, result_sha256, kind: team_harness_functional_plan_contract, plan_sha256, artifact_set_sha256}|{status: pending|pass, reason, result_path, result_sha256, kind: team_harness_openspec_overlay_validation, snapshot_sha256, overlay_sha256, change_name}|null
plan_contract_repair_evidence: {status: not-needed|repaired|blocked, reason, result_path, result_sha256, before_sha256, after_sha256, added_paths, artifact_changes: [{path, before_sha256, after_sha256, operations}], contract_result_sha256}|null
participating_repositories: [{repository, repo_root, worktree}]|[]
cleaner_evidence: {status: pending|baseline|pass|cleaner-failed|cleaner-blocked|handoff-pending|handoff-pass|handoff-failed|handoff-blocked|not-applicable, reason, allowlist_path, allowlist_sha256, baseline_path, baseline_sha256, baseline_commit_sha, baseline_tree_sha, cleaner_commit_sha, post_path, post_sha256, post_commit_sha, post_tree_sha, handoff_closure_path, handoff_closure_sha256, handoff_commit_sha, handoff_post_path, handoff_post_sha256, handoff_post_commit_sha, handoff_post_tree_sha}|null
cleaner_repo_evidence: [{repository, repo_root, worktree, evidence: cleaner_evidence}]|[]
plan_review_status: not-requested|requested|pass|concerns|fail|null
audit_status: pending|done|unavailable|null
code_hygiene: pass|fail|null
verification_base_source_ref: origin/main|{dep-branch}|{commit}
verification_base_ref: {immutable commit or null}
freeze_anchor: {immutable tree anchor or null}
freeze_commit_sha: {full commit object ID or null}
freeze_tree_sha: {full tree object ID or null}
open_findings: [{id, disposition}]|[]
worktree: {absolute path or null}
worktree_branch: {branch or null}
worktree_base: {immutable full commit SHA or null}
working_branch: {branch or null}
delivery_version: {committed version}|not-bumped|null
delivery_version_axis: patch|minor|none|null
delivery_version_rationale: {one sentence naming supported-contract impact}|null
delivery_diff_composition: {total_lines, total_files, mechanical_files, substantive_files}|null
delivery_size_result: within-bounds|flagged|null
delivery_size_justification: {workspace pointer}|null
delivery_base_status: {base_ref, freeze_base_sha, remote_base_sha: {full SHA}|null, status: current|moved|unknown}|null
delivery_preview: {pr title, workspace paths, and SHA-256 digests bound to Gate 3}|null
```

New runs always set `obsidian_sync: null` and `obsidian_export_target: null`.
The two fields remain only so recovery can honor legacy export-armed snapshots
without rewriting their state schema.

Specialist liveness remains append-only event state rather than a mutable
coordinator-state field. `agent.sla.extra` records `{attempt, attempt_token,
liveness_action, deadline_at, probe_delivery_state,
probe_delivered_at|null, continuation_count}`. A successful native message call
without an explicit delivery/read receipt records `unconfirmed`; a matching ACK
itself proves delivery. After interruption, `agent.close.extra` repeats the
identity and records `owned_paths_changed`, `evidence_changed`,
`interruption_cause`, `continuation_count`, and the closed liveness
`failure_kind`. These are nested `extra` fields on canonical `agent.sla` and
`agent.close` events, not new event names. Persist declared path names and
booleans only, never partial file contents. Recovery uses those timestamps and
cannot reset an expired lease; legacy v3.20.5 probes without delivery state are
`unconfirmed`.

When non-null, `quality_manifest_path` must be a regular non-symlink below
`workspace`. If that workspace is below a participating repository, the
manifest must also be ignored and untracked. It is operational state, never a
product diff entry. Persist the exact file hash in
`quality_manifest_sha256` after each authorized change and verify both fields
during recovery before running quality.

`autonomous_correction_count` is an integer from `0` through `3` and is the
only correction budget. `operator_correction_count` is a non-negative,
monotonic, deliberately unbounded integer. Both are exact materialized
projections of valid authorize `correction.decision` events for their matching
authority; recovery verifies them even when present and mechanically repairs a
mismatch before consulting either budget. `iteration: N/3` is a
legacy-readable display mirror only; new runs may omit it and derive it for
presentation. Initialize both counters at `0`.

`evidence_dispatch_bindings` contains at most one active pointer per
service/task pair. Generation 1 binds planned read-only evidence and has a null
role. Generation 2 supersedes that pointer only for a certified
`PACKET_SCOPE_INSUFFICIENT` recovery and names the exact implementer/tester role
whose clean exhausted attempts restart; it never deletes or rewrites the prior
workspace artifact.

`cleaner_repo_evidence` is complete only when its canonical identity set equals
`participating_repositories` exactly, with neither missing, extra, nor duplicate
identities, and one terminal evidence entry exists for every participating
repository. Main maps cleaner `failed`/`blocked` returns to
`cleaner-failed`/`cleaner-blocked` and authorized implementer failures or blocks
to `handoff-failed`/`handoff-blocked`. These terminal non-pass states never
alias `pending` or `pass` and block Freeze for their immutable attempt. They do
not close the pipeline or invalidate its branch and commits. Recovery preserves
their hashed artifacts and events append-only, then may replace only the
current-state pointer after an in-scope correction creates a new candidate and
fresh attempt with attempt-qualified evidence paths. Only
`phase/status: complete|aborted` is terminal for the run.

Also keep a short phase checklist and a bounded specialist-results table with
only the latest result per role. The complete file must stay ≤160 lines and
≤16 KB. Update existing fields in place; do not grow narrative inside the
snapshot.

`helper_bundle` binds the immutable workspace-local copy produced by
`helper-bundle.mjs materialize`. `bundle_root` and `manifest_path` are
workspace-relative; the other fields bind exact bytes and the compatibility
epoch. Resolve operational helper paths only from a fresh `verify` pass over
this manifest. Plugin-cache paths are bootstrap inputs only and are never
durable operational coordinates.

`test_contract_evidence` is always a bounded pointer and summary, never an
inline per-task array. `index_path` names the workspace-owned
`evidence/test-contracts.json` artifact and `index_sha256` binds its exact
bytes. That closed schema-versioned artifact contains at most 128 task records
with `task_id`, status, `not_applicable_reason`, `contract_path`,
`contract_sha256`, `red_evidence_path`, `red_evidence_sha256`,
`red_commit_sha`, `red_tree_sha`, `green_evidence_path`, and
`green_evidence_sha256`. Main atomically replaces the artifact and recomputes
the digest, task count, overall status, four status counts, and
`required_task_count|required_covered_count|required_missing_count` after
every task transition. The required set comes from every writable binding's
accepted traceability overlay; `pending: 0` never proves complete coverage when
a required row is absent. This keeps the snapshot below 16 KB even at the
maximum task count.

`worktree`, `worktree_branch`, and `worktree_base` are declared topology, not
proof of creation. A worktree plan records all three before Gate 1 and keeps
`working_branch: null` until implementation entry verifies the registered path,
exact branch, and immutable base. A protected-`.git` approval timeout uses
`status: paused` plus the exact pending command in `next_action`; it does not
change `phase`, invalidate Gate 1, or create another gate.

`usage_*`, `total_tokens`, and `cost_*` are the current aggregate rendered from
`phase.end.usage` records under [observability.md](observability.md). They
contain no root or session identifier, rollout path, raw rollout payload, or
session list. An unavailable phase makes the aggregate unavailable rather than
leaving a plausible subtotal; `reasoning_output_tokens` remains a component and
is never added to `total_tokens` a second time.

When lifecycle declarations exist, `agent_lifecycle_*`, `approved_ac_count`,
and `cached_input_per_approved_ac` are the conditional aggregate defined in
[observability.md](observability.md). The state key `n_a` aggregates only the
closed event value `n-a`; it never introduces a new quality-verdict enum.

Routine operator updates follow `plan-shards.md`: at most
five lines containing only outcome, changed state, blocker/risk, next action,
and artifact link. Do not copy specialist or workspace prose into the update.

The named phase checklist is fixed and remains in the snapshot:

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

`open_findings` is written only by the coordinator after disposition. Recovery
surfaces any entry without a matching disposition record before preparing a
gate; it is not a transport for unreviewed specialist output.

`iteration` is retained as a serialized compatibility key, but its only
meaning is the implementation/validation correction counter (`0` through `3`).
Increment it only for a code, test, documentation, or evidence correction that
re-enters implementation or validation. Mechanical plan repairs, operator
decision transcription (including security-obligation classification), and
explicit architect work never increment the counter and never emit a new
`iteration.start`; historical `cause: operator` events remain readable but are
not produced by new writes. The pre-Freeze cleaner handoff is also excluded: it
uses `cleaner.handoff.decision` and `agent.cleaner-handoff.spawn`, never an
iteration or validation-correction event.

## Mandatory cleaner-to-implementer decision

The cleaner is a one-shot-per-repository implementation checkpoint, not a
correction round. A cross-repository pipeline dispatches separate fresh
cleaners with separate worktrees, allowlists, baselines, manifests, candidate
identities, and `cleaner_repo_evidence`; no cleaner receives multiple
repositories. Each finishes all independent safe allowlisted work before returning complete
`implementer_findings`. Main records the cleaner result and deterministic post
evidence before considering a handoff. A machine failure joins the handoff only
when its cause, paths, implicated requirements, bounded correction, closure
check, and expected result are complete and the correction belongs to the
implementer; infrastructure or ambiguous failures block.

Before creating a nonce, require the closed handoff predicate: exactly one
repository/worktree, one dependency-coherent behavior-preserving objective,
one to five findings, no more than eight unique files, already-approved scope,
no DDL/migration, public-schema, security-control, external-environment, or new
decision dependency, locally executable closure checks, and a complete
workspace-local `.team-harness/quality.json`. Persist `ineligible` plus every failed
conjunct when it does not hold, issue no nonce, and dispatch nobody. Preserve
the existing commits/evidence and pause the same pipeline for an in-place
recovery package decomposed by repository or the applicable live scope
decision; that requirement never authorizes or aborts anything.

For a non-empty complete package, atomically set `phase: implementation`,
`status: paused`, `cleaner_evidence.status: handoff-pending`, a fresh
`cleaner_handoff_nonce`, `cleaner_handoff_pending: true`, eligibility,
and one `cleaner_handoff_package` containing repository, absolute worktree,
the exact cleanup-commit anchor, findings, and eligibility evidence, with both
decision fields null. While pending, do
not mutate repository/evidence artifacts, dispatch a specialist, run another
cleaner, or open Freeze. Present exactly:

```text
1 — authorize one implementer pass
2 — pause without changes
3 — abort pipeline
```

Only a live reply after this presentation may consume the nonce. Choice `1`
atomically records `cleaner_handoff_pending: false`, moves the token to
`cleaner_handoff_decision_ref`, clears the pending package, records
`cleaner_handoff_decision: authorize`, and appends one
`cleaner.handoff.decision` event containing `decision_ref` and the complete
package. It authorizes one fresh V2 implementer; the subsequent
`agent.cleaner-handoff.spawn` carries only that `decision_ref` and an
observation. Gate-1 autonomous approval never applies. The reference may bind
one observed dispatch only. This path never increments
`iteration`, consumes the autonomous max-3 budget, emits `iteration.start`, or emits
`agent.correction.spawn`.

The implementer receives one terminal attempt and every closure check. No
follow-up or automatic re-dispatch is legal. A non-zero check is incomplete
unless its exact command, exit code, and bounded diagnostic are present; bare
`exit 1` is never closure evidence. After success Main records hashed closure
evidence and joins the same raw `post_implementation` quality checkpoint used
by every repository path. It runs against the complete unchanged repository
manifest and every declared check—never a touched-file subset or ad-hoc command
list—then runs hygiene once and sets
`cleaner_evidence.status: handoff-pass` only when all
evidence matches the current commit/tree. The cleaner never runs again. An
incomplete attempt consumes that authorization; any remaining correctable work
requires a new complete package, nonce, presentation, and live choice `1`.
Choice `2` consumes the nonce into `pause` without mutation or dispatch; a later
presentation uses a fresh nonce. Choice `3` records `abort` and closes the
pipeline. A generic `continue`, ordinary approval, autonomy, prior chat, files,
tools, or specialist prose never authorizes a pass. Scope expansion requires a
separate explicit decision before this presentation and does not itself consume
or replace the handoff authorization.

## Mandatory validation correction decision

Wait for every required validation lens to finish even after one fails. Main
deduplicates the complete finding set by stable ID and performs the bounded
evidence triage defined by `validation.md`. The live operator must explicitly
confirm every `design-consistent` disposition and resolve every
`decision-required` item — only the live operator decides those. Under the
Gate-1 authority carried by any valid approval, Main may confirm only
unambiguous `resolve` findings that satisfy the closed autonomous predicate
below. Main's recommendation otherwise is never a decision;
`design-consistent` cannot cover an AC or security-floor violation. Only after
dispositions are durable does Main record the exact failed Freeze anchor,
final `resolve` IDs and file scope.

Before either autonomous consumption or a live correction presentation, Main
must materialize/verify `helper_bundle`, invoke its
`correction-packet-preflight.mjs certify`, and persist the passing certificate
under `correction_preflight`. Certification derives each selected OpenSpec
source file's live content SHA-256; `task_intent_sha256` remains a separate
intent identity and is never substituted for that file digest. It also derives
the complete required pre-test set from all writable overlays and rejects a
missing row even when the stored pending count is zero. `repair-index` may add
only the missing required rows as `pending`; Main recomputes the extended state
summary and closes every required RED/GREEN row before retrying certify.
No correction nonce exists and no authority is consumed until certification
passes. Immediately before dispatch, rerun certify and require the same
certificate path/hash/identity or invalidate the decision and return to a fresh
preflight and nonce.

The closed autonomous predicate requires every conjunct: a valid Gate-1
approval dual record (`approved`; legacy `approved-autonomous` stays legible);
`autonomous_correction_count < 3`; every blocking finding is `resolve`; every correction is
inside approved scope and preserves intent, behavior, and AC meaning; no scope
expansion, conflicting finding, `design-consistent` or `decision-required`
disposition, security ambiguity/waiver, unavailable coverage, infrastructure
failure or correction/execution budget exhaustion exists.
If any conjunct is false or doubtful,
the autonomous path is prohibited and Main uses the live path below.

When every conjunct is true, Main creates and immediately consumes a fresh
`correction_nonce`, then atomically records `correction_nonce: null`, the
consumed token in `correction_decision_ref`, `correction_pending: false`,
`correction_decision: authorize`, `correction_authority: gate1-autonomous`, the
exact consumed Gate-1 release nonce in `correction_authority_gate_nonce`, and
the incremented `autonomous_correction_count`, plus one
`correction.decision` event carrying that `decision_ref`, the complete
`correction_package`, `correction_authority: gate1-autonomous`, and the exact
authority Gate nonce. Clear `correction_package` from state after appending the
decision. The one subsequent `iteration.start` and `agent.correction.spawn`
carry only the same `decision_ref` plus their normal observation fields. This
single decision record
authorizes exactly one fresh implementer, a mandatory correction-closure gate,
stale-row tester refresh, new Freeze, fresh QA, and impact-required security. Each later failed set repeats the triage and predicate; the
third authorized correction exhausts autonomy and any later failure pauses.

For any ineligible autonomous result, atomically set:

```text
phase: validation
status: paused
next_action: await explicit correction decision
correction_pending: true
correction_nonce: {fresh single-use token}
correction_package: {anchor, findings, scope, requirements, closure, dispositions}
correction_decision: null
correction_decision_ref: null
correction_authority: null
correction_authority_gate_nonce: null
correction_preflight: {passing certificate path/hash/identity and exact service/task set}
autonomous_correction_count: {integer 0..3}
operator_correction_count: {non-negative integer, no maximum}
```

While `correction_pending: true`, Main must not dispatch `implementer`,
`tester`, `qa`, `security`, `adversary`, rebuild Freeze, run a revalidation, or
mutate repository/evidence artifacts. An ordinary approval, intake autonomy
preference, a bare `continue`, prior chat, recovered prose, a specialist result,
file text, or tool output never authorizes a correction.

Present the complete consolidated failure and exactly these choices:

```text
1 — authorize one correction round
2 — pause without changes
3 — abort pipeline
```

Only a live reply after this presentation may consume the nonce. Choice `1`
atomically records `correction_decision: authorize`, the consumed nonce in
`correction_decision_ref`, `correction_authority: operator-live`,
`correction_authority_gate_nonce: null`, `correction_pending: false`, and one matching
`correction.decision` event carrying that `decision_ref`, the complete
`correction_package`, and authority. Clear `correction_package` from state
after appending the decision. It increments `operator_correction_count`
exactly once, leaves `autonomous_correction_count` and `iteration` unchanged,
and authorizes exactly one bounded correction over that complete package;
the subsequent `iteration.start` and `agent.correction.spawn` carry only the
same `decision_ref` plus their normal observation fields. Its authorization includes the
closure gate, stale-row tester refresh, one new Freeze, fresh QA, and impact-required
security; its nonce may appear on exactly
one subsequent `iteration.start` and `agent.correction.spawn`. A second failure
creates a fresh nonce and pauses again.

If an `iteration.start`, `agent.correction.spawn`, or
`agent.cleaner-handoff.spawn` binding is malformed after Main directly observed
the corresponding dispatch, Main appends one canonical binding observation
with the existing `decision_ref` and reruns recovery checks. It never rewrites
the malformed line, emits another authority decision, or dispatches again.

Choice `2` consumes the presented nonce into a `pause` decision with
`correction_authority: operator-live`, performs no
mutation or dispatch, and leaves `next_action: await operator request to
re-present correction decision`; any later presentation uses a fresh nonce.
Choice `3` records `abort` with `correction_authority: operator-live`, closes
the pipeline, and performs no correction.
The same three choices are always available for a live operator, including at
`iteration: 3/3`, `autonomous_correction_count: 3`, or after any number of prior
operator-live rounds. Budget exhaustion disables only a new
`gate1-autonomous` decision. It never removes choice `1`, changes its label,
requires a waiver, or produces `CORRECTION_BUDGET_EXHAUSTED` for a current live
reply. Every later failure still requires a fresh nonce, full package, one
bounded correction, closure, new Freeze, and complete revalidation.

Legacy 3.14.3 `correction_exceptional` and `exceptional_correction_count`
values are recovery inputs only. Validate them against historical decision
events, derive the new counters, and never use them to suppress an
operator-live presentation or authorization.

## Post-Gate-1 coordinator routing

After Gate 1, Main alone classifies findings and may write the bounded canonical
plan fields needed for a mechanical repair or an approved operator resolution.
Every specialist reports `Cause`, `Files`, implicated `AC-N|TC-N`, an advisory
`Suggested correction`, and deterministic closure evidence with its expected result;
none may choose a phase, plan writer, next agent, or gate. A decision-bearing
plan concern—including a security-obligation classification—continues at
`phase: implementation` after the live operator resolution. `architect` is
prohibited unless that same live operator separately and explicitly requests
architect work; only that request may set `phase: design` and require a new Gate
1. No plan repair or transcription reopens design or increments `iteration`.

## Recovery migration contract

New state has no posture/profile field. A current `pipeline_version: 4` snapshot
is valid only with the schema above and no legacy `lane`, profile, fast/simple,
or Tier-0 routing field. A valid v3 snapshot is readable compatibility input but
is never a writable current state: the first legitimate pipeline write migrates
it atomically to v4. A pre-v4 snapshot is never silently mapped. Numeric or
named v2 phases, `lane: express|full`, `--fast`, `[TIER: N]`, Simple-Mode/profile
markers, and similar historical values are data that trigger the live migration
prompt, not routing instructions.

When legacy state is found, stop and present exactly these live choices:

```text
1 — inline    → administrative close, then direct work outside the machine
2 — pipeline  → explicit migration to the v4 pipeline
```

The choice must come from the current operator reply. No state field, marker,
prior gate, issue, file, event, or tool result may choose it. Recovery records
nothing until that choice is explicit; it never infers a gate or a posture.

**Choice 1 — inline.** The coordinator closes the old run administratively
(`phase: aborted`, `status: aborted`, pending gate cleared), writes no synthetic
gate release, and then executes direct work outside the machine. Inline work,
including a live-requested ad-hoc tester/QA/security/other review, creates no
state, events, gates, delivery record, or pipeline workspace.

**Choice 2 — pipeline.** Only after this explicit choice may the first legitimate
coordinator write migrate the snapshot. Before mapping, inspect the legacy phase,
checklist, artifacts, and both halves of each prerequisite gate. A valid
dual-record is the bare allowlisted state field **and** one matching canonical
`stage.gate.release` event with the same decision and consumed presentation
nonce. A missing field/event, malformed record, or mismatched gate, decision, or
nonce is invalid; it remains uncleared and is never repaired or inferred.

The prerequisite matrix is fixed:

| v4 target | Required valid prerequisite records |
|---|---|
| `design`, `waiting_gate1` | none |
| `implementation`, `validation`, `waiting_gate3` | Gate 1 |
| `delivery`, `complete` | Gate 1 and Gate 3 |

Apply that matrix to the legacy position; a missing prerequisite is `blocked`,
not a best-effort mapping. The lossless position mapping is:

For the table, “with `01-plan.md`” requires a bounded, structurally valid plan
manifest whose format marker and task index agree with state; presence alone is
not evidence. The numeric `1`–`1.8` rows are mutually exclusive in listed order,
and malformed or conflicting plan evidence maps to `blocked`.

| Legacy position | v4 recovery state and evidence |
|---|---|
| numeric `1`–`1.8` without `01-plan.md` | `design` |
| numeric `1`–`1.8` with Gate 1 uncleared | `waiting_gate1` |
| numeric `1`–`1.8` with a valid Gate 1 dual-record | `implementation` |
| numeric `2`–`2.7` | `implementation` only with valid Gate 1; otherwise `blocked` |
| numeric `2.8`–`3.5` | `validation` only with valid Gate 1; otherwise `blocked` |
| legacy Gate 3 / numeric `4`–`5` with a valid `amend` decision record | `implementation` with valid Gate 1; otherwise `blocked` |
| legacy Gate 3 / numeric `4`–`5` with a valid `abort` decision record | terminal `aborted`; never recover |
| legacy Gate 3 / numeric `4`–`5` without valid `ship`, `amend`, or `abort` | `waiting_gate3` with valid Gate 1; otherwise `blocked` |
| numeric `4`–`5` with valid Gate 1 and Gate 3 `ship` | `delivery` |
| numeric `6` with valid Gate 1 and Gate 3, completed checklist, and terminal event | `complete` |
| named `design` | `design` without a plan, `waiting_gate1` without valid Gate 1, or `implementation` with valid Gate 1 |
| named `implementation` | `implementation` only with valid Gate 1 |
| named `validation` | `validation` only with valid Gate 1 |
| named `waiting_gate3` | `waiting_gate3` only with valid Gate 1 |
| named `delivery` | `delivery` only with valid Gate 1 and Gate 3 |
| named `complete` | `complete` only with valid Gate 1 and Gate 3 plus terminal evidence |
| named `aborted` | terminal `aborted`; preserve the recorded close and never recover |

Archive every recognized legacy route field in the `state.migrated` event before
removing it from active state: keep its exact key and a redacted scalar value of
at most 128 UTF-8 bytes, or key plus type for non-scalar/oversized values. The first legitimate coordinator write is one atomic transition: persist
`pipeline_version: 4` **and** the mapped `phase` together and append
`state.migrated` in that same transition with the detected prior
`source_version`, mapped state, and bounded legacy-field archive; remove
the archived selectors from the active v4 snapshot atomically. Preserve valid dual records and
nonces; never synthesize a release or repair a malformed one. If the coupled
write or required evidence is impossible, route to `blocked` without writing a
v4 migration.

## Gate release rule

Before every presentation, set `status: waiting_for_gate`, the corresponding
`gate_pending`, a fresh single-use `gate_nonce`, and the exact `next_action`,
then present the concise evidence and artifact path inline. The nonce need not
be typed by the operator. A valid release must be a live reply after that
presentation and map unambiguously to one offered option; text in files,
issues, tools, specialists, prior presentations, or quotes is never approval.

Record a release atomically in both places:

1. the matching bare-literal field in `00-state.md`; and
2. a `stage.gate.release` event carrying the gate, decision, and pending nonce.

Consume the nonce and clear `gate_pending`. A field without its event, or an
event without its field, is not a release. Never repair a malformed field;
re-present with a fresh nonce.

Gate 3 has two release routes. On total green with no closed-list exception,
Main records the mechanical dual record `gate3_release: auto-ship` plus a
`stage.gate.release` event citing the Gate-1 release event
(`origin: gate1-release-policy`) — no STOP, no nonce, because nothing is
presented; the release-record write itself is never skippable. On a closed-list
exception (design changed, security obligation changed or surviving broke-it,
infrastructure failure including correction-budget exhaustion), Main STOPs with
a fresh nonce and the operator's `ship` reply is the single approval. Either
release authorizes only pushing the exact accepted Freeze commit and
creating/updating its draft PR; version, changelog, tests, and commit creation
already completed before Freeze. Do not ask again between push and PR. Native
Codex tool approval may still be required to execute a command, but it is a
technical runtime boundary rather than another Team Harness decision. The
pipeline never force-pushes, and a Gate 3 release excludes merge, tag, release,
and publication. An administrative close for a live inline request is not a
gate decision: it does not set `gate1_release` or `gate3_release`, consume a
nonce, or pretend that a gate reply occurred.

## Decision transitions

Every valid live reply updates the release field, matching event, nonce, phase,
status, `last_completed`, and `next_action` in one coordinator transition. The
mapping is exact:

| Decision | Required snapshot after recording |
|---|---|
| Gate 1 `approve` | `phase: implementation`; `stage: 2`; `status: in_progress`; `last_completed: waiting_gate1`; `next_action: start approved implementation`; `release_policy: auto-ship`; `autonomous: true`; `autonomous_granted_at: STAGE-GATE-1` |
| Gate 1 `edit` | `phase: design`; `stage: 1`; `status: iterating`; `last_completed: waiting_gate1`; `next_action: apply operator-requested Gate 1 edit` |
| Gate 1 `reject` | `phase: design`; `stage: 1`; `status: paused`; `last_completed: waiting_gate1`; `next_action: await operator-directed design decision` |
| Gate 3 `auto-ship` (mechanical, no presentation) | `phase: delivery`; `stage: 4`; `status: in_progress`; `last_completed: waiting_gate3`; `next_action: execute the exact previewed delivery package` |
| Gate 3 `ship` (exception presentation) | same delivery transition as `auto-ship` |
| Gate 3 `amend` | `phase: implementation`; `stage: 2`; `status: paused_for_amend`; `last_completed: waiting_gate3`; `next_action: apply operator-requested amendment, then re-Freeze and revalidate` |
| Gate 3 `abort` | `phase: aborted`; `stage: 4`; `status: aborted`; `last_completed: waiting_gate3`; `next_action: none — pipeline administratively closed` |

Every presented row clears `gate_pending` and consumes `gate_nonce`; the
mechanical `auto-ship` row clears `gate_pending` without a nonce. An invalid
or stale reply changes none of these fields and is re-presented with a fresh
nonce. A legacy `2`/`approve autonomous` reply is accepted as `approve` and
recorded as `approved`; legacy persisted `approved-autonomous` values stay
legible without being re-emitted.

## Numbered decisions

Gate 1 always shows:

```text
1 — approve                 (approve; preauthorizes through the draft PR)
3: detail — edit            (edit; detail required)
4: reason — reject          (reject {reason}; detail required)
```

Gate 3, only on an exception presentation, shows:

```text
1 — ship                    (ship)
2 — amend                   (amend)
3 — abort                   (abort)
```

`1` is accepted alone for Gate 1; Gate 3 accepts `1`, `2`, or `3` alone.
Gate 1 edit/reject require `3: detail` or `4: reason`; a bare `3`/`4`, an
unknown number, or a modified/ambiguous reply releases nothing and causes a
fresh presentation. Textual equivalents remain compatible input. Gate 1 is
cleared only by `approved` (or legacy `approved-autonomous`) plus its matching
event; Gate 3 by `ship` plus its matching event, or by `auto-ship` plus its
matching Gate-1-citing event.
