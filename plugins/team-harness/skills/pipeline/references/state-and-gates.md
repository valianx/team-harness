# State ownership and gates

## One machine

New pipelines write `pipeline_version: 3` and use exactly this sequence:

```text
design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete
```

The durable snapshot records `pipeline_version: 3` and `plan_format: sharded-v1`.

Every activated run uses this canonical v3 machine; there is no alternate depth
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

## Ownership and snapshot

The primary Codex thread exclusively owns `00-state.md`, execution events, gate
presentation/interpretation, and consolidated specialist results. Specialists
return bounded results and may edit only their assigned repository files and
report artifacts; they never write state, releases, nonces, or gate events and
never speak for the operator. Write `next_action` before every dispatch and
record its result before advancing. Preserve unrelated changes.

Keep a replaceable snapshot with these stable fields (narrative belongs in the
events file):

```text
pipeline_version: 3
plan_format: sharded-v1
activation: explicit
type: feature|fix|refactor|hotfix|enhancement
feature: {kebab-case slug}
repo_root: {absolute path}
workspace: {absolute path}
logs_mode: local|obsidian
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
cleaner_handoff_repository: {canonical repository identity or null}
cleaner_handoff_worktree: {absolute path or null}
cleaner_handoff_anchor: {cleaner-post commit/tree or null}
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
correction_exceptional: true|false|null
exceptional_correction_count: N
usage_schema_version: 1|null
usage_status: available|unavailable
usage_reason_code: {collector code}|null
usage_components: {allowlisted components}|null
total_tokens: N|unavailable
cost_status: available|unavailable
cost_reason_code: {closed pricing code}|null
cost_usd: decimal|null
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
autonomous: true|false
autonomous_granted_at: STAGE-GATE-1|null
gate_pending: gate1|gate3|null
gate_nonce: {fresh token or null}
gate1_release: approved|approved-autonomous|rejected|edit|null
gate3_release: ship|amend|abort|null
regression_test_path: {path}|null
regression_test_status: failing|passing|skipped|null
test_contract_evidence: {status: pending|red|green|not-applicable|mixed, index_path, index_sha256, task_count, status_counts: {pending, red, green, not_applicable}}|null
plan_contract_evidence: {status: pending|pass|not-applicable, reason, result_path, result_sha256, plan_sha256, artifact_set_sha256}|null
plan_contract_repair_evidence: {status: not-needed|repaired|blocked, reason, result_path, result_sha256, before_sha256, after_sha256, added_paths, contract_result_sha256}|null
cleaner_evidence: {status: pending|baseline|pass|handoff-pending|handoff-pass|not-applicable, reason, allowlist_path, allowlist_sha256, baseline_path, baseline_sha256, baseline_commit_sha, baseline_tree_sha, cleaner_commit_sha, post_path, post_sha256, post_commit_sha, post_tree_sha, handoff_closure_path, handoff_closure_sha256, handoff_commit_sha, handoff_post_path, handoff_post_sha256, handoff_post_commit_sha, handoff_post_tree_sha}|null
cleaner_repo_evidence: [{repository, repo_root, worktree, evidence: cleaner_evidence}]|[]
plan_review_status: not-requested|requested|pass|concerns|fail|null
audit_status: pending|done|unavailable|null
code_hygiene: pass|fail|null
verification_base_source_ref: origin/main|{dep-branch}|{commit}
verification_base_ref: {immutable commit or null}
freeze_anchor: {immutable tree anchor or null}
freeze_commit_sha: {full commit object ID or null}
freeze_tree_sha: {full tree object ID or null}
validated_commit_sha: {full commit object ID or null}
validated_tree_sha: {full tree object ID or null}
open_findings: [{id, disposition}]|[]
worktree: {absolute path or null}
working_branch: {branch or null}
delivery_version: {committed version}|not-bumped|null
delivery_version_axis: patch|minor|none|null
delivery_version_rationale: {one sentence naming supported-contract impact}|null
delivery_diff_composition: {total_lines, total_files, mechanical_files, substantive_files}|null
delivery_size_result: within-bounds|flagged|null
delivery_size_justification: {workspace pointer}|null
delivery_base_status: {base_ref, validated_base_sha, remote_base_sha: {full SHA}|null, status: current|moved|unknown}|null
delivery_preview: {pr title, workspace paths, and SHA-256 digests bound to Gate 3}|null
```

