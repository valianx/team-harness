---
name: th-update
description: Update Team Harness (opencode) — re-run the installer to fetch the latest released assets and idempotently apply only changed files.
---

Update the Team Harness installation for opencode by re-running the installer.
opencode has no plugin marketplace; the update mechanism is a re-run of the
install link, which downloads the latest released binary (the latest embedded
agents, skills, commands, and hook plugin) and applies a hash-based diff —
only files whose content changed are rewritten.

Run this exact command in a terminal:

```
curl -fsSL https://valianx.github.io/team-harness/install-opencode.sh | bash
```

If `MEMORY_MCP_URL` is already exported in the shell, the run is fully
non-interactive; otherwise the installer prompts for it.

After the run completes, restart the opencode session so the refreshed agents,
skills, and commands are loaded.

The Claude Code plugin-marketplace update path does not apply to opencode; this
re-run of the install link is the only opencode update mechanism.
