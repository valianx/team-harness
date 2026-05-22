Pass to the `th-orchestrator` agent:
```
Direct Mode Task:
- Mode: init
```

---

## Important

- Always invoke the `th-orchestrator` agent — do NOT invoke agents directly
- The th-orchestrator will route to the `init` agent
- The init agent detects the project type, tech stack, and generates/updates CLAUDE.md
- Also creates CHANGELOG.md if missing and ensures session-docs is in .gitignore
