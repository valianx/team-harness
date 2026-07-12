# KG write-time policy
<!-- Single source of truth for KG write-time content-policy + dedup gates.
     Consumed by: agents/orquestador.md (Phase 6 Knowledge Save + Phase 3
     security-finding writes) and agents/delivery.md (Step 11.5 passive capture).
     Read-only agents (qa, tester, security, architect) do NOT reference this —
     they never call create_nodes; they emit kg_save_candidates instead.
     Edit here; the two writers reference this file by section.
     Full normative policy: docs/kg-content-policy.md. -->

## When this applies

This snippet governs every call to `mcp__memory__create_nodes` and
`mcp__memory__add_observations`. The triggers — when a write is dispatched — remain
inline in each writer agent. This file centralises the rules: what to redact,
how to check specificity, and how to avoid duplicates.

## Content policy — redact before every write

Before every `create_nodes` / `add_observations` call, apply the redaction rules
below to every observation string. When in doubt, omit — it is cheap to re-add
later and expensive to extract once distributed.

**Forbidden in observations:**
- Personal names (users, colleagues, stakeholders) or user-specific preferences / feedback.
- Credentials, tokens, API keys, private URLs/IPs.
- Absolute filesystem paths that include a user identifier. Examples seen in past
  violations: `C:/Users/<name>/...`, `C:\Users\<name>\...`, `/mnt/c/Users/<name>/...`,
  `/home/<name>/...`. Use repo-relative paths (e.g. `src/services/payment.ts`) or just
  the bare repo name.
- Client, account, contract, or commercial information.
- Volatile identifiers: PR numbers (`PR #317`), issue numbers (`#42`), commit SHAs
  longer than the conventional 7 chars, branch names that include personal prefixes
  (`feat/<name>`).

**Required for `[project]` entities:** identify the project by its **bare repo name
only** (e.g. `zippy-backoffice`, `transactions-service`). Never embed a path. The name
should be the same string a teammate would type to clone it.

**Required for any entity that summarizes a change:** describe the change by date +
capability, not by PR/issue number. "2026-04 currency-per-country migration in
backoffice" is good; "PR #323" is volatile and meaningless once the PR is gone.

**Content-quality rules:**
- **Technical only.** No stakeholder names, no Slack handles, no personal data, no
  tokens, no internal URLs.
- **No PR / branch / commit metadata.** Those rot. Write the insight as a stable claim
  about the codebase or workflow.
- **No restatement of the CHANGELOG.** The CHANGELOG describes what changed; the KG
  entry describes what was learned that future tasks can reuse. If you cannot articulate
  a learning beyond the changelog, skip the call.
- **Each observation ≤ 280 chars.** Forces concision. Multi-sentence observations are
  fine; multi-paragraph are not.
- **Language: English.** All entity names, observations, and relation types must be in
  English.

When the forbidden content is STRUCTURAL (an exploit detail, a CVE-version identifier,
a secret or PII value, a user-path — not merely a phrasing nuance), PREFER discard
over rewrite: a silent rewrite risks distorting the lesson or leaving forbidden residue
in the observation.

## Pre-write checklist (run mentally per observation)

1. Does this string contain a slash followed by `Users/`, `home/`, or `mnt/c/Users/`?
   → strip path or drop observation.
2. Does this string contain a `#` followed by digits? → check whether it is a PR/issue
   ref; if yes, rewrite without the number.
3. Does this string contain a developer name? → drop or anonymize.
4. Could this observation be sent to another developer's machine and still be useful?
   → if no, drop.

## Dedup gate (search_nodes before create_nodes)

Two gates run before any write. Both are cheap (one MCP call each) and read-only.

**Gate 1 — Specificity (`suggest_node_type`).**

Call `mcp__memory__suggest_node_type(text=<concatenated observation blob>)`. Inspect the
top-3 result:

| Condition | Action |
|-----------|--------|
| Top-1 confidence < 0.5 | **Skip the write.** The text is too vague. Log the skip outcome. |
| Top-1 type does not match the intended `node_type` AND its confidence exceeds the
  intended type's confidence by ≥ 0.2 | **Skip the write.** Type mismatch. Log the skip
  outcome. |
| Otherwise | Proceed to Gate 2. |

For security-finding writes, the intended type is `error` or `pattern`; for delivery
passive capture, the intended type is `process-insight`.

**Gate 2 — Dedup (`search_nodes` pre-flight).**

Call `mcp__memory__search_nodes(query=<first observation or entity name>)`. Inspect the
top-3 results, filtered to the same `node_type` only (do NOT cross-merge between
`process-insight` and `error`/`pattern`):

| Condition | Action |
|-----------|--------|
| Top result clearly covers the same insight (same library + same pattern + same fix) | **Redirect to `add_observations`** on the matched node. Reuse only the observations that add new content. |
| Top result is topically related but distinct | **Proceed with `create_nodes`** and note the relationship in the first observation. |
| No semantically close match | **Proceed with `create_nodes` clean.** |

