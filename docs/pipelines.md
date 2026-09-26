# Workflow reference

The current installed skill is the source for each flow. TH supplies a working
method to the native general agent; it does not duplicate execution permissions.

## Four development phases

The shared development path is **Spec → Implementation → Validation →
Publication**. The [phase reference](../skills/spec/references/development-phases.md)
is the source for each phase's inputs, tool selection, outputs and completion
evidence; this page only maps the existing entry points to that method.

| Phase | Existing entry points | Main result |
| --- | --- | --- |
| Spec | `spec`, `design`, `sketch`, `define-ac` | OpenSpec intent and tasks, testing strategy and workspace plan |
| Implementation | `spec` continuation, `pipeline`, `implement`, `test` | Product changes, maintained tests and task progress |
| Validation | `validate`, `verify`, `test-pipeline`, `audit`, `find-bugs` | Focused checks, selected provider evidence, findings and limits |
| Publication | `create-pr`, `deliver`; `review-pr` for an existing PR | Required candidate preparation for every completed repository-file change; publication follows native permissions and operator direction |

Every completed change to repository files reaches `create-pr` preparation after
applicable validation, including OpenSpec artifacts written during planning and
non-code changes. Read-only work and outputs kept outside the repository have no
candidate to prepare. The operator can explicitly stop or decline publication;
native permissions also govern it. Tool outputs are recommendations and
evidence; Main decides how to proceed. Publication does not imply merge.

| Objective | Entry | Supporting source |
| --- | --- | --- |
| Written intent, tasks and implementation | `spec` | `skills/spec/SKILL.md` |
| Broader coordinated development | `pipeline` | `agents/ref-pipeline.md` |
| Proposed design and on-demand preview | `design`, `sketch` | Corresponding skills |
| Independent local review | `verify` | `agents/_shared/inline-review-contract.md` |
| Review existing PR | `review-pr` | Immutable snapshot and advisory review |
| Resolve review comments | `apply-review` | Evidence-backed dispositions |
| Prepare or publish PR | `create-pr` | Required preparation for every repository change; OpenSpec archive and artifact hygiene |
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
