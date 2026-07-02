---
name: trace
description: Show pipeline observability for a single feature.
---

Show pipeline observability for a single feature. This is a standalone read-only skill — does NOT route through the orchestrator and NEVER modifies state (no Edit, no Write, no JSONL append).

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

## Usage

```
/th:trace <feature-name>           Print 00-pipeline-summary.md verbatim (default mode)
/th:trace <feature-name> --jsonl   Tail the last 30 events (auto-detects .md or .jsonl format)
/th:trace <feature-name> --tools   Aggregate tool usage across the pipeline
/th:trace <feature-name> --fails   Filter to failures, dispatch issues, iterations
/th:trace <feature-name> --cost    Show cost breakdown by agent and phase
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
     • Feature name is wrong — run /th:pipelines to see available features.
   ```
   Exit cleanly (no crash).

2. Read the file and print it verbatim.

3. If `workspaces/{feature-name}/00-execution-events.md` or `workspaces/{feature-name}/00-execution-events.jsonl` exists, append at the bottom:
   ```
   ---
   For raw events: /th:trace {feature-name} --jsonl
   For tool effectiveness: /th:trace {feature-name} --tools
   For cost breakdown:     /th:trace {feature-name} --cost
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

### KG write-integrity rollup

After the Tool Effectiveness table, append a KG write-integrity rollup that aggregates all `kg_write` events in the trace. This rollup covers all three write sites (`phase6-knowledge-save`, `security-finding`, `delivery-passive-capture`) and is format-agnostic: for `.md` traces, extract the JSONL fence before aggregating; for `.jsonl` traces, read directly.

**Output format:**

When the trace contains `kg_write` events:
```
KG writes: N attempted, M succeeded
```

If any writes were skipped (`N > M`), append a per-reason-code breakdown:
```
KG writes: 7 attempted, 5 succeeded
  skipped: 1 mcp-down, 1 policy-filtered
