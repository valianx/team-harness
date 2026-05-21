Show pipeline observability for a single feature. This is a standalone read-only skill — does NOT route through the orchestrator and NEVER modifies state (no Edit, no Write, no JSONL append).

Analyze the input: $ARGUMENTS

---

## Usage

```
/trace <feature-name>           Print 00-pipeline-summary.md verbatim (default mode)
/trace <feature-name> --jsonl   Tail the last 30 lines of 00-execution-events.jsonl
/trace <feature-name> --tools   Aggregate tool usage across the pipeline
/trace <feature-name> --fails   Filter to failures, dispatch issues, iterations
```

Parse `$ARGUMENTS`:
- Positional: feature name (kebab-case, matches the `session-docs/{feature}/` folder).
- Optional flag: one of `--jsonl`, `--tools`, `--fails`.

If `$ARGUMENTS` is empty or just whitespace, print the usage block above and exit cleanly.

---

## File locations

For every mode, the two source artifacts are:

```
session-docs/{feature-name}/00-pipeline-summary.md
session-docs/{feature-name}/00-execution-events.jsonl
```

These are written by the **orchestrator** during pipeline runs (see `agents/orchestrator.md` → "Execution Events JSONL" + "Pipeline Summary Protocol"). If either is missing, the pipeline ran before observability was wired up or was interrupted before the orchestrator could write it.

---

## Default mode (no flag) — pipeline summary

1. Use Glob to check `session-docs/{feature-name}/00-pipeline-summary.md` exists. If not, report:
   ```
   No pipeline summary found for '{feature-name}'.
   Checked: session-docs/{feature-name}/00-pipeline-summary.md

   Possible reasons:
     • Pipeline ran before observability was wired up (pre-2026-05-21 spec).
     • Pipeline was interrupted before the orchestrator could write the summary.
     • Feature name is wrong — run /status to see available features.
   ```
   Exit cleanly (no crash).

2. Read the file and print it verbatim.

3. If `session-docs/{feature-name}/00-execution-events.jsonl` also exists, append at the bottom:
   ```
   ---
   For raw events: /trace {feature-name} --jsonl
   For tool effectiveness: /trace {feature-name} --tools
   For failures only:      /trace {feature-name} --fails
   ```

---

## `--jsonl` mode — raw events

1. Glob-check `session-docs/{feature-name}/00-execution-events.jsonl`. If absent, report:
   ```
   No event trace recorded for '{feature-name}'.
   ```
   Exit cleanly.

2. Print header:
   ```
   Last 30 events — {feature-name}
   ===============================
   ```

3. Use Bash to run:
   ```bash
   tail -n 30 session-docs/{feature-name}/00-execution-events.jsonl
   ```

4. If `jq` is available (`command -v jq`), pipe through `jq -c '.'` for normalized one-line-per-event output. If not, print raw.

5. Append at the bottom:
   ```
   Full trace: cat session-docs/{feature-name}/00-execution-events.jsonl
   ```

---

## `--tools` mode — tool effectiveness aggregate

1. Verify both `00-pipeline-summary.md` and `00-execution-events.jsonl` exist. If JSONL is missing, fall back to printing only the `## Tool Effectiveness` section of the summary (Read the summary, slice between `## Tool Effectiveness` and the next `## ` heading).

2. If `jq` is available, aggregate per-agent tool usage from the JSONL:
   ```bash
   jq -s '
     map(select(.event == "phase.end" and .tools)) |
     group_by(.agent) |
     map({
       agent: .[0].agent,
       phases: [.[] | .phase] | unique,
       context7_hit:     [.[] | .tools.context7.hit     // 0] | add,
       context7_miss:    [.[] | .tools.context7.miss    // 0] | add,
       context7_skipped: [.[] | .tools.context7.skipped // 0] | add,
       memory_search:    [.[] | .tools.memory.search_nodes // 0] | add,
       memory_open:      [.[] | .tools.memory.open_nodes   // 0] | add,
       kg_candidates:    [.[] | .tools.kg_save_candidates // []] | flatten | unique,
       kg_passive:       [.[] | .tools.kg_passive_capture] | map(select(.)) | first
     })
   ' session-docs/{feature-name}/00-execution-events.jsonl
   ```

