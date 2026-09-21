---
name: update
description: Update Team Harness for opencode through the dedicated checksum-verified updater and report the three-state result.
---

# Update Team Harness in opencode

Route the explicit targets `openspec`, `superpowers`, `tea`, `semgrep`,
`dependency-cruiser`, `knip`, `sentry`, `find-bugs`, `quality` and `quality-tools`
(also `bmad tea`)
here before the TH update procedure. For a provider-only request, complete that
route and return. Continue the TH-specific procedure below only when TH update
was also requested; provider names are not flags for the TH updater.

Match provider names as complete words in the requested target, never as
substrings: `team` and `team-harness` do not select `tea`. TH-only options apply
only to a separately requested TH operation.

Read [the shared upstream-tool integration reference](../spec/references/upstream-tools.md)
when the operator explicitly requests an OpenSpec, Superpowers, TEA, or quality-provider
update. This flow updates Team Harness only; it never updates those providers as a side
effect. For an explicit request, use the provider's official package, plugin, Skills CLI or
BMAD module lifecycle under native permissions. Preserve provider-owned files and
configuration, and report installed, discoverable and usable capability separately from
active session; propose a reload/restart only for a documented host limitation or observed
stale activation.

For `quality`/`quality-tools` without a concrete provider, list Semgrep CE,
dependency-cruiser, Knip and Sentry `find-bugs`, then ask which objective/stack to update.
Do not update every quality provider. Update the selected owner-managed installation only:

- Semgrep CE through the owning Brew, uv, pipx or Python/pip route.
- dependency-cruiser or Knip through npm in the existing project/tool cache, preserving
  project manifests unless their change is separately authorized.
- Sentry `find-bugs` with
  `npx --yes skills@1.7.0 update find-bugs --global --yes`, verifying the source/ref and
  active OpenCode skill. Resolve the duplicate `find-bugs` basename by owner/source and
  objective before activation.

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
