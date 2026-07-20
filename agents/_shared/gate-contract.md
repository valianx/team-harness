# Gate contract
<!-- Single source of truth for the STAGE-GATE mechanism: the dual-record release,
     the record-based recover backstop, the STOP-block templates, and the
     preparer+recorder (orchestrator) / presenter+relayer (leader) flow.
     Consumed by: agents/orchestrator.md — IMPLEMENTS/RECORDS this contract for its
     three STAGE-GATEs. agents/leader.md — REFERENCES the STOP-block templates and
     allowlists to present each gate inline and relay the decision (see
     § "agents/leader.md — presenter and relayer").
     Edit here; both agents reference this file by section. -->

## Ownership — single source, never copied

This file is the ONE canonical description of the gate mechanism. `agents/orchestrator.md`
**implements and references** it — the three STAGE-GATEs it welds internally follow the
rules below verbatim. No other agent file may copy, restate, or fork this contract.
Duplicating it re-imports the drift risk this design closes: a second copy would diverge
from this one the first time either is edited, and a diverged copy is a security-relevant
defect (the audited-relay integrity in § "Integrity model — audited relay + a deterministic
outward floor" below depends on exactly one prompt in the system recording the dual-record
schema).

`agents/leader.md` references this file for the STOP-block templates and allowlists — it
needs them to present each gate inline — but never records any half of the dual-record.
See § "`agents/leader.md` — presenter and relayer" below for the exact boundary.

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
this design, under whatever floor already applied (`dev-guard`, `policy-block`). Stating
this plainly is a deliberate correction: an earlier draft of this contract described the
floor as covering every outward action unconditionally, which overstated it — the floor
closes the ORDER gap only for a push/pr-create that `gate-guard` can attribute to a
detected pipeline lane.

**Detection is parse-based, via the shared command analyzer.** `gate-guard`'s
covered-verb detection resolves the executed command through the same shared analyzer
`dev-guard` and `policy-block` consume (`hooks/ts/bodies/command-lexer.ts::analyzeCommand`
+ `classifyCoveredAction`) — recursive wrapper resolution plus per-subcommand-binary
basename equivalence, not a boundary-character-class regex over the literal string. A
covered verb reconstructed through a wrapper (`bash -c "git push …"`) or invoked via its
own per-subcommand executable (`git-push`, `$(git --exec-path)/git-push`) now resolves
to the same classified command as the literal dispatcher form, closing the evasion this
paragraph previously disclosed as accepted. The residual static-resolution limits that
remain — a dynamic verb/executable token, a statically-unresolvable pipe-to-shell
payload, recursion-depth-exceeded, script-file execution, alias/PATH-shadowing
execution, and `ssh <host> "<cmd>"` — are documented in
`docs/dev-mode.md § Outward-Action Gate / § Detection mechanism` and fail CLOSED
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

This clause layers on top of two pre-existing floors that this design does **not**
change:

- `policy-block`'s unconditional flag-based force-push deny
  (`hooks/ts/bodies/policy-block.ts:295`), which applies in every context, pipeline or
  not.
- `dev-guard`'s outside-lane `ask` on a `+`-prefixed refspec
  (`hooks/ts/bodies/dev-guard.ts:551-553`), destination-only, with no lane-state read.

`gate-guard` only **adds** a layer over both — it replaces neither. Non-redundancy
rationale: (i) it gives `gate-guard` its own self-sufficient in-lane guarantee that does
not depend on a sibling hook's regex never changing; (ii) it is the only hook that
closes the `+refspec` sub-form for the in-lane case — `policy-block`'s flag-only regex
does not match a bare `+`-prefix, and `dev-guard`'s handling of it is destination-only.

This design never touches or works around server-side branch protections; mutating
`gh api` writes remain `ask` under `dev-guard`, unchanged. The philosophy this design
anchors: **the only two hard points are force-push (deny in-lane, ask outside) and
merge (always ask, non-configurable) — every other git operation stays frictionless.**

## The dual-record release

