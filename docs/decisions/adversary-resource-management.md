# Decision Log — Adversary Resource Management (v2.132.1)

This document records the design decisions made during the `adversary`-cost-reduction and trigger-tightening reform shipped in v2.132.1 (GitHub issue #498). The workspace analysis lives in `workspaces/adversary-resource-management/` (gitignored); this file is the committed reference for the three material design forks resolved across Stage 1's panel rounds and the operator's STAGE-GATE-1 disposition.

Q-1 covers the per-round report file format. Q-2 covers the `changes_security_control` producer. Q-3 covers the confidence-based trigger branch that was proposed, implemented, and reverted within the same Stage 1.

---

## Q-1 — Adversary report file format: per-round files vs Edit-append

**Question:** `adversary`'s pre-existing single-file `Write` to `reviews/04-adversary.md` caused a recorded incident (PR #494): a multi-round verify run exceeded the 64k output-token cap, and the retry-with-concision `Write` silently overwrote 4 prior rounds. How should the report-file format close this class of defect?

**Options considered:**
- (a) One immutable file per round, `reviews/04-adversary-r{N}.md` — a `Write` to a new path each round, with a deterministic read-before-write collision check and a post-round integrity scan. [DEFAULT]
- (b) `Edit`-append to the existing single `reviews/04-adversary.md`, appending each round's delta rather than reconstructing the whole file.

**Decision:** (a) was selected — one immutable file per round.

**Rationale:** Option (b) would require granting `adversary` the `Edit` tool. `adversary` is structurally read-only by design (`READ_ONLY_AGENTS`, pinned by `tests/test_agent_structure.py` s125/AC-15i) — its only write capability is `Write` to its own report, and even that write never touches source code. Adding `Edit` to close a reporting defect would be a security regression on an agent whose entire mandate depends on a read-only trust boundary. Per-round files make the original overwrite class structurally impossible (a given `N` never accepts a second `Write` — the read-before-write step returns `status: blocked` on a detected collision instead of proceeding) without adding any new tool capability.

---

## Q-2 — `changes_security_control` producer: architect-declared vs orchestrator-computed vs security-declared

**Question:** The new `adversary_floor_applies` predicate narrows `adversary`'s Phase-3 trigger to a strict subset of `security_floor_applies` — the subset that additionally *changes a security control* (a guard, gate, auth-check, floor, waiver, or kill-switch). Who declares whether a given diff changes a security control?

**Options considered:**
- (a) The `architect`, in its Classification block, as a 9th boolean (`changes_security_control`) alongside the 8 existing ones — fail-closed to `true` on absence or doubt. [DEFAULT]
- (b) The orchestrator, computed mechanically (e.g., via a keyword/path-pattern scan of the diff, mirroring the `security_sensitive` backstop).
- (c) The `security` agent, as part of its own Phase-3 audit output.

**Decision:** (a) was selected — architect-declared, fail-closed.

**Rationale:** "Changed a security control" is a semantic judgment about design intent, not a lexical property of the diff — option (b) is not reliably grep-able (a keyword scan both over- and under-fires on this kind of question; the existing `security_sensitive` path-pattern backstop is deliberately a coarser, path-level signal, not a control-level one). Option (c) would couple `adversary`'s own trigger to `security`'s verdict, collapsing the deliberate structural separation between the two lenses (`security` seeks a GO, `adversary` seeks to break the design — see `agents/adversary.md § Boundary with the Existing Security Agent`) and creating a circular dependency at dispatch time. The architect is the agent that already reasons about the design's control surface during Stage 1, making it the natural producer. The fail-closed default (absence or doubt → `true`) closes the producer-site-omission false-green class recorded from PR #481. A diff-grounded one-line justification is required when `security_sensitive: true AND changes_security_control: false` is declared, derived from the actual changed surface — never from the reporting issue/PR's own characterization of the change (this repo's §6.6 untrusted-content floor).

---

## Q-3 — Confidence-based OR-branch: plan-level trigger vs revert

**Question:** Mid-Stage-1, the operator directed exploring a second, independent trigger for `adversary`: fire when the architect's own design confidence score is below 7, regardless of security sensitivity — `adversary_floor_applies = (security_floor_applies AND changes_security_control) OR (design_confidence < 7)`. The architect implemented this, and it was reviewed across a full Stage-1 panel round. Should it ship?

**Options considered:**
- (a) Ship the OR-branch as designed — plan-level `design_confidence` (the architect's existing single per-plan score, not a new per-task field), fail-closed to `true` on absence.
- (b) Revert the OR-branch entirely, keeping the pure AND-form (`adversary_floor_applies = security_floor_applies AND changes_security_control`); defer a confidence-based trigger to future work. [DEFAULT — operator decision at STAGE-GATE-1]

**Decision:** (b) was selected — the OR-branch was reverted.

**Rationale:** Two independent problems, not one. First, **wrong grain**: the architect's confidence score is per-plan, not per-task — a single low-confidence plan would fan `adversary` out to *every* task in that plan, including ones with no elevated risk, eroding the R1 cost-reduction target further than the plan-level design ever disclosed credibly (the architect's own honest reassessment moved R1's confidence from MEDIA to LOW once the OR-branch was active). Second, **an ungoverned self-reported signal**: unlike `changes_security_control` (Q-2), which gained a diff-grounded-justification requirement specifically to prevent a confident-but-wrong `false` declaration, `design_confidence` had no equivalent anti-gaming discipline — a report of `confidence: 7+` from the same architect whose design is under review would silently suppress the trigger, with no compensating control. The revert is a full, verified removal (not a suppression): the architect's own bounded-patch re-audited the entire `agents/orchestrator.md` file for every branch that force-sets `security_sensitive`, confirmed no residual reference to `design_confidence` as a predicate input survives, and restored the pure AND-form and the `adversary ⊆ security` framing everywhere it had been rewritten. A **per-task** confidence/risk trigger — same discipline as `changes_security_control` (per-task grain, evidence-grounded justification, anti-gaming) — remains a deferred follow-up, to be specified only after a representative live pipeline run measures R2-R5's actual cost effect (see `docs/adversary-cost-model.md`).

---

## Related

- `docs/adversary-cost-model.md` — the R1 cost accounting and the deferred live-measurement plan referenced in Q-3's rationale.
- `docs/pipeline-lanes.md § 7` — the two-lens floor site where `adversary ⊆ security` (Q-1/Q-2's combined result) is documented for the orchestrator's own dispatch logic.
- `00-decision-ledger.md` (workspace, gitignored) — the full STAGE-GATE-1 reject/revert/re-approve sequence for Q-3, including the operator's exact relayed wording at each step.
