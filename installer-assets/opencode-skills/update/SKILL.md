---
name: update
description: Update Team Harness for opencode through the dedicated checksum-verified updater and report the three-state result.
---

# Update Team Harness in opencode

Execute the same bounded updater used by `/th-update`:

```bash
curl -fsSL https://valianx.github.io/team-harness/update-opencode.sh | bash -s -- --non-interactive
```

Do not substitute the full installer or bypass SHA256 verification. Report
exactly one result: `already current`, `updated`, or `installed ahead`. When
files changed, state that a new opencode session is required to rediscover
updated agents, skills, and commands.
