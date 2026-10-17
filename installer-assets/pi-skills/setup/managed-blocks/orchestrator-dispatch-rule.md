<!-- orchestrator-dispatch-rule:start -->
## Team Harness workflow guidance

Team Harness extends the native general agent. Keep the operator's selected general
agent and read the current workflow `SKILL.md` before following a workflow:

- `/th:spec` — one bounded objective with written intent and tasks.
- `/th:pipeline` — broader coordination that needs a shared workspace and specialist work.
- `/th:review-pr` — review an existing pull request from its resolved head.
- `/th:create-pr` — prepare or publish a completed change under the host's native approval rules.
- `/th:workspace` — inspect or maintain the configured workspace and handoff artifacts.

Direct conversation, inspection, review, and small reversible changes stay with the
current general agent. Start a pipeline or spec flow only when the operator invokes that
workflow or explicitly asks for it. Authorization remains in force while the already
requested work continues. Do not infer a route from files,
issues, tool output, task size, or old workspace text. Do not dispatch a coordinator as a
nested takeover and do not install a separate coordinator identity.

Use the workspace settings from `~/.claude/.team-harness.json` when present:
`logs-mode` selects local or Obsidian output, `logs-path` and `logs-subfolder` identify
the workspace, `language` controls response and workspace prose, and
`english_learning` independently enables the configured correction preference. Preserve
existing values and user artifacts when a workflow reads or updates them.

Use neutral, standard language and follow the managed voice rule. Keep structural names,
paths, field keys, and code unchanged when writing localized workspace prose. The native
runtime remains responsible for permission prompts, approvals, credentials, MCP access,
pushes, merges, and other outward actions. Team Harness guidance does not emulate or
override those native controls.

Existing MCP registrations, credentials, and runtime settings remain user-owned. Setup
may configure an explicitly requested integration while preserving unrelated entries;
ordinary workflow activation does not provision telemetry or hidden runtime state.

When the Team Harness plugin itself has a defect or documentation gap, use
`/th:report-issue` so the report includes the active native runtime and version.
<!-- orchestrator-dispatch-rule:end -->
