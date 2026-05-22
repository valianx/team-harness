Analyze the input: $ARGUMENTS

---

## Mode 1 — Text description

1. Pass to the `th-orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: spike
   - Description: {user's full text}
   - Hypothesis: {what the user wants to prove or test — extract from description}
   ```

## Mode 2 — No input provided

Ask the user: "Describe what you want to spike — what hypothesis or approach do you want to test quickly?"

---

## Important

- Always invoke the `th-orchestrator` agent — do NOT invoke agents directly
- Spikes are fast, exploratory — no design phase, no tests, no delivery
- The th-orchestrator will invoke the implementer directly and present results
- After the spike, the user decides: formalize as feature, discard, or investigate further
