# Orchestrator state, events and observability
<!-- Consumed by: agents/orchestrator.md, which is the sole writer of every file described here.
     Read on demand at the three points named in agents/orchestrator.md § "State, events and
     observability" — never preloaded at boot. Edit here; the orchestrator references this file
     by section and never restates its content. -->

Everything in this file is written by the orchestrator and by nothing else. No specialist writes coordination state: sole ownership is the one property that makes `00-state.md` trustworthy as the verifier's authority.

## Current State — the schema you write

`00-state.md § Current State` is **fields only**. Narrative belongs in `{events_file}`; the recovery instruction is the `next_action` field. Every field below is a bare literal — no second space-delimited token ever trails a value.

Where a field's semantics are defined elsewhere, this schema names the home and stops. It does not restate the rule.

```
pipeline_version: 2
lane: inline|express|full            # resolved at intake; docs/pipeline-lanes.md § 2
type: feature|fix|refactor|hotfix|enhancement
phase: 1|1.5|1.6|2.0|2|2.5|2.6|2.7|2.8|3|3.5|4|5|6
subphase: approach-check|structure-scan|post-approval-offer|null   # the within-phase steps: 1.0-approach-check, 1.5a, 1.8
stage: 1|2|3
status: in_progress|waiting|iterating|paused|paused_for_amend|complete|blocked|blocked-incomplete|verified
iteration: N/3
last_completed: {phase-name}
next_action: {what to do next}      # the successor to a prose recovery section
total_tokens: N
```

**Intake classification** — the orchestrator produces these, at intake, and they are never re-derived downstream.
```
security_sensitive: true|false
frontend_scope: true|false
bug_tier: 0|1|2|3|4|null
bug_tier_source: auto|operator|architect-promote|null
```

**Design classification** — `architect` produces these at Design time; the orchestrator transcribes them (next block). They do not exist at intake and the orchestrator never authors a value for them.
```
touches_http_api: true|false
touches_ui: true|false
touches_data_model: true|false
touches_cli: true|false
touches_public_lib_api: true|false
touches_async_messaging: true|false
destructive: true|false
spans_multiple_services: true|false
changes_security_control: true|false   # informational; NOT a dispatch predicate
```

Every field belongs to exactly one of these two blocks, with one producer and one production phase. `changes_security_control` sits in the second: it is a property of the designed change, so it cannot be known at intake. Before Design closes it is simply **absent** — never `null` standing in for "not yet decided", because an absent field and a decided-`false` field must not look alike to a reader. `security_floor_applies` derives from `security_sensitive` alone (`agents/orchestrator.md § Phase 3`), so nothing gated is waiting on the second block.

**Classification block — sketch triggers.** Eight booleans, **decided** by `architect` at Design time (`docs/plan-sketches.md § 2`) and **transcribed** into this file, read verbatim by `hooks/sketch-guard.sh`. Never re-derive a value; never author one. Copy what `architect` returned. Dash-prefixed, one boolean per line, exactly as the parser's own anchor requires (`^[[:space:]]*-[[:space:]]*{field}:[[:space:]]*true[[:space:]]*$`, `hooks/sketch-guard.sh:131`). `- touches_http_api:` is the parser's sole sentinel for `has_classification_block` (`:138`) — its absence alone hides all eight from the check, so never omit it even when its value is `false`.

### Where the values come from

`architect` returns them as a structured `classification:` field in its status block and mirrors them in `01-plan.md § Review Summary § Classification block`. It does **not** write `00-state.md`. On receiving the status block:

1. **Validate before transcribing.** All nine fields present (the eight above plus `changes_security_control`), each a bare `true` or `false`. A missing or non-boolean field, or a mismatch between the status block and the `01-plan.md` mirror, is `status: failed` for that dispatch — re-dispatch `architect` for the classification. Never fill a gap with your own judgement, and never transcribe a partially-valid block.
2. **Transcribe the nine values literally** into `§ Current State`, in the dash-prefixed shape above.
3. **Fail closed on absence.** If `architect` returned no classification at all and the phase required one, treat it as `changes_security_control: true` for scoping purposes and re-dispatch — never as all-false.

