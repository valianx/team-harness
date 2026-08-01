### Fixed

- Made Codex hook launchers support both plugin-root environment aliases and recover across versioned-cache replacement, preventing repeated `PreToolUse` exit-code 127 failures.
- Tightened `$team-harness:update` so all post-install reconciliation uses the new snapshot and it safely bridges the running thread's old cache path to that snapshot; a restart is requested only for changes Codex must rediscover at thread creation or when the bridge cannot be installed.
