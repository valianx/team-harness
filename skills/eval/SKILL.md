---
name: eval
description: Evaluate and score agent or pipeline performance.
---
name: eval

Analyze the input: $ARGUMENTS

**IMPORTANT:** This skill runs directly — do NOT invoke the `orchestrator` agent or any other agent. Execute all steps yourself using the tools available to you (Bash, Glob, Read, Grep, Agent).

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

---
name: eval

## Mode 1 — Agent name + scenario (or --all)

Input pattern: `{agent-name} [--scenario {scenario-name}] [--all] [--dry-run]`

Parse the arguments:
- `agent-name`: required — the agent to evaluate (e.g., `architect`, `security`, `tester`)
- `--scenario {name}`: run a specific scenario by name
- `--all`: run all scenarios for this agent
- `--dry-run`: show what would be evaluated without executing the agent
- If no `--scenario` or `--all`: run all scenarios for the agent (same as `--all`)

### Step 1 — Load agent definition

1. Read `agents/{agent-name}.md` to get the full system prompt
2. Extract from the agent definition:
   - **Role statement** (first paragraph after frontmatter)
   - **Critical Rules** (the `## Critical Rules` section — every rule is a pass/fail criterion)
   - **NEVER statements** (grep for `NEVER` — each is a boundary that must not be crossed)
   - **Operating modes** (from `## Operating Modes` section)
   - **Expected output** (workspace doc filename from `## Session Documentation` or orchestrator team table)
   - **Model** (from frontmatter `model:` field)

If the agent file doesn't exist, report error and stop.

### Step 2 — Load scenarios

1. Look for scenarios in `eval-scenarios/{agent-name}/` directory
2. Each `.md` file in that directory is one scenario
3. If `--scenario {name}` was given, load only `eval-scenarios/{agent-name}/{name}.md`
4. If no scenarios directory or no matching scenario exists, report error with instructions:
   ```
   No scenarios found for '{agent-name}'.
   Create scenarios in: eval-scenarios/{agent-name}/
   See eval-scenarios/README.md for the scenario format.
   ```

### Step 3 — Parse each scenario

Each scenario file has this structure:

```markdown
---
name: eval
name: {scenario name}
mode: {operating mode to test — e.g., "design", "research", "audit"}
difficulty: {easy|medium|hard}
needs_scaffold: {true|false — default false. Set true when the agent reads filesystem}
---
name: eval

## Input
{The prompt/task to give the agent}

## Context
{Description of the mock environment. When needs_scaffold: true, this section
defines files to create in a temporary worktree. See Scaffold Format below.}

## Expected Behaviors
- {behavior 1 — what the agent SHOULD do}
- {behavior 2}

## Anti-Patterns
- {anti-pattern 1 — what the agent should NOT do}
- {anti-pattern 2}

## Output Criteria
- format: {expected workspace doc format, e.g., "## sections with headers"}
- completeness: {what sections must be present}
- actionability: {what makes the output useful vs generic}
```

#### Scaffold Format (for needs_scaffold: true)

When `needs_scaffold: true`, the `## Context` section defines mock files using fenced blocks. Each block is a file to create in the worktree:

````markdown
## Context

```file:package.json
{
  "name": "mock-project",
  "version": "2.1.0"
}
```

```file:CLAUDE.md
# Mock Project
## Architecture Decisions
- cursor-based pagination
```

```file:workspaces/batch-progress.md
# Batch Progress
| # | Task | Status |
|---|------|--------|
| 1 | add-auth | DONE |
| 2 | add-search-filters | RUNNING |
| 3 | add-export | PENDING |
| 4 | add-dashboard | PENDING |
```

```file:workspaces/add-search-filters/02-implementation.md
# Implementation Summary
Created filter components and service.
Files: src/filters/filter.service.ts, src/filters/filter.controller.ts
```
````

Each `file:{path}` block creates that file relative to the worktree root. Directories are created automatically.