```
- touches_http_api: true|false
- touches_ui: true|false
- touches_data_model: true|false
- touches_cli: true|false
- touches_public_lib_api: true|false
- touches_async_messaging: true|false
- destructive: true|false
- spans_multiple_services: true|false
```

When the sketch verifier cannot read this state at all (missing file, unparseable), it fails **open** and reports `pass` with no distinguishing signal (`hooks/sketch-guard.sh:28-30`) — a silent-pass failure mode, not a silent-block one. Writing the block correctly, every run, is what keeps that fail-open path from ever being exercised in practice.

**Resolved config** — from `agents/orchestrator.md § Boot`.
```
logs_mode: local|obsidian
events_file: 00-execution-events.jsonl|00-execution-events.md
docs_root: {absolute path}
operator_language: en|es|pt|...
initiative: {slug}|null
project: {project-slug}|null                # agents/ref-dispatch-machinery.md
```

**Autonomy and rounds.**
```
autonomous: true|false
autonomous_granted_at: STAGE-GATE-1|null
current_round: R1|R2|...|null
total_rounds: N|null
prs_in_current_round: [Task-1, ...]|null
prs_completed: [Task-1, ...]|[]
lane_decomposition: {...}|null              # docs/parallel-batch-implementation.md
```

**Verification and review status.**
```
regression_test_path: {path}|null
regression_test_status: failing|passing|skipped|null
plan_review_status: not-applicable|deferred|reviewed-pass|reviewed-concerns|skipped|null
audit_status: pending|done|unavailable|null  # STAGE-GATE-3 is never prepared while pending
code_hygiene: pass|fail|null                # docs/code-hygiene-gate.md
open_findings: [{id, disposition}]|[]       # dispositions live in 00-decision-ledger.md
```

**`open_findings` — kept, with a schema and a named reader, never left as an unread promise.** The reader is the Recover safety contract: on `/th:recover`, any entry present with no matching `disposition` row in `00-decision-ledger.md` is surfaced to the operator as an unresolved carry-over before the next gate is prepared. An entry is written only by the orchestrator, only when a finding lands as a task AC or when `agents/orchestrator.md § "Finding disposition"` records it as accepted-without-AC — never populated speculatively, and never treated as the transport for a finding that has not gone through that disposition path.

**Gate fields — bare literals, never repaired.** Contract: `agents/_shared/gate-contract.md § "The dual-record release"` and its no-gate-field-repair invariant. The six named fields carrying this invariant are `gate1_release`, `gate3_release`, `gate_nonce`, `working_branch`, `worktree`, and `checkpoint_boundary` — every one a bare literal in the real file, with no second space-delimited token ever trailing a value.
```
gate1_release: approved|approved-autonomous|rejected|edit|null
gate3_release: ship|amend|abort|null
gate_nonce: {token}|null                    # fresh per presentation, consumed on release
```

**Branch and worktree topology.**
```
worktree: {absolute path}|null               # null when running branch-in-place
worktree_branch: {branch}|null
worktree_base: origin/main|{dep-branch}|null
working_branch: {branch}|null
```

`working_branch` has three producer sites and only the orchestrator writes any of them. **Worktree topology:** copied from `worktree_branch` at branch establishment. **Branch-in-place:** `null` until Phase 2 entry, which creates the branch and writes the field. **Phase 4:** a defensive backstop only, for the case it is somehow still `null`. It is set before any lane reaches its outward push.

Live consumers, so it is never treated as documentation: the record-based recover backstop, the operator reading the file, and the executable branch comparisons in `implementer`, `tester`, and the Phase-2-close commit-integrity check. On the Claude Code plugin path no wired hook reads it — `gate-guard` and `checkpoint-guard` are both unwired. `opencode`'s own plugin wiring registers `checkpoint-guard` independently; that is outside this contract's scope.

**Checkpoint fields.**
```
functional_clarity_confirmed: true|false     # DERIVED CACHE — the checkpoint.confirmed event is the authority
functional_clarity_artifact: {statement}     # DERIVED CACHE — same event
checkpoint_boundary: intake-plan|null        # armed at Phase 1 entry, cleared when the architect dispatch clears
checkpoint_advance_fresh: true|false         # see note below
```

