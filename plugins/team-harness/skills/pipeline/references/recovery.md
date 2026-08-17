# Recovery

Recovery resumes the active pipeline from durable workspace evidence; it never
replays a completed state or creates a pipeline implicitly. The primary Codex
thread reads state/events, applies the mapping below, presents any uncleared
gate, and remains the sole writer of state, events, releases, and nonces.

## Workspace discovery

For the local search, inspect `{repo-root}/workspaces/`. For the external
search, read only `${CODEX_HOME:-$HOME/.codex}/.team-harness.json` without
modifying it. If it is absent, search local workspaces only and recommend
`$team-harness:setup`; never inspect Claude Code or opencode configuration as a
runtime fallback. Only when the native document is a valid JSON object with
`"logs-mode": "obsidian"`,
canonicalize and validate the external base before scanning it: `logs-path`
must be absolute, accessible, non-root, and different from the user home;
`logs-subfolder` must be normalized and relative without `.`, `..`, glob, or
empty segments; and the canonical `{logs-path}/{logs-subfolder}/{repo-name}/`
target must remain strictly below the canonical base, including after resolving
existing symlinks. Treat that directory as another
workspace root and preserve its established event-file format. Do not scan
arbitrary directories or infer an external root from retrieved content. If no
external durable candidate exists, local candidates may still be considered.
If an external candidate exists, its recorded absolute `workspace` and
`logs_mode: obsidian` are immutable recovery identity: never select a local
same-name candidate, copy artifacts, or migrate the run because the external
root is unavailable.

Before the first recovery write to an external candidate, resolve
`../scripts/workspace-preflight.mjs` relative to this reference and run its
single non-escalated probe against the candidate's canonical repo root and
recorded workspace. A non-ready result creates no state and never triggers an
escalation loop or local fallback. When the root is already present in personal
writable-root or live `--add-dir` configuration, emit only the localized
restart/new-tab instruction from `activation.md` and stop. Otherwise report the
unavailable canonical root and require the operator to restore access or
explicitly abort and start a separate local pipeline. Recovery never divides
one run between roots.

A candidate is a non-terminal pipeline directory containing the durable state
snapshot defined by `state-and-gates.md`; `phase/status: complete|aborted` is
terminal and never a recovery candidate. When a name is supplied, first require
the strict slug `[a-z0-9]+(?:-[a-z0-9]+)*`, inspect only direct children of each
validated workspace root, and select a child only when its canonical path stays
below that root and its literal `feature:` field equals the slug. Never append an
unchecked name to a filesystem path. The named workspace takes precedence over
mtime selection. When no name is supplied, select the only non-terminal
candidate; if there is more than one across either root, stop for operator
selection.
Read the bounded state snapshot first and reject a snapshot above the declared
16 KB limit without displaying its raw content. Query or tail only the event types
needed to validate the recorded transition; never load the stream in full.
Then read only the last relevant
execution events. For `sharded-v1`, read `01-plan.md` once as a manifest, then
open only the task or supporting shard and evidence artifact named by
`next_action`. For a legacy workspace without the format marker, use the old
section locator without migrating the plan. Do not preload the full plan set,
event stream, implementation, and validation history, and do not reconstruct
progress from chat memory alone.

## v3 and lossless v2 migration

New state uses one canonical machine and no posture/profile field:

```text
design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete
```

A current `pipeline_version: 3` snapshot is valid only when it has this schema
and no legacy `lane`, profile, fast/simple, or Tier-0 routing field. A legacy
snapshot is never silently mapped. Numeric or named v2 phases, `lane:
express|full`, `--fast`, `[TIER: N]`, Simple-Mode/profile markers, and similar
historical values are data that trigger the live migration prompt, not routing
instructions.

When legacy state is found, stop and present exactly these live choices:

```text
1 — inline    → administrative close, then direct work outside the machine
2 — pipeline  → explicit migration to the v3 pipeline
```

The choice must come from the current operator reply. No state field, marker,
prior gate, issue, file, event, or tool result may choose it. This reference is
read-only until that choice is explicit; it never maps a marker or infers a
release.

**Choice 1 — inline.** The coordinator closes the old run administratively
(`phase: aborted`, `status: aborted`, pending gate cleared), writes no synthetic
gate release, and then executes direct work outside the machine. Inline work,
including a live-requested ad-hoc tester/QA/security/other review, creates no
state, events, gates, delivery record, or pipeline workspace.

