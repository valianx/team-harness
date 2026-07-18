# Probe M4 — Concurrency (N≥2 Lanes) + Legit-Spawn Bash-Traversal

**Probe ID:** M4
**Feeds:** `tests/evidence/nested-lane-probes.md`, `01-plan.md` AC-7.3, AC-6.3/AC-6.5 (carve-out disposition), capability-floor `probe_result` (Task-9)
**Format:** mirrors `tests/probe_nested_dispatch.md` (M1).
**Cross-references:** `research/00-test-plan.md` scenarios MO-1, MO-2, MO-3, HF-5, HF-6, HF-7, RF-6; `tests/probe_nested_dispatch.md` (M1, prior probe, directly reused for part (a)).

## Objective

Three distinct questions, of different automatability classes:

- **(a)** A depth-1 orchestrator retains `Task` and completes a dispatch to a depth-2 specialist.
- **(b)** N=2 concurrent orchestrators (one per lane/project) do not cross-contaminate cwd or trace-file attribution.
- **(c)** Whether the legitimate top-level orchestrator spawn traverses the `Bash` tool — this is not a live-observation question, it is answerable by static code inspection, and it directly decides whether `policy-block`'s anti-forgeable carve-out (AC-6.5) is even reachable on the split path (AC-6.4).

## Part (a) — depth-1 retains Task, completes depth-2 dispatch

**Status: ANSWERED — prior-probe-sourced (M1), not a new live run needed.**

`tests/probe_nested_dispatch.md` (M1, dated 2026-06-14, branch `refactor/general-agent-orchestrator`) already probed exactly this shape at the CC-foreground-path level: a nested subagent retained `Task` and successfully spawned a sub-subagent one level deeper (PONG round-trip). M1's verdict ("SUCCESS — inner Task retained and executed successfully... obsolete on the CC foreground path" for the anti-recursion-strip premise) directly answers M4(a): the platform does not strip `Task` from a depth-1 subagent, so a depth-1 orchestrator dispatching a depth-2 specialist is not blocked by the harness.

M4(a) does not need to re-run M1's probe from scratch; it re-uses the result and narrows the claim to the split's specific role shape (orchestrator dispatching a specialist, not a generic subagent spawning a generic sub-subagent) for the evidence artifact's per-role table.

| Check | Method | Status | Source |
|---|---|---|---|
| Depth-1 subagent retains `Task` | Prior probe (M1) | **CONFIRMED — prior-probe-sourced** | `tests/probe_nested_dispatch.md` |
| Depth-1 subagent completes a depth-2 dispatch | Prior probe (M1, PONG round-trip) | **CONFIRMED — prior-probe-sourced** | `tests/probe_nested_dispatch.md` |
| Same result holds specifically for an orchestrator-shaped depth-1 node dispatching a specialist-shaped depth-2 node (role-specific re-confirmation) | Live (thin re-confirmation, cheap) | **REQUIRES-LIVE-RUN** (low-cost — a role-labeled repeat of an already-proven mechanism, not a new capability question) | none yet — expected to be a formality given M1 |

## Part (b) — N=2 concurrent orchestrators, no cwd / trace cross-contamination

**Status: split between deterministic (hook-level, already covered) and live (E2E, requires a run).**

The hook-level non-cross-fire guarantees this depends on are already deterministically tested, independent of any live nested dispatch:

| Check | Method | Status | Source |
|---|---|---|---|
| `checkpoint-guard` `TH-STATE-REF`: two concurrent non-terminal pipelines never cross-fire a gate boundary regardless of mtime ordering | Deterministic test (Task-4) | **CONFIRMED — deterministic test, 34/34 passing** | `tests/test_checkpoint_guard.sh` cases 29 (AC-4.4), mirrors test-plan.md HF-5 |
| `checkpoint-guard` containment (CWE-22) holds in both local and obsidian roots — an out-of-root/attacker marker never redirects gate state | Deterministic test (Task-4) | **CONFIRMED — deterministic test** | `tests/test_checkpoint_guard.sh` cases 30-34 (AC-4.5/4.6), mirrors test-plan.md HF-6 |
| `subagent-start`/`subagent-trace` `TH-LANE` charset-bounded, no mis-pairing/injection between two lanes' breadcrumb files | Deterministic test (Task-5) | **CONFIRMED — deterministic test** | `tests/test_subagent_start.sh` Section 5, mirrors test-plan.md HF-7 |

What those deterministic tests do **not** cover — because it requires a real live pair of concurrent Claude Code subagent processes, not a hook invoked against a synthetic payload — is the full E2E claim: two REAL concurrent orchestrator subagents (distinct repos or distinct lanes of the same repo), each actually issuing `git -C {repo}` commands and writing to its own `00-state.md`, never touching the other's cwd or state file, with disjoint author/agent-id attribution in the resulting diffs (test-plan.md MO-2, `qa`-owned `behavioral-scenario`).

| Check | Method | Status | Source |
|---|---|---|---|
| N=2 live concurrent orchestrators: `00-state.md` of lane A is edited ONLY by orchestrator-A, lane B's ONLY by orchestrator-B (disjoint attribution); git ops target the correct repo per lane (no cross-repo commit) | Live (N=2 real dispatch) | **REQUIRES-LIVE-RUN** | none yet — test-plan.md MO-2 registers this as a `behavioral-scenario`, not yet executed |
| Cost/wall-clock amortization claim (N orchestrators in parallel vs. serial) — informational, not a correctness gate | Live (N=2 real dispatch) | **REQUIRES-LIVE-RUN**, informational only | `01-plan.md § Performance Assessment` |

