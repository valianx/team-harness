# eval-scenarios

Scenario files for `/th:eval`. Each scenario tests an agent against a declared
set of expected behaviors, anti-patterns, and output criteria.

---

## Spec scenario format (Mode 5 — `--spec`)

A spec scenario is an ordinary eval scenario with one additional section: a
**pass-bar declaration**. The pass-bar makes the scenario an authored quality
contract: the pass/fail threshold is declared before the run, not derived
after.

```
eval-scenarios/
  {agent}/
    {scenario-name}.md    — one scenario per file
  _templates/
    spec.md               — spec template (copy and fill in)
  .baselines/
    {agent}.json          — committed baseline for --baseline comparisons
    {agent}.example.json  — example showing the schema (not real run data)
```

### Required sections

Every scenario file must contain all five standard sections plus the pass-bar
declaration:

| Section | Purpose |
|---------|---------|
| `## Input` | The prompt / task given to the agent |
| `## Context` | Mock environment description (or scaffold blocks when `needs_scaffold: true`) |
| `## Expected Behaviors` | What the agent SHOULD do (each item is a scored criterion) |
| `## Anti-Patterns` | What the agent must NOT do |
| `## Output Criteria` | Format, completeness, and actionability of the agent's output |
| `## Pass-Bar Declaration` | Minimum pass threshold for `--spec` mode (filled in before running) |

See `eval-scenarios/_templates/spec.md` for the template with all sections.

### Pass-bar declaration

The pass-bar declaration is parsed by `/th:eval --spec` to set the pass/fail
threshold for the run. It must state which dimension(s) must pass and at what
rate. Example:

```markdown
## Pass-Bar Declaration

- minimum_pass_rate: 4/5 (critical rules + never boundaries must be 5/5)
- failing_dimensions_allowed: 0 on Critical Rules and NEVER Boundaries; 1 on others
- rationale: architect outputs are structural — Critical Rules and NEVER Boundaries
  are hard gates; Expected Behaviors allows one miss on edge-case items.
```

---

## Baseline file format (`eval-scenarios/.baselines/{agent}.json`)

A baseline file records the pass rates from a previous paid run at a specific
git SHA. The `--baseline <sha>` flag uses it to detect NEW regressions only —
scenarios that were passing at that SHA and are now failing.

### REQUIRED keys

Every baseline file MUST carry all of these keys:

| Key | Level | Description |
|-----|-------|-------------|
| `agent` | top-level | Agent name (e.g., `"architect"`) |
| `baseline_sha` | top-level | Git commit SHA the baseline was recorded at |
| `k` | top-level | Number of runs per scenario (`--k N`) used when recording |
| `scenarios` | top-level | Array of per-scenario records |
| `scenarios[].scenario` | per-scenario | Scenario name (matches the `.md` filename without extension) |
| `scenarios[].pass_rate` | per-scenario | Pass rate string (e.g., `"5/5"`) |
| `scenarios[].verdict` | per-scenario | `"PASS"` or `"FAIL"` |

### OPTIONAL keys

These keys are allowed but not required:

| Key | Level | Description |
|-----|-------|-------------|
| `recorded_at` | top-level | ISO date the baseline was recorded (e.g., `"2026-06-15"`) |
| `scenarios[].dimensions` | per-scenario | Per-dimension breakdown (object with category scores) |

### Example

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

See `eval-scenarios/.baselines/architect.example.json` for the full example
file matching the schema above.

---

## Free vs paid

| Layer | Free (Suite 95 / `run-all.sh`) | Paid (operator-invoked) |
|-------|-------------------------------|------------------------|
| Template + required sections | Text assertion | — |
| Arg contract (`--spec`, `--k`, `--baseline`) | String presence in SKILL | — |
| Report shape (pass-rate, pass@k verdict) | String presence in SKILL | — |
| Baseline file schema | `json.loads` + key check | — |
| Actual N agent runs | — | `/th:eval ... --k N` |
| Recording a real baseline | — | Manual paid run |
| Regression comparison vs baseline | — | Manual paid run |

The paid run path is NEVER wired into `tests/run-all.sh`. Cost: ≈ N × $1 per
`--k N`. Use `--dry-run` to see the plan and cost estimate without spending.