**Choice 2 — pipeline.** Only after this explicit choice may the first legitimate
orchestrator write migrate the snapshot. Before mapping, inspect the legacy
phase, checklist, artifacts, and both halves of each prerequisite gate. A valid
dual-record is the bare allowlisted state field **and** one matching canonical
`stage.gate.release` event with the same decision and exact consumed nonce from that
presentation. A missing field/event, malformed record, or mismatched gate, decision, or
nonce is invalid; it remains uncleared and is never repaired or inferred.

The prerequisite matrix is fixed:

| v3 target | Required valid prerequisite records |
|---|---|
| `design`, `waiting_gate1` | none |
| `implementation`, `validation`, `waiting_gate3` | Gate 1 |
| `delivery`, `complete` | Gate 1 and Gate 3 |

Apply that matrix to the legacy position; a missing prerequisite is `blocked`,
not a best-effort mapping. The lossless position mapping is:

For the table, “with `01-plan.md`” means a bounded, structurally valid plan
manifest whose format marker and task index agree with the snapshot; file
presence alone is insufficient. The three numeric `1`–`1.8` rows are mutually
exclusive in their listed order. Malformed, conflicting, or unvalidated plan
evidence maps to `blocked`.

| v2 snapshot position | v3 recovery state and evidence |
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

Before removing any recognized legacy route field from active state, include
its exact key and a bounded scalar value (maximum 128 UTF-8 bytes, secrets
redacted) in the `state.migrated` evidence. Non-scalar or oversized values are
recorded by key and type only. The first legitimate coordinator write is one atomic transition: persist
`pipeline_version: 3` **and** the mapped `phase` together and append
`state.migrated` in that same transition with `source_version: 2` (or the
detected legacy version), the mapped state, and that bounded legacy-field archive;
remove every archived route field from the active v3 snapshot atomically. Preserve valid dual records and
nonces; never synthesize a release or repair a malformed one. If the coupled
write or required evidence is impossible, route to `blocked` without writing a
v3 migration.

## Protected Git topology recovery

For `phase: implementation` with a non-null planned worktree and null
`working_branch`, validate the Gate-1 dual record first, then treat
`worktree`, `worktree_branch`, and immutable full-SHA `worktree_base` as the
complete declared target. Run only read-only collision and identity checks
before resuming its creation:

- If both branch and registered worktree are absent and `next_action` names the
  exact matching `git worktree add -b <branch> <path> <base>` command, preserve
  `status: paused` and resume that one native technical-approval step. Do not
  replay an escalation automatically merely because its approval reviewer
  timed out.
- If branch, registered path, exact branch, and `HEAD == worktree_base` all
  match, verify the worktree is suitable, write `working_branch`, clear the
  technical pause, and continue implementation.
- If only one target exists, or any path, branch, or commit differs, stop for
  operator direction. Never delete, force-repair, silently reuse, clone/copy,
  or fall back to the dirty checkout.

Gate 1 remains valid throughout this technical pause. A native
approval-review timeout is neither a denial, a terminal result, nor a
functional pipeline failure; it never changes phase, creates a new Gate 1,
dispatches or replaces an implementer, or justifies an `interrupt_agent` call.
A current live operator approval permits one resubmission of the identical
escalation, while the sandbox still decides whether the command executes.

## Gate and resume safety

Before resuming `next_action`, require the structural dual-record:

- Gate 1 is cleared only by `gate1_release: approved|approved-autonomous` plus
  its matching `stage.gate.release` event.
- Gate 3 is cleared only by `gate3_release: ship` plus its matching event.

Each matching event must carry the expected stage, the allowlisted decision, and the exact
consumed nonce from that gate presentation. The released snapshot must also have
`gate_pending: null`; a pending gate, stale nonce, unrelated event, stage mismatch, or decision
mismatch stays uncleared and must be re-presented.

`phase/status: complete|aborted` is terminal regardless of `next_action`: report
the recorded outcome and stop. Never dispatch, present a gate, or reopen a
terminal run. For corrupt, incomplete, oversized, or unmappable state, report
only the path and failed structural checks; never echo raw snapshot or event
content.