**When needs_scaffold: false (default):** The Context section is just descriptive text passed in the prompt. The agent works from the prompt alone, no filesystem. Use this for agents that can work from provided context (architect, security with code snippets in the prompt).

**When to use needs_scaffold: true:** When the agent's system prompt has mandatory filesystem reads (e.g., "Before starting ANY work: read CLAUDE.md", "read workspaces/"). This includes: `delivery`, `implementer`, `tester`, `qa` (validate mode), and any agent with a Session Context Protocol that reads files.

### Step 4 — Execute evaluation (skip if --dry-run)

For each scenario:

#### 4a. Scaffold worktree (if needs_scaffold: true)

1. **Create a temporary git worktree:**
   ```bash
   EVAL_DIR="/tmp/eval-$(date +%s)-${agent_name}"
   mkdir -p "$EVAL_DIR"
   cd "$EVAL_DIR"
   git init
   git commit --allow-empty -m "eval scaffold"
   ```

2. **Create mock files** from the `## Context` scaffold blocks:
   - Parse each `file:{path}` block from the Context section
   - Create the directory structure: `mkdir -p $(dirname {path})`
   - Write the file contents: create `{path}` with the block contents
   - Create `.gitignore` with `/workspaces` entry (agents expect this)

3. **Initial commit** so git operations work:
   ```bash
   git add -A
   git commit -m "scaffold: mock project for eval"
   git checkout -b feature/eval-test
   ```

4. **Verify scaffold:** List created files and confirm the structure matches expectations.

#### 4b. Invoke the agent

**If needs_scaffold: true:**
- Invoke the agent via the Agent tool with:
  - `subagent_type`: the agent name (loads its system prompt)
  - Prompt: the scenario's `## Input` section
  - The agent runs inside the scaffolded worktree (pass the path context)
  - Add to the prompt: `Working directory: {EVAL_DIR}. This is a real project — read files normally.`
- The agent will find real files (CLAUDE.md, workspaces, package.json) because we scaffolded them.

**If needs_scaffold: false:**
- Invoke the agent via the Agent tool with:
  - `subagent_type`: the agent name
  - Prompt: the scenario's `## Input` section (which includes code/context inline)
  - Add suffix: `Write your output to stdout. Do NOT create workspaces or read any project files beyond what is provided.`

3. **Capture the output** from the agent's response.

#### 4c. Cleanup (after evaluation)

```bash
rm -rf "$EVAL_DIR"
```

Always clean up, even if the evaluation fails.

### Step 5 — Evaluate output

For each scenario, evaluate the agent's output against all criteria:

#### A. Critical Rules compliance

For each rule in the agent's `## Critical Rules`:
- Search the agent's output for evidence of compliance or violation
- **PASS** if no violation detected
- **FAIL** if the output contains a clear violation (with evidence quote)

#### B. NEVER boundary compliance

For each `NEVER` statement in the agent definition:
- Check if the output violates the boundary (e.g., if agent says "NEVER writes code" but output contains code blocks with implementation)
- **PASS** if boundary respected
- **FAIL** with evidence quote

#### C. Expected Behaviors

For each item in `## Expected Behaviors`:
- Check if the output demonstrates this behavior
- **PASS** with evidence quote
- **FAIL** if behavior is absent

#### D. Anti-Patterns

For each item in `## Anti-Patterns`:
- Check if the output exhibits this anti-pattern
- **PASS** if anti-pattern is absent
- **FAIL** with evidence quote

#### E. Output Criteria

For each criterion in `## Output Criteria`:
- Evaluate against the actual output
- **PASS** / **FAIL** with brief justification

### Step 6 — Report

