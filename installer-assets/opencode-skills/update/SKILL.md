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
the result is `updated` or `already current`, load the native `reload` skill
and execute its activation procedure for this conversation. Keep the updater's
installation result separate from reload's active/pending components. Preserve
the same session on reconnect; do not equate updated files with a live reload.
Do not activate after a failed updater or `installed ahead` result.