**`checkpoint_advance_fresh` — set it, and why it still exists.** One live consumer outside this runtime: `hooks/ts/bodies/checkpoint-guard.ts:335-340` denies an opencode `th:architect` dispatch unless this field AND `functional_clarity_confirmed` are both `true`, registered at `hooks/ts/opencode-plugin.ts:84` (unwired on the Claude Code path). Dropping the field would deny every `th:architect` dispatch on opencode while `checkpoint_boundary: intake-plan` is armed. Set it `true` alongside `checkpoint_boundary: intake-plan` at Phase 1 entry, on your own attestation. **Retiring it requires changing that consumer first** — `docs/decisions.md`.

**Permission provisioning.**
```
permission_provisioning_decline: obsidian|cross-repo|both|null   # session-scoped; `both` merges, never overwrites
```

> The `#` annotations above are documentation for the agent authoring the real file. They are never written into `00-state.md`.

**Dropped field:** `skip_delivery` — batch-lane mode retired with the fan-out.

## Execution events (canonical observability — mandatory)

`{docs_root}/{events_file}` is the canonical machine-readable trace. **The orchestrator writes every event** — specialists return status blocks, the orchestrator records them.

**Writing the trace is mandatory, not best-effort.** Skipping events under context pressure is the failure mode that killed the previous spec. An append is a single-line `>>` redirect; the cost is negligible against running a pipeline blind. **If you find yourself "saving tokens" by batching or skipping appends, you are deleting the only signal on whether the pipeline is healthy.**

**Observability floor — MUST NOT change.** The format bounds below bound FORMAT only. Every `phase.*`/`gate.*` event still fires, unchanged, at every phase transition and every gate — **no format bound ever removes an event.** The only exemption is the Tier-0 carve-out (single-file ≤5-line trivial/docs fixes, `workspaces: NONE` by design). No other type, tier or lane is exempt.

### Schema

| Field | Required | Notes |
|---|---|---|
| `ts` | yes | ISO-8601 with timezone |
| `event` | yes | `phase.start`, `phase.end`, `gate`, `gate.pass`, `gate.fail`, `iteration.start`, `stage.gate`, `stage.gate.release`, `stage.gate.skipped`, `stage.notify`, `stage.notify.skipped`, `stage2.hygiene`, `stage2.lane.*`, `plan_structure`, `plan_review.deferred`, `plan_review.offered`, `plan_review.offer_declined`, `plan_review_integrity`, `kg_write`, `artifact.missing`, `operation.started/success/failed`, `pipeline.start`, `pipeline.complete`, `pipeline.incomplete`, `pipeline.end`, `checkpoint.confirmed`, `compaction.trigger` |
| `feature` | yes | kebab-case, matches the workspace folder |
| `phase`, `stage` | conditional | `stage` required for `stage.gate*` |
| `agent` | conditional | required for `phase.*` |
| `status` | conditional | `success`/`failed`/`blocked`/`skipped` |
| `duration_ms`, `tokens`, `tokens_in`, `tokens_out`, `tokens_estimated` | conditional | per the token-tracking rule |
| `verdict` | conditional | `pass`/`concerns`/`fail`/`partial-fail` |
| `decision` | conditional | required for `stage.gate.release` |
| `cause` | conditional | `operator`/`verification` — required for `iteration.start` |
| `provenance` | conditional | required for `checkpoint.confirmed`; a **closed enum, never free text**, and never subject to the bound below |
| `tools`, `model`, `effort` | optional | propagated verbatim from the returning status block |
| `extra` | optional | event-specific |

