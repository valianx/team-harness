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

Standalone skills (`/th:setup`, `/th:lint`, `/th:memory`) that execute outside
a pipeline context write their own `operation.*` events only when a workspace
and events file exist. When no workspace exists (one-shot invocation), these
skills apply the same output discipline — silence on success, one-line error +
suggestion on failure — without event persistence.

## Relationship to the Output Discipline contract

The `operation.*` schema is the log target for the silent-on-success rule:

- **On success**: emit `operation.success` to the events file. No operator-facing output.
- **On failure**: emit `operation.failed` to the events file AND surface one line to the operator: `{error} — {suggestion}`.

Full behavioral contract: see `agents/_shared/output-template.md` § "Output Discipline".