Also keep a short phase checklist and a bounded specialist-results table with
only the latest result per role. The complete file must stay ≤160 lines and
≤16 KB. Update existing fields in place; do not grow narrative inside the
snapshot.

`test_contract_evidence` is always a bounded pointer and summary, never an
inline per-task array. `index_path` names the workspace-owned
`evidence/test-contracts.json` artifact and `index_sha256` binds its exact
bytes. That closed schema-versioned artifact contains at most 128 task records
with `task_id`, status, `not_applicable_reason`, `contract_path`,
`contract_sha256`, `red_evidence_path`, `red_evidence_sha256`,
`red_commit_sha`, `red_tree_sha`, `green_evidence_path`, and
`green_evidence_sha256`. Main atomically replaces the artifact and recomputes
the digest, task count, overall status, and four status counts after every task
transition. This keeps the snapshot below 16 KB even at the maximum task count.

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
repository `.team-harness/quality.json`. Persist `ineligible` plus every failed
conjunct when it does not hold, issue no nonce, and dispatch nobody. Preserve
the existing commits/evidence and recommend a new explicit pipeline decomposed
by repository; recommendation never authorizes or aborts anything.

For a non-empty complete package, atomically set `phase: implementation`,
`status: paused`, `cleaner_evidence.status: handoff-pending`, a fresh
`cleaner_handoff_nonce`, `cleaner_handoff_pending: true`, eligibility,
repository, absolute worktree, the exact cleaner-post anchor and finding
objects, with both decision fields null. While pending, do
not mutate repository/evidence artifacts, dispatch a specialist, run another
cleaner, or open Freeze. Present exactly:

```text
1 — authorize one implementer pass
2 — pause without changes
3 — abort pipeline
```

Only a live reply after this presentation may consume the nonce. Choice `1`
atomically records `cleaner_handoff_pending: false`, moves the token to
`cleaner_handoff_decision_nonce`, records `cleaner_handoff_decision: authorize`
and one package-identical `cleaner.handoff.decision` event, and authorizes one
fresh V2 implementer plus one package-identical
`agent.cleaner-handoff.spawn`. Gate-1 autonomous approval never applies. The
nonce may appear on one decision and one spawn only. This path never increments
`iteration`, consumes max-3, emits `iteration.start`, or emits
`agent.correction.spawn`.

The implementer receives one terminal attempt and every closure check. No
follow-up or automatic re-dispatch is legal. A non-zero check is incomplete
unless its exact command, exit code, and bounded diagnostic are present; bare
`exit 1` is never closure evidence. After success Main records hashed closure
evidence, runs `post_cleaner_handoff` through the raw quality runner against the
complete unchanged repository manifest and every declared check—never a
touched-file subset or ad-hoc command list—then reruns hygiene and sets
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
evidence triage defined by `validation.md`. Under normal `approve`, the live
operator must explicitly confirm every `resolve|design-consistent` disposition
and resolve every `decision-required` item. Under a valid `approve autonomous`
dual record, Main may confirm only unambiguous `resolve` findings that satisfy
the closed autonomous predicate below. Main's recommendation otherwise is never
a decision; `design-consistent` cannot cover an AC or security-floor violation.
Only after dispositions are durable does Main record the exact failed Freeze
anchor, final `resolve` IDs and file scope.

