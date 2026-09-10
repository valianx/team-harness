---
name: reload
description: Reload all installed Team Harness components in the current Codex or OpenCode conversation, verify activation, and avoid restarting when supported refreshes suffice. Use after update or when a session retains old plugin resources.
---

# Reload Team Harness

Activate the installed Team Harness resources while preserving the operator's
conversation and work. Execute directly; this does not activate a pipeline or
dispatch agents. Reload does not download, install, downgrade, or repair packages.
If the requested version is not installed, report that prerequisite and use
`update` only when installation is also authorized.

## Bind the operation

Identify the active runtime, conversation ID, project, and installed Team Harness
root from native host metadata or an existing verified update result. Distinguish
the installed root from the skill path supplied to this conversation. Do not
choose the newest directory in a cache: unused snapshots are not active installs.
Validate the installation identity before reading its resources. Keep an explicit
target version fixed for this invocation; do not chase another update mid-reload.

Read only the matching runtime procedure:

- Codex: [references/codex.md](references/codex.md).
- OpenCode: [references/opencode.md](references/opencode.md).
- Other runtimes: report unsupported here and use their native plugin activation
  workflow; do not apply either adapter to a different runtime.

## Activation contract

Cover the whole Team Harness installation: skill and command discovery, active
workflow instructions and supporting resources, agent definitions, effective
plugin configuration, hooks, and plugin-provided or configured MCP services.
Use the installation manifest, runtime adapter and existing update evidence to
identify applicable components; mark absent integrations as not applicable.
Keep unrelated plugins and operator settings outside the operation's scope.

Use a host capability only when it is actually callable and bound to the current
backend and conversation. A documented API is not automatically an available
tool. Never start a second server to claim the first was refreshed, guess ports,
scan for credentials, rewrite old cache paths, or edit hook trust records.

Refresh discovery for all Team Harness skills and commands. Reread the flows
relevant to the current request from the validated installed Team Harness
version. Use those updated instructions for the current request and subsequent
resource reads.
Instruction rereading alone does not refresh loaded agents, hooks or MCP
processes. Keep the operator's scope, approvals, selected model and ongoing work.

Attempt each supported refresh once and complete independent components even
when another has no available control. Verify its result from that same active
backend after completion. Preserve prior activation evidence for unchanged
component definitions when the backend identity is unchanged. A queued
acknowledgement, installed manifest, discovery listing or standalone script
test cannot prove that hooks
executed by the conversation have changed. Use a harmless native operation and
its actual hook execution evidence when available; never execute a destructive
operation to test a deny rule. Unknown identity or unavailable evidence remains
unverified, even when the command returned success.

### When a restart is actually needed

Missing controls or evidence, an old injected path, an optional snapshot alias
failure, and an installation receipt's `restartRequired` flag do not by
themselves establish that the live backend needs restarting. Keep unverifiable
components pending without prescribing a restart or treating them as active.

Propose reconnecting only for an identified component whose stale activation
is observed or whose changed setting is documented as requiring restart in the
active runtime, after available refreshes cannot apply it. First complete the
remaining independent reload work. Explain the component, evidence, unavailable
or unsuccessful refresh, effect of deferring, and smallest reconnect scope.
Keep an operator-requested no-restart constraint in force while completing all
available refreshes; report a demonstrated remaining limitation specifically.
A reconnect must use a supported host operation preserving the conversation at
a safe turn boundary, then verify activation. If unavailable, report the exact
same-conversation reconnect/resume route for the affected component. Do not kill
the runtime executing the current tool, interrupt unrelated sessions, delete
history or create a new task.

## Result

Report in the operator's language:

- Installed target version and root; observed active version, or `unknown`.
- Components verified active, resources reread only, and components pending.
- One outcome: `blocked` for invalid target identity or an unavailable requested
  installation; `reconnect-required` only for a demonstrated need described
  above; `active` when every applicable component has valid active-host evidence;
  otherwise `partial`.
- The smallest remaining action, with the same conversation ID when available.

Do not infer `active` from the absence of reported errors. Keep installation
verification separate from session activation. If an operator workspace already
exists, append concise activation evidence there; do not create a workspace or
copy chat history just to reload.
