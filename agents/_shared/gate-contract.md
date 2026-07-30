# Gate contract

> **`gate-guard` is UNWIRED as of v2.139.0 in the Claude Code plugin path.** The STAGE-GATE
> mechanism below — the dual-record release, the recover backstop, the STOP-block templates
> and the preparer/presenter flow — is unchanged and remains binding: it is how the pipeline
> records and presents gates. What changed is that no hook wired in the Claude Code plugin
> path (`.claude-plugin/hooks.json`) enforces it any more. Every reference below to
> `gate-guard` denying a push, or to a hook verifying a gate field, describes Claude Code
> plugin behavior that is no longer dispatched there. Do not rely on the Claude Code plugin's
> hooks to catch a missing or malformed release; the contract is the control. Rationale:
> `docs/dev-mode.md § "Boundary, not flow"`.
<!-- Single source of truth for the STAGE-GATE mechanism: the dual-record release,
     the record-based recover backstop, the STOP-block templates, and the single
     preparer + presenter + recorder flow.
     Consumed by: agents/orchestrator.md — IMPLEMENTS/RECORDS this contract for its
     three STAGE-GATEs; it is the sole agent that prepares, presents and records
     a gate.
     Edit here; the coordinator references this file by section. -->

## Ownership — single source, never copied

This file is the ONE canonical description of the gate mechanism. `agents/orchestrator.md`
**implements and references** it — the three STAGE-GATEs it welds internally follow the
rules below verbatim. No other agent file may copy, restate, or fork this contract.
Duplicating it re-imports the drift risk this design closes: a second copy would diverge
from this one the first time either is edited, and a diverged copy is a security-relevant
defect (the audited-relay integrity property this contract once depended on — now retired,
see § "Integrity model — audited relay + a deterministic outward floor" below — depended on
exactly one prompt in the system recording the dual-record schema; the single-coordinator
model keeps that same one-prompt property for the schema itself, even though the relay it
used to audit no longer exists).

`agents/orchestrator.md` is the only agent that ever reads this file. It presents every
gate directly to the operator and records both halves of the dual-record itself — there is
no second agent in the loop to reference the STOP-block templates or allowlists for its own,
separate presentation duty.

## Outward-action release floor

No outward action from a **detected** pipeline context — a `git push` to a feature
branch, or `gh pr create` — proceeds without `gate3_release ∈ {ship}` registered in the
governing lane's `00-state.md` (see § "The dual-record release" below for the field and
its per-gate allowlist). `gate-guard` — a deterministic PreToolUse hook, structural
sibling of `prepublish-guard` — is the enforcer: it resolves the governing lane by
mtime-selecting the active `00-state.md` (local or vault) and correlating the current
branch against that lane's `working_branch` field, valid in both the worktree and the
branch-in-place topology, then denies the outward action unless the resolved lane's
`gate3_release` is in the allowlist.

**This is detection-dependent, not universal or unconditional coverage.** `gate-guard`
denies only when a governing lane actually *resolves*. When no lane resolves — a manual
push by the developer, an inline (no-orchestrator) session, an unrelated repository —
`gate-guard` defers (`decision: none`) and the action proceeds exactly as it did before
this design, under the outward-action floor already applied by `dev-guard`. Stating
this plainly is a deliberate correction: an earlier draft of this contract described the
floor as covering every outward action unconditionally, which overstated it — the floor
closes the ORDER gap only for a push/pr-create that `gate-guard` can attribute to a
detected pipeline lane.

**Detection is parse-based, via the shared command analyzer.** `gate-guard`'s
covered-verb detection resolves the executed command through the same shared analyzer
`dev-guard` consumes (`hooks/ts/bodies/command-lexer.ts::analyzeCommand`
+ `classifyCoveredAction`) — recursive wrapper resolution plus per-subcommand-binary
basename equivalence, not a boundary-character-class regex over the literal string. A
covered verb reconstructed through a wrapper (`bash -c "git push …"`) or invoked via its
own per-subcommand executable (`git-push`, `$(git --exec-path)/git-push`) now resolves
to the same classified command as the literal dispatcher form, closing the evasion this
paragraph previously disclosed as accepted. The residual static-resolution limits that
remain — a dynamic verb/executable token, a statically-unresolvable pipe-to-shell
payload, recursion-depth-exceeded, script-file execution, alias/PATH-shadowing
execution, and `ssh <host> "<cmd>"` — are documented in
`docs/dev-mode.md § "Detection mechanism"` and fail CLOSED
(`ask`/`deny`), never silently treated as "no covered action."

