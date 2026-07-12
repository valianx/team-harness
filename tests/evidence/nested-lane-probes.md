# Evidence Artifact — Nested-Lane Probes M2/M3/M4 (Operator-Reviewable)

> **SUPERSEDED-CORRECTION (M3 only).** The M3 premise recorded below — the operator replying **in the orquestador's own transcript** (direct subagent-panel messaging) and that subagent resuming as sole witness and recorder — was empirically found **unreachable in the real client** (herdr and other TUIs expose no in-session-subagent reply path; the paused subagent is reaped), which **deadlocked** the gate-blind design. The design pivoted to **líder-mediated** gates: the orquestador returns `gate_pending`; `th:lider` presents the gate inline in the operator's main conversation and relays the operator's verbatim decision (tagged `lider-relayed-operator`) back to the orquestador, which records the dual-record. Treat any M3 "gate-blind" conclusions below as **historical**; the current capability floor is the parent→child spawn-and-resume path (Claude Code ≥ v2.1.199), not direct subagent-panel messaging. The M2, M4, and marker byte-identity rows and all recorded results below are unchanged.

**Feature:** nested-orchestrator-lanes (th:lider / th:orquestador split)
**Task:** Task-7 — Probes M2/M3/M4 + artefacto de evidencia (`01-plan.md` AC-7.1..AC-7.4)
**Purpose:** single structured, operator-reviewable record of what has been OBSERVED (or answered by code inspection) versus what still REQUIRES a live Claude Code run / explicit operator confirmation. This artifact feeds the `probe_result` field of the capability cache that Task-9's gated `/th:setup` step writes (`01-plan.md` AC-9.4, AC-10.3) — the boot capability check that gates whether the split (líder + orquestador subagent panel) runs, or whether the session falls back to the monolithic legacy orchestration.

**Do not treat any row below as PASS until the "Operator confirmation" section at the bottom is filled in and dated against a specific CC `version`.** A probe's OBSERVED column being "CONFIRMED" means evidence exists to review — it does not itself constitute the version-pinned, operator-confirmed `probe_result` Task-9 requires.

## How to read this table

- **CONFIRMED — spike-sourced**: observed empirically in the pre-gate spike (`research/spike-probe-evidence.md`, CC 2.1.206 / th 2.126.0, run 2026-07-10), reused here because it directly answers the check.
- **CONFIRMED — prior-probe-sourced**: observed empirically in an earlier, unrelated probe (`tests/probe_nested_dispatch.md`, M1, 2026-06-14) whose result directly answers the check.
- **CONFIRMED — deterministic test**: proven by an automated, repeatable test in this repo (hook invoked directly against controlled payloads); re-runs on every CI pass, not a one-time observation.
- **ANSWERED — code inspection**: not a runtime/live-behavior question at all — settled by reading the relevant source file(s) directly.
- **REQUIRES-LIVE-RUN**: no deterministic decomposition exists; must be observed in a real Claude Code session by the operator, and the result recorded below with a CC version stamp before it can feed `probe_result`.
- **PENDING (task ordering)**: not yet checkable in this worktree because a dependency task (Task-2/Task-3) has not landed in this branch yet; will become checkable, by one of the methods above, once it does — before the all-tasks-one-pr delivery closes.

## M2 — Hook firing at subagent depth + target-aware decision

Full probe definition: `tests/probe_lane_hook_depth.md`.

| Check | Hook | Depth | OBSERVED | Status | Source |
|---|---|---|---|---|---|
| Write of secret-shaped string denied | `policy-block` | subagent (≥1) | BLOCKED | CONFIRMED — spike-sourced | `research/spike-probe-evidence.md` §1 |
| Bash `export TOK=ghp_...` denied | `policy-block` | top-level | BLOCKED | CONFIRMED — spike-sourced | `research/spike-probe-evidence.md` §1 |
| `git push origin main --dry-run` resolves `ask` (not silent allow) | `dev-guard` | top-level + subagent | `ask` resolved, auto-satisfied by the bridged-child session's broad allow-list (not a human-visible stop in that session) | CONFIRMED — spike-sourced, with the `ask`-auto-satisfaction caveat | `research/spike-probe-evidence.md` §3 |
| `dev-guard` decision logic is target-aware (`-C {dir}`, `--repo`, refspec dest) | `dev-guard` | n/a (direct hook invocation) | 18/18 new deterministic cases pass; non-resolvable target never allows | CONFIRMED — deterministic test | `tests/test_dev_guard.sh` Suite 83e (Task-6) |
| Hook payload cwd tracks the nested subagent's OWN shell cwd across a `-C {repoB}` redirection, at the specific líder→orquestador→specialist depth-2 shape | `dev-guard`/`policy-block` | depth 2 (specialist under orquestador) | not yet observed at this exact shape | **REQUIRES-LIVE-RUN** | none yet — see `tests/probe_lane_hook_depth.md` M2.4 |

