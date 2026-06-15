# Observability — operation.* Event Schema

> Supplementary schema for sub-pipeline operations. This document defines the
> `operation.*` event family and its placement within the mandatory
> `00-execution-events.{jsonl|md}` contract.

## What operation.* is

`operation.*` is an **optional, additive** event family that agents and skills
emit for discrete internal operations (config-load, MCP connectivity probe,
initialization, tool call). It is nested inside the existing
`00-execution-events.{jsonl|md}` file — it is NOT a separate file. No existing
`phase.*` or `gate.*` contract is modified; `operation.*` events coexist in the
same stream, distinguished by the `event` field prefix.

## Schema

```json
{
  "event":      "operation.started" | "operation.success" | "operation.failed",
  "operation":  "config-load" | "mcp-verify" | "initialization" | "<short-verb-phrase>",
  "status":     "started" | "success" | "failed",
  "detail":     "<optional — one-line machine context, NO secrets>",
  "error":      "<present only when status=failed — one-line error summary>",
  "suggestion": "<present only when status=failed — one-line recovery step>",
  "timestamp":  "<ISO-8601>",
  "phase":      "<optional — pipeline phase this operation belongs to>"
}
```

### Field rules

| Field | Required | Notes |
|-------|----------|-------|
| `event` | always | Prefix `operation.` distinguishes from `phase.*`/`gate.*`/`session.*` |
| `operation` | always | Short verb phrase identifying the operation |
| `status` | always | Mirrors the `event` suffix: started / success / failed |
| `detail` | optional | Machine context only — no secrets, no tokens, no credentials |
| `error` | when failed | One-line error summary — no raw stack traces, no secrets |
| `suggestion` | when failed | One-line recovery step for the operator |
| `timestamp` | always | ISO-8601 |
| `phase` | optional | The pipeline phase this operation belongs to |

### Secret prohibition

`detail` and `error` are log fields. They MUST NOT contain secrets, tokens,
bearer credentials, or other sensitive values. Use mechanical context only
(e.g., `"detail": "config file path: ~/.claude/.team-harness.json"`). The same
KG content policy that governs knowledge-graph nodes applies here.

## Placement in 00-execution-events

`operation.*` events are written as additional JSONL lines within the existing
`00-execution-events.jsonl` (local mode) or inside the `jsonl` fence in
`00-execution-events.md` (Obsidian mode). They are optional additions to a
valid pipeline trace — a pipeline that emits no `operation.*` events is still
valid.

Example (local mode `.jsonl`):

```jsonl
{"event":"phase.start","phase":"2","timestamp":"2026-05-28T14:00:00Z"}
{"event":"operation.started","operation":"config-load","status":"started","timestamp":"2026-05-28T14:00:01Z","phase":"2"}
{"event":"operation.success","operation":"config-load","status":"success","detail":"loaded ~/.claude/.team-harness.json","timestamp":"2026-05-28T14:00:01Z","phase":"2"}
{"event":"operation.started","operation":"mcp-verify","status":"started","timestamp":"2026-05-28T14:00:02Z","phase":"2"}
{"event":"operation.failed","operation":"mcp-verify","status":"failed","error":"connection refused on port 3000","suggestion":"check Memory MCP URL in ~/.claude/.team-harness.json","timestamp":"2026-05-28T14:00:03Z","phase":"2"}
```

## Who writes operation.* events

The orchestrator is the exclusive writer of `00-execution-events.*` during
pipeline runs. In that context, agents return operation metadata in their status
blocks; the orchestrator propagates it.

Standalone skills (`/th:setup`, `/th:lint`, `/th:kg`) that execute outside
a pipeline context write their own `operation.*` events only when a workspace
and events file exist. When no workspace exists (one-shot invocation), these
skills apply the same output discipline — silence on success, one-line error +
suggestion on failure — without event persistence.

## overview.md — initiative parent index (NOT an events file)

When the `initiative` field in `00-state.md` is set, the orchestrator also
maintains a parent-level `overview.md` at the initiative root. This file is
**not an events file** and does not contain pipeline observability data. It is
a living index — one row per project, updated by the orchestrator at intake and
by the delivery agent at Step 11.7.

**What it is:**
- A snapshot of the current state of the initiative (project rows with branch /
  version / PR / status).
- A cross-project narrative (`## Functional Description` and `## Big-Picture Plan`)
  that no single `01-plan.md` owns.

