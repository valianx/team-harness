### Fixed

- `hooks/dev-guard.sh`: replace the four default `allow()` exits with `nodecision()` (exit 0, empty stdout) so the hook defers to the operator's normal permission flow instead of actively auto-approving non-covered calls. The worst path (Edit/Write payloads carrying no `command` field) was auto-approving every file edit before reading the dev-mode marker, silently suppressing the operator's edit-confirmation dialog regardless of dev mode state (closes #298).
- Scope `dev-guard.sh` to a dedicated `Bash`-only PreToolUse entry in `.claude-plugin/hooks.json` and all three OS blocks of `hooks/config.json`; `policy-block.sh` keeps the `Bash|Write|Edit|NotebookEdit` matcher for secret-scanning. Defense-in-depth: dev-guard can no longer run on Edit/Write/NotebookEdit payloads at all.
- Correct stale comment in `hooks/dev-guard.sh` header (matcher claim, fail-mode prose, exit-behaviour table).
- Update `docs/dev-mode.md` Outward-Action Gate: add no-decision default row to the gate table, rewrite fail-mode prose, correct matcher wording.
