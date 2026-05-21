# Upstream issue draft — Anthropic claude-code

**Target repo**: `https://github.com/anthropics/claude-code/issues/new`
**Suggested labels**: `feature-request`, `subagents`, `tool-routing`

---

## Title

Honor `tools:` frontmatter when an agent is invoked via `@mention` — strip `Task` only when the agent did not declare it

## Body

### Summary

When a Claude Code agent is invoked via `@mention` from inside an already-active session, Claude Code wraps the invocation as `Task(subagent_type=<agent>, ...)`. The runtime then strips `Task` from the agent's available toolset as an anti-recursion guard — **even when the agent's `tools:` frontmatter explicitly declares `Task`**.

This breaks **hub-style agents** that exist specifically to orchestrate other subagents. The user's mental model when typing `@orchestrator` is "the orchestrator agent runs and dispatches subagents". The actual behavior is "the orchestrator runs, detects it has no `Task`, and produces a verbose handoff for top-level Claude to execute".

The workaround works (handoff pattern is well-documented and self-healing) but introduces:

- A round-trip turn — the orchestrator hands off, then top-level Claude executes the dispatch.
- ~3k tokens of handoff playbook per invocation (mitigated to ~300 tokens by Option 4 fix in our harness; see https://github.com/valianx/team-harness/pull/15).
- UX inconsistency between `@<orchestrator-style>` (anti-pattern) and `@<leaf-style>` (works as expected).

### Proposed change

When Claude Code dispatches an agent via `Task(subagent_type=X, ...)` (either user-triggered via `@mention` or orchestrator-triggered via inline `Task` call), honor the agent's declared `tools:` frontmatter:

- If the agent's frontmatter lists `Task` → permit `Task` in the nested invocation.
- If the agent's frontmatter omits `Task` → strip as today.

The anti-recursion guard becomes opt-in via the frontmatter declaration, which is the existing capability mechanism. Agents that don't declare `Task` see no behavior change. Hub agents that explicitly declare `Task` get to do their job.

### Why this is safe

1. **`tools:` frontmatter is already the source of truth for what an agent can call.** It's the declarative contract. Today's behavior contradicts that contract (silently strips a declared tool).
2. **Anti-recursion concern is reasonable but already mitigated**: a hub agent calling itself (`Task(subagent_type=orchestrator)` from inside `orchestrator`) can be blocked specifically without blocking `Task` to call OTHER subagents.
3. **Opt-in via existing mechanism**: no new config keys, no new flags. The frontmatter that already exists tells the runtime what the agent can call.
4. **Backward compatible**: agents that don't declare `Task` (the common case) are unaffected.

### Concrete example

Our harness `team-harness` (https://github.com/valianx/team-harness) has an `orchestrator` agent with:

```yaml
---
name: orchestrator
tools: [Read, Edit, Write, Bash, Glob, Grep, Task, ...]
---
```

When invoked from top-level (e.g., user opens a session and `Task` is dispatched once to `orchestrator`), `Task` is available and the orchestrator can call `Task(subagent_type=architect, ...)`, etc.

When invoked via `@orchestrator` mention from inside an active session, `Task` is stripped despite being declared in `tools:`. The orchestrator detects this via a boot probe and emits a dispatch handoff. Top-level Claude reads the handoff and takes over the orchestration role.

### Alternatives considered

1. **Allow recursion entirely (no anti-recursion guard)**: rejected — too easy to get into infinite loops.
2. **Recursion depth limit (allow `Task` until depth N, then strip)**: workable but more complex than the proposed change.
3. **New `nested_tools:` frontmatter field**: rejected — duplicates `tools:`.
4. **Status quo + workaround**: what we do today. Works but is the source of this request.

### Impact

- **Affected users**: anyone who has built hub-style agents (orchestrator, planner, multi-stage pipeline agents).
- **UX improvement**: `@<hub-agent>` works as the name implies.
- **Token reduction**: eliminates handoff round-trip when the hub agent is invoked via `@mention`.

### Workaround we ship today

Documented at https://github.com/valianx/team-harness/blob/main/agents/orchestrator.md (Dispatch-blocked exit section) and https://github.com/valianx/team-harness/blob/main/CLAUDE.md (§13 Universal rule — auto-takeover on `blocked-no-dispatch`). PR https://github.com/valianx/team-harness/pull/15 reduces the handoff token cost from ~3k to ~300 via a structured JSON payload, but the round-trip itself remains until this upstream change lands.

### Environment

- Claude Code CLI version: any recent (issue is consistent across releases).
- Reproducibility: deterministic via `@orchestrator` mention on any agent that declares `Task`.

### Related

- Our harness issue tracking this from the consumer side: https://github.com/valianx/team-harness/issues/14
- Mitigation PR (Option 4): https://github.com/valianx/team-harness/pull/15
