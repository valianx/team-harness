# context7 MCP — Usage Playbook

> **Audience:** agent prompts in `agents/*.md`. Humans rarely invoke context7 directly.
> **Purpose:** treat documentation freshness as a *correctness check*, not optional research.

The model is trained on a snapshot; libraries keep moving. context7 closes the gap. The cost of one MCP call is far below the cost of generating code against a deprecated signature.

---

## 1. What context7 is for

context7 is a documentation MCP that returns the **current** docs of any public library, framework, SDK, API, or CLI tool.

**Use it for:**
- API syntax (function signatures, options shape, return types).
- Configuration syntax (test runners, coverage tools, bundlers, framework configs).
- Version-specific behavior (a feature was added/removed/renamed in version X).
- Deprecation status (is this API still recommended?).
- Library identifier resolution (canonical name on context7).

**Do NOT use it for:**
- Refactoring decisions inside your own codebase.
- Business logic.
- General programming concepts.
- Code review.
- Debugging issues already isolated to your own code.

---

## 2. When invocation is mandatory

The frontmatter `tools:` of an agent declares capability. These rules say *when* you must exercise it.

| Agent | Mandatory trigger | Skip when |
|---|---|---|
| **implementer** | Before generating code that imports or configures any third-party library detected in `package.json` / `go.mod` / `pyproject.toml` / equivalent. | The library is purely internal to this repo. |
| **architect** | Phase 1 (Design): for every framework / library you cite as a Decision in `01-architecture.md`. | The library only appears in the discarded-alternatives list. |
| **tester** | Before generating tests that use the project's test runner or coverage tool (Jest, Vitest, PyTest, Go test, c8, istanbul, etc.). | The change touches only test fixtures with no runner-specific syntax. |
| **security** | Phase 0 — verify the latest OWASP Top 10 / CWE Top 25 versions. | Never skip — this gate is the model behavior. |
| **translator** | Before installing or configuring the framework's i18n library (`next-intl`, `vue-i18n`, `react-i18next`, etc.). The wrong version maps to a wrong API. | The project already has i18n configured and you're only extracting strings. |

**Light reference (no mandatory trigger):**
- **init** — Phase 2.4 may consult context7 to learn framework conventions while bootstrapping, but bootstrap is exploratory; failure to consult is acceptable and the agent never halts on context7 absence.

For the five mandatory-trigger agents, **do not assume your training-snapshot knowledge of the API is correct**.

---

## 3. Query strategy

Two tools, used in order:

1. **`mcp__context7__resolve-library-id`** — pass a free-text library name. Returns the canonical context7 identifier. Always call this first when you don't already have the ID. A library may be ambiguous (`next-auth` vs `@auth/next-auth-adapter`); only the canonical ID guarantees you fetch the right docs.

2. **`mcp__context7__get-library-docs`** (or the equivalent docs-fetch tool exposed by your runtime) — pass the canonical ID plus an optional `topic`. Topic should be granular: `"middleware"` returns better signal than `"Next.js"`. Keep topic to 1-3 words.

**Topic patterns that work:**
- `"middleware"`, `"server components"`, `"data fetching"` (frontend frameworks)
- `"prepared statements"`, `"connection pool"`, `"migrations"` (ORMs / DB clients)
- `"coverage config"`, `"mock factories"`, `"fake timers"` (test runners)
- `"jwt verify"`, `"session middleware"`, `"csrf"` (auth libraries)
- `"OWASP Top 10 latest version"`, `"CWE Top 25 latest year"` (security baselines)

**Topic patterns that don't work** (too broad, too noisy):
- The framework name alone (`"Next.js"`, `"Django"`)
- Concepts the framework didn't invent (`"authentication"` returns generic prose)
- Questions phrased as English (`"how do I configure X"`)

---

## 4. Evaluating the result

Score the response before using it:

| Verdict | What you see | What to do |
|---|---|---|
| **hit** | Response mentions the version detected in the project AND the specific API/option you asked about. | Use it. Cite in `## Documentation Consulted`. |
| **miss** | Response is empty / generic / talks about a different version. | Retry **once** with a different topic. If still empty, fall back. |
| **n/a** | Library is not on context7 (returns no resolution from `resolve-library-id`). | Fall back to training knowledge. Do not retry. |

**Fallback contract.** When you fall back, you MUST document it in your session-doc:

```markdown
## Documentation Consulted
- {Library}@{version}: context7 unavailable — used training knowledge as of model cutoff.
```

If the decision is load-bearing (the API you're using might have changed between training cutoff and now), surface it in your status block via the `context7_consult` counter (see §5) so the orchestrator can decide whether to escalate.

---

## 5. Mandatory status block field

Every agent invocation that ran the mandatory trigger (architect / implementer / tester / security / translator) MUST include this field in its final status block:

```
context7_consult: hit:N miss:N skipped:M
```

Semantics:
- `hit` — counted query that returned a usable answer for the detected version.
- `miss` — counted query that returned empty / generic / wrong-version content (after at most one retry).
- `skipped` — libraries the agent decided not to verify (purely internal code, no library invocation).

Zero counts are written as `hit:0 miss:0 skipped:0`. The line is mandatory even when all three are zero — its presence is the signal that the agent thought about freshness.

After 5-10 pipelines this telemetry tells us whether agents are exercising context7 or treating it as decorative. High `skipped` in agents where it should fire = drift to correct. High `miss` = the query patterns in §3 need tightening.

---

## 6. Failure handling

context7 can fail in three ways. Handle each, never let the agent halt:

| Failure | Symptom | Action |
|---|---|---|
| MCP unreachable | Tool call returns an error / 404 / timeout. | Log `context7: unavailable` in the session-doc's `## Documentation Consulted`. Increment `skipped` for all libraries that needed verification. Continue. |
| `resolve-library-id` returns no match | Library is not on context7. | Log it once in `## Documentation Consulted`. Do not retry. Count as `n/a` (folds into `skipped`). |
| `get-library-docs` returns empty | Topic was too broad or the library has no docs for that area. | Retry once with a different topic per §3. If still empty, fall back and document. |

The MCP is a nice-to-have, never a blocker. The pipeline must keep moving.

---

## 7. What goes in the session-doc

Every session-doc produced by an agent that consulted context7 includes a section:

```markdown
## Documentation Consulted
- {Library}@{version detected}: {one-line summary of what was confirmed or changed by the docs}.
- {Library}@{version}: context7 unavailable — used training knowledge as of model cutoff.
```

When no library was touched, write a single bullet: `- No third-party libraries verified — this change is pure {repo} code.`

The reviewer of the session-doc uses this section to understand which decisions are anchored in current docs vs. model knowledge.
