### Added

- `/th:mcp-optimize` — standalone skill that audits MCP tool-loading context cost: inventories configured servers and optimization levers across local settings files, enumerates the loaded server set via `claude mcp list`, classifies servers as deferred vs loaded-upfront (citing the HTTP/remote deferral gap, anthropics/claude-code#40314), and recommends copy-pasteable config edits while protecting operator-pinned servers (default `memory`). REPORT-only by default; an optional gated `--apply` writes only local settings files with backup, per-change confirmation, and JSON validation.
