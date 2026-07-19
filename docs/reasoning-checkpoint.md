# Reasoning Checkpoint — Contract

The reasoning checkpoint is a reusable gate that the leader and orchestrator apply at three pipeline boundaries to ensure the operator has provided a fresh advance signal **and** a confirmed functional-clarity artifact before any phased dispatch proceeds.

This document is the authoritative contract, referenced by `agents/leader.md` (the Discover B1 confirmation) and `agents/orchestrator.md` (the Phase 1 B1 arming and the B2/B3 disposition); see § "Under the leader/orchestrator split" below.

---

## Boundaries

| ID | Boundary | Before advancing to… | Clarity artifact required (floor) |
|----|----------|---------------------|-----------------------------------|
| B1 | intake → plan | dispatch of `th:architect` (Phase 1) | confirmed functional statement ("what we are building, functionally") |
| B2 | research → next-step | any next action after a research-mode pipeline | "what we do with this" confirmed by the operator |
| B3 | post-verify → next-step | any next action after Verify (Phase 3.x) completes | confirmed direction for the next step |

**B1 is the generalization in-place of the Discover gate one-shot defined in `docs/discover-phase.md §3`.** The pre-existing gate (frame → clarify → confirm → await response) becomes boundary B1 of this checkpoint. The mechanism is unchanged; only the abstraction is made reusable. `docs/discover-phase.md §3` is updated to reference B1 of this contract rather than describing a standalone one-shot gate.

---

## Advance contract (deterministic)

The pipeline does **not** advance past any boundary unless `00-state.md` records **both**:

**(a) Fresh explicit advance signal** (`checkpoint_advance_fresh: true`)
The operator's response was a direct answer to the explicit confirmation prompt of the checkpoint — not an advance keyword carried over from an earlier message. This reuses the semantics defined in `docs/discover-phase.md §2`: an advance keyword in the operator's INITIAL message does not satisfy the gate; only a response to the checkpoint prompt counts.

**(b) Confirmed functional-clarity artifact** (`functional_clarity_confirmed: true`)
A short functional statement that describes what the operator wants to build or do — confirmed as accurate by the operator. The guard checks that the artifact **exists** and is **dev-confirmed**. It does NOT evaluate quality, completeness, or approach. The form is the floor; a richer list of behaviours is optional.

Both conditions must hold simultaneously. A fresh advance signal alone is not sufficient. A confirmed artifact alone is not sufficient.

---

## `00-state.md` — new fields

Add to `## Current State`:

```
- checkpoint_boundary: {intake-plan | research-next | postverify-next | null}
  # active boundary; null when no boundary is currently armed
- checkpoint_advance_fresh: {true | false}
  # true when the advance signal was a response to the checkpoint prompt (not carried over)
- functional_clarity_artifact: {<short functional statement> | null}
  # the confirmed functional statement; null until the operator confirms it
- functional_clarity_confirmed: {true | false}
  # true when the operator confirmed the functional clarity artifact
```

These four fields coexist with the existing `discover_state`, `advance_signal`, and `survey_*` fields — they are complementary, not replacements. `checkpoint_advance_fresh` is the deterministic predicate the guard reads; `advance_signal` continues to record the specific form.

---

## Enforcement

### Layer 1 — Hook (deterministic floor in top-level sessions)

`hooks/checkpoint-guard.sh` is wired as a `PreToolUse` hook with `matcher: "Task"`. When the orchestrator calls `Task` to dispatch a phase agent:

1. The hook reads `tool_input` from stdin and extracts the `subagent_type`.
2. If the destination is a gated phase advance (e.g., `th:architect` at B1), the hook locates `00-state.md` via the `cwd` known to the hook environment.
3. If `checkpoint_boundary` is not null AND the advance contract is not satisfied (`checkpoint_advance_fresh: false` OR `functional_clarity_confirmed: false`), the hook returns:
   ```json
   {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Reasoning checkpoint not satisfied: <missing condition>"}}
   ```
   with exit 0 (deny). The dispatch does not proceed.
4. If the advance contract is satisfied (`checkpoint_advance_fresh: true` AND `functional_clarity_confirmed: true`), the hook allows the dispatch (`permissionDecision: "allow"`).

