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

## Execution and native policy

Run each native marketplace or plugin mutation as its own tool call. Keep reads
bounded. Native Codex sandbox, permissions, approvals, network policy, model,
and reasoning effort remain operator-owned; update does not reconcile them.
The convergence helper is one command for the Team Harness installation domains
only.

For a successful read, ignore only this exact stderr warning when stdout still
parses as the required result:

```text
WARNING: proceeding, even though we could not create PATH aliases: Read-only file system (os error 30)
```

If the convergence receipt identifies one failed domain with
`retryWithEscalation: true`, retry the helper once with narrow escalation,
`login:false`, and `--escalation-domain FAILED_DOMAIN`. Preserve every other
argument. In this mode the helper permits a write only in that domain; it
leaves the other domains read-only and fails if another domain would need a write.
A rejected or failed retry is `partial-convergence`; do not repeat the failed
action, ask the operator to run it manually, or grant persistent write access
to the plugin cache, agent directory, or whole Codex home.

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

The running prose may still come from the old snapshot. From this point use
only the validated helper under `NEW_PLUGIN`. Reuse the canonical `PYTHON_BIN`
and `CODEX_BIN` already pinned in Stage A:

```text
PYTHON_BIN NEW_PLUGIN/skills/update/scripts/converge.py --old-plugin OLD_PLUGIN --old-version OLD_VERSION --new-plugin NEW_PLUGIN --new-version NEW_VERSION --codex-bin CODEX_BIN
```

This is the only post-install convergence call before operator input. It validates and
bridges the running snapshot path, attests the bounded installer helpers before
execution, ensures native Team Harness settings, synchronizes stale native
agent files without changing global defaults, and inspects MCP registrations
without replacing them. It verifies changed
postconditions, and emits exactly one closed JSON receipt. It must use fixed
native argv, bounded output and timeouts, preserve opaque/operator-owned
configuration, reject unmanaged conflicts and unsafe files, and never read
another runtime's config or touch pipeline helper bundles.

If Windows cannot create the optional snapshot alias because the symlink
privilege is unavailable, the helper preserves the old path, verifies the
remaining domains, and reports `bridgeStatus: skipped-symlink-privilege` for
that domain. The optional alias cannot determine live activation; reload
assesses activation separately. This case does not change native permissions.
During a retry scoped to another domain, the optional alias can also remain
unchanged as `skipped-read-only`.

Accept a receipt only when it has `schemaVersion: 1`, the exact domains
`bridge`, `config`, `agents`, and `mcp`, one of `current | converged |
partial-convergence`, and the required identity, changed-domain, failure, and
recovery fields. Invalid, missing, extra, or multiple JSON results are a failed
convergence pass. The receipt is the final installation-domain result; native
activation remains the reload flow's responsibility.

## Result and recovery

- `current`: report versions and that no managed domain changed.
- `converged`: report versions and only the receipt's changed domains, then
  pass the installed target to reload.
- `partial-convergence`: report the failed domain, old/new identities, completed
  changed domains, and `$team-harness:update` as the exact retry. Never roll
  back a bridge, config, agent, or other completed idempotent write.

After a successful `current` or `converged` receipt, perform one separate
general-agent guide maintenance pass using the native file-edit capability.
This pass is outside the four receipt domains and must not be presented as a
helper write or added to the convergence schema. Read
`../setup/references/general-agent-guide.md` from the validated snapshot and
follow its managed-block procedure, using `OLD_PLUGIN` to compare an existing
block before replacing it. The pass preserves native coding instructions,
permissions, approvals, agent identity, and user style choices; it does not
activate a pipeline or imply a restart.

Then load `../reload/SKILL.md` from the validated new
snapshot and execute it for the current conversation. This activation pass
does not repeat installation-domain inspections or alter the receipt. Report
the installation result and activation outcome separately. The receipt does
not carry restart signals. A successful skill reread cannot prove active
agents or unavailable components; reload reports evidence and proposes a
reconnect only for a demonstrated remaining need. Do not run reload after a
partial result or invalid receipt.

An equal-version run still executes Stage B: update remains the supported
repair command as well as the version updater.
