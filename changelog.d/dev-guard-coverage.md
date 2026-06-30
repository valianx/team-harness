### Fixed
- `hooks/dev-guard.sh`: gate `gh pr create` (Step 2b) as an outward action requiring explicit operator approval; anchored to the mutating verb only so read-only `gh pr view`/`gh pr list` remain ungated.
- `hooks/dev-guard.sh`: gate `gh issue create|edit|comment` (Step 2e-ter) as outward writes; read-only `gh issue list`/`gh issue view` remain ungated.
- Reconciled four false co-match claims that incorrectly stated `dev-guard.sh` already covered `gh pr create`: `hooks/prepublish-guard.sh`, `hooks/README.md` (×2), `hooks/ts/entry/prepublish-guard.opencode.ts`.
- `hooks/dev-guard.sh` + TS port: added `delete_task` to the ClickUp outward-write gate; read-only ClickUp verbs (e.g. `get_task_details`) remain ungated.
