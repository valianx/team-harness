Analyze the input: $ARGUMENTS

---

## Mode 1 --- Path or service name provided

1. Resolve the path (absolute or relative to cwd)
2. Validate it contains source code (check for `src/`, `lib/`, `app/`, or equivalent)
3. Parse optional flags from arguments:
   - `--skip-security` --- omit security scan step from per-module tasks
   - `--modules auth,payments,...` --- test only specified modules (skip decomposition)
   - `--coverage-only` --- only run Phase 1 (coverage config) + consolidated coverage run, skip test generation
4. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: test-pipeline
   - Service path: {resolved absolute path}
   - Options: {parsed flags or "default"}
   ```

## Mode 2 --- No input provided

1. Use the current working directory as the service path
2. Pass to the `orchestrator` agent:
   ```
   Direct Mode Task:
   - Mode: test-pipeline
   - Service path: {cwd}
   - Options: default
   ```

---

## Important

- Always invoke the `orchestrator` agent --- do NOT invoke agents directly
- The orchestrator will analyze the service, decompose into modules, and dispatch tester agents in parallel
- Output: `workspaces/test-pipeline/05-consolidation.md` (final quality report)
- Coverage gate: **80% branch coverage service-wide is mandatory** --- pipeline iterates until met or max 3 loops