3. Render the result as a table:
   ```
   Tool Effectiveness — {feature-name}
   ===================================

   | Agent      | Phases          | c7 hit | c7 miss | c7 skip | mem search | mem open | KG candidates |
   |------------|-----------------|--------|---------|---------|------------|----------|---------------|
   | architect  | 1-design        | 2      | 0       | 0       | 1          | 0        | nextjs-auth-v4 |
   | tester     | 3-verify        | 3      | 1       | 0       | 2          | 0        | —             |
   | ...        | ...             | ...    | ...     | ...     | ...        | ...      | ...           |

   Totals:
     context7: {N} hit, {M} miss, {K} skipped   ({hit_pct}% hit rate excluding skipped)
     memory:   {N} search_nodes, {M} open_nodes
     KG save candidates surfaced: {N} unique ({list})
     KG passive capture (delivery): {written|skipped|failed|—}
   ```

4. If `jq` is not available, fall back to printing only the `## Tool Effectiveness` section of the summary.

---

## `--fails` mode — failures, dispatch issues, iterations

1. Verify `00-execution-events.jsonl` exists. If absent, report and exit.

2. If `jq` is available, filter the trace:
   ```bash
   jq -s '
     map(select(
       .event == "dispatch.blocked" or
       .event == "iteration.start"   or
       .event == "gate.fail"         or
       .event == "policy.deny"       or
       (.event == "phase.end" and .status != "success")
     ))
   ' session-docs/{feature-name}/00-execution-events.jsonl
   ```

3. Render grouped output:
   ```
   Failures & Issues — {feature-name}
   ==================================

   Dispatch Issues:
     • (none)
     OR
     • {ts} — {reason} — action: {action}

   Iterations (root cause classified):
     • Iter 1 ({phase}, Case {A|B|C|D}): {summary}
     • ...

   Gate Failures:
     • {phase} ({verdict}): {summary}

   Agent Failures:
     • {agent} ({phase}): {summary}

   Policy Denials:
     • {ts} ({phase}): {summary}
   ```

4. If `jq` is not available, fall back to a plain `grep`-style filter:
   ```bash
   grep -E '"event":"(dispatch\.blocked|iteration\.start|gate\.fail|policy\.deny)"' \
        session-docs/{feature-name}/00-execution-events.jsonl
   ```
   Print results verbatim with a header.

---

## Error handling

- **Feature name not found / no session-docs folder:** report and suggest `/status` to see available features. Exit cleanly.
- **Malformed JSONL line:** `jq` will fail loudly on that line. Skip with a one-line warning (`skipped 1 malformed event at line N`) and continue. Do not crash the skill.
- **No `jq` binary:** every mode has a documented fallback (raw tail, summary-section slice, grep). Never block on `jq` absence.
- **Permission errors reading session-docs:** report the OS error and exit cleanly.

---

## What `/trace` does NOT do

- It does not write or modify any file under `session-docs/`. Strict read-only contract — same rule as `/status`.
- It does not aggregate across multiple features. For cross-pipeline analysis, run `jq` manually over `session-docs/*/00-execution-events.jsonl`. A future `/metrics` skill may add aggregation once we have 5-10 traces to validate the shape.
- It does not modify or invalidate the trace. If the JSONL is corrupted, the renderer skips bad lines; it never deletes or rewrites them.
- It does not invoke any other agent. Read-only file reads + `jq` / `tail` / `grep` via Bash only.

---

## Relationship to `/status`

| Use case | Skill |
|---|---|
| "What pipelines are running right now?" | `/status` (no args) — table of all active pipelines |
| "Detailed narrative state for one feature" | `/status <feature>` — narrative renderer with TL;DR + Hot Context + Timeline from JSONL |
| "Did this pipeline work? Quick summary." | `/trace <feature>` — the canonical 30-second answer |
| "How effective were the tools in this pipeline?" | `/trace <feature> --tools` |
| "What failed and why?" | `/trace <feature> --fails` |
| "Show me the raw event log." | `/trace <feature> --jsonl` |

`/status <feature>` is the deep narrative; `/trace <feature>` is the rollup. They read the same JSONL plus, in `/trace`'s case, the rendered summary MD.
