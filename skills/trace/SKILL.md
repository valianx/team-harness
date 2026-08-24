---
name: trace
description: Show pipeline observability for a single feature.
---

Show pipeline observability for a single feature. This is a standalone read-only skill — does NOT route through the orchestrator and NEVER modifies state (no Edit, no Write, no JSONL append).

## Voice

See `agents/_shared/operational-rules.md` § "Voice" and § "Language register" for the full
voice and dialect-neutrality contract. It applies to every response this skill produces —
chat replies, status blocks, error messages, and self-corrections alike.

## Usage

```
/th:trace <feature-name>           Print 00-pipeline-summary.md verbatim (default mode)
/th:trace <feature-name> --jsonl   Tail the last 30 events (auto-detects .md or .jsonl format)
/th:trace <feature-name> --tools   Aggregate tool usage across the pipeline
/th:trace <feature-name> --fails   Filter to failures, dispatch issues, iterations
/th:trace <feature-name> --tokens  Show token breakdown by agent and phase
```

Parse `$ARGUMENTS`:
- Positional: feature or initiative name (kebab-case, matched against persisted workspace identity).
- Optional flag: one of `--jsonl`, `--tools`, `--fails`, `--tokens` (`--cost` is accepted
  as a legacy alias for `--tokens`).

If `$ARGUMENTS` is empty or just whitespace, print the usage block above and exit cleanly.

**Step 0 — Resolve the persisted workspace identity.** Read the active runtime's
Team Harness config and use packaged `workspace-identity.mjs` discovery. Match
direct children by the literal `feature`/`initiative` identity in
`inputs/workspace-identity.json`, not by appending an unchecked name or assuming
today's date. Local single runs are below `{repo}/workspaces`; Obsidian single
runs are below `{logs-path}/{logs-subfolder}/{repo-name}`; initiative roots use
the exact canonical formula stored in the identity. If more than one candidate
matches, report ambiguity without choosing by mtime. Replace all
`workspaces/{feature-name}` examples below with the discovered absolute
workspace. Never create, migrate, or fall back between local and Obsidian roots.

## File locations

For every mode, the two source artifacts are:

```
workspaces/{feature-name}/00-pipeline-summary.md
workspaces/{feature-name}/00-execution-events.md    (obsidian mode)
workspaces/{feature-name}/00-execution-events.jsonl  (local mode)
```

