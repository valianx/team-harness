---
name: spike
description: Quick prototype to test a technical hypothesis.
---

Analyze the input: $ARGUMENTS

---
name: spike

## Mode 1 — Text description

1. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: spike
   - Description: {user's full text}
   - Hypothesis: {what the user wants to prove or test — extract from description}
   ```

## Mode 2 — No input provided

Ask the user: "Describe what you want to spike — what hypothesis or approach do you want to test quickly?"

---
name: spike

## Important

- Always invoke the `orchestrator` agent — do NOT invoke agents directly
- Spikes are fast and exploratory. A discarded prototype with no retained
  repository diff has no PR candidate and needs no delivery step.
- The orchestrator will invoke the implementer directly and present results
- After the spike, the user decides: formalize as feature, discard, or investigate further
- If the spike retains repository edits, run checks relevant to those edits and
  use `create-pr` to prepare the candidate. Publish under native permissions
  unless the operator explicitly stops or declines; the exploratory label
  does not waive repository delivery.
