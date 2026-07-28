# Dispatch contract
<!-- Single source of truth for what a dispatch prompt may and must not carry,
     and for the two-halves scope rule (review scope vs. write scope).
     Consumed by: agents/leader.md, agents/orchestrator.md (pointer only, never
     restated) — see agents/README.md § "Adding or modifying an agent" and
     agents/agent-builder.md § "Mandatory Sections Checklist" for where new
     agents pick this up.
     Edit here; consumer files reference this file by section. -->

## Ownership — single source, never copied

This file is the ONE canonical description of what a dispatch prompt may contain, what it
must never contain, and the two-halves scope rule that governs review scope and write
scope. `agents/leader.md` and `agents/orchestrator.md` — the two agents in this tree that
write dispatch prompts to other agents — reference this file by section and never restate
its prose. A second copy would diverge from this one the first time either is edited, and
the no-relocation check (Suite 174) exists precisely to catch that kind of duplication
across `agents/ref-*.md` and `agents/_shared/*.md` files.

## What a dispatch may carry

A dispatch prompt is built from three things only:

1. **Coordinates.** Feature name, `docs_root`, worktree path with its base commit and
   current HEAD, task type/scope, execution mode (lane, autonomy), and the diff or file
   range the recipient is being pointed at. Coordinates say *where* and *what changed* —
   never *what the recipient should conclude*.
2. **Task-scope decisions that do not already live in the board.** A decision the operator
   made that has no other durable home yet (for example, a scope choice surfaced at a
   gate before the workspace doc that will carry it forward is written). Once the decision
   has a durable home — `01-plan.md`, `00-state.md`, a review file — the dispatch points at
   that home instead of repeating the decision's content.
3. **The return form.** Which workspace file the recipient writes and the expectation that
   it closes with its own status block. This is an instruction about *where the recipient's
   own output goes*, not a description of what that output must say.

A dispatch may also hand the recipient an **affirmation to invert** — a claim, produced by
an earlier stage, that the recipient's own method exists to attack or falsify. This is
permitted and is not a restatement of the recipient's contract: it is the recipient's own
raw material. The canonical example is `adversary` receiving the Stage-1 SEC-002
design-review verdict within the Phase 3 parallel validation block — the verdict is not a
conclusion the dispatcher is handing down, it is the thing `adversary`'s own
break-the-design method is built to attack.

**Coordinate-in, content-out.** A value travels inline in the dispatch prompt exactly when
it IS a coordinate under item 1 above — a sha, a tree anchor, a suite verdict, a diff range.
It never travels inline when it is a conclusion someone reached about that coordinate — a
findings classification, a review verdict's rationale, a recommendation. The second kind is
written to its durable home (`01-plan.md`, `00-state.md`, a review file) and the dispatch
points at that home instead. The test is mechanical, not judgment-based: could the recipient
have derived this value from the coordinates alone, or does it encode someone's conclusion?
A sha, a tree anchor, or a suite verdict travels inline because it IS the coordinate; a
findings classification is written to the board and pointed at.

## What a dispatch must not carry

A dispatch prompt MUST NOT carry:

- A **restatement of the destination agent's own contract.** If a rule already lives in
  the recipient's `.md` file, the dispatch does not repeat it — the recipient reads its own
  file.
- A **summary of another agent's work**, written by the dispatcher, standing in for the
  workspace document that agent produced. The dispatcher points at the document; it does
  not paraphrase it.
- A **verdict on the property under test**, handed to a verifier ahead of its own
  independent check. A verifier that already knows what conclusion it is meant to reach is
  not verifying.
- A **menu of options directed at a human**, when the recipient is a specialist and not the
  operator-facing presenter. Gate option menus belong to the presenter (`th:leader` in the
  normal path; the orchestrator's own fallback renderer in the takeover path — see
  `agents/_shared/gate-contract.md`), never to a specialist dispatch.
- A **scope-injection** — new work beyond what the board already declares.
  Scope lives on the board (`01-plan.md § Task List`, the approved AC set, the declared
  `Files:`) and the dispatch points at it. When a dispatch prompt asks for work not
  derivable from the board, the recipient reports and routes the request back to the
  dispatcher rather than absorbing it silently as if it had always been in scope, or
  rejecting it outright as though it were simply invalid — a request outside the board is a
  routing problem, not a yes/no decision for the recipient to make alone.

The list above is closed, mirroring the closed "may carry" list before it: coordinates,
task-scope decisions absent from the board, and the return form are the only permitted
content, so anything falling outside all three is excluded by construction, not only by
the named examples above. One artifact-class rule this file deliberately never states is
enumerated in each recipient's own output contract instead — see that contract's own `##
Return Protocol` / `## Output Contract` section, per `docs/conventions.md § Document
classification`.

## Two-halves rule

One rule, stated once, governs both review scope and write scope:

> **The dispatcher never bounds review scope. The contract always bounds write scope.**