```

When no `kg_write` events are in the trace (e.g., pre-beacon pipeline or `--fast` run that did not reach Phase 6):
```
KG writes: none recorded
```

**Aggregation with `jq` (canonical):**

```bash
# .md variant — extract fence first, then aggregate
sed -n '/^```jsonl$/,/^```$/{/^```/d;p}' {events_file} | jq -s '
  map(select(.event == "kg_write")) as $w |
  {
    attempted: ($w | map(.attempted) | add // 0),
    succeeded: ($w | map(.succeeded) | add // 0),
    by_reason: ($w | map(.writes[]) | group_by(.reason)
                | map({reason: .[0].reason, n: length})
                | map(select(.reason != "ok")))
  }
'

# .jsonl variant — read directly
jq -s '
  map(select(.event == "kg_write")) as $w |
  {
    attempted: ($w | map(.attempted) | add // 0),
    succeeded: ($w | map(.succeeded) | add // 0),
    by_reason: ($w | map(.writes[]) | group_by(.reason)
                | map({reason: .[0].reason, n: length})
                | map(select(.reason != "ok")))
  }
' {events_file}
```

**Fallback without `jq`** — use `python3` to sum `attempted` / `succeeded` and group `writes[].reason` across all `kg_write` lines:

```bash
# Works for both .jsonl (read direct) and .md (extract fence first with sed -n)
python3 -c "
import json, sys, collections
attempted = 0; succeeded = 0; reasons = collections.Counter()
for line in sys.stdin:
    try:
        e = json.loads(line)
    except Exception:
        continue
    if e.get('event') != 'kg_write':
        continue
    attempted += e.get('attempted', 0)
    succeeded += e.get('succeeded', 0)
    for w in e.get('writes', []):
        r = w.get('reason', '')
        if r != 'ok':
            reasons[r] += 1
if attempted == 0:
    print('KG writes: none recorded')
else:
    print(f'KG writes: {attempted} attempted, {succeeded} succeeded')
    if reasons:
        parts = ', '.join(f'{n} {r.replace(\"skipped:\",\"\")}' for r, n in sorted(reasons.items()))
        print(f'  skipped: {parts}')
"
```

If neither `jq` nor `python3` is available, print:
```
KG writes: trace present, install jq or python3 for the rollup
```

**Integration in `--tools` Totals block:** append the rollup line after `KG passive capture (delivery):` in the Totals section:
```
KG writes (all sites): N attempted, M succeeded{breakdown}
```

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

## `--cost` mode — cost breakdown by agent and phase

1. Detect the events file: check for `00-execution-events.md` first (Glob), then
   `00-execution-events.jsonl`. If neither exists, report and exit cleanly.

2. Read the price table from `~/.claude/.team-harness.json` (key `pricing`). If
   the key is absent, malformed, or any required sub-field is missing, set
   `has_pricing = false` — the mode continues but shows tokens only with the line:
   ```
   price table not configured — showing tokens only
   ```

3. Aggregate `phase.end` events to produce per-agent and per-phase token sums.

   **If `jq` is available:**

   For the `.md` variant, extract JSONL content first:
   ```bash
   sed -n '/^```jsonl$/,/^```$/{/^```/d;p}' workspaces/{feature-name}/00-execution-events.md | \
     jq -s '
       map(select(.event == "phase.end")) |
       group_by(.agent) |
       map({
         agent:     .[0].agent,
         phases:    [.[] | .phase],
         tokens:    [.[] | .tokens // 0] | add,
         estimated: ([.[] | select(.tokens_estimated == true)] | length),
         models:    [.[] | .model // empty] | unique
       })
     '
   ```

   For the `.jsonl` variant:
   ```bash
   jq -s '
     map(select(.event == "phase.end")) |
     group_by(.agent) |
     map({
       agent:     .[0].agent,
       phases:    [.[] | .phase],
       tokens:    [.[] | .tokens // 0] | add,
       estimated: ([.[] | select(.tokens_estimated == true)] | length),
       models:    [.[] | .model // empty] | unique
     })
   ' workspaces/{feature-name}/00-execution-events.jsonl
   ```

   `models` is the deduplicated list of `event.model` values reported across that agent's phases (empty entries dropped). An empty `models` array means no event in this trace reported `model` — classification falls through to frontmatter/static-list (step 4).

   **If `jq` is not available, fall back to `python3`:**

   ```bash
   # Works for both .jsonl (read direct) and .md (extract fence first with sed -n)
   python3 -c "
   import json, sys, collections
   by_agent = collections.defaultdict(lambda: {'tokens': 0, 'phases': [], 'estimated': 0, 'models': set()})
   by_phase = []
   for line in sys.stdin:
       try:
           e = json.loads(line)
       except Exception:
           continue
       if e.get('event') != 'phase.end':
           continue
       agent = e.get('agent', 'unknown')
       phase = e.get('phase', '?')
       tokens = e.get('tokens') or 0
       est = 1 if e.get('tokens_estimated') else 0
       model = e.get('model')
       by_agent[agent]['tokens'] += tokens
       by_agent[agent]['phases'].append(phase)
       by_agent[agent]['estimated'] += est
       if model:
           by_agent[agent]['models'].add(model)
       by_phase.append({'phase': phase, 'agent': agent, 'tokens': tokens, 'estimated': est, 'model': model})
   total = sum(v['tokens'] for v in by_agent.values())
   est_phases = sum(v['estimated'] for v in by_agent.values())
   print(json.dumps({'by_agent': [{'agent': k, 'phases': v['phases'], 'tokens': v['tokens'], 'estimated': v['estimated'], 'models': sorted(v['models'])} for k, v in sorted(by_agent.items())], 'by_phase': by_phase, 'total': total, 'est_phases': est_phases}))
   "
   ```

4. Compute cost if `has_pricing == true`. Model classification uses the same
   priority order as `docs/observability.md § Derivation rule` — this skill
   MUST NOT diverge from that document:
   - **Primary path — `event.model` / the per-agent `models` list.** When a
     phase (by-phase table) or an agent's `models` list (by-agent table)
     carries a non-empty `model` value, classify from it directly: `opus`
     when the value starts with `claude-opus` or equals `opus`; `sonnet`
     otherwise. If an agent's `models` list has more than one distinct value
     (a session model override applied to some but not all of that agent's
     dispatches), classify each phase row individually from its own
     `event.model` and fall back to the next path only for phases with no
     `model` reported.
   - **Fallback path — frontmatter `model:` field.** When `model` is absent
     for that phase/agent, read `agents/{agent}.md` YAML frontmatter. `opus`
     when it starts with `claude-opus` or equals `opus`; `sonnet` otherwise.
   - **Static opus-agent fallback** (only when both paths above are
     unavailable): `architect`, `security`, `adversary`, `qa-plan`,
     `ux-reviewer`, `reviewer`, `reviewer-consolidator`, `agent-builder`,
     `mentor`, `gcp-infra`, `gcp-cost-analyzer`, `orchestrator` → `opus`.
     This list MUST match `docs/observability.md § Derivation rule` verbatim
     — do not edit one without the other.
   - **No "all others → sonnet" default.** When none of the three paths
     resolve, classify as `sonnet` and mark the row with `(?)`.
   - When `tokens_in` / `tokens_out` are available in the event, use
     `(tokens_in × input + tokens_out × output) / 1_000_000`.
   - When only `tokens` total is available, use
     `tokens × (input + output) / 2 / 1_000_000` and mark with `(~)`.

5. Render output:

   ```
   Cost Breakdown — {feature-name}
   ================================
   Total tokens: {N}  (measured — {or: N phases estimated})
   Total cost:   ~${X.XX}   (or: price table not configured — showing tokens only)
   Architect runs: {N}x

   By agent:
   | Agent       | Phases        | Tokens | Cost    |  % |
   |-------------|---------------|--------|---------|----|
   | architect   | 1-design      | {N}    | ~${X}   | P% |
   | implementer | 2-implement   | {N}    | ~${X}   | P% |
   | ...         | ...           | ...    | ...     | .. |
   | Total       |               | {N}    | ~${X}   |100%|

   By phase:
   | Phase         | Agent       | Tokens | Cost    |
   |---------------|-------------|--------|---------|
   | 1-design      | architect   | {N}    | ~${X}   |
   | 2-implement   | implementer | {N}    | ~${X}   |
   | ...           | ...         | ...    | ...     |
   ```

   - Mark estimated phases with `(~)` in the Tokens column.
   - When `has_pricing == false`, omit the `Cost` columns and append the
     degradation line after the totals row.
   - If neither `jq` nor `python3` is available, print:
     ```
     Cost summary: install jq or python3 to compute the breakdown
     ```
     and fall back to printing the `## Cost` section of `00-pipeline-summary.md`
     (if it exists).

---

## Parallel region rendering (fan-out)

**When rendered:** in default mode (no flag), after the `00-pipeline-summary.md` printout, when the feature's `00-state.md` declares `initiative: {name}` and an initiative-level `00-execution-events` file exists (`docs/observability.md § Initiative-level fan-out trace`). No new flag — this is additive output on the existing default-mode invocation.

**Source:** the initiative-level file lives at the initiative root, not inside `workspaces/{feature-name}/`:
```text
{common-parent-of-sibling-repos}/{YYYY-MM-DD}_{initiative}/00-execution-events.jsonl   (local mode)
{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}/00-execution-events.md  (obsidian mode)
```
Detect the `.md` variant first (Glob), then `.jsonl`, applying the same fence-extraction as every other mode above.

**Derivation.** Filter to `fanout.*` events. Group `fanout.lane.start` / `fanout.lane.end` pairs by `project` (matched on the shared `project` key). A lane with a `start` and no matching `end` is still running; a lane with both is closed, with `end.status` (`success`/`failed`/`iterating`) as its outcome. `fanout.converge` marks the region's closing boundary — its `lanes[]` array is the authoritative per-lane final status when present.

**Render:**
```text
Parallel region — {initiative}
=============================
fanout.start  {ts}  eligible: {eligible_projects joined by ", "}  cap: {cap}

  {project-a}   {ts_start} → {ts_end | "running"}   {status}
  {project-b}   {ts_start} → {ts_end | "running"}   {status}

fanout.converge  {ts | "(not yet — region still open)"}
```

Lanes render side-by-side in `eligible_projects[]` order (not start-time order), so the same project always occupies the same row across repeated invocations while a region is open.

**`--cost` interaction.** When a `fanout.start`/`fanout.converge` pair is present, `--cost` sums token counts across all lanes' own `{project}/00-execution-events.*` files (each lane keeps its full per-phase trace) to produce one initiative-level cost figure, appended below the per-feature cost table with the header `Initiative cost rollup — {initiative}`.

**Fail-soft.** No `initiative` field, no initiative-level events file, no `fanout.*` events, or a read/parse error → omit this section silently. It never blocks or degrades any other mode.

---

## Error handling

- **Feature name not found / no workspaces folder:** report and suggest `/th:pipelines` to see available features. Exit cleanly.
- **Malformed JSONL line:** `jq` will fail loudly on that line. Skip with a one-line warning (`skipped 1 malformed event at line N`) and continue. Do not crash the skill.
- **No `jq` binary:** every mode has a documented fallback (raw tail, summary-section slice, grep). Never block on `jq` absence.
- **Permission errors reading workspaces:** report the OS error and exit cleanly.

---

## What `/th:trace` does NOT do

- It does not write or modify any file under `workspaces/`. Strict read-only contract — same rule as `/th:pipelines`.
- It does not aggregate across multiple features. For cross-pipeline analysis, run `jq` manually over `workspaces/*/00-execution-events.jsonl` (local mode) or `workspaces/*/00-execution-events.md` (obsidian mode). A future `/metrics` skill may add aggregation once we have 5-10 traces to validate the shape.
- It does not modify or invalidate the trace. If the JSONL is corrupted, the renderer skips bad lines; it never deletes or rewrites them.
- It does not invoke any other agent. Read-only file reads + `jq` / `tail` / `grep` via Bash only.

---

## Relationship to `/th:pipelines`

| Use case | Skill |
|---|---|
| "What pipelines are running right now?" | `/th:pipelines` (no args) — table of all active pipelines |
| "Detailed narrative state for one feature" | `/th:pipelines <feature>` — narrative renderer with TL;DR + Hot Context + Timeline from JSONL |
| "Did this pipeline work? Quick summary." | `/th:trace <feature>` — the canonical 30-second answer |
| "How effective were the tools in this pipeline?" | `/th:trace <feature> --tools` |
| "What did this pipeline cost in tokens and dollars?" | `/th:trace <feature> --cost` |
| "What failed and why?" | `/th:trace <feature> --fails` |
| "Show me the raw event log." | `/th:trace <feature> --jsonl` |

---

## Narration Exemption

This skill is **exempt** from the output-discipline silence rules. The operator invoked `/th:trace` specifically to see pipeline observability internals — surfacing phase names, event counts, tool usage, and timing is the explicit purpose of this skill. The narration lint (`tests/test_agent_structure.py` Suite 31) does not scan this file.

`/th:pipelines <feature>` is the deep narrative; `/th:trace <feature>` is the rollup. They read the same events file (`.md` or `.jsonl` depending on mode) plus, in `/th:trace`'s case, the rendered summary MD.
