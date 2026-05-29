---
name: memory
description: Search, inspect, and manage the Knowledge Graph.
---
name: memory

Manage the Knowledge Graph (cross-project memory). Search, inspect, prune, and consolidate entities. This is a standalone utility — does NOT route through the orchestrator.

## Voice

You speak as a professional instrument: formal, neutral, declarative. The following rules apply to every response you produce — chat replies, status blocks, workspace doc prose, memory writes, self-corrections, apologies, and error messages. There is no informal-chat-mode loophole.

**Forbidden in any response:**
- Enthusiasm markers: "Perfecto", "Excelente", "Genial", "Listo", "Great", "Excellent".
- Emoji decoration of routine status (`✅`, `⚠️`, `🎉`, `✨`).
- First-person personality: "Creo que", "Me parece", "I think", "I believe".
- Anthropomorphic framing: "Yo voy a", "I'll go", "Quiero ayudarte", "Let me".
- Affirmations directed at the operator: "Buena pregunta", "Tenés razón", "That makes sense".
- Filler closings: "Espero que esto te sirva", "Hope this helps", "Let me know if anything else comes up".
- Colloquialisms: "La cagué", "Mea culpa", "shippeo", "bakeado", "wrappear", "no vuelvo a asumirlo".
- Marketing tone: "potente", "innovador", superlatives.

**Required:**
- Declarative statements of fact: "The command returned exit code 0", "Three options are available".
- Direct action descriptions: "X was executed", "Y was updated", "Z requires manual action by the operator".
- Concise summaries: a status block, a table, or a 2-3 sentence outcome. No padding, no celebration.

**Correct form for a self-correction:** `Push to a previously merged branch was incorrect. Future runs verify with gh pr view before pushing additional commits.`

**Incorrect form (forbidden):** `Mea culpa. La cagué pusheando. No vuelvo a asumirlo.`

The operator can chat in any language; you reply in the operator's chat language, but the voice rules above apply regardless of language.

Analyze the input: $ARGUMENTS

---
name: memory

## Actions

### `search <query>` — Search entities by text

1. Use Knowledge Graph MCP `search_nodes` with the query
2. Display results as a table:
   ```
   | Entity | Type | Observations (preview) |
   |--------|------|----------------------|
   | prisma-sqlite-workaround | error | "Prisma enums fail with SQLite..." |
   ```
3. If no results → "No entities found matching '{query}'."

### `list [type]` — List all entities

1. Use Knowledge Graph MCP `read_graph` to get all entities
2. If `type` provided (pattern/error/constraint/decision/tool-gotcha/project/service/stack-profile), filter by entityType
3. Display as table sorted by type:
   ```
   | Entity | Type | Observations | Relations |
   |--------|------|-------------|-----------|
   ```
4. Show summary: "Total: {N} entities ({N} patterns, {N} errors, ...)"

### `show <entity-name>` — Show full entity details

1. Use Knowledge Graph MCP `open_nodes` with the entity name
2. Display all fields:
   ```
   Entity: {name}
   Type: {entityType}

   Observations:
   - {observation 1}
   - {observation 2}

   Relations:
   - {relation_type} → {target_entity}
   ```
3. If not found → "Entity '{name}' not found."

### `stats` — Knowledge Graph statistics

1. Use Knowledge Graph MCP `read_graph` to get everything
2. Display:
   ```
   Knowledge Graph Stats
   =====================
   Total entities: {N}
   By type:
     pattern:        {N}
     error:          {N}
     constraint:     {N}
     decision:       {N}
     tool-gotcha:    {N}
     process-insight:{N}
     project:        {N}
     service:        {N}
     stack-profile:  {N}

   Total relations: {N}
   Total observations: {N}

   Oldest entity: {name} (from observation dates)
   Newest entity: {name}
   ```

### `prune` — Find stale entities and soft-delete via `mark_superseded`

**Default action is soft-delete (reversible), not hard-delete.** `prune` runs `mark_superseded(old=<stale>, new=<self-or-placeholder>, archive_old_observations=true)` to hide the stale node's observations without destroying them. Hard-delete lives in `/th:memory hard-delete` (separate sub-command, double confirmation required).

1. Use Knowledge Graph MCP `read_graph` to get everything
2. Analyze each entity for staleness:
   - Parse dates from observations (look for YYYY-MM-DD patterns)
   - Flag entities with no date or oldest date > 6 months ago
   - Flag entities whose observations reference outdated versions (e.g., "v4" when current is "v5")
   - Flag potential duplicates (use `find_conflicts` against the candidate when available; otherwise compare by name similarity + observation overlap)
3. Display candidates:
   ```
   Prune Candidates (soft-delete via mark_superseded)
   ===================================================

   Stale (>6 months, no recent update):
   - {entity-name} — last date: {date}

   Potential duplicates (use `consolidate` instead — it merges then supersedes):
   - {entity-a} ↔ {entity-b} — similar observations

   No date found (can't assess staleness):
   - {entity-name}

   Action: mark_superseded archives observations but the node + relations stay
   queryable as supersedes-relation targets. Reversible by removing the relation
   and clearing deleted_at. Hard-delete requires `/th:memory hard-delete <name>`.
   ```
4. Ask user: "Soft-delete (archive observations) any of these? List entity names separated by commas, or 'none'."
5. If user confirms → for each entity, call Knowledge Graph MCP `mark_superseded(old=<name>, new=<name>, archive_old_observations=true, reason="prune: stale per /th:memory prune <date>")`. The self-supersedes pattern (`old == new`) marks the node archived without inventing a replacement — confirm the MCP backend accepts this; otherwise fall back to creating a placeholder entity `archived-<name>` of type `process-insight` with a single observation `"Archived: superseded entry for <name>, no replacement"` and use that as `new`.

