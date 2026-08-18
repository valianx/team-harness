# Gate contract

> The STAGE-GATE mechanism below — the dual-record release, the recover backstop, the
> STOP-block templates and the preparer/presenter flow — is binding. The orchestrator contract
> orders pipeline outward actions; the active runtime separately enforces its current permission
> and approval model.
<!-- Single source of truth for the STAGE-GATE mechanism: the dual-record release,
     the record-based recover backstop, the STOP-block templates, and the single
     preparer + presenter + recorder flow.
     Consumed by: agents/ref-pipeline.md — IMPLEMENTS/RECORDS this contract for its
     two STAGE-GATEs; it is the sole agent that prepares, presents and records
     a gate.
     Edit here; the coordinator references this file by section. -->

## Ownership — single source, never copied

This file is the ONE canonical description of the gate mechanism. `agents/ref-pipeline.md`
**implements and references** it — its two STAGE-GATEs follow the
rules below verbatim. No other agent file may copy, restate, or fork this contract.
Duplicating it re-imports the drift risk this design closes: a second copy would diverge
from this one the first time either is edited, and a diverged copy is a security-relevant
defect (the audited-relay integrity property this contract once depended on — now retired,
see § "Integrity model — audited relay + runtime approval floor" below — depended on
exactly one prompt in the system recording the dual-record schema; the single-coordinator
model keeps that same one-prompt property for the schema itself, even though the relay it
used to audit no longer exists).

The active coordinator, through `agents/ref-pipeline.md`, is the only agent that ever reads this file. It presents every
gate directly to the operator and records both halves of the dual-record itself — there is
no second agent in the loop to reference the STOP-block templates or allowlists for its own,
separate presentation duty.

## Outward-action release floor

No pipeline outward action — including `git push`, `gh pr create`, or `gh pr merge` —
proceeds without `gate3_release ∈ {ship, auto-ship}` registered in the governing pipeline's
`00-state.md` (see § "The dual-record release" below). The orchestrator enforces this
ordering by refusing to invoke the action before the release exists.

Both release values carry the same human origin and the same scope. `ship` is the operator's
live reply to a presented Gate-3 STOP block (rendered only on an exception pause — see
§ "STAGE-GATE-3 — mechanical release"). `auto-ship` is the mechanical execution of the release
policy the operator approved at STAGE-GATE-1: it is recorded only when validation is totally
green and it cites the Gate-1 release that authorized it. Either value authorizes the
coordinator's standard sequence through feature-branch push of the exact accepted Freeze commit
and draft PR creation/update; neither authorizes mutating an existing ready-for-review PR. No
second conversational confirmation is allowed between those steps. Native runtime tool approval
may still be required to execute a command, but that is a technical permission boundary — not
another Team Harness decision and never a substitute for the recorded release. Merge, tag,
release, publication, force-push, and broader scope remain excluded.

**Force-push clause (Invariant E, operator-mandated).** The pipeline never force-pushes —
not with `-f`, `--force`, `--force-with-lease`, or a `+`-prefixed refspec. A `ship`
decision cannot authorize force-push or shared-history rewriting.

**Permitted push shape (Invariant G).** The pipeline constructs only
`git push [-u|--set-upstream|-v|--verbose|--progress] origin <plain-branch>`.
`<plain-branch>` excludes ref-namespace-qualified and tag-like destinations. Shell
wrappers, dynamically reconstructed commands, alternate executables, git configuration
overrides, and unresolved shell syntax are not permitted substitutes.

This contract never bypasses server-side branch protections. Standard draft-PR creation/update is
covered by `ship`; merge, tag, release, publication, and other non-previewed GitHub writes require
a separate explicit live request. Local git
operations remain subject to the repository's own rules.

## The dual-record release

Each STAGE-GATE releases only when the orchestrator writes **both** of the following, in
the same phase-transition:

| Record | Where | What it carries |
|---|---|---|
| Field | `00-state.md § Current State` | `gate_pending`, `gate1_release` or `gate3_release` — see the per-gate allowlist table below — plus `gate_nonce`, the token currently pending for that gate |
| Event | `{events_file}` | a `stage.gate.release` JSON line carrying `stage`, `decision`, `gate_nonce` (the consumed value) |

**The `gate_nonce` field.** Each dual-record carries a third element: a `gate_nonce` — a
fresh, **single-use** token the orchestrator generates every time it prepares a gate,
**including every re-presentation** (an ambiguous-reply re-ask, a recover-triggered
re-presentation). The nonce is written to `00-state.md` alongside the pending gate and
included in the STOP block the orchestrator presents to the operator inline. Recording a
release **consumes** the nonce — it becomes invalid the instant the release is written. A
reply that answers a superseded presentation of the same gate therefore carries a stale
nonce and is ambiguous, never a valid release: the orchestrator re-presents instead of
recording (§ "Ambiguous-gate-reply rule").

**The nonce is a freshness/ordering token, not a secret or an authentication factor.** It
does not prove operator origin — the orchestrator generates it itself and the operator
sees it the moment the gate is presented, in the same turn. Its only job is to make each
presentation of a gate distinguishable from every other presentation, so a stale reply
(one answering a superseded presentation) can never be recorded as if it answered the
current one. It closes the exact replay vector where a reply arrives after the gate has
already been re-presented — it is not, and is never meant to be, evidence of who typed
the reply.

**Atomic write requirement.** Writing the field and appending the event are ONE inseparable
step, not two independently-skippable writes — the same atomic-coupling discipline that
governs every phase boundary (checklist mark + `phase.end` event as one step). A field
update with no matching event, or an event with no matching field, is a contract violation
the moment it happens.

While a gate is presented, `gate_pending` is the bare literal `gate1` or `gate3` and
`gate_nonce` is the fresh token. On a valid release, the coordinator records the matching
release field and event in the same transition, consumes the nonce and clears
`gate_pending`. A re-presentation replaces both pending values; it never reuses a nonce.