For an OpenSpec-bound Design, resolve `scripts/openspec-recovery.mjs` relative to the loaded
pipeline skill and derive the next action from the bounded OpenSpec state fields. Resume
`preflight`, an already approved `provisioning`, upstream `planning`, strict `snapshot`, or
`overlay` at its recorded boundary without asking the operator to re-enter a command. Before
overlay or Gate 1, require the recorded snapshot bytes/hash and live pre-Gate-1 freshness; source
drift routes to explicit OpenSpec reconciliation. Before Gate 1 also require the recorded overlay
bytes/hash and its deterministic validation. A local and an Obsidian workspace use the same rules;
all paths are resolved below the recorded workspace while canonical source remains below
`openspec_repository_root`.

Before resuming `design` or presenting Gate 1, validate
`plan_contract_evidence`. `pending` resumes at deterministic plan validation;
for an OpenSpec-bound run, `pass` requires a readable `plan-contract.mjs`
result whose SHA-256 and exact
`kind: team_harness_openspec_overlay_validation`, `snapshot_sha256`,
`overlay_sha256`, and `change_name` match state, the current pinned snapshot,
the traceability overlay, and the bound change. Re-run that entry point with
`--workspace`, `--plan 01-plan.md`,
`--snapshot inputs/openspec-snapshot.json`, and
`--traceability plan/openspec-traceability.json`, plus the current exact
`--writable-root` values; never fall through to the
legacy validator or repair route. Snapshot drift resumes explicit OpenSpec
reconciliation, while a mapping or execution-control failure resumes the one
normal overlay design correction.

Before re-presenting Gate 1, also rerun `openspec-events.mjs` against the
complete configured events path and bound feature. An invalid or open
lifecycle trace remains fail-closed and is never repaired during recovery.

During implementation, use packaged `openspec-overlay.mjs verify-and-rebind`
instead of separate snapshot verification and overlay mutation. If interrupted
after the snapshot write, the same operation may recover only when the latest
progress event's `previous_sha256` equals the overlay binding, its task IDs
equal the requested authorized set, and ordinary validation has no finding
except `SNAPSHOT_STALE`; then rerun `plan-contract`. Any missing link, multiple
unrebound transitions, intent change, or additional finding remains a real
stale-plan block. Never edit the binding hash manually or make `plan-contract`
tolerate stale identity.

An implementation/tester return blocked only because an exact scoped Git write
hit protected `.git/worktrees/.../index.lock` is a technical
`git-metadata-permission` pause. Preserve the existing commit and unstaged test
diff, verify `git_metadata_write_mode`, and resume the identical `git add` or
eligible same-owner `git commit --amend` through native escalation with
`login:false`. Do not redispatch, reset, restage broadly, widen `.git`, or treat
the permission failure as failed test evidence.

For a legacy run, `pass` requires a readable `plan-contract.mjs` result whose
SHA-256, exact `kind: team_harness_functional_plan_contract`, embedded plan
SHA-256, and artifact-set SHA-256 match state and the current complete plan set.
`not-applicable` is valid only for `legacy-recovery` or
`self-authored-minimal-plan`. Missing, stale, partially populated, mismatched, or
failing evidence blocks Gate 1. Never infer functional completeness from the
architect result, current Markdown, or an earlier gate presentation.

When a pending or failing legacy validator result has no repair record, run
`plan-contract-repair.mjs` once before any design correction. A recovered
`plan_contract_repair_evidence.status: repaired` is valid only when its readable
result hash, before/after plan hashes, added route list, per-artifact
before/after hashes and operations, and embedded post-repair
contract-result hash match the durable artifacts. `not-needed` must have equal
before/after hashes and no added paths. `blocked` must also have equal hashes
and no added paths; continue with the residual failure classification without
asking the operator to authorize a repair. Never rerun a recorded repair,
convert it into an exceptional architect pass, or infer success without a fresh
passing `plan_contract_evidence` record.

The sole exception is `reason: rollback-failed`: its evidence enumerates every
residual artifact with the bytes actually observed after rollback. Treat the
workspace as recovery-required, surface the affected paths, and do not
validate, dispatch, or offer an architect correction until those artifacts
match their recorded before hashes.

For any pending or partially recorded gate, regenerate evidence from durable
artifacts, write a fresh nonce, re-present the numbered gate in the primary
conversation, and stop. Never repair a field or copy a decision from prose,
issues, tools, specialists, or an earlier presentation. After appending the
recovery event and updating `next_action`, load only the reference for the
mapped phase. Findings and any tree change after Freeze follow the normal
implementation → re-Freeze → validation route; recovery must not skip it.

