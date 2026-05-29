---
name: trace
description: Show pipeline observability for a single feature.
---

Show pipeline observability for a single feature. This is a standalone read-only skill — does NOT route through the orchestrator and NEVER modifies state (no Edit, no Write, no JSONL append).

## Voice

You speak as a professional instrument: formal, neutral, declarative. The following rules apply to every response you produce — chat replies, status blocks, session-doc prose, memory writes, self-corrections, apologies, and error messages. There is no informal-chat-mode loophole.

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

## Usage

```
/th:trace <feature-name>           Print 00-pipeline-summary.md verbatim (default mode)
/th:trace <feature-name> --jsonl   Tail the last 30 events (auto-detects .md or .jsonl format)
/th:trace <feature-name> --tools   Aggregate tool usage across the pipeline
/th:trace <feature-name> --fails   Filter to failures, dispatch issues, iterations
```

Parse `$ARGUMENTS`:
- Positional: feature name (kebab-case, matches the `workspaces/{feature}/` folder).
- Optional flag: one of `--jsonl`, `--tools`, `--fails`.

If `$ARGUMENTS` is empty or just whitespace, print the usage block above and exit cleanly.

**Step 0 — Resolve workspaces path.** Read `~/.claude/.team-harness.json`. If it exists and `logs-mode` is `"obsidian"`, use `{logs-path}/{logs-subfolder}/{repo-name}` as the base path (where `repo-name` is the basename of the current working directory). If `logs-mode` is `"local"` or the file is missing, use `workspaces/` (relative to cwd). Replace all `workspaces/{feature-name}` references below with `{resolved-path}/{feature-name}`.

## File locations

For every mode, the two source artifacts are:

```
workspaces/{feature-name}/00-pipeline-summary.md
workspaces/{feature-name}/00-execution-events.md    (obsidian mode)
workspaces/{feature-name}/00-execution-events.jsonl  (local mode)
```

These are written by the **orchestrator** during pipeline runs (see `agents/orchestrator.md` → "Execution Events JSONL" + "Pipeline Summary Protocol"). If either is missing, the pipeline ran before observability was wired up or was interrupted before the orchestrator could write it.

---

## Default mode (no flag) — pipeline summary

1. Use Glob to check `workspaces/{feature-name}/00-pipeline-summary.md` exists. If not, report:
   ```
   No pipeline summary found for '{feature-name}'.
   Checked: workspaces/{feature-name}/00-pipeline-summary.md

   Possible reasons:
     • Pipeline ran before observability was wired up (pre-2026-05-21 spec).
     • Pipeline was interrupted before the orchestrator could write the summary.
     • Feature name is wrong — run /th:status to see available features.
   ```
   Exit cleanly (no crash).

2. Read the file and print it verbatim.

3. If `workspaces/{feature-name}/00-execution-events.md` or `workspaces/{feature-name}/00-execution-events.jsonl` exists, append at the bottom:
   ```
   ---
   For raw events: /th:trace {feature-name} --jsonl
   For tool effectiveness: /th:trace {feature-name} --tools
   For failures only:      /th:trace {feature-name} --fails
   ```

---

## `--jsonl` mode — raw events

1. Detect the events file:
   1. Use Glob to check for `workspaces/{feature-name}/00-execution-events.md`. If found, use it (`events_file = ...md`).
   2. If not found, check for `workspaces/{feature-name}/00-execution-events.jsonl`. If found, use it (`events_file = ...jsonl`).
   3. If neither exists, report:
      ```
      No event trace recorded for '{feature-name}'.
      ```
      Exit cleanly.

2. Print header:
   ```
   Last 30 events — {feature-name}
   ===============================
   ```

3. Use Bash to extract and tail the events. For the `.md` variant, strip the YAML frontmatter and code fence wrapper before tailing:
   ```bash
   # For .md: extract JSONL content from inside the ```jsonl fence
   sed -n '/^```jsonl$/,/^```$/{/^```/d;p}' workspaces/{feature-name}/00-execution-events.md | tail -n 30

   # For .jsonl: read directly
   tail -n 30 workspaces/{feature-name}/00-execution-events.jsonl
   ```

4. If `jq` is available (`command -v jq`), pipe through `jq -c '.'` for normalized one-line-per-event output. If not, print raw.

5. Append at the bottom:
   ```
   Full trace: cat {events_file}
   ```
   (where `{events_file}` is the resolved path, e.g., `workspaces/{feature-name}/00-execution-events.md`)

---

## `--tools` mode — tool effectiveness aggregate

1. Verify both `00-pipeline-summary.md` and the events file (`00-execution-events.md` or `00-execution-events.jsonl`) exist. If the events file is missing, fall back to printing only the `## Tool Effectiveness` section of the summary (Read the summary, slice between `## Tool Effectiveness` and the next `## ` heading).

   Detect events file: check for `.md` first (Glob), then `.jsonl`.