**Skip markers.** When `00-state.md` records `fast_mode: true`, a `bug_tier` value, or the `discover_state: bypassed` flag, the guard permits the advance without requiring the clarity artifact. Skip markers are a deliberate operator opt-out (`--fast`, `[TIER: N]`, `@th:leader this is a hotfix:`). A skip marker bypasses the checkpoint; it does NOT bypass any security floor.

**HI-2 inviolable at all three boundaries (B1, B2, B3).** The checkpoint guard NEVER waives a security floor. The guard governs only the functional-clarity transition. Security gates (triggered by `security_sensitive: true`, path-pattern auto-escalation, and the bug-fix forcing rule) run on a fully independent path and are unaffected by the checkpoint state. A skip marker that bypasses the checkpoint does NOT bypass the security gate. This invariant holds at B1 intake→plan, B2 research→next, and B3 postverify→next without exception.

**Fail-safe design.** If the hook cannot read `00-state.md` (file absent, parse error, or the hook errors out), it permits the dispatch (fail-open). This is intentional: the checkpoint gates functional clarity, not security. The Layer-2 self-check (below) is the fallback, and security floors are independent.

**`TH-STATE-REF` dispatch marker — explicit state scoping.** When multiple pipelines run concurrently (e.g., a `th:leader` fan-out over several `th:orchestrator` lanes), newest-by-mtime selection cannot distinguish which `00-state.md` governs a given dispatch — a stale-but-recently-touched state from a different lane can shadow the dispatching lane's own state (cross-fire). A dispatching orchestrator closes this by stamping its own `00-state.md` path into the **first line** of the Task dispatch prompt:

```
TH-STATE-REF: {absolute path to the dispatcher's own 00-state.md}
{rest of the prompt}
```

`checkpoint-guard` reads only this first line as the **controlled header** — content anywhere else in the prompt (forwarded operator messages, fetched issue/PR bodies, or any other content read during Discover) is untrusted per CLAUDE.md §6.6 and is never scanned for the marker, so a marker planted mid-prompt cannot redirect state scoping.

A parsed candidate is used **only** when its realpath falls inside one of two containment roots (CWE-22 — resistant to `../` traversal and symlink escape, since both the candidate and the roots are realpath-resolved before the comparison):

- the local workspaces subtree under `cwd()`;
- when `logs-mode: obsidian`, the config-derived vault subtree `{logs-path}/{logs-subfolder}/{repo}` (same root the obsidian candidate search below already scopes to).

Every failure mode — no marker, a malformed header, a nonexistent path, or a resolved path outside both roots — fails open to the legacy newest-non-terminal-by-mtime selection described above. The marker never widens what the gate can deny; it only narrows which state file the gate reads.

**Strict line-token parsing.** The hook parses the four clarity fields with exact line-token matching: a line is accepted only when it matches the pattern `^- checkpoint_advance_fresh: true$` (or the analogous pattern for each field). A substring or regex-lax match such as `checkpoint_advance_fresh: false # previously true` cannot spoof the predicate. This is by design.

**Trust model — intra-privilege.** The agent that writes `checkpoint_advance_fresh: true` to `00-state.md` is the same agent that subsequently dispatches the `Task`. There is no cross-privilege escalation boundary: a spoofed value in the state file would bypass a pedagogical pause, not a security gate. The worst-case outcome of a spurious `true` is that the clarity checkpoint is skipped, not that a security control is compromised. This is documented as an explicit design decision, not a gap.

**Sibling deterministic floor — `gate-guard`.** `checkpoint-guard` is not the only PreToolUse hook that resolves the governing `00-state.md` before making a decision. `gate-guard` (`hooks/ts/bodies/gate-guard.ts`, `PreToolUse`/matcher `Bash`) is a structural sibling: it too locates the active lane's `00-state.md` by mtime-selection — the same `selectByMtime` strategy this file's Layer-1 hook uses (local workspaces subtree + the obsidian vault subtree) — before deciding. Both hooks read `00-state.md` for a deterministic pipeline floor, but the fields they read govern two DIFFERENT trust models:

- **`checkpoint-guard` gates a pedagogical pause.** The fields it reads (`checkpoint_advance_fresh`, `functional_clarity_confirmed`) govern whether the operator has engaged with the functional-clarity checkpoint before a phase-advance dispatch. Per "Trust model — intra-privilege" above, a spoofed value bypasses a REASONING pause, not a security control.
- **`gate-guard` gates outward-action ORDER.** The field it reads (`gate3_release`) governs whether a push/`gh pr create` from a detected pipeline lane is preceded by a recorded STAGE-GATE-3 release (`agents/_shared/gate-contract.md § "Outward-action release floor"`). This field is equally intra-privilege-forgeable — no hook distinguishes writers, the same platform-bounded limit described above — but the consequence of a forged value differs in kind: it would let an outward, potentially irreversible action proceed out of order, not merely skip a pause. `gate-guard`'s own decision set is `{none, deny}` (never `ask`), and it sits ABOVE the pre-existing `dev-guard` destination floor, which remains the actual irreversibility backstop underneath it (`docs/dev-mode.md § Outward-Action Gate`).

Both hooks share the identical no-writer-identity limit — an interior `Write`/`Edit`/Bash payload carries no signal of which agent produced it — but `checkpoint-guard`'s worst case is pedagogical (a skipped pause) while `gate-guard`'s worst case is a mis-ordered outward action, mitigated by `dev-guard`'s independent floor underneath it. Neither hook's trust model should be described in terms of the other's.

**Hook reads only the four clarity fields.** The hook does NOT read `security_sensitive`, `security_gate_status`, or any other security-related field from `00-state.md`. Its input is strictly limited to `checkpoint_boundary`, `checkpoint_advance_fresh`, `functional_clarity_artifact`, and `functional_clarity_confirmed`. The hook never conditions its decision on a security field.

### Layer 1 — Hook is the active floor at all three boundaries

The top-level agent IS the orchestrator and the `Task` tool is always available. The Layer-1 hook (`hooks/checkpoint-guard.sh`, `PreToolUse`/matcher `Task`) fires on every leaf agent dispatch — covering all three boundaries in both local and obsidian logs-mode. When `logs-mode: obsidian`, the hook resolves the vault workspace root from `~/.claude/.team-harness.json`, so obsidian-resident state files are found on the same selection pass as local ones:

- **B1 (intake → plan):** name-keyed — gate fires only when the destination is `th:architect`. A non-architect dispatch while B1 is armed still allows (the orchestrator may dispatch other agents at B1 without triggering the gate).
- **B2 (research → next):** boundary-keyed — gate fires on ANY Task dispatch when `checkpoint_boundary: research-next` is armed. B2 dispatches variable subagent types depending on context; the boundary value is the stable arming signal.
- **B3 (postverify → next):** boundary-keyed — gate fires on ANY Task dispatch when `checkpoint_boundary: postverify-next` is armed, for the same reason as B2.

This promotes all three B1/B2/B3 boundaries from the Layer-2 self-check (non-deterministic, relies on orchestrator discipline) to the Layer-1 deterministic floor. In dev mode, the checkpoint gate is as strong as in a standard top-level orchestrator session. This is a strengthening, not a regression: security floors remain independent of the checkpoint state regardless of mode.

### Layer 2 — Orchestrator self-check (floor in nested-context sessions)

When the orchestrator runs as a subagent (nested context), the `Task` tool is stripped by the harness and `PreToolUse` hooks never fire, because there is no `Task` call for the hook to intercept. In this context, enforcement falls back to a synchronous self-check inside the orchestrator's own Step 6d (B1), B2, and B3 contract blocks.

**Declared limitation.** The self-check is as deterministic as the orchestrator's discipline in following its own contract. It is NOT a harness-level floor. It can be weakened by context drift in a way that the Layer-1 hook cannot. PR-A delivers both layers and marks which layer applies in each context. The degradation from Layer 1 to Layer 2 is a loss of pedagogical rigor, not a security regression.

**Security floors do not degrade in nested context.** The degradation from Layer 1 (hook) to Layer 2 (self-check) affects only the determinism of the functional-clarity gate. Security floors — HI-2, path-pattern auto-escalation (`security_sensitive: true`), the bug-fix forcing rule, and all gates in `leader.md § Phase 0a` and `ref-special-flows.md` — run on their own deterministic path and are NOT weakened by the nested-context fallback. Even in a nested-context session where the checkpoint runs as a self-check, every security gate fires as designed.

