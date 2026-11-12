---
name: update
description: Update Team Harness for opencode through the dedicated checksum-verified updater and report the three-state result.
---

# Update Team Harness in opencode

For a TH update, execute [selected TH dependency maintenance](../spec/references/dependency-maintenance.md)
from the validated resulting snapshot as an independent pass before the final report.
Use the consuming operator’s active project/host selections, not this repository’s
development dependencies. Keep dependency outcomes separate from native TH update
and activation evidence; continue independent authorized work after partial failure.

For the explicit `cloudflare-security` target, follow
[Cloudflare security](../cloudflare-security/SKILL.md) with the `update` operation
and requested scope. Complete this provider route before TH maintenance and
continue the TH flow only when TH update was also requested.

Route the explicit targets `openspec`, `superpowers`, `tea`, `rea`, `semgrep`,
`dependency-cruiser`, `knip`, `sentry`, `quality` and `quality-tools`
(also `bmad tea`)
here before the TH update procedure. For a provider-only request, complete that
route and return. Continue the TH-specific procedure below only when TH update
was also requested; provider names are not flags for the TH updater.

Match provider names as complete words in the requested target, never as
substrings: `team` and `team-harness` do not select `tea`. TH-only options apply
only to a separately requested TH operation.

For an explicit `rea` target, follow [REA application research](../spec/references/upstream-tools.md#rea-application-research)
for the active client and return from this provider-only route. REA is separate
from quality selection; maintain it during TH update only when already selected.

Before routing a bare `find-bugs` target, resolve the owner from the live task:
TH project/module diagnosis or Sentry's upstream captured-change method. If it
remains ambiguous, ask which owner is intended before installing or updating.
An explicit `sentry find-bugs` or `getsentry/skills` selects the provider route;
TH's OpenCode entry is `th-find-bugs`.

Read [the shared upstream-tool integration reference](../spec/references/upstream-tools.md)
when the operator explicitly requests an OpenSpec, Superpowers, TEA, or quality-provider
update. Unselected providers remain untouched; selected dependencies follow the
maintenance pass above. For an explicit request, use the provider's official package, plugin, Skills CLI or
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
  active OpenCode skill. TH's separate project/module workflow is `th-find-bugs`;
  preserve both installations and resolve the owner before updating.

Execute the same bounded updater used by `/th-update`:

```bash
curl -fsSL https://valianx.github.io/team-harness/update-opencode.sh | bash -s -- --non-interactive
```

Do not substitute the full installer or bypass SHA256 verification. Report
exactly one result: `already current`, `updated`, or `installed ahead`. When
the result is `updated` or `already current`, load the native `reload` skill
and execute its activation procedure for this conversation. Keep the updater's
installation result separate from reload's diagnostic evidence and use its result
contract for an update invocation. The ordinary summary reports the version and
actual outcome without restart/reconnect commentary, including negative assurances
or hypothetical advice. State briefly when current-session reload is unsupported
or activation remains unverified; retain component details in diagnostics.
Always append one reminder after `updated` or `already current`: `Remember to run
/th-reload in other open sessions before continuing with TH.` This applies on
every OS without requiring discovery of other sessions; do not reload them.
Report actual failures or demonstrated activation problems with their
impact and supported next step; do not equate updated files with a live reload.
Do not activate after a failed updater or `installed ahead` result.
