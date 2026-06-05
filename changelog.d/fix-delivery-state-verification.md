### Fixed

- Delivery agent Step 9b now gates DoD on the recorded Phase 3 verify outcome instead of unconditionally re-running the full test suite; re-runs only when no green record exists, the record is stale, or delivery itself modified test-relevant files. Fixes #266.
- Delivery agent Step 11.2 now omits the `Closes/Fixes #N` line entirely when Step 2 finds no linked GitHub issue; never synthesizes a number. Fixes #266.
- Delivery agent Step 9.0 version-site table reconciled to the correct 3-site mandatory set for plugin-asset changes (`plugin.json` + `marketplace.json` + `CLAUDE.md §3`); `cmd/install/main.go` annotated as a legacy-installer anchor updated only on installer releases. Fixes #266.