**Per-gate allowlists** (the values recover treats as "cleared" — see § "Record-based
recover backstop"):

| Gate | Field | Cleared when | Not cleared (any of) |
|---|---|---|---|
| STAGE-GATE-1 | `gate1_release` | `∈ {approved, approved-autonomous}` | `rejected`, `edit`, `null`/missing |
| STAGE-GATE-3 | `gate3_release` | `∈ {ship, auto-ship}` | `amend`, `abort`, `null`/missing |

`approved-autonomous` is legacy-legible only: recover treats a persisted historical value as
cleared, but no new record ever writes it — the single `approved` release always carries the
autonomous authority. An `auto-ship` release additionally requires the citation of the Gate-1
release event that authorized it (see § "STAGE-GATE-3 — mechanical release"); recovery never
executes an auto-release itself — it resumes delivery mechanics from the recorded state.

Clearing a gate against this table is necessary but not sufficient on its own: the reply
must also be attributable to the presentation whose `gate_nonce` is currently pending
(§ "The dual-record release" above). **Attribution is the coordinator's job, not the
operator's typing.** The operator answers with the words the STOP block offers — `approve`,
`ship`, `reject {reason}` — and the coordinator records the pending nonce alongside the
decision. A reply is not recorded, and is treated as ambiguous (§ "Ambiguous-gate-reply
rule"), when it cannot be attributed to that presentation: it arrived before the gate
existed, or a later re-presentation has already superseded the nonce it was answering.

**Never require the reply to contain the nonce literally.** Every STOP-block template in
this contract offers bare decision words, so a requirement to transcribe a token would make
an operator who follows the instructions exactly produce an invalid reply — and a
re-presentation would offer the same instructions again, which is a loop with no exit. The
nonce is a freshness and ordering token, not a secret and not an authentication factor
(stated above): ordering is established by *when the reply arrived relative to the pending
presentation*, which the coordinator observes directly and the operator cannot forge by
omitting a string.

**Bare-literal field values.** Each of the gate-state fields —
`gate_pending`, `gate1_release`, `gate3_release`, `release_policy`, `gate_nonce`,
`working_branch`, and `worktree` — is written to `00-state.md § Current State`
as a bare literal: the value carries no second token delimited by a space on
the same line, no trailing nonce, attribution, justification, or condition
appended after it. Every reader of these fields — the record-based recover
backstop above, `agents/_shared/orchestrator-state.md § Current State`, and the executable
`working_branch`/`worktree` comparisons this contract's consumers install in
`implementer` and `tester` — matches the first equal line by strict string
equality, so a value carrying any annotation stops matching the instant one
is appended.

For the `*_release` fields, the per-gate allowlist table above is the closed, citable set of
literal values the field may hold — no value outside that set, and no annotated variant of an
allowlisted value, is ever written. `release_policy` admits the single literal `auto-ship`,
written only in the same transition as a Gate-1 approval.
`gate_nonce`, `working_branch`, and `worktree` are open-ended by
construction — a token, a branch name, a filesystem path — and admit no
allowlist; they are subject to the bare-literal requirement alone, never to
a closed-set check.

A nonce, an attribution, a justification, or any condition attached to a
gate decision belongs in `00-decision-ledger` (`operator-approval`,
`disposition`) — never appended to the field line itself.

**The "No gate-field repair" invariant.** No agent converts a malformed
gate-field value into a well-formed one. No agent other than the
orchestrator writes any of the seven fields above, under any circumstance —
including one it finds already malformed. Recovery from a malformed field is
re-presenting the affected gate with a fresh `gate_nonce` (see above); the
write that eventually lands is the product of a new operator reply, never a
repair of the existing value.

## Prepare, present, record — one agent, one turn

Each STAGE-GATE is a single-agent flow. The orchestrator does all three steps itself, in
the same conversation, with no hand-off:

1. **Prepare** — run the phases, produce the gate's artifacts in the workspace, generate a
   fresh `gate_nonce` (including on every re-presentation of the same gate), and write it
   to `00-state.md` beside the pending gate.
2. **Present** — render the gate's STOP block directly to the operator, inline, in the
   operator's own conversation: gate name, summary of what is being approved, workspace
   path, options, and the `gate_nonce`.
3. **Interpret and record** — read the operator's reply against the gate's closed
   allowlist (see § "Ambiguous-gate-reply rule" when the reply does not map cleanly),
   verify it is attributable to the presentation whose `gate_nonce` is currently pending — the coordinator's own observation, never a token the operator typed, then **record** both halves of
   the dual-record atomically — consuming the nonce — and route.

The orchestrator is the single **preparer, presenter and recorder** of every gate, and the
sole writer of its own `00-state.md` — no other agent ever writes a gate-release field or
event. **A decision originates only in the operator's own reply to that presentation, in
that same conversation** — never synthesized, never inferred, never carried in from a
different turn or a different agent's summary. This removes the hand-off the prior
two-agent flow relied on, and with it the audited-relay property that flow provided (§
"Integrity model" below states plainly what that removal costs — it is a retirement, not a
strengthening). Irreversible outward actions remain subject to the active runtime's approval,
independent of any gate.

## STOP-block templates

At each STAGE-GATE the orchestrator renders the STOP block directly to the operator
inline, pausing for an explicit reply in that same conversation. The shape below is a
GENERIC template: the orchestrator's own gate-data contract
(`agents/ref-pipeline.md § "STAGE-GATE-1"`/`"STAGE-GATE-3"`)
supplies the REAL option set of each presentation, including its conditionality.
Substituting the real option set with this generic placeholder — rendering the bare
`ship`/`amend`/`abort` shape shown below when the actual presentation's set is narrower or
richer — is a contract violation, not a formatting choice: the template below orients the
shape of a STOP block, it never overrides what a specific gate's own section says its
options are.

**STAGE-GATE-1** — end of `design` (mandatory, never skippable). The presentation always
discloses the release policy the approval carries: bounded autonomous correction (max-3 on the
frozen result) and automatic draft-PR publication on totally green validation. The operator's
`approve` to that disclosure is the human origin of the eventual release.

```
========================================
 STAGE-GATE-1 — Plan ready for human review
========================================
 {intent + scope fence + functional AC summary + task/file map + required risks
  + security-design result when the security floor applies; full plan at artifact}

 Approval authorizes autonomous execution: bounded correction (max-3) and
 draft-PR publication when validation is totally green. Pauses occur only for
 design-change, security, or infrastructure exceptions. Merge stays manual.

 Reply with:
   - "1 — approve"        → proceed autonomously through draft PR
   - "3: detail — edit"    → return to `design` after the requested edit
   - "4: reason — reject"  → return to `design` after the operator's decision
========================================
```

Numbers are stable input aliases for the exact textual values (`2` is retired with the
approve/approve-autonomous duality; `3`/`4` keep their historical meaning). A bare `3` or `4`
is ambiguous because edit/reject require detail; use `3: detail` or `4: reason`. The alias
never changes nonce, dual-record or live-reply requirements. Recording the approval writes
`gate1_release: approved` and `release_policy: auto-ship` in the same transition; the release
event carries both.

**STAGE-GATE-3 — mechanical release.** Gate 3 is the execution point of the release decision
recorded at Gate 1, not a second human approval:

- **Totally green validation** (no open blocking findings, all floors satisfied): the
  coordinator records `gate3_release: auto-ship` with a `stage.gate.release` event citing the
  Gate-1 release event and its consumed nonce (`origin: gate1-release-policy`). No STOP block
  is rendered, no new nonce is issued, and delivery proceeds immediately through push and
  draft-PR creation.
- **Exception pause** (closed list — see § "Closed exception list"): the coordinator renders
  the STOP block below with a fresh `gate_nonce` and waits. The exception list always takes
  precedence over auto-ship.

```
====================================
 STAGE-GATE-3 — Delivery paused: {exception}
====================================
 {exception statement + delivery summary + committed version + accepted Freeze commit/tree
  + exact PR title/body and acceptance-matrix paths with SHA-256 digests
  + Pre-Delivery Security Audit findings, or a stated absence when no audit lens ran}

 Reply with:
   - "1 — ship"   → proceed to `delivery` despite the stated exception
   - "2 — amend"  → return to `implementation`, then validate again
   - "3 — abort"  → record terminal `phase/status: aborted` and halt without pushing
====================================
```

The Gate 3 numeric aliases are exact textual equivalents; a modified or combined reply
is ambiguous and releases nothing.

Each allowlist above (Gate 1: `1`/`approve`, `3: detail`/`edit`, `4: reason`/`reject {reason}`;
Gate 3 when presented: `1`/`ship`, `2`/`amend`, `3`/`abort`) is closed — see
§ "Ambiguous-gate-reply rule" for what happens when a reply does not map to exactly one of
these values.

## Closed exception list

Between Gate-1 approval and draft-PR creation, the pipeline pauses only for these classes;
nothing else interrupts autonomous execution, and no flow may add a pause outside them:

- **A — the design changed:** a structural contradiction between the plan and the code found
  during implementation; a scope expansion beyond the approved fence; an acceptance criterion
  discovered to be unimplementable as approved.
- **B — security:** a security obligation changed (new floor triggered by the diff); a
  surviving `broke-it` from adversarial validation; a non-correctable blocking security
  finding.
- **C — infrastructure:** the correction budget (max-3) is exhausted with findings still open;
  a required runtime capability is unavailable (sandbox, credentials, network); a verification
  command cannot produce a trustworthy result; a MAJOR version bump becomes required.

An exception pause renders the Gate-3 STOP block above, names its class and concrete trigger,
and is loud: it uses the runtime's notification channel when available. A totally green run
encounters none of these and ships without pausing.

## Record-based recover backstop

A STAGE-GATE is cleared **only** when BOTH conditions hold:

(a) a `stage.gate.release` event appears in `{events_file}`, AND
(b) the per-gate field in `00-state.md § Current State` is set to an allowlist value
(per the table above).

Any other decision value, or a null/missing field, means the gate is **not** cleared:
recover re-presents the STOP block — the orchestrator renders it directly to the operator
inline, with a fresh `gate_nonce` — and halts. **Cleared-status derives exclusively from this
dual-record check — never from prose inference.** Recover never infers approval from
`next_action`, Hot Context, a TL;DR line, or any other free-text field. STAGE-GATE-3 (the
human push/PR gate) must never be bypassed on recovery, regardless of how confident the
prose looks.

This is a **record-based** backstop, not a structural one — it closes a specific
fabrication vector by construction, not by preventing writes at the filesystem level. See
the next section for the precise boundary of what it does and does not close.

## Integrity model — audited relay + runtime approval floor

**The dual-record backstop above is record-based, not structural.** Agents share a
filesystem and the runtime gives no per-agent write-sandbox, so nothing at the filesystem
level prevents any agent from writing any file the operator's permissions allow. A
release's integrity rests on three layers, honestly stated:

**1. Audited relay — RETIRED.** The prior two-coordinator design had the operator's
decision travel through a second agent (`th:leader`), which relayed it to the recorder
under an explicit `leader-relayed-operator` provenance tag. That gave a release a specific
auditable property: the record showed both the operator's own words *and* a second agent's
own attribution that those words were genuinely the operator's, unmodified. With the
fusion, the operator's reply reaches the sole coordinator directly, in the same
conversation — there is no second agent, so there is nothing left to relay and nothing left
to tag with that provenance. **This property is retired, not transferred: no successor
replicates it.** The live knowledge-graph `constraint` node that made this dual-conjunct
property mandatory for every gate release is reconciled separately, out of this tree (see
`docs/knowledge.md` and the coordinator-fusion delivery record) — reconciling the prose
here does not, by itself, close that node. What remains after this retirement is layers 2
and 3 below, and the fail-closed disciplines already stated in this file (the nonce, the
bare-literal fields, the no-repair invariant) — none of which independently proves the
operator, rather than a prompt-injected coordinator, produced the reply. **Never describe
this retirement as preserving the audited-relay property under a different name — it does
not.**

A release's integrity never depended on which agent held the pen — a prompt-injected
coordinator, monolithic or split, could forge its own release identically by writing both
dual-record halves directly. Runtime permissions do not establish writer identity for an
interior file write. This residual is pre-existing and platform-bounded; the fusion neither
adds nor removes it.

**2. The contractual order floor.** The orchestrator does not invoke a pipeline outward
action unless `gate3_release ∈ {ship, auto-ship}` for that pipeline (§ "Outward-action
release floor"). This rule closes the ordering gap only; it does not verify writer identity
because the release field remains intra-privilege-forgeable.

The order floor also does not close the **approval→push content-drift** residual:
the Gate 3 release binds ORDER (that the release preceded the push), not CONTENT (a
tree hash) — HEAD can move between recording `ship` and the push actually running (an
`amend`, a concurrent mutation), and the pushed tree can differ from the one the
operator saw at the gate. This is the same failure shape the KG pattern
`pattern-agent-executed-safety-predicate-no-true-atomicity` describes — a safety
predicate and the gated action are not truly atomic. That residual is mitigated elsewhere:
an `amend` re-runs Internal Review and regenerates the `gate_nonce`.

**3. The runtime approval floor.** Actions that cannot be undone — `git push`,
`gh pr create/merge`, and GitHub or ClickUp API writes — require the active runtime's
operator approval independently of any gate release. Runtime approval does not verify
pipeline state or writer identity.

**Never over-claim.** Do not describe the record-based backstop, the orchestrator's field
read, or runtime approval as verifying writer identity, or as closing the approval→push
content-drift gap, or as structurally preventing a forged release. Do not describe the
single-coordinator flow as restoring or replacing the retired audited-relay property under
another name. The honest model is: a retired audit layer for the internal gates (named as
such, not papered over), a contractual ORDER floor owned by the orchestrator, and the
active runtime's separate approval floor. Any prose elsewhere that implies a structural closure beyond ORDER, or
that implies layer 1's property survived the fusion, is a contract violation.

## Shared event scoping (SEC-DR-H)

When multiple projects share a single `events_file` (an initiative-level or otherwise
shared events file), the "dual" in dual-record must still hold per project, not merely
per file. Every `stage.gate.release` event carries the `project` key. The event-side half
of the recover check (condition (a) above) must match the **same** project as the
field-side half (condition (b), read from that project's own `00-state.md`) — never the
nearest release line regardless of which project wrote it. A release event from project A
can never satisfy condition (a) for project B, even when both lines live in one trace.

## Posture boundary and migration

`inline` is direct work outside the pipeline machine. It creates no state, events, gates,
delivery record, or pipeline workspace. A live operator may request an ad-hoc tester, QA,
security, or other review while inline; that review remains inline and does not create
pipeline state or a gate. Runtime/native permission, destructive-action, and outward-action
approvals remain unchanged.

If a live operator requests `inline` while a pipeline is active, the orchestrator performs
an administrative close (`phase: aborted`, `status: aborted`, pending gate cleared) and
then returns to direct work. It writes no synthetic gate release and consumes no pending
nonce. A legacy snapshot is never silently mapped: the operator must choose `1 — inline`
or `2 — pipeline`. Only an explicit `2 — pipeline` permits the first legitimate write to
set `pipeline_version: 3`, map the phase, and append `state.migrated`; valid dual-record
gate fields, decisions, pending or consumed nonces, checklist marks, and historical events are
preserved, while malformed or missing records remain uncleared. No migration write may
synthesize a release or repair a gate.

## Ambiguous-gate-reply rule

The orchestrator never silently interprets an ambiguous, modified, or out-of-allowlist
gate reply — for example, "approve but skip the tests", "yes but redo Task-2 first", or
any reply that does not map cleanly to exactly one value in the gate's allowlist. On such
a reply, the orchestrator:

1. Does **not** write either half of the dual-record.
2. Re-presents the gate's allowlist to the operator inline, with a fresh `gate_nonce`.
   Never guesses which allowlist value the operator "probably meant."
3. Waits for a reply that maps cleanly to exactly one allowlist value before writing
   anything.

The per-gate allowlists this rule enforces:

| Gate | Allowlist (text and numeric aliases) |
|---|---|
| STAGE-GATE-1 | `1`/`approve`, `3: {detail}`/`edit`, `4: {reason}`/`reject {reason}` |
| STAGE-GATE-3 (when presented) | `1`/`ship`, `2`/`amend`, `3`/`abort` |

A reply of `2`/`approve autonomous` to STAGE-GATE-1 is accepted as `approve` for operator
convenience during the transition; it records `approved`, never the retired value.

This turns the one residual place where model capability could matter at the gate seam —
interpreting an ambiguous human reply — into a closed-form contract rule that holds
regardless of which model runs the orchestrator: a reply is either a clean allowlist match
(record and route) or it is not (re-ask, record nothing). There is no judgment call in
between where a weaker model could plausibly misclassify a reply into an unintended
allowlist value.

## How to reference this file

In `agents/ref-pipeline.md`, replace inline gate-mechanism prose with a one-line
cross-reference at each STAGE-GATE section:

```
**Gate contract:** see `agents/_shared/gate-contract.md` for the dual-record release,
the prepare/present/record flow, the record-based recover backstop,
and the ambiguous-gate-reply rule. This section implements it for STAGE-GATE-{N}.
```