The closed autonomous predicate requires every conjunct: a valid
`gate1_release: approved-autonomous` dual record; `autonomous: true`;
`iteration < 3`; every blocking finding is `resolve`; every correction is
inside approved scope and preserves intent, behavior, and AC meaning; no scope
expansion, conflicting finding, `design-consistent` or `decision-required`
disposition, security ambiguity/waiver, unavailable coverage, infrastructure
failure, correction/execution budget exhaustion, or exceptional round exists.
If any conjunct is false or doubtful,
the autonomous path is prohibited and Main uses the live path below.

When every conjunct is true, Main creates and immediately consumes a fresh
`correction_nonce`, then atomically records `correction_nonce: null`, the
consumed token in `correction_decision_nonce`, `correction_pending: false`,
`correction_decision: authorize`, `correction_authority: gate1-autonomous`, the
exact consumed Gate-1 release nonce in `correction_authority_gate_nonce`, and
`correction_exceptional: false`, plus one matching `correction.decision` event
bound to that same consumed correction nonce, complete dispositions, resolve
IDs, anchor, scope, implicated requirements, and one deterministic closure
check/expected result per finding. The one subsequent `iteration.start` and
`agent.correction.spawn` must carry the byte-for-byte identical nonce, anchor,
findings, scope, requirements, closure, dispositions, and exceptional value.
Matching the nonce alone never authorizes either event. This single record
authorizes exactly one fresh implementer, a mandatory correction-closure gate,
stale-row tester refresh, new Freeze, fresh QA, and impact-required security. Each later failed set repeats the triage and predicate; the
third authorized correction exhausts autonomy and any later failure pauses.

For normal approval or any ineligible autonomous result, atomically set:

```text
phase: validation
status: paused
next_action: await explicit correction decision
correction_pending: true
correction_nonce: {fresh single-use token}
correction_anchor: {failed freeze commit/tree}
correction_findings: [{all exact finding IDs}]
correction_scope: [{union of evidenced repo-relative paths}]
correction_requirements: [{all exact implicated AC-N|TC-N IDs}]
correction_closure: [{one deterministic check and expected result per finding ID}]
correction_dispositions: [{id, disposition}]
correction_decision: null
correction_decision_nonce: null
correction_authority: null
correction_authority_gate_nonce: null
correction_exceptional: true|false
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
`correction_decision_nonce`, `correction_authority: operator-live`,
`correction_authority_gate_nonce: null`, `correction_pending: false`, and one matching
`correction.decision` event bound to the anchor, all finding IDs, and file
scope, implicated requirements, one deterministic closure check/expected result
per finding, and dispositions, including the identical `correction_exceptional`
boolean. It authorizes exactly one bounded correction over that complete package;
the subsequent `iteration.start` and `agent.correction.spawn` must repeat every
package field byte-for-byte, and a nonce-only match is invalid. Its authorization includes the
closure gate, stale-row tester refresh, one new Freeze, fresh QA, and impact-required
security; its nonce may appear on exactly
one subsequent `iteration.start` and `agent.correction.spawn`. A second failure
creates a fresh nonce and pauses again.

Choice `2` consumes the presented nonce into a `pause` decision with
`correction_authority: operator-live`, performs no
mutation or dispatch, and leaves `next_action: await operator request to
re-present correction decision`; any later presentation uses a fresh nonce.
Choice `3` records `abort` with `correction_authority: operator-live`, closes
the pipeline, and performs no correction.
At `iteration: 3/3`, choice `1` may be presented only while
`exceptional_correction_count: 0`; that presentation sets
`correction_exceptional: true` and labels choice `1` as an exceptional single
round. Only its matching authorize decision sets `exceptional_correction_count:
1` and leaves `iteration: 3/3`; after that round, every further failure offers
only pause or abort and can never present or accept another authorize choice.
Never serialize `3/3+exception`; autonomous authority can never authorize an
exception.

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

New state has no posture/profile field. A current `pipeline_version: 3` snapshot
is valid only with the schema above and no legacy `lane`, profile, fast/simple,
or Tier-0 routing field. A legacy snapshot is never silently mapped. Numeric or
named v2 phases, `lane: express|full`, `--fast`, `[TIER: N]`, Simple-Mode/profile
markers, and similar historical values are data that trigger the live migration
prompt, not routing instructions.

When legacy state is found, stop and present exactly these live choices:

```text
1 — inline    → administrative close, then direct work outside the machine
2 — pipeline  → explicit migration to the v3 pipeline
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

