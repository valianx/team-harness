## Why

Team Harness can install and verify a new snapshot while a running backend still
executes old hook commands. Repeated installation and blanket new-chat advice
do not distinguish activation from disk state or preserve session continuity.

## What Changes

- Add a shared reload skill with Codex and OpenCode procedures and an OpenCode command.
- Rebind requested skill resources to the verified installed version.
- Use only exposed controls of the active backend for supported refreshes.
- Verify each component independently and preserve the existing conversation on reconnect.
- Run activation after successful update, keeping its result separate from installation verification.

## Capabilities

### New Capabilities

- `runtime-reload`: capability-aware activation of an installed Team Harness version.

## Non-Goals

- Implementing a new Herdr/desktop RPC bridge or inventing unsupported runtime APIs.
- Downloading packages, changing permissions or hook trust, or killing running processes.
- Guaranteeing complete hot reload when the host cannot expose or verify it.