**Never pretty-print** — one JSON object per line, append-only. In obsidian mode the same JSONL lives inside a ```` ```jsonl ```` fence; extract with `sed -n '/^```jsonl$/,/^```$/{/^```/d;p}'` before piping to `jq`.

### Free-text bound

Every free-text field — `operation.*`'s `detail`/`error`/`suggestion`, `kg_write.writes[].detail`, `plan_structure.extra.detail`, and the notification `{summary}` — is **one compact clause, ≤120 chars**, never multi-sentence narrative, stripped of `\n\r\t` and quote characters. **Format only:** it never reduces one-object-per-line and never substitutes for an event.

**One named exception, additive: the `checkpoint.confirmed` confirmatory text.** ≤280 chars (one confirmatory turn, not the surrounding conversation). Quotes and `\n\r\t` are **escaped as JSON string escapes, never stripped**, so the operator's exact characters survive. Every backtick is escaped at the byte level with its unicode escape (U+0060) rather than left literal — this protects the JSONL fence obsidian mode wraps the trace in, which the quote escape alone does not. Truncation past the bound is marked visibly with `…[truncated]`. The secret prohibition is unaffected: a confirmation carrying a credential records `provenance` and `withheld — secret prohibition` in place of the text. Altering the recorded characters inside the bound is exactly the stripping this exception exists to avoid.

### `tools` propagation

| Status-block line | `tools` sub-object |
|---|---|
| `context7_consult: hit:N miss:N skipped:M` | `"context7": {"hit", "miss", "skipped"}` |
| `memory_consult: search_nodes:N open_nodes:N` | `"memory": {"search_nodes", "open_nodes"}` |
| `kg_save_candidates: [a, b]` | `"kg_save_candidates": [...]` |

Omit sub-objects not reported; omit `tools` entirely if none.

### `kg_write`

One event per write batch, stamping the literal `site`. With capture off the automatic path, the live site is the audit's security-finding write (`site: security-finding`); an on-request save stamps its own. Closed 4-value reason vocabulary: `ok`, `skipped:mcp-down`, `skipped:malformed-call`, `skipped:policy-filtered`. Best-effort — never changes control flow.

**`kg_write` is deliberately singular.** Do not introduce `kg.started`/`kg.success`/`kg.failed`. Silent-on-success knowledge operations use `operation.*` with a `detail` discriminator; `kg_write` is the one exception to that family — a batch-with-counts event `operation.*` cannot express without contaminating its single-operation schema.

### Reconciliation backstop

At every gate emission, before the block: count `[x]` checklist rows against `phase.end` events and backfill any gap with `tokens_estimated: true` + `backfilled: true`, deriving `duration_ms` from trace breadcrumbs when available, else the heuristic. **Never overwrite a measured event.**

## Decision ledger

`{docs_root}/00-decision-ledger.{jsonl|md}` — append-only, distinct from the events file. Records durable decision dispositions, rationale, and dry-run enforcement **only** — never phase timing, tokens, or tool counts, which stay in the trace. **The orchestrator is the exclusive writer.**

**Write sites:** `gate-verdict` (after 1.5/1.6/3.5 and at every gate emission — the verdict already computed plus a one-sentence rationale); `operator-approval` (every gate reply — the decision already recorded, plus the rationale from the operator's own text or `"no reason given"`); `disposition` (a finding accepted, watched or rejected at a gate, or per-comment during an apply-review round — a `ship` over an open `broke-it` is this site, as `disposition: ship-over-finding` with the finding verbatim); `dry-run-enforced` (a deploy or migration routed through dry-run first).

**Confidence is not approval.** A high-confidence plan or a green suite never substitutes for the operator's gate decision.

## Pipeline summary

`{docs_root}/00-pipeline-summary.md` — rewritten **in full, never appended**, at four mandatory checkpoints: the STAGE-GATE-1 emission, Freeze, every `iteration.start`, and pipeline end. Rewriting at other transitions is best-effort.

Sections: `## TL;DR`, `## Phase Timeline`, `## Dispatch Issues`, `## Tool Effectiveness`, `## Verification Packet`, `## Cost`, `## Iterations`, `## Files Changed`. Field-by-field derivation: `docs/observability.md § Pipeline Summary Protocol` and `§ Cost rollup`.

**Every number derives from the trace — never re-invented by walking workspaces.** The summary is a render of the trace, not an independent source of truth. `## Iterations` references each round **by ID only** and never re-tells what happened in it; the narrative lives only in `failure-brief.md`.

**Failures:** a failed write logs and retries at the next transition. Counts disagreeing with the trace → the trace wins. Trace missing → render `(no trace recorded)` placeholders, never crash.

