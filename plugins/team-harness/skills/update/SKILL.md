---
name: update
description: "Update Team Harness for Codex and converge the complete operational installation through one bounded, receipt-driven pass."
---

# Update Team Harness for Codex

Update the marketplace snapshot, select the installed version, and delegate all
post-install inspection, repair, and verification to one versioned convergence
helper. Do not activate a pipeline, create workspace state, or spawn agents.
Accept `--force` only to reinstall an equal-version development snapshot; it
never authorizes a downgrade.

## Upstream provider updates

Route the explicit targets `openspec`, `superpowers`, `tea`, `semgrep`,
`dependency-cruiser`, `knip`, `sentry`, `quality` and `quality-tools`
(also `bmad tea`)
here before the TH update procedure. For a provider-only request, complete that
route and return. Continue the TH-specific procedure below only when TH update
was also requested; provider names are not flags for the TH updater.

Match provider names as complete words in the requested target, never as
substrings: `team` and `team-harness` do not select `tea`. TH-only options apply
only to a separately requested TH operation.

Before routing a bare `find-bugs` target, resolve the owner from the live task:
TH project/module diagnosis or Sentry's upstream captured-change method. If it
remains ambiguous, ask which owner is intended before installing or updating.
An explicit `sentry find-bugs` or `getsentry/skills` selects the provider route;
TH's OpenCode entry is `th-find-bugs`.

Read [the shared upstream-tool integration reference](../spec/references/upstream-tools.md)
when the operator explicitly requests an OpenSpec, Superpowers, TEA, or quality-provider
update. This flow updates Team Harness only and never updates those providers by side effect.
For an explicit request, use the provider's official package, plugin, Skills CLI, or BMAD module
lifecycle under native permissions; preserve its files and configuration. Report installed,
discoverable and usable capability separately from active session and propose reload/restart only
for a documented host limitation or observed stale activation.

For `quality`/`quality-tools` without a concrete provider, list the selected objective/stack and
ask which one to update; do not update every quality provider. Update only the chosen owner:

- Semgrep CE through the active Brew, uv, pipx or Python/pip installation.
- dependency-cruiser or Knip through npm in the existing project/tool cache, preserving project
  manifests unless their change is separately authorized.
- Sentry `find-bugs` through `npx --yes skills@1.7.0 update find-bugs --global --yes`; verify
  `getsentry/skills` source/ref and native Codex discovery. Resolve the same-name TH skill by
  owner/source plus objective and never overwrite it.

After updating, verify the command/skill and workspace output on the active host. A provider
update does not itself require a session restart; report pending activation and the smallest
documented reload/reconnect only if the host cannot activate the changed entry.

## Execution and sandbox contract

Run each native marketplace or plugin mutation as its own tool call. Keep reads
sandboxed. For a mutation outside the current writable roots, request native
escalation before its first execution. The convergence helper is one command
even though it owns several bounded domains internally.

For a successful read, ignore only this exact stderr warning when stdout still
parses as the required result:

```text
WARNING: proceeding, even though we could not create PATH aliases: Read-only file system (os error 30)
```

If the convergence receipt identifies one failed domain with
`retryWithEscalation: true`, retry the helper once with narrow escalation,
`login:false`, and `--escalation-domain FAILED_DOMAIN`. Preserve every other
argument. In this mode the helper permits a write only in that domain; it
classifies the others read-only and fails if another domain would need a write.
A rejected or failed retry is `partial-convergence`; do not repeat the failed
action, ask the operator to run it manually, or grant persistent write access
to the plugin cache, agent directory, or whole Codex home. Native execution
policy remains under host control and is never an update domain or authorized
by convergence escalation.

## Stage A — select the snapshot

1. Record `OLD_PLUGIN` as the lexical absolute plugin root containing this
   loaded skill; do not resolve away a versioned symlink. Read only its regular
   `.codex-plugin/plugin.json`, require `name: team-harness`, and record its
   semantic `OLD_VERSION`.

2. Resolve one Python 3 interpreter as `PYTHON_BIN`: on Windows use the canonical
   absolute `sys.executable` from `py -3`, or the active Python 3 if that launcher
   is absent; elsewhere use canonical Python 3. Require a regular executable and
   reuse it throughout. Discover the active native Codex application once
   (`Get-Command codex -CommandType Application` on PowerShell); require one
   absolute candidate, then run:

   ```text
   PYTHON_BIN -B OLD_PLUGIN/skills/update/scripts/resolve_codex.py --candidate CANDIDATE
   ```

   Require success and one JSON `codexBin`; pin that value as `CODEX_BIN` for
   every native command in both stages. The resolver follows parent-directory
   junctions as well as file links. PowerShell's `Source`, `FullName`, or an empty
   leaf `Target` does not prove a canonical path. Do not pass the candidate
   directly to convergence or repeat PATH discovery later. Resolution failure
   stops before any marketplace or installation mutation.

3. Refresh only the Team Harness marketplace, then resolve its refreshed root:

   ```text
   CODEX_BIN plugin marketplace upgrade team-harness --json
   CODEX_BIN plugin marketplace list --json
   ```

   Require one marketplace named `team-harness`. Read its bounded regular
   `.agents/plugins/marketplace.json`, resolve the declared Team Harness source
   beneath that marketplace root without traversal, and validate the source's
   regular `.codex-plugin/plugin.json`. Its manifest supplies
   `AVAILABLE_VERSION`; a listing's displayed version never represents the
   already-loaded runtime.

