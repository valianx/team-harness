## Parse flags

Before routing, check for optional flags in `$ARGUMENTS`:
- `--scaffold-rereview-workflow` → pass `scaffold_rereview_workflow: true` to the init agent payload.
- `--scaffold-review-policy` → pass `scaffold_review_policy: true` to the init agent payload (§9.5 feature — adds `.team-harness/review-policy.md`).

Remove parsed flags from the description before routing.

---

Pass to the `orchestrator` agent:
```
Direct Mode Task:
- Mode: init
- scaffold_rereview_workflow: {true if --scaffold-rereview-workflow was passed, omit otherwise}
- scaffold_review_policy: {true if --scaffold-review-policy was passed, omit otherwise}
```

---

## Important

- Always invoke the `orchestrator` agent — do NOT invoke agents directly
- The orchestrator will route to the `init` agent
- The init agent detects the project type, tech stack, and generates/updates CLAUDE.md
- Also creates CHANGELOG.md if missing and ensures workspaces is in .gitignore
- Optional flags: `--scaffold-rereview-workflow` (GitHub Actions re-review reminder), `--scaffold-review-policy` (team review policy file)
