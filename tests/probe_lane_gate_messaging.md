# Probe M3 — Gate Messaging Round-Trip (Panel Resume + Dual-Record)

> **SUPERSEDED — design pivot (retained as historical record).** This probe specifies the now-retired *gate-blind* design, in which the operator replied to a paused orquestador **in the orquestador's own subagent panel** (direct in-session-subagent messaging), and that same subagent resumed as sole witness and recorder. That premise proved unreachable in real clients — herdr and other TUIs expose no reachable in-session-subagent reply path, and a paused subagent is reaped — so the gate-blind design **deadlocked**. Gates are now **líder-mediated**: the orquestador returns a `gate_pending` status; `th:lider` **presents** the gate **inline** in the operator's main conversation (reachable) and **relays** the operator's verbatim decision back to the orquestador, tagged `lider-relayed-operator`, which records the dual-record. The live in-session-subagent messaging property this probe targets is therefore **no longer load-bearing**, and M3 is **no longer the FATAL constraint**; the capability floor is now the parent→child spawn-and-resume path (Claude Code ≥ v2.1.199 — `th:lider` resuming a dormant orquestador to deliver a relayed decision). See `agents/_shared/gate-contract.md § "preparer + recorder ... presenter + relayer"` and `agents/lider.md § "Gate mediation"`. The original probe body below is retained verbatim as historical record.

**Probe ID:** M3
**Feeds:** `tests/evidence/nested-lane-probes.md`, `01-plan.md` AC-7.2, capability-floor `probe_result` (Task-9)
**Format:** mirrors `tests/probe_nested_dispatch.md` (M1).
**Cross-references:** `research/00-test-plan.md` scenarios WS-2 (presenter==witness==recorder==sole-writer at depth), WS-3 (dual-record atomicity), GBL-2/GBL-3 (gate-blindness), RF-6 (this probe's own definition in the test-plan).

## Objective

Verify the mechanism the entire gate seam redesign depends on (`01-plan.md § "The gate seam — welded inside the orquestador"`): a th:orquestador subagent, paused at a synthetic STOP it emitted **in its own transcript**, resumes with context intact when the operator replies **in that same transcript** (subagent-panel direct messaging — not a top-level relay), and then writes both halves of the dual-record (`gateN_release` field + `stage.gate.release` event) atomically as the one who witnessed the reply.

This is the probe that closes the loop the plan calls "`presenter == witness == recorder == sole-writer`" — the FATAL constraint the split's whole gate-blind líder design rests on.

## Why this probe has no spike precursor

`research/spike-probe-evidence.md` covers PreToolUse hook firing at depth (Write/Bash) — a different mechanism. It does **not** exercise SendMessage-style panel resume of a paused subagent, because the spike's scope was the outward-gate hardening question (M2's precursor), not the gate-messaging question. This gap is why M3 is registered as **REQUIRES-LIVE-RUN in full** — there is no partial deterministic-test decomposition available the way M2 has (Part A/Part B split), because the property under test (a human typing into a specific subagent's own panel, and that subagent resuming with its prior context) is not something a headless hook invocation can simulate.

The `01-plan.md § Documentation Consulted` note records the platform capability this probe exercises: "mensajería directa full-tree (v2.1.193+)" and "SendMessage resume de subagente detenido (v2.1.199+)" — both dated platform features, not yet empirically exercised by this initiative before this probe.

## Method (operator-run; REQUIRES-LIVE-RUN)

1. Dispatch a th:orquestador-shaped subagent for a trivial synthetic task.
2. Have it reach a point where it emits a STOP-block matching the `agents/_shared/gate-contract.md` template (Task-1) for one of the three STAGE-GATEs, in its **own** transcript, and halt (no further tool calls) — mirroring the "presenter" half of the contract.
3. The operator replies **in that subagent's own panel** (not the top-level líder transcript) with a value from the gate's closed allowlist (e.g., `approve` for STAGE-GATE-1).
4. Observe:
   - **(a) Context retention on resume.** Does the subagent's next action correctly reference the state it had before the STOP (e.g., does it proceed to the correct next phase, not restart or lose the boundary it was gating)?
   - **(b) Witness identity.** Is the reply consumed by the SAME subagent that emitted the STOP (panel-scoped), not relayed through or re-interpreted by the top-level líder?
   - **(c) Dual-record write.** After the reply is consumed, does the subagent write BOTH halves atomically — the `gateN_release` field in its own `00-state.md` AND the `stage.gate.release` event in its own events file — in the same phase-transition write, per the gate-contract's atomicity rule?
5. Repeat for at least one more gate (ideally all three: STAGE-GATE-1 `approve`, STAGE-GATE-2 `next`, STAGE-GATE-3 `ship`) to confirm the mechanism generalizes, not a one-gate coincidence.

## What IS deterministically verifiable, post-hoc (not live-only)

Step 4(c) — the dual-record's **atomicity property** (never a half-written record: field-without-event or event-without-field reads as NOT-cleared) — is separately covered by a fully deterministic fixture-based test once `agents/_shared/gate-contract.md`'s recover predicate is implemented (test-plan.md WS-3, `tester`-owned `deterministic-test`, out of Task-7's file scope — it lands with the recover predicate itself). M3's live run does not need to re-derive that property from scratch; it only needs to confirm the LIVE write actually lands both halves (a file-diff / `cat 00-state.md` + events-file check after Step 5, which is a cheap deterministic assertion ON TOP OF a live run — not a live-run property itself).

## Results

| # | Check | Method | Status | Source |
|---|---|---|---|---|
| M3.1 | Subagent resumes with context intact after a panel reply to its own STOP | Live (Step 4a) | **REQUIRES-LIVE-RUN** — no prior probe or spike exercises SendMessage-resume of a paused subagent | none (gap, see above) |
| M3.2 | Reply is witnessed by the SAME subagent that emitted the STOP (panel-scoped, no top-level relay) | Live (Step 4b) | **REQUIRES-LIVE-RUN** | none |
| M3.3 | Dual-record (`gateN_release` field + `stage.gate.release` event) is written atomically by the witnessing subagent, in its own `00-state.md`/events file | Live (Step 4c) + post-hoc file-diff (deterministic once observed) | **REQUIRES-LIVE-RUN** for the live write; the atomicity INVARIANT itself is separately deterministic-test-covered (test-plan.md WS-3, out of Task-7 scope) | test-plan.md WS-3 (deterministic-test, separate task) |

## Verdict

**M3 is REQUIRES-LIVE-RUN in full.** Unlike M2 (which splits into an automated decision-logic half and a live firing-confirmation half), M3's core property — a human typing into a specific nested subagent's own panel and that subagent both resuming correctly AND being the one who writes the release — has no deterministic decomposition; it is the platform capability itself (subagent-panel direct messaging + resume) being probed, not a piece of this repo's own logic. The operator-confirmed result feeds `probe_result` in Task-9's capability cache, version-pinned to the CC build the confirmation ran against (`01-plan.md` AC-9.4 / AC-10.3).

## Caveats

- If Step 4(b) shows the reply was instead consumed by the líder (top-level) rather than the orquestador subagent's own panel, this is a **probe FAIL**, not a soft finding — it falsifies the FATAL gate-blind constraint the whole split design rests on and blocks the capability floor from ever returning PASS (`01-plan.md § "The gate seam"`).
- A probe that reports PASS without the operator having personally observed the panel exchange (self-attested by an agent) is explicitly disallowed by `01-plan.md`'s framing ("Probe PASS auto-atestado... rechazado", `research/00-test-plan.md` RF-6) — M3's PASS requires operator confirmation, not agent self-report.
