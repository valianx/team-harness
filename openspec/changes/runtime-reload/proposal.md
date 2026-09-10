## Why

Team Harness can install and verify a new snapshot while a running backend still
executes old hook commands. Repeated installation and blanket new-chat advice
do not distinguish activation from disk state or preserve session continuity.

## What Changes

- Add a shared reload skill with Codex and OpenCode procedures and an OpenCode command.
- Rebind requested skill resources to the verified installed version.
- Use only exposed controls of the active backend for supported refreshes.
- Cover all applicable Team Harness components and finish independent refreshes when another component lacks host controls.
- Verify each component independently and preserve the existing conversation on reconnect.
- Distinguish a demonstrated restart requirement from unavailable activation evidence or a missing optional snapshot alias.
- Run activation after successful update, keeping its result separate from installation verification.
- Reconcile local-review readiness with verified profile activation rather than a new conversation requirement.
- Repair the Windows OpenSpec launcher used to bind review criteria.

## Capabilities

### New Capabilities

- `runtime-reload`: capability-aware activation of an installed Team Harness version.

### Modified Capabilities

- `codex-runtime-parity`: portable review prerequisites and reviewer activation.

## Non-Goals

- Implementing a new Herdr/desktop RPC bridge or inventing unsupported runtime APIs.
- Downloading packages, changing permissions or hook trust, or killing running processes.
- Guaranteeing complete hot reload when the host cannot expose or verify it.