4. Compare versions semantically:

   - newer: install the refreshed snapshot;
   - equal plus `--force`: reinstall the development snapshot;
   - equal without `--force`: skip installation and converge the loaded path;
   - older: stop before installation and report a stale marketplace.

   For installation or forced refresh, run exactly:

   ```text
   CODEX_BIN plugin add team-harness@team-harness --json
   ```

   Capture its exact lexical `installedPath` and `version` as `NEW_PLUGIN` and
   `NEW_VERSION`, then validate the manifest at that path. When installation is
   skipped, resolve `OLD_PLUGIN` to its canonical version directory, use that
   non-symlink path as `NEW_PLUGIN`, and set `NEW_VERSION=OLD_VERSION`. Never run
   `codex plugin remove`, remove the marketplace, delete a prior snapshot, or
   repair an installation with ad hoc copies. Native plugin add preserves the
   prior installation if replacement fails.

## Stage B — converge once

The running prose may still come from the old snapshot. Read
`NEW_PLUGIN/skills/update/SKILL.md` from the validated installation before
continuing Stage B. Use that version's helper arguments, receipt schema and
recovery instructions; do not interpret a new receipt with the old skill's
remembered contract. Retain the paths, versions and authorization from Stage A
without repeating marketplace refresh or installation.

If a receipt has already been returned, read the selected version's skill and
interpret that same receipt before deciding it is malformed. Refreshing these
instructions requires neither another convergence call nor a restart. This
handoff cannot replace instructions already held in memory by an older agent;
that agent must read the installed skill to adopt the current contract.

Use only the validated helper under `NEW_PLUGIN`. Reuse the canonical
`PYTHON_BIN` and `CODEX_BIN` already pinned in Stage A:

```text
PYTHON_BIN NEW_PLUGIN/skills/update/scripts/converge.py --old-plugin OLD_PLUGIN --old-version OLD_VERSION --new-plugin NEW_PLUGIN --new-version NEW_VERSION --codex-bin CODEX_BIN
```

This is the only post-install convergence call before operator input. It validates and
bridges the running snapshot path, attests every imported helper before
execution, ensures native Team Harness settings, preserves native execution
preferences, enables only missing multi-agent features, synchronizes agents
only when stale, inspects MCP registrations without replacing them, verifies changed
postconditions, and emits exactly one closed JSON receipt. It must use fixed
native argv, bounded output and timeouts, preserve opaque/operator-owned
configuration and custom agent defaults, reject unmanaged conflicts and unsafe
files, and never read another runtime's config or touch pipeline helper bundles.

If Windows cannot create the optional snapshot alias because the symlink
privilege is unavailable, the helper preserves the old path, verifies the
remaining domains, and reports `bridgeStatus: skipped-symlink-privilege` with
`restartRequired: false` for that domain. The optional alias cannot determine
whether the live backend needs restarting; reload assesses activation separately.
This case does not require enabling Developer Mode or granting broader permissions.
During a retry scoped to another domain, the optional alias can also remain
unchanged as `skipped-read-only`, also without asserting a restart requirement.

Retired permission-hook assets are neither installation prerequisites nor a
convergence domain. Their absence requires no repair or restart; preserve native
permission settings and unrelated hooks.

Accept a receipt only when it has `schemaVersion: 3`, the exact five domains
`bridge`, `config`, `features`, `agents`, and `mcp`, one of
the overall statuses `current | converged | partial-convergence`, and all
required identity, changed-domain, restart, nullable-pending, failure, and
recovery fields. `pendingDecision` is always `null`; it remains only as a
compatibility field and never authorizes a policy change. Invalid, missing, extra, or multiple
JSON results are a failed convergence pass. The receipt is the final
verification authority: never repeat its domain inspections in coordinator
tool calls.

## Result and recovery

- `current`: report versions and that no managed domain changed.
- `converged`: report the installed version and the receipt's changed domains.
- `partial-convergence`: report the failed domain, old/new identities, completed
  changed domains, and `$team-harness:update` as the exact retry. Never roll
  back a bridge, config, feature, agent, or other completed idempotent write.

After `current` or `converged`, load `../reload/SKILL.md` from the validated new
snapshot and execute it for the current conversation, using its result contract
for an update invocation. This activation pass does not repeat installation-domain
inspections or alter the receipt. Keep installation and activation evidence
distinct; a skill reread alone does not prove active agents or services.
`restartRequired` remains an internal activation signal for reload to assess.

Keep the operator summary focused on the version, actual outcome and any concrete
action. An ordinary successful update has no restart or reconnect commentary,
including "no restart needed" or "reconnect only if needed". Missing visibility
alone stays in diagnostic evidence. Report actual failures or demonstrated
activation problems with the affected component, impact and supported next step;
do not turn an unknown observation into hypothetical advice.
Do not run reload after a partial result or invalid receipt.

When returning to a setup request, read `NEW_PLUGIN/skills/setup/SKILL.md` before
continuing setup. This instruction refresh is independent of the optional
snapshot alias and of activation for agents, hooks or MCP; it needs no restart.
Continue with the selected installation's setup procedure rather than replaying
retired policy-repair steps from an older cached skill.

An equal-version run still executes Stage B: update remains the supported
repair command as well as the version updater.
