# Subagent Orchestration — Full Reference

> Extracted from CLAUDE.md §14 to keep the main file under 40 KB. The routing table and escalation rules remain inline in CLAUDE.md. This file contains the nested-context limitation details, dispatch handoff protocol, and blocked-manual-push handling.

## Nested-Context Dispatch Limitation

When `orchestrator` is invoked from a context where another agent is already active — for example, via an `@th:orchestrator` mention inside an ongoing agent session, via a skill that itself runs inside a parent agent, or via a chained orchestrator dispatch — the Claude Code harness strips the `Task` tool as an anti-recursion safety measure. The orchestrator cannot dispatch specialist agents and emits a `dispatch_handoff` directive instead.

**When this triggers:** any path where the orchestrator is NOT the first agent started from the user's top-level session.

**Correct invocation patterns:**
- From an interactive Claude Code session: type `@th:orchestrator <task>` directly — this is top-level and the `Task` tool is available.
- From a skill: skills route to the orchestrator via `Task(subagent_type=orchestrator, ...)` from top-level — this works correctly.
- From another agent: the other agent must emit a `dispatch_handoff` block back to top-level Claude, which then takes over per the protocol below.

**What to expect when the limitation triggers:** the orchestrator emits a "Dispatch handoff" response with a human-readable summary followed by a JSON block. Top-level Claude reads the summary, dispatches the named agent directly, and continues the pipeline — no user action needed.

## dispatch_handoff Schema

The `dispatch_handoff` JSON block is the canonical machine-readable payload the orchestrator writes when the boot probe fails (nested context). The orchestrator produces it; top-level Claude consumes it. This section is the single source of truth for all 8 fields — the producer references this schema by name and does not enumerate fields inline.

```json
{
  "schema_version": "1",
  "next_dispatch": {
    "agent": "th:architect"
  },
  "type": null,
  "phase": "0a-intake",
  "autonomy": {
    "granted": false
  },
  "round": null,
  "state_ref": null,
  "probe_error": "<literal harness error message>"
}
```

| Field | Type | Boot (no `00-state.md`) | Mid-pipeline |
|-------|------|------------------------|--------------|
| `schema_version` | string | required | required |
| `next_dispatch.agent` | string (prefixed, e.g. `th:architect`) | required — value is `th:architect`; NEVER `th:orchestrator` | required — the phase agent read from `00-state.md`; NEVER `th:orchestrator` |
| `type` | string\|null | `null` (task type not yet classified at boot) — **`type: null` does NOT mean security is skipped**: when resuming from a boot handoff with unknown type, top-level Claude MUST re-classify (Phase 0a Step 7) before applying the type-gated manifest; security defaults to RUN when type is unknown. Full boot re-classification is hardened in PR B. | `feature` \| `fix` \| `hotfix` \| `refactor` \| `enhancement` \| `docs` |
| `phase` | string | required — `0a-intake` or `1-design` | required — id of the current phase (e.g. `2-implement`) |
| `autonomy.granted` | boolean | required | required |
| `round` | string\|null | `null` | `R1` \| `R2` \| … when applicable |
| `state_ref` | string\|null | `null` (no workspace yet) | path to `00-state.md` |
| `probe_error` | string | required — the literal harness error message from the failed `Task` call | required |

**Worked example — mid-pipeline handoff (Phase 2, `type: fix`):**

```json
{
  "schema_version": "1",
  "next_dispatch": {
    "agent": "th:implementer"
  },
  "type": "fix",
  "phase": "2-implement",
  "autonomy": {
    "granted": true
  },
  "round": "R1",
  "state_ref": "workspaces/my-feature/00-state.md",
  "probe_error": "Tool 'Task' is not available in this context."
}
```

## Auto-Takeover on `blocked-no-dispatch`

**Universal rule (applies regardless of how the orchestrator was invoked):**

When the `orchestrator` subagent returns a response containing **"Dispatch handoff — top-level Claude takes over now"**, or when an existing `workspaces/{feature}/00-state.md` has `status: blocked-no-dispatch`, top-level Claude **MUST** take over dispatch immediately. This is not a user-decision point — the user already authorised the pipeline; the nested-context Task strip is a runtime detour, not a new authorisation.

