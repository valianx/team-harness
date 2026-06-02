# Discover Phase — Intake Disposition Contract

The Discover phase is the orchestrator's default intake posture for development tasks. It replaces the previous eager-dispatch model (architect fires on message arrival) with a patient-by-default model: the architect is dispatched **only** after the operator emits an explicit advance signal. Before that signal, the orchestrator stays conversational and cheap — no subagent dispatch during ideation.

This document is the full contract. `CLAUDE.md §5` carries a one-line pointer to it.

---

## 1. Disposición predeterminada (default intake disposition)

When Step 6b routes a request as `full pipeline`, the orchestrator does NOT proceed immediately to Step 7 (Classify) and Phase 1 (Design). Instead, it enters the Discover disposition:

1. **Detect task clarity.** A task is "already clear" if ANY of these conditions hold:
   - The message contains a literal marker: `--fast`, `[TIER: N]`, `@th:orchestrator this is a hotfix:`, or similar operator-declared override.
   - The message contains an explicit advance signal (see §2).
   - The message contains a complete spec with stated AC (user stories + Given/When/Then or VERIFY criteria already written).

2. **Clear task → fast-path (§3).** Offer one confirmation, then proceed on any advance response.

3. **Unclear task → Discover open (§4).** Stay conversational. Assist scope exploration using only the orchestrator's own capability. Do NOT dispatch any subagent (no architect, no qa-plan, no specifier). Remain in this state until an advance signal is received.

4. **Advance signal received → intake survey (§5) → Step 7.** The survey captures meta-decisions, then the orchestrator proceeds to Step 7 (Classify) → Phase 0b (Specify) → Phase 1 (Design).

**The advance signal is the ONLY trigger for the architect.** Without it, the architect is never dispatched.

---

## 2. Advance signal — the three recognized forms

Any one of the following counts as an advance signal:

| Form | Examples |
|------|---------|
| **Advance keyword** (natural language) | `planeá`, `diseñá`, `armá el plan`, `dale`, `go`, `plan it`, `design it`, `let's go`, `arranquemos`, `procedé` |
| **Fast-path confirmation** | Any affirmative reply to the fast-path `[plan/explorar]` prompt — `plan`, `y`, `yes`, `sí`, `ok`, `adelante` |
| **Close phrase** | `listo`, `ya está`, `eso es todo`, `done`, `that's it`, `terminé de pensar` |

Literal operator-declared markers (`--fast`, `[TIER: N]`, `@th:orchestrator this is a hotfix:`) ALSO count as advance signals — an operator who arrives with a marker has already decided and must not be forced through Discover.

**What does NOT count:** a question, a new piece of scope detail, "what do you think?", or "one more thing" — those extend the Discover conversation, they do not close it.

---

## 3. Fast-path (task already clear)

When the task is already clear (§1 condition 1 or 2), emit a single one-line confirmation prompt:

```
Tarea clara. Arranco la planeación, o querés explorar la idea primero? [plan/explorar]
```

(In English: `Task is clear. Start planning, or explore first? [plan/explore]`)

- Response `plan` (or any advance signal) → proceed immediately to intake survey (§5) → Step 7.
- Response `explorar` / `explore` / any diverging response → enter Discover open (§4).
- No response within the conversation → wait; the fast-path does not time out automatically.

The fast-path is ONE interaction. Do not offer a second confirmation.

---

## 4. Discover open (task not yet clear)

When the task is not clear, stay in the conversational Discover state:

- Use the orchestrator's own capability to help the operator explore: clarify scope, suggest decompositions, ask targeted questions.
- Do NOT dispatch any subagent.
- After N turns without an advance signal, emit a soft reminder (once):
  `Cuando quieras avanzar, decime y arranco la planeación.` / `Whenever you're ready, say the word and planning begins.`
- Emit only one reminder. Do not repeat it.

State: record `discover_state: open` in `00-state.md` for the duration. On advance signal, set `discover_state: closed` and proceed.

---

## 5. Intake survey — four meta-decisions

Immediately after an advance signal (or at fast-path confirmation), capture the operator's meta-decisions as attributable answers before proceeding to Step 7.

Use `AskUserQuestion` where available. Where not available (e.g., takeover context), present the questions as conversational prose — the contract is "a round of attributable questions", not "a specific tool call".

**Progression rule:** ask only what is ambiguous. If a marker already answered a question, skip it and record `survey_source: inferred` for that field.

### The four questions

| # | Question | Options | Skip condition | Maps to |
|---|---------|---------|---------------|---------|
| 1 | Pipeline shape | `full` (default — all gates run) / `fast` (same as `--fast`) | operator already declared `--fast` | `survey_pipeline_shape` |
| 2 | Effort | `thorough` (default) / `quick` / `agent-decides` | — | `survey_effort` |
| 3 | Iteration autonomy | `manual` (pause after each verify round) / `autonomous` (iterate to convergence, stop for gates only) | — | `survey_iteration_autonomy` |
| 4 | Known scope hint | Free text — `"¿Sabés qué archivos toca? — opcional"` / `"Known files? — optional"` | — (always optional) | `survey_scope_hint` |

