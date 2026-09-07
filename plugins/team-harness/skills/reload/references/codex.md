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
| Skills | `skills/list` with the current `cwds` and `forceReload: true` | Check returned Team Harness paths against the target and have the host refresh discovery/inject the requested skill. Reading new Markdown alone is an instruction refresh. |
| MCP | `config/mcpServer/reload` | This queues refresh for loaded threads. Wait for completion and inspect native server/tool status; acknowledgement alone is pending. |
| Config and agents | Host-supported runtime config reload, if available | Check its version-specific coverage and effective thread role settings. A config file or installed TOML does not prove a loaded role changed. Preserve custom settings; do not write dummy config edits to trigger a reload. |
| Hooks | Native discovery plus actual execution evidence | `hooks/list` lists discovery; it is not a hook reload method. Compare the command/identity actually executed by this thread with the installed target. |

Do not fabricate `codex plugin reload` or assume that every host exposes App
Server requests as model tools. If no bound control capability exists, reread
the requested new instructions and report native components as unverified.
If old hook commands are observed, report `reconnect-required` rather than
repeatedly reinstalling or testing the on-disk launcher.

When the host offers a supported reconnect-and-resume action, preserve the
current thread ID and wait for the current turn and child work to finish before
reconnecting the affected backend. Verify activation after reconnecting; a
scheduled restart remains pending. Otherwise explain which host must reconnect.
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
If it changed, verify its activation through this backend or reconnect and
resume this thread. A new conversation ID is not an acceptance criterion.

Sources checked 2026-09-07:

- [Codex App Server](https://learn.chatgpt.com/docs/app-server): skill cache refresh,
  skill-change notifications, hook discovery and queued MCP refresh.
- Installed Codex 0.153.4 protocol: `SkillsListParams.forceReload`,
  `ConfigBatchWriteParams.reloadUserConfig`, and `ThreadResumeParams`. Config
  reload has session-static exclusions; protocol presence does not establish
  host exposure or hook/agent refresh coverage.