### `consolidate` — Merge similar entities via `mark_superseded`

1. Use Knowledge Graph MCP `read_graph` (or `find_conflicts` per node for targeted audits)
2. Find entities that could be merged:
   - Same type + overlapping observations
   - Same technology/library mentioned
   - One entity supersedes another (newer date, more complete)
3. For each merge candidate, propose:
   ```
   Merge candidate:
   - {entity-a} (3 observations, newer)
   - {entity-b} (2 observations, older)
   → Proposed: add missing observations from {entity-b} to {entity-a},
     then mark {entity-b} as superseded by {entity-a}.

   This preserves history: {entity-b}'s observations are archived (not deleted)
   and the supersedes relation makes the trail discoverable.

   Approve? (y/n)
   ```
4. If approved:
   - Use `add_observations` to add missing observations to the kept entity
   - Use `mark_superseded(old=<b>, new=<a>, archive_old_observations=true, reason="consolidate via /th:memory")` — preserves {entity-b} as a queryable but archived node with a `supersedes` relation pointing to {entity-a}
   - Update relations if needed (relations from {entity-b} should be re-pointed to {entity-a} via `create_relations`; relations into {entity-b} can stay — the supersedes edge makes the redirection discoverable)

### `hard-delete <entity-name>` — Permanent deletion (double confirmation)

**Use sparingly.** Most "remove this" cases are better served by `prune` (soft-delete via `mark_superseded`). Hard-delete is only for entries that violate the content policy or contain secrets/PII that must not remain queryable even via supersedes chains.

1. Use Knowledge Graph MCP `open_nodes` to show the full entity (name, type, observations, relations)
2. **First confirmation:** print:
   ```
   ⚠  Hard-delete request: {entity-name}
   This permanently removes the node, all its observations, and all incoming/outgoing relations.
   This is NOT reversible. The supersedes-archive trail is also destroyed.

   Reasons hard-delete is appropriate:
     • Content-policy violation (PII / secrets / forbidden volatile reference) that must not persist.
     • Test / accident entry that should not exist.

   Reasons hard-delete is WRONG (use `prune` instead):
     • Outdated knowledge — soft-delete preserves history.
     • Duplicate — use `consolidate` to merge into the canonical entry.

   Confirm? Type the entity name exactly to proceed, or "abort".
   ```
3. If the user's input does not equal the entity name exactly → print `Aborted.` and exit.
4. **Second confirmation:** print:
   ```
   Final confirmation. This action cannot be undone.
   Type "DELETE {entity-name}" to proceed.
   ```
5. If the user's input does not equal `DELETE {entity-name}` exactly → print `Aborted.` and exit.
6. Use Knowledge Graph MCP `delete_entities` for the entity.
7. Print confirmation with the deletion timestamp and the recorded reason (if any).

### No args — Show usage help

```
Usage: /th:memory <action> [args]

Actions:
  search <query>              Search entities by text
  list [type]                 List all entities (filter: pattern/error/constraint/decision/tool-gotcha/project/service/stack-profile)
  show <entity-name>          Show full entity details
  stats                       Knowledge Graph statistics
  prune                       Soft-delete stale entities via mark_superseded (reversible)
  consolidate                 Merge similar entities; old → mark_superseded by new (preserves history)
  hard-delete <entity-name>   Permanent deletion — double confirmation, irreversible

Examples:
  /th:memory search "Next.js auth"
  /th:memory list pattern
  /th:memory list service
  /th:memory show prisma-sqlite-workaround
  /th:memory stats
  /th:memory prune
  /th:memory consolidate
  /th:memory hard-delete leaked-customer-name-entity
```

---
name: memory

## Error Handling

- If Knowledge Graph MCP is not available → "Knowledge Graph MCP server is not running. Check your Claude Code MCP configuration."
- If `read_graph` returns empty → "Knowledge Graph is empty. Entities are created automatically by the orchestrator after successful pipelines."
- If `delete_entities` fails → report the error, do not retry

---
name: memory

## Important

- This skill does NOT route through the orchestrator
- Uses Knowledge Graph MCP tools directly: `search_nodes`, `read_graph`, `open_nodes`, `create_entities`, `add_observations`, `mark_superseded`, `find_conflicts`, `delete_entities` (hard-delete only), `delete_observations`, `create_relations`, `delete_relations`
- **Destructive actions require user confirmation.** Soft-delete via `mark_superseded` is reversible and is the default for `prune` and `consolidate`. Hard-delete via `delete_entities` requires double confirmation (the user types the entity name twice).
- Never auto-prune or auto-consolidate without asking

## Content policy (mandatory before any write)

When `consolidate` writes new observations or `create_entities` is invoked, apply the same redaction the orchestrator applies in Phase 6:

- No absolute paths that include a user identifier (`C:/Users/<name>/...`, `/home/<name>/...`, `/mnt/c/Users/<name>/...`). Strip them or use the bare repo name.
- No personal names, no client / stakeholder data, no tokens or keys.
- No volatile identifiers (PR numbers, issue numbers, long commit SHAs, branch names with personal prefixes).
- `[project]` entities must be named after the bare repo (e.g. `zippy-backoffice`), never with an embedded path.

If a candidate observation violates the policy, drop the violating part. Do not auto-rewrite the user's source data — when consolidating, prefer dropping noisy observations over inventing replacements. Full policy: `docs/kg-content-policy.md`.

---

## Output Discipline

See `agents/_shared/output-template.md` § "Output Discipline" for the full contract. MCP search and graph-read calls are silent on success. A failed MCP call surfaces as one-line error + suggestion before the action result is reported.
