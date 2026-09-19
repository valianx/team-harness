# Hooks

Team Harness ships a small Claude Code hook surface for context and
observability. Claude Code's native permission model owns approvals and
execution boundaries; this package does not install permission or process
enforcement hooks.

## Registered hooks

| Event | Hook | Purpose |
|---|---|---|
| `SessionStart` | `session-start` | Loads workflow discovery, language, English-learning and workspace context. |
| `UserPromptSubmit` | `language-user-prompt` | Reasserts the configured language for the current turn. |
| `PreToolUse:Task` | `subagent-start` | Writes a bounded start breadcrumb for `th:*` subagents. |
| `SubagentStop` | `subagent-trace` | Writes a bounded completion breadcrumb for `th:*` subagents. |
| `PreCompact` | `precompact-snapshot` | Saves the current state file before compaction. |
| `Notification:idle_prompt` | `notify-stage` | Emits the configured idle notification when enabled. |

The first two hooks provide context. The remaining hooks are observational or
notification-only and never block a tool call. `TH_HOOK_PROFILE` controls the
optional notification and pipeline-observability behavior where the body
supports it.

`run-ts-hook.sh` is a fail-open launcher for the registered bundles. If Node.js
or a bundle is unavailable, the launcher exits silently. The direct
`subagent-start` entry has the same fail-open contract.

## OpenCode context

`hooks/ts/opencode-plugin.ts` retains the `session.created` integration through
`session-enforcement.opencode.ts`. It injects the shared session context using
the OpenCode-native client. OpenCode permission and approval behavior remains
owned by OpenCode; no Team Harness guard plugin is installed.

The TypeScript source and committed `.cjs` bundles are kept in the repository
so the Claude Code marketplace package works without a build step. The
packaged `plugins/team-harness/hooks` copy mirrors the context and
observability files.