## M3 — Gate messaging round-trip (panel resume + dual-record)

Full probe definition: `tests/probe_lane_gate_messaging.md`.

| Check | OBSERVED | Status | Source |
|---|---|---|---|
| Orquestador subagent resumes with context intact after a panel reply to its own STOP | not yet observed | **REQUIRES-LIVE-RUN** | none — no spike precursor exercised SendMessage-resume of a paused subagent |
| Reply is witnessed by the SAME subagent that emitted the STOP (no top-level relay) | not yet observed | **REQUIRES-LIVE-RUN** | none |
| Dual-record (`gateN_release` + `stage.gate.release`) written atomically by the witnessing subagent | not yet observed (live write); atomicity INVARIANT itself is separately deterministic-test-covered | **REQUIRES-LIVE-RUN** for the live write | `research/00-test-plan.md` WS-3 (deterministic, separate task) |

**M3 is the FATAL-constraint probe.** Its result gates the capability floor harder than M2/M4: a FAIL here (reply consumed by the líder instead of the orquestador subagent) directly falsifies the gate-blind design and must block the split from ever reporting `probe_result: PASS`.

## M4 — Concurrency (N≥2 lanes) + legit-spawn Bash-traversal

Full probe definition: `tests/probe_lane_concurrency.md`.

| Check | OBSERVED | Status | Source |
|---|---|---|---|
| (a) Depth-1 subagent retains `Task`, completes a depth-2 dispatch (generic shape) | SUCCESS — inner `Task` retained, PONG round-trip at depth 2 | CONFIRMED — prior-probe-sourced (M1) | `tests/probe_nested_dispatch.md` |
| (a) Same, role-specific (orquestador→specialist) re-confirmation | not yet observed | **REQUIRES-LIVE-RUN** (low-cost) | `tests/probe_lane_concurrency.md` M4.a.2 |
| (b) `checkpoint-guard` no cross-fire between 2 concurrent non-terminal pipelines | 34/34 deterministic cases pass, including the explicit no-cross-fire case | CONFIRMED — deterministic test | `tests/test_checkpoint_guard.sh` (Task-4) |
| (b) `checkpoint-guard` CWE-22 containment (local + obsidian roots) | 34/34 deterministic cases pass, including traversal/symlink-escape fail-open cases | CONFIRMED — deterministic test | `tests/test_checkpoint_guard.sh` (Task-4) |
| (b) `TH-LANE` charset-bounded, no mis-pairing/injection across 2 lanes | 42/42 deterministic cases pass | CONFIRMED — deterministic test | `tests/test_subagent_start.sh` (Task-5) |
| (b) N=2 LIVE concurrent orquestadores, disjoint `00-state.md` attribution, no cross-repo commit | not yet observed | **REQUIRES-LIVE-RUN** | `research/00-test-plan.md` MO-2 |
| (c) Legacy top-level spawn traverses Bash (carve-out needed there) | confirmed by grep + programmatic byte-for-byte extraction | ANSWERED — code inspection | `agents/orchestrator.md:4040-4047` (pre-split); `hooks/ts/bodies/policy-block.ts` `LEGACY_TMUX_SPAWN_RAW` |
| (c) Split-native líder→orquestador spawn does NOT traverse Bash (zero exemptions needed there) | `agents/lider.md` dispatches `th:orquestador` via the native `Task` tool ("Spawning an orquestador — the payload contract"); no `Bash`-launched `claude` spawn exists on this path | ANSWERED — code inspection (Task-2/Task-3 landed) | `agents/lider.md § Spawning an orquestador`, AC-6.4 |

## Marker byte-identity (AC-7.4, structural)