**Handoff payload (canonical).** The orchestrator emits a structured JSON `dispatch_handoff` block in its response (and embeds the same block in `00-state.md` § `## Handoff`). Top-level Claude parses that JSON to extract the variable fields — `next_dispatch.agent`, `phase`, `autonomy`, `round`, `state_ref`, `probe_error` — and follows the static protocol below. Treat the JSON as ground truth; if any prose contradicts it, JSON wins. The `next_dispatch.agent` value is stored in **prefixed** form (e.g. `th:architect`) — use it verbatim for `Task(subagent_type=…)`; strip `th:` only when deriving the agent's file path (step 3).

## Takeover Protocol (static, identical for every handoff)

**Takeover Pipeline Manifest (gate manifest) — read this first.** This manifest enumerates the inviolable gates that a takeover MUST NOT skip. It is a **gate manifest**, not the ordered phase sequence — the complete, ordered list of phases lives in the **Phase Dispatch table** in `agents/orchestrator.md`; read that table as the authoritative phase sequence. Read each gate's detailed contract (the agent `.md` and the matching `agents/orchestrator.md` / `agents/ref-special-flows.md` phase section) as you reach it — do NOT read them all up front. skipping any gate is a defect, not a shortcut; completing every item is the obligation. The takeover is not a lighter path: the same full-stage compliance that the `orchestrator-dispatch-rule` block requires for normal dispatch ("Full pipeline is the default… Do not skip stages") applies equally here.

Inviolable gates (annotate `dispatch_handoff.type` to determine which items apply):

- **STAGE-GATE-1** — mandatory human approval before implementation begins. `[all types]`
- **Phase 1.6 plan-review** — inviolable plan review (`01-plan.md § Plan Review` with `## Verdict`). `[all types]`
- **Phase 2.0 regression-test-first** — tester authors a failing test before any source change. `[fix/hotfix only]` (Tier 2-4; Tier 1 conditional skip). Read `agents/ref-special-flows.md § Bug-fix Flow` for the full tier system.
- **Phase 3 verify** — `tester` + `qa` run in parallel. `[all types]`. Security agent also runs (`security-always`): `[fix/hotfix Tier 3+]` (Tier 2 skips unless path-pattern auto-escalation applies). Read `agents/ref-special-flows.md § Tier System` when `type: fix/hotfix`.
- **Observability** — `00-execution-events.{jsonl|md}` + `00-pipeline-summary.md` + `00-state.md` updated at every phase transition. `[all types]`
- **Phase 3.5 Acceptance Gate + Phase 3.6 Acceptance Check** — acceptance-checker appends to `04-validation.md § Drift Analysis`. `[all types]`
- **STAGE-GATE-3** — mandatory human approval before push; autonomy never covers this gate. `[all types]`
- **KG passive capture** — `delivery` agent persists one `process-insight` node (best-effort). `[all types]`

1. Do NOT ask the user "should I take over?" The directive in the orchestrator's response is itself the authorisation.
2. Do NOT re-invoke `@th:orchestrator` or any skill that routes via `Task(subagent_type=orchestrator, ...)` — that recreates the nested context and the boot probe will fail again.
3. Parse `dispatch_handoff.next_dispatch.agent` from the JSON — the value is in **prefixed** form (e.g. `th:architect`). If `state_ref` is set, read that state file (`## Current State` + `## Agent Results` + `## Handoff`). To read the agent's contract file, **strip the `th:` prefix** to derive the on-disk path (`th:architect` → `agents/architect.md`); team-harness agents are flat so a prefix-strip suffices (a plugin subagent in a subfolder would map `:`→`/`). For plugin installs (no repo clone), `agents/…` and `docs/…` paths resolve under `~/.claude/plugins/cache/team-harness-marketplace/th/<highest-version>/` — resolve `<highest-version>` to the highest semver directory present. Consult the Takeover Pipeline Manifest above for the ordered set of stages to complete; read each stage's detailed contract as you reach it (lazy-load).
4. **Consume-side guard (check before dispatch):** If `next_dispatch.agent == th:orchestrator`, the handoff is malformed — dispatching `th:orchestrator` recreates the nested context that caused the Task strip. Do NOT dispatch `th:orchestrator`. Instead, dispatch the phase agent from `00-state.md` (read `## Current State` to determine the current phase and its owning agent), or `th:architect` if no workspace exists (boot case). Log this correction as a `dispatch.blocked` event with `reason: malformed-handoff-agent` before continuing.

   Once the guard passes, dispatch the named agent directly via `Task(subagent_type={next_dispatch.agent}, ...)` from the top-level session — use the value verbatim (it is already prefixed, e.g. `th:architect`; do NOT add `th:` again). Parse the returned status block. Update `state_ref` (TL;DR + Current State + Agent Results) per the orchestrator's checkpointing protocol. Iterate per the orchestrator contract (max 3 iterations on `failed`/`blocked`).