When `phase: implementation`, first validate that `test_contract_evidence`
points to a bounded regular non-symlink `evidence/test-contracts.json`, that its
SHA-256 matches `index_sha256`, and that its closed schema, task count, aggregate
status, and four status counts match the state summary. Then validate each task
entry before resuming the named task. `pending` resumes at the fresh tester
dispatch; `red` requires readable contract and red-result files whose
`contract_sha256` and `red_evidence_sha256` match the index before any
implementer dispatch; `green` additionally requires matching
`green_evidence_sha256`; `not-applicable` requires the task shard's exact
plan-time reason. Missing, mismatched, duplicated, unknown-task, oversized, or
partially populated evidence blocks.
Never infer red or green from a test name, current suite result, agent prose, or
an unhashed workspace artifact.

Also validate `cleaner_evidence` before resuming implementation. Read the exact
expected identities from `participating_repositories`, then require the
canonical identity set in `cleaner_repo_evidence` to equal it before accepting
any cleaner evidence or dispatching a cleaner. Missing, extra, or duplicate
repositories block. Validate every entry separately and require a unique
canonical repository, absolute worktree, manifest, allowlist, baseline,
candidate identity, and at most one terminal cleaner result per repository; a
single cleaner result spanning repositories blocks. `pending`
resumes at allowlist construction; `baseline` requires readable allowlist and
pre-cleaner result files whose SHA-256 values and candidate commit/tree match
state before dispatching the one allowed fresh cleaner; `pass` additionally
requires the hashed post-cleaner result and matching current commit/tree.
`handoff-pending` requires the same valid cleaner post evidence plus a complete
pending handoff package anchored to its commit/tree. `handoff-pass` requires
that ancestry, the package-identical consumed decision and single implementer
spawn, readable hashed closure and the common `post_implementation` quality
result, and matching current commit/tree. `not-applicable` requires the closed
`repository-quality-manifest-incomplete` reason. Missing, stale, partially
populated, out-of-scope, or mismatched cleaner or handoff evidence blocks.
`cleaner-failed`, `cleaner-blocked`, `handoff-failed`, and `handoff-blocked`
require a readable hashed terminal result, exact reason, and matching
commit/tree. They remain non-pass and block Freeze. A cleaner terminal failure
requires a new explicitly activated repository-local pipeline; a handoff
terminal failure requires a new complete package, fresh nonce, presentation,
and live authorization before any further implementer dispatch.
Never infer a baseline, formatter/lint result, CRAP value, behavior-preserving
verdict, authorization, or closure from cleaner/implementer prose or the
current worktree.

## Cleaner-handoff recovery

When `cleaner_handoff_pending: true`, recover only the durable canonical
repository, absolute worktree, cleaner-post anchor, eligibility record, and
complete findings, each with repository, stable ID, cause, files, implicated
requirements, advisory correction, deterministic closure check, and expected
result. Re-evaluate the closed eligibility predicate: exactly one repository
and worktree, one to five IDs, at most eight unique paths, one coherent
behavior-preserving correction in approved scope, no DDL/migration,
public-schema, security-control, external-environment, or new decision, local
closure checks, and a complete quality manifest. Require uniqueness, bounded
safe paths, one closure per ID, and exact
agreement with `cleaner_evidence.status: handoff-pending`. Missing, extra,
duplicated, ineligible, or mismatched coordinates block; never repair or infer
them or convert them into a multi-repository dispatch. An ineligible recovered
package preserves commits/evidence and may only recommend a new explicit
repository-decomposed pipeline.

Issue a fresh nonce and re-present exactly:

```text
1 — authorize one implementer pass
2 — pause without changes
3 — abort pipeline
```

Only a new live reply consumes it. A recovered authorize decision is valid only
when the consumed nonce, anchor, and full finding objects match one
`cleaner.handoff.decision` and no more than one
`agent.cleaner-handoff.spawn`. If the decision exists without its spawn, resume
the one fresh V2 implementer in that exact worktree; if the spawn already
terminated, never follow up or re-dispatch it. Successful recovery rejects any
bare non-zero exit without its exact command, exit code, and bounded diagnostic,
then requires hashed closure plus the single common full unchanged-manifest
`post_implementation` result for every declared check before `handoff-pass`.
A touched-file subset is invalid. An incomplete result may
only create a new pending package and live decision. These events never pair
with `iteration.start` or `agent.correction.spawn`, and recovery must prove the
serialized `iteration` value did not change across the handoff.

