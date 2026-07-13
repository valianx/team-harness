# Integration Guide: team-harness ↔ context-harness-mcp

This document describes the end-to-end integration between **team-harness** (the Claude Code agent orchestration plugin) and **context-harness-mcp** (the Knowledge Graph memory server it connects to). It covers prerequisites, configuration, the tool contract, and troubleshooting.

---

## 1. Overview

**team-harness** is a Claude Code plugin that turns the chat into a Spec-Driven Development pipeline. It dispatches specialized subagents (architect, implementer, tester, qa, security, delivery) that coordinate across three mandatory stages. Between pipeline runs, agents need a place to store and retrieve technical memory — patterns discovered, errors fixed, architectural decisions made.

**context-harness-mcp** is the server that provides that memory. It is a Go-based MCP (Model Context Protocol) server backed by Postgres with pgvector for semantic search, ONNX embeddings computed locally, and a content filter (gitleaks + taxonomy) that enforces the write-time content policy. It exposes 16 MCP tools that the orchestrator and delivery agent call on a running pipeline's behalf.

The seam between the two products is a single HTTP endpoint and a `mcpServers.memory` entry in `~/.claude.json`. Nothing else crosses the boundary at runtime.

```
Claude Code
    │
    └── team-harness plugin
            │
            ├── orchestrator (Phase 6 knowledge-save + security-finding writes)
            ├── delivery agent (Step 11.5 passive capture)
            └── any agent reading the KG (search_nodes, open_nodes, read_graph)
                        │
                        │  HTTP (MCP protocol)
                        │
                        ▼
            context-harness-mcp
                        │
                        ├── Postgres + pgvector (node & relation storage)
                        ├── ONNX embeddings (local, no external API call)
                        └── content-filter (gitleaks + taxonomy, write-time)
```

---

## 2. Prerequisites

Before running `/th:setup`, verify the following are in place:

| Requirement | Status check | Where to get it |
|---|---|---|
| context-harness-mcp running | `curl <your-mcp-url>/mcp` returns a valid response | https://github.com/valianx/context-harness-mcp |
| context7 API key | Have the key value ready | https://context7.com/ |
| `gh` CLI (recommended) | `gh --version` | https://cli.github.com/ |
| Claude Code | Installed and authenticated | https://docs.claude.com/ |

**Deployment options for context-harness-mcp:**

- **Local Docker** — suitable for a single developer; URL will be `http://localhost:7654/mcp`.
- **Hosted** (Railway, Render, Fly.io, or any Docker host) — exposes a public HTTPS URL; recommended for teams sharing a KG.
- **Authenticated deployment** — adds a bearer token header; see Section 3.

---

## 3. The canonical `mcpServers` block

The MCP entry that team-harness reads is keyed `memory` in `~/.claude.json`. The key MUST be `memory` — `/th:setup` writes it under this key, and every agent references tools via the `mcp__memory__*` prefix. Using any other key (e.g., `context-harness`) causes the tool calls to silently fail.

### Unauthenticated (local Docker or open hosted)

```json
{
  "mcpServers": {
    "memory": {
      "type": "http",
      "url": "http://localhost:7654/mcp"
    }
  }
}
```

Replace `http://localhost:7654/mcp` with your actual server URL for hosted deployments:

```json
{
  "mcpServers": {
    "memory": {
      "type": "http",
      "url": "https://your-mcp.example.com/mcp"
    }
  }
}
```

### Authenticated deployment

When the context-harness-mcp instance requires a bearer token, add a `headers` field:

```json
{
  "mcpServers": {
    "memory": {
      "type": "http",
      "url": "https://your-mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

Do not store the token in any committed file. The `~/.claude.json` file is operator-private and not committed to any repository.

> **Key name note.** The context-harness-mcp `docs/auth.md` may show `"context-harness"` as the mcpServers key in its example snippet — that is an inconsistency being corrected in the CH repo. The canonical key is `memory` and `/th:setup` always writes it under that name.

---

## 4. End-to-end setup

### Step 1 — Start context-harness-mcp

Follow the context-harness-mcp repo's README for your deployment method. Confirm the server is reachable:

```bash
curl https://your-mcp.example.com/mcp
```

A valid MCP endpoint returns a JSON response (exact shape depends on the server version).

### Step 2 — Install the team-harness plugin

```
/plugin marketplace add valianx/team-harness
/plugin install th
```

### Step 3 — Configure with `/th:setup`

```
/th:setup
```

`/th:setup` prompts for:
- Memory MCP URL (the `context-harness-mcp` endpoint)
- context7 API key
- Workspace logs mode (`local` or `obsidian`)
- Obsidian vault path (if obsidian mode selected)

It writes the `mcpServers.memory` entry into `~/.claude.json`, writes `~/.claude/.team-harness.json` with the workspace settings, and performs a connectivity smoke test using the `read_graph` tool. A successful response means the transport layer is working.

### Step 4 — Verify

```
/th:setup
```

Re-run `/th:setup` — it re-runs the smoke test and reports connectivity status. A passing smoke test confirms the `read_graph` call returns without error.

To verify a full KG write, run any pipeline to completion. The first write occurs at Phase 6 (Knowledge Save). After the pipeline completes, run:

```
/th:trace <feature-name>
```

The trace output includes `kg_write` events with `attempted` / `succeeded` counters and per-write reason codes. `succeeded > 0` confirms an end-to-end write was effective.

### Step 5 — First pipeline run

```
@th:leader give me the work plan for this task: <your task description>
```

The first pipeline run exercises the full integration: the orchestrator reads the KG at Phase 6 (if any relevant prior art exists), and writes at Phase 6 after delivery.

---

## 5. The 16-tool contract

context-harness-mcp registers exactly 16 MCP tools. Every agent and skill in team-harness must reference only tools from this set. The structural test suite (Suite 35) enforces this constraint — any agent referencing a tool outside this vocabulary causes a test failure.

| Tool | Category | Description |
|---|---|---|
| `create_nodes` | Write | Create one or more KG nodes (entities) |
| `add_observations` | Write | Append observations to existing nodes |
| `update_observations` | Write | Replace an observation on an existing node |
| `create_relations` | Write | Create edges between nodes |
| `search_nodes` | Read | Semantic similarity search across nodes |
| `open_nodes` | Read | Retrieve nodes by name (exact match) |
| `read_graph` | Read | Return the full graph (use with caution on large KGs) |
| `stats` | Utility | Node and relation count statistics |
| `timeline` | Utility | Nodes ordered by creation time |
| `find_conflicts` | Utility | Detect nodes with contradictory observations |
| `mark_superseded` | Lifecycle | Soft-delete: mark a node as superseded by another |
| `suggest_node_type` | Utility | Recommend an entity type for a proposed node |
| `doctor` | Diagnostic | Check server health and connectivity |
| `session_start` | Session | Begin a named session (returns session_id) |
| `session_end` | Session | Close a session |
| `session_summary` | Session | Summarize events in a session |

**No hard-delete tool exists.** Removing a node permanently is an operator-only operation performed directly against the Postgres backend (via the `<your-mcp-url>/viewer/` admin panel or SQL: `UPDATE nodes SET deleted_at = now() WHERE name = '...'`). The `mark_superseded` tool provides the soft-delete path for agents.

---

## 6. KG content policy

All content written to the KG must comply with the policy in `docs/kg-content-policy.md`. Key rules:

- **Technical-only.** The KG stores reusable code patterns, tool gotchas, architectural decisions, and process insights. It does not store personal data, credentials, client names, or stakeholder information.
- **No secrets.** API keys, tokens, bearer credentials, and internal IPs are forbidden, even in observation text.
- **No absolute user paths.** Paths like `C:/Users/<name>/...` are not portable and must not be persisted.
- **Date-anchor all state claims.** Observations about "current" state must include an explicit date (`As of 2026-05-29, ...`). Undated "currently" claims rot.
- **Write-time enforcement.** The orchestrator's content filter (Phase 6, delivery Step 11.5, and the security-finding write site) applies the policy before calling `create_nodes` or `add_observations`. The context-harness-mcp server applies a defense-in-depth filter (gitleaks + taxonomy) on the server side.

Full policy reference: `docs/kg-content-policy.md`

---

## 7. Troubleshooting

### KG writes silently skipped

KG writes are best-effort — a failed write does not block the pipeline. To diagnose, inspect the `kg_write` events in the pipeline trace:

```
/th:trace <feature-name>
```

Each `kg_write` event carries a `writes[]` array with per-write `reason` codes:

| `reason` code | Meaning | Fix |
|---|---|---|
| `skipped:mcp-down` | The memory MCP endpoint is unreachable or the `doctor` tool reports degraded status | Check that context-harness-mcp is running; verify the URL in `~/.claude/.team-harness.json` |
| `skipped:malformed-call` | A tool call used a non-existent tool name or malformed arguments | Check that the agent file references only the 16 tools listed in Section 5; update the agent if it references a renamed tool |
| `skipped:policy-filtered` | The content-policy filter or an MCP `policy/*` response discarded the write | Review the observation text against `docs/kg-content-policy.md`; remove forbidden content before re-running |
| `ok` (with `detail: content-gate: ...`) | The quality gate found nothing worth persisting — not an error | No action required |

### Wrong `mcpServers` key

If the memory tools are not available to agents, the most common cause is an incorrect key in `~/.claude.json`. Verify:

```bash
cat ~/.claude.json | python -m json.tool | grep -A5 '"memory"'
```

The block must be nested under `mcpServers.memory`. If it is nested under any other key (e.g., `mcpServers.context-harness`), re-run `/th:setup` to correct it.

### MCP endpoint unreachable

If `/th:setup` reports a connectivity failure on the smoke test:

1. Confirm context-harness-mcp is running: `curl <your-mcp-url>/mcp`
2. Confirm the URL in `~/.claude.json` matches the running server (no trailing slash differences, correct scheme `http` vs `https`)
3. For authenticated deployments, confirm the bearer token in the `headers` block is current
4. Run `mcp__memory__doctor` from within a Claude Code session to get the server's own health report

### Smoke test passes but no writes on first pipeline

The smoke test (`read_graph`) only validates transport. A write is first exercised at Phase 6 of the pipeline. If Phase 6 shows `attempted: 0` in the trace, the orchestrator found no reusable learning to persist from that run — this is expected for trivial tasks. Run a substantive pipeline (a feature with architectural decisions or a bug fix with a root cause) to exercise the write path.

---

## 8. Cross-references

| Resource | Location |
|---|---|
| README — install and quick start | `README.md` |
| Configuration reference | `CLAUDE.md` |
| KG content policy (full) | `docs/kg-content-policy.md` |
| Observability — `kg_write` event schema | `docs/observability.md` |
| Pipeline reference | `docs/pipelines.md` |
| How it works | `docs/how-it-works.md` |
| Troubleshooting (plugin install) | `docs/troubleshooting.md` |
| context-harness-mcp source | https://github.com/valianx/context-harness-mcp |