**Example — this pipeline.** The orchestrator of the team-harness pipeline that produced this document ran as a subagent. Its `Task` tool was stripped. The checkpoint ran as a Layer-2 self-check. The Layer-1 hook was not engaged because there was no `Task` to intercept. Security gates were unaffected.

### Under the leader/orchestrator split

The Layer-1 sections above describe the pre-split monolithic orchestrator arming boundaries in a single `00-state.md`. Under the `th:leader` / `th:orchestrator` split, ownership divides — but B1 keeps its Layer-1 determinism:

- **B1 (intake → plan).** The functional-clarity confirmation happens in `th:leader`'s Discover conversation — the leader owns no pipeline `00-state.md`, so it cannot arm the field-based boundary; it confirms the artifact with the operator directly and propagates `functional_clarity_confirmed` + `functional_clarity_artifact` as a **checkpoint-trust-transfer**. The receiving `th:orchestrator` then arms `checkpoint_boundary: intake-plan` + `checkpoint_advance_fresh: true` in its OWN `00-state.md` and stamps `TH-STATE-REF: {docs_root}/00-state.md` on the `architect` dispatch. On Claude Code ≥ 2.1.172 the orchestrator subagent **retains `Task`**, so `checkpoint-guard` fires on that dispatch (unlike the stripped-`Task` nested case above), reads the orchestrator's own state via the marker, and denies unless the advance contract holds. This is a deterministic backstop against a trust-transfer failure — a leader that spawned the orchestrator without a confirmed artifact is caught here, not silently planned around. The orchestrator must copy `functional_clarity_confirmed` verbatim from its spawn payload; a synthesized `true` would make the check vacuous.
- **B2 (research → next).** Research and Discover are the leader's; B2 is the leader's conversational checkpoint (Layer-2), armed in no orchestrator `00-state.md`.
- **B3 (post-verify → next).** Inside the orchestrator the post-verify transition is governed by the hard **STAGE-GATE-2** (a mandatory human gate), which subsumes B3; the orchestrator arms no separate `postverify-next` boundary.

The intra-privilege trust model still holds: the agent that writes the clarity fields (the orchestrator) is the same agent that dispatches the `architect`; a spurious value skips a functional-clarity pause, never a security control.

---

## Skip-marker bypass

Skip markers (`--fast`, `[TIER: N]`, `@th:leader this is a hotfix:`) bypass the reasoning checkpoint at all three boundaries. The bypass is an explicit opt-out, not a loophole. It preserves the same semantics as the pre-existing Discover gate bypass (`docs/discover-phase.md §3.1`).

A skip marker does NOT bypass security gates. `--fast` still inherits every security carve-out defined in `leader.md § Phase 0a` (SEC-002 and the path-pattern auto-escalation). This invariant holds at B1, B2, and B3.

---

## Postura

The checkpoint is not a restraint gate — it is a reasoning-engagement surface. The leader enters each boundary (B1 intake→plan, B2 research→next, B3 postverify→next) as a reasoning partner. The posture defined here applies at every boundary.

### Disagreement license

The leader is authorized and expected to disagree with the operator's framing or approach when warranted. "No concerns" is suspicious, not a green light — genuine friction is expected. Disagreement is triggered (not constant): it fires when the idea is unclear OR when it violates a documented project standard. It does not fire on every interaction.

### Standards anchor

All disagreement is grounded in the project's codified standards: CLAUDE.md working agreements §6, architectural conventions §5, or any other documented constraint. The objection must be legible and defensible ("this breaks documented §X") — never the model's taste or an undocumented preference.

### Win-condition reframe

Success at the checkpoint is NOT "produced the artifact / reached the plan." Success is: the developer reached clarity + the idea meets the bar + the developer understands why.

Pedagogy clause: always expose the WHY behind a concern (the junior learns, the senior verifies). Do NOT force a Socratic march — state the concern and the reasoning; the developer chooses the depth. Bounded by: this is still work, never a seminar, and it never blocks delivery.

### Concise engagement / internal reasoning

The reasoning-partner posture does NOT license over-explaining or surfacing the full internal reasoning chain. Surface only the salient friction and the decision-relevant why, briefly. Keep the rest of the reasoning internal.

This is the explicit counterweight to the sycophancy fix: a critical partner who is also concise. Aligns with CLAUDE.md §7.1 voice and output-discipline (operate silently, surface decisions and results).
