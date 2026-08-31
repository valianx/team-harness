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

The canonical replaceable snapshot schema lives only in
`agents/_shared/orchestrator-state.md` § "Current State — the schema you write".
This phase contract references that schema and never copies its fields.

`open_findings` is written only by the coordinator after disposition. Recovery
surfaces any entry without a matching disposition record before preparing a
gate; it is not a transport for unreviewed specialist output.

`iteration` is retained as an unbounded serialized observation of
implementation/validation correction activity. Increment it when such work
starts, but never use its value to authorize, deny, pause, or close work.
Mechanical repairs and decision transcription need no synthetic iteration.
Historical bounded displays remain readable and non-authoritative.

## Cleaner-to-implementer recovery

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

Before dispatch, require the closed handoff predicate: exactly one
repository/worktree, one dependency-coherent behavior-preserving objective,
bounded explicit findings and files, already-approved scope,
no DDL/migration, public-schema, security-control, external-environment, or new
decision dependency, locally executable closure checks, and a complete
workspace-local `.team-harness/quality.json`. Persist `ineligible` plus every failed
conjunct when it does not hold and dispatch nobody. Preserve
the existing commits/evidence and pause the same pipeline for an in-place
recovery package decomposed by repository or the applicable live scope
decision; that requirement never authorizes or aborts anything.

For a complete package inside released Gate-1 intent and scope, atomically set
`phase: implementation`, record the immutable package and causal recovery
identity, and dispatch an implementer under the existing authority. Do not
create a second operator-decision nonce. The implementer receives every
closure check. A non-zero check is incomplete
unless its exact command, exit code, and bounded diagnostic are present; bare
`exit 1` is never closure evidence. After success Main records hashed closure
evidence and joins the same raw `post_implementation` quality checkpoint used
by every repository path. It runs against the complete unchanged repository
manifest and every declared check—never a touched-file subset or ad-hoc command
list—then runs hygiene once and sets
`cleaner_evidence.status: handoff-pass` only when all
evidence matches the current commit/tree. The cleaner never runs again. An
incomplete result follows `agents/_shared/coordinator-recovery.md`: preserve
progress, classify the cause, and redispatch only after a verifiable causal
change. Counts remain observations. Scope expansion or a semantic change still
requires its applicable explicit decision.

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
`correction-packet-preflight.mjs certify`, and persist its single
`correction_dispatch_reference`. Main supplies no derived hashes, pointers,
seals, roots, or helper paths: the resolver computes and validates them with
closed required-test coverage for the selected tasks before content-addressing the capsule. It also
derives the unique owner task for every correction target path and unions those
owners with the requested set; missing or ambiguous ownership blocks here.
`repair-index` may inventory missing global required rows as `pending`; only a
selected pending row blocks this dispatch. No correction nonce or authority exists until the resolver
returns `dispatch-reference-ready-before-authority`. Immediately before spawn,
re-certify the same identity. Apply `agents/_shared/dispatch-contract.md` § "Pipeline
specialist reference" for the sole pre-spawn and mechanical recovery contract;
do not reproduce it in state transitions.

The in-scope recovery predicate requires every conjunct: a valid Gate-1
approval dual record (`approved`; legacy `approved-autonomous` stays legible);
every blocking finding is `resolve`; every correction is
inside approved scope and preserves intent, behavior, and AC meaning; no scope
expansion, conflicting finding, `design-consistent` or `decision-required`
disposition, security ambiguity/waiver, unavailable coverage, infrastructure
failure without a verifiable recovery exists.
If any conjunct is false or doubtful,
the in-scope path is prohibited and Main uses the live path below.

When every conjunct is true, Main records the correction package, causal
recovery evidence, governing Gate-1 decision reference, and canonical dispatch
reference, then continues. `correction.decision`, `iteration.start`, and
`agent.correction.spawn` remain append-only observations and grant no additional
authority. The correction still requires closure, stale-row tester refresh, new
Freeze, fresh QA, and impact-required security. Each later failed set repeats
triage and causal recovery without an ordinal ceiling.

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
correction_dispatch_reference: team_harness_dispatch_reference
autonomous_correction_count: {non-negative observation}
operator_correction_count: {non-negative observation}
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
`correction_package`, authority, and canonical `correction_dispatch_reference`.
Clear `correction_package` from state
after appending the decision. It increments `operator_correction_count` as an
observation and authorizes the approved semantic change over that complete package;
the subsequent `iteration.start` and `agent.correction.spawn` carry only the
same `decision_ref` plus their normal observation fields. Its authorization includes the
closure gate, stale-row tester refresh, one new Freeze, fresh QA, and impact-required
security. A later failure returns to causal recovery and needs another live
decision only if it exposes another semantic or authority change.

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
The same three choices are always available for a live operator. Historical
attempt, correction, and iteration counts never remove choice `1`, change its
label, require a waiver, or produce a budget error. Every approved semantic
change still requires its complete package, closure, new Freeze, and complete
revalidation.

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
or an external prerequisite with no verifiable recovery), Main STOPs with
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