**Review half.** A dispatch never tells its recipient to look only at the changed part and
treat the rest as frozen or already-trusted. The dispatch carries a **coordinate** — what
changed, in AC/section terms — and the recipient computes its own review objective from
that coordinate. It never carries a **bound** — an instruction narrowing what the recipient
is allowed to look at. This is not implemented by writing a scope-limiting rule into each
verifier's own contract: no verifier contract gains a review-scope clause under this rule,
because writing the same restriction at every destination would be the enumeration this
single dispatcher-side rule replaces. The safe direction when this half is silent is more
scrutiny, never less — a verifier with no bound reviews everything, which is the fail-safe
this half's removal relies on.

**Write half.** A dispatch's write scope is always bounded — by declared file paths and
tool scoping in the recipient's own contract, never by dispatcher prose. This half is
already canonical and already consumed by pointer from five agent files; it is not
restated here. See `agents/_shared/plan-consolidation.md § "Write-scope on \`01-plan.md\`"`
and § "Write-tool discipline (shared review files)" for the write-half mechanism itself.

## Control rubric

Every claim this file makes about a control it asserts is recorded below instead of left
in prose, so an omission is a visible empty cell rather than an absent sentence. No cell is
left empty; a control this file does not enforce mechanically is `n/a — {why}`, never a
bare dash. `prose-only` is a legitimate `Enforcer` value — several enforcement hooks that
would otherwise back these rules are unwired as of v2.139.0 (`CLAUDE.md § "Hook gates guard
the boundary, not the flow"`), so `prose-only` is the honest state for most rows here, not
an evasion of the rubric's intent.

| Control | Enforcer | Failure direction | Invoker | Read at |
|---|---|---|---|---|
| Canonical rule lives in exactly one file (this one) | Suite 174 no-relocation check | fail-closed — a duplicate in another `ref-*.md`/`_shared/*.md` file is flagged as a defect, not read as "still present, therefore fine" | `python3 tests/test_agent_structure.py` (`/th:lint`, `tests/run-all.sh`) | `tests/test_agent_structure.py:38121-38219` |
| Consumers reference this file by section, never restate its prose | prose-only — no structural duplicate-content check runs per consumer today | n/a — declared limitation, not a gap this file can close alone | n/a — control not yet mechanically invoked | n/a — control new, no prior enforcement site |
| Review-scope half: a dispatch carries a coordinate, never a bound | prose-only | fail-open toward more scrutiny — a verifier reading a dispatch with no bound reviews the whole artifact, which is the safe default this half is built on | the dispatching agent itself (`th:leader`, orchestrator), self-applied at prompt-construction time | n/a — control new, generalized from the removal this PR performs at its five prior sites |
| Write-scope half: bounded by the recipient's own contract, by pointer only | header-survival check (full-file-loss detection) + `Edit`-only-existing-file discipline (self-applied, not independently checked) | the header-survival check catches a full-file loss; a content corruption that leaves every heading intact is a residual the write-tool discipline names but does not mechanically detect | orchestrator (`agents/orchestrator.md § "Header-survival check (panel dispatch integrity)"`), around every panel dispatch on a shared review file | `agents/_shared/plan-consolidation.md:44`, `:60` |
| Closed "may carry" / "must not carry" lists exclude any content outside the three permitted items, by construction | prose-only — verified by direct read, not a grep suite | n/a — a closed-list boundary is a structural property of this file's own text, checked by the reader (`qa` validate mode / plan-reviewer) at the acceptance-criteria level | `qa` (validate) / plan-reviewer, reading this file directly | n/a — control new, scoped to this file's own text |
| Scope-injection rule: a dispatch never introduces new scope, only points at the board | prose-only — the recipient self-applies the report-and-route response | fail-safe toward escalation, never silent absorption or silent rejection — an out-of-board request always surfaces to the dispatcher | the dispatched recipient itself, on receiving an out-of-board request | n/a — control new, generalized from the recurring board-vs-dispatch drift this rule closes |

**Limit of the mechanism, stated and not hidden.** This rubric makes an omission visible —
an empty cell, a missing row — it does not detect an incorrect entry. A `prose-only` value
being the honest current state does not mean it should stay that way forever; it means a
reader can see exactly which controls here rest on prose discipline alone and decide
whether that is acceptable for a given change, rather than discovering it by surprise.

## Attribution

This file's decisions come from failures observed in this repository's own pipeline runs —
not from any single external article. Where a decision echoes context-engineering guidance
written for a single-agent assistant, that guidance does not address multi-agent
orchestration and is not cited here as authority for any of the choices above; what is
credited is the general governance instinct behind that guidance (say the rule once, in one
place, and let every consumer point at it), applied to a problem that guidance itself does
not cover.

## How to reference this file

In `agents/leader.md` or `agents/orchestrator.md`, replace inline dispatch-content prose
with a one-line cross-reference:

```
**Dispatch contract:** see `agents/_shared/dispatch-contract.md` for what a dispatch may
and must not carry, and the two-halves scope rule (review scope never bounded by the
dispatcher; write scope always bounded by the recipient's own contract).
```

Do not re-derive or paraphrase the rule set inline — this file is the single source of
truth for it.
