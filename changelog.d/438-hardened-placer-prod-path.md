### Security

- `cmd/install`: the production claude-code installer now routes agent/skill/hook writes through the symlink/reparse-point hardened write path (`hardenedWriteFile`, introduced in PR #437). Previously the production no-subcommand install used a separate, unhardened legacy writer, so the hardening only fired on the `apply`/`plan`/`uninstall` subcommands, not the path most operators actually use. Closes the production-reachability gap (SEC-DR-3 finding 5 / B-L2, issue #438).
