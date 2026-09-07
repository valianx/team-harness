# OpenCode activation

Bind the existing host connection to the operator's project and session ID.
Resolve the installation from its native config root and updater result,
preserving a configured non-default root. Never infer the active server from
the default port or launch `opencode serve` as a substitute for that connection.

When the host exposes its existing authenticated client, inspect the installed
version's API before selecting operations. The documented server API includes
`GET /path`, `GET /session/:id`, `GET /session/status`, `GET /agent`,
`GET /command`, `GET /mcp`, and `POST /instance/dispose`. Keep requests scoped
to the same project according to that server's API. Use the established client's
credentials without copying them into prompts, files, or command-line arguments.

`/instance/dispose` disposes an instance; it is not a documented Team Harness
hot-reload guarantee. Its effects can extend beyond the requesting conversation.
Use it only when the host can schedule a scoped instance recycle at a safe turn
boundary, confirms the project/session binding, shows no other active work in
that instance, and supports reconnecting the same session. The reload request
authorizes that scoped activation; it does not authorize interrupting other
sessions. If any condition is unavailable, keep the action pending and provide
the host's reconnect/resume route. Do not call dispose synchronously from the
active agent tool or use global disposal as a fallback.

After a supported recycle completes, verify that the original session ID and
existing history remain accessible. Check the host's effective agent/command
discovery and MCP status against the intended installation. Skills and plugin
hooks may have additional caches: a fresh `/agent` response or successful dispose
does not prove those were replaced. Require active-host skill and hook evidence
where applicable, and leave unsupported observations unverified.

Without host control, reread the requested workflow from the verified native
installation and report the remaining components as `reconnect-required`.
Use OpenCode's native session continuation/history to reopen this conversation
after reconnecting its backend; do not create a new session by default. Check the
installed CLI help before supplying version-dependent resume syntax.

Source checked 2026-09-07: [OpenCode server API](https://opencode.ai/docs/server/).
The API documents disposal, session access and component discovery; preservation
and reload coverage must be checked on the actual host before claiming success.
