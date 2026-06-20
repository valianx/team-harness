### Added
- `bin/install-opencode.sh` — curl-pipeable bootstrap script for opencode installs (Unix/macOS). Downloads the latest released Go binary, verifies it against the published `SHA256SUMS` (fail-closed, TOCTOU-safe), and runs `apply --runtime opencode --scope global`. Served at `https://valianx.github.io/team-harness/install-opencode.sh` via GitHub Pages.
- `--memory-url` flag on `apply --runtime opencode` — explicit Memory MCP URL override, consumed by `parseDispatchFlags` (not dropped into `remaining`). Resolution order: `--memory-url` flag → `MEMORY_MCP_URL` env → hard non-zero exit with remediation message.
- Non-blocking `MEMORY_MCP_BEARER`-unset warning on successful opencode installs — emitted to stderr when the bearer is absent; the install still exits 0.

### Changed
- `apply --runtime opencode` now requires an explicit, scheme-validated Memory URL. The previous best-effort silent-skip (when both `MEMORY_MCP_URL` and `CONTEXT7_API_KEY` were unset) is replaced with an instructive hard error. This aligns the opencode path with the claude-code path (`prompts.go`) which has always required an explicit URL.
- `mcp.context7` is now always written to `opencode.json` on opencode apply (as an `{env:CONTEXT7_API_KEY}` reference), regardless of whether `CONTEXT7_API_KEY` is set at install time. Previously it was skipped when both MCP env vars were absent.
- `cmd/install/main.go` version constant bumped from `2.94.0` to `2.112.0` (the Go installer binary version, not the plugin version). Aligns the binary's `-version` output and the GitHub Pages landing page with the current plugin baseline.
