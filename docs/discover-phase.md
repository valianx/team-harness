# Discover Phase — Intake Disposition Contract

The Discover phase is the orchestrator's default intake posture for development tasks. It replaces the previous eager-dispatch model (architect fires on message arrival) with a patient-by-default model: the architect is dispatched **only** after the operator emits an explicit advance signal. Before that signal, the orchestrator stays conversational and cheap — no subagent dispatch during ideation.

**Model.** Discovery is interactive and multi-turn: it frames the task, may ask clarifying questions, and WAITS for the operator's advance response across turns. A dispatched subagent runs single-shot and cannot hold a multi-turn conversation, so Discovery cannot run inside a subagent — it is necessarily performed at the **top level (the main chat session)**, and is therefore governed by the **session / chat model**, not by any subagent frontmatter. The orchestrator's own `model: opus` / `effort: high` frontmatter governs its non-interactive single-pass orchestration when it IS dispatched as a subagent — but that path cannot conduct interactive Discovery.

Practical consequence: Discovery quality tracks the chat model directly. Run the session on an Opus-class model for Discovery — it is a high-value framing/steering step. Raising the chat model to its strongest setting improves Discovery; lowering it (a faster/cheaper tier) degrades Discovery with it.

This document is the full contract. `CLAUDE.md §5` carries a one-line pointer to it.

---

## 1. Disposición predeterminada (default intake disposition)

When Step 6b routes a request as `full pipeline`, the orchestrator does NOT proceed immediately to Step 7 (Classify) and Phase 1 (Design). Discovery ALWAYS runs first, and entry into planning is ALWAYS gated by an explicit operator confirmation.

**HARD RULE — no silent advance into planning.** The orchestrator never transitions from intake to Phase 1 without first: (a) framing the task back to the operator — a 1–2 line restatement of what was understood plus the tentative pipeline shape / affected services; (b) asking any clarifying questions needed to gather the context required to plan well; and (c) emitting the planning-confirmation prompt and WAITING for an explicit advance response. An advance signal present in the operator's INITIAL message (e.g. `armá el plan`, `dale`, `analizá`) does NOT pre-satisfy this gate — the prompt is still shown and a fresh response is awaited. The ONLY bypass is an explicit operator-declared skip marker (§3.1).

1. **Detect task clarity** (this sets framing depth, NOT whether to confirm). A task is "clear" when it carries a complete spec with stated AC, or an explicit skip marker. Otherwise it is "unclear". Either way, the confirmation gate fires (unless a skip marker is present).

2. **Clear task (no marker) → brief framing gate (§3.2).** Restate, optionally ask clarifying questions, then confirm. Wait for the advance response.

3. **Unclear task → Discover open (§4).** Stay conversational. Assist scope exploration and ask clarifying questions using only the orchestrator's own capability. Do NOT dispatch any subagent (no architect, no qa-plan, no specifier). Remain until an advance response is received.

4. **Explicit skip marker → bypass (§3.1).** `--fast`, `[TIER: N]`, or `@th:orchestrator this is a hotfix:` are deliberate opt-outs: proceed to the intake survey (§5) → Step 7 without the confirmation prompt.

5. **Advance response received → intake survey (§5) → Step 7.** The survey captures meta-decisions, then the orchestrator proceeds to Step 7 (Classify) → Phase 0b (Specify) → Phase 1 (Design).

**An advance response to the planning-confirmation prompt — or an explicit skip marker — is the ONLY trigger for the architect.** Without one, the architect is never dispatched.

---

## 2. Advance signal — the three recognized forms

Any one of the following counts as an advance signal:

| Form | Examples |
|------|---------|
| **Advance keyword** (natural language) | `planeá`, `diseñá`, `armá el plan`, `dale`, `go`, `plan it`, `design it`, `let's go`, `arranquemos`, `procedé` |
| **Fast-path confirmation** | Any affirmative reply to the fast-path `[plan/explorar]` prompt — `plan`, `y`, `yes`, `sí`, `ok`, `adelante` |
| **Close phrase** | `listo`, `ya está`, `eso es todo`, `done`, `that's it`, `terminé de pensar` |

**Skip markers are NOT the same as advance keywords.** Literal operator-declared markers (`--fast`, `[TIER: N]`, `@th:orchestrator this is a hotfix:`) are a deliberate opt-out: they bypass the confirmation gate entirely (§3.1). Advance keywords and close phrases, by contrast, only close Discover when given as a **response to the planning-confirmation prompt** — the same words appearing in the operator's INITIAL message do NOT bypass the gate. The orchestrator still frames the task, may ask clarifying questions, and waits for a fresh advance response.

