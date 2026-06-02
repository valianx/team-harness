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