**What it is NOT:**
- Not an execution-events file. No JSONL. No `phase.*` or `operation.*` events.
- Not a replacement for `00-state.md` or `00-execution-events.*`. Those per-project
  files remain the per-project observability record.
- Not subject to the mandatory observability invariant (CLAUDE.md §5 "Pipeline
  observability is mandatory") — that invariant governs `00-execution-events.*`
  only. `overview.md` writes are **best-effort** and a write failure never
  fails the pipeline.

**Location (mode-dependent):**
- Obsidian: `{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}/overview.md`
- Local: `{common-parent-of-sibling-repos}/{YYYY-MM-DD}_{initiative}/overview.md`

Full template and section-ownership map: `agents/orchestrator.md § overview.md Template`.

## Initiative-level fan-out trace (parallel multi-project dispatch)

When the orchestrator fans out 2+ projects concurrently (see `agents/orchestrator.md § Parallel Multi-Project Dispatch`), an **initiative-level** `00-execution-events` file is written in addition to each project's per-project trace. This file is separate from `overview.md` (which is NOT an events file) and from the per-project `00-execution-events.*` (which remain per-project, unchanged).

**Location:**
- Obsidian: `{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}/00-execution-events.md`
- Local: `{common-parent-of-sibling-repos}/{YYYY-MM-DD}_{initiative}/00-execution-events.jsonl`

**Fan-out lifecycle events** (written by the orchestrator into the initiative-level file):

| Event | Fields | When emitted |
|-------|--------|--------------|
| `fanout.start` | `initiative`, `eligible_projects[]`, `cap` | Before the first concurrent Task dispatch |
| `fanout.lane.start` | `project`, `initiative` | When a lane's Stage-2 Task call is dispatched |
| `fanout.lane.end` | `project`, `initiative`, `status` (success/failed/iterating) | When a lane's Stage-2 work completes or is blocked |
| `fanout.converge` | `initiative`, `lanes[]` (project + status per lane) | When all lanes have reached the re-convergence barrier |

Each event carries a `project` key so `/trace` can group events by lane and render the parallel region side-by-side.

**Per-project traces are unchanged.** Each project continues writing its own `{project}/00-execution-events.*` file with its per-phase `phase.start` / `phase.end` / `gate.*` events exactly as today. The initiative-level file is additive — it carries only fan-out lifecycle events, not per-phase detail.

**`/th:pipelines` rendering:** when an initiative has a live fan-out, `/th:pipelines` shows the initiative as a parent row with each concurrent project as a child lane row (Stage / Phase columns per lane). This reuses the Stage/Phase surfacing exception already documented for `/th:pipelines`.

**`/trace` rendering:** `/trace` reads the initiative-level fan-out events to render the parallel region (lanes side-by-side with start/end timestamps) and can drill into any lane's per-project trace. The `--cost` rollup sums token counts across all lanes for an initiative-level cost figure.

**Mandatory + additive, not mandatory for single-project runs.** The initiative-level `00-execution-events` file is only written when a fan-out is actually dispatched. Single-project runs (`initiative: null`) and serial multi-project runs do not produce this file. The file is mandatory for any run where `fanout.start` fires — a fan-out that emits no initiative-level trace violates the observability contract.

## kg_write event

`kg_write` is a **sibling event** (peer of `phase.*` / `gate.*` / `operation.*`) emitted by the orchestrator after each Knowledge Graph write batch. Unlike `operation.*`, which models a single discrete operation, a KG write site may attempt multiple writes in one batch; `kg_write` carries per-batch counters (`attempted`, `succeeded`) and a per-write `writes[]` array so `/th:trace` can aggregate across all three write sites.

**Shape:**

```json
{
  "ts":        "<ISO-8601 with timezone>",
  "event":     "kg_write",
  "feature":   "<kebab-case, matches workspaces folder>",
  "phase":     "6-knowledge-save | 3-verify | 4-delivery",
  "site":      "phase6-knowledge-save | security-finding | delivery-passive-capture",
  "attempted": "<int — writes attempted in this batch>",
  "succeeded": "<int — writes that completed with create_nodes/add_observations>",
  "writes": [
    { "reason": "ok",                      "detail": "<optional — e.g. 'create_nodes: prisma-sqlite-enum'>" },
    { "reason": "skipped:mcp-down",        "detail": "<optional — verbatim from doctor or error, NO secrets>" },
    { "reason": "skipped:malformed-call",  "detail": "<optional — tool name or arg error>" },
    { "reason": "skipped:policy-filtered", "detail": "<optional — e.g. 'content-policy: user-path'>" }
  ]
}
```

**Field rules:**

| Field | Required | Notes |
|-------|----------|-------|
| `ts` | always | ISO-8601 with timezone (same convention as every trace event) |
| `event` | always | Literal `"kg_write"`. One type, no state suffixes. |
| `feature` | always | Kebab-case, matches the workspaces folder |
| `phase` | always | Pipeline phase where the write occurs |
| `site` | always | Discriminator for the write site. Closed vocabulary: `phase6-knowledge-save`, `security-finding`, `delivery-passive-capture` |
| `attempted` | always | Count of writes attempted. `0` when the site decided nothing to write (e.g., no reusable learning) |
| `succeeded` | always | Count of effective writes (`create_nodes` / `add_observations` returned without error). Always `≤ attempted` |
| `writes` | always | Array, one entry per attempted write. `length == attempted`. Empty array `[]` when `attempted == 0` |
| `writes[].reason` | always | One of the 4 reason codes below |
| `writes[].detail` | optional | Mechanical context only — **same secret prohibition as `operation.*`**: no tokens, no bearer credentials, no private URLs, no user-path identifiers |

**Consistency invariant:** `succeeded == count of writes[] entries where reason == "ok"` and `attempted == writes.length`. `/th:trace` validates and aggregates using this invariant.

**Reason vocabulary (4 codes):**

| `reason` | Meaning | Derives from |
|----------|---------|--------------|
| `ok` | Write was effective (`create_nodes` / `add_observations` returned without error) — OR a content-quality gate legitimately decided not to write (the seam worked; the gate found nothing to persist). Distinguish with `succeeded`: a quality-gate skip is `ok` with `detail: "content-gate: <reason>"` and does NOT increment `succeeded`. | Successful MCP return, or content-quality gate decision (`low-specificity`, `type-mismatch`, `no-reusable-learning`, dedup→merge) |
| `skipped:mcp-down` | The MCP seam is unreachable, degraded, or not wired — the write could not be attempted due to infrastructure. This is the code that would have fired for the `create_entities` naming bug (PR1). | `doctor` degraded/error, MCP unreachable, tool not wired |
| `skipped:malformed-call` | The tool call failed due to a non-existent tool name or malformed arguments (not infrastructure). This is the exact code for the renamed-tool class of bug. | tool-not-found, invalid args, schema rejection by the MCP not caused by connectivity or policy |
| `skipped:policy-filtered` | The content-policy filter or an MCP `policy/*` return discarded the write. | Content-policy drop, MCP `policy/<code>` response |

**Why a sibling event, not `operation.end`:** `operation.*` models one discrete operation with three states (`started` / `success` / `failed`) and no counters. A Phase 6 batch may write up to 5 nodes, with some `ok` and others `skipped:policy-filtered` in the same run. Forcing that into `operation.end` would require either one event per node (multiplies noise) or adding counters to `operation.*` (breaks its single-operation schema for every non-KG use). A sibling event `kg_write` with `attempted` / `succeeded` / `writes[]` expresses the batch in one line without contaminating `operation.*`. This does NOT violate the "no parallel KG-namespaced events" rule in the orchestrator — that rule prohibits a **family** with state suffixes (`kg.started` / `kg.success` / `kg.failed`); `kg_write` is a **single event type** with no suffixes. See the orchestrator's "Emitting kg_write events" subsection for the full rationale and the explicit exception.

## Cost rollup

This section defines the cost-visibility surface introduced in Phase B of the
pipeline-collaboration-cost-redesign programme. It covers: (a) the price table
key format in `~/.claude/.team-harness.json`; (b) the schema of the `## Cost`
section in `00-pipeline-summary.md`; and (c) the derivation rule shared by the
orchestrator summary writer and the `/th:trace --cost` skill.

### Price table — `pricing` key in `~/.claude/.team-harness.json`

The price table lives in a namespaced `pricing` key within the single-config-file
`~/.claude/.team-harness.json`. The orchestrator and the `/th:trace --cost` skill
read it at render time; they never write to it. Maintenance is the operator's
responsibility — Anthropic changes prices without notice.

**Format:**

```json
{
  "pricing": {
    "opus":   { "input": 15.0, "output": 75.0 },
    "sonnet": { "input":  3.0, "output": 15.0 },
    "updated": "2026-06-02"
  }
}
```

Field definitions:

| Field | Type | Notes |
|-------|------|-------|
| `pricing.opus.input` | float | USD per 1 M input tokens for any `claude-opus-*` model |
| `pricing.opus.output` | float | USD per 1 M output tokens for any `claude-opus-*` model |
| `pricing.sonnet.input` | float | USD per 1 M input tokens for any `claude-sonnet-*` model |
| `pricing.sonnet.output` | float | USD per 1 M output tokens for any `claude-sonnet-*` model |
| `pricing.updated` | string | ISO date of the last price check — operator-maintained |

**Degradation rule.** When the `pricing` key is absent, malformed, or any required
sub-field is missing, every surface that computes cost MUST fall back to displaying
tokens only, with the line:

```
price table not configured — showing tokens only
```

Never invent a price, never fail, never crash.

**Model classification.** Phases whose primary agent runs on `claude-opus-*` use the
`opus` prices; phases on `claude-sonnet-*` (or any other model) use the `sonnet`
prices. When `tokens_in` / `tokens_out` are both present in the `phase.end` event,
compute cost as `(tokens_in × input_rate + tokens_out × output_rate) / 1_000_000`.
When only the total `tokens` is present, use `tokens × (input_rate + output_rate) / 2`
as a conservative blended estimate and mark the result with `(~)`.

### `## Cost` section schema for `00-pipeline-summary.md`

The orchestrator appends a `## Cost` section to the pipeline summary whenever it
rewrites the file (every phase transition). The section derives entirely from the
`phase.end` events in `00-execution-events.{md,jsonl}` — it is a render of the
trace, not an independent source.

**Schema:**

```markdown
## Cost
**Total tokens:** {N} ({measured|estimated} — {M} phases with tokens_estimated:true)
**Total cost:** ~${X.XX}  (or: price table not configured — showing tokens only)
**Architect runs:** {N}x ({N} phases with agent: architect — signal for multi-run cost)

| Agent | Phases | Tokens | % |
|-------|--------|--------|---|
| architect | {list} | {N} | {P}% |
| implementer | {list} | {N} | {P}% |
| ... | ... | ... | ... |
| **Total** | | **{N}** | 100% |

| Phase | Agent | Tokens | Cost |
|-------|-------|--------|------|
| 1-design | architect | {N} | ~${X.XX} |
| 2-implement | implementer | {N} | ~${X.XX} |
| ... | ... | ... | ... |
```

**Rendering rules:**

- `## Cost` is placed after `## Tool Effectiveness` and before `## Iterations` in
  the schema order.
- `tokens_estimated: true` on a `phase.end` event marks that phase's row with `(~)`.
  The section header reports the total count of estimated phases so the reader can
  assess reliability.
- When the price table is not configured, omit the `Cost` column from both tables
  and replace `~${X.XX}` with `—`.
- The "Architect runs" line is a cost-awareness signal: a feature where the architect
  ran 3 times spent 3× architect-tier tokens in Stage 1. It is not a quality judgment.
- In obsidian mode, extract the JSONL fence from `00-execution-events.md` before
  summing tokens (same `sed -n '/^```jsonl$/,/^```$/{/^```/d;p}'` pattern used by
  `/th:trace --tools`).

