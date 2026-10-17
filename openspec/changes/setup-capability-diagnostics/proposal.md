## Why

Operators cannot easily distinguish the minimum requirements for Team Harness from optional integrations, or tell whether another coding CLI already has a usable installation. Setup guidance and interpreter discovery differ across runtimes, making recovery harder than necessary.

## What Changes

- Add a shared read-only setup inventory for Claude Code, Codex, OpenCode and Pi, with explicit runtime/root selection and an optional inventory of other installed CLIs.
- Separate CLI availability, package identity, configuration health and observed activation; unknown evidence remains unknown.
- Report prerequisites by capability, offer a minimal setup first, and retain existing configuration when optional capabilities are unavailable.
- Use verified Python interpreter candidates for optional diagnostics rather than assuming `python3`; missing diagnostics support leaves a partial report with a concrete recovery.

## Capabilities

### New Capabilities

- `setup-capability-diagnostics`: Read-only installation discovery, minimum requirements, optional capability selection and safe recovery across supported hosts.

### Modified Capabilities

None. Existing setup write outcomes and package owners remain unchanged.

## Impact

Shared setup scripts and their generated projections; four runtime setup contracts; the maintained installation guide and focused hermetic tests. This delivery introduces no mandatory dependency for native package installation and never installs or configures another detected CLI automatically.

## Non-Goals

Provider/model profile selection, a new installer, cross-runtime credential sharing, native permission changes, private Space transport, automatic migration of existing workspaces, and repairs to unchanged development flows.
