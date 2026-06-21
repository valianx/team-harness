### Fixed
- `hooks/prepublish-guard.sh` now scopes its git version-bump checks to the
  pushed worktree instead of the session/project root, eliminating false-positive
  hard-denies that blocked legitimate pushes from isolated `git worktree`
  branches (#411). The guard reads the `cwd` field from the PreToolUse payload
  (the runtime-trusted directory the Bash tool executes in) and `cd`s into it
  once, before any git inspection. Invalid `cwd` values (control chars, missing
  directory) are rejected with a stderr warning and the guard falls back to the
  session root (fail-open — never a false block). Backward-compatible: payloads
  without a `cwd` field continue to evaluate the process CWD as before.
