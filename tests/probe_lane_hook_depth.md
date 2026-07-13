# Probe M2 — Hook Firing at Subagent Depth + Target-Aware Decision

**Probe ID:** M2
**Feeds:** `tests/evidence/nested-lane-probes.md`, `01-plan.md` AC-7.1, capability-floor `probe_result` (Task-9)
**Format:** mirrors `tests/probe_nested_dispatch.md` (M1).
**Cross-references:** `research/spike-probe-evidence.md` (empirical firing evidence, pre-gate); `research/00-test-plan.md` scenarios HF-1, HF-4, HF-5, HF-6.

## Objective

Verify three properties the split's gate-seam and outward-gate hardening depend on:

1. **Hooks fire at subagent depth ≥2.** A specialist dispatched by an orchestrator subagent (itself a subagent of the leader) is a depth-≥2 node. `policy-block` and `dev-guard` (PreToolUse) must still fire for that node's tool calls — not only for depth-0/depth-1 calls.
2. **The hook's payload cwd tracks the nested subagent's own shell cwd**, including across a `git -C {repoB}` redirection to a repo distinct from the dispatching process's cwd (the SEC-DR-2-relevant check).
3. **Post-Task-6, the DECISION reflects the resolved target** (`-C {dir}`, `--repo owner/repo`, refspec destination) — not the payload cwd alone.

## Method — two parts, split by automatability

### Part A — deterministic, automated (target-aware decision LOGIC)

This part does **not** require a live nested dispatch. It invokes the compiled hook directly (`node hooks/ts/dist/dev-guard.cjs`) against controlled JSON payloads that vary `-C {dir}`/`--repo`/refspec, exactly as `tests/test_dev_guard.sh` Suite 83e already does (Task-6, 18 new cases, 148/148 passing at authoring time). This proves the DECISION FUNCTION is target-aware and fail-closed (`ask` on non-resolvable target, never silent `allow`). It does **not** by itself prove the hook is invoked correctly at subagent depth ≥2 by the live Claude Code harness — that requires Part B.

Automated coverage already exists and is not duplicated here:

| Check | Source | Result |
|---|---|---|
| `-C {dir}` push, non-default resoluble dest | `tests/test_dev_guard.sh` Suite 83e(a) | ALLOW |
| `-C {dir}` push, dest = default (`main`) of the TARGET dir (not payload cwd) | `tests/test_dev_guard.sh` Suite 83e(b) | ASK |
| `-C {dir}` disqualifying flag / tag-like dest | `tests/test_dev_guard.sh` Suite 83e(c)/(d) | ASK |
| `-C {nonexistent-dir}`, non-default dest | `tests/test_dev_guard.sh` Suite 83e(e) | ASK (non-resolvable, never allow) |
| bare `-C {dir} push` (no refspec) | `tests/test_dev_guard.sh` Suite 83e(f) | resolves against the TARGET dir's current branch, not payload cwd |
| `gh --repo owner/repo <verb>` (interspersed before subcommand) | `tests/test_dev_guard.sh` Suite 83e gh cases | routed correctly (not silently `none()`) |

### Part B — live nested-dispatch firing check (REQUIRES-LIVE-RUN)

Headless CI cannot spawn a real Claude Code `Task`-tool subagent tree, so the depth-≥2 firing fact and the cwd-tracking-across-`-C` fact must be observed in a live session. This is the part that formalizes the spike's empirical result (`research/spike-probe-evidence.md`) at the specific depth shape the split introduces (leader → orchestrator subagent → specialist subagent = depth 2 for the specialist).

**Steps (operator-run, or automated once a scripted `claude -p` harness exists for nested dispatch):**

