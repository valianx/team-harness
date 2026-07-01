### Fixed

- `cmd/install/uninstall.go`: corrected a stale doc comment that justified the settings-doc backup's `0o600` mode by contrasting it with an old hardcoded `0o644` in `copyFileRaw` — `copyFileRaw` has taken a caller-supplied mode since PR #437 and is not even called by this function (issue #440).
