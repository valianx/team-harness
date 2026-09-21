# Workflow reference

The current installed skill is the source for each flow. TH supplies a working
method to the native general agent; it does not duplicate execution permissions.

| Objective | Entry | Supporting source |
| --- | --- | --- |
| Written intent, tasks and implementation | `spec` | `skills/spec/SKILL.md` |
| Broader coordinated development | `pipeline` | `agents/ref-pipeline.md` |
| Proposed design and on-demand preview | `design`, `sketch` | Corresponding skills |
| Independent local review | `verify` | `agents/_shared/inline-review-contract.md` |
| Review existing PR | `review-pr` | Immutable snapshot and advisory review |
| Resolve review comments | `apply-review` | Evidence-backed dispositions |
| Prepare or publish PR | `create-pr` | OpenSpec archive and artifact hygiene |
| Research/code investigation | `research`, `research-code` | `agents/ref-special-flows.md` |
| Architecture/debt investigation | `audit` | `agents/ref-architect-modes.md` |
| Documentation/learning | `docs`, `learn` | Corresponding skills |
| Testing | `test`, `test-pipeline`, `test-cross-browser` | Corresponding skills |
| Initiative/milestone context | Workspace and selected development flow | `agents/ref-dispatch-machinery.md` |
| Status and continuation | `pipelines`, `trace`, `resume-session`, `recover` | Existing workspace evidence |

Use `modes` for the complete installed skill catalog. Every substantive flow
reuses the selected local or Obsidian workspace. Native specialists contribute
bounded work and recommendations; Main judges evidence and continues the
authorized objective.

Historical v3/v4/v5 state, gate and event formats remain readable where useful.
They do not require new logs, role leases, administrative closure or repeated
approval in current workflows.