**Minimum always-shown set:** a single confirmation screen of the auto-classification (pipeline shape + effort + autonomy, with auto-detected values pre-filled) plus the scope hint as an optional add-on. If all three auto-detections are unambiguous, the operator can confirm with a single "ok" without re-reading each question.

**Progressive reduction:** if the operator already declared `--fast` → skip question 1 (shape is `fast`, record `survey_source: inferred`). If `[TIER: N]` was declared → shape and effort may be inferred from the tier. Do not interrogate what has already been declared.

---

## 6. Hard invariants (non-negotiable)

### HI-1 + HI-4 — Depth DIAL, not stage switch

The survey is a **depth dial**. Every gate still runs. "never simple, all dev runs full pipeline" (`orchestrator.md` Step 7) remains literally true. No survey answer can mark a Phase Checklist item as skipped unless the tier/`--fast` rules already authorize that skip today.

`survey_pipeline_shape: fast` maps exactly to `--fast` and inherits all its carve-outs, including the security design-review carve-out SEC-002 (`orchestrator.md` Step 7 fast mode). The survey does NOT introduce a new or more permissive semantics for `fast` — it is a strict alias for the operator-declared `--fast` marker.

### HI-2 — Security floors are non-surveyable

The survey **never writes `security_sensitive`**. That field is written ONLY by Step 7 path-pattern auto-escalation (`orchestrator.md:868`) and the bug-fix forcing rule.

The path-pattern auto-escalation is **input-independent** of every survey answer. Its result depends solely on the file paths touched (`auth/**`, `middleware/**`, `api/**`, `db/**`, `security/**`, `crypto/**`, `session/**`), never on `survey_pipeline_shape`, `survey_effort`, or `survey_iteration_autonomy`. Even if the survey records `shape=fast, effort=quick`, a task touching `auth/**` still gets `security-sensitive: true` + Tier 3 minimum — the escalation result is the same whether the survey capture runs before or after it.

Consequence: neither the advance signal nor any survey answer constitutes a waiver of the security floor.

### HI-3 — Attributable choices

Every survey answer is logged in `00-state.md § Current State` (the 7 fields in §7 below) and surfaced in the PR body via the `Intake survey:` line (§9 below). The PR body line propagates only: `forma`, `esfuerzo`, `autonomía`, `scope-hint`, `fuente`. It **never** includes `security_sensitive` or any gate status — no PR line may be read as attributing a security waiver to the operator.

### HI-5 — Recoverable post-compaction

All 7 survey fields in `00-state.md` are plain-text key: value pairs readable by any resuming agent without re-interrogating the manifest. See §7.

---

## 7. `00-state.md` — new fields (add to `## Current State`)

```
- discover_state: {open | closed | bypassed}
  # open = in ideation; closed = advance signal received; bypassed = task was already clear (fast-path)
- advance_signal: {keyword:<word> | fastpath-confirm | close-phrase | literal-marker:<marker> | null}
  # the specific signal that closed Discover; null while still open
- survey_pipeline_shape: {full | fast | null}
  # null = not asked (auto-classified from operator markers)
- survey_effort: {thorough | quick | agent-decides | null}
  # null = not asked
- survey_iteration_autonomy: {true | false | null}
  # true = autonomous; false = manual; null = not asked
- survey_scope_hint: {<free text> | null}
  # captured in E1; consumed by architect in E2
- survey_source: {asked | confirmed | inferred | null}
  # how responses were obtained: asked = full form; confirmed = 1-screen confirm; inferred = from marker
```

**Recovery Instructions update (add to `## Recovery Instructions`):**

```
- discover_state / advance_signal: indicate whether Discover is still open, what signal closed it.
- survey_* fields: the operator's meta-decisions; use to skip re-asking on resume.
  survey_source: inferred → field was derived from an operator marker, not asked anew.
```

---

## 8. Observability

The Discover phase emits `phase.start` and `phase.end` events with `phase: "0-discover"`:

```jsonl
{"ts":"…","event":"phase.start","feature":"…","phase":"0-discover","agent":"orchestrator"}
{"ts":"…","event":"phase.end","feature":"…","phase":"0-discover","agent":"orchestrator","status":"success","duration_ms":…,"extra":{"discover_state":"closed","advance_signal":"keyword:planeá","survey_source":"asked"}}
```

The Discover phase does NOT add a blocking item to the Phase Checklist — it is pre-Phase-0a conversational, not a phase that dispatches a subagent. It is recorded as a traced sub-step only (same precedent as Phase 3.75).

---

## 9. PR body — `Intake survey:` line (HI-3 surfacing)

The delivery agent includes a conditional `Intake survey:` line in the PR body (Step 11.2) whenever `survey_source` is not null:

```
**Intake survey:** forma={full|fast}, esfuerzo={thorough|quick|agent-decides}, autonomía={manual|autonomous}, scope-hint="{text or none}", fuente={asked|confirmed|inferred}
```

This line appears in the `## Main change` section, immediately below the one-sentence main-change description. It is conditional: omit entirely when `survey_source: null` (Discover was bypassed before the survey ran).

**Prohibition:** the `Intake survey:` line MUST NOT include `security_sensitive`, any gate status flag, or any field not in the enumeration above. No line in the PR may be read as attributing a security decision to the operator.