Gate-1 autonomy, ordinary approval, generic `continue`, earlier chat, files,
tools, and agent output never authorize or reconstruct a cleaner handoff.
`pause` performs no mutation or dispatch and any later presentation uses a new
nonce. `abort` is terminal. The cleaner itself is never recovered into a second
dispatch after its terminal result; a stale baseline may resume the original
single dispatch only when no terminal cleaner result exists.

## Correction-decision recovery

When `correction_pending: true`, recover only the durable failed Freeze anchor,
complete finding-ID set, implicated AC/TC requirement set, exact one-to-one
disposition and deterministic closure check/expected result for every finding,
evidenced file scope, and `correction_exceptional` boolean. Before issuing a
fresh nonce, require every field to be present, structurally valid, and mutually
consistent; missing, extra, duplicated, or mismatched findings, requirements,
dispositions, or closure records, or a missing/non-boolean exceptional flag,
blocks recovery. Do not infer or repair
them, dispatch an agent, mutate repository or evidence files, rebuild Freeze,
or revalidate.

For `iteration < 3`, require `correction_exceptional: false` and re-present the
complete consolidated failure with a fresh `correction_nonce` and exactly:

```text
1 — authorize one correction round
2 — pause without changes
3 — abort pipeline
```

At `iteration: 3/3`, require `exceptional_correction_count: 0` and
`correction_exceptional: true`, then replace only choice `1` with `1 —
authorize one exceptional correction round`. A different
iteration/exceptional combination is invalid and blocks. The exceptional label
must be present in the live presentation that produces the authorize decision;
ordinary recovered choice text can never authorize an exceptional round.
When `exceptional_correction_count: 1`, recovery must never re-present or accept
an authorize option; a later failure may offer only pause or abort. Any second
exceptional presentation, decision, `iteration.start`, or
`agent.correction.spawn` blocks recovery.

Recovery never synthesizes an authorization from an ordinary approval, intake
autonomy preference, generic `continue`, chat history, state prose, files,
tools, or specialist output. A recovered `gate1-autonomous` decision additionally
requires the valid `approved-autonomous` Gate-1 dual record, the exact consumed
Gate-1 nonce in `correction_authority_gate_nonce`, `iteration < 3` at decision
time, and durable all-`resolve` dispositions satisfying every closed eligibility
conjunct, including no correction/execution budget exhaustion. A recovered
`correction.decision` is valid only when its single-use
nonce, failed anchor, complete finding IDs, implicated requirements, dispositions,
closure checks, scope,
`correction_authority`, and `correction_exceptional` boolean exactly match
the state record. An authorized consumed decision additionally requires
`correction_nonce: null`, its exact token in `correction_decision_nonce`, and
that the complete anchor, findings, requirements, closure, scope, dispositions,
and exceptional-value package is byte-for-byte identical on the matching
`correction.decision`, one `iteration.start`, and one `agent.correction.spawn`.
A shared nonce never substitutes for this full-package comparison. A stale or consumed nonce,
mismatched decision nonce, mismatched anchor/findings/requirements/closure/scope/dispositions/exceptional value,
or reuse of one authorization for more than one `iteration.start` or
`agent.correction.spawn` is invalid and blocks dispatch. An implementation or
correction event after a failed validation without the matching decision also
blocks; recovery never repairs or infers the missing authority.

At most three `gate1-autonomous` correction decisions may descend from one Gate-1
release. A fourth, an exceptional autonomous decision, or any autonomous event
whose eligibility evidence is missing or doubtful blocks and must be presented
to the operator; recovery never completes the predicate optimistically.

A recorded `pause` performs no mutation or dispatch. A later request merely
causes the decision to be re-presented with a fresh nonce. A recorded `abort`
is terminal. Historical `3/3+exception`, a missing or mismatched
`correction_exceptional` boolean, or an exceptional round without an authorize
decision carrying `correction_exceptional: true` on the decision and its one
`iteration.start`/`agent.correction.spawn` pair is invalid and blocks; recovery
never synthesizes the exception. A valid exceptional authorization increments the separate
`exceptional_correction_count` from `0` to `1` while `iteration` remains `3/3`.
