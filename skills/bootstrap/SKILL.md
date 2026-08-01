---
name: bootstrap
description: Initialize runtime-native project instructions and conventions for a repository.
---

## Parse flags

Before routing, check for optional flags in `$ARGUMENTS`:
- `--scaffold-rereview-workflow` → pass `scaffold_rereview_workflow: true` to the init-project agent payload.
- `--scaffold-review-policy` → pass `scaffold_review_policy: true` to the init-project agent payload (§9.5 feature — adds `.team-harness/review-policy.md`).

Remove parsed flags from the description before routing.

---
name: bootstrap

Pass to the `orchestrator` agent:
```
Direct Mode Task:
- Mode: init-project
- scaffold_rereview_workflow: {true if --scaffold-rereview-workflow was passed, omit otherwise}
- scaffold_review_policy: {true if --scaffold-review-policy was passed, omit otherwise}
```

---
name: bootstrap

## Important

- Always invoke the `orchestrator` agent — do NOT invoke agents directly
- The orchestrator will route to the `init-project` agent
- The init-project agent detects the project type, tech stack, and generates/updates CLAUDE.md
- Also creates CHANGELOG.md if missing and ensures workspaces is in .gitignore
- Optional flags: `--scaffold-rereview-workflow` (GitHub Actions re-review reminder), `--scaffold-review-policy` (team review policy file)
