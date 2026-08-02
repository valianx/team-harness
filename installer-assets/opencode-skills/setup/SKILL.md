---
name: setup
description: Configure or reconcile the native Team Harness opencode installation, preferences, agents, skills, and commands.
---

# Set up Team Harness in opencode

Inspect the active opencode config root and `.team-harness.json` without
reading Claude Code or Codex configuration. Reconcile the installed Team
Harness ledger, agents, skills, commands, and operator preferences through the
native installer when it is available. Preserve unknown configuration keys,
never print secret values, and ask before adding MCP credentials or performing
machine-wide writes.

Report the config root, installed version, changed components, preserved
settings, and whether a new opencode session is required for discovery.
