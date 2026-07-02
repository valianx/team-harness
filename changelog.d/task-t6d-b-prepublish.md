### Fixed
- `prepublish-guard`'s diff parser now evaluates both sides of a git rename (source and destination) against the shipped-asset surface (`agents/|skills/|hooks/`), so a rename FROM a shipped path INTO a non-shipped location no longer bypasses the major bump-floor for a removed public surface.
- Ported the #411 payload-`cwd` worktree-scoping fix to the opencode entry (`prepublish-guard.opencode.ts`): the guard now `cd`s into the tool-call's worktree before any git inspection, matching the Claude Code entry's fail-open behavior on control characters or a non-existent directory.