For each scenario, produce:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  /th:eval — {agent-name} / {scenario-name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Critical Rules:     {N}/{M} passed
  NEVER Boundaries:   {N}/{M} passed
  Expected Behaviors: {N}/{M} passed
  Anti-Patterns:      {N}/{M} clean
  Output Criteria:    {N}/{M} met

  Overall: {PASS|FAIL|PARTIAL} ({total_passed}/{total_checks})

  {if any FAIL:}
  --- Failures ---
  [{category}] {criterion}: {evidence quote, max 2 lines}
  ...

  --- Strengths ---
  {1-2 notable things the agent did well}
```

After all scenarios for the agent:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Summary: {agent-name}
  Scenarios: {passed}/{total} passed
  Weakest area: {category with most failures}
  Recommendation: {one actionable suggestion to improve the agent prompt}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---
name: eval

## Mode 2 — --list

Input: `--list [agent-name]`

If agent name provided: list all scenarios for that agent.
If no agent name: list all agents that have scenarios.

```bash
# List structure
eval-scenarios/
  architect/     (3 scenarios)
  security/      (2 scenarios)
  tester/        (2 scenarios)
```

---
name: eval

## Mode 3 — --create {agent-name}

Input: `--create {agent-name} [--scenario {name}]`

Auto-generate a scenario from the agent's definition:

1. Read the agent's `.md` file
2. For each operating mode, generate one scenario that:
   - Tests the primary happy path
   - Includes at least 1 anti-pattern derived from each NEVER statement
   - Sets expected behaviors from the Critical Rules
3. Write to `eval-scenarios/{agent-name}/{mode}.md`
4. Report what was created

If `--scenario {name}` is given, generate only one scenario with that name and ask the user for the input prompt.

---
name: eval

## Mode 4 — No input

Show usage:

```
/th:eval {agent-name}              — run all scenarios for an agent
/th:eval {agent-name} --scenario X — run a specific scenario
/th:eval --list                    — list available scenarios
/th:eval --create {agent-name}     — auto-generate scenarios from agent definition
/th:eval {agent-name} --dry-run    — show evaluation plan without executing
/th:eval {agent-name} --spec X     — run scenario X as an authored spec (Mode 5)
/th:eval {agent-name} --k N        — run the scenario N times and report pass-rate P/k
/th:eval {agent-name} --baseline S — compare results against baseline SHA S
```

---
name: eval

## Mode 5 — `--spec` (eval-as-spec)

Input pattern: `{agent-name} --spec {scenario-name} [--k N] [--baseline <sha>] [--dry-run]`

A spec scenario is an authored quality contract: the pass/fail threshold is
declared in the scenario file before the run, not derived after. The `--spec`
mode reads the **pass-bar declaration** from the scenario and sets the pass/fail
bar for the evaluation accordingly.

### `--spec` argument

- `--spec {name}`: required — the scenario to evaluate as a spec. The file must
  be `eval-scenarios/{agent-name}/{name}.md` and must contain a
  `## Pass-Bar Declaration` section. If the section is absent, report an error
  and stop.

**Parsing the pass-bar declaration:** when `--spec` is active, parse the
`## Pass-Bar Declaration` section of the scenario file to extract:

1. `minimum_pass_rate` — the minimum fraction of `--k` runs that must score
   PASS overall (e.g., `4/5`). Parse as `numerator/denominator`.
2. `failing_dimensions_allowed` — per-dimension pass floors (e.g.,
   `0 on Critical Rules and NEVER Boundaries; 1 on others`). Read the full
   text and apply it as soft rules for the per-dimension verdict.
3. `rationale` — informational; include in the spec report header.

The pass-bar sets the evaluation threshold for the run. A run where the
pass-rate meets or exceeds `minimum_pass_rate` AND the per-dimension floors
are satisfied is a **spec PASS**; otherwise it is a **spec FAIL**.

### `--k N` argument — pass@k

- `--k N`: optional — run the scenario N times and report the aggregate
  pass-rate. Default: `--k 1` (today's single-run cost is preserved).
- `N` must be a positive integer. If N > 1, the evaluation invokes the agent N
  times and records each result independently.

**Cost:** the `--k N` agent-run path is PAID. Each run costs approximately $1
(one agent invocation). Total cost: **N × ~$1**. Use `--dry-run` to see the
plan and cost estimate without spending a single run.

**Cost-gated boundary:** the actual N agent invocations are NEVER part of
`tests/run-all.sh`. They are operator-invoked only. Suite 95 (`run-all.sh`)
tests the arg contract and report shape as text assertions — it never runs an
agent.

**Pipeline SHOULD-convention:** for tasks that change an agent's system prompt,
authoring a `--spec` scenario as an acceptance criterion and running
`/th:eval {agent} --spec {name} --k N` before shipping is recommended. This is
a documented SHOULD, not a hard Stage-2 gate — a ≈$1–$5 non-deterministic run
must not sit on the critical path of every agent-prompt PR.

### pass@k report block

After all `--k` runs for a scenario, produce the pass@k summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  /th:eval --spec — {agent-name} / {scenario-name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Spec pass-bar: {minimum_pass_rate} overall; {failing_dimensions_allowed}
  Rationale: {rationale from pass-bar declaration}

  Runs: {k}
  pass-rate: {P}/{k}   (P = number of runs that scored PASS)
  pass@k: {PASS|FAIL}  (PASS if P/k meets or exceeds minimum_pass_rate)

  {if pass@k is FAIL:}
  --- Spec Failures ---
  Run {n}: [{category}] {criterion}: {evidence, max 2 lines}
  ...
```

### `--baseline <sha>` argument — regression detection

- `--baseline <sha>`: optional — compare the current run results against a
  committed baseline file at `eval-scenarios/.baselines/{agent-name}.json`.
  Report NEW failures only: scenarios that were `PASS` at `<sha>` and are now
  `FAIL` (or whose `pass_rate` dropped below the baseline rate).

Scenarios already failing at the baseline SHA are not re-flagged. The intent
is regression detection, not a full rerun.

**NEW-failures-vs-baseline report shape:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Baseline: {agent-name} @ {sha}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  NEW failures vs {sha}:
  {if none:}   none — all previously-passing scenarios still pass

  {if any:}
  - {scenario}: was {baseline_verdict} ({baseline_pass_rate}), now {current_verdict} ({current_pass_rate})
  ...

  Scenarios already failing at baseline: {N} (not re-flagged)
  Total scenarios evaluated: {M}
```

### Baseline file schema (`eval-scenarios/.baselines/{agent}.json`)

The baseline file is committed to the repo and records pass rates from a
previous paid run. It MUST carry the following REQUIRED keys:

| Key | Level | Description |
|-----|-------|-------------|
| `agent` | top-level | Agent name (e.g., `"architect"`) |
| `baseline_sha` | top-level | Git SHA the baseline was recorded at |
| `k` | top-level | Number of runs per scenario used when recording |
| `scenarios` | top-level | Array of per-scenario records |
| `scenarios[].scenario` | per-scenario | Scenario name (`.md` filename without extension) |
| `scenarios[].pass_rate` | per-scenario | Pass rate string (e.g., `"5/5"`) |
| `scenarios[].verdict` | per-scenario | `"PASS"` or `"FAIL"` |

OPTIONAL keys (allowed but not required):

| Key | Level | Description |
|-----|-------|-------------|
| `recorded_at` | top-level | ISO date the baseline was recorded |
| `scenarios[].dimensions` | per-scenario | Per-dimension score breakdown object |

Example (`eval-scenarios/.baselines/architect.example.json`):

```json
{
  "agent": "architect",
  "baseline_sha": "1477a26",
  "recorded_at": "2026-06-15",
  "k": 5,
  "scenarios": [
    {
      "scenario": "design-as-spec",
      "pass_rate": "5/5",
      "verdict": "PASS",
      "dimensions": {
        "critical_rules": "5/5",
        "never_boundaries": "5/5",
        "expected_behaviors": "4/5",
        "anti_patterns": "5/5",
        "output_criteria": "5/5"
      }
    }
  ]
}
```

Recording a real baseline (writing actual run data into the file) requires a
paid run. That step is deferred — ship the schema now for format stability.

### Output Discipline

Follow the same Voice and Output Discipline rules as Modes 1–4. Status blocks
and verdict lines are declarative; no enthusiasm markers; no padding.