5. Continue through the remaining phases of the pipeline (Phase 3 verifies in parallel: `tester` + `qa` + `security` when sensitive; Phase 3.5 acceptance-gate; Phase 3.6 `acceptance-checker`; Phase 4 `delivery`). Respect gate semantics:
   - **STAGE-GATE-2** (between PRs in Stage 2): if `dispatch_handoff.autonomy.granted` is `true`, skip silently; otherwise stop and ask the user.
   - **STAGE-GATE-3** (before push in Stage 3): always stop and ask the user — autonomy never covers this gate.
6. Top-level Claude still inherits the "you NEVER write code/tests/docs" contract during the takeover — dispatch agents for each phase, do not write `02-implementation.md` / `03-testing.md` / `04-validation.md` / `04-security.md` inline. Delivery info goes to `00-state.md`; acceptance-checker results go to `04-validation.md § Drift Analysis`.
7. Mirror PR-level progress into `01-plan.md § Task List` (Status field + AC checkbox) at each PR transition.
8. Report to the user only at pipeline completion, at a mandatory STAGE-GATE, or when a non-recoverable failure needs human input.

This rule applies to **every** entry mode: `@th:orchestrator` mention, skill routing (`/issue`, `/recover`, `/plan`, `/design`, `/deliver`, `/validate`, `/research`, `/spike`, `/test`, etc.), or another agent's referral. The `blocked-no-dispatch` state is the system's documented self-healing path — leaving it open for the user to resolve manually defeats the purpose.

## Session-Scoped Config Override Protocol

The orchestrator supports per-session overrides of a closed whitelist of config keys. The operator states the override in chat; the orchestrator applies it for that pipeline run only.

### Step order (load-bearing)

Runs inside boot Step 2, before `base_path` resolution:

1. Parse override intent from the operator's chat message.
2. Read the persistent config `~/.claude/.team-harness.json`.
3. Apply precedence: `override > persistent > default` for each overridable key.
4. Resolve `base_path`, `logs_mode`, `events_file`, and `docs_root` from the merged result.

This order ensures `docs_root = {base_path}/{YYYY-MM-DD}_{feature-name}` is computed from the already-overridden `base_path` — not from the raw persistent value.

### Whitelist (authority: CLAUDE.md §5)

Overridable keys: `logs-mode`, `logs-path`, `logs-subfolder`, `clickup.workspace_id`.

Excluded from override (→ `/th:setup` only): MCP URL, API keys (context7 / bearer), agent `model`, agent `effort`. Attempts to override excluded keys are ignored with a one-line WARN; the pipeline continues with the persistent value.

### Persistence

The resolved config is stored in `00-state.md` § Current State. No new file is created. The override flow is read-only on `~/.claude/.team-harness.json` — it is never written by the override path.

### Output Discipline

Follows `agents/_shared/output-template.md`: silent on success (events file only), one-line WARN + fallback on invalid override, non-blocking. No operator-facing chatter on a clean override.

### `/recover` behavior

On recovery, the resolved config is re-read from `00-state.md` § Current State — the chat is not re-parsed. The orchestrator logs `operation.success` with detail `override re-applied from 00-state.md`. If the operator re-states an override during recovery, it is treated as a new session override for the resumed run.

### Collision guarantee

`base_path` is resolved (with override applied) before `docs_root` is composed. The `{YYYY-MM-DD}_{feature-name}` prefix ensures each run gets a unique workspace directory. Two runs with different overrides do not share or overwrite each other's workspace.

## `blocked-manual-push` Handling

When the `delivery` agent returns `status: blocked-manual-push`, the orchestrator emits a STOP block with the compare URL and `workspaces/{feature}/inputs/pr-body.md` path. The operator opens the PR manually, then replies `pr opened #N`. The orchestrator records the PR number in `00-state.md` and continues to Phase 5. This is distinct from `blocked-no-dispatch`: no auto-takeover, just a manual-action pause. See `agents/_shared/gh-fallback.md` § "`status: blocked-manual-push`" for the full protocol.