### Derivation rule

1. Read all `phase.end` events from `{docs_root}/{events_file}`.
2. For each event, extract `agent`, `phase`, `tokens`, and `tokens_estimated`.
3. Classify the agent's model tier: `architect` → `opus`; all others → `sonnet`
   (conservative default; override if the agent's frontmatter states a different model).
4. Compute cost per phase using the price table (see above). Sum to get total.
5. Build the per-agent and per-phase tables.
6. Count phases where `tokens_estimated == true` for the header annotation.
7. If the price table is absent or malformed, skip the cost columns and emit the
   degradation line instead.

---

## Relationship to the Output Discipline contract

The `operation.*` schema is the log target for the silent-on-success rule:

- **On success**: emit `operation.success` to the events file. No operator-facing output.
- **On failure**: emit `operation.failed` to the events file AND surface one line to the operator: `{error} — {suggestion}`.

Full behavioral contract: see `agents/_shared/output-template.md` § "Output Discipline".

---

## Working-agreement rationale (CLAUDE.md §5 long-form)

This section contains the extended rationale for the pipeline observability working-agreement declared in CLAUDE.md §5. It was relocated from CLAUDE.md to keep the main file under its size cap (pure relocation — zero behavior change).

### Why observability is mandatory, not best-effort

Skipping event appends to save tokens deletes the only signal available to diagnose pipeline health. The working-agreement is strict: **Writing observability events is mandatory.** Every pipeline run produces two artifacts in `workspaces/{feature}/`:

- `00-execution-events.jsonl` (local mode) — append-only event trace, machine-readable, queryable with `jq`
- `00-execution-events.md` (obsidian mode) — same trace wrapped in YAML frontmatter + `# Execution Events` heading + ` ```jsonl ` code fence

Both are written exclusively by the orchestrator. Agents return tool-usage counts in their status blocks; the orchestrator propagates them into the `tools` field of `phase.end` events and aggregates them into `00-pipeline-summary.md` (human-readable rollup, rewritten in full at every phase transition).

### tokens field on phase.end

Every `phase.end` event MUST include a `tokens` field (integer). When `Agent()`/`Task()` metadata is absent, estimate via `duration_min × 1500` (opus) / `× 800` (sonnet) and mark `tokens_estimated: true`. **Zero is forbidden** — a zero token count is indistinguishable from a missing field and breaks the cost rollup.

### kg_write write-integrity rollup

Every KG write emits a reason-coded `kg_write` event carrying `attempted`/`succeeded` counters and the closed vocabulary `ok | skipped:mcp-down | skipped:malformed-call | skipped:policy-filtered`. The `/th:trace` skill aggregates these into a write-integrity rollup so a silently-skipped KG write is never invisible.

### /trace as the canonical 30-second answer

The `/trace <feature>` skill is the canonical 30-second answer to "did this pipeline work and were the tools effective?". It detects both `.jsonl` (local) and `.md` (obsidian) formats automatically. The legacy `pipeline-metrics.json` / `done.yml` artifacts are deprecated in favor of the trace.

### Tier 0 carve-out

**Exception:** Tier 0 fixes (single-file ≤5-line trivial/docs, `workspaces: NONE` by design) are explicitly exempt from this observability invariant — they produce no workspace in which to write the events file. This is the only exception; all other pipeline types including Tier 1-4 bug fixes, features, refactors, and documentation flows are subject to the mandatory observability contract.

---

## Decision Ledger

`00-decision-ledger.{jsonl|md}` is a **new per-workspace append-only file** distinct from `00-execution-events.{jsonl|md}`. The two files answer different questions: `00-execution-events` answers "what happened, when, and how much?" (phase timing, durations, token counts, tool-counts, KG writes); `00-decision-ledger` answers "what was decided, why, and was a dangerous action gated?" (gate verdicts with rationale, operator approvals with reasoning, finding dispositions, and dry-run enforcement records).

**Anti-redundancy invariant (contract between the two files):** the decision-ledger records dispositions + rationale + dry-run enforcement ONLY. It NEVER records phase timing, durations, token counts, tool-counts, or KG write batches — those stay exclusively in `00-execution-events`. Where a gate fires, `00-execution-events` records the FIRING (timestamped, for the timeline) and the decision-ledger records the DECISION (verdict + rationale + disposition, for the audit). The two files JOIN on the shared `phase` / `stage` key.

### Purpose and scope

The decision-ledger provides a durable audit trail of every judgement call made during a pipeline run:

- **Gate verdicts** — why a plan-review or acceptance-gate passed, raised concerns, or failed.
- **Operator approvals** — what the operator explicitly approved or rejected at each STAGE-GATE, and any reason they gave.
- **Finding dispositions** — how security, QA, and reviewer findings were classified (accepted, deferred to watch-list, or rejected as non-applicable).
- **Dry-run enforcement** — when a deploy or migration action was routed through a dry-run / plan-only path before any apply, recording which existing hook gated the apply.

### Schema (4 event types)

Every line is a JSON object. One JSON object per line, append-only, never rewritten.

| Field | Required | Notes |
|-------|----------|-------|
| `ts` | always | ISO-8601 with timezone — injected by the orchestrator at write time (`date -Iseconds`). |
| `event` | always | One of: `gate-verdict`, `operator-approval`, `disposition`, `dry-run-enforced`. |
| `feature` | always | Kebab-case, matches the workspaces folder (same convention as `00-execution-events`). |
| `stage` | conditional | Stage number (`1`/`2`/`3`). Required for `gate-verdict` and `operator-approval` at a STAGE-GATE. |
| `phase` | conditional | Phase identifier (e.g. `1.6-plan-review`, `3-verify`, `3.5-acceptance-gate`). Required for internal-gate `gate-verdict` and for `disposition`. Shared JOIN key with `00-execution-events`. |
| `decision` | conditional | The decision value. For `gate-verdict`: `pass`/`concerns`/`fail`. For `operator-approval`: `approved`/`approved-autonomous`/`rejected`/`edit`/`ship`/`amend`/`abort`. For `disposition`: `accept`/`watch`/`reject`. Required for all three event types. |
| `subject` | conditional | What the disposition applies to (e.g. `SEC-finding: missing JWT signature verification`). Required for `disposition`. |
| `rationale` | always | One free-text sentence (≤240 chars) — WHY this verdict/approval/disposition. `"no reason given"` is the explicit value when the operator gave none. **Secret prohibition applies** — the `rationale` field MUST NOT contain tokens, credentials, private URLs, or user-path identifiers. Use mechanical context only (same policy as `operation.*` `detail` fields). |
| `action` | conditional | For `dry-run-enforced`: the deploy/migration action that was gated (e.g. `gcloud sql instances patch`, `prisma migrate deploy`). Required for `dry-run-enforced`. |
| `dry_run_ref` | conditional | For `dry-run-enforced`: how the dry-run was performed (`--dry-run`, `--validate-only`, `plan-only`, `migrate diff`). Required for `dry-run-enforced`. |
| `guard` | conditional | For `dry-run-enforced`: which existing deterministic floor gated the apply (`gcp-guard.sh`, `dev-guard.sh`, `policy-block.sh`). Required for `dry-run-enforced` — names the enforcement layer the ledger is auditing. |

**Disposition vocabulary** (`decision` field when `event == "disposition"`): `accept` (finding acknowledged and accepted as-is), `watch` (accept-with-followup; operator adds to a deferred list), `reject` (finding dismissed as non-applicable).

### Dual-format lifecycle

Mirrors `00-execution-events` exactly:

- **Local mode:** raw `00-decision-ledger.jsonl` — append one JSON object per line.
- **Obsidian mode:** `00-decision-ledger.md` — YAML frontmatter (`tags: [work-logs, {repo}, decision-ledger]`) + `# Decision Ledger` heading + ` ```jsonl ` fence, identical structure to `00-execution-events.md`.
- The orchestrator is the **exclusive writer**; append-only `>>` with a here-doc; never rewritten.
- **best-effort resilience:** if constructing or appending a ledger line fails, log the failure and continue — the pipeline NEVER hard-fails on a ledger emit error. The deterministic gate outcome and the `00-execution-events` trace remain the authoritative record.
- **Tier 0 carve-out:** Tier-0 fixes (`workspaces: NONE`) produce no decision-ledger (same exemption as `00-execution-events`).

### Example lines

```jsonl
{"ts":"2026-06-15T10:00:01-03:00","event":"gate-verdict","feature":"auth-jwt","phase":"1.6-plan-review","decision":"concerns","rationale":"Reviewer raised SEC-001: missing rate-limit on /login; AC-3 scope adjusted."}
{"ts":"2026-06-15T10:05:33-03:00","event":"operator-approval","feature":"auth-jwt","stage":"1","decision":"approved","rationale":"Operator accepted concerns; SEC-001 filed as follow-up issue #99."}
{"ts":"2026-06-15T10:42:11-03:00","event":"disposition","feature":"auth-jwt","phase":"3-verify","decision":"watch","subject":"SEC-finding: token expiry uses Date.now() without UTC normalisation","rationale":"Low-risk today; timezone bug possible in DST transition. Filed follow-up."}
{"ts":"2026-06-15T11:00:00-03:00","event":"dry-run-enforced","feature":"auth-jwt","action":"gcloud sql instances patch","dry_run_ref":"--validate-only","guard":"gcp-guard.sh","rationale":"Schema migration validated before apply; separate apply approval required."}
```

### Relationship to 00-execution-events

The two files are complementary — neither replaces the other:

| Concern | File |
|---------|------|
| When did each phase run? How long? How many tokens? | `00-execution-events` |
| What gate fired? (timeline marker) | `00-execution-events` (`gate.pass`/`gate.fail`/`stage.gate`) |
| Why did the gate reach that verdict? | `00-decision-ledger` (`gate-verdict` + `rationale`) |
| What did the operator say at the STAGE-GATE? | `00-decision-ledger` (`operator-approval` + `rationale`) |
| How was a security/QA finding classified? | `00-decision-ledger` (`disposition` + `subject`) |
| Was a dangerous action forced through dry-run first? | `00-decision-ledger` (`dry-run-enforced` + `guard`) |

The decision-ledger is queryable with `jq` and uses the same `phase`/`stage` key as `00-execution-events` so the two files can be joined on a shared identifier.