## Stage-end notifications

One OS-native toast at the close of each of the four stages, independent of autonomy mode and outcome, via `hooks/ts/dist/notify-stage.cjs` invoked through the orchestrator's own `Bash`. **Construct the JSON payload with `python3 -c "json.dumps(...)"` and positional arguments — never string-interpolated into a single-quoted `echo`** (CWE-78).

| Stage | Fires at | Title on success |
|---|---|---|
| 1 analysis | Phase 1.6, before the gate block | `Pipeline {feature} · Stage 1 (analysis) complete` |
| 2 implementation | the implementer pass closes | `Pipeline {feature} · Stage 2 (implementation batch) complete` |
| 3 freeze | Freeze closes | `Pipeline {feature} · frozen, verification starting` |
| 4 ship decision | Phase 3.5, before the gate block | `Pipeline {feature} · ready for your ship decision` |

Fail or block appends `FAILED`/`BLOCKED`.

**A notification never claims work that has not run.** Rows 3 and 4 fire where the operator needs to look — the tree is frozen, the ship decision is pending — not at the completion of verify or delivery, neither of which has happened there. The fire points are correct; the labels say what is actually true at them.

**Idempotency — structural parse, never `grep`.** Before firing, count prior `stage.notify` events with the same `stage` by JSON-parsing the trace; non-zero → skip and append `stage.notify.skipped (reason: already-fired)`. An unanchored substring match can false-positive on summary text containing the event name.

```bash
if [ "$(python3 -c "import json; print(sum(1 for l in open('{docs_root}/{events_file}') if json.loads(l).get('event')=='stage.notify' and json.loads(l).get('stage')==N))" 2>/dev/null || echo 0)" = "0" ]; then
```

One call site per stage, substituting `N`. In obsidian mode, extract the JSONL from the fence first.

**Sanitisation:** `{feature}` matches `^[a-z0-9-]{1,60}$`; `{summary}` ≤120 chars, stripped of `\n\r\t` and quotes, truncated before payload construction; `{cwd}` the absolute project root; `{status}` one of `complete`/`FAILED`/`BLOCKED`.

**Failure-safety:** artifact missing → skip via `test -f` and append `stage.notify.skipped (reason: wrapper-missing)`. Entry-side failure is swallowed; `stage.notify` is appended regardless. **Never blocks the pipeline.**

## Phase checkpointing

After every phase transition, update `00-state.md`. This is the orchestrator's persistent memory: if context compacts, this file says exactly where it is.

### Transition protocol — atomic, all three steps, never partial

**Marking a checklist item `[x]` and appending its `phase.end` are ONE inseparable step** — never write one without the other in the same pass.

1. **Append the event first.** `phase.start` before dispatch, `phase.end` after the agent returns (with `tokens`, `duration_ms`, `tools`, `model`, `effort`), `gate` when a gate is reached. **First, because events are append-only and must reflect real time** — backfilling later loses timestamp accuracy.
   **Token tracking is mandatory.** Every `phase.end` carries `tokens`: from the call result metadata when available, otherwise estimated (`duration_min × 1500` opus-heavy, `× 800` sonnet-heavy) with `tokens_estimated: true`. **`"tokens": 0` is forbidden.**
2. **Update `00-state.md`** — the `§ Current State` fields, the completed phase `[x]`, and the `§ Agent Results` row **upserted by `(agent, phase)` key**: overwrite in place on a same-key re-run across iterations, never append a duplicate. A new row appears only for a genuinely new key, so `tester` and `qa` at Phase 3 each keep their own current verdict and are never collapsed to one last-writer-wins value.
   *Narrative sections are gone.* There is no TL;DR to rewrite, no Hot Context to overwrite, and no prose recovery section: the events file carries the narrative and the `next_action` field carries the recovery instruction.
3. **Only then dispatch.**

**Enforcement:** never dispatch the next phase until the event is appended and the state file updated. If compaction lost the place, read the trace — when the last event does not match the last `[x]`, backfill before continuing.