**What does NOT count:** a question, a new piece of scope detail, "what do you think?", or "one more thing" — those extend the Discover conversation, they do not close it.

---

## 3. Entry into planning — always gated (Reasoning Checkpoint B1)

This section defines Boundary B1 of the reasoning checkpoint (`docs/reasoning-checkpoint.md`). The Discover gate is generalized in-place as the intake→plan instance of the reusable three-boundary checkpoint. The mechanism is unchanged; the abstraction is made explicit so B2 (research→next) and B3 (postverify→next) share the same contract.

**Enforcement.** In top-level sessions, `hooks/checkpoint-guard.sh` (`PreToolUse` / matcher `Task`) enforces this deterministically — the architect is not dispatched until both `checkpoint_advance_fresh: true` AND `functional_clarity_confirmed: true` are recorded in `00-state.md`. In nested-context sessions, the orchestrator self-check (Layer 2) applies; see `docs/reasoning-checkpoint.md § Layer 2`.

### 3.1 Explicit skip marker → bypass

The ONLY way to skip the confirmation gate is a deliberate operator-declared marker in the message: `--fast`, `[TIER: N]`, or `@th:orchestrator this is a hotfix:`. These mean "I have decided, skip the gate." Record `discover_state: bypassed`, skip the framing+confirm, and go straight to the intake survey (§5) → Step 7. (`--fast` still inherits every security carve-out — see §6 HI-1/HI-2; a skip marker is not a security waiver. A skip marker bypasses the checkpoint but NOT the security gate — this invariant holds at B1, B2, and B3.)

### 3.2 Clear task (no marker) → brief framing gate

When the task is clear but carries NO skip marker, the orchestrator still confirms before planning. Record `discover_state: open`, `checkpoint_boundary: intake-plan`, `checkpoint_advance_fresh: false`, `functional_clarity_confirmed: false`. Emit the framing and the confirmation in a single turn:

```
Esto entendí: <1–2 line restatement + tentative pipeline shape / affected services>.
[si falta contexto para planear bien, una o más preguntas concretas acá]
¿Pasamos a planeación, o querés ajustar/explorar primero? [plan/explorar]
```

(In English: `Here's what I understood: <…>. Shall we move to planning, or adjust/explore first? [plan/explore]`)

- Use `AskUserQuestion` for the clarifying questions where available. Ask only what is genuinely needed to plan well — do NOT interrogate beyond that. Do NOT dispatch any subagent in this step.
- Confirm the functional clarity artifact with the operator during this turn: "¿Qué construimos, funcionalmente? / What are we building, functionally?" (one line is enough — quality is not evaluated, only existence + confirmation).
- Response = advance (`plan`, `dale`, `sí`, `ok`, `procedé`, …) + confirmed functional artifact → record `discover_state: closed`, `advance_signal`, `checkpoint_advance_fresh: true`, `functional_clarity_artifact: <statement>`, `functional_clarity_confirmed: true`, `checkpoint_boundary: null`, proceed to intake survey (§5) → Step 7.
- Response = `explorar`/`explore`, a question, or new scope detail → continue conversational Discover (§4).
- No response → wait; the gate does not time out.

This is always at least ONE interaction. An advance keyword in the operator's initial message does NOT skip it — the framing+confirm still happens.

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
  # open = framing/ideation in progress; closed = advance response received at the confirmation gate; bypassed = explicit skip marker only (--fast / [TIER: N] / hotfix)
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
- checkpoint_boundary: {intake-plan | research-next | postverify-next | null}
  # active reasoning-checkpoint boundary (§3); null when no boundary is armed
- checkpoint_advance_fresh: {true | false}
  # true when the advance signal was a response to the checkpoint prompt (not carried over)
- functional_clarity_artifact: {<short functional statement> | null}
  # confirmed functional statement ("what we are building, functionally"); null until confirmed
- functional_clarity_confirmed: {true | false}
  # true when the operator confirmed the functional clarity artifact
```

**Recovery Instructions update (add to `## Recovery Instructions`):**

```
- discover_state / advance_signal: indicate whether Discover is still open, what signal closed it.
- survey_* fields: the operator's meta-decisions; use to skip re-asking on resume.
  survey_source: inferred → field was derived from an operator marker, not asked anew.
- checkpoint_boundary / checkpoint_advance_fresh / functional_clarity_confirmed: reasoning
  checkpoint state (docs/reasoning-checkpoint.md). If checkpoint_boundary is not null and either
  advance_fresh or clarity_confirmed is false, do not dispatch the gated agent — re-emit the
  checkpoint confirmation prompt first.
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

---

## 10. Spec co-authoring — `00-spec-seed.md` (Phase E2)

After the intake survey and before dispatching the architect, the orchestrator offers the operator an opportunity to seed the spec. Full contract: `docs/spec-coauthoring.md`.

### 10.1 Seeding offer

After recording survey answers in `00-state.md`, the orchestrator asks:

```
Antes de arrancar el diseño, ¿querés sembrar el spec? (opcional)
Respondé cualquiera de estas preguntas — lo que tengas; dejá en blanco lo que no:

