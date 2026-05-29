# Output Discipline
<!-- Cross-cutting output contract for agents and skills.
     Consumed by: agents/{orchestrator,delivery,init,architect,implementer,tester,qa,security}.md
     and skills/{setup,lint,memory}/SKILL.md.
     Edit here; consumer files reference this file by section. -->

## Output Discipline

**Rule: operationalize silently on success, report once on error.**

### What to silence

The following operations produce NO operator-facing output when they succeed.
Log an `operation.*` event to `00-execution-events.{jsonl|md}` instead
(schema: `docs/observability.md`):

- **Config-load** — reading `.team-harness.json`, resolving workspace paths,
  parsing any config file.
- **MCP-verify** — connectivity probe to the Memory MCP or context7 server.
- **Initialization / boot sequence** — any setup step the operator did not
  explicitly request.

### What is never silenced (carve-outs)

The following output is always operator-facing regardless of success or failure:

- **Analysis prose and plans** — the content the operator asked for.
- **Results and reports** — test outcomes, validation reports, security findings.
- **STOP blocks and gate decisions** — STAGE-GATE-{1,2,3} prompts, any point
  where the operator must take an action.
- **Phase-transition status blocks** — the compact blocks at the end of each
  phase (e.g., `agent: implementer / status: success`).
- **The direct answer to what the operator asked** — if the operator asked a
  question, the answer is always surfaced.

**Rule of thumb:** output that responds to something the operator asked for is
operator-facing. Output that narrates how the system reaches that response is
internal chatter.

### Error contract

When a silenced operation fails, surface exactly:

1. **One line of summary:** `{operation} failed: {error}` — no raw stack
   traces, no full dump, no multi-paragraph explanation.
2. **One line of suggestion:** `Suggestion: {recovery step}` — actionable,
   specific.

The full error output goes to `00-execution-events.*` as an `operation.failed`
event (fields: `error`, `suggestion` — see `docs/observability.md`). It never
appears in the chat.

### Exemptions

`/th:status` and `/th:trace` are **exempt** from the silence rules above.
These skills surface internal pipeline state because the operator explicitly
requested it. The narration lint (`tests/test_agent_structure.py` Suite 31)
does not scan them.

## How to reference this file

In your agent or skill, add a short `## Output Discipline` section that
cross-references this file:

```
## Output Discipline

See `agents/_shared/output-template.md` § "Output Discipline" for the full
contract. {One sentence describing any agent-specific behavior, if applicable.}
```

The reference is resolved at prompt-load time: Claude reads the referenced
section in-context as part of the installed `~/.claude/agents/_shared/` tree.
