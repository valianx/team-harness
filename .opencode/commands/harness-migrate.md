---
description: Bidirectional transform for team-harness assets between Claude Code and opencode formats. Runs node tools/harness-migrate/migrate.mjs with the supplied direction argument.
agent: coding
---

Run the harness-migrate transform with the direction specified in $ARGUMENTS:

```
node tools/harness-migrate/migrate.mjs $ARGUMENTS
```

After the script completes, report the full projected-file manifest from its output, noting:
- Each file listed as `projected`, `skipped (idempotent)`, or `rejected (containment)`
- Any files marked `lossy` (opencode-origin files with ask/deny arrays that cannot be represented in CC format)
- The summary line: N projected, N skipped, N rejected

If the direction argument is missing or invalid, the script will print usage and exit with a non-zero code. Valid directions are `to-opencode` and `to-claude-code`.

This command transforms agents and commands only. Skills, rules, and hooks are out of scope.
