---
name: update
description: Update Team Harness for opencode through the dedicated checksum-verified updater and report the three-state result.
---

# Update Team Harness in opencode

Route the explicit targets `openspec`, `superpowers`, and `tea` (also `bmad tea`)
here before the TH update procedure. For a provider-only request, complete that
route and return. Continue the TH-specific procedure below only when TH update
was also requested; provider names are not flags for the TH updater.

Read [the shared upstream-tool integration reference](../spec/references/upstream-tools.md)
when the operator explicitly requests an OpenSpec, Superpowers, or TEA update. This flow
updates Team Harness only; it never updates those providers as a side effect. For an
explicit request, use the provider's official package, plugin, or BMAD module lifecycle
under native permissions. Preserve provider-owned files and configuration, and report
installed capability separately from active session; propose a reload/restart only for a
documented host limitation or observed stale activation.

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