2. If `jq` is available, aggregate per-agent tool usage from the events content:

   For the `.md` variant, extract JSONL content first:
   ```bash
   sed -n '/^```jsonl$/,/^```$/{/^```/d;p}' workspaces/{feature-name}/00-execution-events.md | jq -s '...'
   ```

   For the `.jsonl` variant:
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
   ' workspaces/{feature-name}/00-execution-events.jsonl
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

1. Detect the events file: check for `00-execution-events.md` first (Glob), then `00-execution-events.jsonl`. If neither exists, report and exit.

2. If `jq` is available, filter the trace. For the `.md` variant, extract content first:
   ```bash
   # .md variant
   sed -n '/^```jsonl$/,/^```$/{/^```/d;p}' workspaces/{feature-name}/00-execution-events.md | jq -s '
     map(select(
       .event == "dispatch.blocked" or
       .event == "iteration.start"   or
       .event == "gate.fail"         or
       .event == "policy.deny"       or
       (.event == "phase.end" and .status != "success")
     ))
   '

   # .jsonl variant
   jq -s '
     map(select(
       .event == "dispatch.blocked" or
       .event == "iteration.start"   or
       .event == "gate.fail"         or
       .event == "policy.deny"       or
       (.event == "phase.end" and .status != "success")
     ))
   ' workspaces/{feature-name}/00-execution-events.jsonl
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

4. If `jq` is not available, fall back to a plain `grep`-style filter against whichever events file was found:
   ```bash
   grep -E '"event":"(dispatch\.blocked|iteration\.start|gate\.fail|policy\.deny)"' \
        {events_file}
   ```
   For the `.md` variant, pipe through `sed` first to strip the frontmatter and fence:
   ```bash
   sed -n '/^```jsonl$/,/^```$/{/^```/d;p}' workspaces/{feature-name}/00-execution-events.md \
     | grep -E '"event":"(dispatch\.blocked|iteration\.start|gate\.fail|policy\.deny)"'
   ```
   Print results verbatim with a header.

---

## Error handling

- **Feature name not found / no workspaces folder:** report and suggest `/th:status` to see available features. Exit cleanly.
- **Malformed JSONL line:** `jq` will fail loudly on that line. Skip with a one-line warning (`skipped 1 malformed event at line N`) and continue. Do not crash the skill.
- **No `jq` binary:** every mode has a documented fallback (raw tail, summary-section slice, grep). Never block on `jq` absence.
- **Permission errors reading workspaces:** report the OS error and exit cleanly.

---

## What `/th:trace` does NOT do

- It does not write or modify any file under `workspaces/`. Strict read-only contract — same rule as `/th:status`.
- It does not aggregate across multiple features. For cross-pipeline analysis, run `jq` manually over `workspaces/*/00-execution-events.jsonl` (local mode) or `workspaces/*/00-execution-events.md` (obsidian mode). A future `/metrics` skill may add aggregation once we have 5-10 traces to validate the shape.
- It does not modify or invalidate the trace. If the JSONL is corrupted, the renderer skips bad lines; it never deletes or rewrites them.
- It does not invoke any other agent. Read-only file reads + `jq` / `tail` / `grep` via Bash only.

---

## Relationship to `/th:status`

| Use case | Skill |
|---|---|
| "What pipelines are running right now?" | `/th:status` (no args) — table of all active pipelines |
| "Detailed narrative state for one feature" | `/th:status <feature>` — narrative renderer with TL;DR + Hot Context + Timeline from JSONL |
| "Did this pipeline work? Quick summary." | `/th:trace <feature>` — the canonical 30-second answer |
| "How effective were the tools in this pipeline?" | `/th:trace <feature> --tools` |
| "What failed and why?" | `/th:trace <feature> --fails` |
| "Show me the raw event log." | `/th:trace <feature> --jsonl` |

---

## Narration Exemption

This skill is **exempt** from the output-discipline silence rules. The operator invoked `/th:trace` specifically to see pipeline observability internals — surfacing phase names, event counts, tool usage, and timing is the explicit purpose of this skill. The narration lint (`tests/test_agent_structure.py` Suite 31) does not scan this file.

`/th:status <feature>` is the deep narrative; `/th:trace <feature>` is the rollup. They read the same events file (`.md` or `.jsonl` depending on mode) plus, in `/th:trace`'s case, the rendered summary MD.
