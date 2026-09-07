
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

Use a host capability only when it is actually callable and bound to the current
backend and conversation. A documented API is not automatically an available
tool. Never start a second server to claim the first was refreshed, guess ports,
scan for credentials, rewrite old cache paths, or edit hook trust records.

Read the requested workflow's new skill instructions and resolve its subsequent
resources under the validated installation. This refreshes instructions in the
conversation, not native discovery, loaded agents, hooks, or MCP processes. Keep
the operator's scope, approvals, selected model, and ongoing work intact.

Attempt each supported refresh once. Verify its result from that same active
backend, after the refresh has completed. A queued acknowledgement, installed
manifest, discovery listing, or standalone script test cannot prove that hooks
executed by the conversation have changed. Use a harmless native operation and
its actual hook execution evidence when available; never execute a destructive
operation to test a deny rule. Unknown identity or unavailable evidence remains
unverified, even when the command returned success.

A backend restart must happen through a supported host operation that preserves
the conversation, at a safe turn boundary. If the host cannot arrange it, give
the exact reconnect/resume step for this conversation. Do not kill the runtime
executing the current tool, terminate unrelated sessions, delete history, or
create a replacement conversation as the default remedy.

## Result

Report in the operator's language:

- Installed target version and root; observed active version, or `unknown`.
- Components verified active, resources reread only, and components pending.
- One outcome, in this precedence order: `blocked` for invalid target identity
  or an unavailable requested installation; `reconnect-required` whenever any
  required component needs the existing runtime to reconnect, even if others
  refreshed; `active` only when every relevant component has fresh active-host
  evidence; otherwise `partial` for pending components without a reconnect
  requirement.
- The smallest remaining action, with the same conversation ID when available.

Do not infer `active` from the absence of reported errors. Keep installation
verification separate from session activation. If an operator workspace already
exists, append concise activation evidence there; do not create a workspace or
copy chat history just to reload.