**Merge and push guard:** never merge a PR or push until Phase 3 is `[x]` **and** STAGE-GATE-3 is cleared per the dual record. `"ship it"` outside that gate's own reply never overrides this. This rule — enforced by the orchestrator against itself, at the moment it would otherwise call the push step — is the actual mechanism that keeps a push from preceding its gate; no hook reads `gate3_release` to enforce the same order from outside.

### Artifact verification

After every dispatch returning `success`, verify the expected doc exists on disk before proceeding.

| Agent | Phase | Expected |
|---|---|---|
| `architect` | 1 design | `01-plan.md` + any triggered `sketches/*` |
| `architect` | 1 root-cause | `01-root-cause.md` **and** `01-plan.md` |
| `implementer` | 2 | `02-implementation.md` |
| `tester` | 2.0 | `02-regression-test.md` |
| `tester` | 2.7 | `03-testing.md` |
| `qa` | 3 | `reviews/04-validation.md` |
| `adversary` | 3 | `reviews/04-adversary.md` |
| `qa-plan` | 1.5 | `reviews/01-plan-review.md § Plan Ratification` |
| `plan-reviewer` | 1.6 | `reviews/01-plan-review.md § Plan Review` |
| `architect` | 1 | `reviews/01-closure-rubric.md` (Tier 2-4 only) |
| `delivery` | 4 | the delivery section of `00-state.md` |

Exists and non-empty → proceed. Otherwise append `artifact.missing` (`action: retry`) and re-dispatch **exactly once** with an explicit "your artifact was not found" instruction. A second failure → `artifact.missing` (`action: escalate`), `status: blocked`. This is the `artifact-missing` failure kind (`agents/orchestrator.md § Failures`).

**No agent in the table above is exempt.** `qa-plan` in ratify mode writes `reviews/01-plan-review.md § Plan Ratification` per the panel contract (`agents/_shared/plan-consolidation.md § "Section-ownership map"`), so its row is verified like any other. An exemption would only apply to an agent producing no artifact at all, and the table lists none.

### Final sanity check

After delivery returns `success`, before Phase 5:

1. Enumerate the `status: success` rows in `§ Agent Results`.
2. Resolve each expected artifact from the table above, excluding no-file rows.
3. Verify each exists and is non-empty.
4. Verify `00-pipeline-summary.md` exists, is non-empty, and contains `## Cost`.
5. Verify the trace exists and `phase.end` count ≥ the count of `[x]` checklist rows.

**Pass** → append `pipeline.complete`, proceed. **Fail** → append `pipeline.incomplete`, set `status: blocked-incomplete`, and STOP listing the missing artifacts. **Do not emit "pipeline complete."** Phase 5 does not execute. The PR already on remote stays valid; the operator resolves and resumes via `/th:recover`.

### Terminal status write — mandatory

Set `status: complete`. This is the record-based recover backstop's own precondition for excluding a finished pipeline from consideration as an active one: without this write, a shipped pipeline's state file stays a live-looking `gate3_release: ship`-carrying candidate indefinitely, and both the recover backstop and a human reading the file directly — the two actual live consumers of this field, not any hook — could mis-read it as still in progress on a later, unrelated run that happens to reuse the same branch name or worktree path.

Then append `## Final state — ready for handoff` (branch, version, PR, AC count, iterations, outcome) and surface the `/compact`-or-`/clear` prompt.

### Process reflection

Append: iterations and the root cause if any, the smoothest phase, the friction point, the prevention insight. **A `process-insight` entity is saved only for a non-obvious recurring pattern** — never a generic "everything went well," and only when the operator asked for a save.

**No mid-pipeline investigation writes.** The only knowledge operations added mid-pipeline are the reads on an R0 or build/lint failure and the audit's security-finding write. No others, at any point. The session stays open — those touchpoints never close it early.

## Flow telemetry

Cross-user flow-event emission, gated on `flow_telemetry.enabled` in `~/.claude/.team-harness.json`, read at boot alongside the other config. **Best-effort and non-blocking: telemetry never halts, fails, or delays a pipeline.** Field shapes and the emission contract: `docs/observability.md`. Disabled or absent config → emit nothing and say nothing.
