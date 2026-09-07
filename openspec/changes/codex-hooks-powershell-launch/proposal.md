## Why

Codex launches Windows hook commands through PowerShell, but Team Harness ships
cmd batch syntax. Both hooks therefore exit with parser errors before reaching
their guards. Existing tests hide the defect by forcing cmd.exe.
Separately, agent setup omits the packaged PR review verifier from its install
list, leaving required reviews blocked after a nominally successful setup.

## What Changes

- Ship PowerShell-native Windows commands while preserving the Node launcher and decisions.
- Execute the literal commands through PowerShell 7 and Windows PowerShell in native CI.
- Document the shell contract and release the correction as 3.28.1.
- Install and repair every bundled agent, including the PR review verifier.

## Capabilities

### Modified Capabilities

- `codex-runtime-parity`: host-shell compatibility and complete bundled agent installation.

## Non-Goals

- Changing guard policies, POSIX commands, hook trust, or operator permissions.
- Changing Herdr, global shell configuration, or the installed plugin cache directly.