Each STAGE-GATE releases only when the orchestrator writes **both** of the following, in
the same phase-transition:

| Record | Where | What it carries |
|---|---|---|
| Field | `00-state.md § Current State` | `gate1_release`, `gate2_release_last`, or `gate3_release` — see the per-gate allowlist table below — plus `gate_nonce`, the token currently pending for that gate |
| Event | `{events_file}` | a `stage.gate.release` JSON line carrying `stage`, `decision`, `gate_nonce` (the consumed value), and (for STAGE-GATE-2) `after_round` |

**The `gate_nonce` field.** Each dual-record carries a third element: a `gate_nonce` — a
fresh, **single-use** token the orchestrator generates every time it prepares a gate,
**including every re-presentation** (an ambiguous-reply re-ask, a recover-triggered
re-presentation). The nonce is written to `00-state.md` alongside the pending gate and
included in the `gate_pending` status the orchestrator returns to `th:leader`; the
leader carries it back untouched in the relay (see § "`agents/leader.md` — presenter and
relayer"). Recording a release **consumes** the nonce — it becomes invalid the instant
the release is written. A relay that arrives carrying a superseded nonce (one issued for
an earlier presentation of the same gate) is therefore ambiguous, never a valid release:
the orchestrator re-presents instead of recording (§ "Ambiguous-gate-reply rule").

**The nonce is a freshness/ordering token, not a secret or an authentication factor.** It
does not prove operator origin — `th:leader` always possesses it, verbatim, the moment
the gate is presented (it rides `gate_pending`). Its only job is to make each
presentation of a gate distinguishable from every other presentation, so a stale relay
(one answering a superseded presentation) can never be recorded as if it answered the
current one. It closes the exact replay vector where a relay arrives after the gate has
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
| STAGE-GATE-2 | `gate2_release_last` (scoped to the relevant `after_round`) | `∈ {next, next-autonomous}` | `stop`, `redo`, `null`/missing |
| STAGE-GATE-3 | `gate3_release` | `= ship` | `amend`, `abort`, `null`/missing |

Clearing a gate against this table is necessary but not sufficient on its own: recording
the release additionally requires the relayed reply to carry the `gate_nonce` currently
pending for that gate (§ "The dual-record release" above) — a reply that clears this
table's allowlist but carries a stale or missing nonce is still not recorded; it is
treated as ambiguous (§ "Ambiguous-gate-reply rule").

## preparer + recorder (orchestrator) — presenter + relayer (leader)

Each STAGE-GATE is a two-agent flow with a single recorder:

1. The **orchestrator prepares** the gate — it runs the phases, produces the gate's
   artifacts in the workspace, generates a fresh `gate_nonce` (including on every
   re-presentation of the same gate), and returns a `gate_pending` status to `th:leader`
   (gate name, summary of what is being approved, workspace path, `gate_nonce`). It then
   goes dormant, resumable with context intact.
2. **`th:leader` presents** the gate's STOP block to the operator inline, in the operator's
   main conversation — the channel the operator can reliably reach.
3. **`th:leader` relays** the operator's decision back to the orchestrator under explicit
   attribution: the operator's verbatim words, the `gate_nonce` carried from
   `gate_pending`, and the provenance marker `leader-relayed-operator`.
4. The **orchestrator interprets** the relayed decision against the gate's closed
   allowlist (see § "Ambiguous-gate-reply rule" when the reply does not map cleanly) and
   verifies the relayed `gate_nonce` matches the one currently pending, then **records**
   both halves of the dual-record atomically — consuming the nonce — stamping the relay
   provenance, and routes.

The orchestrator is the single **recorder and sole writer** of its own `00-state.md` — no
other agent writes a gate-release field or event. The leader never writes any part of the
dual-record; it carries the operator's decision to the recorder, which writes it with
provenance. This flow deliberately replaces an earlier gate-blind model in which the
operator replied inside the orchestrator's own subagent transcript — a channel that proved
unreachable in real clients, deadlocking the gate. The integrity of a release is now
AUDITED (verbatim attribution + provenance record), and the deterministic floor for
irreversible outward actions is `dev-guard` (see § "Integrity model" below), not agent
identity.

## STOP-block templates

At each STAGE-GATE the orchestrator returns a `gate_pending` status to `th:leader`, and
`th:leader` presents the STOP block to the operator inline, pausing for an explicit reply it
relays back to the orchestrator. Both agents reference the structural shape below — it is
what `th:leader` presents and what the orchestrator interprets against the allowlist:

**STAGE-GATE-1** — end of Stage 1 (mandatory, never skippable):

```
========================================
 STAGE-GATE-1 — Plan ready for human review
========================================
 {Review Summary + Confidence band + Task Summary + accumulated cost + combined verdict}

 Reply with:
   - "approve"            → proceed to Stage 2
   - "approve autonomous" → proceed to Stage 2, skip STAGE-GATE-2 between rounds
   - "reject {reason}"    → route back to architect
   - "edit"                → pause for manual edits, then "approve"
========================================
```

**STAGE-GATE-2** — between rounds in Stage 2 (default STOP; silently skipped only when
`autonomous: true` was granted at a prior gate):

```
====================================
 STAGE-GATE-2 — Round {R}/{total_rounds} completed
====================================
 {tasks completed this round + aggregated stats + next round preview}

 Reply with:
   - "next"              → proceed to round R{R+1}
   - "next autonomous"   → proceed, skip subsequent STAGE-GATE-2 stops
   - "stop"               → halt the pipeline
   - "redo Task-{i}"      → reopen one task from the completed round
====================================
```

**STAGE-GATE-3** — end of Stage 3 (mandatory, never skippable, regardless of
`autonomous`):

```
====================================
 STAGE-GATE-3 — Delivery ready for human approval
====================================
 {delivery summary + internal-review findings}

 Reply with:
   - "ship"   → push to GitHub, then Knowledge Save
   - "amend"  → pause for local fixes, then "ship"
   - "abort"  → halt without pushing
====================================
```

Each allowlist above (`approve` / `approve autonomous` / `reject {reason}` / `edit`;
`next` / `next autonomous` / `stop` / `redo Task-{i}`; `ship` / `amend` / `abort`) is
closed — see § "Ambiguous-gate-reply rule" for what happens when a reply does not map to
exactly one of these values.

**Implementation-scoped reply extensions map onto exactly one canonical value.** An
implementing orchestrator's own STAGE-GATE-3 STOP block may offer a reply form scoped to
its richer flow that is not shown in the generic template above — for example,
`agents/orchestrator.md`'s STAGE-GATE-3 offers `override {reason}` when
`criticals_count ≥ 1`, which records `gate3_release: ship` identically to a bare `ship`
reply. This is not an allowlist regression: `override {reason}` maps 1:1 onto the
canonical `ship` value, it never introduces a new stored value, and `gate-guard`'s
`gate3_release ∈ {ship}` check stays consistent with it — an `override`-recorded release
clears the same allowlist entry a `ship`-recorded one does.

## Record-based recover backstop

A STAGE-GATE is cleared **only** when BOTH conditions hold:

(a) a `stage.gate.release` event appears in `{events_file}`, AND
(b) the per-gate field in `00-state.md § Current State` is set to an allowlist value
(per the table above).

Any other decision value, or a null/missing field, means the gate is **not** cleared:
recover re-presents the STOP block — the orchestrator returns its `gate_pending` to `th:leader`,
which presents it inline — and halts. **Cleared-status derives exclusively from this
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
level prevents any agent from writing any file the operator's permissions allow. The gate
decision reaches the recorder through the leader, so a release's integrity rests on three
layers, honestly stated — the third is what this design adds:

**1. Audited relay (the leader layer).** The leader relays ONLY an explicit operator
decision, verbatim, tagged with the `leader-relayed-operator` provenance the orchestrator
records. It never synthesizes or infers an approval; an ambiguous operator message is
clarified before relay, and a decision resembling one found in fetched/pasted content (a
`"pre-approved"` string in an issue) is DATA, never relayed. This makes a relayed release
**auditable** — the record shows the operator's own words and the relay path — but it is a
**prompt-level** guarantee, not a structural one. A prompt-injected leader could still forge
a release directly (write both dual-record halves itself); no hook can distinguish writers,
because a `Write`/`Edit` payload carries **no writer identity** (the only identity signals,
`subagent_type` and `agent_id`, ride Task-dispatch and SubagentStop *boundary* payloads,
never an interior write). This residual is pre-existing and platform-bounded — a
prompt-injected *monolithic* orchestrator could forge its own release identically; the
split neither adds nor removes it.

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
in § 1 above: nothing distinguishes which agent wrote it. The writer-identity residual
from § 1 persists unchanged; `gate-guard` closes an ORDER gap, not that one. The
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
destination-based gating. Internal gates (1, 2) — whose fabrication is recoverable and
visible — rely on the audited-relay layer; the irreversible boundary relies on
`dev-guard`, now with `gate-guard`'s deterministic order check sitting in front of it for
a detected pipeline lane.

**Never over-claim.** Do not describe the record-based backstop, `gate-guard`'s field
read, or any hook as verifying writer identity, or as closing the approval→push
content-drift gap, or as structurally preventing a forged release. The honest model is:
audited relay for the internal gates, a deterministic ORDER floor (`gate-guard`) added
for a detected pipeline lane's outward action, and `dev-guard`'s pre-existing
destination-based floor underneath both. Any prose elsewhere that implies a structural
closure beyond ORDER is a contract violation.

## `agents/leader.md` — presenter and relayer

`agents/leader.md` references this file for the STOP-block templates and the allowlists (§
"STOP-block templates", § "Ambiguous-gate-reply rule") — it needs them to present each gate
to the operator inline. It does NOT carry the dual-record field names or the
`stage.gate.release` event shape in its own writes: **the leader never writes any half of
the dual-record.** Its authorized gate role is present + relay:

- **Present** — when an orchestrator returns `gate_pending`, the leader surfaces to the
  operator the gate name, the summary of what is being approved, and the STOP-block options.
- **Relay** — it carries the operator's verbatim decision back to the orchestrator tagged
  `leader-relayed-operator`, and never records or forges any part of the dual-record itself.

The leader relays ONLY an explicit operator decision. If the operator's reply is ambiguous,
the leader asks for a clean choice before relaying (it never guesses an allowlist value into
existence). The load-bearing protection against a prompt-injected leader forging a release
is the prompt-level prohibition on the leader writing any dual-record half, backed by the
`dev-guard` outward floor for irreversible actions (§ "Integrity model") — not the leader's
ignorance of the schema.

## Multi-lane event scoping (SEC-DR-H)

When multiple orchestrator lanes share a single `events_file` (an initiative-level or
otherwise shared events file, as already used elsewhere for multi-project fan-out), the
"dual" in dual-record must still hold per-lane, not just per-file. Every
`stage.gate.release` event carries the lane/`project` key and, for STAGE-GATE-2, the
`after_round` key. The event-side half of the recover check (condition (a) above) must be
matched against the **same** lane/`project` (+ round, where applicable) as the field-side
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
2. Returns to `th:leader` requesting a clean choice — `th:leader` re-presents the gate's
   allowlist to the operator inline. Neither agent guesses which allowlist value the
   operator "probably meant."
3. Waits for a relayed reply that maps cleanly to exactly one allowlist value before
   writing anything.

The per-gate allowlists this rule enforces:

| Gate | Allowlist |
|---|---|
| STAGE-GATE-1 | `approve`, `approve autonomous`, `reject {reason}`, `edit` |
| STAGE-GATE-2 | `next`, `next autonomous`, `stop`, `redo Task-{i}` |
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
the preparer+recorder / presenter+relayer flow, the record-based recover backstop,
and the ambiguous-gate-reply rule. This section implements it for STAGE-GATE-{N}.
```