1. Intención: ¿Por qué lo estás pidiendo?
2. Enfoque: ¿Cómo lo harías? (si tenés una idea)
3. Descomposición: ¿En qué partes lo dividirías?
4. Gotchas: ¿Qué sabés que muerde?

O decí "skip" para arrancar directo.
```

### 10.2 Artefact: `00-spec-seed.md`

When the operator provides any response (other than "skip"), the orchestrator writes `{docs_root}/00-spec-seed.md` with the four sections above marked `**Source:** dev-seed`. Sets `spec_seed_present: true` in `00-state.md`.

When the operator skips: no file is created; `spec_seed_present: false`. The architect runs in standard mode.

The `survey_scope_hint` captured in §5 above is passed to the architect regardless — it is the fifth, lightest seed (file-scope hint, already in `00-state.md`; no re-ask needed).

### 10.3 Hard invariants

- **HI-E2-1 — Prior, not order.** The seed is a strong prior for the architect, not a mandate. The architect evaluates alternatives the seed did not consider and dissents when the seeded approach is deficient.
- **HI-E2-2 — No security fields from seed.** `security_sensitive` and all gate-status fields remain input-independent of seed content. HI-2 (§6) applies unchanged.
- **HI-E2-3 — No gate skipped.** `spec_seed_present: true` never marks any Phase Checklist item as skipped. Specify (Phase 0b), Design (Phase 1), ratify-plan (1.5), and plan-review (1.6) all run in full.
- **HI-E2-4 — Recoverable.** `spec_seed_present` and `spec_seed_dissents` are plain-text key:value fields in `00-state.md § Current State`; `00-spec-seed.md` is human-readable prose. Both survive context compaction without re-interrogating the manifest.

---

## 11. Initiative detection — multi-project grouping (opt-in)

This section is the full contract for the Step 6d-initiative sub-step in `agents/orchestrator.md`. It runs during Discover, after framing and before the intake survey.

### 11.1 Purpose and gating

An **initiative** is an operator-named grouping of separate per-project pipeline runs that logically form one multi-project effort. The initiative layer is a **path-prefix insertion plus a parent index (`overview.md`)** — it never merges pipelines or creates a shared `01-plan.md`. Every per-project pipeline remains isolated; the overview is an additive living index.

All initiative behaviour is gated on `initiative: {slug}` in `00-state.md`. When `initiative == null` (the default), no code path, no path expression, and no artifact differs from the pre-initiative behaviour. The `null` value is the backward-compatibility guarantee.

### 11.2 Detection signals

Three signals may fire during Discover; none auto-creates the initiative — all require confirmation:

| Signal | Source | Weight |
|--------|--------|--------|
| Operator declaration | Operator's message names an initiative explicitly | Primary — the slug is extracted from the operator's own label |
| Existing-folder inspection | Obsidian: glob `{logs-path}/{logs-subfolder}/{repo_base}/*_{slug}/overview.md`; Local: glob `{common-parent-of-cwd-repo}/*_{slug}/overview.md`; confirm by `initiative:` frontmatter | Join aid — surfaces a candidate to rejoin |
| Sibling-directory inspection | Parent of cwd repo contains sibling repos with `.git` | Proposal aid only — a prompt to ask, never a trigger |

**Generic-root guard (hard rule):** if the parent directory basename matches any of `projects`, `repos`, `src`, `code`, `dev`, `work`, `git`, `home` (case-insensitive), do NOT propose initiative grouping on directory layout alone. The generic-root signal is filtered out before the confirmation prompt is emitted.

### 11.3 Confirmation gate (hard gate — never auto-create)

After any signal fires, the orchestrator emits a single confirmation prompt:

```
This task appears to be part of initiative "{slug}".
Overview location: {mode-resolved overview path}
Set initiative to "{slug}" and create/join the overview? [Y/n]:
```

Then WAIT. On Y → set `initiative: {slug}` and proceed to Phase 0a Step 1f. On n (or no signal) → set `initiative: null` and proceed exactly as today.

The initiative slug is validated to `[a-z0-9-]`, max 60 chars (same rule as the feature-name slug). No slashes, dots, or `..` are permitted.

### 11.4 Cross-run JOIN contract

An initiative spans multiple separate pipeline runs (one per project, possibly across sessions and days). When `initiative` is set, Phase 0a Step 1f finds or creates `overview.md` using the **date-agnostic glob + frontmatter-confirm** rule:

1. Glob `{repo_base}/*_{slug}/overview.md` (Obsidian) or `{common-parent}/*_{slug}/overview.md` (local) — the `*_` wildcard absorbs any `{YYYY-MM-DD}_` prefix so a later-day run matches the day-1 dated folder.
2. For each candidate, confirm `initiative: {slug}` in frontmatter — the frontmatter slug is the authoritative key.

- **CREATE** — if no candidate confirms: write it from the template in `agents/orchestrator.md § overview.md Template`; the new folder carries today's date prefix (`{YYYY-MM-DD}_{slug}`).
- **JOIN** — on first confirmed match: read-modify-write, replacing this project's row in-place if it exists, appending a new row if absent. Rows are keyed by `project` slug; no row is ever duplicated.

The join is idempotent: running the same project's pipeline twice updates its single row.

### 11.5 Hard invariants

- **Never auto-create.** No initiative folder, no `overview.md`, no `initiative` state field, and no path-prefix insertion happen without an explicit Y at the confirmation gate.
- **Backward-compatible.** `initiative == null` produces byte-identical behaviour to any pre-initiative run.
- **Best-effort overview writes.** A write failure on `overview.md` logs a WARN and continues. The per-project pipeline never fails on an overview error.
- **Local-mode per-project workspace unchanged.** In local mode, `base_path = "workspaces"` is not re-prefixed when an initiative is set. Only the overview location changes (common parent of sibling repos under a date-prefixed `{YYYY-MM-DD}_{initiative}/` folder).

---

## 12. Background research sweep (non-blocking, narrow trigger)

The orchestrator may launch a parallel haiku research fan-out during Discover when a genuine external knowledge gap is detected. This is the `Step 6d-background-sweep` in `agents/orchestrator.md`.

### 12.1 Trigger conditions (ALL must hold)

The background sweep fires only when ALL of the following are true:

1. **External knowledge gap exists.** The task involves a library, framework, migration, or external tool whose facts are NOT available from the repo itself (no relevant `docs/knowledge.md` entry, no existing spec or migration guide in the codebase).
2. **The gap is a factual external question.** Examples that qualify: "does library X support tree-shaking as of v3?", "what is the migration path from Express v4 to v5?", "are there known security issues in package Y at this version?". Examples that do NOT qualify: "where is the auth module?", "what does the orchestrator do at Phase 3?", "how is feature X implemented?" — those are codebase-answerable questions.
3. **The gap is material.** The architect would spend non-trivial time on raw WebSearch at Phase 1 without the pre-digested findings.

### 12.2 What fires

When the trigger conditions hold:
- N `researcher` (haiku) agents are dispatched in parallel (default N=3, hard cap 5) with distinct search angles for the topic.
- Each lane writes a per-angle `research-findings-{angle}.md` to the workspace.
- Dead or empty lanes record a `research.lane.skipped` event (fail-open — never blocks the intake conversation).
- After all lanes complete, `research-consolidator` (sonnet) merges findings into `workspaces/{feature}/research-findings-discover.md`.
- A `research.background_sweep.complete` event is recorded in `{events_file}`.

### 12.3 What does NOT fire

- The sweep NEVER modifies `discover_state`, `checkpoint_advance_fresh`, or `functional_clarity_confirmed`. Discover continues independently.
- The sweep is NOT an advance signal and never auto-advances the pipeline.
- The sweep NEVER runs for code-location questions or any question answerable from the codebase.
- The sweep NEVER blocks the dialogue. If the fan-out is slow, the orchestrator continues the conversation; the findings are opportunistically available at Phase 1.
- **The sweep is single-pass.** The gap-closure loop (bounded multi-round follow-up dispatch governed by the round counter and gap gate in `agents/ref-special-flows.md § Research Flow`) applies ONLY to the primary `/th:research` flow, never to the background sweep. The sweep runs its researcher fan-out once, produces one `research-findings-discover.md`, and stops — no structured gaps block is evaluated, no follow-up rounds are dispatched, and no round counter is incremented.

### 12.4 Availability at Phase 1

When the advance signal fires and the architect is dispatched for Phase 1, the orchestrator checks for `research.background_sweep.complete: true` in `{events_file}`. When found:
- The architect dispatch prompt includes the path `workspaces/{feature}/research-findings-discover.md`.
- The architect reads the pre-digested findings as its primary external evidence base (same as the primary research flow path per `agents/architect.md § Research Mode — Process § Step 2`).
- The architect may spot-fetch to fill specific gaps the consolidator flagged but does not re-run broad WebSearch passes over already-covered angles.
