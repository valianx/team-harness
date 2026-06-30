### Security
- Go installer: `~/.claude.json` is now written at `0o600` (owner-read/write only) via atomic temp-file + `os.Rename`, so bearer tokens and API keys stored in the file are never world-readable and the live file is never observed in a truncated state.
- Go installer: the `~/.claude.json` timestamped backup is also created at `0o600` (was `0o644`).
- Go installer: `registerMCPServers` aborts with an explicit error when the existing `~/.claude.json` is malformed JSON, preventing silent key-loss from an empty-map fallback.
- Go installer: `claudeCodePlacer.Place` now routes writes through `hardenedWriteFile` (per-component `Lstat` symlink rejection + `O_NOFOLLOW` leaf on POSIX), matching the protection already applied to the OpenCode placer.