**Force-push clause (Invariant E, operator-mandated).** No outward action from a
detected pipeline context force-pushes — neither the flag form (`-f`, `--force`,
`--force-with-lease`) nor the `+`-prefixed refspec form (e.g. `git push origin
+feature:main`). This is a **DENY unconditional on `gate3_release`**: force-push is
never legitimate from an in-lane pipeline delivery, so `ship` does not authorize it.
`gate-guard` is the in-lane enforcer for both forms, evaluated on the same `git push`
invocation it already inspects for the order check above.

**Detection mechanism (Invariant G, `hooks/ts/bodies/command-lexer.ts::matchBenignPushGrammar`
over resolved argv) — a closed positive grammar, not a character-denylist.** An earlier
implementation of Invariant E enumerated bad characters/flags and was defeated three
times by three different shell token-reconstruction techniques (whole-token quoting,
mid-token quote-splicing, then brace expansion/backtick substitution). The replacement
permits ONLY the exact benign push shape — `git push [-u|--set-upstream|-v|--verbose|
--progress] origin <plain-branch>`, where `<plain-branch>` excludes any
ref-namespace-qualified or tag-like destination (a destination whose first
`/`-segment is `refs`/`heads`/`tags`/`remotes`, checked via
`isPlainBranchDestination`) — validated against the RESOLVED argv the shared analyzer
produces (after recursive wrapper unwrapping and basename resolution), not the raw
command string: any token that still carries an unresolved shell metacharacter is
marked `tainted` and the grammar rejects it outright, rather than inspecting its
characters against a fixed safe set. An obfuscation technique never specifically
considered still lands on the deny side, because it is not the one permitted shape or
it stayed tainted, not because it was individually detected — INCLUDING a shape reached
only through a command-executing wrapper or a per-subcommand binary, which the retired
string-level grammar could not see at all. `gate-guard` (force+order
deny) and `dev-guard`'s push gate both consume this single shared analyzer and grammar
module — one source of truth, never duplicated. Honest scope: the grammar reasons
about the resolved argv the analyzer could statically determine, not everything a live
shell might ultimately execute — an env-assignment prefix, a `git -c <k=v>` config
override, or a tree/exec-path-redirecting option on a covered push is surfaced by the
analyzer and fails closed on the consuming hook, no longer silently out of scope; what
remains genuinely out of scope by design is git config already persisted in the
repository (`push.default`, `remote.origin.push`), a `git` shell alias or function, a
shadowing `git` binary earlier on `PATH`, and `ssh`-remote execution — an attacker
controlling any of those already has code execution in the session or on the target
host.

`dev-guard` remains the registered outward-action owner. It routes force flags,
`+`-prefixed refspecs and other non-benign push forms to `ask`, destination-aware and
without reading lane state. `policy-block` intentionally owns no git workflow policy.
The unwired `gate-guard` body retains its self-contained in-lane deny semantics only as
historical code; it does not strengthen the live Claude Code or OpenCode path.

This design never touches or works around server-side branch protections; mutating
`gh api` writes remain `ask` under `dev-guard`, unchanged. The philosophy this design
anchors: **the only two hard points are force-push (deny in-lane, ask outside) and
merge (always ask, non-configurable) — every other git operation stays frictionless.**

## The dual-record release

Each STAGE-GATE releases only when the orchestrator writes **both** of the following, in
the same phase-transition:

| Record | Where | What it carries |
|---|---|---|
| Field | `00-state.md § Current State` | `gate1_release` or `gate3_release` — see the per-gate allowlist table below — plus `gate_nonce`, the token currently pending for that gate |
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

**Per-gate allowlists** (the values recover treats as "cleared" — see § "Record-based
recover backstop"):

| Gate | Field | Cleared when | Not cleared (any of) |
|---|---|---|---|
| STAGE-GATE-1 | `gate1_release` | `∈ {approved, approved-autonomous}` | `rejected`, `edit`, `null`/missing |
| STAGE-GATE-3 | `gate3_release` | `= ship` | `amend`, `abort`, `null`/missing |

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

**Bare-literal field values.** Each of the five gate-state fields —
`gate1_release`, `gate3_release`, `gate_nonce`,
`working_branch`, and `worktree` — is written to `00-state.md § Current State`
as a bare literal: the value carries no second token delimited by a space on
the same line, no trailing nonce, attribution, justification, or condition
appended after it. Every reader of these fields — the record-based recover
backstop above, `agents/_shared/orchestrator-state.md § Current State`, and the executable
`working_branch`/`worktree` comparisons this contract's consumers install in
`implementer` and `tester` — matches the first equal line by strict string
equality, so a value carrying any annotation stops matching the instant one
is appended.

For the three `*_release` fields, the per-gate allowlist table above is the
closed, citable set of literal values the field may hold — no value outside
that set, and no annotated variant of an allowlisted value, is ever written.
`gate_nonce`, `working_branch`, and `worktree` are open-ended by
construction — a token, a branch name, a filesystem path — and admit no
allowlist; they are subject to the bare-literal requirement alone, never to
a closed-set check.

A nonce, an attribution, a justification, or any condition attached to a
gate decision belongs in `00-decision-ledger` (`operator-approval`,
`disposition`) — never appended to the field line itself.

**The "No gate-field repair" invariant.** No agent converts a malformed
gate-field value into a well-formed one. No agent other than the
orchestrator writes any of the five fields above, under any circumstance —
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
strengthening). The deterministic floor for irreversible outward actions remains
`dev-guard`, independent of any gate and unaffected by this change.

