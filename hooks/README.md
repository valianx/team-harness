# hooks/

The Claude Code plugin hooks provide session context and optional Team Harness
observability. Claude Code's native permissions, approvals, and sandbox remain
the execution boundary. These hooks never emit a `permissionDecision` and never
block a tool call.

## Retained files

| File | Purpose |
|---|---|
| `run-ts-hook.sh` | Fail-open launcher for the retained observational bundles. |
| `ts/bodies/session-start.ts` | SessionStart workflow discovery, language context, English-learning mode, and optional Obsidian workspace guidance. |
| `ts/bodies/language-user-prompt.ts` | Per-turn language reminder when a language is configured. |
| `ts/bodies/subagent-start.ts` | Optional `subagent.start` breadcrumb for `th:*` dispatches. |
| `ts/bodies/subagent-trace.ts` | Optional `subagent.stop` breadcrumb for `th:*` agents. |
| `ts/bodies/precompact-snapshot.ts` | Optional rolling snapshot before context compaction. |
| `ts/bodies/notify-stage.ts` | Optional idle or stage-boundary native notification. |
| `ts/bodies/hook-profile.ts` | Resolves `TH_HOOK_PROFILE` for notification and trace writes. |
| `sketch-guard.sh` | Workflow artifact probe invoked explicitly by selected skills; it is not an event hook or permission gate. |

`session-start` and `language-user-prompt` remain available in
`TH_HOOK_PROFILE=minimal` because they provide context rather than trace data.
Notifications, subagent breadcrumbs, and precompact snapshots belong to the
`pipeline-observability` or `idle-notify` classes and are suppressed by
`TH_HOOK_PROFILE=minimal`. Unset or unrecognized values default to `minimal`;
set `TH_HOOK_PROFILE=standard` or `strict` when detailed observability is useful.

The TypeScript sources use the shared input shim for bounded, native payload
reading. The shim normalizes input; it does not decide whether an operation is
allowed. The retained bundles are tracked under `ts/dist/` so the marketplace
plugin can run without a build step.

## Claude Code wiring

`.claude-plugin/hooks.json` registers only the retained observational events:

- `SessionStart` for workflow discovery and configured context;
- `UserPromptSubmit` for the configured language reminder;
- `PreToolUse`/`Task` for the optional start breadcrumb;
- `SubagentStop` for the optional stop breadcrumb;
- `PreCompact` for the optional rolling snapshot;
- `Notification`/`idle_prompt` for the optional toast.

There are no Team Harness `PreToolUse` permission gates. A native agent may
choose `/th:spec`, `/th:pipeline`, `/th:review-pr`, `/th:create-pr`, or
`/th:modes` through the session discovery context, while the host runtime keeps
its normal permission and approval flow.

## Runtime behavior

All retained hook entries are fail-open. Missing Node.js, missing bundles,
malformed payloads, and filesystem or notification failures produce no output
and exit successfully. This keeps context and observability advisory and avoids
turning a plugin refresh into a tool-call block or a restart requirement.
