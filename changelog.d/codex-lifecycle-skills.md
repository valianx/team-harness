## Added

- Added native `setup` and `update` lifecycle skills to the Codex plugin. Setup now configures Codex-owned Team Harness settings, workspace/language preferences, optional MCP servers, specialist agents, and hook trust; update refreshes and reinstalls the plugin while preserving configuration and aligning existing agents.

## Changed

- Codex pipelines and bundled policy hooks now prefer `${CODEX_HOME:-$HOME/.codex}/.team-harness.json`, with the prior Claude configuration retained only as a read-only compatibility fallback.
- Fixed #572: Codex lightweight/direct modes now read and validate persistent configuration without creating pipeline artifacts, and the separate repository bootstrap role is named `init-project` while `/th:bootstrap` remains compatible.
- Codex setup can import all missing Team Harness configuration values opaquely from Claude Code or opencode without displaying values. Only helper-managed metadata is excluded; imported authorization-like data remains inert under Codex's native permission policy.
- The generated Codex contributor configuration now enables dependency network access and routes Go, uv, and npm caches to dedicated `/tmp` paths while retaining `workspace-write`, `on-request` approvals, and Codex's protected `.git` boundary.