## STOP-block templates

At each STAGE-GATE the orchestrator renders the STOP block directly to the operator
inline, pausing for an explicit reply in that same conversation. The shape below is a
GENERIC template: the orchestrator's own gate-data contract
(`agents/orchestrator.md § "STAGE-GATE-1"`/`"STAGE-GATE-3"`/`"Express combined gate"`)
supplies the REAL option set of each presentation, including its conditionality.
Substituting the real option set with this generic placeholder — rendering the bare
`ship`/`amend`/`abort` shape shown below when the actual presentation's set is narrower or
richer — is a contract violation, not a formatting choice: the template below orients the
shape of a STOP block, it never overrides what a specific gate's own section says its
options are.

**STAGE-GATE-1** — end of Stage 1 (mandatory, never skippable):

```
========================================
 STAGE-GATE-1 — Plan ready for human review
========================================
 {Review Summary + Confidence band + Task Summary + accumulated cost
  + combined verdict, or a deferred-review note when the plan-review panel
  was deferred pre-gate (agents/orchestrator.md § "Phase 1.5 — Plan
  Ratification" / § "Phase 1.6 — Plan Review")}

 Reply with:
   - "approve"            → proceed to Stage 2
   - "approve autonomous" → proceed to Stage 2, skip the Phase 1.8 post-approval plan-review offer
   - "reject {reason}"    → route back to architect
   - "edit"                → pause for manual edits, then "approve"
========================================
```

**Deferred-review variant (no allowlist or dual-record change).** When the implementing orchestrator's `plan_review_status` is `deferred` or `not-applicable`, the `{...}` placeholder above renders a one-line deferred-review note instead of a combined verdict — see `agents/orchestrator.md § "STAGE-GATE-1 — End of Stage 1"` for the exact rendering. This substitutes CONTENT inside the placeholder only: the allowlist, the nonce mechanics, and the dual-record fields this file governs are unchanged — a deferred-review presentation clears and records exactly like any other STAGE-GATE-1 presentation.

**STAGE-GATE-3** — end of Stage 3 (mandatory, never skippable, regardless of
`autonomous`):

```
====================================
 STAGE-GATE-3 — Delivery ready for human approval
====================================
 {delivery summary + version/CHANGELOG-entry preview + Pre-Delivery Security Audit findings,
  or a stated absence when no audit lens ran (security_floor_applies: false)}

 Reply with:
   - "ship"   → proceed to Delivery, then GitHub Update and Knowledge Save
   - "amend"  → pause for local fixes, then "ship"
   - "abort"  → halt without pushing
====================================
```

Each allowlist above (`approve` / `approve autonomous` / `reject {reason}` / `edit`;
`ship` / `amend` / `abort`) is
closed — see § "Ambiguous-gate-reply rule" for what happens when a reply does not map to
exactly one of these values.

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

## Integrity model — audited relay + a deterministic outward floor

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
dual-record halves directly, because no hook can distinguish writers (a `Write`/`Edit`
payload carries **no writer identity** — the only identity signals, `subagent_type` and
`agent_id`, ride Task-dispatch and SubagentStop *boundary* payloads, never an interior
write). This residual is pre-existing and platform-bounded; the fusion neither adds nor
removes it. The two paragraphs below carry this file's pre-existing residual disclosures
forward verbatim — the fusion changes who prepares and presents a gate, never what a wired
hook does or does not verify about the resulting field.

**2. The deterministic order floor (`gate-guard`) — new, layered above the outward
floor below.** Before this design, no control verified that a gate release preceded a
push/pr-create from a pipeline lane: `gh pr create` was already covered **by
destination** (`dev-guard`'s `ask` default, or `allow` under the `autogate.pr_create`
opt-in), and a push to a feature branch already auto-`allow`ed — neither check related
to whether a STAGE-GATE-3 release had been recorded. `gate-guard` adds exactly that
missing ORDER check: it denies the outward action from a detected pipeline lane unless
`gate3_release ∈ {ship}` for that lane (§ "Outward-action release floor").