These are written by the **orchestrator** during pipeline runs (see `agents/ref-pipeline.md` → "Execution Events JSONL" + "Pipeline Summary Protocol"). The initiative-level file (see "Initiative region rendering" below) is written by the same orchestrator. If either per-feature file is missing, the pipeline ran before observability was wired up or was interrupted before the orchestrator could write it.

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
   For token breakdown:    /th:trace {feature-name} --tokens
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
       kg_candidates:    [.[] | .tools.kg_save_candidates // []] | flatten | unique
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
   ```

4. If `jq` is not available, fall back to printing only the `## Tool Effectiveness` section of the summary.

### KG write-integrity rollup

After the Tool Effectiveness table, append a KG write-integrity rollup that aggregates all `kg_write` events in the trace. Current producers use `explicit-knowledge-save` and `security-finding`; aggregate retired site values too so historical workspaces remain readable. For `.md` traces, extract the JSONL fence before aggregating; for `.jsonl` traces, read directly.

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

**Integration in `--tools` Totals block:** append the rollup after `KG save candidates surfaced:` in the Totals section:
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

## `--tokens` mode — token breakdown by agent and phase

1. Detect the events file: check for `00-execution-events.md` first (Glob), then
   `00-execution-events.jsonl`. If neither exists, report and exit cleanly.


**Branch selection.** Inspect only `phase.end` records. When no record contains
an object with `usage.kind == "codex_usage_delta"`, execute legacy steps 2–6
below unchanged. Select the Native Codex branch only when a `phase.end`
contains that exact object; a `phase.start` checkpoint, route, model, agent,
or other field cannot select it. A selected native trace never mixes its
accounting with the legacy `tokens` fields; malformed/mixed native usage is
unavailable, not a fallback to the legacy token count.

2. Aggregate `phase.end` events to produce per-agent and per-phase token sums.

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
         tokens:    [.[] | .tokens // empty] | add,
         reported:  ([.[] | select(.tokens != null)] | length),
         phase_n:   ([.[]] | length),
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
       tokens:    [.[] | .tokens // empty] | add,
       reported:  ([.[] | select(.tokens != null)] | length),
       phase_n:   ([.[]] | length),
       models:    [.[] | .model // empty] | unique
     })
   ' workspaces/{feature-name}/00-execution-events.jsonl
   ```

   `tokens` sums only the phases that reported a count; `reported` of `phase_n` says how
   many did, so a partial total is never read as a complete one. `models` is the
   deduplicated list of `event.model` values across that agent's phases (empty entries
   dropped); an empty array means no event in this trace reported one.

   **If `jq` is not available, fall back to `python3`:**

   ```bash
   # Works for both .jsonl (read direct) and .md (extract fence first with sed -n)
   python3 -c "
   import json, sys, collections
   by_agent = collections.defaultdict(lambda: {'tokens': 0, 'phases': [], 'reported': 0, 'phase_n': 0, 'models': set()})
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
       tokens = e.get('tokens')
       model = e.get('model')
       by_agent[agent]['tokens'] += tokens or 0
       by_agent[agent]['phases'].append(phase)
       by_agent[agent]['phase_n'] += 1
       if tokens is not None:
           by_agent[agent]['reported'] += 1
       if model:
           by_agent[agent]['models'].add(model)
       by_phase.append({'phase': phase, 'agent': agent, 'tokens': tokens, 'model': model})
   total = sum(v['tokens'] for v in by_agent.values())
   reported = sum(v['reported'] for v in by_agent.values())
   phase_n = sum(v['phase_n'] for v in by_agent.values())
   print(json.dumps({'by_agent': [{'agent': k, 'phases': v['phases'], 'tokens': v['tokens'], 'reported': v['reported'], 'phase_n': v['phase_n'], 'models': sorted(v['models'])} for k, v in sorted(by_agent.items())], 'by_phase': by_phase, 'total': total, 'reported': reported, 'phase_n': phase_n}))
   "
   ```

3. Render output:

   ```
   Token Breakdown — {feature-name}
   ================================
   Total tokens: {N}  (summed over {reported} of {phase_n} phases that reported a count)
   Architect runs: {N}x

   By agent:
   | Agent       | Phases        | Model(s)      | Tokens |  % |
   |-------------|---------------|---------------|--------|----|
   | architect   | 1-design      | {models}      | {N}    | P% |
   | implementer | 2-implement   | {models}      | {N}    | P% |
   | ...         | ...           | ...           | ...    | .. |
   | Total       |               |               | {N}    |100%|

   By phase:
   | Phase         | Agent       | Tokens |
   |---------------|-------------|--------|
   | 1-design      | architect   | {N}    |
   | 2-implement   | implementer | {N}    |
   | ...           | ...         | ...    |
   ```

   - A phase with no reported count renders `—` in the Tokens column and adds nothing
     to the total. Never substitute `0` or an estimate for it.
   - `Model(s)` renders the aggregated `models` list for that agent, or `—` when no
     `phase.end` reported one. It is diagnostic context, never gate evidence.
   - If neither `jq` nor `python3` is available, print:
     ```
     Token summary: install jq or python3 to compute the breakdown
     ```
     and fall back to printing the `## Cost` section of `00-pipeline-summary.md`
     (if it exists).

4. **Initiative-level token rollup (reader-only) — reachable during `--tokens`.**
   After rendering the per-feature table, read the feature's `00-state.md`. When
   it declares `initiative: {name}`, resolve the initiative-level
   `00-execution-events` trace at the initiative root — detect the `.md` variant
   first (Glob), then `.jsonl`, applying the same fence-extraction used by every
   other mode (source paths and derivation in "Initiative region rendering
   (serial multi-project sequencing)" below). Filter to `initiative.start` /
   `project.start` / `project.end` / `initiative.converge` events; when an
   `initiative.start` is present, sum token counts across all projects' own
   `{project}/00-execution-events.*` files (each project keeps its full
   per-phase trace) to produce one initiative-level token figure, appended below
   the per-feature token table with the header
   `Initiative token rollup — {initiative}`. This is a pure read of each
   project's OWN events file — it never writes to any project's events file or
   `00-state.md` and never touches the gate seam.
   **Fail-soft:** no `initiative` field, no initiative-level events file, or a
   read/parse error → omit the rollup silently; the per-feature token output is
   unaffected.



### Native Codex branch — selected only by `usage.kind`

Read only the allowlisted native `phase.end.usage` delta and its safe
checkpoints. Do not scan rollouts. Every started native phase must close
measured or with a collector-safe unavailable reason. A missing, malformed,
unavailable, regressive, conflicting, or mixed delta makes the full native
aggregate unavailable; never use `0`, an estimate, a previous delta, an alias,
or a legacy subtotal.

Sum each `usage.components.total_tokens` exactly once. Display
`reasoning_output_tokens` as its own dimension and never add it to
`total_tokens` again. Reused sessions are already handled by checkpoint
subtraction and never render as identifiers.

Current native data has neither a bundled quote nor an exact provider/model
identity, so render:

```text
Cost Breakdown — {feature-name}
================================
Usage: {measured|unavailable (REASON_CODE)}
Total tokens: {N|unavailable}
Cost: unavailable
```

A future native USD amount is allowed only if every non-overlapping priced
dimension has a current, exact, case-sensitive tuple `provider`, `model`,
`dimension`, `currency: USD`, a non-empty `source`, and an effective date
range covering the measurement date, and a finite strictly positive
`rate_per_million`. The rate must be a strictly positive decimal. The native
`pricing_identity.provider`
and `.model` must match exactly. Never infer provider/model/rate from a role,
event model, frontmatter default, prefix, family, or alias; never blend rates
or convert currency. These restrictions apply only to this selected Native
Codex branch.

**Native initiative rollup (reader-only).** Apply the same native branch to
every child trace. Any unavailable child delta makes the native initiative
total unavailable; absent exact quotes render `Cost: unavailable`. Never form
a plausible partial subtotal.

## Initiative region rendering (serial multi-project sequencing)

**When rendered:** in default mode (no flag), after the `00-pipeline-summary.md` printout, when the feature's `00-state.md` declares `initiative: {name}` and an initiative-level `00-execution-events` file exists (`docs/observability.md § "Initiative-level trace (serial multi-project sequencing)"`). No new flag — this is additive output on the existing default-mode invocation.

**Source:** the initiative-level file lives at the initiative root, not inside `workspaces/{feature-name}/`:
```text
{common-parent-of-sibling-repos}/{YYYY-MM-DD}_{initiative}/00-execution-events.jsonl   (local mode)
{logs-path}/{logs-subfolder}/{repo_base}/{YYYY-MM-DD}_{initiative}/00-execution-events.md  (obsidian mode)
```
Detect the `.md` variant first (Glob), then `.jsonl`, applying the same fence-extraction as every other mode above.

The initiative-level lifecycle events are written by the **orchestrator** — the same coordinator that runs every project's own pipeline, one project at a time, to completion (`agents/ref-dispatch-machinery.md § Multi-project sequencing`; `docs/observability.md § "Initiative-level trace (serial multi-project sequencing)"`). There is no separate roster and no parallel fan-out to enumerate.

**Derivation.** Filter to `initiative.start` / `project.start` / `project.end` / `initiative.converge` events. `initiative.start` carries `eligible_projects[]`. A `project.start` with no matching `project.end` for the same `project` is the currently running project — because execution is serial, at most one project is ever running at a time. A paired `project.start`/`project.end` is closed, with `project.end.status` (`success`/`failed`/`iterating`) as its outcome. `initiative.converge` marks that every eligible project has run, with its `projects[]` array as the authoritative per-project final status.

**Gate values are read directly from each project's own `00-state.md`,** never from a roster or any advisory field: `gate1_release` / `gate3_release` come straight from that project's own state file.

**Render:**
```text
Initiative — {initiative}  (serial — at most one project running at a time)
=============================
initiative.start  {ts}  eligible: {eligible_projects joined by ", "}

  {project-a}   {ts_start} → {ts_end | "running"}   {status}   gate: {gate1_release|gate3_release|—}
  {project-b}   {ts_start} → {ts_end | "not started"}   —   gate: —

initiative.converge  {ts | "(not yet — projects still pending)"}
```

Projects render in `eligible_projects[]` order (not start-time order), so the same project always occupies the same row across repeated invocations while the initiative is in progress.

**Legacy Claude selection.** When no child trace has a selected native `usage` object, retain this existing rollup unchanged.

**`--tokens` interaction (reader-only rollup).** Executed by `--tokens` mode step 4 above — the initiative-level trace is resolved during `--tokens` execution, not only default-mode rendering. When an `initiative.start` is present, `--tokens` sums token counts across all projects' own `{project}/00-execution-events.*` files (each project keeps its full per-phase trace) to produce one initiative-level token figure, appended below the per-feature token table with the header `Initiative token rollup — {initiative}`. This is a pure read of each project's OWN events file — it never writes to any project's events file or `00-state.md` and never touches the gate seam.

**Native selection.** If any child trace is selected by a `phase.end` object
with `usage.kind: codex_usage_delta`, apply the Native Codex branch to every
child instead. A missing/unavailable native delta makes initiative tokens
unavailable, and absent exact current USD provenance renders
`Cost: unavailable`; never emit a plausible partial subtotal.


**Fail-soft.** No `initiative` field, no initiative-level events file, or a read/parse error → omit this section silently. It never blocks or degrades any other mode.

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
| "How many tokens did this pipeline spend?" | `/th:trace <feature> --tokens` |
| "What failed and why?" | `/th:trace <feature> --fails` |
| "Show me the raw event log." | `/th:trace <feature> --jsonl` |

---

## Narration Exemption

This skill is **exempt** from the output-discipline silence rules. The operator invoked `/th:trace` specifically to see pipeline observability internals — surfacing phase names, event counts, tool usage, and timing is the explicit purpose of this skill. The narration lint does not apply to this file.

`/th:pipelines <feature>` is the deep narrative; `/th:trace <feature>` is the rollup. They read the same events file (`.md` or `.jsonl` depending on mode) plus, in `/th:trace`'s case, the rendered summary MD.
