### Security

- `cmd/install`: `opencode.json` is now rewritten atomically at mode `0o600` during uninstall, matching the existing install-path contract. The previous uninstall rewrite used a bare `os.WriteFile(..., 0o644)`, which does not change the mode of a pre-existing file — a file created or migrated before this fix could remain world/group-readable even though it carries literal MCP bearer and API-key tokens on the Claude Code to opencode migration path (CWE-276, issue #439).