This addition does **not** verify writer identity. `gate-guard` reads `gate3_release` —
an **intra-privilege-forgeable field**, per the same no-writer-identity limit described
above: nothing distinguishes which agent wrote it. That writer-identity residual
persists unchanged; `gate-guard` closes an ORDER gap, not that one. The
**ask-class caveat** (`docs/dev-mode.md § Ask-class caveat`) still applies unchanged to
`dev-guard`'s own `ask` on `gh pr create` and `gh pr merge` — whether those `ask`s
actually stop the action depends on the session's permission posture, not on
`gate-guard`. `gate-guard`'s own decision set is `{none, deny}` (never `ask`), so it
neither inherits nor removes that softness: the two mechanisms are independent and
additive, not a replacement of one by the other.

`gate-guard` also does not close the **approval→push content-drift** residual:
`gate3_release: ship` binds ORDER (that the release preceded the push), not CONTENT (a
tree hash) — HEAD can move between recording `ship` and the push actually running (an
`amend`, a concurrent mutation), and the pushed tree can differ from the one the
operator saw at the gate. This is the same failure shape the KG pattern
`pattern-agent-executed-safety-predicate-no-true-atomicity` describes — a safety
predicate and the gated action are not truly atomic. `gate-guard`, as a PreToolUse hook
evaluating the SAME `git push`/`gh pr create` invocation it gates (not a separate
check-then-act call pair), has a genuinely tighter check-to-act window than that pattern
— a real strength for the ORDER guarantee above — but tightening check-to-act timing is
a different thing from binding content: it does not close the content-drift gap. That
residual is mitigated elsewhere (an `amend` re-runs Internal Review and regenerates the
`gate_nonce`), not by `gate-guard` itself.

**3. The pre-existing outward floor (`dev-guard`).** The actions that actually cannot be
undone — `git push`, `gh pr create/merge`, GitHub/ClickUp API writes — are gated by the
`dev-guard` hook, which fires unconditionally on the tool call and prompts the operator
natively in the UI, independent of any gate release. This floor is unchanged by this
design: even a forged STAGE-GATE-3 release still has to clear `dev-guard`'s native
destination-based gating. The internal gates no longer have an audited-relay layer to rely
on — layer 1 is retired, above — so their fabrication-visibility rests on the record-based
backstop and the operator's own attentiveness at each presentation; the irreversible
boundary still relies on `dev-guard`, with `gate-guard`'s deterministic order check sitting
in front of it for a detected pipeline lane.

**Never over-claim.** Do not describe the record-based backstop, `gate-guard`'s field
read, or any hook as verifying writer identity, or as closing the approval→push
content-drift gap, or as structurally preventing a forged release. Do not describe the
single-coordinator flow as restoring or replacing the retired audited-relay property under
another name. The honest model is: a retired audit layer for the internal gates (named as
such, not papered over), a deterministic ORDER floor (`gate-guard`) added for a detected
pipeline lane's outward action, and `dev-guard`'s pre-existing destination-based floor
underneath both. Any prose elsewhere that implies a structural closure beyond ORDER, or
that implies layer 1's property survived the fusion, is a contract violation.

## Multi-lane event scoping (SEC-DR-H)

When multiple orchestrator lanes share a single `events_file` (an initiative-level or
otherwise shared events file, as already used elsewhere for multi-project fan-out), the
"dual" in dual-record must still hold per-lane, not just per-file. Every
`stage.gate.release` event carries the lane/`project` key. The event-side half of the recover check (condition (a) above) must be
matched against the **same** lane/`project` as the field-side
half (condition (b), read from that lane's own orchestrator `00-state.md`) — never against
the nearest `stage.gate.release` line in the shared file regardless of which lane wrote
it. Scoping the search this way preserves the dual-record guarantee under a shared
`events_file`: a release event from lane A can never satisfy condition (a) for lane B's
gate, even when both lines live in the same JSONL/markdown file.

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

| Gate | Allowlist |
|---|---|
| STAGE-GATE-1 | `approve`, `approve autonomous`, `reject {reason}`, `edit` |
| STAGE-GATE-3 | `ship`, `amend`, `abort` |

This turns the one residual place where model capability could matter at the gate seam —
interpreting an ambiguous human reply — into a closed-form contract rule that holds
regardless of which model runs the orchestrator: a reply is either a clean allowlist match
(record and route) or it is not (re-ask, record nothing). There is no judgment call in
between where a weaker model could plausibly misclassify a reply into an unintended
allowlist value.

## How to reference this file

In `agents/orchestrator.md`, replace inline gate-mechanism prose with a one-line
cross-reference at each STAGE-GATE section:

```
**Gate contract:** see `agents/_shared/gate-contract.md` for the dual-record release,
the prepare/present/record flow, the record-based recover backstop,
and the ambiguous-gate-reply rule. This section implements it for STAGE-GATE-{N}.
```
