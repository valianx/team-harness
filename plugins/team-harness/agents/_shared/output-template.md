# Output Discipline
<!-- Cross-cutting output contract for agents and skills.
     Consumed by: agents/{orchestrator,delivery,init-project,architect,implementer,tester,qa,security}.md
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

`/th:pipelines` and `/th:trace` are **exempt** from the silence rules above.
These skills surface internal pipeline state because the operator explicitly
requested it.

## Output Contract — Compression

<!-- Compact mirror of docs/output-contract-patterns.md § 2 Intensity Levels.
     Names and artifact-class assignments MUST match the canonical table exactly
     (multi-site invariant) — edit both files together. -->

Every full-lane artifact maps to one of four named intensity levels. Full detail, rationale, and
the measurement method: `docs/output-contract-patterns.md`.

| Level | Artifact classes |
|-------|-------------------|
| `verbatim` | Code/diffs, commands, identifiers, exact error strings, status-block field names and enum values, CWE/OWASP tokens, `file:line` locators — never paraphrased or compressed. |
| `tight` | Per-finding prose in `security`/`adversary`/`reviewer` pipeline-mode reports — Critical/High findings and adversary per-control entries get a prose budget per item; item count is never capped. |
| `bounded` | Whole-document/section capped, replaceable snapshots — `00-state.md`, `00-execution-events.md` free-text fields, `changelog.d/*.md`, `01-plan.md § Decisions for human review`, `failure-brief.md` iteration entries. |
| `standard` | Compact decision/evidence prose under `docs/output-contract-patterns.md § 6` — architecture narrative, implementation/testing docs, `docs/` reference material. It is not an uncapped fallback. |

**Verbatim rule:** code, commands, identifiers, and exact error strings are never paraphrased or
compressed, regardless of the document's assigned level.

**Clarity exemption:** a security warning's headline AND its actionable remediation (for
Critical/High findings), an irreversible-action confirmation, and a multi-step sequence are
exempt from compression at any level.

**Non-negotiable floor:** compression is a format constraint only — no level caps the number of
findings, controls, or AC results reported at any severity.

## Workspace I/O budget

Apply `docs/output-contract-patterns.md § 6` and § 7. Workspace files are current snapshots and
evidence indexes, not transcripts. Keep every required item, but remove duplicated AC text,
prior-round prose, diffs, raw command output, and tool chronology. Read the assigned section or
digest once; use depth-on-demand only for a verdict-bearing fact; after a write verify the edited
range and size instead of re-reading the whole file. Budgets cap fixed prose and prose per item,
not the number of required projects, tasks, ACs, findings, or controls. Compact duplication, but
never omit required items or split operator-approved scope solely to meet a total-size target.

A per-round report (e.g. `reviews/04-validation.md`, `reviews/04-adversary.md`) may be replaced
wholesale each round without losing finding history: `reviews/findings-ledger.md`
(`agents/_shared/orchestrator-state.md § Findings ledger`) is the append-only record of finding
identity, class, severity, and disposition across rounds. Do not duplicate that content into the
report to preserve it.

## Status block — common fields

<!-- Consumed by: every leaf agent's Return Protocol status-block template. -->

Every leaf agent's final status block starts with the outcome:

```
agent: {name}
status: success | failed | blocked
failure_kind: {kind}               # expected when status is failed or blocked; omit on success
...
```

- **`failure_kind:`** — expected whenever `status:` is `failed` or `blocked`,
  omitted on `success`. Name the observable cause from the taxonomy in
  `agents/ref-pipeline.md § Failures`. If the field is omitted but the returned
  prose and evidence make the cause unambiguous, Main may normalize it in
  coordinator-owned state and append an observation explaining that choice.
  Ambiguous status, cause, evidence, or decision remains `invalid-return` and
  requires a fresh specialist result; Main never invents those facts.
- Model and effort are dispatch configuration and optional telemetry, not agent
  return fields. Their absence never invalidates useful work.
- Tool, Context7, memory/KG-read, token, duration, and execution-count fields
  are also optional telemetry and do not belong in a required status block.
  Record load-bearing evidence in the result or artifact instead.

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