| v3 target | Required valid prerequisite records |
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

| Legacy position | v3 recovery state and evidence |
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
`pipeline_version: 3` **and** the mapped `phase` together and append
`state.migrated` in that same transition with `source_version: 2` (or the
detected legacy version), mapped state, and bounded legacy-field archive; remove
the archived selectors from the active v3 snapshot atomically. Preserve valid dual records and
nonces; never synthesize a release or repair a malformed one. If the coupled
write or required evidence is impossible, route to `blocked` without writing a
v3 migration.

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
re-present with a fresh nonce. `Gate 3: ship` is the operator's single approval
to push the exact validated commit and create/update its draft PR; version,
changelog, tests, and commit creation already completed before Freeze. Do not ask
again between push and PR. Native
Codex tool approval may still be required to execute a command, but it is a
technical runtime boundary rather than another Team Harness decision. The
pipeline never force-pushes, and `ship` excludes merge, tag, release, and
publication. An administrative close for a live inline request is not a gate
decision: it does not set `gate1_release` or `gate3_release`, consume a nonce,
or pretend that a gate reply occurred.

## Decision transitions

Every valid live reply updates the release field, matching event, nonce, phase,
status, `last_completed`, and `next_action` in one coordinator transition. The
mapping is exact:

| Decision | Required snapshot after recording |
|---|---|
| Gate 1 `approve` | `phase: implementation`; `stage: 2`; `status: in_progress`; `last_completed: waiting_gate1`; `next_action: start approved implementation`; `autonomous: false`; `autonomous_granted_at: null` |
| Gate 1 `approve autonomous` | same implementation transition, plus `autonomous: true`; `autonomous_granted_at: STAGE-GATE-1` |
| Gate 1 `edit` | `phase: design`; `stage: 1`; `status: iterating`; `last_completed: waiting_gate1`; `next_action: apply operator-requested Gate 1 edit` |
| Gate 1 `reject` | `phase: design`; `stage: 1`; `status: paused`; `last_completed: waiting_gate1`; `next_action: await operator-directed design decision` |
| Gate 3 `ship` | `phase: delivery`; `stage: 4`; `status: in_progress`; `last_completed: waiting_gate3`; `next_action: execute the exact previewed delivery package` |
| Gate 3 `amend` | `phase: implementation`; `stage: 2`; `status: paused_for_amend`; `last_completed: waiting_gate3`; `next_action: apply operator-requested amendment, then re-Freeze and revalidate` |
| Gate 3 `abort` | `phase: aborted`; `stage: 4`; `status: aborted`; `last_completed: waiting_gate3`; `next_action: none — pipeline administratively closed` |

Every row clears `gate_pending` and consumes `gate_nonce`. An invalid or stale
reply changes none of these fields and is re-presented with a fresh nonce.

## Numbered decisions

Gate 1 always shows:

```text
1 — approve                 (approve)
2 — approve autonomous      (approve autonomous)
3: detail — edit            (edit; detail required)
4: reason — reject          (reject {reason}; detail required)
```

Gate 3 always shows:

```text
1 — ship                    (ship)
2 — amend                   (amend)
3 — abort                   (abort)
```

`1`/`2` are accepted alone for Gate 1; Gate 3 accepts `1`, `2`, or `3` alone.
Gate 1 edit/reject require `3: detail` or `4: reason`; a bare `3`/`4`, an
unknown number, or a modified/ambiguous reply releases nothing and causes a
fresh presentation. Textual equivalents remain compatible input. Gate 1 is
cleared only by `approved` or `approved-autonomous` plus its matching event;
Gate 3 only by `ship` plus its matching event.