A dedicated deterministic script, `tests/test_lane_marker_identity.py`, asserts that the marker literals `TH-STATE-REF:` and `TH-LANE:` are byte-identical between the parser side (`hooks/ts/bodies/checkpoint-guard.ts`, `hooks/ts/bodies/subagent-start.ts` — both landed, Task-4/Task-5) and the injector side (`agents/orquestador.md`, `agents/lider.md` — Task-2/Task-3, now landed). The injector split is asymmetric by design: `agents/orquestador.md` stamps `TH-STATE-REF` on specialist dispatches (cross-fire scoping), and `agents/lider.md` stamps `TH-LANE` on the orquestador spawn (lane attribution) — the two hooks each read line 1 only, so the markers are emitted at different boundaries, never sharing a first line. Registered as Suite 151 in `docs/testing.md` (see below); wired into `tests/run-all.sh`.

| Check | OBSERVED | Status |
|---|---|---|
| Parser anchors `^TH-STATE-REF:` (checkpoint-guard.ts) | present | CONFIRMED — deterministic |
| Parser anchors `^TH-LANE:` (subagent-start.ts) | present | CONFIRMED — deterministic |
| Injector (`agents/orquestador.md`) carries the identical `TH-STATE-REF:` literal | specialist-dispatch controlled header stamps `TH-STATE-REF: {docs_root}/00-state.md` | CONFIRMED — deterministic (Suite 151, 6/6) |
| Injector (`agents/lider.md`) carries the identical `TH-LANE:` literal | orquestador-spawn controlled header stamps `TH-LANE: {project}` (multi-project) | CONFIRMED — deterministic (Suite 151, 6/6) |

## Summary — what still requires a live CC run / operator confirmation

| Probe | Item | Blocking for capability floor? |
|---|---|---|
| M2 | Payload-cwd tracking at the exact depth-2 shape (`-C {repoB}` from a specialist under an orquestador) | Yes — feeds `probe_result` |
| M3 | Full round-trip: panel resume + witness identity + live dual-record write, for at least STAGE-GATE-1 (ideally all three gates) | **Yes — FATAL-constraint probe, hardest blocker** |
| M4 | Role-specific depth-1→depth-2 re-confirmation (low-cost, high prior confidence from M1) | Confirmatory, not blocking on its own |
| M4 | N=2 live concurrent orquestadores, disjoint state-file attribution (E2E) | Confirmatory (hook-level guarantees already deterministic) |
| M4 | Split-native spawn Bash-traversal (once Task-2 lands) | Not a live-run item — becomes ANSWERED by code inspection once Task-2/3 land in this branch |
| AC-7.4 | Marker byte-identity, injector side | CONFIRMED — Task-2/3 landed; `tests/test_lane_marker_identity.py` (Suite 151) passes 6/6, no live run needed |

## Operator confirmation

This section is intentionally left for the operator to complete, per `01-plan.md` AC-9.4 ("un paso gateado registra el `probe_result` SÓLO tras que el operador confirme el artefacto de evidencia... nunca auto-escrito por un agente"). No agent writes to this section.

**Relationship between the fields below (read before filling).** `Overall probe_result: PASS` REQUIRES `M3 ... result: PASS` — M3 is the FATAL-constraint probe (the gate-messaging round-trip the whole gate-blind split rests on), so `Overall` can never be PASS while M3 is FAIL or not-run. The boot capability check (`agents/lider.md § Boot capability check`) gates specifically on M3 via this rule; M2 and M4 REQUIRES-LIVE-RUN items are confirmatory and do not, on their own, block `Overall` unless you decide otherwise.

- **Confirmed by:** _(operator name/handle)_
- **Date:** _(YYYY-MM-DD)_
- **CC version observed against:** _(e.g., 2.1.206 — must match the `version` pinned by the boot capability check, per AC-9.4/AC-10.3 version-invalidation)_
- **M2 REQUIRES-LIVE-RUN item — result:** PASS / FAIL / not run
- **M3 REQUIRES-LIVE-RUN items — result:** PASS / FAIL / not run
- **M4 REQUIRES-LIVE-RUN items — result:** PASS / FAIL / not run
- **Overall `probe_result`:** PASS / FAIL

**Re-confirmation trigger:** per AC-10.3, a mismatch between the CC `version` recorded here and the CC version actually running invalidates this confirmation and forces a hard-STOP + re-confirmation before the split path is used again.