## Part (c) — does the legitimate top-level spawn traverse the Bash tool?

**Status: ANSWERED — deterministic code inspection, no live run needed. This is the finding that directly feeds AC-6.3/AC-6.5's carve-out disposition.**

This question is not "what happens at runtime" — it is "what does the current spawn mechanism's source say", which is fully answerable by reading the repo:

- The **legacy/tmux top-level orchestrator spawn** (`agents/orchestrator.md:4040-4047` at the time Task-6 ran, pre-split) is confirmed — by direct grep and by Task-6's own implementation record — to invoke `claude --dangerously-skip-permissions` via `Bash` (a shell-out to a new `claude` process, not the native `Task` tool). `hooks/ts/bodies/policy-block.ts`'s `LEGACY_TMUX_SPAWN_RAW` literal was extracted programmatically from that exact text and round-trip-verified byte-for-byte (`02-implementation.md` Task-6 § Documentation Consulted). This is why AC-6.5's anti-forgeable carve-out exists at all: the legacy path genuinely needs a Bash-based exemption, because it genuinely spawns via Bash.
- The **split-native path** (orchestrators spawned by the leader, post-Task-2) is designed to spawn via the `Task` tool directly, not Bash — `01-plan.md § "Roles y fases"` and AC-6.4 state this as the design intent. This part of the finding is **NOT YET independently verifiable in this worktree**: Task-2 (which writes the actual leader spawn instruction into `agents/leader.md`) has not landed here — Task-7 depends on Task-4/5/6, not Task-2, so the split-native spawn text does not exist yet to grep. AC-6.4's `policy-block` deny is written to hold TRULY unconditionally on that path (zero exemptions) BECAUSE no Bash `claude` invocation is expected to exist there — but that expectation, for the split-native path specifically, is a design commitment, not yet a grep-verified fact, until Task-2 lands in the same branch.

| Check | Method | Status | Source |
|---|---|---|---|
| Legacy top-level spawn traverses Bash (confirmed, needs the anti-forgeable carve-out) | Static code inspection (grep + programmatic extraction) | **ANSWERED — deterministic, code-inspection-sourced** | `agents/orchestrator.md:4040-4047` (pre-split); `hooks/ts/bodies/policy-block.ts` `LEGACY_TMUX_SPAWN_RAW`; `02-implementation.md` Task-6 |
| Split-native leader→orchestrator spawn does NOT traverse Bash (zero exemptions needed there) | Static code inspection, once `agents/leader.md` exists | **PENDING — Task-2 not yet landed in this worktree.** Design commitment stated in `01-plan.md`, not yet grep-verifiable here. Re-run this check once Task-2/Task-3 land in the same branch (they are part of the same all-tasks-one-pr delivery, so this becomes verifiable before the PR closes). | `01-plan.md § "Roles y fases"`, AC-6.4 |

## Results summary (feeds evidence artifact)

| # | Sub-check | Status |
|---|---|---|
| M4.a.1 | Depth-1 retains `Task`, completes depth-2 dispatch (generic shape) | CONFIRMED — prior-probe-sourced (M1) |
| M4.a.2 | Same, role-specific (orchestrator→specialist) re-confirmation | REQUIRES-LIVE-RUN (low-cost) |
| M4.b.1 | `checkpoint-guard` no cross-fire (hook-level) | CONFIRMED — deterministic test |
| M4.b.2 | `checkpoint-guard` CWE-22 containment (hook-level) | CONFIRMED — deterministic test |
| M4.b.3 | `TH-LANE` no mis-pairing/injection (hook-level) | CONFIRMED — deterministic test |
| M4.b.4 | N=2 live concurrent orchestrators, disjoint state-file attribution (E2E) | REQUIRES-LIVE-RUN |
| M4.c.1 | Legacy spawn traverses Bash (carve-out needed there) | ANSWERED — code-inspection |
| M4.c.2 | Split-native spawn does NOT traverse Bash (zero exemptions there) | PENDING Task-2 landing in this branch, then ANSWERED by code-inspection (not a live-run question) |

## Verdict

M4 is the most heterogeneous of the three probes: part (a) is effectively already closed by the prior M1 probe with only a cheap role-specific re-confirmation outstanding; part (b) has its hook-level guarantees fully closed deterministically, with only the full E2E multi-process claim requiring a live run; part (c) is answerable by static inspection alone and does not require a live run at all — it requires Task-2 to land in the branch so the split-native spawn text exists to grep. None of M4's REQUIRES-LIVE-RUN items are blocking for the capability floor in the way M3 is (M3 is the FATAL-constraint probe); M4's live items are confirmatory/E2E-completeness checks layered on top of already-strong deterministic and prior-probe evidence.

## Caveats

- M4(c)'s "PENDING Task-2" disposition is a within-PR sequencing fact, not a probe failure — Task-7's own file scope (`tests/probe_lane_concurrency.md`, `tests/evidence/nested-lane-probes.md`, `docs/testing.md`) does not include `agents/leader.md`/`agents/orchestrator.md` (Task-2's files), so this probe cannot itself close M4.c.2; it documents the check so whoever runs it after Task-2 lands (in this same branch, before the all-tasks-one-pr delivery) knows exactly what to grep for.
- The N=2 concurrency claim in M4(b) is about **distinct-repo** lanes primarily (test-plan.md MO-2's `given`); the same-repo multi-project fallback (batch contract, `docs/parallel-batch-implementation.md`) is a different concurrency model entirely and is out of this probe's scope.
