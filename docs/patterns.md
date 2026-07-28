# Patterns & Conventions — Full History

> Overflow file for CLAUDE.md §9 Patterns & Conventions. Most recent entries stay inline in CLAUDE.md; older entries accumulate here.

- **Three-state update**: update-available / already-current / installed-ahead; installed-ahead reports only; already-current zero-writes. → `cmd/install/update.go`
- **Restart-to-activate honesty**: never claim live; print after any apply, not on zero-write paths. → `cmd/install/update.go`
- **Data-position redaction, not payload widening**: when a gate false-positives on a command quoted/heredoc'd as inert data, mask the data span (fixed-length, space-substitution) before position-command checks run — never relax the checks themselves. `allow`-capable consumers must derive branch selection AND the classified command from the RAW parse only; the redacted parse feeds exclusively non-`allow` branches. → `hooks/ts/bodies/data-position.ts`, `hooks/ts/bodies/dev-guard.ts` (`evaluate()`)
- **TTY prompt → stderr**: prompt to `os.Stderr`, read from `/dev/tty`/stdin; never write an O_RDONLY handle. → `cmd/install/update.go`
