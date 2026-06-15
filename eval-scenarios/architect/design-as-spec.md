---
name: design-as-spec
mode: design
difficulty: medium
needs_scaffold: false
---

# Architect — Design: API endpoint for a paginated list (happy path)

Tests that the architect produces a concrete, actionable design plan for a
standard feature request without requiring filesystem access.

## Input

Design a paginated list endpoint for a team's task backlog. The service is a
Node.js + Express + PostgreSQL REST API. Pagination must be cursor-based (not
offset). The endpoint must be authenticated (bearer token). Provide a work plan
with ordered steps, file names, and acceptance criteria.

## Context

The project is a Node.js + Express REST API backed by PostgreSQL. The existing
codebase uses cursor-based pagination on one other endpoint
(`GET /v1/items`). Authentication is enforced via a bearer-token middleware at
the router level. There is no existing `/v1/tasks` endpoint.

The project has a `workspaces/` directory (git-ignored), a `CLAUDE.md` that
declares cursor pagination as the standard, and a `docs/knowledge.md` with one
entry: `[pattern] cursor-based pagination uses a stable sort column
(created_at, id) with a LIMIT N+1 query`.

## Expected Behaviors

- Proposes cursor-based pagination (not offset) consistent with the declared
  project pattern.
- References the existing pagination pattern before proposing the new endpoint,
  demonstrating it read and respected the stated convention.
- Includes ordered work plan steps with file names (controller, service, route,
  migration) and dependencies noted.
- Writes at least 3 acceptance criteria in Given/When/Then or VERIFY form.
- Documents a named trade-off or design decision (e.g., choice of cursor field,
  index strategy, token format).

## Anti-Patterns

- Does not propose offset pagination — this contradicts the explicitly declared
  project pattern.
- Does not skip authentication — the endpoint must carry the bearer-token
  middleware.
- Does not produce a generic template plan lacking file names or step ordering.
- Does not claim to implement the feature — the architect designs, the
  implementer builds.

## Output Criteria

- format: structured markdown with `## Work Plan`, `## Acceptance Criteria`, and
  at least one `## Architecture Decisions` or `## Trade-offs` section
- completeness: work plan has ordered, numbered steps; each step names at least
  one file and one action; ACs are testable
- actionability: a developer reading the plan knows exactly which files to
  create/modify and in what order, without ambiguity

## Pass-Bar Declaration

- minimum_pass_rate: 4/5 (4 of 5 runs must score PASS overall)
- failing_dimensions_allowed: 0 on Critical Rules and NEVER Boundaries; 1 on
  Expected Behaviors or Output Criteria
- rationale: Architect outputs are structural documents — Critical Rules
  (no implementation, ordered plan, ACs) and NEVER Boundaries (no code) are
  hard gates; one Expected Behavior miss is acceptable for an open-ended
  design task where the exact set of mentioned items may vary across runs.
