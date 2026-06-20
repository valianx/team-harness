### Added
- Skills are now copied into `.opencode/skills/` during the opencode install, closing the drift from PR #375 where `manifest_registry.go` only emitted agents and the hook plugin (a Claude-Code-free machine had zero team-harness skills).
- Six opencode-incompatible skills (`update`, `setup`, `background`, `cross-repo`, `tmux`, `recover`) are excluded from the opencode skill copy — they invoke the `claude` binary or depend on the CC plugin marketplace and are non-functional under opencode; all other skills are retained.
- `/th-update` opencode command (`skills/opencode-commands/th-update.md`) — a typeable command that instructs the agent to re-run `curl -fsSL https://valianx.github.io/team-harness/install-opencode.sh | bash`, the idempotent opencode update mechanism.
- README "Updating (opencode)" section documenting the re-run command and the `/th-update` shortcut.
- End-of-apply update hint printed to stdout after a successful opencode install.

### Fixed
- `loadDefaultManifests("opencode")` now calls `validateManifests` on the built component set before returning — the SEC-05/schema gate previously ran only in tests; a malformed component now fails the install loudly at install time rather than mis-emitting silently.
