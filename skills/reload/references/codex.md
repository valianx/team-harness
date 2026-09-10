# Codex activation

Bind the existing host connection to the current thread and cwd. In Herdr, the
target is the Codex backend serving that conversation. A separate CLI invocation
does not control it. Use native installation metadata or the validated update
receipt to select the installed plugin; do not treat an old injected skill path
as the installed version.

The Codex App Server documents these operations. Use only those exposed by the
active host and supported by its installed protocol:

| Component | Available operation | Evidence and limit |
| --- | --- | --- |
| Skills and commands | `skills/list` with the current `cwds` and `forceReload: true`; native command refresh if separately supported | Check all returned Team Harness paths against the target and have the host refresh discovery/inject the active workflow. Already refreshed native discovery is evidence for this component only. |
| MCP | `config/mcpServer/reload`, when its scope is compatible with this task | This queues refresh for loaded threads. Inspect coverage before use; do not disrupt unrelated services. Wait for completion and inspect the affected Team Harness server/tool status; acknowledgement alone is pending. |
| Config and agents | Host-supported runtime config reload, if available | Check its version-specific coverage and effective thread role settings. A config file or installed TOML does not prove a loaded role changed. Preserve custom settings; do not write dummy config edits to trigger a reload. |
| Hooks | Native discovery plus actual execution evidence | `hooks/list` lists discovery; it is not a hook reload method. Compare the command/identity actually executed by this thread with the installed target. |

Do not fabricate `codex plugin reload` or assume that every host exposes App
Server requests as model tools. If a bound control is missing, refresh the
remaining components and report that component as unverified (`partial`).
Missing evidence is not a restart requirement. If actual hook execution remains
stale after supported refreshes, explain the affected behavior and the specific
remaining reconnect need. An old version string in a path alone
does not prove stale execution when a verified bridge resolves it to the target.

When a reconnect is needed and compatible with the operator's constraints, use
a supported host reconnect-and-resume action if available. Preserve the
current thread ID and wait for the current turn and child work to finish before
reconnecting the affected backend. Verify activation after reconnecting; a
scheduled restart remains pending. Otherwise explain the specific manual route.
For an interactive CLI, `codex resume SESSION_ID` resumes the existing history
after exiting the old process. Resolve the CLI normally and pass the observed
ID as a literal argument; do not use `--last` when the thread ID is known. In an
app, use its conversation history after restarting the affected backend.

Native hook trust remains a separate condition. Report a changed hook requiring
trust through the host's native hooks UI; do not trust hashes on the operator's
behalf or describe an untrusted/skipped hook as active.

For local inline reviews, activation is specific to the selected reviewer
profile and scope. Preserve its verified activation basis when setup made no
change to that definition; installing another agent does not invalidate it.
If it changed, attempt supported refresh and verify activation through this
backend. A documented session-static setting can justify a reconnect proposal;
an unavailable observation cannot. A new conversation ID is not an acceptance criterion.

Sources checked 2026-09-07:

- [Codex App Server](https://learn.chatgpt.com/docs/app-server): skill cache refresh,
  skill-change notifications, hook discovery and queued MCP refresh.
- Installed Codex 0.153.4 protocol: `SkillsListParams.forceReload`,
  `ConfigBatchWriteParams.reloadUserConfig`, and `ThreadResumeParams`. Config
  reload has session-static exclusions; protocol presence does not establish
  host exposure or hook/agent refresh coverage.