1. From a top-level session, dispatch an orchestrator-shaped subagent (depth 1).
2. Have that subagent dispatch a specialist subagent (depth 2) with an instruction to run `git -C {repoB} push origin {non-default-branch}`, where `{repoB}` is a real git repo distinct from the top-level process cwd.
3. Capture: (a) whether `policy-block`/`dev-guard` PreToolUse fired at all for that Bash call (a decision was returned, vs. no hook invocation observed); (b) the `cwd` field seen by the hook in its own diagnostic/reason output, compared against `{repoB}`; (c) the DECISION returned, compared against the Part-A truth table for the same command shape.
4. Repeat once with a `Write` of a secret-shaped string at depth 2 (mirrors the spike's Write probe, confirms `policy-block` fires — not just `dev-guard`).

## Results

| # | Check | Method | Status | Source |
|---|---|---|---|---|
| M2.1 | `policy-block` Write DENY fires at subagent depth (Write, secret pattern) | Part B (live) | **CONFIRMED — spike-sourced** | `research/spike-probe-evidence.md` §1 ("Write de secreto `ghp_`+36, subagente → BLOQUEADO"). Observed at depth ≥1 (spike ran a single-level nested subagent, not the specific leader→orchestrator→specialist depth-2 shape the split introduces). |
| M2.2 | `policy-block` Bash DENY fires at subagent depth (export of secret) | Part B (live) | **CONFIRMED — spike-sourced** (depth ≥1, top-level shape) | `research/spike-probe-evidence.md` §1 |
| M2.3 | `dev-guard` fires (returns a decision, not silently skipped) for a Bash `git push` at subagent depth | Part B (live) | **CONFIRMED — spike-sourced**, with the method caveat below | `research/spike-probe-evidence.md` §1, §3 — the spike's first pass mis-read an `ask`-auto-satisfied session as "hook not firing"; the corrected reading (direct hook invocation) confirmed the hook DOES fire and resolve `ask`. |
| M2.4 | The hook's payload cwd tracks the nested subagent's own shell cwd (not the top-level process cwd) when redirected via `-C {repoB}` | Part B (live), **depth-2 specialist-under-orchestrator shape specifically** | **REQUIRES-LIVE-RUN** — not yet observed at the exact depth-2 shape the split introduces (leader→orchestrator→specialist). The spike's direct-hook-invocation test (§ "dev-guard invocado directamente") proves the DECISION LOGIC resolves `-C {dir}` correctly when given a payload, but that test fabricated the payload — it did not observe a live nested dispatch's actual payload cwd field. | See `research/spike-probe-evidence.md` §"dev-guard invocado directamente" |
| M2.5 | Post-Task-6, the DECISION reflects the resolved `-C`/`--repo`/refspec target, not payload cwd alone | Part A (automated, deterministic) | **CONFIRMED — deterministic test, 18/18 new cases passing** | `tests/test_dev_guard.sh` Suite 83e (see table above) |

## Verdict

Part A (decision-function correctness) is fully closed by deterministic tests authored in Task-6 — no live run needed for that half. Part B (does the harness actually route depth-2 hook invocations with a payload cwd that matches the nested subagent's real shell cwd) is **REQUIRES-LIVE-RUN**: the spike gives strong prior confidence (hooks fire at depth ≥1 for both Write and Bash, and the decision logic is separately verified correct), but the exact depth-2 leader→orchestrator→specialist shape has not been directly observed. This is the item Task-9 registers as `probe_result` only after operator confirmation.

## Caveats

- The spike ran under a **bridged-child session with a broad Bash auto-allow list** (`CLAUDE_CODE_CHILD_SESSION=1`); `deny`-class floors were hard-enforced even so, but `ask`-class resolutions were auto-satisfied without a human seeing them. M2 Part B should be re-run (or its result interpreted) with this caveat in mind — an `ask` that "ran" in a live probe session may not indicate a human-visible prompt in a normal interactive session (see AC-10.4 ask-class caveat).
- Depth counting convention: this probe treats the leader (top-level, never a subagent) as depth 0, the orchestrator it spawns as depth 1, and a specialist that orchestrator dispatches as depth 2 — consistent with `01-plan.md`'s "profundidad ≥2" framing for AC-7.1.
