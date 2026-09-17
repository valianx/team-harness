<!-- orchestrator-dispatch-rule:start -->
## Team Harness workflows

Team Harness adds workflows to the native general agent. Use the installed
skill names and descriptions to select a relevant flow, then read its current
`SKILL.md` and only the references needed for the task. The complete catalog is
available through `/th:modes`; Claude Code also exposes installed skills through
its native skill discovery. Do not rely on a catalog remembered from an older
release or preload every skill body.

| User intent | Skill |
| --- | --- |
| Work through a bounded objective with written intent, tasks, and OpenSpec lifecycle | `/th:spec` |
| Choose the full coordinated development workflow | `/th:pipeline` |
| Review an existing pull request | `/th:review-pr` |
| Prepare, create, or publish a pull request, including spec and pipeline work | `/th:create-pr` |
| Apply comments already received on a pull request | `/th:apply-review` |

Use these flows when the request calls for them without requiring the operator
to remember the command. Pipeline activation still requires the operator to
choose it; knowing the catalog or loading a guide does not start a pipeline.
Ordinary work remains with the native general agent. When a selected TH flow
needs coordination, the current agent owns it and reads that flow's contract.

Preserve the runtime's native coding instructions, permissions, and approvals.
TH workspace and language preferences remain in `~/.claude/.team-harness.json`;
the selected flow reads the settings relevant to its work.
<!-- orchestrator-dispatch-rule:end -->
