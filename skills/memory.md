Manage the Knowledge Graph (cross-project memory). Search, inspect, prune, and consolidate entities. This is a standalone utility — does NOT route through the orchestrator.

Analyze the input: $ARGUMENTS

---

## Actions

### `search <query>` — Search entities by text

1. Use ChromaDB MCP `search_nodes` with the query
2. Display results as a table:
   ```
   | Entity | Type | Observations (preview) |
   |--------|------|----------------------|
   | prisma-sqlite-workaround | error | "Prisma enums fail with SQLite..." |
   ```
3. If no results → "No entities found matching '{query}'."

### `list [type]` — List all entities

1. Use ChromaDB MCP `read_graph` to get all entities
2. If `type` provided (pattern/error/constraint/decision/tool-gotcha/project/service/stack-profile), filter by entityType
3. Display as table sorted by type:
   ```
   | Entity | Type | Observations | Relations |
   |--------|------|-------------|-----------|
   ```
4. Show summary: "Total: {N} entities ({N} patterns, {N} errors, ...)"

### `show <entity-name>` — Show full entity details

1. Use ChromaDB MCP `open_nodes` with the entity name
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

1. Use ChromaDB MCP `read_graph` to get everything
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

### `prune` — Find candidates for removal

1. Use ChromaDB MCP `read_graph` to get everything
2. Analyze each entity for staleness:
   - Parse dates from observations (look for YYYY-MM-DD patterns)
   - Flag entities with no date or oldest date > 6 months ago
   - Flag entities whose observations reference outdated versions (e.g., "v4" when current is "v5")
   - Flag potential duplicates (entities with very similar names or overlapping observations)
3. Display candidates:
   ```
   Prune Candidates
   ================

   Stale (>6 months, no recent update):
   - {entity-name} — last date: {date}

   Potential duplicates:
   - {entity-a} ↔ {entity-b} — similar observations

   No date found (can't assess staleness):
   - {entity-name}
   ```
4. Ask user: "Delete any of these? List entity names separated by commas, or 'none'."
5. If user confirms → use ChromaDB MCP `delete_entities` for each confirmed entity

### `consolidate` — Merge similar entities

1. Use ChromaDB MCP `read_graph`
2. Find entities that could be merged:
   - Same type + overlapping observations
   - Same technology/library mentioned
   - One entity supersedes another (newer date, more complete)
3. For each merge candidate, propose:
   ```
   Merge candidate:
   - {entity-a} (3 observations)
   - {entity-b} (2 observations)
   → Proposed: keep {entity-a}, add observations from {entity-b}, delete {entity-b}

   Approve? (y/n)
   ```
4. If approved:
   - Use `add_observations` to add missing observations to the kept entity
   - Use `delete_entities` to remove the merged entity
   - Update relations if needed

### No args — Show usage help

```
Usage: /memory <action> [args]

Actions:
  search <query>        Search entities by text
  list [type]           List all entities (filter: pattern/error/constraint/decision/tool-gotcha/project/service/stack-profile)
  show <entity-name>    Show full entity details
  stats                 Knowledge Graph statistics
  prune                 Find and remove stale/duplicate entities
  consolidate           Merge similar entities

Examples:
  /memory search "Next.js auth"
  /memory list pattern
  /memory list service
  /memory show prisma-sqlite-workaround
  /memory stats
  /memory prune
  /memory consolidate
```

---

## Error Handling

- If ChromaDB MCP is not available → "ChromaDB MCP server is not running. Check your Claude Code MCP configuration."
- If `read_graph` returns empty → "Knowledge Graph is empty. Entities are created automatically by the orchestrator after successful pipelines."
- If `delete_entities` fails → report the error, do not retry

---

## Important

- This skill does NOT route through the orchestrator
- Uses ChromaDB MCP tools directly: `search_nodes`, `read_graph`, `open_nodes`, `create_entities`, `add_observations`, `delete_entities`, `delete_observations`, `create_relations`, `delete_relations`
- Destructive actions (delete, merge) always require user confirmation
- Never auto-prune or auto-consolidate without asking

## Content policy (mandatory before any write)

When `consolidate` writes new observations or `create_entities` is invoked, apply the same redaction the orchestrator applies in Phase 6:

- No absolute paths that include a user identifier (`C:/Users/<name>/...`, `/home/<name>/...`, `/mnt/c/Users/<name>/...`). Strip them or use the bare repo name.
- No personal names, no client / stakeholder data, no tokens or keys.
- No volatile identifiers (PR numbers, issue numbers, long commit SHAs, branch names with personal prefixes).
- `[project]` entities must be named after the bare repo (e.g. `zippy-backoffice`), never with an embedded path.

If a candidate observation violates the policy, drop the violating part. Do not auto-rewrite the user's source data — when consolidating, prefer dropping noisy observations over inventing replacements. Full policy: `docs/kg-content-policy.md`.
