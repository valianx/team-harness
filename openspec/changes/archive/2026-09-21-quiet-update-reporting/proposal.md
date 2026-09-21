## Why

A successful TH update still mentions hypothetical restarts because its result
inherits reload diagnostics and stock reconnection advice. The operator needs
the actual update outcome and any concrete action, without recurring reassurance
or speculative caveats.

## What Changes

- Keep ordinary update summaries focused on the installed version and actual outcome.
- Omit restart/reconnect commentary, including negative assurances, when no concrete action is required.
- Keep activation observations distinct in retained evidence; explicit reload diagnostics remain available.
- Preserve reporting of failed updates and demonstrated activation problems with their specific impact and remedy.
- Align Claude Code, Codex and OpenCode entry points, CLI update output and generated reload copies.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `runtime-reload`: separate internal activation evidence from the concise update result.

## Non-Goals

No installation mechanics, convergence receipt, permission, agent, MCP or runtime lifecycle changes.
No broad fixes from the diagnostic audit, provider updates or automatic session recycling.

## Impact

Update/reload skill prose, CLI update output and the OpenCode update command, generated projections,
the shared release version, and the existing runtime-reload specification.
Working diagnostic reports stay in the bound Obsidian workspace.