**Isolation by type:** do not cross-merge `process-insight` and `error`/`pattern` nodes.
Gate 2 dedup filters to the expected type explicitly.

**Failure modes (never block the pipeline):**
- `suggest_node_type` returns an error or empty → log the gate error and proceed to
  Gate 2 (do not block on the optional gate).
- `search_nodes` returns an error → log the gate error and proceed with `create_nodes`
  (conservative: prefer a possible duplicate over losing the insight).
- Gates pass but `create_nodes` / `add_observations` fails → follow the writer agent's
  existing failure handling.

## Overlap gate (Save / Absorb / Drop verdict)

This section formalizes Gate 2's three outcomes into a named verdict and adds an explicit
Drop path. Applies to same-`node_type` matches only — do NOT cross-merge between
`process-insight` and `error`/`pattern` nodes (isolation by type, same rule as Gate 2).

| Verdict | Fires when | Action |
|---------|-----------|--------|
| **Save** | No semantically close same-type match, OR a topically-related-but-distinct match | `create_nodes` (clean, or with a relation note for the related-but-distinct case). Unchanged from Gate 2. |
| **Absorb** | A match clearly covers the same subject + same mechanism and the candidate carries at least one observation the match lacks | `add_observations` on the matched node, adding only the genuinely new observation(s). |
| **Drop** | A match clearly covers the same subject + same mechanism AND the candidate adds NO new observation (pure restatement) | Skip the write entirely. Log the Drop outcome. Nothing is mutated. |

**Absorb threshold:** the match must clearly cover the **same subject + same mechanism** — not merely a topically-related insight. When the candidate is topically related but covers a distinct fix or mechanism, emit **Save** with a relation note instead.

**Confirmation-observation convention (bridge to TTL sweep):**

An entry is **CONFIRMED** when any of its observations carries a `confirmed: YYYY-MM-DD`
token. The Absorb verdict is the normal producer of that token: when a later pipeline run
re-derives an insight that already exists in the KG, it Absorbs a one-line
`confirmed: <today>` observation onto the matched node. This requires no new MCP tool
(rides the existing `add_observations` path) and no schema change (rides the existing
date-anchoring policy in `docs/kg-content-policy.md`). A fresh `Save` is UNCONFIRMED
by construction (no `confirmed:` token yet).

**Same-`node_type`-only isolation (restated):** the verdict operates exclusively on
matches of the same node type. A `process-insight` candidate is never Absorbed into an
`error` or `pattern` node. No cross-merge between `process-insight` and `error`/`pattern`.

**Best-effort failure modes (never block the pipeline):**
- `search_nodes` returns an error → proceed as **Save** (prefer a possible duplicate over
  losing the insight). Never block the pipeline on a gate error.
- Write failure after verdict → follow the writer agent's existing failure handling.

## Session attribution (best-effort)

**Origin of the `session_id`.** `th:lider` calls `mcp__memory__session_start` at
Phase 0a Intake (Step 2) and writes the returned UUID to
`workspaces/{feature-name}/session.json` as `"session_id": "<uuid>"`. That file is the
single source of truth for the session_id throughout the pipeline. The session is closed
by `mcp__memory__session_end` at Phase 6 (owned by the `th:orquestador` instance).

**Convention for every writer.** When calling `create_nodes`, pass `"session_id":
"<uuid>"` alongside `"nodes"` if and only if all three conditions hold:
1. `workspaces/{feature-name}/session.json` exists.
2. The file contains a non-empty `session_id`.
3. `session_end` has NOT yet been called on that session.

If any condition fails, omit the field — `create_nodes` rejects ended sessions with
`policy/session-already-ended`. The pipeline never fails on session-attribution errors.

**Correlation across observability planes.** The `session_id` (equal to the feature/run
identifier) already appears as the `feature` field in every event in
`00-execution-events.jsonl`/`.md`. That is the anchor for correlating team-harness
pipeline events with KG node attribution. An operator with access to both planes can
join on this value manually.

**Honest limitation.** The MCP `create_nodes` call does not carry an HTTP header for
session or trace propagation. Correlation between team-harness event-trace and the
`context-harness-mcp` OTel spans is **best-effort by convention**, not guaranteed at
the transport layer. If `session_start` is unavailable (server without the tool, or an
error), there is no `session.json`, and nodes are written without `session_id` — the
pipeline proceeds normally, but those nodes are not attributed to a session in the KG.
Guaranteed OTel-level stitching (e.g., a W3C `traceparent` header or an
`X-Session-Id` transport header) requires a change to `context-harness-mcp` and is out
of scope for this PR.

## How to reference this file

In each writer agent, replace the inline policy/dedup prose with a one-line pointer at
the relevant step:

```
**Content policy + dedup gate:** see `agents/_shared/kg-write-policy.md`
§ "Content policy" and § "Dedup gate".
```

Keep the agent's trigger sentence inline (when the write fires and what type is
expected); delegate the rules (what to redact, gate mechanics) to this file. This
preserves readability — the agent reader understands when a write occurs without jumping
files; the full rule lives in one canonical place.
